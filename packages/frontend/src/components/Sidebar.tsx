import { RefreshCw, FolderOpen, Zap, ChevronDown, ChevronRight, Settings, Download } from 'lucide-react';
import { useState, useCallback, useRef, useEffect } from 'react';
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
  pullingAll: boolean;
  queuedIds: Set<string>;
  onRefreshProjects: () => void;
  onLaunchProject: (projectPath: string, taskDescription?: string, detachBranch?: boolean, branchPrefix?: string) => void;
  onSelectInstance: (id: string) => void;
  onKillInstance: (id: string, deleteWorktree?: boolean) => void;
  onDeleteWorktree: (projectPath: string, worktreePath: string) => void;
  onToggleFavorite: (projectPath: string) => void;
  onPullProject: (projectPath: string) => void;
  onPullAll: () => void;
  onOpenScanPaths: () => void;
}

function shortenPath(fullPath: string): string {
  const home = fullPath.replace(/^\/Users\/[^/]+/, '~');
  return home;
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
  pullingAll,
  queuedIds,
  onRefreshProjects,
  onLaunchProject,
  onSelectInstance,
  onKillInstance,
  onDeleteWorktree,
  onToggleFavorite,
  onPullProject,
  onPullAll,
  onOpenScanPaths,
}: SidebarProps) {
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [instancesOpen, setInstancesOpen] = useState(true);
  const [selectedRoot, setSelectedRoot] = useState<string | null>(scanPaths[0] ?? null);
  const [width, setWidth] = useState(340);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [width]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const newWidth = Math.min(600, Math.max(200, startWidth.current + (e.clientX - startX.current)));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const activeInstances = instances.filter(i => i.status !== 'exited');
  const waitingCount = instances.filter(i => i.status === 'waiting_input').length;

  return (
    <aside className="relative flex h-full shrink-0 flex-col border-r border-neutral-800 bg-[#0f0f0f]" style={{ width }}>
      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className="group absolute right-[-4px] top-0 z-10 flex h-full w-2 cursor-col-resize items-center justify-center"
      >
        <div className="h-8 w-1 rounded-full bg-neutral-700 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-neutral-800 px-4 py-3">
        <div className="flex h-6 w-6 items-center justify-center rounded bg-gradient-to-br from-orange-500 to-amber-600">
          <Zap className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="text-sm font-semibold text-neutral-200">Claude Dashboard</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Instances section */}
        <div className="border-b border-neutral-800/50">
          <button
            onClick={() => setInstancesOpen(!instancesOpen)}
            className="flex w-full items-center gap-2 px-3 py-2 text-[12px] font-semibold uppercase tracking-wider text-neutral-500 transition-colors hover:text-neutral-300"
          >
            {instancesOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <span>Instances</span>
            {activeInstances.length > 0 && (
              <span className="ml-auto rounded-full bg-neutral-800 px-1.5 py-0.5 text-[12px] font-medium text-neutral-400">
                {activeInstances.length}
              </span>
            )}
            {waitingCount > 0 && (
              <span className="rounded-full bg-green-500/10 px-1.5 py-0.5 text-[12px] font-medium text-green-400">
                {waitingCount}
              </span>
            )}
          </button>

          {instancesOpen && (
            <div className="px-2 pb-2">
              <InstanceList
                instances={instances}
                selectedId={selectedInstanceId}
                queuedIds={queuedIds}
                onSelect={onSelectInstance}
                onKill={onKillInstance}
              />
            </div>
          )}
        </div>

        {/* Projects section */}
        <div>
          <div className="flex items-center">
            <button
              onClick={() => setProjectsOpen(!projectsOpen)}
              className="flex flex-1 items-center gap-2 px-3 py-2 text-[12px] font-semibold uppercase tracking-wider text-neutral-500 transition-colors hover:text-neutral-300"
            >
              {projectsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <FolderOpen className="h-3 w-3" />
              <span>Projects</span>
              <span className="ml-auto rounded-full bg-neutral-800 px-1.5 py-0.5 text-[12px] font-medium text-neutral-400">
                {projects.length}
              </span>
            </button>
            <button
              onClick={onOpenScanPaths}
              className="rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-300"
              title="Scan paths settings"
              aria-label="Settings"
            >
              <Settings className="h-3 w-3" />
            </button>
            <button
              onClick={onPullAll}
              disabled={pullingAll}
              className="rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-blue-400 disabled:opacity-50"
              title="Update all repos (git pull)"
              aria-label="Update all repos"
            >
              <Download className={`h-3 w-3 ${pullingAll ? 'animate-pulse' : ''}`} />
            </button>
            <button
              onClick={onRefreshProjects}
              className="mr-2 rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-300"
              title="Refresh projects"
              aria-label="Refresh projects"
            >
              <RefreshCw className={`h-3 w-3 ${projectsRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {projectsOpen && (
            <div className="px-2 pb-2">
              {/* Root selector */}
              {scanPaths.length > 0 && (
                <div className="mb-1.5">
                  <select
                    value={selectedRoot ?? '__all__'}
                    onChange={e => setSelectedRoot(e.target.value === '__all__' ? null : e.target.value)}
                    className="w-full cursor-pointer appearance-none rounded-md border border-neutral-800 bg-neutral-900/50 bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23737373%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[right_8px_center] bg-no-repeat py-1.5 pl-2 pr-7 text-[12px] text-neutral-400 outline-none transition-colors focus:border-neutral-600 focus:ring-1 focus:ring-neutral-600"
                  >
                    {scanPaths.length > 1 && (
                      <option value="__all__">All roots</option>
                    )}
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
                onLaunch={onLaunchProject}
                onDeleteWorktree={onDeleteWorktree}
                onToggleFavorite={onToggleFavorite}
                onPullProject={onPullProject}
              />
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
