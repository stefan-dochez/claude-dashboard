import { RefreshCw, FolderOpen, Settings, Download, ChevronDown, ChevronRight, Search, Loader2, Terminal, MessageSquare, Trash2, GitBranch, Play, Star } from 'lucide-react';
import { useState, useMemo, useCallback } from 'react';
import LaunchModal from './LaunchModal';
import type { Project, Instance, InstanceStatus } from '../types';

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
  onLaunchProject: (projectPath: string, taskDescription?: string, detachBranch?: boolean, branchPrefix?: string, mode?: 'terminal' | 'chat') => void;
  onSelectInstance: (id: string) => void;
  onKillInstance: (id: string, deleteWorktree?: boolean) => void;
  onDismissInstance: (id: string) => void;
  onDeleteWorktree: (projectPath: string, worktreePath: string) => void;
  onToggleFavorite: (projectPath: string) => void;
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
  onRefreshProjects: () => void;
  showWorkspace?: string | null;
}

function ProjectRow({
  project, worktrees, instances, selectedInstanceId, isFavorite,
  onSelectInstance, onKillInstance, onDismissInstance, onLaunch, onDeleteWorktree, onToggleFavorite, onRefreshProjects, showWorkspace,
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
      <div className="group/row flex cursor-default items-center gap-1 rounded-lg px-1.5 py-1 transition-colors hover:bg-elevated/50" onClick={() => { if (hasActivity) setExpanded(!expanded); else setLaunchModalOpen(true); }}>
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
            <span
              onClick={e => { e.stopPropagation(); onToggleFavorite(project.path); }}
              className={`rounded p-0.5 transition-colors ${isFavorite ? 'text-amber-400' : 'text-faint hover:text-amber-400'}`}
              title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Star className={`h-3 w-3 ${isFavorite ? 'fill-amber-400' : ''}`} />
            </span>
          )}
          {!hasActivity && (
            <span
              onClick={e => { e.stopPropagation(); setLaunchModalOpen(true); }}
              className="rounded p-0.5 text-faint transition-colors group-hover/row:text-green-400"
              title="Launch"
            >
              <Play className="h-3 w-3" />
            </span>
          )}
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
                  {inst.branchName ?? inst.taskDescription ?? STATUS_LABEL[inst.status]}
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
  onDeleteWorktree, onToggleFavorite, onPullProject, onPullAll, onCheckoutDefault, onOpenScanPaths,
  collapsed, onExpand,
}: SidebarProps) {
  const [filter, setFilter] = useState('');
  const [selectedRoot, setSelectedRoot] = useState<string | null>(scanPaths[0] ?? null);

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

  // Other projects
  const otherProjects = useMemo(() => {
    const shown = new Set([...activeProjects.map(p => p.path), ...favoriteProjectsList.map(p => p.path)]);
    return rootProjects.filter(p => !shown.has(p.path));
  }, [rootProjects, activeProjects, favoriteProjectsList]);

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
      onRefreshProjects={onRefreshProjects}
      showWorkspace={getWorkspaceLabel(project)}
    />
  ), [worktreesByParent, instancesByProject, selectedInstanceId, favoriteProjects, onSelectInstance, onKillInstance, onDismissInstance, onLaunchProject, onDeleteWorktree, onToggleFavorite, onRefreshProjects, getWorkspaceLabel]);

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

              {/* Other projects */}
              {otherProjects.length > 0 && (
                <>
                  {(activeProjects.length > 0 || favoriteProjectsList.length > 0) && (
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
      </div>
    </aside>
  );
}
