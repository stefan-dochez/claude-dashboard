import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronUp, ChevronDown, X } from 'lucide-react';
import type { SearchAddon } from '@xterm/addon-search';

interface TerminalSearchBarProps {
  searchAddon: SearchAddon;
  onClose: () => void;
}

export default function TerminalSearchBar({ searchAddon, onClose }: TerminalSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [matchCount, setMatchCount] = useState<{ current: number; total: number } | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = searchAddon.onDidChangeResults((e) => {
      if (e === undefined) {
        setMatchCount(null);
      } else {
        setMatchCount({ current: e.resultIndex + 1, total: e.resultCount });
      }
    });
    return () => handler.dispose();
  }, [searchAddon]);

  useEffect(() => {
    if (query.length > 0) {
      searchAddon.findNext(query, { decorations: { activeMatchColorOverviewRuler: '#facc15', matchOverviewRuler: '#facc1566' } });
    } else {
      searchAddon.clearDecorations();
      setMatchCount(null);
    }
  }, [query, searchAddon]);

  const findNext = useCallback(() => {
    if (query.length > 0) {
      searchAddon.findNext(query, { decorations: { activeMatchColorOverviewRuler: '#facc15', matchOverviewRuler: '#facc1566' } });
    }
  }, [query, searchAddon]);

  const findPrevious = useCallback(() => {
    if (query.length > 0) {
      searchAddon.findPrevious(query, { decorations: { activeMatchColorOverviewRuler: '#facc15', matchOverviewRuler: '#facc1566' } });
    }
  }, [query, searchAddon]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter') {
      if (e.shiftKey) {
        findPrevious();
      } else {
        findNext();
      }
    }
  }, [onClose, findNext, findPrevious]);

  return (
    <div className="absolute top-2 right-6 z-10 flex items-center gap-1.5 rounded-lg bg-elevated/95 px-3 py-1.5 shadow-lg backdrop-blur border border-border-default">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search..."
        className="w-48 bg-transparent text-sm text-primary outline-none placeholder:text-muted"
      />
      {matchCount !== null && (
        <span className="text-xs text-muted whitespace-nowrap">
          {matchCount.total === 0 ? 'No results' : `${matchCount.current}/${matchCount.total}`}
        </span>
      )}
      <button
        onClick={findPrevious}
        className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-hover hover:text-secondary transition-colors"
        title="Previous match (Shift+Enter)"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={findNext}
        className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-hover hover:text-secondary transition-colors"
        title="Next match (Enter)"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={onClose}
        className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-hover hover:text-secondary transition-colors"
        title="Close (Esc)"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
