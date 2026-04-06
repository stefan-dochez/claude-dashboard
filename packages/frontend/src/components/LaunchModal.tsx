import { useState, useEffect, useRef } from 'react';
import { Play, X, GitBranch, ArrowRightLeft } from 'lucide-react';
import type { Project } from '../types';

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

interface LaunchModalProps {
  project: Project;
  worktrees: Project[];
  onLaunch: (projectPath: string, taskDescription?: string, detachBranch?: boolean, branchPrefix?: string) => void;
  onClose: () => void;
}

export default function LaunchModal({ project, worktrees, onLaunch, onClose }: LaunchModalProps) {
  const [taskDescription, setTaskDescription] = useState('');
  const [branchPrefix, setBranchPrefix] = useState('feat');
  const [mode, setMode] = useState<'new' | 'existing'>(worktrees.length > 0 ? 'existing' : 'new');
  const inputRef = useRef<HTMLInputElement>(null);

  const isGit = project.gitBranch !== null;
  const canDetach = isGit && !project.isWorktree && project.gitBranch !== null && !MAIN_BRANCHES.includes(project.gitBranch);

  useEffect(() => {
    if (mode === 'new') {
      inputRef.current?.focus();
    }
  }, [mode]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleSubmitNew = () => {
    const desc = taskDescription.trim();
    onLaunch(project.path, desc || undefined, undefined, isGit ? branchPrefix : undefined);
    onClose();
  };

  const handleResumeWorktree = (worktreePath: string) => {
    onLaunch(worktreePath);
    onClose();
  };

  const handleDetachBranch = () => {
    onLaunch(project.path, undefined, true);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmitNew();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="mx-4 w-full max-w-sm rounded-lg border border-neutral-700 bg-neutral-900 p-4 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-neutral-200">
            <Play className="h-4 w-4 text-green-400" />
            <span className="text-sm font-semibold">Launch {project.name}</span>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-300"
          >
            <X className="h-4 w-4" />
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
              <div className="text-xs font-medium text-neutral-200">
                Move <span className="text-amber-400">{project.gitBranch}</span> to worktree
              </div>
              <div className="text-[10px] text-neutral-500">
                Creates a worktree for the current branch and resets repo to default branch
              </div>
            </div>
            <Play className="h-3.5 w-3.5 shrink-0 text-amber-400/60" />
          </button>
        )}

        {/* Mode tabs when worktrees exist */}
        {worktrees.length > 0 && (
          <div className="mb-3 flex rounded-md border border-neutral-700 text-xs">
            <button
              onClick={() => setMode('existing')}
              className={`flex-1 rounded-l-md px-3 py-1.5 font-medium transition-colors ${
                mode === 'existing'
                  ? 'bg-neutral-700 text-neutral-200'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              Resume ({worktrees.length})
            </button>
            <button
              onClick={() => setMode('new')}
              className={`flex-1 rounded-r-md px-3 py-1.5 font-medium transition-colors ${
                mode === 'new'
                  ? 'bg-neutral-700 text-neutral-200'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              New task
            </button>
          </div>
        )}

        {mode === 'existing' ? (
          /* Existing worktrees list */
          <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
            {worktrees.map(wt => (
              <button
                key={wt.path}
                onClick={() => handleResumeWorktree(wt.path)}
                className="group flex items-center gap-2 rounded-md px-3 py-2 text-left transition-colors hover:bg-neutral-800"
              >
                <GitBranch className="h-3.5 w-3.5 shrink-0 text-violet-400" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-neutral-200" title={wt.gitBranch ?? wt.name}>
                    {wt.gitBranch ?? wt.name}
                  </div>
                  <div className="truncate text-[10px] text-neutral-500" title={wt.name}>
                    {wt.name}
                  </div>
                </div>
                <Play className="h-3.5 w-3.5 shrink-0 text-neutral-600 transition-colors group-hover:text-green-400" />
              </button>
            ))}
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
                    className={`rounded px-2 py-1 font-mono text-[11px] transition-colors ${
                      branchPrefix === value
                        ? 'bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/40'
                        : 'bg-neutral-800 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <input
              ref={inputRef}
              type="text"
              value={taskDescription}
              onChange={e => setTaskDescription(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What's the task?"
              className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500"
            />
            <p className="mt-1.5 text-[11px] text-neutral-500">
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
              className="rounded px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
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
