import { useState, useCallback, useEffect } from 'react';
import type { Marketplace, InstalledPlugin, AvailablePlugin, PluginsListResponse } from '../types';

async function parseJsonError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json() as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

async function postJson(path: string, body: Record<string, unknown>, fallback: string): Promise<void> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseJsonError(res, fallback));
}

export function usePlugins(enabled: boolean) {
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([]);
  const [installed, setInstalled] = useState<InstalledPlugin[]>([]);
  const [available, setAvailable] = useState<AvailablePlugin[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/plugins');
      if (!res.ok) throw new Error(await parseJsonError(res, 'Failed to fetch plugins'));
      const data = await res.json() as PluginsListResponse;
      setMarketplaces(data.marketplaces);
      setInstalled(data.installed);
      setAvailable(data.available);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch plugins');
    } finally {
      setLoading(false);
    }
  }, []);

  const addMarketplace = useCallback(async (source: string) => {
    await postJson('/api/plugins/marketplaces', { source }, 'Failed to add marketplace');
    await fetchAll();
  }, [fetchAll]);

  const removeMarketplace = useCallback(async (name: string) => {
    const res = await fetch(`/api/plugins/marketplaces/${encodeURIComponent(name)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await parseJsonError(res, 'Failed to remove marketplace'));
    await fetchAll();
  }, [fetchAll]);

  const updateMarketplaces = useCallback(async (name?: string) => {
    await postJson('/api/plugins/marketplaces/update', name ? { name } : {}, 'Failed to update marketplace');
    await fetchAll();
  }, [fetchAll]);

  const installPlugin = useCallback(async (pluginId: string) => {
    await postJson('/api/plugins/install', { pluginId }, 'Failed to install plugin');
    await fetchAll();
  }, [fetchAll]);

  const uninstallPlugin = useCallback(async (pluginId: string) => {
    const res = await fetch(`/api/plugins/${encodeURIComponent(pluginId)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await parseJsonError(res, 'Failed to uninstall plugin'));
    await fetchAll();
  }, [fetchAll]);

  const updatePlugin = useCallback(async (pluginId: string) => {
    await postJson('/api/plugins/update', { pluginId }, 'Failed to update plugin');
    await fetchAll();
  }, [fetchAll]);

  const enablePlugin = useCallback(async (pluginId: string) => {
    await postJson('/api/plugins/enable', { pluginId }, 'Failed to enable plugin');
    await fetchAll();
  }, [fetchAll]);

  const disablePlugin = useCallback(async (pluginId: string) => {
    await postJson('/api/plugins/disable', { pluginId }, 'Failed to disable plugin');
    await fetchAll();
  }, [fetchAll]);

  const getReadme = useCallback(async (installPath: string): Promise<{ content: string; filename: string }> => {
    const res = await fetch(`/api/plugins/readme?installPath=${encodeURIComponent(installPath)}`);
    if (!res.ok) throw new Error(await parseJsonError(res, 'Failed to load README'));
    return res.json() as Promise<{ content: string; filename: string }>;
  }, []);

  useEffect(() => {
    if (enabled) fetchAll();
  }, [enabled, fetchAll]);

  return {
    marketplaces,
    installed,
    available,
    loading,
    error,
    refetch: fetchAll,
    addMarketplace,
    removeMarketplace,
    updateMarketplaces,
    installPlugin,
    uninstallPlugin,
    updatePlugin,
    enablePlugin,
    disablePlugin,
    getReadme,
  };
}
