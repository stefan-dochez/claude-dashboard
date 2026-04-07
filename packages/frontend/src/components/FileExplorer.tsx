import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronRight, Loader2, Search,
  FileText, FileCode2, FileJson, FileType, Image, FileTerminal,
  Braces, Hash, Cog, FileCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const EXT_ICONS: Record<string, { icon: LucideIcon; color: string }> = {
  // Code
  ts: { icon: FileCode2, color: 'text-blue-400' },
  tsx: { icon: FileCode2, color: 'text-blue-400' },
  js: { icon: FileCode2, color: 'text-yellow-400' },
  jsx: { icon: FileCode2, color: 'text-yellow-400' },
  mjs: { icon: FileCode2, color: 'text-yellow-400' },
  cjs: { icon: FileCode2, color: 'text-yellow-400' },
  cs: { icon: FileCode2, color: 'text-green-400' },
  py: { icon: FileCode2, color: 'text-blue-300' },
  rs: { icon: FileCode2, color: 'text-orange-400' },
  go: { icon: FileCode2, color: 'text-cyan-400' },
  java: { icon: FileCode2, color: 'text-red-400' },
  rb: { icon: FileCode2, color: 'text-red-400' },
  php: { icon: FileCode2, color: 'text-violet-400' },
  swift: { icon: FileCode2, color: 'text-orange-400' },
  kt: { icon: FileCode2, color: 'text-violet-400' },
  // Data / config
  json: { icon: Braces, color: 'text-yellow-400' },
  jsonc: { icon: Braces, color: 'text-yellow-400' },
  yaml: { icon: FileText, color: 'text-red-300' },
  yml: { icon: FileText, color: 'text-red-300' },
  toml: { icon: FileText, color: 'text-orange-300' },
  xml: { icon: FileCode2, color: 'text-orange-300' },
  csv: { icon: FileText, color: 'text-green-300' },
  env: { icon: Cog, color: 'text-yellow-300' },
  // Web
  html: { icon: FileCode2, color: 'text-orange-400' },
  css: { icon: Hash, color: 'text-blue-300' },
  scss: { icon: Hash, color: 'text-pink-400' },
  less: { icon: Hash, color: 'text-blue-400' },
  svg: { icon: Image, color: 'text-amber-400' },
  // Docs
  md: { icon: FileType, color: 'text-blue-300' },
  mdx: { icon: FileType, color: 'text-blue-300' },
  txt: { icon: FileText, color: 'text-muted' },
  // Shell
  sh: { icon: FileTerminal, color: 'text-green-400' },
  bash: { icon: FileTerminal, color: 'text-green-400' },
  zsh: { icon: FileTerminal, color: 'text-green-400' },
  // Images
  png: { icon: Image, color: 'text-green-300' },
  jpg: { icon: Image, color: 'text-green-300' },
  jpeg: { icon: Image, color: 'text-green-300' },
  gif: { icon: Image, color: 'text-green-300' },
  webp: { icon: Image, color: 'text-green-300' },
  ico: { icon: Image, color: 'text-green-300' },
  // Lock / generated
  lock: { icon: FileCheck, color: 'text-faint' },
  // SQL
  sql: { icon: FileJson, color: 'text-blue-300' },
  // GraphQL
  graphql: { icon: FileCode2, color: 'text-pink-400' },
  gql: { icon: FileCode2, color: 'text-pink-400' },
};

const NAME_ICONS: Record<string, { icon: LucideIcon; color: string }> = {
  dockerfile: { icon: FileTerminal, color: 'text-blue-400' },
  makefile: { icon: FileTerminal, color: 'text-orange-300' },
  '.gitignore': { icon: Cog, color: 'text-faint' },
  '.eslintrc': { icon: Cog, color: 'text-violet-400' },
  '.prettierrc': { icon: Cog, color: 'text-muted' },
};

function getFileIcon(name: string): { icon: LucideIcon; color: string } {
  const lower = name.toLowerCase();
  if (NAME_ICONS[lower]) return NAME_ICONS[lower];
  const ext = lower.split('.').pop() ?? '';
  return EXT_ICONS[ext] ?? { icon: FileText, color: 'text-muted' };
}

interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

interface SearchResult {
  name: string;
  path: string;
  relative: string;
}

interface FileExplorerProps {
  projectPath: string;
  onOpenFile: (filePath: string) => void;
}

function TreeNode({ entry, depth, expanded, onToggle, onOpenFile, selectedFile }: {
  entry: FileEntry;
  depth: number;
  expanded: Map<string, FileEntry[]>;
  onToggle: (dirPath: string) => void;
  onOpenFile: (path: string) => void;
  selectedFile: string | null;
}) {
  const isOpen = expanded.has(entry.path);
  const children = expanded.get(entry.path);
  const isSelected = entry.path === selectedFile;

  return (
    <>
      <button
        onClick={() => entry.isDirectory ? onToggle(entry.path) : onOpenFile(entry.path)}
        className={`flex w-full items-center gap-1 rounded py-0.5 text-left transition-colors hover:bg-elevated/40 ${
          isSelected ? 'bg-blue-500/15 text-primary' : ''
        }`}
        style={{ paddingLeft: `${depth * 16 + 16}px` }}
      >
        {entry.isDirectory ? (
          <ChevronRight className={`h-3 w-3 shrink-0 text-faint transition-transform ${isOpen ? 'rotate-90' : ''}`} />
        ) : (() => {
          const { icon: Icon, color } = getFileIcon(entry.name);
          return <Icon className={`h-3 w-3 shrink-0 ${color}`} />;
        })()}
        <span className={`min-w-0 truncate text-[12px] ${
          entry.isDirectory ? 'text-secondary' : 'text-tertiary'
        }`}>
          {entry.name}
        </span>
      </button>
      {isOpen && children && children.map(child => (
        <TreeNode
          key={child.path}
          entry={child}
          depth={depth + 1}
          expanded={expanded}
          onToggle={onToggle}
          onOpenFile={onOpenFile}
          selectedFile={selectedFile}
        />
      ))}
    </>
  );
}

export default function FileExplorer({ projectPath, onOpenFile }: FileExplorerProps) {
  const [rootEntries, setRootEntries] = useState<FileEntry[]>([]);
  const [expanded, setExpanded] = useState<Map<string, FileEntry[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  // Search
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchDir = useCallback(async (dirPath: string): Promise<FileEntry[]> => {
    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(dirPath)}`);
      if (res.ok) return await res.json();
    } catch (err) {
      console.error('[FileExplorer] Failed to fetch:', err);
    }
    return [];
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchDir(projectPath).then(entries => {
      setRootEntries(entries);
      setLoading(false);
    });
  }, [projectPath, fetchDir]);

  const handleToggle = useCallback(async (dirPath: string) => {
    setExpanded(prev => {
      const next = new Map(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.set(dirPath, []);
        fetchDir(dirPath).then(children => {
          setExpanded(p => new Map(p).set(dirPath, children));
        });
      }
      return next;
    });
  }, [fetchDir]);

  const handleOpenFile = useCallback((filePath: string) => {
    setSelectedFile(filePath);
    onOpenFile(filePath);
  }, [onOpenFile]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults(null);
      setSearching(false);
      return;
    }

    setSearching(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/files/search?path=${encodeURIComponent(projectPath)}&q=${encodeURIComponent(query.trim())}`);
        if (res.ok) {
          setSearchResults(await res.json());
        }
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, projectPath]);

  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col overflow-hidden rounded-xl bg-surface">
      {/* Search bar */}
      <div className="shrink-0 px-2 pt-2 pb-1">
        <div className="relative">
          <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-faint" />
          <input
            type="text"
            placeholder="Search files..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full rounded bg-elevated/40 py-1 pl-7 pr-2 text-[12px] text-secondary placeholder-placeholder outline-none transition-colors focus:bg-elevated"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto py-1">
        {searchResults !== null ? (
          // Search results
          searching ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-faint" />
            </div>
          ) : searchResults.length === 0 ? (
            <p className="py-4 text-center text-xs text-faint">No files found</p>
          ) : (
            searchResults.map(result => (
              <button
                key={result.path}
                onClick={() => handleOpenFile(result.path)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left transition-colors hover:bg-elevated/40 ${
                  selectedFile === result.path ? 'bg-blue-500/15 text-primary' : ''
                }`}
              >
                {(() => { const { icon: Icon, color } = getFileIcon(result.name); return <Icon className={`h-3 w-3 shrink-0 ${color}`} />; })()}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] text-secondary">{result.name}</div>
                  <div className="truncate text-[10px] text-faint">{result.relative}</div>
                </div>
              </button>
            ))
          )
        ) : (
          // Tree view
          loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-faint" />
            </div>
          ) : rootEntries.length === 0 ? (
            <p className="py-4 text-center text-xs text-faint">Empty directory</p>
          ) : (
            rootEntries.map(entry => (
              <TreeNode
                key={entry.path}
                entry={entry}
                depth={0}
                expanded={expanded}
                onToggle={handleToggle}
                onOpenFile={handleOpenFile}
                selectedFile={selectedFile}
              />
            ))
          )
        )}
      </div>
    </aside>
  );
}
