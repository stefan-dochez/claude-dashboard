import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

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

  async createWorktree(projectPath: string, taskDescription: string, branchPrefix?: string): Promise<WorktreeResult> {
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

    // Fetch and use latest default branch as starting point
    const defaultBranch = await this.getDefaultBranch(projectPath);
    let startPoint = '';
    if (defaultBranch) {
      try {
        await execAsync('git fetch origin', {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 30000,
        });
        startPoint = `origin/${defaultBranch}`;
        console.log(`[worktree-manager] Using ${startPoint} as starting point`);
      } catch {
        console.log(`[worktree-manager] Failed to fetch origin, using current HEAD`);
      }
    }

    console.log(`[worktree-manager] Creating worktree at ${worktreePath} (branch: ${finalBranch})`);

    const startArg = startPoint ? ` "${startPoint}"` : '';
    await execAsync(`git worktree add -b "${finalBranch}" "${worktreePath}"${startArg}`, {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 30000,
    });

    console.log(`[worktree-manager] Worktree created successfully`);

    return { worktreePath, branchName: finalBranch };
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

  async checkoutDefaultBranch(projectPath: string): Promise<{ success: boolean; message: string; branch: string }> {
    const currentBranch = await this.getGitBranch(projectPath);
    const defaultBranch = await this.getDefaultBranch(projectPath);
    if (!defaultBranch) {
      return { success: false, message: 'Cannot determine default branch', branch: '' };
    }
    if (currentBranch === defaultBranch) {
      return { success: true, message: 'Already on default branch', branch: defaultBranch };
    }

    // Check for uncommitted changes
    const status = await this.getStatus(projectPath);
    if (status.length > 0) {
      return { success: false, message: 'Uncommitted changes — commit or stash first', branch: currentBranch ?? '' };
    }

    try {
      await execAsync(`git checkout "${defaultBranch}"`, {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 15000,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Checkout failed';
      return { success: false, message: msg.split('\n')[0], branch: currentBranch ?? '' };
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

    console.log(`[worktree-manager] Switched ${projectPath} from ${currentBranch} to ${defaultBranch}`);
    return { success: true, message: `Switched to ${defaultBranch}`, branch: defaultBranch };
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

    console.log(`[worktree-manager] Detaching branch ${currentBranch} to worktree at ${worktreePath}`);

    // Step 1: Stash any local changes (including untracked files)
    const { stdout: stashOutput } = await execAsync('git stash push -u -m "claude-dashboard: detach branch"', {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 15000,
    });
    const stashResult = stashOutput.trim();
    const hasStash = !stashResult.includes('No local changes');
    if (hasStash) {
      console.log(`[worktree-manager] Stashed local changes`);
    }

    // Step 2: Fetch origin and switch repo to default branch
    try {
      await execAsync('git fetch origin', {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 30000,
      });
    } catch {
      console.log(`[worktree-manager] Failed to fetch origin, continuing with local state`);
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
        console.log(`[worktree-manager] Updated ${defaultBranch} to latest origin`);
      } catch {
        console.log(`[worktree-manager] Failed to pull ${defaultBranch}, continuing with local state`);
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
      throw err;
    }

    // Step 4: Restore stashed changes in the worktree
    if (hasStash) {
      try {
        await execAsync('git stash pop', {
          cwd: worktreePath,
          encoding: 'utf-8',
          timeout: 15000,
        });
        console.log(`[worktree-manager] Restored stashed changes in worktree`);
      } catch (err) {
        console.log(`[worktree-manager] Warning: failed to pop stash in worktree: ${err}`);
      }
    }

    console.log(`[worktree-manager] Branch ${currentBranch} detached to worktree, repo now on ${defaultBranch}`);

    return { worktreePath, branchName: currentBranch };
  }

  async removeWorktree(projectPath: string, worktreePath: string): Promise<void> {
    const branchName = await this.getBranchName(worktreePath);
    const dirExists = fs.existsSync(worktreePath);

    console.log(`[worktree-manager] Removing worktree at ${worktreePath} (dirExists=${dirExists})`);

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

    if (dirExists) {
      try {
        await execAsync(`git worktree remove --force "${worktreePath}"`, {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 15000,
        });
      } catch {
        // git doesn't know about this worktree anymore — remove the directory manually
        console.log(`[worktree-manager] git worktree remove failed, removing directory manually`);
        fs.rmSync(worktreePath, { recursive: true, force: true });
      }
    }

    if (branchName) {
      try {
        await execAsync(`git branch -D "${branchName}"`, {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 5000,
        });
        console.log(`[worktree-manager] Deleted branch ${branchName}`);
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
      const msg = err instanceof Error ? err.message : 'Pull failed';
      // Check for common issues
      if (msg.includes('Not possible to fast-forward')) {
        return { success: false, message: 'Cannot fast-forward — local branch has diverged' };
      }
      return { success: false, message: msg.split('\n')[0] };
    }
  }

  async getStatus(projectPath: string): Promise<Array<{ status: string; path: string }>> {
    const { stdout } = await execAsync('git status --porcelain=v1', {
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
          const { stdout: content } = await execAsync(`git diff --no-index /dev/null "${file.path}"`, {
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
          await execAsync(`git diff --no-index /dev/null "${filePath}"`, {
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
      console.log('[worktree-manager] Failed to fetch origin for branch diff, using local state');
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
