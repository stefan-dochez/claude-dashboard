import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { createLogger } from './logger.js';
import { TIMEOUTS } from './constants.js';

const execFileAsync = promisify(execFile);
const log = createLogger('pr-aggregator');

const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const SEARCH_BATCH_SIZE = 20; // max repos per GitHub search query

export interface PullRequest {
  repo: string;       // "owner/repo"
  repoName: string;   // short name, e.g. "di-banking-fees-app"
  number: number;
  title: string;
  url: string;
  author: string;
  assignees: string[];
  reviewers: string[];
  branch: string;
  baseBranch: string;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CacheEntry {
  prs: PullRequest[];
  fetchedAt: number;
}

export class PrAggregator {
  private cache = new Map<string, CacheEntry>();
  private slugCache = new Map<string, string | null>(); // dir → GitHub slug (never changes)
  private countsCache: { data: Record<string, { total: number; mine: number }>; fetchedAt: number } | null = null;
  private ghUser: string | null = null;

  /** Return the authenticated GitHub username (cached). */
  async getGitHubUser(): Promise<string | null> {
    if (this.ghUser) return this.ghUser;
    try {
      const { stdout } = await execFileAsync(
        'gh', ['api', 'user', '--jq', '.login'],
        { timeout: TIMEOUTS.GH_CLI },
      );
      this.ghUser = stdout.trim() || null;
      return this.ghUser;
    } catch {
      log.warn('Failed to get GitHub user — gh CLI may not be authenticated');
      return null;
    }
  }

  /**
   * Return PR counts for a list of projects, batching all GitHub slugs
   * into a few search API calls. For workspace/monorepo projects, sub-repos
   * are discovered; for regular repos, the repo itself is used.
   */
  /**
   * Return PR counts for a list of projects. Reuses `getPrs` (which has its
   * own per-project cache) so that badge counts and the PR view always show
   * consistent data. For regular repos, resolves the slug and fetches PRs
   * via a single batched search query.
   */
  async getPrCounts(
    projects: Array<{ path: string; type: string }>,
  ): Promise<Record<string, { total: number; mine: number }>> {
    if (this.countsCache && Date.now() - this.countsCache.fetchedAt < CACHE_TTL_MS) {
      return this.countsCache.data;
    }

    const ghUser = await this.getGitHubUser();
    const isMyPr = (pr: PullRequest) =>
      ghUser && (pr.author === ghUser || pr.assignees.includes(ghUser) || pr.reviewers.includes(ghUser));

    // Split projects into parent (workspace/monorepo → use getPrs) and
    // simple repos (batch together in one search query).
    const parentProjects: Array<{ path: string; type: string }> = [];
    const repoProjects: Array<{ path: string; type: string }> = [];
    for (const p of projects) {
      if (p.type === 'workspace' || p.type === 'monorepo') {
        parentProjects.push(p);
      } else {
        repoProjects.push(p);
      }
    }

    const result: Record<string, { total: number; mine: number }> = {};

    // Parent projects: reuse getPrs (same cache as the PR view)
    await Promise.all(parentProjects.map(async (project) => {
      const prs = await this.getPrs(project.path);
      const mine = prs.filter(isMyPr).length;
      result[project.path] = { total: prs.length, mine: ghUser ? mine : prs.length };
    }));

    // Simple repos: resolve slugs and batch-fetch
    const slugToProjects = new Map<string, string[]>(); // slug → project paths
    await Promise.all(repoProjects.map(async (project) => {
      const slug = await this.getGitHubSlug(project.path);
      if (slug) {
        const paths = slugToProjects.get(slug) ?? [];
        paths.push(project.path);
        slugToProjects.set(slug, paths);
      }
    }));

    if (slugToProjects.size > 0) {
      const slugs = [...slugToProjects.keys()];
      const allPrs = await this.fetchPrsBatched(slugs);

      // Group PRs by slug
      const prsBySlug = new Map<string, PullRequest[]>();
      for (const pr of allPrs) {
        const list = prsBySlug.get(pr.repo) ?? [];
        list.push(pr);
        prsBySlug.set(pr.repo, list);
      }

      for (const [slug, projectPaths] of slugToProjects) {
        const prs = prsBySlug.get(slug) ?? [];
        const mine = prs.filter(isMyPr).length;
        for (const projectPath of projectPaths) {
          result[projectPath] = { total: prs.length, mine: ghUser ? mine : prs.length };
        }
      }
    }

    this.countsCache = { data: result, fetchedAt: Date.now() };
    return result;
  }

  /**
   * Fetch PRs for a flat list of slugs, batching into groups of SEARCH_BATCH_SIZE.
   */
  private async fetchPrsBatched(slugs: string[]): Promise<PullRequest[]> {
    const batches: string[][] = [];
    for (let i = 0; i < slugs.length; i += SEARCH_BATCH_SIZE) {
      batches.push(slugs.slice(i, i + SEARCH_BATCH_SIZE));
    }

    const repoNameMap = new Map(slugs.map(s => [s, s.split('/').pop() ?? s]));
    const results = await Promise.allSettled(
      batches.map(batch => this.fetchPrs(
        batch.map(slug => ({ slug, name: repoNameMap.get(slug) ?? slug })),
      )),
    );

    const all: PullRequest[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') all.push(...result.value);
    }
    return all;
  }

  /** Return aggregated open PRs for all git sub-repos under `parentPath`. */
  async getPrs(parentPath: string, forceRefresh = false): Promise<PullRequest[]> {
    const cached = this.cache.get(parentPath);
    if (!forceRefresh && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.prs;
    }

    const repos = await this.discoverGitHubRepos(parentPath);
    if (repos.length === 0) return [];

    const prs = await this.fetchPrs(repos);
    this.cache.set(parentPath, { prs, fetchedAt: Date.now() });
    return prs;
  }

  /**
   * Scan immediate subdirectories of `parentPath` for git repos
   * and extract their GitHub `owner/repo` slug from the remote.
   */
  private async discoverGitHubRepos(
    parentPath: string,
  ): Promise<Array<{ slug: string; name: string }>> {
    const results: Array<{ slug: string; name: string }> = [];

    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(parentPath, { withFileTypes: true });
    } catch {
      return results;
    }

    // Also check if parentPath itself is a git repo with a GitHub remote
    const parentSlug = await this.getGitHubSlug(parentPath);
    if (parentSlug) {
      results.push({ slug: parentSlug, name: path.basename(parentPath) });
    }

    const slugPromises = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
      .map(async (e) => {
        const dir = path.join(parentPath, e.name);
        const slug = await this.getGitHubSlug(dir);
        if (slug) results.push({ slug, name: e.name });
      });

    await Promise.all(slugPromises);
    return results;
  }

  /** Extract `owner/repo` from the origin remote URL, or null. Cached permanently. */
  private async getGitHubSlug(dir: string): Promise<string | null> {
    if (this.slugCache.has(dir)) return this.slugCache.get(dir)!;
    try {
      const { stdout } = await execFileAsync(
        'git', ['remote', 'get-url', 'origin'],
        { cwd: dir, timeout: TIMEOUTS.GIT_SHORT },
      );
      const slug = this.parseGitHubSlug(stdout.trim());
      this.slugCache.set(dir, slug);
      return slug;
    } catch {
      this.slugCache.set(dir, null);
      return null;
    }
  }

  /** Parse owner/repo from SSH or HTTPS GitHub URLs. */
  private parseGitHubSlug(url: string): string | null {
    // SSH: git@github.com:owner/repo.git
    const ssh = url.match(/github\.com[:/](.+?\/.+?)(?:\.git)?$/);
    if (ssh) return ssh[1];
    // HTTPS: https://github.com/owner/repo.git
    const https = url.match(/github\.com\/(.+?\/.+?)(?:\.git)?$/);
    if (https) return https[1];
    return null;
  }

  /**
   * Fetch open PRs for all repos in a single GitHub search API call.
   * Falls back to per-repo `gh pr list` if search fails.
   */
  private async fetchPrs(
    repos: Array<{ slug: string; name: string }>,
  ): Promise<PullRequest[]> {
    const repoNameMap = new Map(repos.map(r => [r.slug, r.name]));

    // Build search query: is:pr is:open repo:a repo:b ...
    const repoQualifiers = repos.map(r => `repo:${r.slug}`).join('+');
    const query = `is:pr+is:open+${repoQualifiers}`;

    try {
      const { stdout } = await execFileAsync(
        'gh', [
          'api', `search/issues?q=${query}&per_page=100&sort=updated&order=desc`,
          '--cache', '1m',
        ],
        { timeout: TIMEOUTS.GH_CLI * 3 }, // allow more time for search
      );

      const data = JSON.parse(stdout) as {
        items: Array<{
          number: number;
          title: string;
          html_url: string;
          user: { login: string };
          assignees: Array<{ login: string }>;
          draft?: boolean;
          created_at: string;
          updated_at: string;
          pull_request: { html_url: string };
          repository_url: string; // https://api.github.com/repos/owner/repo
        }>;
      };

      return data.items.map((item) => {
        const slug = item.repository_url.replace('https://api.github.com/repos/', '');
        return {
          repo: slug,
          repoName: repoNameMap.get(slug) ?? slug.split('/').pop() ?? slug,
          number: item.number,
          title: item.title,
          url: item.html_url,
          author: item.user.login,
          assignees: item.assignees?.map(a => a.login) ?? [],
          reviewers: [], // search API doesn't return reviewers
          branch: '', // search API doesn't return branch
          baseBranch: '',
          isDraft: item.draft ?? false,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
        };
      });
    } catch (err) {
      log.warn('Search API failed, falling back to per-repo gh pr list:', err instanceof Error ? err.message : err);
      return this.fetchPrsFallback(repos);
    }
  }

  /** Fallback: call `gh pr list` on each repo individually. */
  private async fetchPrsFallback(
    repos: Array<{ slug: string; name: string }>,
  ): Promise<PullRequest[]> {
    const all: PullRequest[] = [];

    const results = await Promise.allSettled(
      repos.map(async ({ slug, name }) => {
        const { stdout } = await execFileAsync(
          'gh', [
            'pr', 'list',
            '--repo', slug,
            '--json', 'number,title,url,author,assignees,reviewRequests,headRefName,baseRefName,isDraft,createdAt,updatedAt',
            '--limit', '30',
          ],
          { timeout: TIMEOUTS.GH_CLI * 2 },
        );

        const prs = JSON.parse(stdout) as Array<{
          number: number;
          title: string;
          url: string;
          author: { login: string };
          assignees: Array<{ login: string }>;
          reviewRequests: Array<{ login: string }>;
          headRefName: string;
          baseRefName: string;
          isDraft: boolean;
          createdAt: string;
          updatedAt: string;
        }>;

        return prs.map((pr) => ({
          repo: slug,
          repoName: name,
          number: pr.number,
          title: pr.title,
          url: pr.url,
          author: pr.author.login,
          assignees: pr.assignees?.map(a => a.login) ?? [],
          reviewers: pr.reviewRequests?.map(r => r.login) ?? [],
          branch: pr.headRefName,
          baseBranch: pr.baseRefName,
          isDraft: pr.isDraft,
          createdAt: pr.createdAt,
          updatedAt: pr.updatedAt,
        }));
      }),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') all.push(...result.value);
    }

    // Sort by updatedAt descending
    all.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return all;
  }
}
