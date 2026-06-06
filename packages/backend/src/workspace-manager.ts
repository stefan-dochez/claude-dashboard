import { EventEmitter } from 'events';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import type { ConfigService } from './config.js';
import { IS_WINDOWS, PATH_SEP, getExtraPaths } from './platform.js';
import { TIMEOUTS } from './constants.js';
import { createLogger } from './logger.js';

const log = createLogger('workspace-manager');

const execFilePromise = promisify(execFile);

function augmentedEnv(): Record<string, string> | undefined {
  if (!IS_WINDOWS) return undefined;
  const env = { ...process.env } as Record<string, string>;
  const parts = (env.PATH ?? '').split(PATH_SEP);
  for (const p of getExtraPaths()) {
    if (!parts.includes(p)) parts.push(p);
  }
  env.PATH = parts.join(PATH_SEP);
  return env;
}

const extraEnv = augmentedEnv();

// execFile (no shell) so user-supplied clone URLs can never be interpreted as
// shell syntax. PATH is still augmented on Windows so `git` resolves.
function git(args: string[], opts: { cwd: string; timeout?: number }) {
  return execFilePromise('git', args, {
    cwd: opts.cwd,
    encoding: 'utf-8',
    timeout: opts.timeout ?? TIMEOUTS.GIT_SHORT,
    maxBuffer: 10 * 1024 * 1024,
    ...(extraEnv ? { env: extraEnv } : {}),
  });
}

/** Extract the actionable error/fatal lines from a noisy git stderr. */
function cleanGitError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const stderr = (err as Error & { stderr?: string }).stderr ?? '';
  const lines = stderr
    .split('\n')
    .map(line => line.trim())
    .filter(line => /^(error|fatal):/i.test(line));
  if (lines.length === 0) {
    return err.message.split('\n')[0] || fallback;
  }
  return Array.from(new Set(lines)).slice(0, 3).join('\n');
}

const REPOS_SECTION_START = '<!-- dashboard:repos:start -->';
const REPOS_SECTION_END = '<!-- dashboard:repos:end -->';

interface WorkspaceRepoSpec {
  /** Clone URL (ssh or https). */
  url: string;
  /** Target directory name. Derived from the URL when omitted. */
  name?: string;
}

interface RepoCloneResult {
  name: string;
  url: string;
  status: 'done' | 'error';
  error?: string;
}

interface WorkspaceProgressEvent {
  workspacePath: string;
  repo: string;
  status: 'cloning' | 'done' | 'error';
  error?: string;
}

/** Derive a directory name from a clone URL: last path segment minus `.git`. */
function deriveRepoName(url: string): string {
  const stripped = url.replace(/\.git\/?$/, '');
  const segment = stripped.split(/[/:]/).filter(Boolean).pop() ?? '';
  return segment;
}

function isValidRepoName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) && !name.includes('..');
}

function isValidCloneUrl(url: string): boolean {
  // https://host/org/repo(.git) or git@host:org/repo(.git) — and never
  // something git would parse as an option.
  if (url.startsWith('-')) return false;
  return /^(https:\/\/|git@|ssh:\/\/)[^\s]+$/.test(url);
}

/**
 * Manages "workspace" projects: a plain folder (no .git) inside a scan path,
 * grouping full clones of several repos next to a generated CLAUDE.md.
 * The scanner already detects this layout as `type: 'workspace'`.
 *
 * Emits `progress` (WorkspaceProgressEvent) while cloning so the frontend can
 * show per-repo status over the socket.
 */
export class WorkspaceManager extends EventEmitter {
  constructor(private configService: ConfigService) {
    super();
  }

  /**
   * Resolve the parent directory for a new workspace. Any existing directory
   * is accepted; when it isn't covered by a configured scan path it's added
   * to `scanPaths` so the scanner can discover the new workspace.
   */
  private async resolveParentPath(parentPath: string): Promise<string> {
    const resolved = path.resolve(parentPath.replace(/^~/, os.homedir()));
    const stat = await fs.stat(resolved).catch(() => null);
    if (!stat?.isDirectory()) {
      throw new Error(`Parent directory not found: ${parentPath}`);
    }
    const config = await this.configService.get();
    const allowed = config.scanPaths.map(p => path.resolve(p.replace(/^~/, os.homedir())));
    const covered = allowed.some(root => resolved === root || resolved.startsWith(root + path.sep));
    if (!covered) {
      await this.configService.save({ scanPaths: [...config.scanPaths, resolved] });
      log.info(`Added ${resolved} to scanPaths (custom workspace location)`);
    }
    return resolved;
  }

  /** Validate that `workspacePath` is a workspace folder (inside a scan path, no .git). */
  async assertWorkspace(workspacePath: string): Promise<string> {
    const config = await this.configService.get();
    const resolved = path.resolve(workspacePath.replace(/^~/, os.homedir()));
    const allowed = config.scanPaths.map(p => path.resolve(p.replace(/^~/, os.homedir())));
    if (!allowed.some(root => resolved.startsWith(root + path.sep))) {
      throw new Error(`Workspace path is outside the configured scan paths: ${workspacePath}`);
    }
    const stat = await fs.stat(resolved).catch(() => null);
    if (!stat?.isDirectory()) {
      throw new Error(`Workspace directory not found: ${workspacePath}`);
    }
    const hasGit = await fs.access(path.join(resolved, '.git')).then(() => true).catch(() => false);
    if (hasGit) {
      throw new Error(`${workspacePath} is a git repo, not a workspace`);
    }
    return resolved;
  }

  private normalizeRepos(repos: WorkspaceRepoSpec[]): Array<{ name: string; url: string }> {
    return repos.map(spec => {
      const url = spec.url.trim();
      if (!isValidCloneUrl(url)) {
        throw new Error(`Invalid clone URL: ${url}`);
      }
      const name = (spec.name ?? deriveRepoName(url)).trim();
      if (!isValidRepoName(name)) {
        throw new Error(`Invalid repo directory name: ${name}`);
      }
      return { name, url };
    });
  }

  /**
   * Create the workspace folder + initial CLAUDE.md. Does NOT clone — call
   * `cloneRepos` afterwards (the route runs it in the background so the HTTP
   * response returns immediately).
   */
  async create(options: { name: string; parentPath: string; repos: WorkspaceRepoSpec[] }): Promise<string> {
    const { name, parentPath, repos } = options;
    if (!isValidRepoName(name)) {
      throw new Error(`Invalid workspace name: ${name}`);
    }
    // Validate repo specs up front so a bad URL fails the request, not the background clone.
    this.normalizeRepos(repos);

    const parent = await this.resolveParentPath(parentPath);
    const workspacePath = path.join(parent, name);
    const exists = await fs.access(workspacePath).then(() => true).catch(() => false);
    if (exists) {
      throw new Error(`Directory already exists: ${workspacePath}`);
    }

    await fs.mkdir(workspacePath, { recursive: true });
    await fs.writeFile(path.join(workspacePath, 'CLAUDE.md'), this.initialClaudeMd(name), 'utf-8');
    log.info(`Created workspace ${workspacePath}`);
    return workspacePath;
  }

  /**
   * Clone each repo sequentially into the workspace, emitting `progress`
   * events, then sync the repos section of CLAUDE.md from what's on disk.
   * One failing clone doesn't stop the others.
   */
  async cloneRepos(workspacePath: string, repos: WorkspaceRepoSpec[]): Promise<RepoCloneResult[]> {
    const resolved = await this.assertWorkspace(workspacePath);
    const normalized = this.normalizeRepos(repos);
    const results: RepoCloneResult[] = [];

    for (const { name, url } of normalized) {
      const target = path.join(resolved, name);
      const exists = await fs.access(target).then(() => true).catch(() => false);
      if (exists) {
        results.push({ name, url, status: 'error', error: `Directory already exists: ${name}` });
        this.emitProgress({ workspacePath: resolved, repo: name, status: 'error', error: 'Directory already exists' });
        continue;
      }

      this.emitProgress({ workspacePath: resolved, repo: name, status: 'cloning' });
      try {
        await git(['clone', '--', url, name], { cwd: resolved, timeout: TIMEOUTS.GIT_CLONE });
        results.push({ name, url, status: 'done' });
        this.emitProgress({ workspacePath: resolved, repo: name, status: 'done' });
        log.info(`Cloned ${url} into ${target}`);
      } catch (err) {
        const message = cleanGitError(err, 'Clone failed');
        results.push({ name, url, status: 'error', error: message });
        this.emitProgress({ workspacePath: resolved, repo: name, status: 'error', error: message });
        log.error(`Clone failed for ${url} in ${resolved}:`, message);
      }
    }

    await this.syncReposSection(resolved).catch(err => {
      log.warn(`Failed to sync CLAUDE.md repos section for ${resolved}:`, err);
    });
    return results;
  }

  /** Delete a cloned repo from the workspace and update CLAUDE.md. */
  async removeRepo(workspacePath: string, repoName: string): Promise<void> {
    const resolved = await this.assertWorkspace(workspacePath);
    if (!isValidRepoName(repoName)) {
      throw new Error(`Invalid repo name: ${repoName}`);
    }
    const target = path.join(resolved, repoName);
    const stat = await fs.stat(target).catch(() => null);
    if (!stat?.isDirectory()) {
      throw new Error(`Repo not found in workspace: ${repoName}`);
    }
    // Safety: only delete directories that are git clones/worktrees, never
    // arbitrary folders (notes, test data, ...).
    const hasGit = await fs.access(path.join(target, '.git')).then(() => true).catch(() => false);
    if (!hasGit) {
      throw new Error(`${repoName} is not a git repo — refusing to delete`);
    }

    await fs.rm(target, { recursive: true, force: true });
    log.info(`Removed repo ${target}`);
    await this.syncReposSection(resolved).catch(err => {
      log.warn(`Failed to sync CLAUDE.md repos section for ${resolved}:`, err);
    });
  }

  /**
   * Regenerate the managed repos section of CLAUDE.md from the git repos
   * actually present in the workspace (depth 1). Content outside the
   * `dashboard:repos` markers is left untouched, so manual edits survive.
   */
  async syncReposSection(workspacePath: string): Promise<void> {
    const entries = await fs.readdir(workspacePath, { withFileTypes: true });
    const rows: Array<{ name: string; url: string; branch: string }> = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const repoPath = path.join(workspacePath, entry.name);
      const hasGit = await fs.access(path.join(repoPath, '.git')).then(() => true).catch(() => false);
      if (!hasGit) continue;

      const url = await git(['remote', 'get-url', 'origin'], { cwd: repoPath })
        .then(r => r.stdout.trim())
        .catch(() => '—');
      const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoPath })
        .then(r => r.stdout.trim())
        .catch(() => '—');
      rows.push({ name: entry.name, url, branch });
    }

    const section = [
      REPOS_SECTION_START,
      '## Repositories',
      '',
      '| Repo | Origin | Branch |',
      '|------|--------|--------|',
      ...rows.map(r => `| ${r.name} | ${r.url} | ${r.branch} |`),
      REPOS_SECTION_END,
    ].join('\n');

    const claudeMdPath = path.join(workspacePath, 'CLAUDE.md');
    let content = await fs.readFile(claudeMdPath, 'utf-8').catch(() => null);
    if (content === null) {
      content = `${this.initialClaudeMd(path.basename(workspacePath))}`;
    }

    const startIdx = content.indexOf(REPOS_SECTION_START);
    const endIdx = content.indexOf(REPOS_SECTION_END);
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      content = content.slice(0, startIdx) + section + content.slice(endIdx + REPOS_SECTION_END.length);
    } else {
      content = `${content.trimEnd()}\n\n${section}\n`;
    }
    await fs.writeFile(claudeMdPath, content, 'utf-8');
  }

  private initialClaudeMd(name: string): string {
    return [
      `# ${name} — workspace`,
      '',
      '## Purpose',
      '',
      '_Describe the goal of this workspace._',
      '',
      REPOS_SECTION_START,
      '## Repositories',
      '',
      '| Repo | Origin | Branch |',
      '|------|--------|--------|',
      REPOS_SECTION_END,
      '',
      '## Notes',
      '',
      '_Conventions, findings, and design decisions go here._',
      '',
    ].join('\n');
  }

  private emitProgress(event: WorkspaceProgressEvent): void {
    this.emit('progress', event);
  }
}

export type { WorkspaceRepoSpec, RepoCloneResult, WorkspaceProgressEvent };
