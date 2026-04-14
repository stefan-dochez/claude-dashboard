import { useState, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface DependencyStatus {
  name: string;
  ok: boolean;
  version: string | null;
  detail: string | null;
}

interface HealthReport {
  ok: boolean;
  dependencies: DependencyStatus[];
}

const DISMISSED_KEY = 'dashboard:health-dismissed';

export default function HealthBanner() {
  const [issues, setIssues] = useState<DependencyStatus[]>([]);
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem(DISMISSED_KEY) !== null;
  });

  useEffect(() => {
    if (dismissed) return;

    fetch('/api/health')
      .then(r => r.json())
      .then((report: HealthReport) => {
        const failed = report.dependencies.filter(d => !d.ok);
        // Store the hash of issues so we re-show if new issues appear
        const hash = failed.map(d => d.name).sort().join(',');
        const previousHash = localStorage.getItem(DISMISSED_KEY);
        if (previousHash === hash) {
          setDismissed(true);
          return;
        }
        setIssues(failed);
      })
      .catch(() => {}); // backend not ready yet, ignore
  }, [dismissed]);

  if (dismissed || issues.length === 0) return null;

  const handleDismiss = () => {
    const hash = issues.map(d => d.name).sort().join(',');
    localStorage.setItem(DISMISSED_KEY, hash);
    setDismissed(true);
  };

  return (
    <div className="flex items-start gap-3 border-b border-amber-500/20 bg-amber-500/5 px-4 py-2.5">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-amber-300">
          {issues.length === 1 ? 'Missing dependency' : `${issues.length} missing dependencies`}
        </p>
        <ul className="mt-1 space-y-0.5">
          {issues.map(dep => (
            <li key={dep.name} className="text-[11px] text-amber-300/70">
              <span className="font-mono font-medium text-amber-300">{dep.name}</span>
              {dep.detail && <span> — {dep.detail}</span>}
            </li>
          ))}
        </ul>
      </div>
      <button
        onClick={handleDismiss}
        className="shrink-0 rounded p-0.5 text-amber-400/60 transition-colors hover:text-amber-300"
        title="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
