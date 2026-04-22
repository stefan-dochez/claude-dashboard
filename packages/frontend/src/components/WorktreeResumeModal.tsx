import { useEffect } from 'react';
import { Play, X, GitBranch, Terminal, MessageSquare, Plus } from 'lucide-react';
import type { Project, HistoryTask } from '../types';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface WorktreeResumeModalProps {
  worktree: Project;
  sessions: HistoryTask[];
  onNewSession: (worktreePath: string) => void;
  onResume: (task: HistoryTask) => void;
  onClose: () => void;
}

export default function WorktreeResumeModal({
  worktree,
  sessions,
  onNewSession,
  onResume,
  onClose,
}: WorktreeResumeModalProps) {
  const modalRef = useFocusTrap<HTMLDivElement>();

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleNew = () => {
    onNewSession(worktree.path);
    onClose();
  };

  const handleResume = (task: HistoryTask) => {
    onResume(task);
    onClose();
  };

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
          <div className="flex min-w-0 items-center gap-2 text-primary">
            <GitBranch className="h-4 w-4 shrink-0 text-violet-400" />
            <span className="truncate text-sm font-semibold" title={worktree.gitBranch ?? worktree.name}>
              {worktree.gitBranch ?? worktree.name}
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted transition-colors hover:bg-elevated hover:text-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <button
          onClick={handleNew}
          className="mb-3 flex w-full items-center gap-2.5 rounded-md border border-green-500/20 bg-green-500/5 px-3 py-2.5 text-left transition-colors hover:border-green-500/40 hover:bg-green-500/10"
        >
          <Plus className="h-4 w-4 shrink-0 text-green-400" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-primary">New session</div>
            <div className="text-[12px] text-muted">Start a fresh Claude instance on this worktree</div>
          </div>
          <Play className="h-3.5 w-3.5 shrink-0 text-green-400/60" />
        </button>

        <div className="mb-1.5 px-1 text-[10px] font-medium uppercase tracking-wider text-faint">
          Resume previous session
        </div>
        <div className="flex max-h-64 flex-col gap-1 overflow-y-auto pr-1">
          {sessions.map(task => (
            <button
              key={task.id}
              onClick={() => handleResume(task)}
              className="group flex items-center gap-2 rounded-md px-3 py-2 text-left transition-colors hover:bg-elevated"
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
                  {task.endedAt && <span>{new Date(task.endedAt).toLocaleDateString()}</span>}
                  {task.totalCostUsd > 0 && <span>${task.totalCostUsd.toFixed(4)}</span>}
                </div>
              </div>
              <Play className="h-3.5 w-3.5 shrink-0 text-faint transition-colors group-hover:text-green-400" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
