import { RefreshCw, FolderOpen, Settings, Download, ChevronDown, ChevronRight, Search, Loader2, Terminal, MessageSquare, Trash2, GitBranch, Play, Star, Clock, X, Layers, Box } from 'lucide-react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import LaunchModal from './LaunchModal';
import { useSocket } from '../hooks/useSocket';
import type { Project, Instance, InstanceStatus } from '../types';

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
  onLaunchProject: (projectPath: string, taskDescription?: string, detachBranch?: boolean, branchPrefix?: string, mode?: 'terminal' | 'chat', sessionId?: string) => void;
  onSelectInstance: (id: string) => void;
  onKillInstance: (id: string, deleteWorktree?: boolean) => void;
  onDismissInstance: (id: string) => void;
  onDeleteWorktree: (projectPath: string, worktreePath: string) => void;
  onToggleFavorite: (projectPath: string) => void;
  onToggleMeta: (projectPath: string) => void;
  onPullProject: (projectPath: string) => void;
  onPullAll: () => void;
  onCheckoutDefault: (projectPath: string) => void;
  onOpenScanPaths: () => void;
  collapsed: boolean;
  onExpand: () => void;
}

const STATUS_DOT: Record<InstanceStatus, string> = {
  launching: 'bg-yellow-500',
  processing: 'bg-blue-500 animate-pulse',
  waiting_input: 'bg-green-500',
  idle: 'bg-muted',
  exited: 'bg-faint',
};

const STATUS_LABEL: Record<InstanceStatus, string> = {
  launching: 'Launching',
  processing: 'Processing',
  waiting_input: 'Waiting',
  idle: 'Idle',
  exited: 'Exited',
};

function shortenPath(fullPath: string): string {
  return fullPath.replace(/^\/Users\/[^/]+/, '~');
}

// --------------- Project row with inline instances + worktrees ---------------

interface ProjectRowProps {
  project: Project;
  worktrees: Project[];
  instances: Instance[];
  selectedInstanceId: string | null;
  isFavorite: boolean;
  onSelectInstance: (id: string) => void;
  onKillInstance: (id: string, deleteWorktree?: boolean) => void;
  onDismissInstance: (id: string) => void;
  onLaunch: (projectPath: string, taskDescription?: string, detachBranch?: boolean, branchPrefix?: string, mode?: 'terminal' | 'chat') => void;
  onDeleteWorktree: (projectPath: string, worktreePath: string) => void;
  onToggleFavorite: (projectPath: string) => void;
  onToggleMeta: (projectPath: string) => void;
  onRefreshProjects: () => void;
  showWorkspace?: string | null;
}

function ProjectRow({
  project, worktrees, instances, selectedInstanceId, isFavorite,
  onSelectInstance, onKillInstance, onDismissInstance, onLaunch, onDeleteWorktree, onToggleFavorite, onToggleMeta, onRefreshProjects, showWorkspace,
}: ProjectRowProps) {
  const [expanded, setExpanded] = useState(() => {
    // Auto-expand if there are active instances or worktrees
    return instances.length > 0 || worktrees.length > 0;
  });
  const [launchModalOpen, setLaunchModalOpen] = useState(false);

  const activeInstances = instances.filter(i => i.status !== 'exited');
  const hasActivity = activeInstances.length > 0 || worktrees.length > 0;

  return (
    <>
      <div className={`group/row flex cursor-default items-center gap-1 rounded-lg px-1.5 py-1 transition-colors hover:bg-elevated/50 ${project.type === 'monorepo' ? 'border-l-2 border-violet-500/50' : project.type === 'workspace' ? 'border-l-2 border-cyan-500/50' : ''}`} onClick={() => setLaunchModalOpen(true)}>
        {/* Expand toggle */}
        {hasActivity ? (
          <span
            onClick={e => { e.stopPropagation(); setExpanded(!expanded); }}
            className="shrink-0 p-0.5 text-faint"
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </span>
        ) : (
          <span className="inline-block w-4" />
        )}

        {/* Project name */}
        <span
          className="min-w-0 flex-1 truncate text-[12px] transition-colors group-hover/row:text-primary"
          title={project.path}
        >
          <span className="text-secondary">{project.name}</span>
          {showWorkspace && <span className="ml-1.5 text-[10px] text-faint">{showWorkspace}</span>}
        </span>

        {/* Activity indicators */}
        {activeInstances.length > 0 && (
          <span className="flex items-center gap-1">
            {activeInstances.map(inst => (
              <span key={inst.id} className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[inst.status]}`} title={STATUS_LABEL[inst.status]} />
            ))}
          </span>
        )}
        {worktrees.length > 0 && (
          <span className="text-[10px] text-faint">{worktrees.length} wt</span>
        )}

        {/* Actions (hover) */}
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100">
          {!hasActivity && (
            <>
              {project.type === 'repo' && (
                <span
                  onClick={e => { e.stopPropagation(); onToggleMeta(project.path); }}
                  className="rounded p-0.5 text-faint transition-colors hover:text-violet-400"
                  title="Mark as monorepo"
                >
                  <Layers className="h-3 w-3" />
                </span>
              )}
              {project.type === 'monorepo' && (
                <span
                  onClick={e => { e.stopPropagation(); onToggleMeta(project.path); }}
                  className="rounded p-0.5 text-violet-400 transition-colors"
                  title="Remove monorepo"
                >
                  <Layers className="h-3 w-3 fill-violet-400/30" />
                </span>
              )}
              <span
                onClick={e => { e.stopPropagation(); onToggleFavorite(project.path); }}
                className={`rounded p-0.5 transition-colors ${isFavorite ? 'text-amber-400' : 'text-faint hover:text-amber-400'}`}
                title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                <Star className={`h-3 w-3 ${isFavorite ? 'fill-amber-400' : ''}`} />
              </span>
            </>
          )}
          <span
            onClick={e => { e.stopPropagation(); setLaunchModalOpen(true); }}
            className="rounded p-0.5 text-faint transition-colors group-hover/row:text-green-400"
            title="New task"
          >
            <Play className="h-3 w-3" />
          </span>
        </div>
      </div>

      {/* Expanded: instances + worktrees */}
      {expanded && hasActivity && (
        <div className="ml-4 border-l border-border-default pl-2">
          {/* Instances for this project */}
          {instances.map(inst => {
            const isSelected = inst.id === selectedInstanceId;
            const isChat = inst.mode === 'chat';
            const ModeIcon = isChat ? MessageSquare : Terminal;

            return (
              <div
                key={inst.id}
                onClick={() => onSelectInstance(inst.id)}
                className={`group/inst flex cursor-default items-center gap-1.5 rounded px-2 py-1 transition-colors ${
                  isSelected ? 'bg-elevated/50' : 'hover:bg-elevated/20'
                }`}
              >
                <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[inst.status]}`} />
                <ModeIcon className="h-3 w-3 shrink-0 text-faint" />
                <span className={`min-w-0 flex-1 truncate text-[11px] ${isSelected ? 'text-primary' : 'text-tertiary'}`}>
                  {inst.taskDescription ?? inst.branchName ?? STATUS_LABEL[inst.status]}
                </span>
                <span className="shrink-0 text-[9px] text-faint">
                  {new Date(inst.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                {inst.status !== 'exited' ? (
                  <button
                    onClick={e => { e.stopPropagation(); onKillInstance(inst.id); }}
                    className="shrink-0 rounded p-0.5 text-faint opacity-0 transition-all hover:text-rose-300 group-hover/inst:opacity-100"
                    title="Kill"
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </button>
                ) : (
                  <button
                    onClick={e => { e.stopPropagation(); onDismissInstance(inst.id); }}
                    className="shrink-0 rounded p-0.5 text-faint opacity-0 transition-all hover:text-rose-300 group-hover/inst:opacity-100"
                    title="Remove"
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </button>
                )}
              </div>
            );
          })}

          {/* Worktrees without running instances */}
          {worktrees
            .filter(wt => !instances.some(i => i.worktreePath === wt.path))
            .map(wt => (
              <div
                key={wt.path}
                onClick={() => onLaunch(wt.path)}
                className="group/wt flex cursor-default items-center gap-1.5 rounded px-2 py-1 transition-colors hover:bg-elevated/50"
              >
                <GitBranch className="h-3 w-3 shrink-0 text-violet-400/60" />
                <span className="min-w-0 flex-1 truncate text-[11px] text-faint transition-colors group-hover/wt:text-tertiary">
                  {wt.gitBranch ?? wt.name}
                </span>
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/wt:opacity-100">
                  <span
                    className="rounded p-0.5 text-faint transition-colors group-hover/wt:text-green-400"
                    title="Resume"
                  >
                    <Play className="h-2.5 w-2.5" />
                  </span>
                  <span
                    onClick={e => { e.stopPropagation(); onDeleteWorktree(project.path, wt.path); }}
                    className="rounded p-0.5 text-faint transition-colors hover:text-rose-300"
                    title="Delete worktree"
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </span>
                </div>
              </div>
            ))}
        </div>
      )}

      {launchModalOpen && (
        <LaunchModal
          project={project}
          worktrees={worktrees}
          onLaunch={onLaunch}
          onClose={() => setLaunchModalOpen(false)}
          onRefreshProjects={onRefreshProjects}
        />
      )}
    </>
  );
}

// --------------- Main Sidebar ---------------

export default function Sidebar({
  projects, projectsLoading, projectsRefreshing, instances, selectedInstanceId,
  scanPaths, favoriteProjects, pullingProjects, checkingOutProjects, pullingAll, queuedIds,
  onRefreshProjects, onLaunchProject, onSelectInstance, onKillInstance, onDismissInstance,
  onDeleteWorktree, onToggleFavorite, onToggleMeta, onPullProject, onPullAll, onCheckoutDefault, onOpenScanPaths,
  collapsed, onExpand,
}: SidebarProps) {
  const [filter, setFilter] = useState('');
  const [selectedRoot, setSelectedRoot] = useState<string | null>(scanPaths[0] ?? null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryTask[]>([]);
  const [appVersion, setAppVersion] = useState<string | null>(null);

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
    socket.on('instance:exited', onExited);
    return () => { socket.off('instance:exited', onExited); };
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
  }, [duplicateNames, scanPaths]);

  const renderProject = useCallback((project: Project) => (
    <ProjectRow
      key={project.path}
      project={project}
      worktrees={worktreesByParent.get(project.path) ?? []}
      instances={instancesByProject.get(project.path) ?? []}
      selectedInstanceId={selectedInstanceId}
      isFavorite={favoriteProjects.has(project.path)}
      onSelectInstance={onSelectInstance}
      onKillInstance={onKillInstance}
      onDismissInstance={onDismissInstance}
      onLaunch={onLaunchProject}
      onDeleteWorktree={onDeleteWorktree}
      onToggleFavorite={onToggleFavorite}
      onToggleMeta={onToggleMeta}
      onRefreshProjects={onRefreshProjects}
      showWorkspace={getWorkspaceLabel(project)}
    />
  ), [worktreesByParent, instancesByProject, selectedInstanceId, favoriteProjects, onSelectInstance, onKillInstance, onDismissInstance, onLaunchProject, onDeleteWorktree, onToggleFavorite, onToggleMeta, onRefreshProjects, getWorkspaceLabel]);

  return (
    <aside
      style={{
        width: collapsed ? 0 : 320,
        opacity: collapsed ? 0 : 1,
        transition: 'width 200ms ease-in-out, opacity 200ms ease-in-out',
      }}
      className="shrink-0 overflow-hidden rounded-xl bg-surface"
    >
      <div className="flex h-full w-[320px] flex-col">
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
        {history.length > 0 && (
          <div className="shrink-0 border-t border-border-default">
            <button
              onClick={() => { setHistoryOpen(!historyOpen); if (!historyOpen) fetchHistory(); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted transition-colors hover:text-secondary"
            >
              {historyOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <Clock className="h-3 w-3" />
              <span>History</span>
              <span className="ml-auto text-[10px] text-faint">{history.length}</span>
            </button>
            {historyOpen && (
              <div className="max-h-48 overflow-y-auto px-2 pb-2">
                {history.map(task => (
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
                        {task.totalCostUsd > 0 && <span>${task.totalCostUsd.toFixed(4)}</span>}
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
        )}

        {/* Version */}
        {appVersion && (
          <div className="shrink-0 px-3 py-1.5 text-center text-[10px] text-faint">
            v{appVersion}
          </div>
        )}
      </div>
    </aside>
  );
}
