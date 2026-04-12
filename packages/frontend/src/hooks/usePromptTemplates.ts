import { useState, useCallback, useEffect } from 'react';
import type { PromptTemplate } from '../types';

export function usePromptTemplates(projectPath?: string | null) {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTemplates = useCallback(async () => {
    try {
      const params = projectPath ? `?projectPath=${encodeURIComponent(projectPath)}` : '';
      const res = await fetch(`/api/prompt-templates${params}`);
      if (res.ok) {
        setTemplates(await res.json());
      }
    } catch (err) {
      console.error('[usePromptTemplates] Failed to fetch:', err);
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const createTemplate = useCallback(async (template: Omit<PromptTemplate, 'id' | 'usageCount' | 'createdAt' | 'updatedAt'>) => {
    const res = await fetch('/api/prompt-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(template),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    const created: PromptTemplate = await res.json();
    setTemplates(prev => [created, ...prev]);
    return created;
  }, []);

  const updateTemplate = useCallback(async (id: string, updates: Partial<PromptTemplate>) => {
    const res = await fetch(`/api/prompt-templates/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    const updated: PromptTemplate = await res.json();
    setTemplates(prev => prev.map(t => t.id === id ? updated : t));
    return updated;
  }, []);

  const deleteTemplate = useCallback(async (id: string) => {
    const res = await fetch(`/api/prompt-templates/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error((await res.json()).error);
    setTemplates(prev => prev.filter(t => t.id !== id));
  }, []);

  const recordUsage = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/prompt-templates/${id}/use`, { method: 'POST' });
      if (res.ok) {
        const updated: PromptTemplate = await res.json();
        setTemplates(prev => prev.map(t => t.id === id ? updated : t));
      }
    } catch {
      // Non-critical, don't throw
    }
  }, []);

  const importTemplates = useCallback(async (imported: PromptTemplate[]) => {
    const res = await fetch('/api/prompt-templates/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templates: imported }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    const result: { imported: number } = await res.json();
    await fetchTemplates();
    return result.imported;
  }, [fetchTemplates]);

  const exportTemplates = useCallback(async (): Promise<PromptTemplate[]> => {
    const res = await fetch('/api/prompt-templates/export');
    if (!res.ok) throw new Error((await res.json()).error);
    const data: { templates: PromptTemplate[] } = await res.json();
    return data.templates;
  }, []);

  return {
    templates,
    loading,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    recordUsage,
    importTemplates,
    exportTemplates,
    refetch: fetchTemplates,
  };
}
