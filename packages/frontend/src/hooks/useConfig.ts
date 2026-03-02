import { useState, useEffect, useCallback } from 'react';

interface AppConfig {
  scanPaths: string[];
  projectMarkers: string[];
  scanDepth: number;
  port: number;
  maxInstances: number;
}

export function useConfig() {
  const [config, setConfig] = useState<AppConfig | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/config');
      const data = await res.json() as AppConfig;
      setConfig(data);
    } catch (err) {
      console.error('Failed to fetch config:', err);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  return { config, refetch: fetchConfig };
}
