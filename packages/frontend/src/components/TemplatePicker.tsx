import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { FileText, Search, Hash, X } from 'lucide-react';
import type { PromptTemplate, PromptTemplateVariable } from '../types';

// --------------- Variable fill dialog ---------------

function VariableFillDialog({ template, onConfirm, onCancel }: {
  template: PromptTemplate;
  onConfirm: (filled: string) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const v of template.variables) {
      initial[v.name] = v.defaultValue ?? '';
    }
    return initial;
  });

  const handleConfirm = useCallback(() => {
    let result = template.content;
    for (const v of template.variables) {
      const value = values[v.name] || v.defaultValue || `{{${v.name}}}`;
      result = result.replaceAll(`{{${v.name}}}`, value);
    }
    onConfirm(result);
  }, [template, values, onConfirm]);

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-primary">{template.name}</span>
        <button onClick={onCancel} className="text-faint hover:text-secondary">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {template.variables.map(v => (
        <div key={v.name} className="flex items-center gap-2">
          <span className="flex shrink-0 items-center gap-1 rounded bg-elevated px-1.5 py-0.5 text-[11px] font-mono text-violet-400">
            <Hash className="h-2.5 w-2.5" />
            {v.name}
          </span>
          <input
            value={values[v.name] ?? ''}
            onChange={e => setValues(prev => ({ ...prev, [v.name]: e.target.value }))}
            placeholder={v.placeholder ?? v.name}
            className="flex-1 rounded border border-border-input bg-input px-2 py-1 text-[11px] text-primary outline-none transition-colors focus:border-border-focus"
            onKeyDown={e => { if (e.key === 'Enter') handleConfirm(); }}
          />
        </div>
      ))}
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-lg px-2.5 py-1 text-[11px] text-muted hover:bg-hover hover:text-secondary"
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          className="rounded-lg bg-primary px-3 py-1 text-[11px] font-medium text-root hover:opacity-80"
        >
          Insert
        </button>
      </div>
    </div>
  );
}

// --------------- Main picker dropdown ---------------

interface TemplatePickerProps {
  templates: PromptTemplate[];
  onSelect: (content: string, template: PromptTemplate) => void;
  onOpenManager: () => void;
  onClose: () => void;
}

export default function TemplatePicker({ templates, onSelect, onOpenManager, onClose }: TemplatePickerProps) {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [fillingTemplate, setFillingTemplate] = useState<PromptTemplate | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Close on click outside — delay registration by one frame so the opening
  // click doesn't immediately trigger the outside-click handler.
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      // If the target was removed from DOM by a React re-render, ignore —
      // this is not a genuine outside click.
      if (!document.body.contains(target)) return;
      if (ref.current && !ref.current.contains(target)) {
        onClose();
      }
    };
    const frameId = requestAnimationFrame(() => {
      document.addEventListener('mousedown', handleClickOutside);
    });
    return () => {
      cancelAnimationFrame(frameId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const filtered = useMemo(() => {
    if (!search.trim()) return templates;
    const q = search.toLowerCase();
    return templates.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.tags.some(tag => tag.toLowerCase().includes(q)),
    );
  }, [templates, search]);

  const handleSelect = useCallback((template: PromptTemplate) => {
    if (template.variables.length > 0) {
      setFillingTemplate(template);
    } else {
      onSelect(template.content, template);
    }
  }, [onSelect]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (fillingTemplate) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && filtered.length > 0) {
      e.preventDefault();
      handleSelect(filtered[selectedIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }, [filtered, selectedIndex, handleSelect, onClose, fillingTemplate]);

  // Reset index on search change
  useEffect(() => { setSelectedIndex(0); }, [search]);

  if (fillingTemplate) {
    return (
      <div ref={ref} className="overflow-hidden rounded-xl border border-border-default bg-popover shadow-xl">
        <VariableFillDialog
          template={fillingTemplate}
          onConfirm={content => {
            onSelect(content, fillingTemplate);
            setFillingTemplate(null);
          }}
          onCancel={() => setFillingTemplate(null)}
        />
      </div>
    );
  }

  return (
    <div ref={ref} onKeyDown={handleKeyDown}>
      <div className="overflow-hidden rounded-xl border border-border-default bg-popover shadow-xl">
        {/* Search */}
        <div className="border-b border-border-default px-3 py-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-faint" />
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search templates..."
              className="w-full rounded bg-input py-1 pl-7 pr-2 text-[12px] text-primary outline-none transition-colors focus:bg-elevated"
            />
          </div>
        </div>

        {/* Results */}
        <div className="max-h-56 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-[11px] text-faint">
              {search ? 'No templates match' : 'No templates yet'}
            </div>
          ) : (
            filtered.map((template, i) => (
              <button
                key={template.id}
                onMouseDown={e => { e.preventDefault(); handleSelect(template); }}
                onMouseEnter={() => setSelectedIndex(i)}
                className={`flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors ${
                  i === selectedIndex ? 'bg-elevated' : 'hover:bg-hover'
                }`}
              >
                <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-400" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[12px] font-medium text-primary">{template.name}</span>
                    {template.usageCount > 0 && (
                      <span className="text-[10px] text-faint">{template.usageCount}x</span>
                    )}
                  </div>
                  {template.description && (
                    <p className="truncate text-[11px] text-muted">{template.description}</p>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border-default px-3 py-1.5">
          <button
            onMouseDown={e => { e.preventDefault(); onOpenManager(); }}
            className="text-[11px] text-muted transition-colors hover:text-secondary"
          >
            Manage templates...
          </button>
        </div>
      </div>
    </div>
  );
}
