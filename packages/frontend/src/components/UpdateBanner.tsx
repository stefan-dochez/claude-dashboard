import { useState, useEffect } from 'react';
import { ArrowUpCircle, X, Download, AlertCircle } from 'lucide-react';
import type { UpdateProgress, UpdateStatus } from '../types/electron';
import { usePlatform } from '../hooks/usePlatform';

interface UpdateAsset {
  name: string;
  url: string;
  size: number;
}

interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
  publishedAt: string | null;
  checkedAt: string;
  error: string | null;
  asset: UpdateAsset | null;
}

const DISMISSED_KEY = 'dashboard:update-dismissed';

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusLabel(phase: UpdateStatus['phase']): string {
  switch (phase) {
    case 'downloading': return 'Downloading';
    case 'preparing': return 'Preparing';
    case 'installing': return 'Restarting';
    case 'error': return 'Error';
  }
}

export default function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateCheckResult | null>(null);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { platform } = usePlatform();

  // In-app install is currently only validated on macOS. On Windows the
  // download + NSIS `/S` path is untested and known to have gaps (no auto-
  // relaunch, oneClick:false wizard still shows). Fall back to "View release"
  // there until the Windows flow is hardened.
  const isSupportedPlatform = platform?.platform === 'darwin';
  const canInstall = Boolean(window.electronAPI?.isElectron && update?.asset && isSupportedPlatform);

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

  useEffect(() => {
    if (!installing || !window.electronAPI) return;
    const offProgress = window.electronAPI.update.onProgress(p => setProgress(p));
    const offStatus = window.electronAPI.update.onStatus(s => {
      setStatus(s);
      if (s.phase === 'error') {
        setError(s.message ?? 'Update failed');
        setInstalling(false);
      }
    });
    return () => { offProgress(); offStatus(); };
  }, [installing]);

  if (!update || !update.latestVersion) return null;

  const handleDismiss = () => {
    if (update.latestVersion) {
      localStorage.setItem(DISMISSED_KEY, update.latestVersion);
    }
    setUpdate(null);
  };

  const handleInstall = async () => {
    if (!update.asset || !window.electronAPI) return;
    setError(null);
    setProgress(null);
    setStatus({ phase: 'downloading' });
    setInstalling(true);
    try {
      await window.electronAPI.update.install(update.asset.url, update.asset.name);
      // On success, the app restarts — this code path typically doesn't run.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
      setInstalling(false);
    }
  };

  const pct = progress && progress.total > 0
    ? Math.min(100, Math.round((progress.received / progress.total) * 100))
    : null;

  return (
    <div className="flex flex-col gap-1.5 border-b border-blue-500/20 bg-blue-500/5 px-4 py-2.5">
      <div className="flex items-center gap-3">
        <ArrowUpCircle className="h-4 w-4 shrink-0 text-blue-400" />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-blue-300">
            <span className="font-medium">Update available</span>
            <span className="ml-1 text-blue-300/70">
              — {update.currentVersion} → <span className="font-medium text-blue-300">{update.latestVersion}</span>
            </span>
            {update.asset && (
              <span className="ml-2 text-[11px] text-blue-300/50">({formatMB(update.asset.size)})</span>
            )}
          </p>
        </div>
        {canInstall && !installing && !error && (
          <button
            onClick={handleInstall}
            className="inline-flex shrink-0 items-center gap-1 rounded bg-blue-500/20 px-2.5 py-1 text-[11px] font-medium text-blue-200 transition-colors hover:bg-blue-500/30"
          >
            <Download className="h-3 w-3" />
            Install &amp; restart
          </button>
        )}
        {update.releaseUrl && !installing && (
          <a
            href={update.releaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded bg-blue-500/10 px-2.5 py-1 text-[11px] font-medium text-blue-300 transition-colors hover:bg-blue-500/20"
          >
            View release
          </a>
        )}
        {!installing && (
          <button
            onClick={handleDismiss}
            className="shrink-0 rounded p-0.5 text-blue-400/60 transition-colors hover:text-blue-300"
            title="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {installing && (
        <div className="ml-7 flex items-center gap-3">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-blue-500/15">
            <div
              className="h-full bg-blue-400 transition-all duration-150"
              style={{ width: pct !== null ? `${pct}%` : '30%' }}
            />
          </div>
          <span className="shrink-0 font-mono text-[10px] text-blue-300/80">
            {status ? statusLabel(status.phase) : 'Starting'}
            {pct !== null && status?.phase === 'downloading' ? ` ${pct}%` : '…'}
          </span>
        </div>
      )}

      {error && (
        <div className="ml-7 flex items-center gap-2 text-[11px] text-red-300">
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span>Update failed: {error}</span>
          {update.releaseUrl && (
            <a
              href={update.releaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-red-200"
            >
              Download manually
            </a>
          )}
        </div>
      )}
    </div>
  );
}
