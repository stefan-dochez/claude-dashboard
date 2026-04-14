import { useState, useEffect, useCallback, useRef } from 'react';
import type { PullRequest } from '../types';

const REFRESH_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

interface UsePullRequestsResult {
  prs: PullRequest[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Fetch aggregated open PRs for a workspace/monorepo project.
 * Auto-refreshes every 2 minutes while mounted.
 */
export function usePullRequests(projectPath: string | null): UsePullRequestsResult {
  const [prs, setPrs] = useState<PullRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchPrs = useCallback(async (path: string, forceRefresh = false) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ path });
      if (forceRefresh) params.set('refresh', 'true');
      const res = await fetch(`/api/git/prs?${params}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: PullRequest[] = await res.json();
      setPrs(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to fetch PRs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!projectPath) {
      setPrs([]);
      return;
    }

    fetchPrs(projectPath);
    const timer = setInterval(() => fetchPrs(projectPath), REFRESH_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      abortRef.current?.abort();
    };
  }, [projectPath, fetchPrs]);

  const refresh = useCallback(() => {
    if (projectPath) fetchPrs(projectPath, true);
  }, [projectPath, fetchPrs]);

  return { prs, loading, error, refresh };
}
