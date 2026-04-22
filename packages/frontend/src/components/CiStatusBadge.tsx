import { CheckCircle2, XCircle, CircleDot, GitMerge, MinusCircle } from 'lucide-react';

export type CiState = 'success' | 'failure' | 'running' | 'neutral';
export type PrState = 'OPEN' | 'MERGED' | 'CLOSED';

export interface CiSummary {
  passed: number;
  failed: number;
  running: number;
  total: number;
}

export interface BranchStatus {
  ciState: CiState | null;
  ciSummary: CiSummary;
  prState: PrState | null;
  prUrl: string | null;
}

interface Props {
  status: BranchStatus;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
}

/**
 * Render priority:
 * 1. MERGED PR → violet git-merge icon (CI state is stale / uninteresting)
 * 2. CLOSED PR → muted dash (rare; no CI badge either)
 * 3. Open or no PR → CI state icon if any check-runs exist
 * 4. Nothing worth showing → null
 */
export default function CiStatusBadge({ status, onClick, className = '' }: Props) {
  if (status.prState === 'MERGED') {
    return (
      <span
        onClick={onClick}
        className={`inline-flex shrink-0 items-center text-violet-400 ${className}`}
        title="PR merged"
      >
        <GitMerge className="h-3 w-3" />
      </span>
    );
  }

  if (status.prState === 'CLOSED') {
    return (
      <span
        onClick={onClick}
        className={`inline-flex shrink-0 items-center text-faint ${className}`}
        title="PR closed (not merged)"
      >
        <MinusCircle className="h-3 w-3" />
      </span>
    );
  }

  if (!status.ciState || status.ciSummary.total === 0) return null;

  const color = {
    success: 'text-green-400',
    failure: 'text-rose-400',
    running: 'text-amber-400 animate-pulse',
    neutral: 'text-faint',
  }[status.ciState];

  const Icon = {
    success: CheckCircle2,
    failure: XCircle,
    running: CircleDot,
    neutral: MinusCircle,
  }[status.ciState];

  const labelState = {
    success: 'CI passed',
    failure: 'CI failed',
    running: 'CI running',
    neutral: 'CI pending',
  }[status.ciState];

  const summary = [
    status.ciSummary.passed > 0 ? `${status.ciSummary.passed} passed` : null,
    status.ciSummary.failed > 0 ? `${status.ciSummary.failed} failed` : null,
    status.ciSummary.running > 0 ? `${status.ciSummary.running} running` : null,
  ].filter(Boolean).join(' · ');

  return (
    <span
      onClick={onClick}
      className={`inline-flex shrink-0 items-center ${color} ${className}`}
      title={summary ? `${labelState} — ${summary}` : labelState}
    >
      <Icon className="h-3 w-3" />
    </span>
  );
}
