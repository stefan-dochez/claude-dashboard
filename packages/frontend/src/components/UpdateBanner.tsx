import { useState, useEffect } from 'react';
import { ArrowUpCircle, X } from 'lucide-react';

interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
  publishedAt: string | null;
  checkedAt: string;
  error: string | null;
}

const DISMISSED_KEY = 'dashboard:update-dismissed';

export default function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateCheckResult | null>(null);

  useEffect(() => {
    fetch('/api/update-check')
      .then(r => r.json())
      .then((result: UpdateCheckResult) => {
        if (!result.updateAvailable || !result.latestVersion) return;
        const dismissed = localStorage.getItem(DISMISSED_KEY);
        if (dismissed === result.latestVersion) return;
        setUpdate(result);
      })
      .catch(() => {}); // silent: don't spam user if offline or API down
  }, []);

  if (!update || !update.latestVersion) return null;

  const handleDismiss = () => {
    if (update.latestVersion) {
      localStorage.setItem(DISMISSED_KEY, update.latestVersion);
    }
    setUpdate(null);
  };

  return (
    <div className="flex items-center gap-3 border-b border-blue-500/20 bg-blue-500/5 px-4 py-2.5">
      <ArrowUpCircle className="h-4 w-4 shrink-0 text-blue-400" />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] text-blue-300">
          <span className="font-medium">Update available</span>
          <span className="ml-1 text-blue-300/70">
            — {update.currentVersion} → <span className="font-medium text-blue-300">{update.latestVersion}</span>
          </span>
        </p>
      </div>
      {update.releaseUrl && (
        <a
          href={update.releaseUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded bg-blue-500/15 px-2.5 py-1 text-[11px] font-medium text-blue-300 transition-colors hover:bg-blue-500/25"
        >
          View release
        </a>
      )}
      <button
        onClick={handleDismiss}
        className="shrink-0 rounded p-0.5 text-blue-400/60 transition-colors hover:text-blue-300"
        title="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
