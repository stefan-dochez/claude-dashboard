import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// --------------- Types ---------------

export interface Command {
  id: string;
  label: string;
  description?: string;
  category: CommandCategory;
  icon: LucideIcon;
  iconColor?: string;
  shortcut?: string;
  keywords?: string[];
  onExecute: () => void;
}

type CommandCategory = 'action' | 'instance' | 'project';

const CATEGORY_LABELS: Record<CommandCategory, string> = {
  action: 'Actions',
  instance: 'Instances',
  project: 'Projects',
};

const CATEGORY_ORDER: CommandCategory[] = ['action', 'instance', 'project'];

// --------------- Fuzzy match ---------------

function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();

  // Exact substring — best score
  if (t.includes(q)) {
    // Bonus if it starts with the query
    return t.startsWith(q) ? 1000 : 800;
  }

  // Word-start matching (e.g. "ts" matches "Toggle Sidebar")
  const words = t.split(/[\s/\-_]+/);
  let qi = 0;
  for (const word of words) {
    if (qi >= q.length) break;
    if (word.startsWith(q[qi])) {
      qi++;
    }
  }
  if (qi === q.length) return 600;

  // Character-by-character fuzzy
  let score = 0;
  let ti = 0;
  let consecutive = 0;
  for (let i = 0; i < q.length; i++) {
    let found = false;
    while (ti < t.length) {
      if (t[ti] === q[i]) {
        score += 10 + consecutive * 5;
        consecutive++;
        ti++;
        found = true;
        break;
      }
      consecutive = 0;
      ti++;
    }
    if (!found) return 0; // Character not found — no match
  }
  return score;
}

function matchCommand(query: string, command: Command): number {
  if (!query) return 1; // Show all when empty

  // Score against label
  let best = fuzzyScore(query, command.label);

  // Score against description
  if (command.description) {
    best = Math.max(best, fuzzyScore(query, command.description) * 0.8);
  }

  // Score against keywords
  if (command.keywords) {
    for (const kw of command.keywords) {
      best = Math.max(best, fuzzyScore(query, kw) * 0.9);
    }
  }

  return best;
}

// --------------- Highlight match ---------------

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;

  const qLower = query.toLowerCase();
  const tLower = text.toLowerCase();

  // For exact substring matches, highlight the substring
  const idx = tLower.indexOf(qLower);
  if (idx !== -1) {
    return (
      <>
        {text.slice(0, idx)}
        <mark className="rounded-sm bg-blue-500/30 text-blue-200">{text.slice(idx, idx + query.length)}</mark>
        {text.slice(idx + query.length)}
      </>
    );
  }

  // For fuzzy matches, highlight individual characters
  const chars = text.split('');
  const highlighted = new Set<number>();
  let qi = 0;
  for (let ti = 0; ti < tLower.length && qi < qLower.length; ti++) {
    if (tLower[ti] === qLower[qi]) {
      highlighted.add(ti);
      qi++;
    }
  }

  return (
    <>
      {chars.map((char, i) =>
        highlighted.has(i)
          ? <mark key={i} className="rounded-sm bg-blue-500/30 text-blue-200">{char}</mark>
          : <span key={i}>{char}</span>,
      )}
    </>
  );
}

// --------------- Component ---------------

interface CommandPaletteProps {
  commands: Command[];
  onClose: () => void;
}

export default function CommandPalette({ commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter and sort commands
  const filteredCommands = useMemo(() => {
    const scored = commands
      .map(cmd => ({ cmd, score: matchCommand(query, cmd) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score);

    // When no query, group by category in order
    if (!query.trim()) {
      const grouped: Array<{ cmd: Command; score: number }> = [];
      for (const cat of CATEGORY_ORDER) {
        const inCat = scored.filter(({ cmd }) => cmd.category === cat);
        grouped.push(...inCat);
      }
      return grouped.map(({ cmd }) => cmd);
    }

    return scored.map(({ cmd }) => cmd);
  }, [commands, query]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-cmd-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleExecute = useCallback((cmd: Command) => {
    cmd.onExecute();
    onClose();
  }, [onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, filteredCommands.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filteredCommands[selectedIndex];
      if (cmd) handleExecute(cmd);
    }
  }, [filteredCommands, selectedIndex, handleExecute, onClose]);

  // Build category headers
  const itemsWithHeaders = useMemo(() => {
    const result: Array<{ type: 'header'; label: string } | { type: 'command'; cmd: Command; index: number }> = [];
    let currentCategory: CommandCategory | null = null;
    let cmdIndex = 0;

    for (const cmd of filteredCommands) {
      // Only show headers when there's no search query (grouped mode)
      if (!query.trim() && cmd.category !== currentCategory) {
        currentCategory = cmd.category;
        result.push({ type: 'header', label: CATEGORY_LABELS[cmd.category] });
      }
      result.push({ type: 'command', cmd, index: cmdIndex });
      cmdIndex++;
    }

    return result;
  }, [filteredCommands, query]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-20"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-border-input bg-surface shadow-2xl"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 border-b border-border-default px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-faint" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Type a command..."
            className="flex-1 bg-transparent text-[13px] text-primary placeholder-placeholder outline-none"
          />
          {query && (
            <span className="text-[11px] text-faint">
              {filteredCommands.length} result{filteredCommands.length !== 1 ? 's' : ''}
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
        <div ref={listRef} className="max-h-[400px] overflow-y-auto py-1">
          {filteredCommands.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-xs text-faint">
              No matching commands
            </div>
          ) : (
            itemsWithHeaders.map((item) => {
              if (item.type === 'header') {
                return (
                  <div key={`h-${item.label}`} className="px-3 pb-1 pt-2 first:pt-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">
                      {item.label}
                    </span>
                  </div>
                );
              }

              const { cmd, index } = item;
              const isSelected = index === selectedIndex;
              const Icon = cmd.icon;

              return (
                <button
                  key={cmd.id}
                  data-cmd-index={index}
                  onClick={() => handleExecute(cmd)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors ${
                    isSelected ? 'bg-blue-500/15' : 'hover:bg-elevated/30'
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${cmd.iconColor ?? 'text-muted'}`} />
                  <div className="min-w-0 flex-1">
                    <span className="text-[12px] text-primary">
                      {highlightMatch(cmd.label, query)}
                    </span>
                    {cmd.description && (
                      <span className="ml-2 text-[11px] text-faint">
                        {cmd.description}
                      </span>
                    )}
                  </div>
                  {cmd.shortcut && (
                    <kbd className="shrink-0 rounded bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-faint">
                      {cmd.shortcut}
                    </kbd>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-3 border-t border-border-default px-3 py-1.5 text-[10px] text-faint">
          <span><kbd className="rounded bg-elevated px-1 py-0.5 font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="rounded bg-elevated px-1 py-0.5 font-mono">⏎</kbd> execute</span>
          <span><kbd className="rounded bg-elevated px-1 py-0.5 font-mono">esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
