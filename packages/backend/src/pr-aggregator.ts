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

export type ReviewDecision = 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
export type MergeableState = 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
export type PrCiState = 'SUCCESS' | 'FAILURE' | 'PENDING' | null;

export interface PrLabel {
  name: string;
  color: string; // hex, no leading #
}

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
  labels: PrLabel[];
  reviewDecision: ReviewDecision;
  approvalCount: number;
  changesRequestedCount: number;
  mergeable: MergeableState;
  ciState: PrCiState;
}

interface CacheEntry {
  prs: PullRequest[];
  fetchedAt: number;
}

interface GraphQLPrNode {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  headRefName: string;
  baseRefName: string;
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
  reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
  repository: { nameWithOwner: string } | null;
  author: { login: string } | null;
  assignees: { nodes: Array<{ login: string }> };
  reviewRequests: { nodes: Array<{ requestedReviewer: { login?: string } | null }> };
  labels: { nodes: Array<{ name: string; color: string }> };
  latestReviews: { nodes: Array<{ state: string }> };
  commits: { nodes: Array<{ commit: { statusCheckRollup: { state: string } | null } }> };
}

interface GraphQLSearchResponse {
  data?: {
    search: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: Array<GraphQLPrNode | null>;
    };
  };
  errors?: unknown;
}

/**
 * Aggregate `gh pr list --json statusCheckRollup` into a single CI state.
 * Pending if any check is still running, failure if any has a bad conclusion,
 * success if all completed cleanly, null if no checks at all.
 */
function computeCiStateFromRollup(
  rollup: Array<{ status?: string; conclusion?: string }> | undefined,
): PrCiState {
  if (!rollup || rollup.length === 0) return null;
  let hasPending = false;
  let hasFailure = false;
  for (const check of rollup) {
    const status = check.status?.toUpperCase();
    const conclusion = check.conclusion?.toUpperCase();
    if (status && status !== 'COMPLETED') hasPending = true;
    if (conclusion === 'FAILURE' || conclusion === 'TIMED_OUT' || conclusion === 'CANCELLED' || conclusion === 'ACTION_REQUIRED') {
      hasFailure = true;
    }
  }
  if (hasFailure) return 'FAILURE';
  if (hasPending) return 'PENDING';
  return 'SUCCESS';
}

/** Map a GraphQL PullRequest node to our internal shape. */
function mapPrNode(node: GraphQLPrNode, repoNameMap: Map<string, string>): PullRequest {
  const slug = node.repository?.nameWithOwner ?? '';
  const reviewers = node.reviewRequests.nodes
    .map(n => n.requestedReviewer?.login)
    .filter((login): login is string => Boolean(login));

  let approvalCount = 0;
  let changesRequestedCount = 0;
  for (const review of node.latestReviews.nodes) {
    if (review.state === 'APPROVED') approvalCount++;
    else if (review.state === 'CHANGES_REQUESTED') changesRequestedCount++;
  }

  const rollup = node.commits.nodes[0]?.commit.statusCheckRollup?.state ?? null;
  const ciState: PrCiState =
    rollup === 'SUCCESS' ? 'SUCCESS'
    : rollup === 'FAILURE' || rollup === 'ERROR' ? 'FAILURE'
    : rollup === 'PENDING' || rollup === 'EXPECTED' ? 'PENDING'
    : null;

  return {
    repo: slug,
    repoName: repoNameMap.get(slug) ?? slug.split('/').pop() ?? slug,
    number: node.number,
    title: node.title,
    url: node.url,
    author: node.author?.login ?? 'unknown',
    assignees: node.assignees.nodes.map(a => a.login),
    reviewers,
    branch: node.headRefName,
    baseBranch: node.baseRefName,
    isDraft: node.isDraft,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    labels: node.labels.nodes.map(l => ({ name: l.name, color: l.color })),
    reviewDecision: node.reviewDecision,
    approvalCount,
    changesRequestedCount,
    mergeable: node.mergeable,
    ciState,
  };
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

  /** Public accessor — other services (e.g. CiStatusService) reuse the slug cache. */
  async resolveGitHubSlug(dir: string): Promise<string | null> {
    return this.getGitHubSlug(dir);
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
   * Fetch open PRs for all repos via a single GraphQL search query.
   * Returns labels, review decision, mergeable state, CI status in one call.
   * Paginates by 100 until `hasNextPage` is false. Falls back to per-repo
   * `gh pr list` if the GraphQL call fails.
   */
  private async fetchPrs(
    repos: Array<{ slug: string; name: string }>,
  ): Promise<PullRequest[]> {
    if (repos.length === 0) return [];
    const repoNameMap = new Map(repos.map(r => [r.slug, r.name]));
    const repoQualifiers = repos.map(r => `repo:${r.slug}`).join(' ');
    const searchQuery = `is:pr is:open ${repoQualifiers}`;

    try {
      return await this.fetchPrsViaGraphQL(searchQuery, repoNameMap);
    } catch (err) {
      log.warn(
        'GraphQL search failed, falling back to per-repo gh pr list:',
        err instanceof Error ? err.message : err,
      );
      return this.fetchPrsFallback(repos);
    }
  }

  private async fetchPrsViaGraphQL(
    searchQuery: string,
    repoNameMap: Map<string, string>,
  ): Promise<PullRequest[]> {
    const query = `
      query($q: String!, $cursor: String) {
        search(query: $q, type: ISSUE, first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            ... on PullRequest {
              number
              title
              url
              isDraft
              createdAt
              updatedAt
              headRefName
              baseRefName
              mergeable
              reviewDecision
              repository { nameWithOwner }
              author { login }
              assignees(first: 10) { nodes { login } }
              reviewRequests(first: 10) {
                nodes { requestedReviewer { ... on User { login } } }
              }
              labels(first: 20) { nodes { name color } }
              latestReviews(first: 20) { nodes { state } }
              commits(last: 1) {
                nodes { commit { statusCheckRollup { state } } }
              }
            }
          }
        }
      }
    `;

    const all: PullRequest[] = [];
    let cursor: string | null = null;

    for (let page = 0; page < 20; page++) {
      const args: string[] = [
        'api', 'graphql',
        '-f', `query=${query}`,
        '-f', `q=${searchQuery}`,
      ];
      if (cursor) args.push('-f', `cursor=${cursor}`);

      const { stdout } = await execFileAsync('gh', args, {
        timeout: TIMEOUTS.GH_CLI * 3,
        maxBuffer: 10 * 1024 * 1024,
      });

      const parsed = JSON.parse(stdout) as GraphQLSearchResponse;
      const search = parsed.data?.search;
      if (!search) break;

      for (const node of search.nodes) {
        if (!node || !node.repository) continue;
        all.push(mapPrNode(node, repoNameMap));
      }

      if (!search.pageInfo.hasNextPage) break;
      cursor = search.pageInfo.endCursor;
    }

    all.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return all;
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
            '--json', 'number,title,url,author,assignees,reviewRequests,headRefName,baseRefName,isDraft,createdAt,updatedAt,labels,reviewDecision,mergeable,latestReviews,statusCheckRollup',
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
          reviewRequests: Array<{ login?: string; slug?: string }>;
          headRefName: string;
          baseRefName: string;
          isDraft: boolean;
          createdAt: string;
          updatedAt: string;
          labels?: Array<{ name: string; color: string }>;
          reviewDecision?: string;
          mergeable?: string;
          latestReviews?: Array<{ state: string }>;
          statusCheckRollup?: Array<{ status?: string; conclusion?: string }>;
        }>;

        return prs.map((pr): PullRequest => {
          let approvalCount = 0;
          let changesRequestedCount = 0;
          for (const r of pr.latestReviews ?? []) {
            if (r.state === 'APPROVED') approvalCount++;
            else if (r.state === 'CHANGES_REQUESTED') changesRequestedCount++;
          }

          const ciState: PrCiState = computeCiStateFromRollup(pr.statusCheckRollup);
          const mergeable: MergeableState = (pr.mergeable === 'MERGEABLE' || pr.mergeable === 'CONFLICTING')
            ? pr.mergeable
            : 'UNKNOWN';
          const reviewDecision: ReviewDecision = (
            pr.reviewDecision === 'APPROVED'
            || pr.reviewDecision === 'CHANGES_REQUESTED'
            || pr.reviewDecision === 'REVIEW_REQUIRED'
          ) ? pr.reviewDecision : null;

          return {
            repo: slug,
            repoName: name,
            number: pr.number,
            title: pr.title,
            url: pr.url,
            author: pr.author.login,
            assignees: pr.assignees?.map(a => a.login) ?? [],
            reviewers: (pr.reviewRequests ?? [])
              .map(r => r.login)
              .filter((login): login is string => Boolean(login)),
            branch: pr.headRefName,
            baseBranch: pr.baseRefName,
            isDraft: pr.isDraft,
            createdAt: pr.createdAt,
            updatedAt: pr.updatedAt,
            labels: pr.labels ?? [],
            reviewDecision,
            approvalCount,
            changesRequestedCount,
            mergeable,
            ciState,
          };
        });
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
