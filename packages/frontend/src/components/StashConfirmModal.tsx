import { useEffect } from 'react';
import { AlertTriangle, X, GitBranch, Archive } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface StashConfirmModalProps {
  projectName: string;
  currentBranch: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function StashConfirmModal({
  projectName,
  currentBranch,
  onConfirm,
  onCancel,
}: StashConfirmModalProps) {
  const modalRef = useFocusTrap<HTMLDivElement>();

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onCancel, onConfirm]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onCancel}
    >
      <div
        ref={modalRef}
        className="mx-4 w-full max-w-md rounded-lg border border-border-input bg-surface p-4 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2 text-primary">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
            <span className="truncate text-sm font-semibold">
              Uncommitted changes on {projectName}
            </span>
          </div>
          <button
            onClick={onCancel}
            className="rounded p-1 text-muted transition-colors hover:bg-elevated hover:text-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 rounded-md border border-border-subtle bg-elevated/50 px-3 py-2 text-xs text-secondary">
          Branch <span className="inline-flex items-center gap-1 font-mono text-primary"><GitBranch className="h-3 w-3 text-violet-400" />{currentBranch}</span> has uncommitted changes.
          <div className="mt-1.5 text-[11px] text-muted">
            Stashing saves them (including untracked files) so you can switch branches. Run <span className="font-mono text-tertiary">git stash pop</span> when you return to {currentBranch} to restore them.
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-border-input px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:bg-elevated"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-500/20"
          >
            <Archive className="h-3.5 w-3.5" />
            Stash and switch
          </button>
        </div>
      </div>
    </div>
  );
}
