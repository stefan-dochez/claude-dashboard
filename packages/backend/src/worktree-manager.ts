import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { IS_WINDOWS, NULL_DEVICE, PATH_SEP, getExtraPaths } from './platform.js';
import { createLogger } from './logger.js';

const log = createLogger('worktree-manager');

const execPromise = promisify(exec);

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

// Wrap execPromise to inject shell: true — required on Windows where cmd.exe
// may fail with ENOENT for git commands without an explicit shell.
function execAsync(cmd: string, opts: { encoding: BufferEncoding; cwd?: string; timeout?: number; maxBuffer?: number }) {
  return execPromise(cmd, { ...opts, shell: IS_WINDOWS ? true as unknown as string : undefined, ...(extraEnv ? { env: extraEnv } : {}) });
}

// Git failures come back with multi-kilobyte stderr full of `Updating files: XX%`
// progress lines. Extract the actionable `error:` / `fatal:` lines so the
// message we bubble up to the UI stays readable.
function cleanGitError(err: unknown, fallback: string): Error {
  if (!(err instanceof Error)) return new Error(fallback);
  const stderr = (err as Error & { stderr?: string }).stderr ?? '';
  const lines = stderr
    .split('\n')
    .map(line => line.trim())
    .filter(line => /^(error|fatal):/i.test(line));

  if (lines.length === 0) {
    const firstLine = err.message.split('\n')[0];
    return new Error(firstLine || fallback);
  }

  // Windows MAX_PATH case: N identical-shaped "Filename too long" errors only
  // differ by the path. Collapse into a single remediation-focused message.
  const longPathErrors = lines.filter(l => /filename too long/i.test(l));
  if (longPathErrors.length > 0) {
    const example = longPathErrors[0]
      .replace(/^error:\s*unable to create file\s+/i, '')
      .replace(/:\s*filename too long\s*$/i, '');
    const count = longPathErrors.length;
    const summary = `${count} file${count > 1 ? 's' : ''} exceed Windows' 260-char path limit — git can't create the worktree.`;
    const fix = 'Fix: enable LongPathsEnabled in the registry (admin) and run `git config --global core.longpaths true`.';
    const shortExample = example.length > 80 ? '…' + example.slice(-80) : example;
    return new Error([summary, `e.g. ${shortExample}`, fix].join('\n'));
  }

  // Generic: dedupe identical lines, cap at 5.
  const deduped = Array.from(new Set(lines)).slice(0, 5);
  return new Error(deduped.join('\n'));
}

interface WorktreeResult {
  worktreePath: string;
  branchName: string;
}

export class WorktreeManager {
  async isGitRepo(projectPath: string): Promise<boolean> {
    try {
      await execAsync('git rev-parse --is-inside-work-tree', {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 5000,
      });
      return true;
    } catch {
      return false;
    }
  }

  slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }

  async createWorktree(
    projectPath: string,
    taskDescription: string,
    branchPrefix?: string,
    startPoint?: string,
  ): Promise<WorktreeResult> {
    const slug = this.slugify(taskDescription);
    if (!slug) {
      throw new Error('Task description produced an empty slug');
    }

    const prefix = branchPrefix ?? 'claude';
    const branchName = `${prefix}/${slug}`;
    let worktreePath = `${projectPath}--${slug}`;

    // Collision handling: append -2, -3 if path exists
    let suffix = 1;
    while (fs.existsSync(worktreePath)) {
      suffix++;
      worktreePath = `${projectPath}--${slug}-${suffix}`;
    }

    const finalBranch = suffix > 1 ? `${branchName}-${suffix}` : branchName;

    // Determine start point: user-provided branch, or fall back to origin/<default>
    let resolvedStartPoint = '';
    if (startPoint) {
      // Fetch first so remote refs (origin/foo) are up to date
      try {
        await execAsync('git fetch origin', {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 30000,
        });
      } catch {
        log.info(` Failed to fetch origin, continuing with local refs`);
      }
      try {
        await execAsync(`git rev-parse --verify "${startPoint}"`, {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 5000,
        });
        resolvedStartPoint = startPoint;
        log.info(` Using ${resolvedStartPoint} as starting point`);
      } catch {
        throw new Error(`Start point "${startPoint}" not found`);
      }
    } else {
      const defaultBranch = await this.getDefaultBranch(projectPath);
      if (defaultBranch) {
        try {
          await execAsync('git fetch origin', {
            cwd: projectPath,
            encoding: 'utf-8',
            timeout: 30000,
          });
          resolvedStartPoint = `origin/${defaultBranch}`;
          log.info(` Using ${resolvedStartPoint} as starting point`);
        } catch {
          log.info(` Failed to fetch origin, using current HEAD`);
        }
      }
    }

    log.info(` Creating worktree at ${worktreePath} (branch: ${finalBranch})`);

    const startArg = resolvedStartPoint ? ` "${resolvedStartPoint}"` : '';
    try {
      await execAsync(`git worktree add -b "${finalBranch}" "${worktreePath}"${startArg}`, {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 30000,
      });
    } catch (err) {
      throw cleanGitError(err, 'git worktree add failed');
    }

    log.info(` Worktree created successfully`);

    return { worktreePath, branchName: finalBranch };
  }

  async listRemoteBranches(
    projectPath: string,
    opts: { limit?: number; search?: string } = {},
  ): Promise<{
    branches: Array<{ name: string; committerDate: number; authorName: string; hasLocalBranch: boolean }>;
    total: number;
    lastFetched: number | null;
  }> {
    const limit = Math.max(1, Math.min(opts.limit ?? 50, 1000));
    const search = opts.search?.trim().toLowerCase() ?? '';

    // Collect local branch names so we can flag remotes that are already present locally
    const { stdout: localOut } = await execAsync('git branch --format="%(refname:short)"', {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 10000,
    });
    const localSet = new Set(localOut.split('\n').map(l => l.trim()).filter(Boolean));

    const { stdout } = await execAsync(
      'git for-each-ref --sort=-committerdate --format="%(refname:short)||%(committerdate:unix)||%(authorname)" refs/remotes/origin/',
      {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 15000,
        maxBuffer: 5 * 1024 * 1024,
      },
    );

    const rows: Array<{ name: string; committerDate: number; authorName: string; hasLocalBranch: boolean }> = [];
    for (const line of stdout.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const [name, dateStr, author] = trimmed.split('||');
      if (!name || name.endsWith('/HEAD')) continue;
      // Skip bare remote (e.g. "origin" with no branch segment)
      if (!name.includes('/')) continue;
      const shortName = name.replace(/^[^/]+\//, '');
      if (!shortName) continue;
      rows.push({
        name,
        committerDate: parseInt(dateStr ?? '0', 10) || 0,
        authorName: author ?? '',
        hasLocalBranch: localSet.has(shortName),
      });
    }

    // Exclude remote branches that already have a same-named local branch —
    // they'd be redundant with the "Local" section, so slicing after this
    // filter guarantees the limit actually fills the UI list. `total` reflects
    // the count of *candidates for checkout* so the UI's "X / Y" stays honest
    // (no mysterious gap between rows shown and total reported).
    const withoutLocalDupes = rows.filter(r => !r.hasLocalBranch);
    const total = withoutLocalDupes.length;

    const filtered = search
      ? withoutLocalDupes.filter(r => r.name.toLowerCase().includes(search) || r.authorName.toLowerCase().includes(search))
      : withoutLocalDupes;

    return {
      branches: filtered.slice(0, limit),
      total,
      lastFetched: this.getFetchTime(projectPath),
    };
  }

  getFetchTime(projectPath: string): number | null {
    const candidates: string[] = [];
    const gitPath = path.join(projectPath, '.git');
    try {
      const stat = fs.statSync(gitPath);
      if (stat.isDirectory()) {
        candidates.push(path.join(gitPath, 'FETCH_HEAD'));
      } else if (stat.isFile()) {
        // Worktree: .git is a file pointing to the main repo's worktrees dir
        const content = fs.readFileSync(gitPath, 'utf-8').trim();
        const match = content.match(/^gitdir:\s*(.+)$/);
        if (match) {
          const gitdir = path.resolve(projectPath, match[1]);
          const mainGitDir = path.resolve(gitdir, '..', '..');
          candidates.push(path.join(mainGitDir, 'FETCH_HEAD'));
        }
      }
    } catch {
      return null;
    }

    for (const candidate of candidates) {
      try {
        const stat = fs.statSync(candidate);
        return stat.mtimeMs;
      } catch {
        // try next
      }
    }
    return null;
  }

  async fetchRemote(projectPath: string): Promise<{ success: boolean; message: string; lastFetched: number | null }> {
    try {
      await execAsync('git fetch origin --prune', {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 60000,
      });
      return { success: true, message: 'Fetched origin', lastFetched: this.getFetchTime(projectPath) };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Fetch failed';
      return { success: false, message: msg.split('\n')[0], lastFetched: this.getFetchTime(projectPath) };
    }
  }

  async remoteBranchToWorktree(projectPath: string, remoteBranch: string): Promise<WorktreeResult> {
    // Expected input: "origin/feat/foo" (or any "<remote>/<branch>")
    const firstSlash = remoteBranch.indexOf('/');
    if (firstSlash < 0) {
      throw new Error(`Invalid remote branch name: ${remoteBranch}`);
    }
    const localBranch = remoteBranch.slice(firstSlash + 1);
    if (!localBranch) {
      throw new Error(`Invalid remote branch name: ${remoteBranch}`);
    }

    // Verify the remote ref actually exists locally (user may need to fetch first)
    try {
      await execAsync(`git rev-parse --verify "refs/remotes/${remoteBranch}"`, {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 5000,
      });
    } catch {
      throw new Error(`Remote branch "${remoteBranch}" not found — try fetching first`);
    }

    const slug = this.slugify(localBranch);
    if (!slug) {
      throw new Error(`Branch name produced an empty slug: ${localBranch}`);
    }
    let worktreePath = `${projectPath}--${slug}`;
    let suffix = 1;
    while (fs.existsSync(worktreePath)) {
      suffix++;
      worktreePath = `${projectPath}--${slug}-${suffix}`;
    }

    // Detect whether a local branch with the same name already exists
    let localExists = false;
    try {
      await execAsync(`git rev-parse --verify "refs/heads/${localBranch}"`, {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 5000,
      });
      localExists = true;
    } catch {
      localExists = false;
    }

    log.info(` Creating worktree for remote branch ${remoteBranch} at ${worktreePath}`);

    try {
      if (localExists) {
        // Reuse existing local branch — git will refuse if already checked out elsewhere
        await execAsync(`git worktree add "${worktreePath}" "${localBranch}"`, {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 30000,
        });
      } else {
        // Create a new local branch tracking the remote ref
        await execAsync(`git worktree add --track -b "${localBranch}" "${worktreePath}" "${remoteBranch}"`, {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 30000,
        });
      }
    } catch (err) {
      throw cleanGitError(err, 'git worktree add failed');
    }

    log.info(` Worktree created successfully`);

    return { worktreePath, branchName: localBranch };
  }

  async listStartPoints(projectPath: string): Promise<Array<{ name: string; isRemote: boolean; isDefault: boolean }>> {
    const defaultBranch = await this.getDefaultBranch(projectPath);

    const { stdout: localOut } = await execAsync('git branch --format="%(refname:short)"', {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 10000,
    });
    const locals = localOut.split('\n').map(l => l.trim()).filter(Boolean);
    const localSet = new Set(locals);

    let remotes: string[] = [];
    try {
      const { stdout: remoteOut } = await execAsync('git branch -r --format="%(refname:short)"', {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 10000,
      });
      remotes = remoteOut
        .split('\n')
        .map(l => l.trim())
        // Exclude HEAD pointers and bare remote names (must have a branch segment after the remote)
        .filter(l => l && !l.endsWith('/HEAD') && l.includes('/'));
    } catch {
      // No remotes — not an error
    }

    const result: Array<{ name: string; isRemote: boolean; isDefault: boolean }> = [];
    for (const name of locals) {
      result.push({ name, isRemote: false, isDefault: name === defaultBranch });
    }
    for (const name of remotes) {
      const shortName = name.replace(/^[^/]+\//, '');
      // Skip remote branches whose short name matches a local branch (already listed)
      if (localSet.has(shortName)) continue;
      result.push({ name, isRemote: true, isDefault: false });
    }

    // Sort: default first, then locals alphabetically, then remotes alphabetically
    result.sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      if (a.isRemote !== b.isRemote) return a.isRemote ? 1 : -1;
      return a.name.localeCompare(b.name);
    });

    return result;
  }

  async getDefaultBranch(projectPath: string): Promise<string | null> {
    // Try common default branch names
    for (const candidate of ['main', 'master', 'develop']) {
      try {
        await execAsync(`git rev-parse --verify ${candidate}`, {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 5000,
        });
        return candidate;
      } catch {
        // Branch doesn't exist
      }
    }
    return null;
  }

  async isOnMainBranch(projectPath: string): Promise<boolean> {
    const branch = await this.getGitBranch(projectPath);
    if (!branch) return true;
    return ['main', 'master', 'develop'].includes(branch);
  }

  async listBranches(projectPath: string): Promise<Array<{ name: string; isCurrent: boolean; hasWorktree: boolean }>> {
    // List all local branches
    const { stdout: branchOutput } = await execAsync('git branch --format="%(refname:short)||%(worktreepath)"', {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 10000,
    });

    const currentBranch = await this.getGitBranch(projectPath);

    return branchOutput
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        const [name, worktreePath] = line.split('||');
        return {
          name: name.trim(),
          isCurrent: name.trim() === currentBranch,
          hasWorktree: !!worktreePath?.trim(),
        };
      });
  }

  async branchToWorktree(projectPath: string, branchName: string): Promise<WorktreeResult> {
    const slug = this.slugify(branchName);
    let worktreePath = `${projectPath}--${slug}`;

    // Collision handling
    let suffix = 1;
    while (fs.existsSync(worktreePath)) {
      suffix++;
      worktreePath = `${projectPath}--${slug}-${suffix}`;
    }

    log.info(` Creating worktree for branch ${branchName} at ${worktreePath}`);

    try {
      await execAsync(`git worktree add "${worktreePath}" "${branchName}"`, {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 30000,
      });
    } catch (err) {
      throw cleanGitError(err, 'git worktree add failed');
    }

    log.info(` Worktree created successfully`);

    return { worktreePath, branchName };
  }

  async checkoutDefaultBranch(
    projectPath: string,
    options?: { autoStash?: boolean },
  ): Promise<{ success: boolean; message: string; branch: string; needsStash?: boolean; stashed?: boolean }> {
    const currentBranch = await this.getGitBranch(projectPath);
    const defaultBranch = await this.getDefaultBranch(projectPath);
    if (!defaultBranch) {
      return { success: false, message: 'Cannot determine default branch', branch: '' };
    }
    if (currentBranch === defaultBranch) {
      return { success: true, message: 'Already on default branch', branch: defaultBranch };
    }

    // Check for uncommitted changes. If present and the caller hasn't opted
    // into autoStash, bail with `needsStash` so the UI can prompt. The stash
    // is left on the global stash list (not auto-popped) — the user can run
    // `git stash pop` on their feature branch when they return.
    const status = await this.getStatus(projectPath);
    const hasUncommitted = status.length > 0;
    let stashed = false;

    if (hasUncommitted && !options?.autoStash) {
      return {
        success: false,
        message: 'Uncommitted changes — stash them to continue',
        branch: currentBranch ?? '',
        needsStash: true,
      };
    }

    if (hasUncommitted && options?.autoStash) {
      const label = `claude-dashboard: switch from ${currentBranch ?? 'unknown'} to ${defaultBranch}`;
      try {
        await execAsync(`git stash push -u -m ${JSON.stringify(label)}`, {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 15000,
        });
        stashed = true;
        log.info(` Stashed uncommitted changes on ${currentBranch}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message.split('\n')[0] : 'Stash failed';
        return { success: false, message: `Stash failed: ${msg}`, branch: currentBranch ?? '' };
      }
    }

    try {
      await execAsync(`git checkout "${defaultBranch}"`, {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 15000,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Checkout failed';
      return { success: false, message: msg.split('\n')[0], branch: currentBranch ?? '', stashed };
    }

    // Pull latest
    try {
      await execAsync(`git pull --ff-only origin "${defaultBranch}"`, {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 30000,
      });
    } catch {
      // non-fatal — checkout succeeded
    }

    log.info(` Switched ${projectPath} from ${currentBranch} to ${defaultBranch}`);
    const message = stashed
      ? `Switched to ${defaultBranch} (stashed changes from ${currentBranch})`
      : `Switched to ${defaultBranch}`;
    return { success: true, message, branch: defaultBranch, stashed };
  }

  async detachBranchToWorktree(projectPath: string): Promise<WorktreeResult> {
    const currentBranch = await this.getGitBranch(projectPath);
    if (!currentBranch) {
      throw new Error('Cannot determine current branch');
    }

    const defaultBranch = await this.getDefaultBranch(projectPath);
    if (!defaultBranch) {
      throw new Error('Cannot determine default branch (looked for main, master, develop)');
    }

    if (currentBranch === defaultBranch) {
      throw new Error(`Already on default branch ${defaultBranch}`);
    }

    const slug = this.slugify(currentBranch);
    let worktreePath = `${projectPath}--${slug}`;

    // Collision handling
    let suffix = 1;
    while (fs.existsSync(worktreePath)) {
      suffix++;
      worktreePath = `${projectPath}--${slug}-${suffix}`;
    }

    log.info(` Detaching branch ${currentBranch} to worktree at ${worktreePath}`);

    // Step 1: Stash any local changes (including untracked files)
    const { stdout: stashOutput } = await execAsync('git stash push -u -m "claude-dashboard: detach branch"', {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 15000,
    });
    const stashResult = stashOutput.trim();
    const hasStash = !stashResult.includes('No local changes');
    if (hasStash) {
      log.info(` Stashed local changes`);
    }

    // Step 2: Fetch origin and switch repo to default branch
    try {
      await execAsync('git fetch origin', {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 30000,
      });
    } catch {
      log.info(` Failed to fetch origin, continuing with local state`);
    }

    try {
      await execAsync(`git checkout "${defaultBranch}"`, {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 15000,
      });
      // Pull latest changes on default branch
      try {
        await execAsync(`git pull --ff-only origin "${defaultBranch}"`, {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 30000,
        });
        log.info(` Updated ${defaultBranch} to latest origin`);
      } catch {
        log.info(` Failed to pull ${defaultBranch}, continuing with local state`);
      }
    } catch (err) {
      // Restore stash if checkout fails
      if (hasStash) {
        await execAsync('git stash pop', {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 15000,
        });
      }
      throw err;
    }

    // Step 3: Create worktree using the existing branch (no -b flag)
    try {
      await execAsync(`git worktree add "${worktreePath}" "${currentBranch}"`, {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 30000,
      });
    } catch (err) {
      // Rollback: go back to original branch and restore stash
      await execAsync(`git checkout "${currentBranch}"`, {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 15000,
      });
      if (hasStash) {
        await execAsync('git stash pop', {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 15000,
        });
      }
      throw cleanGitError(err, 'git worktree add failed');
    }

    // Step 4: Restore stashed changes in the worktree
    if (hasStash) {
      try {
        await execAsync('git stash pop', {
          cwd: worktreePath,
          encoding: 'utf-8',
          timeout: 15000,
        });
        log.info(` Restored stashed changes in worktree`);
      } catch (err) {
        log.info(` Warning: failed to pop stash in worktree: ${err}`);
      }
    }

    log.info(` Branch ${currentBranch} detached to worktree, repo now on ${defaultBranch}`);

    return { worktreePath, branchName: currentBranch };
  }

  async removeWorktree(projectPath: string, worktreePath: string): Promise<void> {
    const branchName = await this.getBranchName(worktreePath);
    const dirExists = fs.existsSync(worktreePath);

    log.info(` Removing worktree at ${worktreePath} (dirExists=${dirExists})`);

    // Prune stale worktree references first so git doesn't choke on orphaned entries
    try {
      await execAsync('git worktree prune', {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 5000,
      });
    } catch {
      // non-fatal
    }

    let dirRemoved = false;
    if (dirExists) {
      // Retry loop: on Windows, processes may hold file locks briefly after exit (EBUSY)
      const maxAttempts = IS_WINDOWS ? 5 : 1;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          await execAsync(`git worktree remove --force "${worktreePath}"`, {
            cwd: projectPath,
            encoding: 'utf-8',
            timeout: 15000,
          });
          dirRemoved = true;
          break;
        } catch {
          // git doesn't know about this worktree anymore — remove the directory manually
          log.info(` git worktree remove failed, removing directory manually (attempt ${attempt}/${maxAttempts})`);
          try {
            fs.rmSync(worktreePath, { recursive: true, force: true });
            dirRemoved = true;
            break;
          } catch (rmErr) {
            const isBusy = rmErr instanceof Error && 'code' in rmErr && (rmErr as NodeJS.ErrnoException).code === 'EBUSY';
            if (isBusy && attempt < maxAttempts) {
              log.info(` EBUSY, retrying in ${attempt}s...`);
              await new Promise(r => setTimeout(r, attempt * 1000));
            } else {
              log.info(` Failed to remove directory after ${maxAttempts} attempts`);
              // Don't throw — still try to clean up branch and git references below
            }
          }
        }
      }
    } else {
      dirRemoved = true;
    }

    // Prune again so git forgets the worktree even if the dir removal failed
    if (!dirRemoved) {
      try {
        await execAsync('git worktree prune', {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 5000,
        });
      } catch {
        // non-fatal
      }
    }

    if (branchName) {
      try {
        await execAsync(`git branch -D "${branchName}"`, {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 5000,
        });
        log.info(` Deleted branch ${branchName}`);
      } catch {
        // Branch already deleted or never existed — not an error
      }
    }
  }

  isWorktree(projectPath: string): boolean {
    try {
      const gitPath = path.join(projectPath, '.git');
      return fs.statSync(gitPath).isFile();
    } catch {
      return false;
    }
  }

  getParentProjectPath(worktreePath: string): string | null {
    try {
      // In a worktree, .git is a file containing "gitdir: /path/to/main/.git/worktrees/<name>"
      const gitContent = fs.readFileSync(path.join(worktreePath, '.git'), 'utf-8').trim();
      const match = gitContent.match(/^gitdir:\s*(.+)$/);
      if (!match) return null;
      // Resolve: .git/worktrees/<name> → go up to the .git dir, then its parent is the main repo
      const gitdir = path.resolve(worktreePath, match[1]);
      const mainGitDir = path.resolve(gitdir, '..', '..');
      const mainRepoDir = path.dirname(mainGitDir);
      // Verify it's actually a git repo
      if (fs.statSync(mainGitDir).isDirectory()) {
        return mainRepoDir;
      }
      return null;
    } catch {
      return null;
    }
  }

  async getGitBranch(projectPath: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 5000,
      });
      const branch = stdout.trim();
      return branch || null;
    } catch {
      return null;
    }
  }

  async pullRepo(projectPath: string): Promise<{ success: boolean; message: string }> {
    try {
      const branch = await this.getGitBranch(projectPath);
      if (!branch) {
        return { success: false, message: 'Cannot determine current branch' };
      }

      // Fetch first
      try {
        await execAsync('git fetch origin', {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 30000,
        });
      } catch {
        return { success: false, message: 'Failed to fetch origin' };
      }

      // Pull with fast-forward only to avoid merge conflicts
      const { stdout } = await execAsync(`git pull --ff-only origin "${branch}"`, {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 30000,
      });
      const output = stdout.trim();

      const alreadyUpToDate = output.includes('Already up to date') || output.includes('Already up-to-date');
      return {
        success: true,
        message: alreadyUpToDate ? 'Already up to date' : 'Updated',
      };
    } catch (err) {
      // exec's rejection packs stderr as a property on the Error. err.message
      // starts with "Command failed: <cmd>" followed by stderr, which is why
      // bare err.message.split('\n')[0] just shows the command and hides the
      // actionable reason. Match against stderr directly.
      const stderr = (err as Error & { stderr?: string })?.stderr ?? '';
      const msg = err instanceof Error ? err.message : '';
      const haystack = `${stderr}\n${msg}`;

      if (/not possible to fast-forward/i.test(haystack) || /non-fast-forward/i.test(haystack) || /diverged/i.test(haystack)) {
        return { success: false, message: 'Local branch has diverged — rebase or merge manually' };
      }
      if (/would be overwritten by merge/i.test(haystack) || /Please commit your changes or stash them/i.test(haystack)) {
        return { success: false, message: 'Uncommitted changes — commit or stash first' };
      }
      if (/couldn't find remote ref/i.test(haystack) || /no such ref was fetched/i.test(haystack)) {
        return { success: false, message: 'Remote branch not found — it may have been deleted' };
      }
      if (/authentication failed/i.test(haystack) || /could not read username/i.test(haystack) || /terminal prompts disabled/i.test(haystack)) {
        return { success: false, message: 'Authentication failed — check your git credentials' };
      }
      if (/could not resolve host/i.test(haystack) || /failed to connect/i.test(haystack) || /network is unreachable/i.test(haystack)) {
        return { success: false, message: 'Network error — cannot reach origin' };
      }

      // Fallback: first `error:` / `fatal:` line from stderr, else first line of msg.
      const actionable = stderr
        .split('\n')
        .map(l => l.trim())
        .find(l => /^(error|fatal):/i.test(l));
      return { success: false, message: actionable ?? msg.split('\n')[0] ?? 'Pull failed' };
    }
  }

  async getStatus(projectPath: string): Promise<Array<{ status: string; path: string }>> {
    const { stdout } = await execAsync('git status --porcelain=v1 -u', {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 15000,
    });

    return stdout
      .split('\n')
      .filter(line => line.length > 0)
      .map(line => ({
        status: line.slice(0, 2),
        path: line.slice(3),
      }));
  }

  async getWorkingDiff(projectPath: string, filePath?: string): Promise<string> {
    // Diff of staged + unstaged changes against HEAD
    const fileArg = filePath ? ` -- "${filePath}"` : '';

    let diff = '';
    try {
      const { stdout } = await execAsync(`git diff HEAD${fileArg}`, {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 30000,
        maxBuffer: 5 * 1024 * 1024,
      });
      diff = stdout;
    } catch {
      // diff HEAD fails if there are no commits yet
      const { stdout } = await execAsync(`git diff${fileArg}`, {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 30000,
        maxBuffer: 5 * 1024 * 1024,
      });
      diff = stdout;
    }

    // For untracked files, git diff HEAD won't show them — generate a diff manually
    if (!filePath) {
      const untracked = (await this.getStatus(projectPath)).filter(f => f.status === '??');
      for (const file of untracked) {
        try {
          const { stdout: content } = await execAsync(`git diff --no-index ${NULL_DEVICE} "${file.path}"`, {
            cwd: projectPath,
            encoding: 'utf-8',
            timeout: 10000,
            maxBuffer: 5 * 1024 * 1024,
          });
          diff += content;
        } catch (err) {
          // git diff --no-index exits with code 1 when files differ — that's expected
          if (err instanceof Error && 'stdout' in err) {
            diff += (err as Error & { stdout: string }).stdout;
          }
        }
      }
    } else {
      // Check if this specific file is untracked
      const status = (await this.getStatus(projectPath)).find(f => f.path === filePath);
      if (status?.status === '??' && !diff) {
        try {
          await execAsync(`git diff --no-index ${NULL_DEVICE} "${filePath}"`, {
            cwd: projectPath,
            encoding: 'utf-8',
            timeout: 10000,
            maxBuffer: 5 * 1024 * 1024,
          });
        } catch (err) {
          if (err instanceof Error && 'stdout' in err) {
            diff = (err as Error & { stdout: string }).stdout;
          }
        }
      }
    }

    return diff;
  }

  async getBranchDiff(projectPath: string, targetBranch?: string): Promise<{
    diff: string;
    baseBranch: string;
    currentBranch: string;
    stats: { filesChanged: number; additions: number; deletions: number };
    commits: Array<{ hash: string; message: string; date: string }>;
  }> {
    const baseBranch = targetBranch ?? await this.getDefaultBranch(projectPath) ?? 'main';
    const currentBranch = await this.getGitBranch(projectPath) ?? 'HEAD';

    // Fetch origin so we compare against the latest remote state, not a stale local branch
    try {
      await execAsync('git fetch origin', {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 30000,
      });
    } catch {
      log.warn('Failed to fetch origin for branch diff, using local state');
    }

    // Use origin/<base> to avoid comparing against a stale local branch
    let diffRef = `origin/${baseBranch}`;
    try {
      await execAsync(`git rev-parse --verify "${diffRef}"`, {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 5000,
      });
    } catch {
      // Fallback to local branch if origin ref doesn't exist
      diffRef = baseBranch;
    }

    const { stdout: diff } = await execAsync(`git diff "${diffRef}"...HEAD`, {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 30000,
      maxBuffer: 5 * 1024 * 1024,
    });

    // Parse stats
    let filesChanged = 0;
    let additions = 0;
    let deletions = 0;
    try {
      const { stdout: statOutput } = await execAsync(`git diff --stat "${diffRef}"...HEAD`, {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 15000,
      });
      const summaryLine = statOutput.trim().split('\n').pop() ?? '';
      const filesMatch = summaryLine.match(/(\d+) files? changed/);
      const addMatch = summaryLine.match(/(\d+) insertions?/);
      const delMatch = summaryLine.match(/(\d+) deletions?/);
      filesChanged = filesMatch ? parseInt(filesMatch[1]) : 0;
      additions = addMatch ? parseInt(addMatch[1]) : 0;
      deletions = delMatch ? parseInt(delMatch[1]) : 0;
    } catch {
      // non-fatal
    }

    // Get commits between base and HEAD
    const commits: Array<{ hash: string; message: string; date: string }> = [];
    try {
      const { stdout: logOutput } = await execAsync(
        `git log "${diffRef}"..HEAD --format="%H||%s||%ci" --reverse`,
        {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 15000,
        },
      );
      for (const line of logOutput.trim().split('\n')) {
        if (!line) continue;
        const [hash, message, date] = line.split('||');
        commits.push({ hash: hash.slice(0, 8), message, date });
      }
    } catch {
      // non-fatal
    }

    return { diff, baseBranch, currentBranch, stats: { filesChanged, additions, deletions }, commits };
  }

  private async getBranchName(worktreePath: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', {
        cwd: worktreePath,
        encoding: 'utf-8',
        timeout: 5000,
      });
      const branch = stdout.trim();
      return branch || null;
    } catch {
      // Worktree may already be removed, try to infer from path
      const match = path.basename(worktreePath).match(/^.+--(.+)$/);
      if (match) {
        return `claude/${match[1]}`;
      }
      return null;
    }
  }
}
