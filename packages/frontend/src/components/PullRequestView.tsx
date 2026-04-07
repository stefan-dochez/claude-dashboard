import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, GitBranch, GitCommit, Plus, Minus, FileText, Info, Copy, ExternalLink } from 'lucide-react';
import DiffViewer from './DiffViewer';
import type { BranchDiffResponse } from '../types';

interface PullRequestViewProps {
  projectPath: string;
  branchName: string | null;
}

const DEFAULT_BRANCHES = ['main', 'master', 'develop'];

export default function PullRequestView({ projectPath, branchName }: PullRequestViewProps) {
  const [data, setData] = useState<BranchDiffResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prUrl, setPrUrl] = useState<string | null>(null);

  const isDefaultBranch = !branchName || DEFAULT_BRANCHES.includes(branchName);

  const fetchPrUrl = useCallback(async () => {
    if (isDefaultBranch) return;
    try {
      const res = await fetch(`/api/git/pr-url?path=${encodeURIComponent(projectPath)}`);
      if (res.ok) {
        const data = await res.json();
        setPrUrl(data.url);
      }
    } catch {
      setPrUrl(null);
    }
  }, [projectPath, isDefaultBranch]);

  const fetchBranchDiff = useCallback(async () => {
    if (isDefaultBranch) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/git/branch-diff?path=${encodeURIComponent(projectPath)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(body.error);
      }
      const result: BranchDiffResponse = await res.json();
      setData(result);
    } catch (err) {
      console.error('[PullRequestView] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load branch diff');
    } finally {
      setLoading(false);
    }
  }, [projectPath, isDefaultBranch]);

  useEffect(() => {
    fetchBranchDiff();
    fetchPrUrl();
  }, [fetchBranchDiff, fetchPrUrl]);

  if (isDefaultBranch) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Info className="mx-auto mb-3 h-8 w-8 text-faint" />
          <p className="text-sm text-tertiary">
            This instance is on the default branch
          </p>
          <p className="mt-1 text-xs text-faint">
            Switch to a feature branch to see the PR diff
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw className="h-5 w-5 animate-spin text-faint" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-red-400">{error}</p>
          <button
            onClick={fetchBranchDiff}
            className="mt-2 rounded bg-elevated px-3 py-1 text-xs text-secondary transition-colors hover:bg-hover"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* PR header */}
      <div className="flex-shrink-0 border-b border-border-default bg-root px-3 py-2.5">
        {/* Branch + refresh row */}
        <div className="flex items-center gap-2">
          <GitBranch className="h-3.5 w-3.5 shrink-0 text-violet-400" />
          <span className="min-w-0 truncate rounded bg-violet-500/15 px-1.5 py-0.5 font-mono text-[11px] font-medium text-violet-300">
            {data.currentBranch}
          </span>
          <span className="shrink-0 text-[11px] text-muted">&rarr;</span>
          <span className="truncate rounded bg-hover/50 px-1.5 py-0.5 font-mono text-[11px] text-secondary">
            {data.baseBranch}
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {prUrl && (
              <a
                href={prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded bg-green-500/15 px-1.5 py-0.5 text-[11px] font-medium text-green-400 transition-colors hover:bg-green-500/25"
                title={prUrl}
              >
                <ExternalLink className="h-2.5 w-2.5" />
                PR
              </a>
            )}
            <button
              onClick={() => { fetchBranchDiff(); fetchPrUrl(); }}
              className="rounded p-1 text-muted transition-colors hover:bg-elevated hover:text-secondary"
              title="Refresh"
              aria-label="Refresh"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-1.5 flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1 text-tertiary">
            <FileText className="h-3 w-3" />
            {data.stats.filesChanged} file{data.stats.filesChanged !== 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1 text-green-400">
            <Plus className="h-3 w-3" />
            {data.stats.additions}
          </span>
          <span className="flex items-center gap-1 text-red-400">
            <Minus className="h-3 w-3" />
            {data.stats.deletions}
          </span>
          {!prUrl && !loading && (
            <span className="ml-auto text-[11px] text-faint">No PR</span>
          )}
        </div>

        {/* Commits (compact) */}
        {data.commits.length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            {data.commits.map((c) => (
              <div
                key={c.hash}
                className="group flex items-center gap-1.5 rounded bg-elevated/60 px-1.5 py-0.5"
                title={`${c.hash} — ${c.date}`}
              >
                <GitCommit className="h-2.5 w-2.5 shrink-0 text-muted" />
                <span className="shrink-0 font-mono text-[10px] text-muted">{c.hash}</span>
                <button
                  onClick={() => navigator.clipboard.writeText(c.hash)}
                  className="hidden shrink-0 text-faint transition-colors hover:text-secondary group-hover:block"
                  aria-label="Copy hash"
                >
                  <Copy className="h-2.5 w-2.5" />
                </button>
                <span className="min-w-0 truncate text-[11px] text-tertiary">{c.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Diff content */}
      <div className="flex-1 overflow-hidden">
        {data.diff ? (
          <DiffViewer diff={data.diff} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            No differences with {data.baseBranch}
          </div>
        )}
      </div>
    </div>
  );
}
