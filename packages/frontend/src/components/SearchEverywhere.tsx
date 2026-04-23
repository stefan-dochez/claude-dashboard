import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, X, Loader2, File as FileIcon, Type } from 'lucide-react';
import { getFileIcon } from '../utils/fileUtils';

// --------------- Types ---------------

interface FileResult {
  name: string;
  path: string;
  relative: string;
}

interface TextMatch {
  line: number;
  text: string;
}

interface TextResultGroup {
  file: string;
  relative: string;
  matches: TextMatch[];
}

type TabKind = 'all' | 'files' | 'text';

type FlatItem =
  | { kind: 'file'; file: string; relative: string }
  | { kind: 'text'; file: string; relative: string; match: TextMatch };

interface SearchEverywhereProps {
  projectPath: string;
  initialTab?: TabKind;
  onOpenFile: (filePath: string, line?: number) => void;
  onClose: () => void;
}

const TABS: { id: TabKind; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'files', label: 'Files' },
  { id: 'text', label: 'Text' },
];

// --------------- Highlight helper ---------------

function highlightMatch(text: string, q: string): React.ReactNode {
  if (!q.trim()) return text;
  const parts: React.ReactNode[] = [];
  const lower = text.toLowerCase();
  const qLower = q.toLowerCase();
  let lastIdx = 0;
  let idx = lower.indexOf(qLower);
  let key = 0;
  while (idx !== -1 && lastIdx < text.length) {
    if (idx > lastIdx) parts.push(<span key={key++}>{text.slice(lastIdx, idx)}</span>);
    parts.push(
      <mark key={key++} className="rounded-sm bg-yellow-500/30 text-yellow-200">
        {text.slice(idx, idx + q.length)}
      </mark>,
    );
    lastIdx = idx + q.length;
    idx = lower.indexOf(qLower, lastIdx);
  }
  if (lastIdx < text.length) parts.push(<span key={key++}>{text.slice(lastIdx)}</span>);
  return parts;
}

// --------------- Component ---------------

export default function SearchEverywhere({
  projectPath,
  initialTab = 'all',
  onOpenFile,
  onClose,
}: SearchEverywhereProps) {
  const [tab, setTab] = useState<TabKind>(initialTab);
  const [query, setQuery] = useState('');
  const [files, setFiles] = useState<FileResult[]>([]);
  const [textGroups, setTextGroups] = useState<TextResultGroup[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced search — fetches files and/or text depending on tab.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setFiles([]);
      setTextGroups([]);
      setSearching(false);
      setSelectedIndex(0);
      abortRef.current?.abort();
      return;
    }

    setSearching(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const { signal } = controller;

      const doFiles = tab === 'all' || tab === 'files';
      const doText = tab === 'all' || tab === 'text';

      const filesP = doFiles
        ? fetch(`/api/files/search?path=${encodeURIComponent(projectPath)}&q=${encodeURIComponent(trimmed)}`, { signal })
            .then(r => (r.ok ? r.json() as Promise<FileResult[]> : []))
            .catch(() => [] as FileResult[])
        : Promise.resolve([] as FileResult[]);
      const textP = doText
        ? fetch(`/api/code/search?path=${encodeURIComponent(projectPath)}&q=${encodeURIComponent(trimmed)}`, { signal })
            .then(r => (r.ok ? r.json() as Promise<TextResultGroup[]> : []))
            .catch(() => [] as TextResultGroup[])
        : Promise.resolve([] as TextResultGroup[]);

      try {
        const [filesRes, textRes] = await Promise.all([filesP, textP]);
        if (signal.aborted) return;
        setFiles(filesRes);
        setTextGroups(textRes);
        setSelectedIndex(0);
      } finally {
        if (!signal.aborted) setSearching(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, projectPath, tab]);

  // Focus input on mount.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Flat item list — drives keyboard nav. Order: Files first, then Text.
  const flatItems = useMemo<FlatItem[]>(() => {
    const items: FlatItem[] = [];
    if (tab === 'all' || tab === 'files') {
      for (const f of files) items.push({ kind: 'file', file: f.path, relative: f.relative });
    }
    if (tab === 'all' || tab === 'text') {
      for (const g of textGroups) {
        for (const m of g.matches) items.push({ kind: 'text', file: g.file, relative: g.relative, match: m });
      }
    }
    return items;
  }, [files, textGroups, tab]);

  // Keep selection inside bounds when results shrink.
  useEffect(() => {
    if (selectedIndex >= flatItems.length) setSelectedIndex(Math.max(0, flatItems.length - 1));
  }, [flatItems.length, selectedIndex]);

  // Scroll selected item into view.
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const openItem = useCallback((item: FlatItem) => {
    if (item.kind === 'file') onOpenFile(item.file);
    else onOpenFile(item.file, item.match.line);
    onClose();
  }, [onOpenFile, onClose]);

  const cycleTab = useCallback((dir: 1 | -1) => {
    setTab(prev => {
      const idx = TABS.findIndex(t => t.id === prev);
      const next = (idx + dir + TABS.length) % TABS.length;
      return TABS[next].id;
    });
    setSelectedIndex(0);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, flatItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = flatItems[selectedIndex];
      if (item) openItem(item);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      cycleTab(e.shiftKey ? -1 : 1);
    } else if ((e.metaKey || e.ctrlKey) && (e.key === '1' || e.key === '2' || e.key === '3')) {
      e.preventDefault();
      const idx = parseInt(e.key, 10) - 1;
      if (TABS[idx]) { setTab(TABS[idx].id); setSelectedIndex(0); }
    }
  }, [flatItems, selectedIndex, openItem, onClose, cycleTab]);

  // Render helpers: track running index across sections for keyboard nav parity.
  let itemIdx = 0;

  const showFilesSection = (tab === 'all' || tab === 'files') && files.length > 0;
  const showTextSection = (tab === 'all' || tab === 'text') && textGroups.length > 0;
  const nothing = !searching && query.trim() && !showFilesSection && !showTextSection;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-20"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-border-input bg-surface shadow-2xl"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border-default px-2 pt-2">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setSelectedIndex(0); }}
              className={`rounded-t-md px-3 py-1.5 text-[12px] font-medium transition-colors ${
                tab === t.id
                  ? 'bg-elevated text-primary'
                  : 'text-faint hover:text-secondary'
              }`}
            >
              {t.label}
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="mb-1 rounded p-0.5 text-faint transition-colors hover:text-secondary"
            title="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Search input */}
        <div className="flex items-center gap-2 border-b border-border-default px-3 py-2.5">
          {searching ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-faint" />
          ) : (
            <Search className="h-4 w-4 shrink-0 text-faint" />
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={
              tab === 'files' ? 'Search files by name…'
              : tab === 'text' ? 'Search file contents…'
              : 'Search files and contents…'
            }
            className="flex-1 bg-transparent text-[13px] text-primary placeholder-placeholder outline-none"
          />
          {query && flatItems.length > 0 && (
            <span className="text-[11px] text-faint">
              {flatItems.length} result{flatItems.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[440px] overflow-y-auto">
          {!query.trim() ? (
            <div className="flex items-center justify-center py-8 text-xs text-faint">
              Type to search the project
            </div>
          ) : searching && flatItems.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-faint" />
            </div>
          ) : nothing ? (
            <div className="flex items-center justify-center py-8 text-xs text-faint">
              No results found
            </div>
          ) : (
            <>
              {showFilesSection && (
                <div>
                  {tab === 'all' && (
                    <div className="sticky top-0 flex items-center gap-1.5 bg-elevated/80 px-3 py-1 backdrop-blur-sm">
                      <FileIcon className="h-3 w-3 shrink-0 text-faint" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">Files</span>
                    </div>
                  )}
                  {files.map(f => {
                    const currentIdx = itemIdx++;
                    const isSelected = currentIdx === selectedIndex;
                    const { icon: Icon, color } = getFileIcon(f.name);
                    const dir = f.relative.includes('/') ? f.relative.slice(0, f.relative.lastIndexOf('/')) : '';
                    return (
                      <button
                        key={`f-${f.path}`}
                        data-index={currentIdx}
                        onClick={() => openItem({ kind: 'file', file: f.path, relative: f.relative })}
                        onMouseEnter={() => setSelectedIndex(currentIdx)}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                          isSelected ? 'bg-blue-500/15' : 'hover:bg-elevated/30'
                        }`}
                      >
                        <Icon className={`h-3.5 w-3.5 shrink-0 ${color}`} />
                        <span className="truncate text-[12px] text-primary">
                          {highlightMatch(f.name, query)}
                        </span>
                        {dir && (
                          <span className="truncate text-[11px] text-faint">{dir}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {showTextSection && (
                <div>
                  {tab === 'all' && (
                    <div className="sticky top-0 flex items-center gap-1.5 bg-elevated/80 px-3 py-1 backdrop-blur-sm">
                      <Type className="h-3 w-3 shrink-0 text-faint" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">Text</span>
                    </div>
                  )}
                  {textGroups.map(group => {
                    const fileName = group.relative.split('/').pop() ?? group.relative;
                    const { icon: Icon, color } = getFileIcon(fileName);
                    return (
                      <div key={`g-${group.relative}`}>
                        <div className="flex items-center gap-1.5 bg-elevated/40 px-3 py-1">
                          <Icon className={`h-3 w-3 shrink-0 ${color}`} />
                          <span className="truncate text-[11px] font-medium text-secondary">{group.relative}</span>
                        </div>
                        {group.matches.map(match => {
                          const currentIdx = itemIdx++;
                          const isSelected = currentIdx === selectedIndex;
                          return (
                            <button
                              key={`t-${group.relative}:${match.line}`}
                              data-index={currentIdx}
                              onClick={() => openItem({ kind: 'text', file: group.file, relative: group.relative, match })}
                              onMouseEnter={() => setSelectedIndex(currentIdx)}
                              className={`flex w-full items-start gap-2 px-3 py-1 text-left transition-colors ${
                                isSelected ? 'bg-blue-500/15' : 'hover:bg-elevated/30'
                              }`}
                            >
                              <span className="w-8 shrink-0 text-right font-mono text-[11px] text-faint">
                                {match.line}
                              </span>
                              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-tertiary">
                                {highlightMatch(match.text, query)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-3 border-t border-border-default px-3 py-1.5 text-[10px] text-faint">
          <span><kbd className="rounded bg-elevated px-1 py-0.5 font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="rounded bg-elevated px-1 py-0.5 font-mono">⏎</kbd> open</span>
          <span><kbd className="rounded bg-elevated px-1 py-0.5 font-mono">tab</kbd> switch</span>
          <span><kbd className="rounded bg-elevated px-1 py-0.5 font-mono">esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
