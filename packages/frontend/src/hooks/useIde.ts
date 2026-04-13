import { useState, useEffect, useCallback } from 'react';

interface IdeInfo {
  id: string;
  name: string;
  installed: boolean;
}

interface OpenResult {
  ide: string;
}

export function useIde() {
  const [ides, setIdes] = useState<IdeInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const detect = useCallback(async () => {
    try {
      const res = await fetch('/api/ide/detect');
      const data = await res.json() as IdeInfo[];
      setIdes(data);
    } catch (err) {
      console.error('Failed to detect IDEs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    detect();
  }, [detect]);

  const openInIde = useCallback(async (projectPath: string, ide?: string): Promise<OpenResult> => {
    const res = await fetch('/api/ide/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectPath, ide }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? 'Failed to open IDE');
    }
    return data as OpenResult;
  }, []);

  const installedIdes = ides.filter(ide => ide.installed);

  return { ides, installedIdes, loading, openInIde, refresh: detect };
}
