import { execFile } from 'child_process';
import { promisify } from 'util';
import { createLogger } from './logger.js';
import { TIMEOUTS } from './constants.js';
import { PATH_SEP, getExtraPaths } from './platform.js';
import type { PrAggregator } from './pr-aggregator.js';

const execFileAsync = promisify(execFile);
const log = createLogger('ci-status');

const STATUS_CACHE_TTL_MS = 60 * 1000;      // 60s — branch status (CI + PR state)
const CHECKS_CACHE_TTL_MS = 2 * 60 * 1000;  // 2min — full check-runs list per commit (PR view)

function enrichedEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: [...getExtraPaths(), process.env.PATH ?? ''].join(PATH_SEP),
  };
}

export interface CheckRun {
  name: string;
  status: string;            // queued | in_progress | completed
  conclusion: string | null; // success | failure | cancelled | skipped | neutral | timed_out | action_required
  url: string;
  startedAt: string | null;
  completedAt: string | null;
}

export type CiState = 'success' | 'failure' | 'running' | 'neutral';
export type PrState = 'OPEN' | 'MERGED' | 'CLOSED';

export interface CiSummary {
  passed: number;
  failed: number;
  running: number;
  total: number;
}

/** Aggregated state of a branch: CI status derived from all check-runs, plus PR state. */
export interface BranchStatus {
  ciState: CiState | null;     // null when no check data or branch has no PR-worthy commits
  ciSummary: CiSummary;
  prState: PrState | null;     // null when no PR exists for the branch
  prUrl: string | null;
}

/**
 * Aggregate a list of check-runs into a single state.
 * - `cancelled` / `skipped` / `neutral` conclusions are ignored in the count
 *   so that trivial workflows (PR Labeler, "Clear skip CI on Renovate PR")
 *   don't mask the real CI state.
 * - Failure wins over running: an actionable red state shouldn't be hidden
 *   behind a still-running job.
 */
export function aggregateChecks(checks: CheckRun[]): { state: CiState; summary: CiSummary } {
  let running = 0;
  let failed = 0;
  let passed = 0;
  for (const c of checks) {
    if (c.status === 'queued' || c.status === 'in_progress') {
      running += 1;
      continue;
    }
    switch (c.conclusion) {
      case 'failure':
      case 'timed_out':
      case 'action_required':
        failed += 1;
        break;
      case 'success':
        passed += 1;
        break;
      // cancelled / skipped / neutral → ignored
    }
  }
  const total = running + failed + passed;
  let state: CiState;
  if (failed > 0) state = 'failure';
  else if (running > 0) state = 'running';
  else if (passed > 0) state = 'success';
  else state = 'neutral';
  return { state, summary: { passed, failed, running, total } };
}

interface StatusCacheEntry {
  status: BranchStatus;
  fetchedAt: number;
}

interface ChecksCacheEntry {
  checks: CheckRun[];
  fetchedAt: number;
}

export class CiStatusService {
  private statusCache = new Map<string, StatusCacheEntry>(); // key: `${projectPath}::${branch}`
  private checksCache = new Map<string, ChecksCacheEntry>(); // key: `${slug}::${sha}`

  constructor(private prAggregator: PrAggregator) {}

  /**
   * Return aggregated branch status (CI + PR state) for a single branch.
   * Uses check-runs for all workflows on the branch head, not `gh run list`,
   * so the result reflects the real CI state rather than whichever workflow
   * happened to finish last.
   */
  async getBranchStatus(projectPath: string, branch: string): Promise<BranchStatus> {
    const key = `${projectPath}::${branch}`;
    const cached = this.statusCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < STATUS_CACHE_TTL_MS) {
      return cached.status;
    }

    const empty: BranchStatus = {
      ciState: null,
      ciSummary: { passed: 0, failed: 0, running: 0, total: 0 },
      prState: null,
      prUrl: null,
    };

    const slug = await this.prAggregator.resolveGitHubSlug(projectPath);
    if (!slug) {
      this.statusCache.set(key, { status: empty, fetchedAt: Date.now() });
      return empty;
    }

    const [checksResult, prResult] = await Promise.allSettled([
      this.fetchChecksForBranch(slug, branch),
      this.fetchPrForBranch(slug, branch),
    ]);

    const checks = checksResult.status === 'fulfilled' ? checksResult.value : [];
    const pr = prResult.status === 'fulfilled' ? prResult.value : null;

    const { state, summary } = checks.length > 0
      ? aggregateChecks(checks)
      : { state: 'neutral' as CiState, summary: { passed: 0, failed: 0, running: 0, total: 0 } };

    const status: BranchStatus = {
      ciState: checks.length > 0 ? state : null,
      ciSummary: summary,
      prState: pr?.state ?? null,
      prUrl: pr?.url ?? null,
    };

    this.statusCache.set(key, { status, fetchedAt: Date.now() });
    return status;
  }

  /** Fetch check-runs for a branch head (one call, all workflows). */
  private async fetchChecksForBranch(slug: string, branch: string): Promise<CheckRun[]> {
    try {
      // gh api accepts branch name as the {ref} path segment and resolves it
      // to the branch's head commit server-side — no need to rev-parse locally.
      const { stdout } = await execFileAsync(
        'gh', [
          'api', `repos/${slug}/commits/${encodeURIComponent(branch)}/check-runs?per_page=100`,
          '--jq', '[.check_runs[] | {name, status, conclusion, url: .html_url, startedAt: .started_at, completedAt: .completed_at}]',
        ],
        { timeout: TIMEOUTS.GH_CLI * 2, env: enrichedEnv() },
      );
      return JSON.parse(stdout) as CheckRun[];
    } catch (err) {
      log.warn(`check-runs failed for ${slug}@${branch}:`, err instanceof Error ? err.message : err);
      return [];
    }
  }

  /** Fetch the most recent PR (any state) for a branch. Null if none exists. */
  private async fetchPrForBranch(
    slug: string,
    branch: string,
  ): Promise<{ state: PrState; url: string } | null> {
    try {
      const { stdout } = await execFileAsync(
        'gh', [
          'pr', 'list',
          '--repo', slug,
          '--head', branch,
          '--state', 'all',
          '--limit', '1',
          '--json', 'state,url',
        ],
        { timeout: TIMEOUTS.GH_CLI, env: enrichedEnv() },
      );
      const prs = JSON.parse(stdout) as Array<{ state: string; url: string }>;
      const pr = prs[0];
      if (!pr) return null;
      const state = pr.state.toUpperCase();
      if (state === 'OPEN' || state === 'MERGED' || state === 'CLOSED') {
        return { state, url: pr.url };
      }
      return null;
    } catch (err) {
      log.warn(`pr list failed for ${slug}@${branch}:`, err instanceof Error ? err.message : err);
      return null;
    }
  }

  /** Batch version — one BranchStatus per (path, branch) pair. */
  async getBranchStatusBatch(
    projects: Array<{ path: string; branch: string | null }>,
  ): Promise<Record<string, BranchStatus>> {
    const result: Record<string, BranchStatus> = {};
    const valid = projects.filter(p => typeof p.branch === 'string' && p.branch.length > 0) as Array<{ path: string; branch: string }>;

    await Promise.all(valid.map(async ({ path, branch }) => {
      const status = await this.getBranchStatus(path, branch);
      // Only include entries where we have something useful to show
      if (status.ciState !== null || status.prState !== null) {
        result[path] = status;
      }
    }));

    return result;
  }

  /** Return check runs for a specific commit — used by the PR view. */
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
