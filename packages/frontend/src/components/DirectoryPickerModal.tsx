import { useState, useEffect, useCallback } from 'react';
import { Folder, FolderOpen, X, ArrowUp, Loader2, Check } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { usePlatform } from '../hooks/usePlatform';

interface DirectoryPickerModalProps {
  /** Starting directory ('~' or absolute path). Defaults to home. */
  initialPath?: string;
  title?: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}

interface DirListing {
  path: string;
  parent: string | null;
  dirs: Array<{ name: string; path: string }>;
}

/**
 * In-app folder picker backed by GET /api/fs/dirs — used as a fallback when
 * the native Electron dialog isn't available (browser mode). Rendered above
 * other modals (z-[60]).
 */
export default function DirectoryPickerModal({ initialPath = '~', title = 'Select a folder', onSelect, onClose }: DirectoryPickerModalProps) {
  const modalRef = useFocusTrap<HTMLDivElement>();
  const { shortenPath } = usePlatform();
  const [listing, setListing] = useState<DirListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const browse = useCallback(async (target: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/fs/dirs?path=${encodeURIComponent(target)}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to list directory');
      }
      setListing(await res.json() as DirListing);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to list directory');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    browse(initialPath);
  }, [browse, initialPath]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    // Capture phase so Escape closes the picker, not the modal underneath.
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="mx-4 flex max-h-[70vh] w-full max-w-md flex-col rounded-lg border border-border-input bg-surface p-4 shadow-lg"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-3 flex shrink-0 items-center justify-between">
          <div className="flex items-center gap-2 text-primary">
            <FolderOpen className="h-4 w-4 text-cyan-400" />
            <span className="text-sm font-semibold">{title}</span>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted transition-colors hover:bg-elevated hover:text-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Current path + up */}
        <div className="mb-2 flex shrink-0 items-center gap-1.5">
          <button
            onClick={() => listing?.parent && browse(listing.parent)}
            disabled={!listing?.parent}
            className="shrink-0 rounded p-1 text-muted transition-colors hover:bg-elevated hover:text-secondary disabled:opacity-30"
            title="Parent folder"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-0 flex-1 truncate rounded-md bg-elevated/40 px-2.5 py-1.5 font-mono text-[12px] text-secondary" title={listing?.path}>
            {listing ? shortenPath(listing.path) : '…'}
          </span>
        </div>

        {/* Subdirectories */}
        <div className="mb-3 min-h-[120px] flex-1 overflow-y-auto rounded-md border border-border-input p-1">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-faint" />
            </div>
          ) : error ? (
            <p className="py-6 text-center text-[11px] text-rose-300">{error}</p>
          ) : listing && listing.dirs.length === 0 ? (
            <p className="py-6 text-center text-[11px] text-faint">No subfolders</p>
          ) : (
            listing?.dirs.map(dir => (
              <button
                key={dir.path}
                onClick={() => browse(dir.path)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-elevated/50"
              >
                <Folder className="h-3.5 w-3.5 shrink-0 text-cyan-400/60" />
                <span className="min-w-0 flex-1 truncate text-[12px] text-secondary">{dir.name}</span>
              </button>
            ))
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded px-3 py-1.5 text-xs text-tertiary transition-colors hover:bg-elevated hover:text-primary"
          >
            Cancel
          </button>
          <button
            onClick={() => listing && onSelect(listing.path)}
            disabled={!listing}
            className="flex items-center gap-1.5 rounded bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-cyan-500 disabled:opacity-50"
          >
            <Check className="h-3 w-3" />
            Select this folder
          </button>
        </div>
      </div>
    </div>
  );
}
