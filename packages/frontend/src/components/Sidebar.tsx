import { RefreshCw, FolderOpen, Settings, Download, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import ProjectList from './ProjectList';
import InstanceList from './InstanceList';
import type { Project, Instance } from '../types';

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

function shortenPath(fullPath: string): string {
  return fullPath.replace(/^\/Users\/[^/]+/, '~');
}

export default function Sidebar({
  projects,
  projectsLoading,
  projectsRefreshing,
  instances,
  selectedInstanceId,
  scanPaths,
  favoriteProjects,
  pullingProjects,
  checkingOutProjects,
  pullingAll,
  queuedIds,
  onRefreshProjects,
  onLaunchProject,
  onSelectInstance,
  onKillInstance,
  onDismissInstance,
  onDeleteWorktree,
  onToggleFavorite,
  onPullProject,
  onPullAll,
  onCheckoutDefault,
  onOpenScanPaths,
  collapsed,
  onExpand,
}: SidebarProps) {
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [instancesOpen, setInstancesOpen] = useState(true);
  const [selectedRoot, setSelectedRoot] = useState<string | null>(scanPaths[0] ?? null);


  return (
    <aside
      className="shrink-0 overflow-hidden rounded-xl bg-surface transition-all duration-200 ease-in-out"
      style={{ width: collapsed ? 0 : 320, opacity: collapsed ? 0 : 1 }}
    >
      <div className="flex h-full w-[320px] flex-col">
      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Instances section */}
        <div className="border-b border-border-default">
          <button
            onClick={() => setInstancesOpen(!instancesOpen)}
            className="flex w-full items-center gap-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted transition-colors hover:text-secondary"
          >
            {instancesOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <span>Instances</span>
          </button>

          {instancesOpen && (
            <div className="px-2 pb-2">
              <InstanceList
                instances={instances}
                selectedId={selectedInstanceId}
                queuedIds={queuedIds}
                onSelect={onSelectInstance}
                onKill={onKillInstance}
                onDismiss={onDismissInstance}
              />
            </div>
          )}
        </div>

        {/* Projects section */}
        <div>
          <div className="flex items-center">
            <button
              onClick={() => setProjectsOpen(!projectsOpen)}
              className="flex flex-1 items-center gap-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted transition-colors hover:text-secondary"
            >
              {projectsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <FolderOpen className="h-3 w-3" />
              <span>Projects</span>
              <span className="ml-auto rounded-full bg-elevated px-1.5 py-0.5 text-[11px] font-medium text-tertiary">
                {projects.length}
              </span>
            </button>
            <button
              onClick={onOpenScanPaths}
              className="rounded p-1 text-faint transition-colors hover:bg-elevated/30 hover:text-tertiary"
              title="Settings"
              aria-label="Settings"
            >
              <Settings className="h-3 w-3" />
            </button>
            <button
              onClick={onPullAll}
              disabled={pullingAll}
              className="rounded p-1 text-faint transition-colors hover:bg-elevated/30 hover:text-blue-400 disabled:opacity-50"
              title="Update all repos"
              aria-label="Update all repos"
            >
              <Download className={`h-3 w-3 ${pullingAll ? 'animate-pulse' : ''}`} />
            </button>
            <button
              onClick={onRefreshProjects}
              className="mr-2 rounded p-1 text-faint transition-colors hover:bg-elevated/30 hover:text-tertiary"
              title="Refresh"
              aria-label="Refresh"
            >
              <RefreshCw className={`h-3 w-3 ${projectsRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {projectsOpen && (
            <div className="px-2 pb-2">
              {/* Root selector */}
              {scanPaths.length > 0 && (
                <div className="mb-1.5 px-1">
                  <select
                    value={selectedRoot ?? '__all__'}
                    onChange={e => setSelectedRoot(e.target.value === '__all__' ? null : e.target.value)}
                    className="w-full cursor-pointer rounded border-0 bg-transparent px-0 py-1 text-[12px] text-muted outline-none"
                  >
                    {scanPaths.length > 1 && <option value="__all__">All roots</option>}
                    {scanPaths.map(p => (
                      <option key={p} value={p}>{shortenPath(p)}</option>
                    ))}
                  </select>
                </div>
              )}

              <ProjectList
                projects={projects}
                instances={instances}
                loading={projectsLoading}
                scanPaths={scanPaths}
                selectedRoot={selectedRoot}
                favoriteProjects={favoriteProjects}
                pullingProjects={pullingProjects}
                checkingOutProjects={checkingOutProjects}
                onLaunch={onLaunchProject}
                onDeleteWorktree={onDeleteWorktree}
                onToggleFavorite={onToggleFavorite}
                onPullProject={onPullProject}
                onCheckoutDefault={onCheckoutDefault}
                onRefreshProjects={onRefreshProjects}
              />
            </div>
          )}
        </div>
      </div>
      </div>
    </aside>
  );
}
