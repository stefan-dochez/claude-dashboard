import { Router } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { ConfigService } from './config.js';
import type { ProjectScanner } from './scanner.js';
import type { ProcessManager } from './process-manager.js';
import type { StreamProcessManager } from './stream-process.js';
import type { WorktreeManager } from './worktree-manager.js';
import type { TaskStore } from './task-store.js';

const execAsync = promisify(exec);

export function createRoutes(
  configService: ConfigService,
  scanner: ProjectScanner,
  processManager: ProcessManager,
  streamProcess: StreamProcessManager,
  worktreeManager: WorktreeManager,
  taskStore: TaskStore,
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

  // Instances — merges PTY and stream instances
  router.get('/api/instances', (_req, res) => {
    const ptyInstances = processManager.getAll().map(i => ({ ...i, mode: 'terminal' as const }));
    const streamInstances = streamProcess.getAll().map(i => ({ ...i, mode: 'chat' as const, pid: 0 }));
    res.json([...ptyInstances, ...streamInstances]);
  });

  router.post('/api/instances', async (req, res) => {
    const { projectPath, taskDescription, detachBranch, branchPrefix, mode, sessionId: resumeSessionId } = req.body as {
      projectPath?: string;
      taskDescription?: string;
      detachBranch?: boolean;
      branchPrefix?: string;
      mode?: 'terminal' | 'chat';
      sessionId?: string;
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

        scanner.refresh().catch(err => {
          console.log('[routes] Background scanner refresh failed:', err);
        });
      } else if (worktreeManager.isWorktree(projectPath)) {
        worktreePath = projectPath;
        branchName = (await worktreeManager.getGitBranch(projectPath)) ?? undefined;
        parentProjectPath = worktreeManager.getParentProjectPath(projectPath) ?? undefined;
      } else if (await worktreeManager.isGitRepo(projectPath)) {
        branchName = (await worktreeManager.getGitBranch(projectPath)) ?? undefined;
      }

      if (mode === 'chat') {
        // Stream/chat mode — uses Agent SDK
        const instance = await streamProcess.createInstance({
          projectPath,
          taskDescription,
          worktreePath,
          parentProjectPath,
          branchName,
          sessionId: resumeSessionId,
        });
        // Chat tasks are persisted when the SDK session initializes (stream-socket.ts)
        res.status(201).json({ ...instance, mode: 'chat', pid: 0 });
      } else {
        // Terminal mode — uses PTY
        const instance = await processManager.spawn({
          projectPath,
          taskDescription,
          worktreePath,
          parentProjectPath,
          branchName,
        });
        // Terminal sessions are not persisted to history
        res.status(201).json({ ...instance, mode: 'terminal' });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to spawn instance';
      console.log('[routes] Error spawning instance:', err);
      res.status(500).json({ error: message });
    }
  });

  // Chat messages
  router.get('/api/instances/:id/messages', (req, res) => {
    const messages = streamProcess.getMessages(req.params.id);
    res.json(messages);
  });

  router.post('/api/instances/:id/messages', async (req, res) => {
    const { prompt, model, permissionMode, effort } = req.body as {
      prompt?: string;
      model?: string;
      permissionMode?: string;
      effort?: string;
    };
    if (!prompt) {
      res.status(400).json({ error: 'prompt is required' });
      return;
    }
    try {
      await streamProcess.sendMessage(req.params.id, prompt, { model, permissionMode, effort });
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send message';
      res.status(500).json({ error: message });
    }
  });

  router.delete('/api/instances/:id', async (req, res) => {
    const deleteWorktree = req.query.deleteWorktree === 'true';
    const id = req.params.id;

    try {
      // Try PTY first, then stream
      const ptyInstance = processManager.get(id);
      const streamInstance = streamProcess.get(id);

      if (ptyInstance) {
        await processManager.kill(id);
        taskStore.endTask(id);
        if (deleteWorktree && ptyInstance.worktreePath && ptyInstance.parentProjectPath) {
          try {
            await worktreeManager.removeWorktree(ptyInstance.parentProjectPath, ptyInstance.worktreePath);
            scanner.refresh().catch(err => {
              console.log('[routes] Background scanner refresh failed:', err);
            });
          } catch (err) {
            console.log('[routes] Worktree cleanup failed (non-fatal):', err);
          }
        }
      } else if (streamInstance) {
        await streamProcess.kill(id);
        taskStore.endTask(id, {
          totalCostUsd: streamInstance.totalCostUsd,
          totalInputTokens: streamInstance.totalInputTokens,
          totalOutputTokens: streamInstance.totalOutputTokens,
        });
        if (deleteWorktree && streamInstance.worktreePath && streamInstance.parentProjectPath) {
          try {
            await worktreeManager.removeWorktree(streamInstance.parentProjectPath, streamInstance.worktreePath);
            scanner.refresh().catch(err => {
              console.log('[routes] Background scanner refresh failed:', err);
            });
          } catch (err) {
            console.log('[routes] Worktree cleanup failed (non-fatal):', err);
          }
        }
      } else {
        res.status(404).json({ error: `Instance ${id} not found` });
        return;
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

  // Task history
  router.get('/api/tasks/history', (_req, res) => {
    res.json(taskStore.getHistory());
  });

  router.delete('/api/tasks/:id', async (req, res) => {
    await taskStore.removeTask(req.params.id);
    res.json({ ok: true });
  });

  // Git — recent commits for context attachments
  router.get('/api/git/commits', async (req, res) => {
    const projectPath = req.query.path as string | undefined;
    const limit = parseInt(req.query.limit as string ?? '20', 10);
    if (!projectPath) {
      res.status(400).json({ error: 'path query parameter is required' });
      return;
    }
    try {
      const { stdout } = await execAsync(
        `git log --oneline -${limit} --format="%H|||%s|||%ar"`,
        { cwd: projectPath, encoding: 'utf-8', timeout: 5000 },
      );
      const commits = stdout.split('\n').filter(l => l.trim()).map(line => {
        const [hash, message, date] = line.split('|||');
        return { hash, message, date };
      });
      res.json(commits);
    } catch {
      res.json([]);
    }
  });

  // File explorer — search files by name
  router.get('/api/files/search', async (req, res) => {
    const dirPath = req.query.path as string | undefined;
    const query = req.query.q as string | undefined;
    if (!dirPath || !query) {
      res.status(400).json({ error: 'path and q query parameters are required' });
      return;
    }
    try {
      const { stdout } = await execAsync(
        `find . -maxdepth 8 -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -path '*/__pycache__/*' -iname '*${query.replace(/['"\\]/g, '')}*' | head -50`,
        { cwd: dirPath, encoding: 'utf-8', timeout: 5000 },
      );
      const files = stdout.split('\n').filter(f => f.trim()).map(f => {
        const relative = f.replace(/^\.\//, '');
        return { name: relative.split('/').pop() ?? relative, path: `${dirPath}/${relative}`, relative };
      });
      res.json(files);
    } catch {
      res.json([]);
    }
  });

  // File explorer — list directory contents
  router.get('/api/files', async (req, res) => {
    const dirPath = req.query.path as string | undefined;
    if (!dirPath) {
      res.status(400).json({ error: 'path query parameter is required' });
      return;
    }
    try {
      const fsPromises = await import('fs/promises');
      const pathMod = await import('path');
      const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
      const items = entries
        .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'dist' && e.name !== '__pycache__')
        .map(e => ({
          name: e.name,
          path: pathMod.join(dirPath, e.name),
          isDirectory: e.isDirectory(),
        }))
        .sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
      res.json(items);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list directory';
      res.status(500).json({ error: message });
    }
  });

  // File explorer — read file content
  router.get('/api/files/content', async (req, res) => {
    const filePath = req.query.path as string | undefined;
    if (!filePath) {
      res.status(400).json({ error: 'path query parameter is required' });
      return;
    }
    try {
      const fsPromises = await import('fs/promises');
      const stat = await fsPromises.stat(filePath);
      // Limit to 500KB
      if (stat.size > 500 * 1024) {
        res.json({ content: null, truncated: true, size: stat.size });
        return;
      }
      const content = await fsPromises.readFile(filePath, 'utf-8');
      res.json({ content, truncated: false, size: stat.size });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to read file';
      res.status(500).json({ error: message });
    }
  });

  // Instance context — CLAUDE.md + stats
  router.get('/api/instances/:id/context', async (req, res) => {
    const id = req.params.id;
    const ptyInstance = processManager.get(id);
    const streamInstance = streamProcess.get(id);
    const instance = ptyInstance ?? streamInstance;

    if (!instance) {
      res.status(404).json({ error: 'Instance not found' });
      return;
    }

    const cwd = instance.worktreePath ?? instance.projectPath;
    let claudeMd: string | null = null;

    try {
      const fsPromises = await import('fs/promises');
      const pathMod = await import('path');
      claudeMd = await fsPromises.readFile(pathMod.join(cwd, 'CLAUDE.md'), 'utf-8');
    } catch {
      // No CLAUDE.md
    }

    // Get git-modified files
    let modifiedFiles: string[] = [];
    try {
      const { stdout } = await execAsync('git diff --name-only HEAD 2>/dev/null; git diff --name-only --cached 2>/dev/null', {
        cwd,
        encoding: 'utf-8',
        timeout: 5000,
      });
      modifiedFiles = [...new Set(stdout.split('\n').filter(f => f.trim()))];
    } catch {
      // Not a git repo or no changes
    }

    const stats = streamInstance
      ? {
          totalCostUsd: streamInstance.totalCostUsd,
          totalInputTokens: streamInstance.totalInputTokens,
          totalOutputTokens: streamInstance.totalOutputTokens,
          sessionId: streamInstance.sessionId,
          model: streamInstance.model,
        }
      : null;

    res.json({
      claudeMd,
      modifiedFiles,
      stats,
      projectPath: instance.projectPath,
      worktreePath: instance.worktreePath,
      branchName: instance.branchName,
    });
  });

  return router;
}
