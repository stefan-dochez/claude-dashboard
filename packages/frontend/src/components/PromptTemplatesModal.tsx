import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  X, Plus, Search, Pencil, Trash2, Download, Upload,
  FileText, Tag, Hash, Copy, ChevronLeft, Eye,
} from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import type { PromptTemplate, PromptTemplateVariable } from '../types';

// --------------- Variable extraction ---------------

const VARIABLE_REGEX = /\{\{(\w+)\}\}/g;

function extractVariables(content: string): PromptTemplateVariable[] {
  const seen = new Set<string>();
  const vars: PromptTemplateVariable[] = [];
  let match: RegExpExecArray | null;
  while ((match = VARIABLE_REGEX.exec(content)) !== null) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      vars.push({ name, defaultValue: '', placeholder: name });
    }
  }
  return vars;
}

function mergeVariables(
  extracted: PromptTemplateVariable[],
  existing: PromptTemplateVariable[],
): PromptTemplateVariable[] {
  const existingMap = new Map(existing.map(v => [v.name, v]));
  return extracted.map(v => existingMap.get(v.name) ?? v);
}

// --------------- Template preview ---------------

function TemplatePreview({ content, variables }: { content: string; variables: PromptTemplateVariable[] }) {
  let rendered = content;
  for (const v of variables) {
    const value = v.defaultValue || `[${v.placeholder ?? v.name}]`;
    rendered = rendered.replaceAll(`{{${v.name}}}`, value);
  }
  return (
    <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-root p-3 text-xs leading-relaxed text-secondary">
      {rendered}
    </pre>
  );
}

// --------------- Template form ---------------

interface TemplateFormProps {
  initial?: PromptTemplate;
  projectPath?: string | null;
  onSave: (data: Omit<PromptTemplate, 'id' | 'usageCount' | 'createdAt' | 'updatedAt'>) => void;
  onCancel: () => void;
}

function TemplateForm({ initial, projectPath, onSave, onCancel }: TemplateFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [tagsInput, setTagsInput] = useState(initial?.tags.join(', ') ?? '');
  const [scope, setScope] = useState<'global' | 'project'>(initial?.scope ?? 'global');
  const [variables, setVariables] = useState<PromptTemplateVariable[]>(initial?.variables ?? []);
  const [showPreview, setShowPreview] = useState(false);

  // Auto-detect variables from content
  useEffect(() => {
    const extracted = extractVariables(content);
    setVariables(prev => mergeVariables(extracted, prev));
  }, [content]);

  const handleSubmit = useCallback(() => {
    if (!name.trim() || !content.trim()) return;
    const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
    onSave({
      name: name.trim(),
      description: description.trim(),
      content,
      variables,
      tags,
      scope,
      projectPath: scope === 'project' ? (projectPath ?? undefined) : undefined,
    });
  }, [name, description, content, variables, tagsInput, scope, projectPath, onSave]);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="mb-1 block text-[11px] font-medium text-muted">Name</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Code review"
          className="w-full rounded-lg border border-border-input bg-input px-3 py-1.5 text-sm text-primary outline-none transition-colors focus:border-border-focus"
        />
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-medium text-muted">Description</label>
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Short description of what this template does"
          className="w-full rounded-lg border border-border-input bg-input px-3 py-1.5 text-sm text-primary outline-none transition-colors focus:border-border-focus"
        />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="text-[11px] font-medium text-muted">
            Prompt content
            <span className="ml-1 font-normal text-faint">{'(use {{variable}} for placeholders)'}</span>
          </label>
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="flex items-center gap-1 text-[11px] text-muted hover:text-secondary"
          >
            <Eye className="h-3 w-3" />
            {showPreview ? 'Edit' : 'Preview'}
          </button>
        </div>
        {showPreview ? (
          <TemplatePreview content={content} variables={variables} />
        ) : (
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder={'Review the following code for bugs, security issues, and performance:\n\n{{selection}}\n\nFocus on {{branch}} conventions.'}
            rows={5}
            className="w-full resize-none rounded-lg border border-border-input bg-input px-3 py-2 font-mono text-xs leading-relaxed text-primary outline-none transition-colors focus:border-border-focus"
          />
        )}
      </div>

      {/* Detected variables */}
      {variables.length > 0 && (
        <div>
          <label className="mb-1 block text-[11px] font-medium text-muted">
            Variables detected ({variables.length})
          </label>
          <div className="flex flex-col gap-1.5">
            {variables.map((v, i) => (
              <div key={v.name} className="flex items-center gap-2">
                <span className="flex items-center gap-1 rounded bg-elevated px-2 py-0.5 text-[11px] font-mono text-violet-400">
                  <Hash className="h-2.5 w-2.5" />
                  {v.name}
                </span>
                <input
                  value={v.defaultValue ?? ''}
                  onChange={e => {
                    const updated = [...variables];
                    updated[i] = { ...v, defaultValue: e.target.value };
                    setVariables(updated);
                  }}
                  placeholder={`Default value for ${v.name}`}
                  className="flex-1 rounded border border-border-input bg-input px-2 py-0.5 text-[11px] text-primary outline-none transition-colors focus:border-border-focus"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-[11px] font-medium text-muted">Tags</label>
          <input
            value={tagsInput}
            onChange={e => setTagsInput(e.target.value)}
            placeholder="review, refactor, test (comma-separated)"
            className="w-full rounded-lg border border-border-input bg-input px-3 py-1.5 text-sm text-primary outline-none transition-colors focus:border-border-focus"
          />
        </div>
        <div className="w-32">
          <label className="mb-1 block text-[11px] font-medium text-muted">Scope</label>
          <select
            value={scope}
            onChange={e => setScope(e.target.value as 'global' | 'project')}
            className="w-full rounded-lg border border-border-input bg-input px-2 py-1.5 text-sm text-primary outline-none transition-colors focus:border-border-focus"
          >
            <option value="global">Global</option>
            {projectPath && <option value="project">Project</option>}
          </select>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-xs text-muted transition-colors hover:bg-hover hover:text-secondary"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!name.trim() || !content.trim()}
          className="rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-root transition-colors hover:opacity-80 disabled:opacity-30"
        >
          {initial ? 'Save changes' : 'Create template'}
        </button>
      </div>
    </div>
  );
}

// --------------- Template list item ---------------

function TemplateRow({ template, onEdit, onDelete, onInsert, onDuplicate }: {
  template: PromptTemplate;
  onEdit: () => void;
  onDelete: () => void;
  onInsert: () => void;
  onDuplicate: () => void;
}) {
  return (
    <div className="group flex items-start gap-3 rounded-lg border border-border-default bg-elevated/30 px-3 py-2.5 transition-colors hover:bg-elevated/60">
      <div className="min-w-0 flex-1">
        <button
          onClick={onInsert}
          className="text-left text-sm font-medium text-primary transition-colors hover:text-blue-400"
        >
          {template.name}
        </button>
        {template.description && (
          <p className="mt-0.5 text-[11px] text-muted">{template.description}</p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {template.tags.map(tag => (
            <span key={tag} className="flex items-center gap-0.5 rounded bg-badge px-1.5 py-0.5 text-[10px] text-faint">
              <Tag className="h-2 w-2" />
              {tag}
            </span>
          ))}
          {template.variables.length > 0 && (
            <span className="text-[10px] text-faint">
              {template.variables.length} variable{template.variables.length > 1 ? 's' : ''}
            </span>
          )}
          {template.scope === 'project' && (
            <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-400">project</span>
          )}
          {template.usageCount > 0 && (
            <span className="text-[10px] text-faint">{template.usageCount} use{template.usageCount > 1 ? 's' : ''}</span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button onClick={onDuplicate} className="rounded p-1 text-faint hover:bg-hover hover:text-secondary" title="Duplicate" aria-label="Duplicate template">
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button onClick={onEdit} className="rounded p-1 text-faint hover:bg-hover hover:text-secondary" title="Edit" aria-label="Edit template">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button onClick={onDelete} className="rounded p-1 text-faint hover:bg-hover hover:text-red-400" title="Delete" aria-label="Delete template">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// --------------- Main modal ---------------

interface PromptTemplatesModalProps {
  templates: PromptTemplate[];
  projectPath?: string | null;
  onClose: () => void;
  onInsert: (template: PromptTemplate) => void;
  onCreate: (data: Omit<PromptTemplate, 'id' | 'usageCount' | 'createdAt' | 'updatedAt'>) => Promise<PromptTemplate>;
  onUpdate: (id: string, updates: Partial<PromptTemplate>) => Promise<PromptTemplate>;
  onDelete: (id: string) => Promise<void>;
  onImport: (templates: PromptTemplate[]) => Promise<number>;
  onExport: () => Promise<PromptTemplate[]>;
}

export default function PromptTemplatesModal({
  templates, projectPath, onClose, onInsert,
  onCreate, onUpdate, onDelete, onImport, onExport,
}: PromptTemplatesModalProps) {
  const trapRef = useFocusTrap<HTMLDivElement>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'list' | 'create' | 'edit'>('list');
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(null);

  // Escape to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (view !== 'list') {
          setView('list');
          setEditingTemplate(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, view]);

  const filtered = useMemo(() => {
    if (!search.trim()) return templates;
    const q = search.toLowerCase();
    return templates.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.tags.some(tag => tag.toLowerCase().includes(q)),
    );
  }, [templates, search]);

  const handleCreate = useCallback(async (data: Omit<PromptTemplate, 'id' | 'usageCount' | 'createdAt' | 'updatedAt'>) => {
    await onCreate(data);
    setView('list');
  }, [onCreate]);

  const handleUpdate = useCallback(async (data: Omit<PromptTemplate, 'id' | 'usageCount' | 'createdAt' | 'updatedAt'>) => {
    if (!editingTemplate) return;
    await onUpdate(editingTemplate.id, data);
    setView('list');
    setEditingTemplate(null);
  }, [editingTemplate, onUpdate]);

  const handleDuplicate = useCallback(async (template: PromptTemplate) => {
    await onCreate({
      name: `${template.name} (copy)`,
      description: template.description,
      content: template.content,
      variables: template.variables,
      tags: template.tags,
      scope: template.scope,
      projectPath: template.projectPath,
    });
  }, [onCreate]);

  const handleExport = useCallback(async () => {
    const data = await onExport();
    const blob = new Blob([JSON.stringify({ templates: data }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'prompt-templates.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [onExport]);

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.templates && Array.isArray(data.templates)) {
        await onImport(data.templates);
      }
    } catch {
      console.error('[PromptTemplatesModal] Failed to import templates');
    }
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [onImport]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        ref={trapRef}
        onClick={e => e.stopPropagation()}
        className="mx-4 flex max-h-[85vh] w-full max-w-xl flex-col rounded-xl border border-border-default bg-surface shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border-default px-4 py-3">
          {view !== 'list' && (
            <button
              onClick={() => { setView('list'); setEditingTemplate(null); }}
              className="rounded p-1 text-muted transition-colors hover:bg-hover hover:text-secondary"
              aria-label="Back to list"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          <FileText className="h-4 w-4 text-blue-400" />
          <h2 className="flex-1 text-sm font-medium text-primary">
            {view === 'create' ? 'New template' : view === 'edit' ? 'Edit template' : 'Prompt Templates'}
          </h2>
          <div className="flex items-center gap-1">
            {view === 'list' && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded p-1.5 text-muted transition-colors hover:bg-hover hover:text-secondary"
                  title="Import templates"
                  aria-label="Import templates"
                >
                  <Upload className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={handleExport}
                  className="rounded p-1.5 text-muted transition-colors hover:bg-hover hover:text-secondary"
                  title="Export templates"
                  aria-label="Export templates"
                  disabled={templates.length === 0}
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="rounded p-1.5 text-muted transition-colors hover:bg-hover hover:text-secondary"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {view === 'create' && (
            <TemplateForm
              projectPath={projectPath}
              onSave={handleCreate}
              onCancel={() => setView('list')}
            />
          )}

          {view === 'edit' && editingTemplate && (
            <TemplateForm
              initial={editingTemplate}
              projectPath={projectPath}
              onSave={handleUpdate}
              onCancel={() => { setView('list'); setEditingTemplate(null); }}
            />
          )}

          {view === 'list' && (
            <div className="flex flex-col gap-3">
              {/* Search + create */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search templates..."
                    className="w-full rounded-lg border border-border-input bg-input pl-8 pr-3 py-1.5 text-sm text-primary outline-none transition-colors focus:border-border-focus"
                  />
                </div>
                <button
                  onClick={() => setView('create')}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-root transition-colors hover:opacity-80"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New
                </button>
              </div>

              {/* Template list */}
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-center">
                  <FileText className="mb-3 h-8 w-8 text-faint" />
                  <p className="text-sm text-muted">
                    {search ? 'No templates match your search' : 'No templates yet'}
                  </p>
                  {!search && (
                    <p className="mt-1 text-[11px] text-faint">
                      Create your first template to reuse prompts across sessions
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {filtered.map(template => (
                    <TemplateRow
                      key={template.id}
                      template={template}
                      onInsert={() => onInsert(template)}
                      onEdit={() => { setEditingTemplate(template); setView('edit'); }}
                      onDelete={() => onDelete(template.id)}
                      onDuplicate={() => handleDuplicate(template)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
