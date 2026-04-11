import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { getFileIcon } from '../utils/fileUtils';

interface SearchMatch {
  line: number;
  text: string;
}

interface SearchResultGroup {
  file: string;
  relative: string;
  matches: SearchMatch[];
}

interface CodeSearchModalProps {
  projectPath: string;
  onOpenFile: (filePath: string) => void;
  onClose: () => void;
}

export default function CodeSearchModal({ projectPath, onOpenFile, onClose }: CodeSearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultGroup[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Build a flat list of selectable items (each match is one item)
  const flatItems = results.flatMap(group =>
    group.matches.map(match => ({ file: group.file, relative: group.relative, match })),
  );

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/code/search?path=${encodeURIComponent(projectPath)}&q=${encodeURIComponent(query.trim())}`,
        );
        if (res.ok) {
          const data: SearchResultGroup[] = await res.json();
          setResults(data);
          setSelectedIndex(0);
        }
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, projectPath]);

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleSelect = useCallback((file: string) => {
    onOpenFile(file);
    onClose();
  }, [onOpenFile, onClose]);

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
      if (flatItems[selectedIndex]) {
        handleSelect(flatItems[selectedIndex].file);
      }
    }
  }, [onClose, flatItems, selectedIndex, handleSelect]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Build highlighted text
  const highlightMatch = (text: string, q: string) => {
    if (!q.trim()) return text;
    const parts: Array<{ text: string; highlight: boolean }> = [];
    const lower = text.toLowerCase();
    const qLower = q.toLowerCase();
    let lastIdx = 0;
    let idx = lower.indexOf(qLower);
    while (idx !== -1 && lastIdx < text.length) {
      if (idx > lastIdx) parts.push({ text: text.slice(lastIdx, idx), highlight: false });
      parts.push({ text: text.slice(idx, idx + q.length), highlight: true });
      lastIdx = idx + q.length;
      idx = lower.indexOf(qLower, lastIdx);
    }
    if (lastIdx < text.length) parts.push({ text: text.slice(lastIdx), highlight: false });
    return parts;
  };

  let itemIdx = 0;

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
            placeholder="Search in files..."
            className="flex-1 bg-transparent text-[13px] text-primary placeholder-placeholder outline-none"
          />
          {query && (
            <span className="text-[11px] text-faint">
              {flatItems.length} match{flatItems.length !== 1 ? 'es' : ''}
            </span>
          )}
          <button
            onClick={onClose}
            className="rounded p-0.5 text-faint transition-colors hover:text-secondary"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[400px] overflow-y-auto">
          {!query.trim() ? (
            <div className="flex items-center justify-center py-8 text-xs text-faint">
              Type to search across project files
            </div>
          ) : searching && results.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-faint" />
            </div>
          ) : results.length === 0 && !searching ? (
            <div className="flex items-center justify-center py-8 text-xs text-faint">
              No results found
            </div>
          ) : (
            results.map(group => {
              const fileName = group.relative.split('/').pop() ?? group.relative;
              const { icon: Icon, color } = getFileIcon(fileName);
              return (
                <div key={group.relative}>
                  {/* File header */}
                  <div className="sticky top-0 flex items-center gap-1.5 bg-elevated/80 px-3 py-1 backdrop-blur-sm">
                    <Icon className={`h-3 w-3 shrink-0 ${color}`} />
                    <span className="truncate text-[11px] font-medium text-secondary">{group.relative}</span>
                  </div>
                  {/* Matches */}
                  {group.matches.map(match => {
                    const currentIdx = itemIdx++;
                    const isSelected = currentIdx === selectedIndex;
                    const parts = highlightMatch(match.text, query);
                    return (
                      <button
                        key={`${group.relative}:${match.line}`}
                        data-index={currentIdx}
                        onClick={() => handleSelect(group.file)}
                        className={`flex w-full items-start gap-2 px-3 py-1 text-left transition-colors ${
                          isSelected ? 'bg-blue-500/15' : 'hover:bg-elevated/30'
                        }`}
                      >
                        <span className="w-8 shrink-0 text-right font-mono text-[11px] text-faint">
                          {match.line}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-tertiary">
                          {Array.isArray(parts)
                            ? parts.map((part, i) =>
                                part.highlight
                                  ? <mark key={i} className="rounded-sm bg-yellow-500/30 text-yellow-200">{part.text}</mark>
                                  : <span key={i}>{part.text}</span>,
                              )
                            : parts
                          }
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-3 border-t border-border-default px-3 py-1.5 text-[10px] text-faint">
          <span><kbd className="rounded bg-elevated px-1 py-0.5 font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="rounded bg-elevated px-1 py-0.5 font-mono">⏎</kbd> open</span>
          <span><kbd className="rounded bg-elevated px-1 py-0.5 font-mono">esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
