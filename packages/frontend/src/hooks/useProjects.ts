import { useState, useEffect, useCallback } from 'react';
import type { Project } from '../types';
import { useSocketEvent } from './useSocket';

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json() as Project[];
      setProjects(data);
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshProjects = useCallback(async () => {
    // Silent refresh — no loading spinner, keep current tree visible
    // Only spin the refresh button icon
    setRefreshing(true);
    try {
      const res = await fetch('/api/projects/refresh', { method: 'POST' });
      const data = await res.json() as Project[];
      setProjects(data);
    } catch (err) {
      console.error('Failed to refresh projects:', err);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const deleteWorktree = useCallback(async (projectPath: string, worktreePath: string) => {
    // Optimistically remove from local state
    setProjects(prev => prev.filter(p => p.path !== worktreePath));

    try {
      const res = await fetch('/api/worktrees', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath, worktreePath }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to delete worktree');
      }
    } catch (err) {
      console.error('Failed to delete worktree:', err);
      fetchProjects();
    }
  }, [fetchProjects]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useSocketEvent<Project>('project:updated', useCallback((updated) => {
    setProjects(prev => {
      const idx = prev.findIndex(p => p.path === updated.path);
      if (idx === -1) return prev;
      const next = prev.slice();
      next[idx] = { ...prev[idx], ...updated };
      return next;
    });
  }, []));

  return { projects, loading, refreshing, refreshProjects, deleteWorktree };
}
