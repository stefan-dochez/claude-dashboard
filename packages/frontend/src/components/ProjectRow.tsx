import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, GitBranch, GitPullRequest, Play, Power, Star, Trash2, Terminal, MessageSquare, Layers, Code2 } from 'lucide-react';
import LaunchModal from './LaunchModal';
import WorktreeResumeModal from './WorktreeResumeModal';
import { useSidebarActions } from '../hooks/useSidebarActions';
import { STATUS_DOT, STATUS_LABEL } from '../constants';
import type { Project, BranchStatus } from '../types';

/**
 * Translate a BranchStatus to a 2px left border via a ::before pseudo-element
 * so it doesn't consume layout space. Priority: PR state wins over CI state —
 * a merged PR's CI color is stale and irrelevant.
 */
function ciBorderClasses(status: BranchStatus | undefined): string {
  if (!status) return '';
  const base = "relative before:absolute before:left-0.5 before:top-1 before:bottom-1 before:w-0.5 before:rounded-full before:content-['']";
  if (status.prState === 'MERGED') return `${base} before:bg-violet-400`;
  if (status.prState === 'CLOSED') return '';
  switch (status.ciState) {
    case 'success': return `${base} before:bg-green-400`;
    case 'failure': return `${base} before:bg-rose-400`;
    case 'running': return `${base} before:bg-amber-400 before:animate-pulse`;
    default: return '';
  }
}

function ciTooltip(status: BranchStatus | undefined): string | undefined {
  if (!status) return undefined;
  if (status.prState === 'MERGED') return 'PR merged';
  if (status.prState === 'CLOSED') return 'PR closed (not merged)';
  if (!status.ciState) return undefined;
  const parts: string[] = [];
  if (status.ciSummary.passed > 0) parts.push(`${status.ciSummary.passed} passed`);
  if (status.ciSummary.failed > 0) parts.push(`${status.ciSummary.failed} failed`);
  if (status.ciSummary.running > 0) parts.push(`${status.ciSummary.running} running`);
  const label = { success: 'CI passed', failure: 'CI failed', running: 'CI running', neutral: 'CI pending' }[status.ciState];
  return parts.length > 0 ? `${label} — ${parts.join(' · ')}` : label;
}

interface ProjectRowProps {
  project: Project;
  worktrees: Project[];
  showWorkspace?: string | null;
}

export default function ProjectRow({ project, worktrees, showWorkspace }: ProjectRowProps) {
  const {
    instancesByProject, selectedInstanceId, favoriteProjects, prCounts, branchStatuses,
    history, onResumeHistory,
    onSelectInstance, onKillInstance, onDismissInstance, onLaunch,
    onDeleteWorktree, onToggleFavorite, onToggleMeta, onRefreshProjects,
    onOpenInIde, onViewPrs, installedIdes,
  } = useSidebarActions();

  const instances = instancesByProject.get(project.path) ?? [];
  const isFavorite = favoriteProjects.has(project.path);

  const [expanded, setExpanded] = useState(() => {
    return instances.length > 0 || worktrees.length > 0;
  });
  const [launchModalOpen, setLaunchModalOpen] = useState(false);
  const [resumeWorktree, setResumeWorktree] = useState<Project | null>(null);

  // Only resumable sessions (with a sessionId) matter here. Group by worktree path.
  const sessionsByWorktree = useMemo(() => {
    const map = new Map<string, typeof history>();
    for (const t of history) {
      if (!t.sessionId || !t.worktreePath) continue;
      const list = map.get(t.worktreePath) ?? [];
      list.push(t);
      map.set(t.worktreePath, list);
    }
    return map;
  }, [history]);

  const handleWorktreeClick = (wt: Project) => {
    const sessions = sessionsByWorktree.get(wt.path) ?? [];
    if (sessions.length === 0) {
      onLaunch(wt.path);
    } else {
      setResumeWorktree(wt);
    }
  };

  const activeInstances = instances.filter(i => i.status !== 'exited');
  const hasActivity = activeInstances.length > 0 || worktrees.length > 0;
  const prCount = prCounts.get(project.path) ?? 0;

  return (
    <>
      <div className={`group/row relative flex cursor-default items-center gap-1 rounded-lg px-1.5 py-1 transition-colors hover:bg-elevated/50 ${project.type === 'monorepo' ? 'border-l-2 border-violet-500/50' : project.type === 'workspace' ? 'border-l-2 border-cyan-500/50' : ''}`} onClick={() => setLaunchModalOpen(true)}>
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

        <span
          className="min-w-0 flex-1 truncate text-[12px] transition-colors group-hover/row:text-primary"
          title={project.path}
        >
          <span className="text-secondary">{project.name}</span>
          {showWorkspace && <span className="ml-1.5 text-[10px] text-faint">{showWorkspace}</span>}
        </span>

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
        {prCount > 0 && (
          <span
            onClick={e => { e.stopPropagation(); onViewPrs(project.path); }}
            className="flex items-center gap-0.5 rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-medium text-blue-400 transition-opacity group-hover/row:opacity-0"
            title={`${prCount} open PR${prCount > 1 ? 's' : ''}`}
          >
            <GitPullRequest className="h-2.5 w-2.5" />
            {prCount}
          </span>
        )}

        <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-md bg-elevated/80 px-0.5 opacity-0 transition-opacity group-hover/row:opacity-100">
          {prCount > 0 && (
            <span
              onClick={e => { e.stopPropagation(); onViewPrs(project.path); }}
              className="rounded p-0.5 text-faint transition-colors hover:text-blue-400"
              title="View open PRs"
            >
              <GitPullRequest className="h-3 w-3" />
            </span>
          )}
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
          {installedIdes.length > 0 && (
            <span
              onClick={e => {
                e.stopPropagation();
                onOpenInIde(project.path);
              }}
              className="rounded p-0.5 text-faint transition-colors hover:text-cyan-400"
              title="Open in IDE"
            >
              <Code2 className="h-3 w-3" />
            </span>
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

      {expanded && hasActivity && (
        <div className="ml-4 border-l border-border-default pl-2">
          {instances.map(inst => {
            const isSelected = inst.id === selectedInstanceId;
            const isChat = inst.mode === 'chat';
            const ModeIcon = isChat ? MessageSquare : Terminal;
            // CI indicator is reserved for worktree sessions — a session
            // launched directly on the repo (main branch) doesn't get one.
            const instStatus = inst.worktreePath ? branchStatuses.get(inst.worktreePath) : undefined;

            return (
              <div
                key={inst.id}
                onClick={() => onSelectInstance(inst.id)}
                title={ciTooltip(instStatus)}
                className={`group/inst flex cursor-default items-center gap-1.5 rounded px-2 py-1 transition-colors ${
                  isSelected ? 'bg-elevated/50' : 'hover:bg-elevated/20'
                } ${ciBorderClasses(instStatus)}`}
              >
                <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[inst.status]}`} />
                <ModeIcon className="h-3 w-3 shrink-0 text-faint" />
                <span className={`min-w-0 flex-1 truncate text-[11px] ${isSelected ? 'text-primary' : 'text-tertiary'}`}>
                  {inst.taskDescription ?? inst.branchName ?? STATUS_LABEL[inst.status]}
                </span>
                <span className="shrink-0 text-[9px] text-faint">
                  {new Date(inst.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <div className="flex shrink-0 items-center gap-0.5">
                  {installedIdes.length > 0 && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        onOpenInIde(inst.worktreePath ?? inst.projectPath);
                      }}
                      className="rounded p-0.5 text-faint opacity-0 transition-all hover:text-cyan-400 group-hover/inst:opacity-100"
                      title={`Open in IDE${inst.worktreePath ? ' (worktree)' : ''}`}
                    >
                      <Code2 className="h-2.5 w-2.5" />
                    </button>
                  )}
                  {inst.status !== 'exited' ? (
                    <button
                      onClick={e => { e.stopPropagation(); onKillInstance(inst.id); }}
                      className="rounded p-0.5 text-faint opacity-0 transition-all hover:text-rose-300 group-hover/inst:opacity-100"
                      title="Close session"
                    >
                      <Power className="h-2.5 w-2.5" />
                    </button>
                  ) : (
                    <button
                      onClick={e => { e.stopPropagation(); onDismissInstance(inst.id); }}
                      className="rounded p-0.5 text-faint opacity-0 transition-all hover:text-rose-300 group-hover/inst:opacity-100"
                      title="Remove"
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {worktrees
            .filter(wt => !instances.some(i => i.worktreePath === wt.path))
            .map(wt => {
              const wtStatus = branchStatuses.get(wt.path);
              return (
              <div
                key={wt.path}
                onClick={() => handleWorktreeClick(wt)}
                title={ciTooltip(wtStatus)}
                className={`group/wt flex cursor-default items-center gap-1.5 rounded px-2 py-1 transition-colors hover:bg-elevated/50 ${ciBorderClasses(wtStatus)}`}
              >
                <GitBranch className="h-3 w-3 shrink-0 text-violet-400/60" />
                <span className="min-w-0 flex-1 truncate text-[11px] text-faint transition-colors group-hover/wt:text-tertiary">
                  {wt.gitBranch ?? wt.name}
                </span>
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/wt:opacity-100">
                  {installedIdes.length > 0 && (
                    <span
                      onClick={e => { e.stopPropagation(); onOpenInIde(wt.path); }}
                      className="rounded p-0.5 text-faint transition-colors hover:text-cyan-400"
                      title="Open in IDE (worktree)"
                    >
                      <Code2 className="h-2.5 w-2.5" />
                    </span>
                  )}
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
              );
            })}
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

      {resumeWorktree && (
        <WorktreeResumeModal
          worktree={resumeWorktree}
          sessions={sessionsByWorktree.get(resumeWorktree.path) ?? []}
          onNewSession={path => onLaunch(path)}
          onResume={onResumeHistory}
          onClose={() => setResumeWorktree(null)}
        />
      )}
    </>
  );
}
