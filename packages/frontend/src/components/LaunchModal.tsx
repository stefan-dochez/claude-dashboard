import { useState, useEffect, useCallback } from 'react';
import { Play, X, GitBranch, ArrowRightLeft, Loader2, FolderGit2, Zap, MessageSquare, Terminal, Clock } from 'lucide-react';
import type { Project } from '../types';
import { useFocusTrap } from '../hooks/useFocusTrap';

const MAIN_BRANCHES = ['main', 'master', 'develop'];

interface HistoryTask {
  id: string;
  projectPath: string;
  projectName: string;
  worktreePath: string | null;
  sessionId: string | null;
  mode: 'terminal' | 'chat';
  firstPrompt: string | null;
  title: string | null;
  taskDescription: string | null;
  branchName: string | null;
  totalCostUsd: number;
  createdAt: string;
  endedAt: string | null;
}

const BRANCH_PREFIXES = [
  { value: 'feat', label: 'feat/' },
  { value: 'fix', label: 'fix/' },
  { value: 'chore', label: 'chore/' },
  { value: 'test', label: 'test/' },
  { value: 'docs', label: 'docs/' },
  { value: 'refactor', label: 'refactor/' },
  { value: 'claude', label: 'claude/' },
] as const;

interface BranchInfo {
  name: string;
  isCurrent: boolean;
  hasWorktree: boolean;
}

interface LaunchModalProps {
  project: Project;
  worktrees: Project[];
  onLaunch: (projectPath: string, taskDescription?: string, detachBranch?: boolean, branchPrefix?: string, mode?: 'terminal' | 'chat', sessionId?: string) => void;
  onClose: () => void;
  onRefreshProjects: () => void;
}

export default function LaunchModal({ project, worktrees, onLaunch, onClose, onRefreshProjects }: LaunchModalProps) {
  const [taskDescription, setTaskDescription] = useState('');
  const [branchPrefix, setBranchPrefix] = useState('feat');
  const [launchMode, setLaunchMode] = useState<'terminal' | 'chat'>('terminal');
  const [mode, setMode] = useState<'new' | 'existing' | 'branches' | 'history'>(worktrees.length > 0 ? 'existing' : 'new');
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [convertingBranch, setConvertingBranch] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryTask[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const modalRef = useFocusTrap<HTMLDivElement>();

  const isGit = project.gitBranch !== null;
  const canDetach = isGit && !project.isWorktree && project.gitBranch !== null && !MAIN_BRANCHES.includes(project.gitBranch);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/tasks/history');
      if (!res.ok) throw new Error('Failed to fetch history');
      const all: HistoryTask[] = await res.json();
      // Filter for this project (match on projectPath or worktreePath)
      setHistory(all.filter(t => t.projectPath === project.path || t.worktreePath?.startsWith(project.path)));
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [project.path]);

  useEffect(() => {
    if (mode === 'history' && history.length === 0) {
      fetchHistory();
    }
  }, [mode, history.length, fetchHistory]);

  const handleResumeSession = (task: HistoryTask) => {
    // Fall back to projectPath if worktree no longer exists
    const targetPath = task.worktreePath ?? task.projectPath;
    onLaunch(targetPath, undefined, undefined, undefined, task.mode, task.sessionId ?? undefined);
    onClose();
  };

  const fetchBranches = useCallback(async () => {
    setBranchesLoading(true);
    try {
      const res = await fetch(`/api/git/branches?path=${encodeURIComponent(project.path)}`);
      if (!res.ok) throw new Error('Failed to fetch branches');
      const data: BranchInfo[] = await res.json();
      setBranches(data);
    } catch (err) {
      console.error('[LaunchModal] Error fetching branches:', err);
      setBranches([]);
    } finally {
      setBranchesLoading(false);
    }
  }, [project.path]);

  useEffect(() => {
    if (mode === 'branches' && branches.length === 0) {
      fetchBranches();
    }
  }, [mode, branches.length, fetchBranches]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleSubmitNew = () => {
    const desc = taskDescription.trim();
    onLaunch(project.path, desc || undefined, undefined, isGit ? branchPrefix : undefined, launchMode);
    onClose();
  };

  const handleResumeWorktree = (worktreePath: string) => {
    onLaunch(worktreePath, undefined, undefined, undefined, launchMode);
    onClose();
  };

  const handleDetachBranch = () => {
    onLaunch(project.path, undefined, true, undefined, launchMode);
    onClose();
  };

  const handleLaunchDirect = () => {
    onLaunch(project.path, undefined, undefined, undefined, launchMode);
    onClose();
  };

  const handleBranchToWorktree = async (branchName: string) => {
    setConvertingBranch(branchName);
    try {
      const res = await fetch('/api/git/branch-to-worktree', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: project.path, branchName }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed');
      }
      const result = await res.json();
      onRefreshProjects();
      // Launch Claude in the new worktree
      onLaunch(result.worktreePath, undefined, undefined, undefined, launchMode);
      onClose();
    } catch (err) {
      console.error('[LaunchModal] Error converting branch to worktree:', err);
      setConvertingBranch(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmitNew();
    }
  };

  // Branches available to convert: not current, not already a worktree, not default branches
  const availableBranches = branches.filter(b => !b.isCurrent && !b.hasWorktree && !MAIN_BRANCHES.includes(b.name));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="mx-4 w-full max-w-lg rounded-lg border border-border-input bg-surface p-4 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary">
            <Play className="h-4 w-4 text-green-400" />
            <span className="text-sm font-semibold">Launch {project.name}</span>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted transition-colors hover:bg-elevated hover:text-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Terminal / Chat mode toggle */}
        <div className="mb-3 flex rounded-md border border-border-input text-xs">
          <button
            onClick={() => setLaunchMode('terminal')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-l-md px-3 py-1.5 font-medium transition-colors ${
              launchMode === 'terminal'
                ? 'bg-hover text-primary'
                : 'text-muted hover:text-secondary'
            }`}
          >
            <Terminal className="h-3 w-3" />
            Terminal
          </button>
          <button
            onClick={() => setLaunchMode('chat')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-r-md px-3 py-1.5 font-medium transition-colors ${
              launchMode === 'chat'
                ? 'bg-hover text-primary'
                : 'text-muted hover:text-secondary'
            }`}
          >
            <MessageSquare className="h-3 w-3" />
            Chat
          </button>
        </div>

        {/* Detach current branch banner */}
        {canDetach && (
          <button
            onClick={handleDetachBranch}
            className="mb-3 flex w-full items-center gap-2.5 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-left transition-colors hover:border-amber-500/40 hover:bg-amber-500/10"
          >
            <ArrowRightLeft className="h-4 w-4 shrink-0 text-amber-400" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-primary">
                Move <span className="text-amber-400">{project.gitBranch}</span> to worktree
              </div>
              <div className="text-[12px] text-muted">
                Creates a worktree for the current branch and resets repo to default branch
              </div>
            </div>
            <Play className="h-3.5 w-3.5 shrink-0 text-amber-400/60" />
          </button>
        )}

        {/* Quick launch on current branch */}
        {isGit && (
          <button
            onClick={handleLaunchDirect}
            className="mb-3 flex w-full items-center gap-2.5 rounded-md border border-green-500/20 bg-green-500/5 px-3 py-2.5 text-left transition-colors hover:border-green-500/40 hover:bg-green-500/10"
          >
            <Zap className="h-4 w-4 shrink-0 text-green-400" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-primary">
                Launch on <span className="text-green-400">{project.gitBranch}</span>
              </div>
              <div className="text-[12px] text-muted">
                Run Claude directly on the current branch, no worktree
              </div>
            </div>
            <Play className="h-3.5 w-3.5 shrink-0 text-green-400/60" />
          </button>
        )}

        {/* Mode tabs */}
        <div className="mb-3 flex rounded-md border border-border-input text-xs">
          {isGit && worktrees.length > 0 && (
            <button
              onClick={() => setMode('existing')}
              className={`flex-1 rounded-l-md px-3 py-1.5 font-medium transition-colors ${
                mode === 'existing'
                  ? 'bg-hover text-primary'
                  : 'text-muted hover:text-secondary'
              }`}
            >
              Resume ({worktrees.length})
            </button>
          )}
          <button
            onClick={() => setMode('new')}
            className={`flex-1 px-3 py-1.5 font-medium transition-colors ${
              !isGit || worktrees.length === 0 ? 'rounded-l-md' : ''
            } ${
              mode === 'new'
                ? 'bg-hover text-primary'
                : 'text-muted hover:text-secondary'
            }`}
          >
            New task
          </button>
          {isGit && (
            <button
              onClick={() => setMode('branches')}
              className={`flex-1 px-3 py-1.5 font-medium transition-colors ${
                mode === 'branches'
                  ? 'bg-hover text-primary'
                  : 'text-muted hover:text-secondary'
              }`}
            >
              Branches
            </button>
          )}
          <button
            onClick={() => setMode('history')}
            className={`flex-1 rounded-r-md px-3 py-1.5 font-medium transition-colors ${
              mode === 'history'
                ? 'bg-hover text-primary'
                : 'text-muted hover:text-secondary'
            }`}
          >
            History
          </button>
        </div>

        {mode === 'existing' ? (
          /* Existing worktrees list */
          <div className="flex max-h-48 flex-col gap-1 overflow-y-auto pr-4">
            {worktrees.map(wt => (
              <button
                key={wt.path}
                onClick={() => handleResumeWorktree(wt.path)}
                className="group flex items-center gap-2 rounded-md px-3 py-2 text-left transition-colors hover:bg-elevated"
              >
                <GitBranch className="h-3.5 w-3.5 shrink-0 text-violet-400" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-primary" title={wt.gitBranch ?? wt.name}>
                    {wt.gitBranch ?? wt.name}
                  </div>
                  <div className="truncate text-[12px] text-muted" title={wt.name}>
                    {wt.name}
                  </div>
                </div>
                <Play className="h-3.5 w-3.5 shrink-0 text-faint transition-colors group-hover:text-green-400" />
              </button>
            ))}
          </div>
        ) : mode === 'branches' ? (
          /* Branches list */
          <div className="flex max-h-48 flex-col gap-1 overflow-y-auto pr-4">
            {branchesLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted" />
              </div>
            ) : availableBranches.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted">
                No branches available to convert
              </p>
            ) : (
              availableBranches.map(branch => (
                <button
                  key={branch.name}
                  onClick={() => handleBranchToWorktree(branch.name)}
                  disabled={convertingBranch !== null}
                  className="group flex items-center gap-2 rounded-md px-3 py-2 text-left transition-colors hover:bg-elevated disabled:opacity-50"
                >
                  <GitBranch className="h-3.5 w-3.5 shrink-0 text-blue-400" />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-primary" title={branch.name}>
                    {branch.name}
                  </span>
                  {convertingBranch === branch.name ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-400" />
                  ) : (
                    <FolderGit2 className="h-3.5 w-3.5 shrink-0 text-faint transition-colors group-hover:text-blue-400" />
                  )}
                </button>
              ))
            )}
          </div>
        ) : mode === 'history' ? (
          /* Session history for this project */
          <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
            {historyLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted" />
              </div>
            ) : history.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted">
                No previous sessions
              </p>
            ) : (
              history.map(task => (
                <button
                  key={task.id}
                  onClick={() => handleResumeSession(task)}
                  disabled={!task.sessionId}
                  className="group flex items-center gap-2 rounded-md px-3 py-2 text-left transition-colors hover:bg-elevated disabled:opacity-40"
                >
                  {task.mode === 'chat'
                    ? <MessageSquare className="h-3.5 w-3.5 shrink-0 text-blue-400" />
                    : <Terminal className="h-3.5 w-3.5 shrink-0 text-muted" />
                  }
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-primary">
                      {task.title ?? task.firstPrompt ?? task.taskDescription ?? 'Session'}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted">
                      {task.branchName && <span className="truncate">{task.branchName}</span>}
                      {task.endedAt && <span>{new Date(task.endedAt).toLocaleDateString()}</span>}
                      {task.totalCostUsd > 0 && <span>${task.totalCostUsd.toFixed(4)}</span>}
                    </div>
                  </div>
                  <Play className="h-3.5 w-3.5 shrink-0 text-faint transition-colors group-hover:text-green-400" />
                </button>
              ))
            )}
          </div>
        ) : (
          /* New task form */
          <div className="mb-3">
            {isGit && (
              <div className="mb-2 flex flex-wrap gap-1">
                {BRANCH_PREFIXES.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setBranchPrefix(value)}
                    className={`rounded px-2 py-1 font-mono text-[12px] transition-colors ${
                      branchPrefix === value
                        ? 'bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/40'
                        : 'bg-elevated text-muted hover:bg-hover hover:text-secondary'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <input
              type="text"
              value={taskDescription}
              onChange={e => setTaskDescription(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What's the task?"
              className="w-full rounded-md border border-border-input bg-elevated px-3 py-2 text-sm text-primary placeholder-placeholder outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus"
            />
            <p className="mt-1.5 text-[12px] text-muted">
              {isGit
                ? `Branch: ${branchPrefix}/${taskDescription.trim() ? taskDescription.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) : '...'}`
                : 'Not a git project — will launch directly'}
            </p>
          </div>
        )}

        {mode === 'new' && (
          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded px-3 py-1.5 text-xs text-tertiary transition-colors hover:bg-elevated hover:text-primary"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmitNew}
              className="rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-500"
            >
              Launch
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
