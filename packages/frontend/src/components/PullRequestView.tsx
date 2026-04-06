import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, GitBranch, GitCommit, Plus, Minus, FileText, Info } from 'lucide-react';
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

  const isDefaultBranch = !branchName || DEFAULT_BRANCHES.includes(branchName);

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
  }, [fetchBranchDiff]);

  if (isDefaultBranch) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Info className="mx-auto mb-3 h-8 w-8 text-neutral-600" />
          <p className="text-sm text-neutral-400">
            This instance is on the default branch
          </p>
          <p className="mt-1 text-xs text-neutral-600">
            Switch to a feature branch to see the PR diff
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw className="h-5 w-5 animate-spin text-neutral-600" />
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
            className="mt-2 rounded bg-neutral-800 px-3 py-1 text-xs text-neutral-300 transition-colors hover:bg-neutral-700"
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
      <div className="flex-shrink-0 border-b border-neutral-800 bg-[#0f0f0f] px-4 py-3">
        <div className="flex items-center gap-4">
          {/* Branch info */}
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-violet-400" />
            <span className="rounded bg-violet-500/15 px-2 py-0.5 font-mono text-xs font-medium text-violet-300">
              {data.currentBranch}
            </span>
            <span className="text-xs text-neutral-500">into</span>
            <span className="rounded bg-neutral-700/50 px-2 py-0.5 font-mono text-xs text-neutral-300">
              {data.baseBranch}
            </span>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1 text-neutral-400">
              <FileText className="h-3.5 w-3.5" />
              {data.stats.filesChanged} file{data.stats.filesChanged !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1 text-green-400">
              <Plus className="h-3.5 w-3.5" />
              {data.stats.additions}
            </span>
            <span className="flex items-center gap-1 text-red-400">
              <Minus className="h-3.5 w-3.5" />
              {data.stats.deletions}
            </span>
          </div>

          {/* Refresh */}
          <button
            onClick={fetchBranchDiff}
            className="ml-auto rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-300"
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Commits */}
        {data.commits.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {data.commits.map((c) => (
              <div
                key={c.hash}
                className="flex items-center gap-1.5 rounded bg-neutral-800/60 px-2 py-0.5"
                title={`${c.hash} — ${c.date}`}
              >
                <GitCommit className="h-3 w-3 text-neutral-500" />
                <span className="font-mono text-[10px] text-neutral-500">{c.hash}</span>
                <span className="max-w-[200px] truncate text-[11px] text-neutral-400">{c.message}</span>
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
          <div className="flex h-full items-center justify-center text-sm text-neutral-500">
            No differences with {data.baseBranch}
          </div>
        )}
      </div>
    </div>
  );
}
