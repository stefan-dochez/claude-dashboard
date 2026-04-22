import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import type { ConfigService } from './config.js';
import type { PromptTemplate } from './config.js';
import type { ProjectScanner } from './scanner.js';
import type { ProcessManager } from './process-manager.js';
import type { StreamProcessManager } from './stream-process.js';
import type { WorktreeManager } from './worktree-manager.js';
import type { TaskStore } from './task-store.js';
import type { IdeService, IdeType } from './ide-service.js';
import type { PrAggregator } from './pr-aggregator.js';
import type { CiStatusService } from './ci-status.js';
import type { UpdateChecker } from './update-checker.js';
import type { PluginsManager } from './plugins-manager.js';
import { readChangelogSince } from './changelog-reader.js';
import { runHealthCheck } from './health.js';
import { TIMEOUTS, LIMITS } from './constants.js';
import { createLogger } from './logger.js';

const log = createLogger('routes');
const execAsync = promisify(exec);

/**
 * Wraps an async route handler so that thrown errors are caught and returned
 * as a JSON error response, eliminating ~30 identical try/catch blocks.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asyncHandler(fn: (req: any, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Internal server error';
      log.error(`${req.method} ${req.path}:`, err);
      res.status(500).json({ error: message });
    });
  };
}

/** Trigger a background scanner refresh without blocking the response. */
function refreshProjectsInBackground(scanner: ProjectScanner): void {
  scanner.refresh().catch(err => {
    log.warn('Background scanner refresh failed:', err);
  });
}

/**
 * Validate that a file path is contained within one of the allowed project paths.
 * Prevents path traversal attacks on file-serving endpoints.
 */
function isPathAllowed(filePath: string, allowedRoots: string[]): boolean {
  const resolved = path.resolve(filePath);
  return allowedRoots.some(root => resolved.startsWith(path.resolve(root)));
}

export function createRoutes(
  configService: ConfigService,
  scanner: ProjectScanner,
  processManager: ProcessManager,
  streamProcess: StreamProcessManager,
  worktreeManager: WorktreeManager,
  taskStore: TaskStore,
  appVersion: string,
  ideService: IdeService,
  prAggregator: PrAggregator,
  ciStatusService: CiStatusService,
  updateChecker: UpdateChecker,
  pluginsManager: PluginsManager,
): Router {
  const router = Router();

  // Health check — dependency status
  router.get('/api/health', asyncHandler(async (_req, res) => {
    const report = await runHealthCheck();
    res.json(report);
  }));

  // Version — read from backend package.json at startup
  router.get('/api/version', (_req, res) => {
    res.json({ version: appVersion });
  });

  // Update check — GitHub latest release, cached ~6h
  router.get('/api/update-check', asyncHandler(async (req, res) => {
    const force = req.query.refresh === 'true';
    const result = await updateChecker.check(force);
    res.json(result);
  }));

  // Changelog entries in the range (since, currentVersion]. If `since` is
  // omitted, returns only the entry for the current version. Each entry is
  // enriched with the GitHub release URL for its tag.
  router.get('/api/changelog', asyncHandler(async (req, res) => {
    const since = typeof req.query.since === 'string' && req.query.since.length > 0
      ? req.query.since
      : null;
    const entries = await readChangelogSince(since, appVersion);
    const repo = updateChecker.getRepo();
    const enriched = entries.map(e => ({
      ...e,
      releaseUrl: `https://github.com/${repo}/releases/tag/v${e.version}`,
    }));
    res.json({ currentVersion: appVersion, entries: enriched });
  }));


  // Platform info — used by the frontend for cross-platform path display
  router.get('/api/platform', (_req, res) => {
    res.json({ homePath: os.homedir(), platform: process.platform });
  });

  // IDE — detect installed IDEs
  router.get('/api/ide/detect', asyncHandler(async (_req, res) => {
    const ides = await ideService.detect();
    res.json(ides);
  }));

  // IDE — open project in IDE (auto-detects best IDE if not specified)
  router.post('/api/ide/open', asyncHandler(async (req, res) => {
    const { projectPath, ide } = req.body as { projectPath?: string; ide?: string };
    if (!projectPath) {
      res.status(400).json({ error: 'projectPath is required' });
      return;
    }
    const result = await ideService.open(projectPath, ide as IdeType | undefined);
    res.json({ ok: true, ide: result.ide });
  }));

  // Config
  router.get('/api/config', asyncHandler(async (_req, res) => {
    const config = await configService.get();
    res.json(config);
  }));

  router.put('/api/config', asyncHandler(async (req, res) => {
    const updated = await configService.save(req.body);
    res.json(updated);
  }));

  // Plugins — wraps the `claude plugin` CLI
  router.get('/api/plugins', asyncHandler(async (_req, res) => {
    const data = await pluginsManager.listAll();
    res.json(data);
  }));

  router.post('/api/plugins/marketplaces', asyncHandler(async (req, res) => {
    const { source } = req.body as { source?: string };
    if (!source) {
      res.status(400).json({ error: 'source is required' });
      return;
    }
    await pluginsManager.addMarketplace(source);
    res.json({ ok: true });
  }));

  router.delete('/api/plugins/marketplaces/:name', asyncHandler(async (req, res) => {
    await pluginsManager.removeMarketplace(req.params.name);
    res.json({ ok: true });
  }));

  router.post('/api/plugins/marketplaces/update', asyncHandler(async (req, res) => {
    const { name } = req.body as { name?: string };
    await pluginsManager.updateMarketplaces(name);
    res.json({ ok: true });
  }));

  router.post('/api/plugins/install', asyncHandler(async (req, res) => {
    const { pluginId } = req.body as { pluginId?: string };
    if (!pluginId) {
      res.status(400).json({ error: 'pluginId is required' });
      return;
    }
    await pluginsManager.installPlugin(pluginId);
    res.json({ ok: true });
  }));

  router.post('/api/plugins/update', asyncHandler(async (req, res) => {
    const { pluginId } = req.body as { pluginId?: string };
    if (!pluginId) {
      res.status(400).json({ error: 'pluginId is required' });
      return;
    }
    await pluginsManager.updatePlugin(pluginId);
    res.json({ ok: true });
  }));

  router.post('/api/plugins/enable', asyncHandler(async (req, res) => {
    const { pluginId } = req.body as { pluginId?: string };
    if (!pluginId) {
      res.status(400).json({ error: 'pluginId is required' });
      return;
    }
    await pluginsManager.enablePlugin(pluginId);
    res.json({ ok: true });
  }));

  router.post('/api/plugins/disable', asyncHandler(async (req, res) => {
    const { pluginId } = req.body as { pluginId?: string };
    if (!pluginId) {
      res.status(400).json({ error: 'pluginId is required' });
      return;
    }
    await pluginsManager.disablePlugin(pluginId);
    res.json({ ok: true });
  }));

  router.delete('/api/plugins/:pluginId', asyncHandler(async (req, res) => {
    await pluginsManager.uninstallPlugin(req.params.pluginId);
    res.json({ ok: true });
  }));

  router.get('/api/plugins/readme', asyncHandler(async (req, res) => {
    const installPath = req.query.installPath as string | undefined;
    if (!installPath) {
      res.status(400).json({ error: 'installPath is required' });
      return;
    }
    const { content, filename } = await pluginsManager.getPluginReadme(installPath);
    res.json({ content, filename });
  }));

  // Projects
  router.get('/api/projects', asyncHandler(async (_req, res) => {
    const projects = await scanner.scan();
    res.json(projects);
  }));

  router.post('/api/projects/refresh', asyncHandler(async (_req, res) => {
    const projects = await scanner.refresh();
    res.json(projects);
  }));

  // Instances — merges PTY and stream instances
  router.get('/api/instances', (_req, res) => {
    const ptyInstances = processManager.getAll().map(i => ({ ...i, mode: 'terminal' as const }));
    const streamInstances = streamProcess.getAll().map(i => ({ ...i, mode: 'chat' as const, pid: 0 }));
    res.json([...ptyInstances, ...streamInstances]);
  });

  router.post('/api/instances', asyncHandler(async (req, res) => {
    const { projectPath, taskDescription, detachBranch, branchPrefix, startPoint, mode, sessionId: resumeSessionId } = req.body as {
      projectPath?: string;
      taskDescription?: string;
      detachBranch?: boolean;
      branchPrefix?: string;
      startPoint?: string;
      mode?: 'terminal' | 'chat';
      sessionId?: string;
    };
    if (!projectPath) {
      res.status(400).json({ error: 'projectPath is required' });
      return;
    }

    // Verify the target directory exists (worktree may have been deleted)
    const fsPromises = await import('fs/promises');
    try {
      await fsPromises.access(projectPath);
    } catch {
      res.status(404).json({ error: `Directory not found: ${projectPath}` });
      return;
    }

    let worktreePath: string | undefined;
    let branchName: string | undefined;
    let parentProjectPath: string | undefined;

    if (detachBranch && await worktreeManager.isGitRepo(projectPath)) {
      const result = await worktreeManager.detachBranchToWorktree(projectPath);
      worktreePath = result.worktreePath;
      branchName = result.branchName;
      parentProjectPath = projectPath;
      refreshProjectsInBackground(scanner);
    } else if (taskDescription && await worktreeManager.isGitRepo(projectPath)) {
      const result = await worktreeManager.createWorktree(projectPath, taskDescription, branchPrefix, startPoint);
      worktreePath = result.worktreePath;
      branchName = result.branchName;
      parentProjectPath = projectPath;
      refreshProjectsInBackground(scanner);
    } else if (worktreeManager.isWorktree(projectPath)) {
      worktreePath = projectPath;
      branchName = (await worktreeManager.getGitBranch(projectPath)) ?? undefined;
      parentProjectPath = worktreeManager.getParentProjectPath(projectPath) ?? undefined;
    } else if (await worktreeManager.isGitRepo(projectPath)) {
      branchName = (await worktreeManager.getGitBranch(projectPath)) ?? undefined;
    }

    if (mode === 'chat') {
      const instance = await streamProcess.createInstance({
        projectPath,
        taskDescription,
        worktreePath,
        parentProjectPath,
        branchName,
        sessionId: resumeSessionId,
      });
      res.status(201).json({ ...instance, mode: 'chat', pid: 0 });
    } else {
      const instance = await processManager.spawn({
        projectPath,
        taskDescription,
        worktreePath,
        parentProjectPath,
        branchName,
        resumeSessionId,
      });
      const existingTask = resumeSessionId ? taskStore.findBySessionId(resumeSessionId) : undefined;
      taskStore.addTask({
        id: instance.id,
        projectPath: instance.projectPath,
        projectName: instance.projectName,
        worktreePath: instance.worktreePath,
        branchName: instance.branchName,
        taskDescription: instance.taskDescription,
        sessionId: instance.sessionId,
        model: null,
        totalCostUsd: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        mode: 'terminal',
        firstPrompt: existingTask?.firstPrompt ?? null,
        title: existingTask?.title ?? null,
        createdAt: instance.createdAt.toISOString(),
        endedAt: null,
      });
      res.status(201).json({ ...instance, mode: 'terminal' });
    }
  }));

  // Chat messages
  router.get('/api/instances/:id/messages', (req, res) => {
    const messages = streamProcess.getMessages(req.params.id);
    res.json(messages);
  });

  router.post('/api/instances/:id/messages', asyncHandler(async (req, res) => {
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
    await streamProcess.sendMessage(req.params.id, prompt, { model, permissionMode, effort });
    res.json({ ok: true });
  }));

  router.delete('/api/instances/:id', asyncHandler(async (req, res) => {
    const deleteWt = req.query.deleteWorktree === 'true';
    const id = req.params.id;

    const ptyInstance = processManager.get(id);
    const streamInstance = streamProcess.get(id);

    if (ptyInstance) {
      await processManager.kill(id);
      taskStore.endTask(id);
      if (deleteWt && ptyInstance.worktreePath && ptyInstance.parentProjectPath) {
        try {
          await worktreeManager.removeWorktree(ptyInstance.parentProjectPath, ptyInstance.worktreePath);
          refreshProjectsInBackground(scanner);
        } catch (err) {
          log.warn('Worktree cleanup failed (non-fatal):', err);
        }
      }
    } else if (streamInstance) {
      await streamProcess.kill(id);
      taskStore.endTask(id, {
        totalCostUsd: streamInstance.totalCostUsd,
        totalInputTokens: streamInstance.totalInputTokens,
        totalOutputTokens: streamInstance.totalOutputTokens,
      });
      if (deleteWt && streamInstance.worktreePath && streamInstance.parentProjectPath) {
        try {
          await worktreeManager.removeWorktree(streamInstance.parentProjectPath, streamInstance.worktreePath);
          refreshProjectsInBackground(scanner);
        } catch (err) {
          log.warn('Worktree cleanup failed (non-fatal):', err);
        }
      }
    } else {
      res.status(404).json({ error: `Instance ${id} not found` });
      return;
    }

    res.json({ ok: true });
  }));

  // Export terminal session as plain text
  const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][0-9A-Za-z]|\x1b[=>NOM78cDHZ#]|\x1b\[[?]?[0-9;]*[hlsr]/g;

  router.get('/api/instances/:id/export', (req, res) => {
    const { id } = req.params;
    const format = (req.query.format as string) || 'txt';

    const instance = processManager.get(id);
    if (!instance) {
      res.status(404).json({ error: `Instance ${id} not found` });
      return;
    }

    const rawBuffer = processManager.getBuffer(id);
    const cleanText = rawBuffer.replace(ANSI_RE, '');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeName = instance.projectName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${safeName}_${timestamp}.${format}`;

    res.setHeader('Content-Type', format === 'md' ? 'text/markdown' : 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(cleanText);
  });

  // Worktrees
  router.delete('/api/worktrees', asyncHandler(async (req, res) => {
    const { projectPath, worktreePath } = req.body as { projectPath?: string; worktreePath?: string };
    if (!projectPath || !worktreePath) {
      res.status(400).json({ error: 'projectPath and worktreePath are required' });
      return;
    }

    const runningInstance = processManager.getAll().find(i => i.worktreePath === worktreePath);
    if (runningInstance) {
      await processManager.kill(runningInstance.id);
    }

    await worktreeManager.removeWorktree(projectPath, worktreePath);
    refreshProjectsInBackground(scanner);
    res.json({ ok: true });
  }));

  // Git — branches
  router.get('/api/git/branches', asyncHandler(async (req, res) => {
    const projectPath = req.query.path as string | undefined;
    if (!projectPath) {
      res.status(400).json({ error: 'path query parameter is required' });
      return;
    }
    const branches = await worktreeManager.listBranches(projectPath);
    res.json(branches);
  }));

  router.get('/api/git/start-points', asyncHandler(async (req, res) => {
    const projectPath = req.query.path as string | undefined;
    if (!projectPath) {
      res.status(400).json({ error: 'path query parameter is required' });
      return;
    }
    const startPoints = await worktreeManager.listStartPoints(projectPath);
    res.json(startPoints);
  }));

  router.post('/api/git/branch-to-worktree', asyncHandler(async (req, res) => {
    const { projectPath, branchName } = req.body as { projectPath?: string; branchName?: string };
    if (!projectPath || !branchName) {
      res.status(400).json({ error: 'projectPath and branchName are required' });
      return;
    }
    const result = await worktreeManager.branchToWorktree(projectPath, branchName);
    refreshProjectsInBackground(scanner);
    res.json(result);
  }));

  // Git — checkout default branch
  router.post('/api/git/checkout-default', asyncHandler(async (req, res) => {
    const { projectPath } = req.body as { projectPath?: string };
    if (!projectPath) {
      res.status(400).json({ error: 'projectPath is required' });
      return;
    }
    const result = await worktreeManager.checkoutDefaultBranch(projectPath);
    res.json(result);
  }));

  // Git — pull / update
  router.post('/api/git/pull', asyncHandler(async (req, res) => {
    const { projectPath } = req.body as { projectPath?: string };
    if (!projectPath) {
      res.status(400).json({ error: 'projectPath is required' });
      return;
    }
    const result = await worktreeManager.pullRepo(projectPath);
    res.json(result);
  }));

  router.post('/api/git/pull-all', asyncHandler(async (_req, res) => {
    const projects = await scanner.scan();
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
  }));

  // Git — status and diffs
  router.get('/api/git/status', asyncHandler(async (req, res) => {
    const projectPath = req.query.path as string | undefined;
    if (!projectPath) {
      res.status(400).json({ error: 'path query parameter is required' });
      return;
    }
    const files = await worktreeManager.getStatus(projectPath);
    res.json(files);
  }));

  router.get('/api/git/diff', asyncHandler(async (req, res) => {
    const projectPath = req.query.path as string | undefined;
    const file = req.query.file as string | undefined;
    if (!projectPath) {
      res.status(400).json({ error: 'path query parameter is required' });
      return;
    }
    const diff = await worktreeManager.getWorkingDiff(projectPath, file);
    res.json({ diff });
  }));

  router.get('/api/git/branch-diff', asyncHandler(async (req, res) => {
    const projectPath = req.query.path as string | undefined;
    const target = req.query.target as string | undefined;
    if (!projectPath) {
      res.status(400).json({ error: 'path query parameter is required' });
      return;
    }
    const result = await worktreeManager.getBranchDiff(projectPath, target);
    res.json(result);
  }));

  // Git — PR counts for all projects (batched)
  router.post('/api/git/pr-counts', asyncHandler(async (req, res) => {
    const { projects } = req.body as {
      projects: Array<{ path: string; type: string }>;
    };
    if (!projects || !Array.isArray(projects)) {
      res.status(400).json({ error: 'projects array is required' });
      return;
    }
    // Validate all paths are within allowed scan paths
    const config = await configService.get();
    const roots = config.scanPaths ?? [];
    const safeProjects = projects.filter(p =>
      typeof p.path === 'string' && typeof p.type === 'string' && isPathAllowed(p.path, roots),
    );
    const counts = await prAggregator.getPrCounts(safeProjects);
    res.json(counts);
  }));

  // Git — CI status (latest workflow run per branch) for a batch of (path, branch) pairs.
  // Used by the sidebar to badge instance + worktree rows with their CI state.
  router.post('/api/git/ci-status', asyncHandler(async (req, res) => {
    const { projects } = req.body as {
      projects: Array<{ path: string; branch: string | null }>;
    };
    if (!projects || !Array.isArray(projects)) {
      res.status(400).json({ error: 'projects array is required' });
      return;
    }
    const config = await configService.get();
    const roots = config.scanPaths ?? [];
    const safe = projects.filter(p =>
      typeof p.path === 'string' && isPathAllowed(p.path, roots),
    );
    const runs = await ciStatusService.getLatestRunsBatch(safe);
    res.json(runs);
  }));

  // Git — Check runs for a specific commit (used by the PR view)
  router.get('/api/git/checks', asyncHandler(async (req, res) => {
    const projectPath = req.query.path as string | undefined;
    const sha = req.query.sha as string | undefined;
    if (!projectPath || !sha) {
      res.status(400).json({ error: 'path and sha query parameters are required' });
      return;
    }
    const config = await configService.get();
    const roots = config.scanPaths ?? [];
    if (!isPathAllowed(projectPath, roots)) {
      res.status(403).json({ error: 'Access denied: path outside allowed scan paths' });
      return;
    }
    const checks = await ciStatusService.getChecksForCommit(projectPath, sha);
    res.json(checks);
  }));

  // Git — Aggregated PRs for workspace/monorepo
  router.get('/api/git/prs', asyncHandler(async (req, res) => {
    const projectPath = req.query.path as string | undefined;
    const forceRefresh = req.query.refresh === 'true';
    if (!projectPath) {
      res.status(400).json({ error: 'path query parameter is required' });
      return;
    }
    const prs = await prAggregator.getPrs(projectPath, forceRefresh);
    res.json(prs);
  }));

  // Git — Authenticated GitHub username
  router.get('/api/git/github-user', asyncHandler(async (_req, res) => {
    const login = await prAggregator.getGitHubUser();
    res.json({ login });
  }));

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
        timeout: TIMEOUTS.GH_CLI,
      });
      res.json({ url: stdout.trim() || null });
    } catch {
      res.json({ url: null });
    }
  });

  // Git — commit
  router.post('/api/git/commit', async (req, res) => {
    const { projectPath, message, addAll } = req.body as {
      projectPath?: string;
      message?: string;
      addAll?: boolean;
    };
    if (!projectPath || !message) {
      res.status(400).json({ error: 'projectPath and message are required' });
      return;
    }
    try {
      if (addAll) {
        await execAsync('git add -A', { cwd: projectPath, encoding: 'utf-8', timeout: TIMEOUTS.GIT_ADD });
      }
      await execAsync(`git commit -m ${JSON.stringify(message)}`, { cwd: projectPath, encoding: 'utf-8', timeout: TIMEOUTS.GIT_COMMIT });
      res.json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Commit failed';
      log.error('Error committing:', msg);
      res.status(500).json({ error: msg.includes('stdout') ? 'Nothing to commit' : msg.split('\n')[0] });
    }
  });

  // Git — push
  router.post('/api/git/push', async (req, res) => {
    const { projectPath, setUpstream } = req.body as { projectPath?: string; setUpstream?: boolean };
    if (!projectPath) {
      res.status(400).json({ error: 'projectPath is required' });
      return;
    }
    try {
      const branch = await worktreeManager.getGitBranch(projectPath);
      const pushCmd = setUpstream && branch
        ? `git push --set-upstream origin ${JSON.stringify(branch)}`
        : 'git push';
      await execAsync(pushCmd, { cwd: projectPath, encoding: 'utf-8', timeout: TIMEOUTS.GIT_PUSH });
      res.json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Push failed';
      log.error('Error pushing:', msg);
      const needsUpstream = msg.includes('no upstream branch') || msg.includes('--set-upstream');
      res.status(500).json({ error: msg.split('\n')[0], needsUpstream });
    }
  });

  // Git — create PR via GitHub CLI
  router.post('/api/git/create-pr', async (req, res) => {
    const { projectPath, title, body } = req.body as { projectPath?: string; title?: string; body?: string };
    if (!projectPath || !title) {
      res.status(400).json({ error: 'projectPath and title are required' });
      return;
    }
    try {
      const bodyArg = body ? `--body ${JSON.stringify(body)}` : '--body ""';
      const { stdout } = await execAsync(
        `gh pr create --title ${JSON.stringify(title)} ${bodyArg}`,
        { cwd: projectPath, encoding: 'utf-8', timeout: TIMEOUTS.GIT_COMMIT },
      );
      const url = stdout.trim().split('\n').pop() ?? '';
      res.json({ ok: true, url });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'PR creation failed';
      log.error('Error creating PR:', msg);
      res.status(500).json({ error: msg.split('\n')[0] });
    }
  });

  // Prompt templates — CRUD
  router.get('/api/prompt-templates', asyncHandler(async (req, res) => {
    const config = await configService.get();
    const projectPath = req.query.projectPath as string | undefined;
    let templates = config.promptTemplates ?? [];
    if (projectPath) {
      templates = templates.filter(t => t.scope === 'global' || t.projectPath === projectPath);
    }
    // Sort by usageCount desc (most used first)
    templates.sort((a, b) => (b.usageCount ?? 0) - (a.usageCount ?? 0));
    res.json(templates);
  }));

  router.post('/api/prompt-templates', asyncHandler(async (req, res) => {
    const { name, description, content, variables, tags, scope, projectPath: templateProjectPath } = req.body as {
      name?: string;
      description?: string;
      content?: string;
      variables?: PromptTemplate['variables'];
      tags?: string[];
      scope?: 'global' | 'project';
      projectPath?: string;
    };
    if (!name || !content) {
      res.status(400).json({ error: 'name and content are required' });
      return;
    }
    const now = new Date().toISOString();
    const template: PromptTemplate = {
      id: crypto.randomUUID(),
      name,
      description: description ?? '',
      content,
      variables: variables ?? [],
      tags: tags ?? [],
      scope: scope ?? 'global',
      projectPath: scope === 'project' ? templateProjectPath : undefined,
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    const config = await configService.get();
    const templates = [...(config.promptTemplates ?? []), template];
    await configService.save({ promptTemplates: templates });
    res.status(201).json(template);
  }));

  router.put('/api/prompt-templates/:id', asyncHandler(async (req, res) => {
    const id = req.params.id;
    const config = await configService.get();
    const templates = [...(config.promptTemplates ?? [])];
    const idx = templates.findIndex(t => t.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    const updates = req.body as Partial<PromptTemplate>;
    templates[idx] = { ...templates[idx], ...updates, id, updatedAt: new Date().toISOString() };
    await configService.save({ promptTemplates: templates });
    res.json(templates[idx]);
  }));

  router.delete('/api/prompt-templates/:id', asyncHandler(async (req, res) => {
    const id = req.params.id;
    const config = await configService.get();
    const templates = (config.promptTemplates ?? []).filter(t => t.id !== id);
    await configService.save({ promptTemplates: templates });
    res.json({ ok: true });
  }));

  // Bump usage count
  router.post('/api/prompt-templates/:id/use', asyncHandler(async (req, res) => {
    const id = req.params.id;
    const config = await configService.get();
    const templates = [...(config.promptTemplates ?? [])];
    const idx = templates.findIndex(t => t.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    templates[idx] = { ...templates[idx], usageCount: (templates[idx].usageCount ?? 0) + 1 };
    await configService.save({ promptTemplates: templates });
    res.json(templates[idx]);
  }));

  // Import/export templates
  router.post('/api/prompt-templates/import', asyncHandler(async (req, res) => {
    const { templates: imported } = req.body as { templates?: PromptTemplate[] };
    if (!Array.isArray(imported)) {
      res.status(400).json({ error: 'templates array is required' });
      return;
    }
    const config = await configService.get();
    const existing = config.promptTemplates ?? [];
    const existingIds = new Set(existing.map(t => t.id));
    const now = new Date().toISOString();
    const newTemplates = imported.map(t => ({
      ...t,
      id: existingIds.has(t.id) ? crypto.randomUUID() : t.id,
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    }));
    await configService.save({ promptTemplates: [...existing, ...newTemplates] });
    res.json({ imported: newTemplates.length });
  }));

  router.get('/api/prompt-templates/export', asyncHandler(async (_req, res) => {
    const config = await configService.get();
    const templates = (config.promptTemplates ?? []).map(({ usageCount, ...rest }) => ({
      ...rest,
      usageCount: 0,
    }));
    res.json({ templates });
  }));

  // Skills — scan .claude/skills/ for slash command definitions (project + global)
  router.get('/api/skills', asyncHandler(async (req, res) => {
    const projectPath = req.query.path as string | undefined;
    if (!projectPath) {
      res.status(400).json({ error: 'path query parameter is required' });
      return;
    }
    const fsPromises = await import('fs/promises');
    const skills: Array<{ name: string; description: string; scope: 'project' | 'global' }> = [];
    const seen = new Set<string>();

    async function parseFrontmatter(filePath: string, fallbackName?: string): Promise<{ name: string; description: string } | null> {
      try {
        const content = await fsPromises.readFile(filePath, 'utf-8');
        const match = content.match(/^---\n([\s\S]*?)\n---/);
        if (!match) return null;
        const fm = match[1];
        const nameMatch = fm.match(/^name:\s*(.+)$/m);
        // Handle both single-line and multiline YAML descriptions
        let description = '';
        const descSingleLine = fm.match(/^description:\s*"([^"]+)"/m) ?? fm.match(/^description:\s+([^\n>|]+)$/m);
        if (descSingleLine) {
          description = descSingleLine[1].trim();
        } else {
          // Multiline: description: > or description: |
          const descMultiLine = fm.match(/^description:\s*[>|]\n([\s\S]*?)(?=\n\w|\n---|\n$)/m);
          if (descMultiLine) {
            description = descMultiLine[1].replace(/\n\s*/g, ' ').trim();
          }
        }
        const name = nameMatch
          ? nameMatch[1].trim().replace(/^"|"$/g, '')
          : fallbackName ?? null;
        if (!name) return null;
        return { name, description };
      } catch {
        return null;
      }
    }

    // Project skills: .claude/skills/*.md (flat files)
    const projectSkillsDir = path.join(projectPath, '.claude', 'skills');
    try {
      const entries = await fsPromises.readdir(projectSkillsDir);
      for (const entry of entries) {
        if (!entry.endsWith('.md')) continue;
        const parsed = await parseFrontmatter(path.join(projectSkillsDir, entry));
        if (parsed && !seen.has(parsed.name)) {
          seen.add(parsed.name);
          skills.push({ ...parsed, scope: 'project' });
        }
      }
    } catch { /* no project skills */ }

    // Global skills: ~/.claude/skills/<name>/SKILL.md (subdirectories)
    const globalSkillsDir = path.join(os.homedir(), '.claude', 'skills');
    try {
      const entries = await fsPromises.readdir(globalSkillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const parsed = await parseFrontmatter(path.join(globalSkillsDir, entry.name, 'SKILL.md'), entry.name);
        if (parsed && !seen.has(parsed.name)) {
          seen.add(parsed.name);
          skills.push({ ...parsed, scope: 'global' });
        }
      }
    } catch { /* no global skills */ }

    // Marketplace plugins: ~/.claude/plugins/marketplaces/**/skills/*/SKILL.md
    // Derives plugin prefix from path: .../plugins/<parts>/skills/<skill>/SKILL.md
    const marketplacesDir = path.join(os.homedir(), '.claude', 'plugins', 'marketplaces');
    function derivePluginPrefix(skillFilePath: string): string | null {
      const rel = path.relative(marketplacesDir, skillFilePath);
      const parts = rel.split(path.sep);
      // Find "plugins" and "skills" indices to extract plugin name segments
      const pluginsIdx = parts.indexOf('plugins');
      const skillsIdx = parts.indexOf('skills');
      if (pluginsIdx < 0 || skillsIdx < 0 || skillsIdx <= pluginsIdx + 1) return null;
      const pluginParts = parts.slice(pluginsIdx + 1, skillsIdx)
        .filter(p => !/^\d+\.\d+\.\d+$/.test(p)); // exclude version segments
      return pluginParts.join('-') || null;
    }

    async function scanMarketplaceSkills(dir: string): Promise<void> {
      try {
        const entries = await fsPromises.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            const skillFile = path.join(fullPath, 'SKILL.md');
            const parsed = await parseFrontmatter(skillFile, entry.name);
            if (parsed) {
              const prefix = derivePluginPrefix(skillFile);
              const qualifiedName = prefix && !parsed.name.startsWith(prefix)
                ? `${prefix}:${parsed.name}`
                : parsed.name;
              if (!seen.has(qualifiedName)) {
                seen.add(qualifiedName);
                skills.push({ name: qualifiedName, description: parsed.description, scope: 'global' });
              }
            }
            if (fullPath.split(path.sep).length - marketplacesDir.split(path.sep).length < 8) {
              await scanMarketplaceSkills(fullPath);
            }
          }
        }
      } catch { /* skip unreadable */ }
    }
    await scanMarketplaceSkills(marketplacesDir);

    // Filter out example/demo plugins
    const filtered = skills.filter(s => !s.name.startsWith('example-'));
    res.json(filtered);
  }));

  // Task history
  router.get('/api/tasks/history', (req, res) => {
    const limit = parseInt(req.query.limit as string ?? '50', 10);
    res.json(taskStore.getHistory(Math.min(limit, 500)));
  });

  router.delete('/api/tasks/:id', async (req, res) => {
    await taskStore.removeTask(req.params.id);
    res.json({ ok: true });
  });

  // Git — recent commits for context attachments
  router.get('/api/git/commits', async (req, res) => {
    const projectPath = req.query.path as string | undefined;
    const limit = parseInt(req.query.limit as string ?? String(LIMITS.GIT_LOG_LIMIT), 10);
    if (!projectPath) {
      res.status(400).json({ error: 'path query parameter is required' });
      return;
    }
    try {
      const { stdout } = await execAsync(
        `git log --oneline -${limit} --format="%H|||%s|||%ar"`,
        { cwd: projectPath, encoding: 'utf-8', timeout: TIMEOUTS.GIT_SHORT },
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

  // Helper: get allowed project roots for path validation
  const getAllowedRoots = async (): Promise<string[]> => {
    const config = await configService.get();
    return config.scanPaths ?? [];
  };

  // File explorer — search files by name
  router.get('/api/files/search', async (req, res) => {
    const dirPath = req.query.path as string | undefined;
    const query = req.query.q as string | undefined;
    if (!dirPath || !query) {
      res.status(400).json({ error: 'path and q query parameters are required' });
      return;
    }
    const roots = await getAllowedRoots();
    if (!isPathAllowed(dirPath, roots)) {
      res.status(403).json({ error: 'Access denied: path outside allowed scan paths' });
      return;
    }
    try {
      const { stdout } = await execAsync(
        `find . -maxdepth ${LIMITS.FILE_SEARCH_DEPTH} -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -path '*/__pycache__/*' -iname '*${query.replace(/['"\\]/g, '')}*' | head -${LIMITS.FILE_SEARCH_RESULTS}`,
        { cwd: dirPath, encoding: 'utf-8', timeout: TIMEOUTS.SHELL_SEARCH },
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

  // Code search — search file contents with grep
  router.get('/api/code/search', async (req, res) => {
    const dirPath = req.query.path as string | undefined;
    const query = req.query.q as string | undefined;
    if (!dirPath || !query) {
      res.status(400).json({ error: 'path and q query parameters are required' });
      return;
    }
    const roots = await getAllowedRoots();
    if (!isPathAllowed(dirPath, roots)) {
      res.status(403).json({ error: 'Access denied: path outside allowed scan paths' });
      return;
    }
    try {
      const safeQuery = query.replace(/['\\]/g, '');
      if (!safeQuery) {
        res.json([]);
        return;
      }
      const { stdout } = await execAsync(
        `grep -rn --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --include='*.py' --include='*.go' --include='*.rs' --include='*.java' --include='*.cs' --include='*.md' --include='*.css' --include='*.html' --include='*.json' --include='*.yaml' --include='*.yml' --max-count=5 -I '${safeQuery}' . 2>/dev/null | head -${LIMITS.CODE_SEARCH_LINES}`,
        { cwd: dirPath, encoding: 'utf-8', timeout: TIMEOUTS.SHELL_GREP },
      );
      const resultsByFile = new Map<string, Array<{ line: number; text: string }>>();
      for (const raw of stdout.split('\n').filter(l => l.trim())) {
        const match = raw.match(/^\.\/(.+?):(\d+):(.*)$/);
        if (!match) continue;
        const [, relative, lineStr, text] = match;
        const line = parseInt(lineStr, 10);
        if (!resultsByFile.has(relative)) {
          resultsByFile.set(relative, []);
        }
        resultsByFile.get(relative)!.push({ line, text: text.substring(0, LIMITS.GREP_LINE_LENGTH) });
      }
      const results = [...resultsByFile.entries()].slice(0, LIMITS.CODE_SEARCH_RESULTS).map(([relative, matches]) => ({
        file: `${dirPath}/${relative}`,
        relative,
        matches,
      }));
      res.json(results);
    } catch {
      res.json([]);
    }
  });

  // File explorer — list directory contents
  router.get('/api/files', asyncHandler(async (req, res) => {
    const dirPath = req.query.path as string | undefined;
    if (!dirPath) {
      res.status(400).json({ error: 'path query parameter is required' });
      return;
    }
    const roots = await getAllowedRoots();
    if (!isPathAllowed(dirPath, roots)) {
      res.status(403).json({ error: 'Access denied: path outside allowed scan paths' });
      return;
    }
    const fsPromises = await import('fs/promises');
    const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
    const items = entries
      .filter(e => e.name !== '.git' && e.name !== 'node_modules' && e.name !== 'dist' && e.name !== '__pycache__')
      .map(e => ({
        name: e.name,
        path: path.join(dirPath, e.name),
        isDirectory: e.isDirectory(),
      }))
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    res.json(items);
  }));

  // File explorer — read file content
  router.get('/api/files/content', asyncHandler(async (req, res) => {
    const filePath = req.query.path as string | undefined;
    if (!filePath) {
      res.status(400).json({ error: 'path query parameter is required' });
      return;
    }
    const roots = await getAllowedRoots();
    if (!isPathAllowed(filePath, roots)) {
      res.status(403).json({ error: 'Access denied: path outside allowed scan paths' });
      return;
    }
    const fsPromises = await import('fs/promises');
    const stat = await fsPromises.stat(filePath);
    if (stat.size > LIMITS.FILE_READ_MAX_BYTES) {
      res.json({ content: null, truncated: true, size: stat.size });
      return;
    }
    const content = await fsPromises.readFile(filePath, 'utf-8');
    res.json({ content, truncated: false, size: stat.size });
  }));

  // Instance context — CLAUDE.md + stats
  router.get('/api/instances/:id/context', asyncHandler(async (req, res) => {
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
      claudeMd = await fsPromises.readFile(path.join(cwd, 'CLAUDE.md'), 'utf-8');
    } catch {
      // No CLAUDE.md
    }

    let modifiedFiles: string[] = [];
    try {
      const { stdout } = await execAsync('git diff --name-only HEAD 2>/dev/null; git diff --name-only --cached 2>/dev/null', {
        cwd,
        encoding: 'utf-8',
        timeout: TIMEOUTS.GIT_SHORT,
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
  }));

  return router;
}
