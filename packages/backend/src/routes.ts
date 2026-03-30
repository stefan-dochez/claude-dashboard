import { Router } from 'express';
import type { ConfigService } from './config.js';
import type { ProjectScanner } from './scanner.js';
import type { ProcessManager } from './process-manager.js';
import type { WorktreeManager } from './worktree-manager.js';

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
    const { projectPath, taskDescription, detachBranch } = req.body as {
      projectPath?: string;
      taskDescription?: string;
      detachBranch?: boolean;
    };
    if (!projectPath) {
      res.status(400).json({ error: 'projectPath is required' });
      return;
    }

    try {
      let worktreePath: string | undefined;
      let branchName: string | undefined;
      let parentProjectPath: string | undefined;

      if (detachBranch && worktreeManager.isGitRepo(projectPath)) {
        // Detach current branch to a worktree and reset repo to default branch
        const result = worktreeManager.detachBranchToWorktree(projectPath);
        worktreePath = result.worktreePath;
        branchName = result.branchName;
        parentProjectPath = projectPath;

        scanner.refresh().catch(err => {
          console.log('[routes] Background scanner refresh failed:', err);
        });
      } else if (taskDescription && worktreeManager.isGitRepo(projectPath)) {
        const result = worktreeManager.createWorktree(projectPath, taskDescription);
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
        branchName = worktreeManager.getGitBranch(projectPath) ?? undefined;
        parentProjectPath = worktreeManager.getParentProjectPath(projectPath) ?? undefined;
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
          worktreeManager.removeWorktree(instance.parentProjectPath, instance.worktreePath);
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
      worktreeManager.removeWorktree(projectPath, worktreePath);
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

  return router;
}
