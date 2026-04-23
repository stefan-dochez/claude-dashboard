import { useState, useEffect, useCallback, useRef } from 'react';
import { Play, X, GitBranch, ArrowRightLeft, Loader2, FolderGit2, Zap, MessageSquare, Terminal, Cloud, Search, RefreshCw } from 'lucide-react';
import type { Project, HistoryTask } from '../types';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface RemoteBranchInfo {
  name: string;
  committerDate: number;
  authorName: string;
  hasLocalBranch: boolean;
}

function relativeTime(unixSeconds: number): string {
  if (!unixSeconds) return '';
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - unixSeconds));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

const MAIN_BRANCHES = ['main', 'master', 'develop'];

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

interface StartPoint {
  name: string;
  isRemote: boolean;
  isDefault: boolean;
}

interface LaunchModalProps {
  project: Project;
  worktrees: Project[];
  onLaunch: (projectPath: string, taskDescription?: string, detachBranch?: boolean, branchPrefix?: string, mode?: 'terminal' | 'chat', sessionId?: string, startPoint?: string) => void;
  onClose: () => void;
  onRefreshProjects: () => void;
}

export default function LaunchModal({ project, worktrees, onLaunch, onClose, onRefreshProjects }: LaunchModalProps) {
  const isGit = project.gitBranch !== null;
  const canDetach = isGit && !project.isWorktree && project.gitBranch !== null && !MAIN_BRANCHES.includes(project.gitBranch);

  const [taskDescription, setTaskDescription] = useState('');
  const [branchPrefix, setBranchPrefix] = useState('feat');
  const [launchMode, setLaunchMode] = useState<'terminal' | 'chat'>('terminal');
  const [mode, setMode] = useState<'new' | 'existing' | 'branches' | 'history'>(
    !isGit ? 'history' : worktrees.length > 0 ? 'existing' : 'new',
  );
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [convertingBranch, setConvertingBranch] = useState<string | null>(null);
  const [startPoints, setStartPoints] = useState<StartPoint[]>([]);
  const [startPoint, setStartPoint] = useState<string>('');
  const [history, setHistory] = useState<HistoryTask[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  // Remote branches state
  const [remoteBranches, setRemoteBranches] = useState<RemoteBranchInfo[]>([]);
  const [remoteTotal, setRemoteTotal] = useState(0);
  const [remoteLastFetched, setRemoteLastFetched] = useState<number | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteFetching, setRemoteFetching] = useState(false);
  const [remoteCheckingOut, setRemoteCheckingOut] = useState<string | null>(null);
  const [remoteSearch, setRemoteSearch] = useState('');
  const [remoteServerSearching, setRemoteServerSearching] = useState(false);
  const [remoteServerSearchQuery, setRemoteServerSearchQuery] = useState<string | null>(null);
  const remoteSearchRef = useRef<HTMLInputElement>(null);
  const modalRef = useFocusTrap<HTMLDivElement>();

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

  const fetchRemoteBranches = useCallback(async (opts: { search?: string; silent?: boolean } = {}) => {
    // `silent` reloads the list without blanking the UI — used after a manual Fetch
    // so the existing rows stay visible while the refresh completes.
    if (!opts.silent) {
      if (opts.search) {
        setRemoteServerSearching(true);
      } else {
        setRemoteLoading(true);
      }
    }
    try {
      const params = new URLSearchParams({ path: project.path, limit: '50' });
      if (opts.search) params.set('search', opts.search);
      const res = await fetch(`/api/git/remote-branches?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch remote branches');
      const data: { branches: RemoteBranchInfo[]; total: number; lastFetched: number | null } = await res.json();
      setRemoteBranches(data.branches);
      setRemoteTotal(data.total);
      setRemoteLastFetched(data.lastFetched);
      setRemoteServerSearchQuery(opts.search ?? null);
    } catch (err) {
      console.error('[LaunchModal] Error fetching remote branches:', err);
      if (!opts.silent) {
        setRemoteBranches([]);
        setRemoteTotal(0);
      }
    } finally {
      setRemoteLoading(false);
      setRemoteServerSearching(false);
    }
  }, [project.path]);

  useEffect(() => {
    if (mode === 'branches' && isGit && remoteBranches.length === 0 && !remoteLoading && remoteLastFetched === null) {
      fetchRemoteBranches();
    }
  }, [mode, isGit, remoteBranches.length, remoteLoading, remoteLastFetched, fetchRemoteBranches]);

  // If the user was in server-search mode and clears the search, reload the default top-recent list
  useEffect(() => {
    if (remoteServerSearchQuery !== null && remoteSearch.trim() === '') {
      fetchRemoteBranches();
    }
  }, [remoteSearch, remoteServerSearchQuery, fetchRemoteBranches]);

  const handleFetchOrigin = useCallback(async () => {
    setRemoteFetching(true);
    try {
      const res = await fetch('/api/git/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: project.path }),
      });
      if (!res.ok) throw new Error('Fetch failed');
      // Silently reload the remote list so the existing rows stay visible while updating
      await fetchRemoteBranches({ silent: true });
      setRemoteServerSearchQuery(null);
    } catch (err) {
      console.error('[LaunchModal] Error fetching origin:', err);
    } finally {
      setRemoteFetching(false);
    }
  }, [project.path, fetchRemoteBranches]);

  const handleRemoteToWorktree = async (remoteBranch: string) => {
    setRemoteCheckingOut(remoteBranch);
    try {
      const res = await fetch('/api/git/remote-to-worktree', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: project.path, remoteBranch }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed');
      }
      const result = await res.json();
      onRefreshProjects();
      onLaunch(result.worktreePath, undefined, undefined, undefined, launchMode);
      onClose();
    } catch (err) {
      console.error('[LaunchModal] Error checking out remote branch:', err);
      setRemoteCheckingOut(null);
    }
  };

  const fetchStartPoints = useCallback(async () => {
    try {
      const res = await fetch(`/api/git/start-points?path=${encodeURIComponent(project.path)}`);
      if (!res.ok) throw new Error('Failed to fetch start points');
      const data: StartPoint[] = await res.json();
      setStartPoints(data);
      const def = data.find(s => s.isDefault);
      if (def) setStartPoint(def.name);
    } catch (err) {
      console.error('[LaunchModal] Error fetching start points:', err);
      setStartPoints([]);
    }
  }, [project.path]);

  useEffect(() => {
    if (mode === 'new' && isGit && startPoints.length === 0) {
      fetchStartPoints();
    }
  }, [mode, isGit, startPoints.length, fetchStartPoints]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '/' && mode === 'branches') {
        const active = document.activeElement;
        const isTyping = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
        if (!isTyping) {
          e.preventDefault();
          remoteSearchRef.current?.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, mode]);

  const handleSubmitNew = () => {
    const desc = taskDescription.trim();
    const defaultStartPoint = startPoints.find(s => s.isDefault)?.name;
    const customStartPoint = isGit && startPoint && startPoint !== defaultStartPoint ? startPoint : undefined;
    onLaunch(project.path, desc || undefined, undefined, isGit ? branchPrefix : undefined, launchMode, undefined, customStartPoint);
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

        {/* Quick launch */}
        <button
          onClick={handleLaunchDirect}
          className="mb-3 flex w-full items-center gap-2.5 rounded-md border border-green-500/20 bg-green-500/5 px-3 py-2.5 text-left transition-colors hover:border-green-500/40 hover:bg-green-500/10"
        >
          <Zap className="h-4 w-4 shrink-0 text-green-400" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-primary">
              {isGit
                ? <>Launch on <span className="text-green-400">{project.gitBranch}</span></>
                : <>Launch <span className="text-green-400">{project.name}</span></>
              }
            </div>
            <div className="text-[12px] text-muted">
              {isGit
                ? 'Run Claude directly on the current branch, no worktree'
                : 'Run Claude in this workspace'
              }
            </div>
          </div>
          <Play className="h-3.5 w-3.5 shrink-0 text-green-400/60" />
        </button>

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
          {isGit && (
            <button
              onClick={() => setMode('new')}
              className={`flex-1 px-3 py-1.5 font-medium transition-colors ${
                worktrees.length === 0 ? 'rounded-l-md' : ''
              } ${
                mode === 'new'
                  ? 'bg-hover text-primary'
                  : 'text-muted hover:text-secondary'
              }`}
            >
              New task
            </button>
          )}
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
            className={`flex-1 ${!isGit ? 'rounded-l-md' : ''} rounded-r-md px-3 py-1.5 font-medium transition-colors ${
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
          /* Branches: Local + Remote sections with search + fetch */
          (() => {
            const search = remoteSearch.trim().toLowerCase();
            const visibleRemote = remoteBranches.filter(
              b => !b.hasLocalBranch
                && (!search || b.name.toLowerCase().includes(search) || b.authorName.toLowerCase().includes(search)),
            );
            const serverSearchMatches = remoteServerSearchQuery !== null
              && remoteServerSearchQuery.trim().toLowerCase() === search;
            const canServerSearch = search.length > 0
              && !remoteLoading
              && !remoteServerSearching
              && !serverSearchMatches
              && visibleRemote.length === 0
              && remoteTotal > remoteBranches.length;

            return (
              <div className="flex flex-col gap-2">
                {/* Search + fetch toolbar */}
                <div className="flex items-center gap-2">
                  <div className="flex flex-1 items-center gap-1.5 rounded-md border border-border-input bg-elevated px-2 py-1.5 focus-within:border-border-focus focus-within:ring-1 focus-within:ring-border-focus">
                    <Search className="h-3 w-3 shrink-0 text-muted" />
                    <input
                      ref={remoteSearchRef}
                      type="text"
                      value={remoteSearch}
                      onChange={e => setRemoteSearch(e.target.value)}
                      placeholder="Search branches…"
                      className="min-w-0 flex-1 bg-transparent text-xs text-primary outline-none placeholder:text-placeholder"
                    />
                    {remoteSearch
                      ? (
                        <button
                          onClick={() => setRemoteSearch('')}
                          className="text-faint hover:text-muted"
                          aria-label="Clear search"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )
                      : <span className="font-mono text-[10px] text-faint">/</span>
                    }
                  </div>
                  <button
                    onClick={handleFetchOrigin}
                    disabled={remoteFetching}
                    className="flex items-center gap-1 rounded-md border border-border-input bg-elevated px-2.5 py-1.5 text-[11px] text-tertiary transition-colors hover:bg-hover hover:text-primary disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3 w-3 ${remoteFetching ? 'animate-spin' : ''}`} />
                    Fetch
                  </button>
                </div>

                {/* Last-fetched caption */}
                {remoteLastFetched !== null && (
                  <div className="px-1 text-[11px] text-faint">
                    Last fetched {relativeTime(Math.floor(remoteLastFetched / 1000))}
                    {remoteTotal > 0 && <> · {remoteTotal} remote {remoteTotal === 1 ? 'branch' : 'branches'}</>}
                  </div>
                )}

                <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto pr-1">
                  {/* Local */}
                  {availableBranches.length > 0 && (
                    <>
                      <div className="px-3 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-faint">
                        Local · {availableBranches.length}
                      </div>
                      {availableBranches.map(branch => (
                        <button
                          key={branch.name}
                          onClick={() => handleBranchToWorktree(branch.name)}
                          disabled={convertingBranch !== null || remoteCheckingOut !== null}
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
                      ))}
                    </>
                  )}

                  {/* Remote */}
                  {(remoteLoading || remoteServerSearching || branchesLoading) ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="h-4 w-4 animate-spin text-muted" />
                    </div>
                  ) : (
                    <>
                      {(visibleRemote.length > 0 || search.length > 0) && (
                        <div className="mt-1 flex items-center justify-between px-3 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-faint">
                          <span>Remote · origin</span>
                          {remoteTotal > 0 && (
                            <span className="font-normal normal-case tracking-normal text-muted">
                              {visibleRemote.length} / {remoteTotal}
                            </span>
                          )}
                        </div>
                      )}
                      {visibleRemote.map((branch, idx) => {
                        const opacity = idx < 6 ? 1 : idx < 10 ? 0.85 : 0.65;
                        const shortName = branch.name.replace(/^[^/]+\//, '');
                        return (
                          <button
                            key={branch.name}
                            onClick={() => handleRemoteToWorktree(branch.name)}
                            disabled={convertingBranch !== null || remoteCheckingOut !== null}
                            style={{ opacity }}
                            className="group flex items-center gap-2 rounded-md px-3 py-2 text-left transition-colors hover:bg-elevated disabled:opacity-50"
                          >
                            <Cloud className="h-3.5 w-3.5 shrink-0 text-violet-400" />
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-mono text-xs text-primary" title={branch.name}>
                                <span className="text-faint">origin/</span>{shortName}
                              </div>
                              {(branch.authorName || branch.committerDate > 0) && (
                                <div className="truncate text-[11px] text-muted">
                                  {branch.authorName}
                                  {branch.authorName && branch.committerDate > 0 && ' · '}
                                  {branch.committerDate > 0 && relativeTime(branch.committerDate)}
                                </div>
                              )}
                            </div>
                            {remoteCheckingOut === branch.name ? (
                              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-violet-400" />
                            ) : (
                              <span className="rounded-full border border-violet-500/25 bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-medium text-violet-300">
                                track
                              </span>
                            )}
                          </button>
                        );
                      })}
                      {canServerSearch && (
                        <div className="mt-1 flex items-center gap-2 rounded border-l-2 border-violet-500/30 bg-violet-500/5 px-3 py-2 text-[11px] text-tertiary">
                          <span>Not finding it?</span>
                          <button
                            onClick={() => fetchRemoteBranches({ search: remoteSearch })}
                            className="font-medium text-violet-300 underline-offset-2 hover:underline"
                          >
                            Search all {remoteTotal} branches
                          </button>
                        </div>
                      )}
                      {!remoteLoading && availableBranches.length === 0 && visibleRemote.length === 0 && !canServerSearch && (
                        <p className="py-4 text-center text-xs text-muted">
                          {search ? 'No matching branches' : 'No branches available'}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })()
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
            {isGit && startPoints.length > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <label className="text-[12px] text-muted shrink-0">Based on:</label>
                <select
                  value={startPoint}
                  onChange={e => setStartPoint(e.target.value)}
                  className="flex-1 min-w-0 rounded-md border border-border-input bg-elevated px-2 py-1 font-mono text-[12px] text-primary outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus"
                >
                  {startPoints.map(sp => (
                    <option key={sp.name} value={sp.name}>
                      {sp.name}{sp.isDefault ? ' (default)' : ''}{sp.isRemote ? ' [remote]' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
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
