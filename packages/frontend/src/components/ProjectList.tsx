import { useState, useMemo, useCallback, useEffect, useContext, createContext } from 'react';
import { Play, GitBranch, FileText, Search, FolderGit2, Loader2, Folder, ChevronDown, ChevronRight, Trash2, Layers, List, FolderTree, Star, Download } from 'lucide-react';
import type { Project, Instance } from '../types';
import LaunchModal from './LaunchModal';

// --- Tree types ---

interface FolderTreeNode {
  type: 'folder';
  name: string;
  fullPath: string;
  children: TreeNode[];
  projectCount: number;
}

interface ProjectTreeNode {
  type: 'project';
  project: Project;
}

type TreeNode = FolderTreeNode | ProjectTreeNode;

// --- Tree builder ---

function buildTree(projects: Project[], root: string): TreeNode[] {
  const tree: TreeNode[] = [];

  for (const project of projects) {
    if (!project.path.startsWith(root)) continue;

    const relative = project.path.slice(root.length + 1);
    if (!relative) {
      tree.push({ type: 'project', project });
      continue;
    }

    const segments = relative.split('/');
    let currentLevel = tree;

    for (let i = 0; i < segments.length - 1; i++) {
      const folderName = segments[i];
      const folderPath = root + '/' + segments.slice(0, i + 1).join('/');

      let existing = currentLevel.find(
        (n): n is FolderTreeNode => n.type === 'folder' && n.fullPath === folderPath,
      );

      if (!existing) {
        existing = { type: 'folder', name: folderName, fullPath: folderPath, children: [], projectCount: 0 };
        currentLevel.push(existing);
      }

      currentLevel = existing.children;
    }

    currentLevel.push({ type: 'project', project });
  }

  const countAndSort = (nodes: TreeNode[]): number => {
    let total = 0;
    for (const node of nodes) {
      if (node.type === 'folder') {
        node.projectCount = countAndSort(node.children);
        total += node.projectCount;
      } else {
        total += 1;
      }
    }
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      const nameA = a.type === 'folder' ? a.name : a.project.name;
      const nameB = b.type === 'folder' ? b.name : b.project.name;
      return nameA.localeCompare(nameB);
    });
    return total;
  };

  countAndSort(tree);
  return tree;
}

function buildMultiRootTree(projects: Project[], roots: string[]): TreeNode[] {
  const tree: TreeNode[] = [];

  for (const root of roots) {
    const rootProjects = projects.filter(p => p.path.startsWith(root));
    if (rootProjects.length === 0) continue;

    const rootName = root.split('/').pop() ?? root;
    const children = buildTree(rootProjects, root);

    tree.push({
      type: 'folder',
      name: rootName,
      fullPath: root,
      children,
      projectCount: rootProjects.length,
    });
  }

  return tree;
}

// --- Context for shared tree state ---

interface ProjectTreeContextValue {
  expandedProjects: Set<string>;
  activeProjectPaths: Set<string>;
  launching: string | null;
  worktreesByParent: Map<string, Project[]>;
  favoriteProjects: Set<string>;
  pullingProjects: Set<string>;
  onToggleProjectWorktrees: (path: string) => void;
  onLaunchModal: (project: Project) => void;
  onLaunchDirect: (path: string) => void;
  onDeleteWorktree: (projectPath: string, worktreePath: string) => void;
  onToggleFavorite: (projectPath: string) => void;
  onPullProject: (projectPath: string) => void;
}

const ProjectTreeContext = createContext<ProjectTreeContextValue | null>(null);

function useProjectTreeContext(): ProjectTreeContextValue {
  const ctx = useContext(ProjectTreeContext);
  if (!ctx) throw new Error('useProjectTreeContext must be used within ProjectTreeContext.Provider');
  return ctx;
}

// --- Components ---

interface ProjectListProps {
  projects: Project[];
  instances: Instance[];
  loading: boolean;
  scanPaths: string[];
  selectedRoot: string | null;
  favoriteProjects: Set<string>;
  pullingProjects: Set<string>;
  onLaunch: (projectPath: string, taskDescription?: string, detachBranch?: boolean, branchPrefix?: string) => void;
  onDeleteWorktree: (projectPath: string, worktreePath: string) => void;
  onToggleFavorite: (projectPath: string) => void;
  onPullProject: (projectPath: string) => void;
}

export default function ProjectList({ projects, instances, loading, scanPaths, selectedRoot, favoriteProjects, pullingProjects, onLaunch, onDeleteWorktree, onToggleFavorite, onPullProject }: ProjectListProps) {
  const [filter, setFilter] = useState('');
  const [viewMode, setViewMode] = useState<'tree' | 'flat'>('tree');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(() => new Set());
  const [launching, setLaunching] = useState<string | null>(null);
  const [launchTarget, setLaunchTarget] = useState<Project | null>(null);
  const [confirmDeleteWt, setConfirmDeleteWt] = useState<{ projectPath: string; worktreePath: string; name: string } | null>(null);

  const requestDeleteWorktree = useCallback((projectPath: string, worktreePath: string) => {
    const name = worktreePath.split('/').pop() ?? worktreePath;
    setConfirmDeleteWt({ projectPath, worktreePath, name });
  }, []);

  const activeProjectPaths = useMemo(
    () => new Set(instances.filter(i => i.status !== 'exited').map(i => i.projectPath)),
    [instances],
  );

  // Separate worktrees from regular projects for tree nesting
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

  const regularProjects = useMemo(
    () => projects.filter(p => !(p.isWorktree && p.parentProject)),
    [projects],
  );

  const tree = useMemo(() => {
    if (selectedRoot) {
      return buildTree(regularProjects, selectedRoot);
    }
    return buildMultiRootTree(regularProjects, scanPaths);
  }, [regularProjects, scanPaths, selectedRoot]);

  // Auto-expand first level only when selectedRoot changes
  useEffect(() => {
    const firstLevel = new Set<string>();
    for (const node of tree) {
      if (node.type === 'folder') {
        firstLevel.add(node.fullPath);
      }
    }
    setExpanded(firstLevel);
  }, [selectedRoot]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleFolder = useCallback((path: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const toggleProjectWorktrees = useCallback((path: string) => {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleLaunchFromModal = (projectPath: string, taskDescription?: string, detachBranch?: boolean, branchPrefix?: string) => {
    setLaunching(projectPath);
    onLaunch(projectPath, taskDescription, detachBranch, branchPrefix);
    setTimeout(() => setLaunching(null), 1000);
  };

  const handleDirectLaunch = useCallback((projectPath: string) => {
    setLaunching(projectPath);
    onLaunch(projectPath);
    setTimeout(() => setLaunching(null), 1000);
  }, [onLaunch]);

  const favSort = useCallback((a: Project, b: Project) => {
    const aFav = favoriteProjects.has(a.path);
    const bFav = favoriteProjects.has(b.path);
    if (aFav !== bFav) return aFav ? -1 : 1;
    return a.name.localeCompare(b.name);
  }, [favoriteProjects]);

  // Filtered flat list for search — includes all projects
  const filtered = useMemo(() => {
    if (!filter) return null;
    return projects.filter(p =>
      p.name.toLowerCase().includes(filter.toLowerCase()) ||
      p.path.toLowerCase().includes(filter.toLowerCase()) ||
      (p.gitBranch?.toLowerCase().includes(filter.toLowerCase()) ?? false),
    ).sort(favSort);
  }, [projects, filter, favSort]);

  const sortedFlatProjects = useMemo(
    () => [...regularProjects].sort(favSort),
    [regularProjects, favSort],
  );

  const favoriteProjectsList = useMemo(
    () => regularProjects.filter(p => favoriteProjects.has(p.path)).sort((a, b) => a.name.localeCompare(b.name)),
    [regularProjects, favoriteProjects],
  );

  const contextValue = useMemo<ProjectTreeContextValue>(() => ({
    expandedProjects,
    activeProjectPaths,
    launching,
    worktreesByParent,
    favoriteProjects,
    pullingProjects,
    onToggleProjectWorktrees: toggleProjectWorktrees,
    onLaunchModal: setLaunchTarget,
    onLaunchDirect: handleDirectLaunch,
    onDeleteWorktree: requestDeleteWorktree,
    onToggleFavorite: onToggleFavorite,
    onPullProject: onPullProject,
  }), [expandedProjects, activeProjectPaths, launching, worktreesByParent, favoriteProjects, pullingProjects, toggleProjectWorktrees, handleDirectLaunch, requestDeleteWorktree, onToggleFavorite, onPullProject]);

  return (
    <ProjectTreeContext.Provider value={contextValue}>
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-neutral-500" />
          <input
            type="text"
            placeholder="Filter projects..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="w-full rounded-md border border-neutral-800 bg-neutral-900/50 py-2 pl-8 pr-3 text-xs text-neutral-300 placeholder-neutral-600 outline-none focus:border-neutral-600 focus:ring-1 focus:ring-neutral-600"
          />
        </div>
        <button
          onClick={() => setViewMode(viewMode === 'tree' ? 'flat' : 'tree')}
          className="shrink-0 rounded-md border border-neutral-800 bg-neutral-900/50 p-2 text-neutral-500 transition-colors hover:border-neutral-600 hover:text-neutral-300"
          title={viewMode === 'tree' ? 'Switch to flat list' : 'Switch to tree view'}
        >
          {viewMode === 'tree' ? <List className="h-3.5 w-3.5" /> : <FolderTree className="h-3.5 w-3.5" />}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6 text-neutral-500">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : filtered ? (
        // Flat search results
        filtered.length === 0 ? (
          <p className="py-4 text-center text-xs text-neutral-600">No projects match</p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {filtered.map(project => {
              const isNestedWt = project.isWorktree && !!project.parentProject;
              return (
                <ProjectRow
                  key={project.path}
                  project={project}
                  worktrees={worktreesByParent.get(project.path) ?? []}
                  isProjectExpanded={expandedProjects.has(project.path)}
                  isActive={activeProjectPaths.has(project.path)}
                  isLaunching={launching === project.path}
                  launching={launching}
                  depth={0}
                  isFavorite={favoriteProjects.has(project.path)}
                  isPulling={pullingProjects.has(project.path)}
                  onLaunch={isNestedWt ? () => handleDirectLaunch(project.path) : () => setLaunchTarget(project)}
                  onToggleWorktrees={() => toggleProjectWorktrees(project.path)}
                  onLaunchDirect={handleDirectLaunch}
                  onDeleteWorktree={requestDeleteWorktree}
                  onToggleFavorite={() => onToggleFavorite(project.path)}
                  onPull={() => onPullProject(project.path)}
                />
              );
            })}
          </div>
        )
      ) : viewMode === 'flat' ? (
        // Flat alphabetical list
        sortedFlatProjects.length === 0 ? (
          <p className="py-4 text-center text-xs text-neutral-600">No projects found</p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {sortedFlatProjects.map(project => {
              const worktrees = worktreesByParent.get(project.path) ?? [];
              return (
                <ProjectRow
                  key={project.path}
                  project={project}
                  worktrees={worktrees}
                  isProjectExpanded={expandedProjects.has(project.path)}
                  isActive={activeProjectPaths.has(project.path)}
                  isLaunching={launching === project.path}
                  launching={launching}
                  depth={0}
                  isFavorite={favoriteProjects.has(project.path)}
                  isPulling={pullingProjects.has(project.path)}
                  onLaunch={() => setLaunchTarget(project)}
                  onToggleWorktrees={() => toggleProjectWorktrees(project.path)}
                  onLaunchDirect={handleDirectLaunch}
                  onDeleteWorktree={requestDeleteWorktree}
                  onToggleFavorite={() => onToggleFavorite(project.path)}
                  onPull={() => onPullProject(project.path)}
                />
              );
            })}
          </div>
        )
      ) : tree.length === 0 ? (
        <p className="py-4 text-center text-xs text-neutral-600">No projects found</p>
      ) : (
        // Tree view
        <div className="flex flex-col gap-0.5">
          {favoriteProjectsList.length > 0 && (
            <>
              <div className="flex items-center gap-1.5 px-2 pt-1 pb-0.5">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">Favorites</span>
              </div>
              {favoriteProjectsList.map(project => (
                <ProjectRow
                  key={`fav-${project.path}`}
                  project={project}
                  worktrees={worktreesByParent.get(project.path) ?? []}
                  isProjectExpanded={expandedProjects.has(project.path)}
                  isActive={activeProjectPaths.has(project.path)}
                  isLaunching={launching === project.path}
                  launching={launching}
                  depth={0}
                  isFavorite
                  isPulling={pullingProjects.has(project.path)}
                  onLaunch={() => setLaunchTarget(project)}
                  onToggleWorktrees={() => toggleProjectWorktrees(project.path)}
                  onLaunchDirect={handleDirectLaunch}
                  onDeleteWorktree={requestDeleteWorktree}
                  onToggleFavorite={() => onToggleFavorite(project.path)}
                  onPull={() => onPullProject(project.path)}
                />
              ))}
              <div className="mx-2 my-1 border-t border-neutral-800" />
            </>
          )}
          <TreeNodeList
            nodes={tree}
            depth={0}
            expanded={expanded}
            onToggle={toggleFolder}
          />
        </div>
      )}

      {launchTarget && (
        <LaunchModal
          project={launchTarget}
          worktrees={worktreesByParent.get(launchTarget.path) ?? []}
          onLaunch={handleLaunchFromModal}
          onClose={() => setLaunchTarget(null)}
        />
      )}

      {confirmDeleteWt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setConfirmDeleteWt(null)}
        >
          <div
            className="mx-4 w-full max-w-xs rounded-lg border border-neutral-700 bg-neutral-900 p-4 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-2 text-red-400">
              <Trash2 className="h-4 w-4" />
              <span className="text-sm font-semibold">Delete worktree</span>
            </div>
            <p className="mb-3 text-xs text-neutral-400">
              Delete <span className="font-medium text-neutral-200">{confirmDeleteWt.name}</span>? The worktree directory and its branch will be removed.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteWt(null)}
                className="rounded px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDeleteWorktree(confirmDeleteWt.projectPath, confirmDeleteWt.worktreePath);
                  setConfirmDeleteWt(null);
                }}
                className="rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-500"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </ProjectTreeContext.Provider>
  );
}

// --- Tree rendering ---

interface TreeProps {
  expanded: Set<string>;
  onToggle: (path: string) => void;
}

function TreeNodeList({
  nodes,
  depth,
  expanded,
  onToggle,
}: { nodes: TreeNode[]; depth: number } & TreeProps) {
  const ctx = useProjectTreeContext();

  return (
    <>
      {nodes.map(node => {
        if (node.type === 'folder') {
          return (
            <FolderRow
              key={node.fullPath}
              node={node}
              depth={depth}
              isExpanded={expanded.has(node.fullPath)}
              expanded={expanded}
              onToggle={onToggle}
            />
          );
        }

        const worktrees = ctx.worktreesByParent.get(node.project.path) ?? [];
        return (
          <ProjectRow
            key={node.project.path}
            project={node.project}
            worktrees={worktrees}
            isProjectExpanded={ctx.expandedProjects.has(node.project.path)}
            isActive={ctx.activeProjectPaths.has(node.project.path)}
            isLaunching={ctx.launching === node.project.path}
            launching={ctx.launching}
            depth={depth}
            isFavorite={ctx.favoriteProjects.has(node.project.path)}
            isPulling={ctx.pullingProjects.has(node.project.path)}
            onLaunch={() => ctx.onLaunchModal(node.project)}
            onToggleWorktrees={() => ctx.onToggleProjectWorktrees(node.project.path)}
            onLaunchDirect={ctx.onLaunchDirect}
            onDeleteWorktree={ctx.onDeleteWorktree}
            onToggleFavorite={() => ctx.onToggleFavorite(node.project.path)}
            onPull={() => ctx.onPullProject(node.project.path)}
          />
        );
      })}
    </>
  );
}

function FolderRow({
  node,
  depth,
  isExpanded,
  expanded,
  onToggle,
}: { node: FolderTreeNode; depth: number; isExpanded: boolean } & TreeProps) {
  return (
    <>
      <button
        onClick={() => onToggle(node.fullPath)}
        className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-neutral-800/50"
        style={{ paddingLeft: `${depth * 12 + 6}px` }}
      >
        {isExpanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-neutral-500" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-neutral-500" />
        )}
        <Folder className={`h-3.5 w-3.5 shrink-0 ${isExpanded ? 'text-amber-500/70' : 'text-neutral-500'}`} />
        <span className="truncate text-xs font-medium text-neutral-400" title={node.name}>{node.name}</span>
        <span className="ml-auto shrink-0 text-[10px] text-neutral-600">{node.projectCount}</span>
      </button>

      {isExpanded && (
        <TreeNodeList
          nodes={node.children}
          depth={depth + 1}
          expanded={expanded}
          onToggle={onToggle}
        />
      )}
    </>
  );
}

// --- Project row (with nested worktrees) ---

function ProjectRow({
  project,
  worktrees,
  isProjectExpanded,
  isActive,
  isLaunching,
  launching,
  depth,
  isFavorite,
  isPulling,
  onLaunch,
  onToggleWorktrees,
  onLaunchDirect,
  onDeleteWorktree,
  onToggleFavorite,
  onPull,
}: {
  project: Project;
  worktrees: Project[];
  isProjectExpanded: boolean;
  isActive: boolean;
  isLaunching: boolean;
  launching: string | null;
  depth: number;
  isFavorite?: boolean;
  isPulling?: boolean;
  onLaunch: () => void;
  onToggleWorktrees: () => void;
  onLaunchDirect: (path: string) => void;
  onDeleteWorktree: (projectPath: string, worktreePath: string) => void;
  onToggleFavorite?: () => void;
  onPull?: () => void;
}) {
  const hasWorktrees = worktrees.length > 0;

  return (
    <>
      <div
        className="group flex items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-neutral-800/50"
        style={{ paddingLeft: `${depth * 12 + 6}px` }}
      >
        {hasWorktrees ? (
          <button
            onClick={e => { e.stopPropagation(); onToggleWorktrees(); }}
            className="shrink-0 text-neutral-500 hover:text-neutral-300"
          >
            {isProjectExpanded
              ? <ChevronDown className="h-3 w-3" />
              : <ChevronRight className="h-3 w-3" />}
          </button>
        ) : (
          <span className="w-3 shrink-0" />
        )}

        {project.isMeta ? (
          <Layers className="h-3.5 w-3.5 shrink-0 text-violet-400" />
        ) : (
          <FolderGit2 className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-xs font-medium text-neutral-200" title={project.name}>
              {project.name}
            </span>
            {project.hasClaudeMd && (
              <span title="Has CLAUDE.md"><FileText className="h-3 w-3 shrink-0 text-amber-500/70" /></span>
            )}
            {project.isMeta && (
              <span className="shrink-0 rounded bg-violet-500/10 px-1 py-0.5 text-[9px] font-medium text-violet-400">
                META
              </span>
            )}
            {project.isWorktree && (
              <span className="shrink-0 rounded bg-violet-500/10 px-1 py-0.5 text-[9px] font-medium text-violet-400">
                WT
              </span>
            )}
            {hasWorktrees && (
              <span className="shrink-0 rounded bg-violet-500/10 px-1 py-0.5 text-[9px] font-medium text-violet-400">
                {worktrees.length} wt
              </span>
            )}
            {isActive && (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
            )}
          </div>
          {project.gitBranch && (
            <div className="flex items-center gap-1 text-[10px] text-neutral-500">
              <GitBranch className="h-2.5 w-2.5" />
              <span className="truncate" title={project.gitBranch ?? undefined}>{project.gitBranch}</span>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {onToggleFavorite && !project.isWorktree && (
            <button
              onClick={e => {
                e.stopPropagation();
                onToggleFavorite();
              }}
              className={`shrink-0 rounded p-1 transition-all ${
                isFavorite
                  ? 'text-amber-400 opacity-100'
                  : 'text-neutral-500 opacity-0 hover:bg-neutral-700 hover:text-amber-400 group-hover:opacity-100'
              }`}
              title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Star className={`h-3 w-3 ${isFavorite ? 'fill-amber-400' : ''}`} />
            </button>
          )}
          {onPull && project.gitBranch && !project.isWorktree && (
            <button
              onClick={e => {
                e.stopPropagation();
                onPull();
              }}
              disabled={isPulling}
              className="shrink-0 rounded p-1 text-neutral-500 opacity-0 transition-all hover:bg-neutral-700 hover:text-blue-400 group-hover:opacity-100 disabled:opacity-50"
              title="Pull latest"
            >
              {isPulling ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Download className="h-3 w-3" />
              )}
            </button>
          )}
          {project.isWorktree && project.parentProject && (
            <button
              onClick={e => {
                e.stopPropagation();
                onDeleteWorktree(project.parentProject!, project.path);
              }}
              className="shrink-0 rounded p-1 text-neutral-500 opacity-0 transition-all hover:bg-neutral-700 hover:text-red-400 group-hover:opacity-100"
              title="Delete worktree"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
          <button
            onClick={onLaunch}
            disabled={isLaunching}
            className="shrink-0 rounded p-1 text-neutral-500 opacity-0 transition-all hover:bg-neutral-700 hover:text-green-400 group-hover:opacity-100 disabled:opacity-50"
            title="Launch Claude Code"
          >
            {isLaunching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {isProjectExpanded && worktrees.map(wt => (
        <WorktreeRow
          key={wt.path}
          worktree={wt}
          depth={depth + 1}
          isLaunching={launching === wt.path}
          onLaunch={() => onLaunchDirect(wt.path)}
          onDelete={() => onDeleteWorktree(wt.parentProject!, wt.path)}
        />
      ))}
    </>
  );
}

// --- Worktree sub-row ---

function WorktreeRow({
  worktree,
  depth,
  isLaunching,
  onLaunch,
  onDelete,
}: {
  worktree: Project;
  depth: number;
  isLaunching: boolean;
  onLaunch: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="group flex items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-neutral-800/50"
      style={{ paddingLeft: `${depth * 12 + 6}px` }}
    >
      <GitBranch className="h-3 w-3 shrink-0 text-violet-400" />
      <span className="min-w-0 flex-1 truncate text-xs text-neutral-400" title={worktree.gitBranch ?? worktree.name}>
        {worktree.gitBranch ?? worktree.name}
      </span>

      <div className="flex shrink-0 items-center gap-0.5">
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          className="shrink-0 rounded p-1 text-neutral-500 opacity-0 transition-all hover:bg-neutral-700 hover:text-red-400 group-hover:opacity-100"
          title="Delete worktree"
        >
          <Trash2 className="h-3 w-3" />
        </button>
        <button
          onClick={onLaunch}
          disabled={isLaunching}
          className="shrink-0 rounded p-1 text-neutral-500 opacity-0 transition-all hover:bg-neutral-700 hover:text-green-400 group-hover:opacity-100 disabled:opacity-50"
          title="Launch in worktree"
        >
          {isLaunching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
