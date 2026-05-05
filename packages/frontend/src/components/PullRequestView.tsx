import { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, GitBranch, GitCommit, Plus, Minus, FileText, Info, Copy, ExternalLink, CheckCircle2, XCircle, CircleDot, GitMerge, MessageSquare, Send, ChevronDown, ChevronRight, CheckCircle } from 'lucide-react';
import DiffViewer from './DiffViewer';
import type { BranchDiffResponse, PrCommentsResponse, PrReviewComment, PrReviewThread, PrReviewSummary } from '../types';

interface CheckRun {
  name: string;
  status: string;
  conclusion: string | null;
  url: string;
  startedAt: string | null;
  completedAt: string | null;
}

type CiState = 'success' | 'failure' | 'running' | 'neutral';

function deriveCiState(checks: CheckRun[]): CiState {
  if (checks.length === 0) return 'neutral';
  let hasRunning = false;
  let hasFailure = false;
  let hasSuccess = false;
  for (const c of checks) {
    if (c.status === 'queued' || c.status === 'in_progress') {
      hasRunning = true;
      continue;
    }
    switch (c.conclusion) {
      case 'failure':
      case 'timed_out':
      case 'action_required':
        hasFailure = true;
        break;
      case 'success':
        hasSuccess = true;
        break;
      // cancelled, skipped, neutral → ignored
    }
  }
  // Failure wins over running (actionable state comes first)
  if (hasFailure) return 'failure';
  if (hasRunning) return 'running';
  if (hasSuccess) return 'success';
  return 'neutral';
}

interface PullRequestViewProps {
  projectPath: string;
  branchName: string | null;
  onSendToSession?: (text: string) => void;
}

function formatLocation(path: string | null, line: number | null): string {
  if (!path) return '(general)';
  return line ? `${path}:${line}` : path;
}

function quoteHunk(diffHunk: string | undefined | null): string {
  if (!diffHunk?.trim()) return '';
  return '\n' + diffHunk.split('\n').map(l => `> ${l}`).join('\n') + '\n';
}

function formatComment(c: PrReviewComment): string {
  return `PR review comment by @${c.author} on ${formatLocation(c.path, c.line)}${quoteHunk(c.diffHunk)}\n${c.body}`;
}

function formatThread(t: PrReviewThread): string {
  const first = t.comments[0];
  const hunk = quoteHunk(first?.diffHunk);
  const body = t.comments.map(c => `@${c.author}: ${c.body}`).join('\n\n');
  return `PR review thread on ${formatLocation(t.path, t.line)}${hunk}\n${body}`;
}

function formatReview(r: PrReviewSummary): string {
  return `PR review by @${r.author} — ${r.state}\n\n${r.body}`;
}

const DEFAULT_BRANCHES = ['main', 'master', 'develop'];

export default function PullRequestView({ projectPath, branchName, onSendToSession }: PullRequestViewProps) {
  const [data, setData] = useState<BranchDiffResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [prState, setPrState] = useState<'OPEN' | 'MERGED' | 'CLOSED' | null>(null);
  const [checks, setChecks] = useState<CheckRun[]>([]);
  const [comments, setComments] = useState<PrCommentsResponse>({ reviews: [], threads: [] });
  const [showResolved, setShowResolved] = useState(false);
  const [commentsCollapsed, setCommentsCollapsed] = useState(false);

  const isDefaultBranch = !branchName || DEFAULT_BRANCHES.includes(branchName);
  const headSha = data && data.commits.length > 0 ? data.commits[data.commits.length - 1].hash : null;

  const fetchPrUrl = useCallback(async () => {
    if (isDefaultBranch) return;
    try {
      const res = await fetch(`/api/git/pr-url?path=${encodeURIComponent(projectPath)}`);
      if (res.ok) {
        const data = await res.json() as { url: string | null; state: 'OPEN' | 'MERGED' | 'CLOSED' | null };
        setPrUrl(data.url);
        setPrState(data.state);
      }
    } catch {
      setPrUrl(null);
      setPrState(null);
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

  const fetchChecks = useCallback(async (sha: string) => {
    try {
      const res = await fetch(`/api/git/checks?path=${encodeURIComponent(projectPath)}&sha=${encodeURIComponent(sha)}`);
      if (res.ok) setChecks(await res.json());
    } catch {
      setChecks([]);
    }
  }, [projectPath]);

  const fetchComments = useCallback(async () => {
    if (isDefaultBranch) return;
    try {
      const res = await fetch(`/api/git/pr-comments?path=${encodeURIComponent(projectPath)}`);
      if (res.ok) setComments(await res.json());
    } catch {
      setComments({ reviews: [], threads: [] });
    }
  }, [projectPath, isDefaultBranch]);

  useEffect(() => {
    fetchBranchDiff();
    fetchPrUrl();
    fetchComments();
  }, [fetchBranchDiff, fetchPrUrl, fetchComments]);

  useEffect(() => {
    if (headSha) fetchChecks(headSha);
    else setChecks([]);
  }, [headSha, fetchChecks]);

  const visibleThreads = useMemo(
    () => showResolved ? comments.threads : comments.threads.filter(t => !t.isResolved),
    [comments.threads, showResolved],
  );
  const visibleReviews = useMemo(
    () => comments.reviews.filter(r => r.body?.trim().length > 0),
    [comments.reviews],
  );
  const totalCount = visibleReviews.length + visibleThreads.length;
  const hiddenResolvedCount = comments.threads.length - comments.threads.filter(t => !t.isResolved).length;
  const hasAnyComments = comments.reviews.length > 0 || comments.threads.length > 0;

  const ciState = useMemo(() => deriveCiState(checks), [checks]);
  const ciSummary = useMemo(() => {
    const passed = checks.filter(c => c.status === 'completed' && c.conclusion === 'success').length;
    const failed = checks.filter(c =>
      c.status === 'completed' && ['failure', 'timed_out', 'action_required'].includes(c.conclusion ?? ''),
    ).length;
    const running = checks.filter(c => c.status === 'queued' || c.status === 'in_progress').length;
    return { passed, failed, running, total: checks.length };
  }, [checks]);

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
            {prUrl && (() => {
              // Merged / closed PRs: the final CI status is stale, so surface the
              // PR lifecycle state on the button itself instead of a CI color.
              if (prState === 'MERGED') {
                return (
                  <a
                    href={prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 rounded bg-violet-500/15 px-1.5 py-0.5 text-[11px] font-medium text-violet-300 transition-colors hover:bg-violet-500/25"
                    title="PR merged"
                  >
                    <GitMerge className="h-2.5 w-2.5" />
                    PR
                  </a>
                );
              }
              if (prState === 'CLOSED') {
                return (
                  <a
                    href={prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 rounded bg-hover/50 px-1.5 py-0.5 text-[11px] font-medium text-faint transition-colors hover:bg-hover"
                    title="PR closed (not merged)"
                  >
                    <XCircle className="h-2.5 w-2.5" />
                    PR
                  </a>
                );
              }

              const styles: Record<CiState, { bg: string; text: string; hover: string; Icon: typeof CheckCircle2 | null; iconClass: string }> = {
                success: { bg: 'bg-green-500/15', text: 'text-green-400', hover: 'hover:bg-green-500/25', Icon: CheckCircle2, iconClass: '' },
                failure: { bg: 'bg-rose-500/15', text: 'text-rose-400', hover: 'hover:bg-rose-500/25', Icon: XCircle, iconClass: '' },
                running: { bg: 'bg-amber-500/15', text: 'text-amber-400', hover: 'hover:bg-amber-500/25', Icon: CircleDot, iconClass: 'animate-pulse' },
                neutral: { bg: 'bg-green-500/15', text: 'text-green-400', hover: 'hover:bg-green-500/25', Icon: null, iconClass: '' },
              };
              const s = styles[ciState];
              const title = ciSummary.total === 0
                ? prUrl
                : [
                    ciSummary.passed > 0 ? `${ciSummary.passed} passed` : null,
                    ciSummary.failed > 0 ? `${ciSummary.failed} failed` : null,
                    ciSummary.running > 0 ? `${ciSummary.running} running` : null,
                  ].filter(Boolean).join(' · ');
              const StatusIcon = s.Icon;
              return (
                <a
                  href={prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors ${s.bg} ${s.text} ${s.hover}`}
                  title={title}
                >
                  {StatusIcon
                    ? <StatusIcon className={`h-2.5 w-2.5 ${s.iconClass}`} />
                    : <ExternalLink className="h-2.5 w-2.5" />
                  }
                  PR
                </a>
              );
            })()}
            <button
              onClick={() => { fetchBranchDiff(); fetchPrUrl(); fetchComments(); if (headSha) fetchChecks(headSha); }}
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

      {/* Comments section */}
      {hasAnyComments && (
        <div className="flex max-h-[40vh] shrink-0 flex-col border-b border-border-default bg-root">
          <div className="flex shrink-0 items-center gap-2 px-3 py-1.5 text-[11px]">
            <button
              onClick={() => setCommentsCollapsed(c => !c)}
              className="flex items-center gap-1 text-secondary transition-colors hover:text-primary"
              aria-label={commentsCollapsed ? 'Expand comments' : 'Collapse comments'}
            >
              {commentsCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              <MessageSquare className="h-3 w-3" />
              <span className="font-medium">
                {totalCount} comment{totalCount !== 1 ? 's' : ''}
              </span>
            </button>
            {hiddenResolvedCount > 0 && (
              <button
                onClick={() => setShowResolved(s => !s)}
                className="ml-auto rounded px-1.5 py-0.5 text-[10px] text-muted transition-colors hover:bg-elevated hover:text-secondary"
                title={showResolved ? 'Hide resolved threads' : 'Show resolved threads'}
              >
                {showResolved ? 'Hide resolved' : `Show resolved (${hiddenResolvedCount})`}
              </button>
            )}
          </div>
          {!commentsCollapsed && (
            <div className="flex-1 overflow-y-auto px-3 pb-2">
              <div className="flex flex-col gap-2">
                {visibleReviews.map(r => (
                  <ReviewCard key={r.id} review={r} onSendToSession={onSendToSession} />
                ))}
                {visibleThreads.map(t => (
                  <ThreadCard key={t.id} thread={t} onSendToSession={onSendToSession} />
                ))}
                {totalCount === 0 && (
                  <div className="py-2 text-[11px] text-muted">No unresolved comments</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

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

function reviewStateBadge(state: string): { label: string; className: string } {
  switch (state) {
    case 'APPROVED':
      return { label: 'approved', className: 'bg-green-500/15 text-green-400' };
    case 'CHANGES_REQUESTED':
      return { label: 'changes requested', className: 'bg-rose-500/15 text-rose-400' };
    case 'COMMENTED':
      return { label: 'commented', className: 'bg-violet-500/15 text-violet-300' };
    case 'DISMISSED':
      return { label: 'dismissed', className: 'bg-hover/50 text-faint' };
    default:
      return { label: state.toLowerCase(), className: 'bg-hover/50 text-secondary' };
  }
}

interface ReviewCardProps {
  review: PrReviewSummary;
  onSendToSession?: (text: string) => void;
}

function ReviewCard({ review, onSendToSession }: ReviewCardProps) {
  const badge = reviewStateBadge(review.state);
  return (
    <div className="rounded border border-border-default bg-elevated/40 px-2 py-1.5">
      <div className="flex items-center gap-1.5 text-[11px]">
        <span className="font-medium text-secondary">@{review.author}</span>
        <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${badge.className}`}>{badge.label}</span>
        {onSendToSession && review.body?.trim() && (
          <button
            onClick={() => onSendToSession(formatReview(review))}
            className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted transition-colors hover:bg-hover hover:text-secondary"
            title="Send to session"
          >
            <Send className="h-2.5 w-2.5" />
            Send
          </button>
        )}
      </div>
      {review.body?.trim() && (
        <div className="mt-1 whitespace-pre-wrap text-[11px] text-tertiary">{review.body}</div>
      )}
    </div>
  );
}

interface ThreadCardProps {
  thread: PrReviewThread;
  onSendToSession?: (text: string) => void;
}

function ThreadCard({ thread, onSendToSession }: ThreadCardProps) {
  const loc = formatLocation(thread.path, thread.line);
  const multiple = thread.comments.length > 1;
  return (
    <div className={`rounded border bg-elevated/40 px-2 py-1.5 ${thread.isResolved ? 'border-border-default/50 opacity-60' : 'border-border-default'}`}>
      <div className="flex items-center gap-1.5 text-[11px]">
        <span className="truncate font-mono text-[10px] text-violet-300/80" title={loc}>{loc}</span>
        {thread.isResolved && (
          <span className="flex items-center gap-0.5 rounded bg-green-500/15 px-1 py-0.5 text-[9px] font-medium text-green-400">
            <CheckCircle className="h-2.5 w-2.5" />
            resolved
          </span>
        )}
        {thread.isOutdated && (
          <span className="rounded bg-amber-500/15 px-1 py-0.5 text-[9px] font-medium text-amber-400">outdated</span>
        )}
        {onSendToSession && multiple && (
          <button
            onClick={() => onSendToSession(formatThread(thread))}
            className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted transition-colors hover:bg-hover hover:text-secondary"
            title="Send full thread to session"
          >
            <Send className="h-2.5 w-2.5" />
            Thread
          </button>
        )}
      </div>
      <div className="mt-1 flex flex-col gap-1">
        {thread.comments.map((c, i) => (
          <div key={c.id} className="group flex flex-col gap-0.5 rounded bg-root/40 px-1.5 py-1">
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="font-medium text-secondary">@{c.author}</span>
              <a
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-faint transition-colors hover:text-secondary"
                title="Open in GitHub"
              >
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
              {onSendToSession && (
                <button
                  onClick={() => onSendToSession(i === 0 && !multiple ? formatThread(thread) : formatComment(c))}
                  className="ml-auto flex items-center gap-1 rounded px-1 py-0.5 text-muted opacity-0 transition-colors hover:bg-hover hover:text-secondary group-hover:opacity-100"
                  title="Send to session"
                >
                  <Send className="h-2.5 w-2.5" />
                  Send
                </button>
              )}
            </div>
            <div className="whitespace-pre-wrap text-[11px] text-tertiary">{c.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
