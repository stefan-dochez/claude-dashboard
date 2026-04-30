import { useEffect, useRef, useState } from 'react';
import {
  GitBranch,
  GitBranchPlus,
  X,
  Folder,
  Sparkles,
  RotateCw,
  Play,
  Loader2,
  Info,
  Keyboard,
} from 'lucide-react';
import type { Instance } from '../types';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface ForkToWorktreeModalProps {
  source: Instance;
  onClose: () => void;
  onForked: (newInstance: Instance, sourceInstanceId: string) => void;
  onError: (message: string) => void;
}

/** Slugify-mimic of the backend so the user sees the path that will be created. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function deriveBranchName(summary: string): string {
  // Prefer the line right after "## Goal", fallback to first non-heading line.
  const lines = summary.split('\n').map(l => l.trim());
  const goalIdx = lines.findIndex(l => /^##\s*goal/i.test(l));
  let candidate = '';
  if (goalIdx >= 0) {
    for (let i = goalIdx + 1; i < lines.length; i++) {
      if (lines[i] && !lines[i].startsWith('#')) {
        candidate = lines[i];
        break;
      }
    }
  }
  if (!candidate) {
    candidate = lines.find(l => l && !l.startsWith('#') && !l.startsWith('---')) ?? '';
  }
  const slug = slugify(candidate).split('-').slice(0, 5).join('-');
  return slug ? `feat/${slug}` : 'feat/forked-investigation';
}

export default function ForkToWorktreeModal({ source, onClose, onForked, onError }: ForkToWorktreeModalProps) {
  const modalRef = useFocusTrap<HTMLDivElement>();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [summary, setSummary] = useState('');
  const [branchName, setBranchName] = useState('feat/forked-investigation');
  // Tracks whether the user has manually edited the branch name. Auto-suggest
  // only overwrites it as long as the user hasn't claimed ownership.
  const [branchTouched, setBranchTouched] = useState(false);
  const [keepSource, setKeepSource] = useState(true);
  const [autoAttach, setAutoAttach] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const repoPath = source.parentProjectPath ?? source.projectPath;
  const previewSlug = (() => {
    const trimmed = branchName.trim();
    const slashIdx = trimmed.indexOf('/');
    const taskPart = slashIdx > 0 ? trimmed.slice(slashIdx + 1) : trimmed;
    return slugify(taskPart) || 'forked-investigation';
  })();
  const previewWorktreePath = `${repoPath}--${previewSlug}`;

  const fetchSummary = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/instances/${source.id}/summarize`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Summarize failed (${res.status})`);
      }
      const { summary: generated } = await res.json() as { summary: string };
      setSummary(generated);
      if (!branchTouched) setBranchName(deriveBranchName(generated));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate summary');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.id]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      // Cmd/Ctrl+Enter submits — only when ready and not blocked from inside an input/textarea.
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        void handleSubmit();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, summary, branchName, loading, submitting]);

  const handleSubmit = async () => {
    if (loading || submitting) return;
    if (!summary.trim()) {
      setError('Summary cannot be empty');
      return;
    }
    if (!branchName.trim()) {
      setError('Branch name cannot be empty');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/instances/${source.id}/fork`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchName: branchName.trim(),
          summary: summary.trim(),
          killSource: !keepSource,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Fork failed (${res.status})`);
      }
      const { instance } = await res.json() as { instance: Instance };
      onForked(instance, source.id);
      onClose();
      if (autoAttach) {
        // Parent decides what "attach" means; we surface the new instance via onForked.
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Fork failed';
      setError(message);
      onError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const tokenEstimate = Math.max(1, Math.round(summary.length / 4));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="mx-4 w-full max-w-[560px] rounded-xl border border-border-input bg-surface shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-md bg-violet-500/15 text-violet-300">
              <GitBranchPlus className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-primary">Fork to worktree</div>
              <div className="text-[11px] text-muted">Continue this investigation on a new branch</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted transition-colors hover:bg-elevated hover:text-secondary"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Source line */}
        <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-2.5 text-[12px]">
          <span className="text-faint">From</span>
          <span className="flex items-center gap-1 rounded bg-elevated px-1.5 py-0.5 font-mono text-secondary">
            <GitBranch className="h-3 w-3 text-violet-300" />
            {source.branchName ?? source.projectName}
          </span>
          <span className="ml-auto text-faint">
            {source.totalCostUsd ? `$${source.totalCostUsd.toFixed(4)}` : ''}
          </span>
        </div>

        {/* Body */}
        <div className="space-y-4 px-4 py-4">
          {/* Branch name */}
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-faint">
              Branch name
            </label>
            <div className="flex items-center gap-2 rounded-md border border-border-input bg-elevated px-2.5 py-1.5 focus-within:border-violet-500/50">
              <GitBranch className="h-3.5 w-3.5 text-muted" />
              <input
                value={branchName}
                onChange={e => { setBranchName(e.target.value); setBranchTouched(true); }}
                className="flex-1 bg-transparent font-mono text-[13px] text-primary outline-none placeholder:text-faint"
                placeholder="feat/my-branch"
              />
              <button
                onClick={() => { setBranchName(deriveBranchName(summary)); setBranchTouched(false); }}
                className="rounded p-1 text-muted transition-colors hover:bg-[#2a2a2a] hover:text-violet-300"
                title="Re-suggest from summary"
                disabled={!summary}
              >
                <Sparkles className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-faint">
              <Folder className="h-3 w-3" />
              <span className="truncate font-mono" title={previewWorktreePath}>{previewWorktreePath}</span>
            </div>
          </div>

          {/* Handoff summary */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-[11px] font-medium uppercase tracking-wider text-faint">
                Handoff summary
              </label>
              <button
                onClick={fetchSummary}
                disabled={loading || submitting}
                className="flex items-center gap-1 text-[11px] text-muted transition-colors hover:text-violet-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RotateCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                Regenerate
              </button>
            </div>

            {loading ? (
              <div className="space-y-2 rounded-md border border-border-input bg-elevated p-3">
                <div className="flex items-center gap-2 text-[11px] text-muted">
                  <Loader2 className="h-3 w-3 animate-spin text-violet-300" />
                  <span>Asking the source instance to summarize the investigation…</span>
                </div>
                <div className="space-y-2 pt-1">
                  <div className="h-2.5 w-3/4 animate-pulse rounded bg-[#262626]" />
                  <div className="h-2.5 w-full animate-pulse rounded bg-[#262626]" />
                  <div className="h-2.5 w-5/6 animate-pulse rounded bg-[#262626]" />
                  <div className="h-2.5 w-2/3 animate-pulse rounded bg-[#262626]" />
                </div>
              </div>
            ) : (
              <>
                <textarea
                  ref={textareaRef}
                  rows={11}
                  value={summary}
                  onChange={e => setSummary(e.target.value)}
                  className="w-full resize-none rounded-md border border-border-input bg-elevated px-3 py-2.5 font-mono text-[12.5px] text-secondary outline-none focus:border-violet-500/50"
                />
                <div className="mt-1 flex items-center justify-between text-[11px] text-faint">
                  <span>Editable · markdown · ~{tokenEstimate} tokens</span>
                  <span className="flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    Sent as the first message to the new instance
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Options */}
          <div className="space-y-2 pt-1">
            <label className="flex cursor-pointer items-center gap-2 text-[12px] text-secondary">
              <input
                type="checkbox"
                checked={keepSource}
                onChange={e => setKeepSource(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border-input bg-elevated accent-violet-500"
              />
              Keep original instance running
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-[12px] text-secondary">
              <input
                type="checkbox"
                checked={autoAttach}
                onChange={e => setAutoAttach(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border-input bg-elevated accent-violet-500"
              />
              Auto-attach to the new instance
            </label>
          </div>

          {error && (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 rounded-b-xl border-t border-border-subtle bg-[#141414] px-4 py-3">
          <div className="flex items-center gap-1.5 text-[11px] text-faint">
            <Keyboard className="h-3 w-3" />
            <span className="font-mono">⌘ ↵</span>
            <span>to launch ·</span>
            <span className="font-mono">Esc</span>
            <span>to cancel</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-border-input px-3 py-1.5 text-[12px] text-secondary hover:bg-elevated"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || submitting || !summary.trim() || !branchName.trim()}
              className="flex items-center gap-1.5 rounded-md bg-violet-500/90 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-violet-500/30 disabled:text-white/60"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Creating worktree…</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" />
                  <span>Create worktree &amp; launch</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
