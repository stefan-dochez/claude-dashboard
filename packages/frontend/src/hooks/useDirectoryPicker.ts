import { useState, useRef, useCallback } from 'react';

/**
 * Folder picking that prefers the native Electron dialog and falls back to
 * the in-app DirectoryPickerModal in browser mode.
 *
 * Usage: call `pick(cb)` from a browse button. If the native dialog is
 * available the callback fires directly; otherwise `fallbackOpen` becomes
 * true and the consumer renders <DirectoryPickerModal onSelect={onFallbackSelect}
 * onClose={closeFallback} />.
 */
export function useDirectoryPicker() {
  const pendingRef = useRef<((path: string) => void) | null>(null);
  const [fallbackOpen, setFallbackOpen] = useState(false);

  const pick = useCallback(async (onPicked: (path: string) => void) => {
    const native = window.electronAPI?.selectDirectory;
    if (native) {
      const dir = await native();
      if (dir) onPicked(dir);
    } else {
      pendingRef.current = onPicked;
      setFallbackOpen(true);
    }
  }, []);

  const onFallbackSelect = useCallback((path: string) => {
    pendingRef.current?.(path);
    pendingRef.current = null;
    setFallbackOpen(false);
  }, []);

  const closeFallback = useCallback(() => {
    pendingRef.current = null;
    setFallbackOpen(false);
  }, []);

  return { pick, fallbackOpen, onFallbackSelect, closeFallback };
}
