import { CheckCircle2, XCircle, CircleDot, MinusCircle, HelpCircle } from 'lucide-react';

export interface CiRun {
  databaseId: number;
  name: string;
  status: string;
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
 * Collapse GitHub's split (status / conclusion) fields into one visual state.
 * - status=queued|in_progress → running (terminal conclusion not set yet)
 * - status=completed → use conclusion
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

const ICONS = {
  success: CheckCircle2,
  failure: XCircle,
  running: CircleDot,
  cancelled: MinusCircle,
  neutral: HelpCircle,
};

const COLORS = {
  success: 'text-green-400',
  failure: 'text-rose-400',
  running: 'text-amber-400 animate-pulse',
  cancelled: 'text-faint',
  neutral: 'text-faint',
};

const LABELS = {
  success: 'CI passed',
  failure: 'CI failed',
  running: 'CI running',
  cancelled: 'CI cancelled',
  neutral: 'CI status unknown',
};

export default function CiStatusBadge({ run, onClick, className = '' }: Props) {
  const state = deriveState(run);
  const Icon = ICONS[state];

  return (
    <span
      onClick={onClick}
      className={`inline-flex shrink-0 items-center ${COLORS[state]} ${className}`}
      title={`${LABELS[state]} — ${run.name}`}
    >
      <Icon className="h-3 w-3" />
    </span>
  );
}
