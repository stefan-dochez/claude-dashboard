import { useMemo, useState, useEffect } from 'react';
import { GitPullRequest, ExternalLink, RefreshCw, AlertCircle, User, GitBranch, Check, X, Clock, GitMerge } from 'lucide-react';
import { usePullRequests } from '../hooks/usePullRequests';
import { useGithubUser } from '../hooks/useGithubUser';
import type { PullRequest, PrLabel, PrReviewDecision, PrCiState } from '../types';

interface AggregatedPrViewProps {
  projectPath: string;
  projectName: string;
}

const FILTERS = {
  MINE: 'mine',
  ALL: 'all',
} as const;
type Filter = typeof FILTERS[keyof typeof FILTERS];

const STALE_THRESHOLD_DAYS = 7;

function timeAgo(dateStr: string): { label: string; days: number } {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return { label: `${minutes}m`, days: 0 };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { label: `${hours}h`, days: 0 };
  const days = Math.floor(hours / 24);
  return { label: `${days}d`, days };
}

function isMyPr(pr: PullRequest, username: string): boolean {
  return pr.author === username
    || pr.assignees.includes(username)
    || pr.reviewers.includes(username);
}

/** Pick black or white text for a hex background (relative luminance, sRGB). */
function labelTextColor(hex: string): string {
  const normalized = hex.replace(/^#/, '');
  if (normalized.length !== 6) return '#fff';
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  const toLin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const luminance = 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
  return luminance > 0.4 ? '#0a0a0a' : '#ffffff';
}

function LabelPill({ label }: { label: PrLabel }) {
  const bg = `#${label.color}`;
  return (
    <span
      className="rounded px-1.5 py-[1px] text-[9px] font-medium"
      style={{ backgroundColor: bg, color: labelTextColor(label.color) }}
    >
      {label.name}
    </span>
  );
}

function ReviewBadge({ decision, approvals, changesRequested }: {
  decision: PrReviewDecision;
  approvals: number;
  changesRequested: number;
}) {
  if (decision === 'APPROVED') {
    return (
      <span className="flex items-center gap-1 text-[10px] font-medium text-green-400" title={`${approvals} approval${approvals !== 1 ? 's' : ''}`}>
        <Check className="h-2.5 w-2.5" />
        {approvals > 0 ? approvals : ''} approved
      </span>
    );
  }
  if (decision === 'CHANGES_REQUESTED') {
    return (
      <span className="flex items-center gap-1 text-[10px] font-medium text-rose-400" title={`${changesRequested} review${changesRequested !== 1 ? 's' : ''} requesting changes`}>
        <X className="h-2.5 w-2.5" />
        changes requested
      </span>
    );
  }
  if (decision === 'REVIEW_REQUIRED') {
    return (
      <span className="flex items-center gap-1 text-[10px] font-medium text-amber-400" title="Review required">
        <Clock className="h-2.5 w-2.5" />
        review needed
      </span>
    );
  }
  return null;
}

function CiDot({ state }: { state: PrCiState }) {
  if (!state) return null;
  const cfg = state === 'SUCCESS'
    ? { color: 'bg-green-400', title: 'CI passing' }
    : state === 'FAILURE'
    ? { color: 'bg-rose-400', title: 'CI failing' }
    : { color: 'bg-amber-400 animate-pulse', title: 'CI running' };
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${cfg.color}`} title={cfg.title} />;
}

export default function AggregatedPrView({ projectPath, projectName }: AggregatedPrViewProps) {
  const { prs, loading, error, refresh } = usePullRequests(projectPath);
  const [filter, setFilter] = useState<Filter>(FILTERS.MINE);
  const { user: ghUser, loading: ghUserLoading } = useGithubUser();

  // Once the user resolves, fall back to "all" if `gh` isn't authenticated.
  useEffect(() => {
    if (!ghUserLoading && !ghUser) setFilter(FILTERS.ALL);
  }, [ghUserLoading, ghUser]);

  const filteredPrs = useMemo(() => {
    if (filter === FILTERS.ALL || !ghUser) return prs;
    return prs.filter(pr => isMyPr(pr, ghUser));
  }, [prs, filter, ghUser]);

  const prsByRepo = useMemo(() => {
    const map = new Map<string, PullRequest[]>();
    for (const pr of filteredPrs) {
      const list = map.get(pr.repoName) ?? [];
      list.push(pr);
      map.set(pr.repoName, list);
    }
    return map;
  }, [filteredPrs]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border-default px-5 py-3">
        <GitPullRequest className="h-4 w-4 text-blue-400" />
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-semibold text-primary">Open Pull Requests</h2>
          <p className="text-[12px] text-muted">
            {projectName} — {filteredPrs.length}
            {filter === FILTERS.MINE && prs.length !== filteredPrs.length ? ` / ${prs.length}` : ''}
            {' '}PR{filteredPrs.length !== 1 ? 's' : ''}
            {prsByRepo.size > 0 ? ` across ${prsByRepo.size} repo${prsByRepo.size !== 1 ? 's' : ''}` : ''}
          </p>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center rounded-lg bg-elevated/40 p-0.5">
          {([
            { key: FILTERS.MINE, label: 'Mine' },
            { key: FILTERS.ALL, label: 'All' },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                filter === key
                  ? 'bg-elevated text-primary shadow-sm'
                  : 'text-muted hover:text-secondary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          onClick={refresh}
          disabled={loading}
          className="rounded-lg p-1.5 text-muted transition-colors hover:bg-elevated/50 hover:text-secondary disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-3">
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        {!loading && filteredPrs.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-elevated">
              <GitPullRequest className="h-5 w-5 text-faint" />
            </div>
            <p className="text-[13px] text-tertiary">
              {filter === FILTERS.MINE ? 'No PRs assigned to you' : 'No open pull requests'}
            </p>
            <p className="mt-1 text-[12px] text-faint">
              {filter === FILTERS.MINE && prs.length > 0
                ? `${prs.length} PR${prs.length !== 1 ? 's' : ''} from others — switch to "All" to see them`
                : 'All repos in this workspace are clean'}
            </p>
          </div>
        )}

        {loading && prs.length === 0 && (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="h-5 w-5 animate-spin text-faint" />
          </div>
        )}

        {[...prsByRepo.entries()].map(([repoName, repoPrs]) => (
          <div key={repoName} className="mb-4">
            <div className="mb-1.5 flex items-center gap-1.5 px-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{repoName}</span>
              <span className="text-[10px] text-faint">{repoPrs.length}</span>
            </div>
            <div className="space-y-1">
              {repoPrs.map(pr => {
                const age = timeAgo(pr.updatedAt);
                const isStale = age.days >= STALE_THRESHOLD_DAYS;
                const hasConflict = pr.mergeable === 'CONFLICTING';
                return (
                  <a
                    key={`${pr.repo}-${pr.number}`}
                    href={pr.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-start gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-elevated/50"
                  >
                    <GitPullRequest className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${pr.isDraft ? 'text-faint' : 'text-green-400'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className={`text-[12px] font-medium ${pr.isDraft ? 'text-tertiary' : 'text-secondary'} transition-colors group-hover:text-primary`}>
                          {pr.title}
                        </span>
                        {pr.isDraft && (
                          <span className="rounded bg-elevated px-1.5 py-0.5 text-[9px] font-medium uppercase text-faint">Draft</span>
                        )}
                        {hasConflict && (
                          <span className="flex items-center gap-1 rounded bg-rose-500/15 px-1.5 py-0.5 text-[9px] font-medium uppercase text-rose-300" title="Branch has merge conflicts">
                            <GitMerge className="h-2.5 w-2.5" />
                            conflicts
                          </span>
                        )}
                        {pr.labels.map(label => (
                          <LabelPill key={label.name} label={label} />
                        ))}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-faint">
                        <span className="flex items-center gap-1" title={pr.author}>
                          <User className="h-2.5 w-2.5" />
                          {pr.author}
                        </span>
                        <span>#{pr.number}</span>
                        {pr.branch && (
                          <span className="flex items-center gap-1" title={`${pr.branch} → ${pr.baseBranch}`}>
                            <GitBranch className="h-2.5 w-2.5" />
                            {pr.branch}
                          </span>
                        )}
                        {pr.ciState && (
                          <span className="flex items-center gap-1">
                            <CiDot state={pr.ciState} />
                          </span>
                        )}
                        <ReviewBadge
                          decision={pr.reviewDecision}
                          approvals={pr.approvalCount}
                          changesRequested={pr.changesRequestedCount}
                        />
                        <span
                          className={isStale ? 'text-amber-400' : ''}
                          title={isStale
                            ? `No update for ${age.days} days — ${new Date(pr.updatedAt).toLocaleString()}`
                            : new Date(pr.updatedAt).toLocaleString()}
                        >
                          {age.label}
                        </span>
                      </div>
                    </div>
                    <ExternalLink className="mt-1 h-3 w-3 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
                  </a>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
