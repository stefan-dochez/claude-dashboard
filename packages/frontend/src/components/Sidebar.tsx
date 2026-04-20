import { RefreshCw, Settings, Download, ChevronDown, ChevronRight, Search, Loader2, Terminal, MessageSquare, Play, Star, Clock, X, Layers, Box } from 'lucide-react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSocket } from '../hooks/useSocket';
import { usePlatform } from '../hooks/usePlatform';
import type { Project, Instance } from '../types';
import { SidebarActionsContext } from './SidebarContext';
import ProjectRow from './ProjectRow';

interface HistoryTask {
  id: string;
  projectPath: string;
  projectName: string;
  worktreePath: string | null;
  branchName: string | null;
  taskDescription: string | null;
  sessionId: string | null;
  model: string | null;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  mode: 'terminal' | 'chat';
  firstPrompt: string | null;
  title: string | null;
  createdAt: string;
  endedAt: string | null;
}

interface SidebarProps {
  projects: Project[];
  projectsLoading: boolean;
  projectsRefreshing: boolean;
  instances: Instance[];
  selectedInstanceId: string | null;
  scanPaths: string[];
  favoriteProjects: Set<string>;
  pullingProjects: Set<string>;
  checkingOutProjects: Set<string>;
  pullingAll: boolean;
  queuedIds: Set<string>;
  onRefreshProjects: () => void;
  onLaunchProject: (projectPath: string, taskDescription?: string, detachBranch?: boolean, branchPrefix?: string, mode?: 'terminal' | 'chat', sessionId?: string, startPoint?: string) => void;
  onSelectInstance: (id: string) => void;
  onKillInstance: (id: string, deleteWorktree?: boolean) => void;
  onDismissInstance: (id: string) => void;
  onDeleteWorktree: (projectPath: string, worktreePath: string) => void;
  onToggleFavorite: (projectPath: string) => void;
  onToggleMeta: (projectPath: string) => void;
  onPullProject: (projectPath: string) => void;
  onPullAll: () => void;
  onCheckoutDefault: (projectPath: string) => void;
  onOpenInIde: (projectPath: string) => void;
  onViewPrs: (projectPath: string) => void;
  installedIdes: Array<{ id: string; name: string; installed: boolean }>;
  onOpenScanPaths: () => void;
  collapsed: boolean;
  onExpand: () => void;
  width?: number;
}

// --------------- Main Sidebar ---------------

export default function Sidebar({
  projects, projectsLoading, projectsRefreshing, instances, selectedInstanceId,
  scanPaths, favoriteProjects, pullingProjects: _pullingProjects, checkingOutProjects: _checkingOutProjects, pullingAll, queuedIds: _queuedIds,
  onRefreshProjects, onLaunchProject, onSelectInstance, onKillInstance, onDismissInstance,
  onDeleteWorktree, onToggleFavorite, onToggleMeta, onPullProject: _onPullProject, onPullAll, onCheckoutDefault: _onCheckoutDefault,
  onOpenInIde, onViewPrs, installedIdes,
  onOpenScanPaths,
  collapsed, onExpand: _onExpand, width = 320,
}: SidebarProps) {
  const [filter, setFilter] = useState('');
  const [selectedRoot, setSelectedRoot] = useState<string | null>(scanPaths[0] ?? null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryTask[]>([]);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const { shortenPath } = usePlatform();

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks/history');
      if (res.ok) setHistory(await res.json());
    } catch { /* ignore */ }
  }, []);

  const socket = useSocket();

  useEffect(() => {
    fetch('/api/version').then(r => r.json()).then(d => setAppVersion(d.version)).catch(() => {});
  }, []);

  useEffect(() => {
    fetchHistory();
    // Refresh history when an instance exits
    const onExited = () => { setTimeout(fetchHistory, 500); };
    const onTitle = ({ instanceId, title }: { instanceId: string; title: string }) => {
      setHistory(prev => prev.map(t => t.id === instanceId ? { ...t, title } : t));
    };
    socket.on('instance:exited', onExited);
    socket.on('instance:title', onTitle);
    return () => {
      socket.off('instance:exited', onExited);
      socket.off('instance:title', onTitle);
    };
  }, [fetchHistory, socket]);

  const handleResume = useCallback(async (task: HistoryTask) => {
    // Use worktreePath if available (avoid creating a new worktree)
    const targetPath = task.worktreePath ?? task.projectPath;
    // Don't pass taskDescription — that would create a new worktree
    // Pass sessionId for both chat and terminal modes to enable resume
    onLaunchProject(targetPath, undefined, undefined, undefined, task.mode, task.sessionId ?? undefined);
  }, [onLaunchProject]);

  const handleRemoveHistory = useCallback(async (id: string) => {
    try {
      await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
      setHistory(prev => prev.filter(t => t.id !== id));
    } catch { /* ignore */ }
  }, []);

  // Build maps
  const worktreesByParent = useMemo(() => {
    const map = new Map<string, Project[]>();
    for (const p of projects) {
      if (p.isWorktree && p.parentProject) {
        const list = map.get(p.parentProject) ?? [];
        list.push(p);
        map.set(p.parentProject, list);
      }
    }
    return map;
  }, [projects]);

  const instancesByProject = useMemo(() => {
    const map = new Map<string, Instance[]>();
    for (const inst of instances) {
      const key = inst.parentProjectPath ?? inst.projectPath;
      const list = map.get(key) ?? [];
      list.push(inst);
      map.set(key, list);
    }
    return map;
  }, [instances]);

  // Root projects only (no worktrees)
  const rootProjects = useMemo(() => {
    let list = projects.filter(p => !p.isWorktree);
    if (selectedRoot) {
      list = list.filter(p => p.path.startsWith(selectedRoot));
    }
    if (filter.trim()) {
      const q = filter.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q));
    }
    return list;
  }, [projects, selectedRoot, filter]);

  // Projects with activity (instances or worktrees) — shown first
  const activeProjects = useMemo(() => {
    return rootProjects.filter(p =>
      (instancesByProject.get(p.path)?.length ?? 0) > 0 ||
      (worktreesByParent.get(p.path)?.length ?? 0) > 0,
    );
  }, [rootProjects, instancesByProject, worktreesByParent]);

  // Favorites (excluding already shown in active)
  const favoriteProjectsList = useMemo(() => {
    const activeSet = new Set(activeProjects.map(p => p.path));
    return rootProjects.filter(p => favoriteProjects.has(p.path) && !activeSet.has(p.path));
  }, [rootProjects, favoriteProjects, activeProjects]);

  // Monorepos (excluding already shown in active/favorites)
  const monorepoProjects = useMemo(() => {
    const shown = new Set([...activeProjects.map(p => p.path), ...favoriteProjectsList.map(p => p.path)]);
    return rootProjects.filter(p => p.type === 'monorepo' && !shown.has(p.path));
  }, [rootProjects, activeProjects, favoriteProjectsList]);

  // Workspaces (excluding already shown in active/favorites)
  const workspaceProjects = useMemo(() => {
    const shown = new Set([...activeProjects.map(p => p.path), ...favoriteProjectsList.map(p => p.path)]);
    return rootProjects.filter(p => p.type === 'workspace' && !shown.has(p.path));
  }, [rootProjects, activeProjects, favoriteProjectsList]);

  // Other projects
  const otherProjects = useMemo(() => {
    const shown = new Set([
      ...activeProjects.map(p => p.path),
      ...favoriteProjectsList.map(p => p.path),
      ...monorepoProjects.map(p => p.path),
      ...workspaceProjects.map(p => p.path),
    ]);
    return rootProjects.filter(p => !shown.has(p.path));
  }, [rootProjects, activeProjects, favoriteProjectsList, monorepoProjects, workspaceProjects]);

  // Detect duplicate project names to show workspace disambiguation
  const duplicateNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of rootProjects) {
      counts.set(p.name, (counts.get(p.name) ?? 0) + 1);
    }
    return new Set([...counts.entries()].filter(([, c]) => c > 1).map(([n]) => n));
  }, [rootProjects]);

  const getWorkspaceLabel = useCallback((project: Project): string | null => {
    if (!duplicateNames.has(project.name)) return null;
    // Find which scanPath this project belongs to
    const root = scanPaths.find(sp => project.path.startsWith(sp));
    if (!root) return null;
    return shortenPath(root);
  }, [duplicateNames, scanPaths, shortenPath]);

  // Fetch PR counts (filtered to "mine") for all projects in a single batch.
  // Uses the full unfiltered project list so typing in the search box doesn't
  // trigger unnecessary API calls.
  const [prCounts, setPrCounts] = useState<Map<string, number>>(new Map());
  const projectSpecs = useMemo(() => {
    return projects.filter(p => !p.isWorktree).map(p => ({ path: p.path, type: p.type }));
  }, [projects]);

  useEffect(() => {
    if (projectSpecs.length === 0) return;

    const fetchCounts = async () => {
      try {
        const res = await fetch('/api/git/pr-counts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projects: projectSpecs }),
        });
        if (!res.ok) return;
        const data = await res.json() as Record<string, { total: number; mine: number }>;
        const counts = new Map<string, number>();
        for (const [projectPath, { mine }] of Object.entries(data)) {
          if (mine > 0) counts.set(projectPath, mine);
        }
        setPrCounts(counts);
      } catch { /* ignore */ }
    };

    fetchCounts();
    const timer = setInterval(fetchCounts, 2 * 60 * 1000);
    return () => clearInterval(timer);
  }, [projectSpecs]);

  const sidebarActions = useMemo(() => ({
    onSelectInstance,
    onKillInstance,
    onDismissInstance,
    onLaunch: onLaunchProject,
    onDeleteWorktree,
    onToggleFavorite,
    onToggleMeta,
    onOpenInIde,
    onViewPrs,
    installedIdes,
    onRefreshProjects,
    selectedInstanceId,
    favoriteProjects,
    instancesByProject,
    prCounts,
  }), [onSelectInstance, onKillInstance, onDismissInstance, onLaunchProject, onDeleteWorktree, onToggleFavorite, onToggleMeta, onOpenInIde, onViewPrs, installedIdes, onRefreshProjects, selectedInstanceId, favoriteProjects, instancesByProject, prCounts]);

  const renderProject = useCallback((project: Project) => (
    <ProjectRow
      key={project.path}
      project={project}
      worktrees={worktreesByParent.get(project.path) ?? []}
      showWorkspace={getWorkspaceLabel(project)}
    />
  ), [worktreesByParent, getWorkspaceLabel]);

  return (
    <SidebarActionsContext.Provider value={sidebarActions}>
    <aside
      style={{
        width: collapsed ? 0 : width,
        opacity: collapsed ? 0 : 1,
        transition: collapsed ? 'width 200ms ease-in-out, opacity 200ms ease-in-out' : undefined,
      }}
      className="shrink-0 overflow-hidden rounded-xl bg-surface"
    >
      <div className="flex h-full w-full flex-col">
        {/* Workspace selector */}
        <div className="shrink-0 border-b border-border-default px-3 py-2">
          <select
            value={selectedRoot ?? '__all__'}
            onChange={e => setSelectedRoot(e.target.value === '__all__' ? null : e.target.value)}
            className="w-full cursor-pointer rounded-lg bg-elevated/50 px-2.5 py-1.5 text-[13px] font-medium text-primary outline-none transition-colors hover:bg-elevated"
          >
            {scanPaths.length > 1 && <option value="__all__">All workspaces</option>}
            {scanPaths.map(p => (
              <option key={p} value={p}>{shortenPath(p)}</option>
            ))}
          </select>
        </div>

        {/* Search + actions */}
        <div className="flex shrink-0 items-center gap-1 px-2 py-1.5">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-faint" />
            <input
              type="text"
              placeholder="Filter..."
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="w-full rounded bg-elevated/40 py-1 pl-7 pr-2 text-[12px] text-secondary placeholder-placeholder outline-none transition-colors focus:bg-elevated"
            />
          </div>
          <button onClick={onOpenScanPaths} className="rounded p-1 text-faint transition-colors hover:bg-elevated/30 hover:text-tertiary" title="Settings">
            <Settings className="h-3 w-3" />
          </button>
          <button onClick={onPullAll} disabled={pullingAll} className="rounded p-1 text-faint transition-colors hover:bg-elevated/30 hover:text-blue-400 disabled:opacity-50" title="Update all repos">
            <Download className={`h-3 w-3 ${pullingAll ? 'animate-pulse' : ''}`} />
          </button>
          <button onClick={onRefreshProjects} className="rounded p-1 text-faint transition-colors hover:bg-elevated/30 hover:text-tertiary" title="Refresh">
            <RefreshCw className={`h-3 w-3 ${projectsRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Project list */}
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {projectsLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-faint" />
            </div>
          ) : (
            <>
              {/* Active projects (with instances/worktrees) — always on top */}
              {activeProjects.length > 0 && (
                <div className="mb-1">
                  {activeProjects.map(renderProject)}
                </div>
              )}

              {/* Favorites */}
              {favoriteProjectsList.length > 0 && (
                <>
                  {activeProjects.length > 0 && <div className="mx-1 my-1.5 border-t border-border-default" />}
                  <div className="mb-0.5 flex items-center gap-1.5 px-1.5 pt-0.5 pb-1">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    <span className="text-[10px] font-medium uppercase tracking-wider text-faint">Favorites</span>
                  </div>
                  {favoriteProjectsList.map(renderProject)}
                </>
              )}

              {/* Monorepos */}
              {monorepoProjects.length > 0 && (
                <>
                  {(activeProjects.length > 0 || favoriteProjectsList.length > 0) && (
                    <div className="mx-1 my-1.5 border-t border-border-default" />
                  )}
                  <div className="mb-0.5 flex items-center gap-1.5 px-1.5 pt-0.5 pb-1">
                    <Layers className="h-3 w-3 text-violet-400" />
                    <span className="text-[10px] font-medium uppercase tracking-wider text-faint">Monorepos</span>
                  </div>
                  {monorepoProjects.map(renderProject)}
                </>
              )}

              {/* Workspaces */}
              {workspaceProjects.length > 0 && (
                <>
                  {(activeProjects.length > 0 || favoriteProjectsList.length > 0 || monorepoProjects.length > 0) && (
                    <div className="mx-1 my-1.5 border-t border-border-default" />
                  )}
                  <div className="mb-0.5 flex items-center gap-1.5 px-1.5 pt-0.5 pb-1">
                    <Box className="h-3 w-3 text-cyan-400" />
                    <span className="text-[10px] font-medium uppercase tracking-wider text-faint">Workspaces</span>
                  </div>
                  {workspaceProjects.map(renderProject)}
                </>
              )}

              {/* Other projects */}
              {otherProjects.length > 0 && (
                <>
                  {(activeProjects.length > 0 || favoriteProjectsList.length > 0 || monorepoProjects.length > 0 || workspaceProjects.length > 0) && (
                    <div className="mx-1 my-1.5 border-t border-border-default" />
                  )}
                  {otherProjects.map(renderProject)}
                </>
              )}

              {rootProjects.length === 0 && (
                <p className="py-4 text-center text-xs text-faint">
                  {filter ? 'No projects match' : 'No projects found'}
                </p>
              )}
            </>
          )}
        </div>

        {/* History section */}
        {(() => {
          const filteredHistory = selectedRoot
            ? history.filter(t => t.projectPath.startsWith(selectedRoot))
            : history;
          return filteredHistory.length > 0 && (
          <div className="shrink-0 border-t border-border-default">
            <button
              onClick={() => { setHistoryOpen(!historyOpen); if (!historyOpen) fetchHistory(); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted transition-colors hover:text-secondary"
            >
              {historyOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <Clock className="h-3 w-3" />
              <span>History</span>
              <span className="ml-auto text-[10px] text-faint">{filteredHistory.length}</span>
            </button>
            {historyOpen && (
              <div className="max-h-48 overflow-y-auto px-2 pb-2">
                {filteredHistory.map(task => (
                  <div
                    key={task.id}
                    className="group/hist flex cursor-default items-start gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-elevated/30"
                  >
                    {task.mode === 'chat'
                      ? <MessageSquare className="mt-0.5 h-3 w-3 shrink-0 text-faint" />
                      : <Terminal className="mt-0.5 h-3 w-3 shrink-0 text-faint" />
                    }
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] text-tertiary">
                        {task.title ?? task.firstPrompt ?? task.taskDescription ?? task.projectName}
                      </span>
                      <div className="flex items-center gap-2 text-[10px] text-faint">
                        <span className="truncate">{task.projectName}</span>
                        {task.model && <span>{task.model.replace(/^claude-/, '').split('-')[0]}</span>}
                        {task.totalCostUsd > 0 && <span>${task.totalCostUsd.toFixed(4)}</span>}
                        {(task.totalInputTokens > 0 || task.totalOutputTokens > 0) && (
                          <span title="input / output tokens">
                            {task.totalInputTokens > 0 ? `${Math.round(task.totalInputTokens / 1000)}k` : '0'}
                            /{task.totalOutputTokens > 0 ? `${Math.round(task.totalOutputTokens / 1000)}k` : '0'}
                          </span>
                        )}
                        {task.endedAt && <span>{new Date(task.endedAt).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/hist:opacity-100">
                      <span
                        onClick={() => handleResume(task)}
                        className="rounded p-0.5 text-faint transition-colors hover:text-green-400"
                        title={task.sessionId ? 'Resume session' : 'Relaunch'}
                      >
                        <Play className="h-3 w-3" />
                      </span>
                      <span
                        onClick={() => handleRemoveHistory(task.id)}
                        className="rounded p-0.5 text-faint transition-colors hover:text-rose-300"
                        title="Remove"
                      >
                        <X className="h-3 w-3" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
        })()}

        {/* Version */}
        {appVersion && (
          <div className="shrink-0 px-3 py-1.5 text-center text-[10px] text-faint">
            v{appVersion}
          </div>
        )}
      </div>
    </aside>
    </SidebarActionsContext.Provider>
  );
}
