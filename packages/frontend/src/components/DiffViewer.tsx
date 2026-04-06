import { useMemo } from 'react';

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

export default function DiffViewer({ diff }: DiffViewerProps) {
  const files = useMemo(() => parseDiff(diff), [diff]);

  if (!diff.trim()) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        No diff to display
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      {files.map((file, fi) => (
        <div key={fi} className="mb-1">
          {/* File header */}
          <div className="sticky top-0 z-10 border-b border-neutral-800 bg-[#1a1a2e] px-4 py-1.5">
            <span className="font-mono text-xs font-medium text-blue-300">{file.fileName}</span>
          </div>

          {/* Hunks */}
          {file.hunks.map((hunk, hi) => (
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
                          {line.content}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
