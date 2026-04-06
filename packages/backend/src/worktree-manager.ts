import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

interface WorktreeResult {
  worktreePath: string;
  branchName: string;
}

export class WorktreeManager {
  isGitRepo(projectPath: string): boolean {
    try {
      execSync('git rev-parse --is-inside-work-tree', {
        cwd: projectPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
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

  createWorktree(projectPath: string, taskDescription: string): WorktreeResult {
    const slug = this.slugify(taskDescription);
    if (!slug) {
      throw new Error('Task description produced an empty slug');
    }

    const branchName = `claude/${slug}`;
    let worktreePath = `${projectPath}--${slug}`;

    // Collision handling: append -2, -3 if path exists
    let suffix = 1;
    while (fs.existsSync(worktreePath)) {
      suffix++;
      worktreePath = `${projectPath}--${slug}-${suffix}`;
    }

    const finalBranch = suffix > 1 ? `${branchName}-${suffix}` : branchName;

    // Fetch and use latest default branch as starting point
    const defaultBranch = this.getDefaultBranch(projectPath);
    let startPoint = '';
    if (defaultBranch) {
      try {
        execSync('git fetch origin', {
          cwd: projectPath,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
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
    execSync(`git worktree add -b "${finalBranch}" "${worktreePath}"${startArg}`, {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000,
    });

    console.log(`[worktree-manager] Worktree created successfully`);

    return { worktreePath, branchName: finalBranch };
  }

  getDefaultBranch(projectPath: string): string | null {
    // Try common default branch names
    for (const candidate of ['main', 'master', 'develop']) {
      try {
        execSync(`git rev-parse --verify ${candidate}`, {
          cwd: projectPath,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 5000,
        });
        return candidate;
      } catch {
        // Branch doesn't exist
      }
    }
    return null;
  }

  isOnMainBranch(projectPath: string): boolean {
    const branch = this.getGitBranch(projectPath);
    if (!branch) return true;
    return ['main', 'master', 'develop'].includes(branch);
  }

  detachBranchToWorktree(projectPath: string): WorktreeResult {
    const currentBranch = this.getGitBranch(projectPath);
    if (!currentBranch) {
      throw new Error('Cannot determine current branch');
    }

    const defaultBranch = this.getDefaultBranch(projectPath);
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
    const stashResult = execSync('git stash push -u -m "claude-dashboard: detach branch"', {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 15000,
    }).trim();
    const hasStash = !stashResult.includes('No local changes');
    if (hasStash) {
      console.log(`[worktree-manager] Stashed local changes`);
    }

    // Step 2: Fetch origin and switch repo to default branch
    try {
      execSync('git fetch origin', {
        cwd: projectPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30000,
      });
    } catch {
      console.log(`[worktree-manager] Failed to fetch origin, continuing with local state`);
    }

    try {
      execSync(`git checkout "${defaultBranch}"`, {
        cwd: projectPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 15000,
      });
      // Pull latest changes on default branch
      try {
        execSync(`git pull --ff-only origin "${defaultBranch}"`, {
          cwd: projectPath,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 30000,
        });
        console.log(`[worktree-manager] Updated ${defaultBranch} to latest origin`);
      } catch {
        console.log(`[worktree-manager] Failed to pull ${defaultBranch}, continuing with local state`);
      }
    } catch (err) {
      // Restore stash if checkout fails
      if (hasStash) {
        execSync('git stash pop', {
          cwd: projectPath,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 15000,
        });
      }
      throw err;
    }

    // Step 3: Create worktree using the existing branch (no -b flag)
    try {
      execSync(`git worktree add "${worktreePath}" "${currentBranch}"`, {
        cwd: projectPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30000,
      });
    } catch (err) {
      // Rollback: go back to original branch and restore stash
      execSync(`git checkout "${currentBranch}"`, {
        cwd: projectPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 15000,
      });
      if (hasStash) {
        execSync('git stash pop', {
          cwd: projectPath,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 15000,
        });
      }
      throw err;
    }

    // Step 4: Restore stashed changes in the worktree
    if (hasStash) {
      try {
        execSync('git stash pop', {
          cwd: worktreePath,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
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

  removeWorktree(projectPath: string, worktreePath: string): void {
    const branchName = this.getBranchName(worktreePath);
    const dirExists = fs.existsSync(worktreePath);

    console.log(`[worktree-manager] Removing worktree at ${worktreePath} (dirExists=${dirExists})`);

    // Prune stale worktree references first so git doesn't choke on orphaned entries
    try {
      execSync('git worktree prune', {
        cwd: projectPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 5000,
      });
    } catch {
      // non-fatal
    }

    if (dirExists) {
      try {
        execSync(`git worktree remove --force "${worktreePath}"`, {
          cwd: projectPath,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
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
        execSync(`git branch -D "${branchName}"`, {
          cwd: projectPath,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
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

  getGitBranch(projectPath: string): string | null {
    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: projectPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 5000,
      }).trim();
      return branch || null;
    } catch {
      return null;
    }
  }

  private getBranchName(worktreePath: string): string | null {
    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: worktreePath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 5000,
      }).trim();
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
