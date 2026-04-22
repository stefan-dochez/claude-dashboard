import { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, XCircle, CircleDot, MinusCircle, Loader2 } from 'lucide-react';

interface CheckRun {
  name: string;
  status: string;              // queued | in_progress | completed
  conclusion: string | null;
  url: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface Props {
  projectPath: string;
  sha: string | null;
}

function deriveState(c: CheckRun): 'success' | 'failure' | 'running' | 'cancelled' | 'neutral' {
  if (c.status === 'queued' || c.status === 'in_progress') return 'running';
  switch (c.conclusion) {
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
  neutral: MinusCircle,
};

const PILL_CLASSES = {
  success: 'bg-green-500/10 text-green-400',
  failure: 'bg-rose-500/10 text-rose-400',
  running: 'bg-amber-500/10 text-amber-400',
  cancelled: 'bg-elevated/60 text-faint',
  neutral: 'bg-elevated/60 text-faint',
};

export default function ChecksBlock({ projectPath, sha }: Props) {
  const [checks, setChecks] = useState<CheckRun[] | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchChecks = useCallback(async () => {
    if (!sha) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/git/checks?path=${encodeURIComponent(projectPath)}&sha=${encodeURIComponent(sha)}`);
      if (res.ok) {
        setChecks(await res.json());
      }
    } catch {
      setChecks([]);
    } finally {
      setLoading(false);
    }
  }, [projectPath, sha]);

  useEffect(() => {
    fetchChecks();
  }, [fetchChecks]);

  if (!sha) return null;
  if (loading && !checks) {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-faint">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading checks…
      </div>
    );
  }
  if (!checks || checks.length === 0) return null;

  const summary = checks.reduce(
    (acc, c) => {
      const s = deriveState(c);
      acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wider text-faint">
        <span>Checks</span>
        <span className="text-[10px] normal-case tracking-normal text-faint">
          {summary.success ? `${summary.success} passed` : ''}
          {summary.failure ? `${summary.success ? ' · ' : ''}${summary.failure} failed` : ''}
          {summary.running ? `${(summary.success ?? 0) + (summary.failure ?? 0) > 0 ? ' · ' : ''}${summary.running} running` : ''}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {checks.map((c, i) => {
          const state = deriveState(c);
          const Icon = ICONS[state];
          return (
            <a
              key={`${c.name}-${i}`}
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex max-w-[220px] items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-opacity hover:opacity-80 ${PILL_CLASSES[state]}`}
              title={`${c.name} — ${state}`}
            >
              <Icon className={`h-2.5 w-2.5 shrink-0 ${state === 'running' ? 'animate-pulse' : ''}`} />
              <span className="truncate">{c.name}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
