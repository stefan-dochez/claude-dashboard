import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface DiffViewerProps {
  diff: string;
}

interface DiffFile {
  header: string;
  fileName: string;
  hunks: DiffHunk[];
}

interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

interface DiffLine {
  type: 'add' | 'del' | 'ctx' | 'info';
  content: string;
  oldNum: number | null;
  newNum: number | null;
}

function parseDiff(raw: string): DiffFile[] {
  const files: DiffFile[] = [];
  const fileChunks = raw.split(/^diff --git /m).filter(Boolean);

  for (const chunk of fileChunks) {
    const lines = chunk.split('\n');
    const header = `diff --git ${lines[0]}`;

    // Extract file name from +++ line or header
    let fileName = '';
    for (const line of lines) {
      if (line.startsWith('+++ b/')) {
        fileName = line.slice(6);
        break;
      }
      if (line.startsWith('+++ /')) {
        fileName = line.slice(4);
        break;
      }
    }
    if (!fileName) {
      const match = header.match(/b\/(.+)$/);
      fileName = match ? match[1] : 'unknown';
    }

    const hunks: DiffHunk[] = [];
    let currentHunk: DiffHunk | null = null;
    let oldLine = 0;
    let newLine = 0;

    for (const line of lines) {
      if (line.startsWith('@@')) {
        const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        oldLine = match ? parseInt(match[1]) : 1;
        newLine = match ? parseInt(match[2]) : 1;
        currentHunk = { header: line, lines: [] };
        hunks.push(currentHunk);
        continue;
      }

      if (!currentHunk) continue;

      if (line.startsWith('+')) {
        currentHunk.lines.push({ type: 'add', content: line.slice(1), oldNum: null, newNum: newLine });
        newLine++;
      } else if (line.startsWith('-')) {
        currentHunk.lines.push({ type: 'del', content: line.slice(1), oldNum: oldLine, newNum: null });
        oldLine++;
      } else if (line.startsWith(' ')) {
        currentHunk.lines.push({ type: 'ctx', content: line.slice(1), oldNum: oldLine, newNum: newLine });
        oldLine++;
        newLine++;
      } else if (line.startsWith('\\')) {
        currentHunk.lines.push({ type: 'info', content: line, oldNum: null, newNum: null });
      }
    }

    // Check for binary file
    const isBinary = lines.some(l => l.includes('Binary files') && l.includes('differ'));
    if (isBinary) {
      hunks.push({
        header: '',
        lines: [{ type: 'info', content: 'Binary file changed', oldNum: null, newNum: null }],
      });
    }

    files.push({ header, fileName, hunks });
  }

  return files;
}

interface Token {
  text: string;
  className?: string;
}

const KEYWORDS = new Set([
  'import', 'export', 'const', 'let', 'var', 'function', 'return', 'if', 'else',
  'class', 'interface', 'type', 'async', 'await', 'from', 'new', 'throw', 'try',
  'catch', 'for', 'while', 'true', 'false', 'null', 'undefined', 'void',
]);

const TOKEN_REGEX =
  /\/\/.*$|\/\*[\s\S]*?\*\/|#.*$|<!--[\s\S]*?-->|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|===|!==|=>|&&|\|\||(?<![a-zA-Z_$])\b\d+(?:\.\d+)?\b|\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/gm;

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(TOKEN_REGEX)) {
    const matchStart = match.index;
    const matchText = match[0];

    if (matchStart > lastIndex) {
      tokens.push({ text: text.slice(lastIndex, matchStart) });
    }

    let className: string | undefined;

    if (
      matchText.startsWith('//') || matchText.startsWith('/*') ||
      matchText.startsWith('#') || matchText.startsWith('<!--')
    ) {
      className = 'text-neutral-500 italic';
    } else if (
      matchText.startsWith('"') || matchText.startsWith("'") || matchText.startsWith('`')
    ) {
      className = 'text-amber-300';
    } else if (
      matchText === '=>' || matchText === '===' || matchText === '!==' ||
      matchText === '&&' || matchText === '||'
    ) {
      className = 'text-neutral-400';
    } else if (/^\d/.test(matchText)) {
      className = 'text-blue-300';
    } else if (KEYWORDS.has(matchText)) {
      className = 'text-violet-400';
    }

    tokens.push({ text: matchText, className });
    lastIndex = matchStart + matchText.length;
  }

  if (lastIndex < text.length) {
    tokens.push({ text: text.slice(lastIndex) });
  }

  return tokens;
}

function renderHighlightedLine(content: string): React.ReactNode {
  const tokens = tokenize(content);
  return tokens.map((token, i) =>
    token.className
      ? <span key={i} className={token.className}>{token.text}</span>
      : <span key={i}>{token.text}</span>
  );
}

export default function DiffViewer({ diff }: DiffViewerProps) {
  const files = useMemo(() => parseDiff(diff), [diff]);
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());

  const toggleFile = (fileName: string) => {
    setCollapsedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(fileName)) {
        next.delete(fileName);
      } else {
        next.add(fileName);
      }
      return next;
    });
  };

  const allCollapsed = files.length > 0 && files.every((f) => collapsedFiles.has(f.fileName));

  const toggleAll = () => {
    if (allCollapsed) {
      setCollapsedFiles(new Set());
    } else {
      setCollapsedFiles(new Set(files.map((f) => f.fileName)));
    }
  };

  if (!diff.trim()) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        No diff to display
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      {files.length > 1 && (
        <div className="flex justify-end px-4 py-1">
          <button
            onClick={toggleAll}
            className="text-[10px] text-neutral-500 transition-colors duration-150 hover:text-neutral-300"
          >
            {allCollapsed ? 'Expand all' : 'Collapse all'}
          </button>
        </div>
      )}
      {files.map((file) => {
        const collapsed = collapsedFiles.has(file.fileName);
        return (
          <div key={file.fileName} className="mb-1">
            {/* File header */}
            <button
              onClick={() => toggleFile(file.fileName)}
              className="sticky top-0 z-10 flex w-full items-center gap-1.5 border-b border-neutral-800 bg-[#1a1a2e] px-4 py-1.5 text-left"
            >
              {collapsed ? <ChevronRight className="h-3 w-3 text-neutral-500" /> : <ChevronDown className="h-3 w-3 text-neutral-500" />}
              <span className="font-mono text-xs font-medium text-blue-300">{file.fileName}</span>
              <span className="ml-auto text-[10px] text-neutral-600">{file.hunks.reduce((n, h) => n + h.lines.length, 0)} lines</span>
            </button>

            {/* Hunks */}
            {!collapsed && file.hunks.map((hunk, hi) => (
              <div key={hi}>
                {hunk.header && (
                  <div className="bg-[#1a1a2e]/50 px-4 py-0.5 font-mono text-xs text-neutral-500">
                    {hunk.header}
                  </div>
                )}
                <table className="w-full border-collapse font-mono text-[13px] leading-5">
                  <tbody>
                    {hunk.lines.map((line, li) => (
                      <tr
                        key={li}
                        className={
                          line.type === 'add'
                            ? 'bg-green-900/20'
                            : line.type === 'del'
                              ? 'bg-red-900/20'
                              : line.type === 'info'
                                ? 'bg-neutral-800/30'
                                : ''
                        }
                      >
                        <td className="w-[1px] select-none whitespace-nowrap px-2 text-right text-xs text-neutral-600">
                          {line.oldNum ?? ''}
                        </td>
                        <td className="w-[1px] select-none whitespace-nowrap px-2 text-right text-xs text-neutral-600">
                          {line.newNum ?? ''}
                        </td>
                        <td className="w-[1px] select-none px-1">
                          <span
                            className={
                              line.type === 'add'
                                ? 'text-green-400'
                                : line.type === 'del'
                                  ? 'text-red-400'
                                  : 'text-transparent'
                            }
                          >
                            {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}
                          </span>
                        </td>
                        <td className="whitespace-pre-wrap break-all pr-4">
                          <span
                            className={
                              line.type === 'add'
                                ? 'text-green-300'
                                : line.type === 'del'
                                  ? 'text-red-300'
                                  : line.type === 'info'
                                    ? 'italic text-neutral-500'
                                    : 'text-neutral-300'
                            }
                          >
                            {line.type === 'ctx' ? renderHighlightedLine(line.content) : line.content}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
