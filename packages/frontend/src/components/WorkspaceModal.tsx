import { useState, useEffect, useMemo, useCallback } from 'react';
import { Box, X, Search, Loader2, Check, AlertCircle, Trash2, GitBranch } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useSocketEvent } from '../hooks/useSocket';
import { usePlatform } from '../hooks/usePlatform';
import type { Project, WorkspaceProgressEvent, WorkspaceDoneEvent } from '../types';
import type { Toast } from '../hooks/useToasts';

interface WorkspaceModalProps {
  /** 'create' builds a new workspace; 'manage' adds/removes repos in an existing one. */
  mode: 'create' | 'manage';
  /** The workspace being managed — required in manage mode. */
  workspace?: Project;
  projects: Project[];
  scanPaths: string[];
  onClose: () => void;
  /** Called when the workspace content changed (created, repo added/removed) so the caller can refresh. */
  onChanged: () => void;
  addToast: (type: Toast['type'], message: string, detail?: string, duration?: number) => string;
}

interface RepoProgress {
  name: string;
  status: 'pending' | 'cloning' | 'done' | 'error';
  error?: string;
}

/** Derive a directory name from a clone URL: last path segment minus `.git`. */
function deriveRepoName(url: string): string {
  const stripped = url.replace(/\.git\/?$/, '');
  return stripped.split(/[/:]/).filter(Boolean).pop() ?? url;
}

/** True when `child` is a direct child directory of `parent` (handles / and \). */
function isDirectChild(parent: string, child: string): boolean {
  if (!child.startsWith(parent)) return false;
  const rest = child.slice(parent.length);
  if (!rest.startsWith('/') && !rest.startsWith('\\')) return false;
  return !/[/\\]/.test(rest.slice(1));
}

export default function WorkspaceModal({
  mode, workspace, projects, scanPaths, onClose, onChanged, addToast,
}: WorkspaceModalProps) {
  const modalRef = useFocusTrap<HTMLDivElement>();
  const { shortenPath } = usePlatform();

  const [phase, setPhase] = useState<'form' | 'cloning'>('form');
  const [name, setName] = useState('');
  const [parentPath, setParentPath] = useState(scanPaths[0] ?? '');
  const [filter, setFilter] = useState('');
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [urlsText, setUrlsText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [targetPath, setTargetPath] = useState<string | null>(workspace?.path ?? null);
  const [progress, setProgress] = useState<RepoProgress[]>([]);
  const [cloneFinished, setCloneFinished] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  // Repos already in the workspace (manage mode) — direct git children.
  const currentRepos = useMemo(() => {
    if (!workspace) return [];
    return projects.filter(p => isDirectChild(workspace.path, p.path));
  }, [workspace, projects]);

  const currentNames = useMemo(() => new Set(currentRepos.map(r => r.name)), [currentRepos]);

  // Pickable repos: scanned git projects with a known origin, not worktrees,
  // not already in the workspace (manage mode).
  const pickableProjects = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return projects
      .filter(p => p.type !== 'workspace' && !p.isWorktree && p.remoteUrl)
      .filter(p => !currentNames.has(p.name))
      .filter(p => !q || p.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [projects, currentNames, filter]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const togglePath = useCallback((path: string) => {
    setSelectedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  // Build the repos payload from the picker selection + free URLs.
  const buildRepos = useCallback((): Array<{ url: string; name?: string }> => {
    const fromPicker = projects
      .filter(p => selectedPaths.has(p.path) && p.remoteUrl)
      .map(p => ({ url: p.remoteUrl!, name: p.name }));
    const fromUrls = urlsText
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(url => ({ url }));
    return [...fromPicker, ...fromUrls];
  }, [projects, selectedPaths, urlsText]);

  const repoCount = selectedPaths.size + urlsText.split('\n').filter(l => l.trim()).length;

  const handleSubmit = useCallback(async () => {
    const repos = buildRepos();
    setSubmitting(true);
    try {
      if (mode === 'create') {
        const res = await fetch('/api/workspaces', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), parentPath, repos }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error ?? 'Failed to create workspace');
        }
        const { workspacePath } = await res.json() as { workspacePath: string };
        setTargetPath(workspacePath);
      } else {
        const res = await fetch('/api/workspaces/repos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspacePath: workspace!.path, repos }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error ?? 'Failed to add repos');
        }
      }
      if (repos.length === 0) {
        // Nothing to clone — done already (create mode with empty workspace).
        addToast('success', `Workspace ${name.trim()} created`);
        onChanged();
        onClose();
        return;
      }
      setProgress(repos.map(r => ({ name: r.name ?? deriveRepoName(r.url), status: 'pending' })));
      setPhase('cloning');
    } catch (err) {
      addToast('error', mode === 'create' ? 'Failed to create workspace' : 'Failed to add repos', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  }, [mode, name, parentPath, workspace, buildRepos, addToast, onChanged, onClose]);

  // Live per-repo clone status
  useSocketEvent<WorkspaceProgressEvent>('workspace:progress', useCallback((event) => {
    if (!targetPath || event.workspacePath !== targetPath) return;
    setProgress(prev => prev.map(p =>
      p.name === event.repo ? { ...p, status: event.status, error: event.error } : p,
    ));
  }, [targetPath]));

  useSocketEvent<WorkspaceDoneEvent>('workspace:done', useCallback((event) => {
    if (!targetPath || event.workspacePath !== targetPath) return;
    setCloneFinished(true);
    const failed = event.results.filter(r => r.status === 'error');
    if (event.error) {
      addToast('error', 'Workspace clone failed', event.error);
    } else if (failed.length > 0) {
      addToast('error', `${failed.length} clone${failed.length > 1 ? 's' : ''} failed`, failed.map(f => `${f.name}: ${f.error}`).join('\n'), 10000);
    } else {
      addToast('success', mode === 'create' ? 'Workspace ready' : 'Repos added', `${event.results.length} repo${event.results.length > 1 ? 's' : ''} cloned`);
    }
    onChanged();
  }, [targetPath, mode, addToast, onChanged]));

  const handleRemoveRepo = useCallback(async (repoName: string) => {
    if (!workspace) return;
    setRemoving(repoName);
    try {
      const res = await fetch('/api/workspaces/repos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspacePath: workspace.path, repoName }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to remove repo');
      }
      addToast('success', `Removed ${repoName}`);
      onChanged();
    } catch (err) {
      addToast('error', `Failed to remove ${repoName}`, err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setRemoving(null);
      setConfirmRemove(null);
    }
  }, [workspace, addToast, onChanged]);

  const canSubmit = mode === 'create'
    ? name.trim().length > 0 && parentPath.length > 0 && !submitting
    : repoCount > 0 && !submitting;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="mx-4 flex max-h-[85vh] w-full max-w-lg flex-col rounded-lg border border-border-input bg-surface p-4 shadow-lg"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-3 flex shrink-0 items-center justify-between">
          <div className="flex items-center gap-2 text-primary">
            <Box className="h-4 w-4 text-cyan-400" />
            <span className="text-sm font-semibold">
              {mode === 'create' ? 'New Workspace' : `Manage ${workspace?.name}`}
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted transition-colors hover:bg-elevated hover:text-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {phase === 'cloning' ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <p className="mb-2 text-[12px] text-muted">
              {cloneFinished ? 'Clones finished.' : 'Cloning repos — this can take a while for large repos. Closing this dialog won\'t stop the clones.'}
            </p>
            <div className="mb-3 flex flex-col gap-1.5 overflow-y-auto">
              {progress.map(repo => (
                <div key={repo.name} className="flex items-center gap-2 rounded-md bg-elevated/40 px-2.5 py-1.5">
                  {repo.status === 'cloning' && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-400" />}
                  {repo.status === 'pending' && <div className="h-3.5 w-3.5 shrink-0 rounded-full border border-border-input" />}
                  {repo.status === 'done' && <Check className="h-3.5 w-3.5 shrink-0 text-green-400" />}
                  {repo.status === 'error' && <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" />}
                  <span className="min-w-0 flex-1 truncate text-[12px] text-secondary">{repo.name}</span>
                  {repo.error && (
                    <span className="max-w-[200px] truncate text-[10px] text-rose-300" title={repo.error}>{repo.error}</span>
                  )}
                </div>
              ))}
            </div>
            <div className="flex shrink-0 justify-end">
              <button
                onClick={onClose}
                className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                  cloneFinished
                    ? 'bg-green-600 text-white hover:bg-green-500'
                    : 'text-tertiary hover:bg-elevated hover:text-primary'
                }`}
              >
                {cloneFinished ? 'Done' : 'Close (keep cloning)'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {mode === 'create' && (
              <>
                <p className="mb-1 text-xs font-medium text-secondary">Name</p>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="prj-my-feature"
                  autoFocus
                  className="mb-3 rounded-md border border-border-input bg-elevated px-3 py-1.5 text-sm text-primary placeholder-placeholder outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus"
                />

                <p className="mb-1 text-xs font-medium text-secondary">Location</p>
                <select
                  value={parentPath}
                  onChange={e => setParentPath(e.target.value)}
                  className="mb-3 cursor-pointer rounded-md border border-border-input bg-elevated px-2.5 py-1.5 text-sm text-primary outline-none focus:border-border-focus"
                >
                  {scanPaths.map(p => (
                    <option key={p} value={p}>{shortenPath(p)}</option>
                  ))}
                </select>
              </>
            )}

            {mode === 'manage' && currentRepos.length > 0 && (
              <>
                <p className="mb-1 text-xs font-medium text-secondary">Repos in workspace</p>
                <div className="mb-3 flex max-h-36 flex-col gap-1 overflow-y-auto">
                  {currentRepos.map(repo => (
                    <div key={repo.path} className="flex items-center gap-2 rounded-md bg-elevated/40 px-2.5 py-1.5">
                      <GitBranch className="h-3 w-3 shrink-0 text-faint" />
                      <span className="min-w-0 flex-1 truncate text-[12px] text-secondary">{repo.name}</span>
                      {repo.gitBranch && <span className="shrink-0 text-[10px] text-faint">{repo.gitBranch}</span>}
                      {confirmRemove === repo.name ? (
                        <button
                          onClick={() => handleRemoveRepo(repo.name)}
                          disabled={removing === repo.name}
                          className="shrink-0 rounded bg-rose-600/20 px-1.5 py-0.5 text-[10px] font-medium text-rose-300 transition-colors hover:bg-rose-600/40 disabled:opacity-50"
                        >
                          {removing === repo.name ? 'Removing…' : 'Confirm delete?'}
                        </button>
                      ) : (
                        <button
                          onClick={() => setConfirmRemove(repo.name)}
                          className="shrink-0 rounded p-0.5 text-faint transition-colors hover:text-rose-300"
                          title="Delete this clone from the workspace"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            <p className="mb-1 text-xs font-medium text-secondary">
              {mode === 'create' ? 'Repos to clone' : 'Add repos'}
            </p>
            <p className="mb-2 text-[12px] text-muted">
              Pick from scanned projects (cloned from their origin) or paste git URLs below.
            </p>

            <div className="relative mb-1.5">
              <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-faint" />
              <input
                type="text"
                placeholder="Filter projects..."
                value={filter}
                onChange={e => setFilter(e.target.value)}
                className="w-full rounded-md border border-border-input bg-elevated py-1.5 pl-7 pr-2 text-[12px] text-secondary placeholder-placeholder outline-none focus:border-border-focus"
              />
            </div>
            <div className="mb-3 flex max-h-44 min-h-[60px] flex-col gap-0.5 overflow-y-auto rounded-md border border-border-input p-1">
              {pickableProjects.length === 0 ? (
                <p className="py-3 text-center text-[11px] text-faint">
                  {filter ? 'No projects match' : 'No scanned projects with a git origin'}
                </p>
              ) : (
                pickableProjects.map(p => (
                  <label
                    key={p.path}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 transition-colors hover:bg-elevated/50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedPaths.has(p.path)}
                      onChange={() => togglePath(p.path)}
                      className="h-3 w-3 accent-cyan-500"
                    />
                    <span className="min-w-0 flex-1 truncate text-[12px] text-secondary">{p.name}</span>
                    <span className="max-w-[180px] shrink-0 truncate text-[10px] text-faint" title={p.remoteUrl ?? undefined}>
                      {p.remoteUrl}
                    </span>
                  </label>
                ))
              )}
            </div>

            <p className="mb-1 text-xs font-medium text-secondary">Git URLs (one per line)</p>
            <textarea
              value={urlsText}
              onChange={e => setUrlsText(e.target.value)}
              placeholder={'git@github.com:org/repo.git'}
              rows={2}
              className="mb-4 resize-y rounded-md border border-border-input bg-elevated px-3 py-1.5 font-mono text-[12px] text-primary placeholder-placeholder outline-none focus:border-border-focus"
            />

            <div className="flex shrink-0 items-center justify-end gap-2">
              {repoCount > 0 && (
                <span className="mr-auto text-[11px] text-faint">
                  {repoCount} repo{repoCount > 1 ? 's' : ''} to clone
                </span>
              )}
              <button
                onClick={onClose}
                className="rounded px-3 py-1.5 text-xs text-tertiary transition-colors hover:bg-elevated hover:text-primary"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="rounded bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-cyan-500 disabled:opacity-50"
              >
                {submitting
                  ? (mode === 'create' ? 'Creating…' : 'Adding…')
                  : (mode === 'create' ? 'Create workspace' : 'Add repos')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
