import { Router } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { ConfigService } from './config.js';
import type { ProjectScanner } from './scanner.js';
import type { ProcessManager } from './process-manager.js';
import type { WorktreeManager } from './worktree-manager.js';

const execAsync = promisify(exec);

export function createRoutes(
  configService: ConfigService,
  scanner: ProjectScanner,
  processManager: ProcessManager,
  worktreeManager: WorktreeManager,
): Router {
  const router = Router();

  // Health
  router.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Config
  router.get('/api/config', async (_req, res) => {
    try {
      const config = await configService.get();
      res.json(config);
    } catch (err) {
      console.log('[routes] Error reading config:', err);
      res.status(500).json({ error: 'Failed to read config' });
    }
  });

  router.put('/api/config', async (req, res) => {
    try {
      const updated = await configService.save(req.body);
      res.json(updated);
    } catch (err) {
      console.log('[routes] Error saving config:', err);
      res.status(500).json({ error: 'Failed to save config' });
    }
  });

  // Projects
  router.get('/api/projects', async (_req, res) => {
    try {
      const projects = await scanner.scan();
      res.json(projects);
    } catch (err) {
      console.log('[routes] Error scanning projects:', err);
      res.status(500).json({ error: 'Failed to scan projects' });
    }
  });

  router.post('/api/projects/refresh', async (_req, res) => {
    try {
      const projects = await scanner.refresh();
      res.json(projects);
    } catch (err) {
      console.log('[routes] Error refreshing projects:', err);
      res.status(500).json({ error: 'Failed to refresh projects' });
    }
  });

  // Instances
  router.get('/api/instances', (_req, res) => {
    const instances = processManager.getAll();
    res.json(instances);
  });

  router.post('/api/instances', async (req, res) => {
    const { projectPath, taskDescription, detachBranch, branchPrefix } = req.body as {
      projectPath?: string;
      taskDescription?: string;
      detachBranch?: boolean;
      branchPrefix?: string;
    };
    if (!projectPath) {
      res.status(400).json({ error: 'projectPath is required' });
      return;
    }

    try {
      let worktreePath: string | undefined;
      let branchName: string | undefined;
      let parentProjectPath: string | undefined;

      if (detachBranch && await worktreeManager.isGitRepo(projectPath)) {
        // Detach current branch to a worktree and reset repo to default branch
        const result = await worktreeManager.detachBranchToWorktree(projectPath);
        worktreePath = result.worktreePath;
        branchName = result.branchName;
        parentProjectPath = projectPath;

        scanner.refresh().catch(err => {
          console.log('[routes] Background scanner refresh failed:', err);
        });
      } else if (taskDescription && await worktreeManager.isGitRepo(projectPath)) {
        const result = await worktreeManager.createWorktree(projectPath, taskDescription, branchPrefix);
        worktreePath = result.worktreePath;
        branchName = result.branchName;
        parentProjectPath = projectPath;

        // Fire-and-forget scanner refresh after worktree creation
        scanner.refresh().catch(err => {
          console.log('[routes] Background scanner refresh failed:', err);
        });
      } else if (worktreeManager.isWorktree(projectPath)) {
        // Launching a pre-existing worktree — populate worktree fields for context + cleanup
        worktreePath = projectPath;
        branchName = (await worktreeManager.getGitBranch(projectPath)) ?? undefined;
        parentProjectPath = worktreeManager.getParentProjectPath(projectPath) ?? undefined;
      } else if (await worktreeManager.isGitRepo(projectPath)) {
        // Launching directly on current branch — no worktree, just populate branch info
        branchName = (await worktreeManager.getGitBranch(projectPath)) ?? undefined;
      }

      const instance = await processManager.spawn({
        projectPath,
        taskDescription,
        worktreePath,
        parentProjectPath,
        branchName,
      });
      res.status(201).json(instance);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to spawn instance';
      console.log('[routes] Error spawning instance:', err);
      res.status(500).json({ error: message });
    }
  });

  router.delete('/api/instances/:id', async (req, res) => {
    const deleteWorktree = req.query.deleteWorktree === 'true';

    try {
      const instance = processManager.get(req.params.id);
      await processManager.kill(req.params.id);

      if (deleteWorktree && instance?.worktreePath && instance?.parentProjectPath) {
        try {
          await worktreeManager.removeWorktree(instance.parentProjectPath, instance.worktreePath);
          scanner.refresh().catch(err => {
            console.log('[routes] Background scanner refresh failed:', err);
          });
        } catch (err) {
          console.log('[routes] Worktree cleanup failed (non-fatal):', err);
        }
      }

      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to kill instance';
      console.log('[routes] Error killing instance:', err);
      res.status(404).json({ error: message });
    }
  });

  // Worktrees
  router.delete('/api/worktrees', async (req, res) => {
    const { projectPath, worktreePath } = req.body as { projectPath?: string; worktreePath?: string };
    if (!projectPath || !worktreePath) {
      res.status(400).json({ error: 'projectPath and worktreePath are required' });
      return;
    }

    try {
      // Kill any instance running on this worktree before removing it
      const runningInstance = processManager.getAll().find(i => i.worktreePath === worktreePath);
      if (runningInstance) {
        await processManager.kill(runningInstance.id);
      }

      await worktreeManager.removeWorktree(projectPath, worktreePath);
      scanner.refresh().catch(err => {
        console.log('[routes] Background scanner refresh failed:', err);
      });
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove worktree';
      console.log('[routes] Error removing worktree:', err);
      res.status(500).json({ error: message });
    }
  });

  // Git — branches
  router.get('/api/git/branches', async (req, res) => {
    const projectPath = req.query.path as string | undefined;
    if (!projectPath) {
      res.status(400).json({ error: 'path query parameter is required' });
      return;
    }
    try {
      const branches = await worktreeManager.listBranches(projectPath);
      res.json(branches);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list branches';
      console.log('[routes] Error listing branches:', err);
      res.status(500).json({ error: message });
    }
  });

  router.post('/api/git/branch-to-worktree', async (req, res) => {
    const { projectPath, branchName } = req.body as { projectPath?: string; branchName?: string };
    if (!projectPath || !branchName) {
      res.status(400).json({ error: 'projectPath and branchName are required' });
      return;
    }
    try {
      const result = await worktreeManager.branchToWorktree(projectPath, branchName);
      scanner.refresh().catch(err => {
        console.log('[routes] Background scanner refresh failed:', err);
      });
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create worktree';
      console.log('[routes] Error creating worktree from branch:', err);
      res.status(500).json({ error: message });
    }
  });

  // Git — checkout default branch
  router.post('/api/git/checkout-default', async (req, res) => {
    const { projectPath } = req.body as { projectPath?: string };
    if (!projectPath) {
      res.status(400).json({ error: 'projectPath is required' });
      return;
    }
    try {
      const result = await worktreeManager.checkoutDefaultBranch(projectPath);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Checkout failed';
      console.log('[routes] Error checking out default branch:', err);
      res.status(500).json({ error: message });
    }
  });

  // Git — pull / update
  router.post('/api/git/pull', async (req, res) => {
    const { projectPath } = req.body as { projectPath?: string };
    if (!projectPath) {
      res.status(400).json({ error: 'projectPath is required' });
      return;
    }
    try {
      const result = await worktreeManager.pullRepo(projectPath);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Pull failed';
      console.log('[routes] Error pulling repo:', err);
      res.status(500).json({ error: message });
    }
  });

  router.post('/api/git/pull-all', async (req, res) => {
    try {
      const projects = await scanner.scan();
      // Only pull non-worktree git projects
      const gitProjects = projects.filter(
        (p: { gitBranch: string | null; isWorktree: boolean }) => p.gitBranch !== null && !p.isWorktree,
      );
      const results = await Promise.all(
        gitProjects.map(async (project) => {
          const result = await worktreeManager.pullRepo(project.path);
          return { path: project.path, name: project.name, ...result };
        }),
      );
      res.json(results);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Pull all failed';
      console.log('[routes] Error pulling all repos:', err);
      res.status(500).json({ error: message });
    }
  });

  // Git — status and diffs
  router.get('/api/git/status', async (req, res) => {
    const projectPath = req.query.path as string | undefined;
    if (!projectPath) {
      res.status(400).json({ error: 'path query parameter is required' });
      return;
    }
    try {
      const files = await worktreeManager.getStatus(projectPath);
      res.json(files);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get git status';
      console.log('[routes] Error getting git status:', err);
      res.status(500).json({ error: message });
    }
  });

  router.get('/api/git/diff', async (req, res) => {
    const projectPath = req.query.path as string | undefined;
    const file = req.query.file as string | undefined;
    if (!projectPath) {
      res.status(400).json({ error: 'path query parameter is required' });
      return;
    }
    try {
      const diff = await worktreeManager.getWorkingDiff(projectPath, file);
      res.json({ diff });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get diff';
      console.log('[routes] Error getting diff:', err);
      res.status(500).json({ error: message });
    }
  });

  router.get('/api/git/branch-diff', async (req, res) => {
    const projectPath = req.query.path as string | undefined;
    const target = req.query.target as string | undefined;
    if (!projectPath) {
      res.status(400).json({ error: 'path query parameter is required' });
      return;
    }
    try {
      const result = await worktreeManager.getBranchDiff(projectPath, target);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get branch diff';
      console.log('[routes] Error getting branch diff:', err);
      res.status(500).json({ error: message });
    }
  });

  // Git — PR info
  router.get('/api/git/pr-url', async (req, res) => {
    const projectPath = req.query.path as string | undefined;
    if (!projectPath) {
      res.status(400).json({ error: 'path query parameter is required' });
      return;
    }
    try {
      const { stdout } = await execAsync('gh pr view --json url -q .url', {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 10000,
      });
      res.json({ url: stdout.trim() || null });
    } catch {
      // No PR exists for this branch
      res.json({ url: null });
    }
  });

  return router;
}
