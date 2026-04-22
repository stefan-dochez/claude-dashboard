import { execFile } from 'child_process';
import { promisify } from 'util';
import { createLogger } from './logger.js';
import { TIMEOUTS } from './constants.js';
import { PATH_SEP, getExtraPaths } from './platform.js';
import type { PrAggregator } from './pr-aggregator.js';

const execFileAsync = promisify(execFile);
const log = createLogger('ci-status');

const RUN_CACHE_TTL_MS = 60 * 1000;        // 60s — latest run per branch
const CHECKS_CACHE_TTL_MS = 2 * 60 * 1000; // 2min — check runs per commit

function enrichedEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: [...getExtraPaths(), process.env.PATH ?? ''].join(PATH_SEP),
  };
}

/** Status of a single workflow run (from `gh run list`). */
export interface CiRun {
  databaseId: number;
  name: string;
  status: string;              // queued | in_progress | completed
  conclusion: string | null;   // success | failure | cancelled | skipped | neutral | timed_out | action_required
  url: string;
  headSha: string;
  createdAt: string;
  updatedAt: string;
}

/** Status of a single check run (from `gh api check-runs`). */
export interface CheckRun {
  name: string;
  status: string;
  conclusion: string | null;
  url: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface RunCacheEntry {
  run: CiRun | null;
  fetchedAt: number;
}

interface ChecksCacheEntry {
  checks: CheckRun[];
  fetchedAt: number;
}

export class CiStatusService {
  private runCache = new Map<string, RunCacheEntry>();       // key: `${projectPath}::${branch}`
  private checksCache = new Map<string, ChecksCacheEntry>(); // key: `${slug}::${sha}`
  private noWorkflowsCache = new Set<string>();              // slugs whose first gh run list returned []

  constructor(private prAggregator: PrAggregator) {}

  /** Return the latest workflow run for a branch, or null if none / not a GH repo. */
  async getLatestRunForBranch(projectPath: string, branch: string): Promise<CiRun | null> {
    const key = `${projectPath}::${branch}`;
    const cached = this.runCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < RUN_CACHE_TTL_MS) {
      return cached.run;
    }

    const slug = await this.prAggregator.resolveGitHubSlug(projectPath);
    if (!slug) {
      this.runCache.set(key, { run: null, fetchedAt: Date.now() });
      return null;
    }

    if (this.noWorkflowsCache.has(slug)) {
      this.runCache.set(key, { run: null, fetchedAt: Date.now() });
      return null;
    }

    try {
      const { stdout } = await execFileAsync(
        'gh', [
          'run', 'list',
          '--repo', slug,
          '--branch', branch,
          '--limit', '1',
          '--json', 'databaseId,name,status,conclusion,url,headSha,createdAt,updatedAt',
        ],
        { timeout: TIMEOUTS.GH_CLI, env: enrichedEnv() },
      );
      const runs = JSON.parse(stdout) as CiRun[];
      const run = runs[0] ?? null;

      if (runs.length === 0) {
        this.noWorkflowsCache.add(slug);
      }

      this.runCache.set(key, { run, fetchedAt: Date.now() });
      return run;
    } catch (err) {
      log.warn(`gh run list failed for ${slug}@${branch}:`, err instanceof Error ? err.message : err);
      this.runCache.set(key, { run: null, fetchedAt: Date.now() });
      return null;
    }
  }

  /**
   * Fetch latest runs for a batch of (path, branch) pairs in parallel.
   * Returns a map keyed by the path (so the frontend can index by worktree
   * path or instance path without knowing which one the backend used).
   */
  async getLatestRunsBatch(
    projects: Array<{ path: string; branch: string | null }>,
  ): Promise<Record<string, CiRun>> {
    const result: Record<string, CiRun> = {};
    const valid = projects.filter(p => typeof p.branch === 'string' && p.branch.length > 0) as Array<{ path: string; branch: string }>;

    await Promise.all(valid.map(async ({ path, branch }) => {
      const run = await this.getLatestRunForBranch(path, branch);
      if (run) result[path] = run;
    }));

    return result;
  }

  /** Return check runs for a specific commit on a repo. */
  async getChecksForCommit(projectPath: string, sha: string): Promise<CheckRun[]> {
    const slug = await this.prAggregator.resolveGitHubSlug(projectPath);
    if (!slug) return [];

    const key = `${slug}::${sha}`;
    const cached = this.checksCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < CHECKS_CACHE_TTL_MS) {
      return cached.checks;
    }

    try {
      const { stdout } = await execFileAsync(
        'gh', [
          'api', `repos/${slug}/commits/${sha}/check-runs?per_page=100`,
          '--jq', '[.check_runs[] | {name, status, conclusion, url: .html_url, startedAt: .started_at, completedAt: .completed_at}]',
        ],
        { timeout: TIMEOUTS.GH_CLI * 2, env: enrichedEnv() },
      );
      const checks = JSON.parse(stdout) as CheckRun[];
      this.checksCache.set(key, { checks, fetchedAt: Date.now() });
      return checks;
    } catch (err) {
      log.warn(`gh check-runs failed for ${slug}@${sha}:`, err instanceof Error ? err.message : err);
      this.checksCache.set(key, { checks: [], fetchedAt: Date.now() });
      return [];
    }
  }
}
