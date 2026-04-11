import { useState, useEffect, useCallback } from 'react';

interface PlatformInfo {
  homePath: string;
  platform: string;
}

let cachedPlatform: PlatformInfo | null = null;

export function usePlatform() {
  const [platform, setPlatform] = useState<PlatformInfo | null>(cachedPlatform);

  useEffect(() => {
    if (cachedPlatform) return;
    fetch('/api/platform')
      .then(r => r.json())
      .then((data: PlatformInfo) => {
        cachedPlatform = data;
        setPlatform(data);
      })
      .catch(() => {});
  }, []);

  const shortenPath = useCallback((fullPath: string): string => {
    if (!platform) {
      // Fallback: try common patterns
      return fullPath
        .replace(/^\/Users\/[^/]+/, '~')
        .replace(/^C:\\Users\\[^\\]+/i, '~');
    }
    const home = platform.homePath;
    // Normalize separators for comparison
    const normalizedPath = fullPath.replace(/\\/g, '/');
    const normalizedHome = home.replace(/\\/g, '/');
    if (normalizedPath === normalizedHome) return '~';
    if (normalizedPath.startsWith(normalizedHome + '/')) {
      return '~' + fullPath.slice(home.length);
    }
    return fullPath;
  }, [platform]);

  return { platform, shortenPath };
}
