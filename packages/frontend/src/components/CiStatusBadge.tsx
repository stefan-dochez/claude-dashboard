import { CheckCircle2, XCircle, CircleDot, MinusCircle, HelpCircle } from 'lucide-react';

export interface CiRun {
  databaseId: number;
  name: string;
  status: string;              // queued | in_progress | completed
  conclusion: string | null;
  url: string;
  headSha: string;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  run: CiRun;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
}

/**
 * Derive a compact visual state from a `gh run list` row.
 * GitHub splits the live state across two fields (status for queued/running,
 * conclusion for the terminal state once status=completed) which the UI
 * collapses into one.
 */
function deriveState(run: CiRun): 'success' | 'failure' | 'running' | 'cancelled' | 'neutral' {
  if (run.status === 'queued' || run.status === 'in_progress') return 'running';
  switch (run.conclusion) {
    case 'success':
      return 'success';
    case 'failure':
    case 'timed_out':
    case 'action_required':
      return 'failure';
    case 'cancelled':
    case 'skipped':
      return 'cancelled';
    default:
      return 'neutral';
  }
}

export default function CiStatusBadge({ run, onClick, className = '' }: Props) {
  const state = deriveState(run);

  const Icon = {
    success: CheckCircle2,
    failure: XCircle,
    running: CircleDot,
    cancelled: MinusCircle,
    neutral: HelpCircle,
  }[state];

  const color = {
    success: 'text-green-400',
    failure: 'text-rose-400',
    running: 'text-amber-400 animate-pulse',
    cancelled: 'text-faint',
    neutral: 'text-faint',
  }[state];

  const label = {
    success: 'CI passed',
    failure: 'CI failed',
    running: 'CI running',
    cancelled: 'CI cancelled',
    neutral: 'CI status unknown',
  }[state];

  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center ${color} ${className}`}
      title={`${label} — ${run.name}`}
    >
      <Icon className="h-3 w-3" />
    </span>
  );
}
