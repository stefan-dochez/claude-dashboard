import { useState, useEffect, useCallback, useRef } from 'react';
import { FileText, X, Loader2, MessageSquare, Code, BookOpen } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { detectLanguage } from '../utils/fileUtils';

interface FileViewerProps {
  filePath: string;
  onClose: () => void;
  onSendToChat?: (filePath: string, startLine: number, endLine: number, code: string) => void;
  onSelectionChange?: (sel: { filePath: string; startLine: number; endLine: number; text: string } | null) => void;
  highlightLine?: number;
}

export default function FileViewer({ filePath, onClose, onSendToChat, onSelectionChange, highlightLine }: FileViewerProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState(0);
  const [selectionInfo, setSelectionInfo] = useState<{ startLine: number; endLine: number; text: string } | null>(null);
  // Markdown can't scroll to a source line when rendered, so show source when highlighting.
  const [showSource, setShowSource] = useState(highlightLine != null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      setSelectionInfo(null);
      onSelectionChange?.(null);
      return;
    }
    const text = selection.toString();
    const trimmed = text.trim();
    if (!trimmed) {
      setSelectionInfo(null);
      onSelectionChange?.(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const scroller = scrollContainerRef.current;
    if (!scroller || !scroller.contains(range.commonAncestorContainer)) {
      setSelectionInfo(null);
      onSelectionChange?.(null);
      return;
    }

    // Resolve each range endpoint to its surrounding [data-line] wrapper.
    // This is reliable even when the selected text occurs multiple times in the file.
    const lineOf = (node: Node): number | null => {
      const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
      const lineEl = el?.closest<HTMLElement>('[data-line]');
      const n = lineEl?.dataset.line;
      return n ? Number(n) : null;
    };

    const startLineRaw = lineOf(range.startContainer);
    let endLineRaw = lineOf(range.endContainer);
    if (startLineRaw == null || endLineRaw == null) {
      setSelectionInfo(null);
      onSelectionChange?.(null);
      return;
    }
    // Selection ending at offset 0 of the next line (or with a trailing newline) doesn't
    // actually cover that line visually — clamp back to the previous one.
    if (endLineRaw > startLineRaw && (range.endOffset === 0 || text.endsWith('\n'))) {
      endLineRaw -= 1;
    }
    const startLine = Math.min(startLineRaw, endLineRaw);
    const endLine = Math.max(startLineRaw, endLineRaw);
    const info = { startLine, endLine, text: trimmed };
    setSelectionInfo(info);
    onSelectionChange?.({ filePath, ...info });
  }, [filePath, onSelectionChange]);

  const fileName = filePath.split('/').pop() ?? filePath;
  const language = detectLanguage(filePath);
  const isMarkdown = language === 'markdown';

  useEffect(() => {
    setLoading(true);
    setError(null);
    setContent(null);

    fetch(`/api/files/content?path=${encodeURIComponent(filePath)}`)
      .then(res => res.json())
      .then(data => {
        if (data.truncated) {
          setError(`File too large (${(data.size / 1024 / 1024).toFixed(1)}MB)`);
        } else if (data.content !== null) {
          setContent(data.content);
          setSize(data.size);
        } else {
          setError('Could not read file');
        }
      })
      .catch(() => setError('Failed to fetch file'))
      .finally(() => setLoading(false));
  }, [filePath]);

  // Scroll to highlighted line once content is rendered.
  useEffect(() => {
    if (highlightLine == null || content == null || loading) return;
    // Defer to next frame so SyntaxHighlighter has painted.
    const raf = requestAnimationFrame(() => {
      const el = scrollContainerRef.current?.querySelector<HTMLElement>(`[data-line="${highlightLine}"]`);
      el?.scrollIntoView({ block: 'center', behavior: 'auto' });
    });
    return () => cancelAnimationFrame(raf);
  }, [highlightLine, content, loading, showSource]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border-default px-3">
        <FileText className="h-3.5 w-3.5 text-muted" />
        <span className="min-w-0 truncate text-[12px] font-medium text-secondary">{fileName}</span>
        <span className="text-[10px] text-faint">{language ?? ''}</span>
        {size > 0 && (
          <span className="text-[10px] text-faint">{(size / 1024).toFixed(1)}KB</span>
        )}
        {isMarkdown && (
          <button
            onClick={() => setShowSource(s => !s)}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-faint transition-colors hover:bg-elevated hover:text-secondary"
            title={showSource ? 'Show rendered' : 'Show source'}
          >
            {showSource ? <BookOpen className="h-3 w-3" /> : <Code className="h-3 w-3" />}
            {showSource ? 'Preview' : 'Source'}
          </button>
        )}
        {selectionInfo && onSendToChat && (
          <button
            onClick={() => {
              onSendToChat(filePath, selectionInfo.startLine, selectionInfo.endLine, selectionInfo.text);
              setSelectionInfo(null);
            }}
            className="ml-auto flex items-center gap-1 rounded bg-violet-500/20 px-2 py-0.5 text-[10px] font-medium text-violet-300 transition-colors hover:bg-violet-500/30"
            title="Send selection to chat"
          >
            <MessageSquare className="h-2.5 w-2.5" />
            Send L{selectionInfo.startLine}-{selectionInfo.endLine} to chat
          </button>
        )}
        <button
          onClick={onClose}
          className={`${selectionInfo && onSendToChat ? '' : 'ml-auto '}rounded p-0.5 text-faint transition-colors hover:bg-elevated hover:text-secondary`}
          title="Close file"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Content */}
      <div ref={scrollContainerRef} className="flex-1 overflow-auto" onMouseUp={handleMouseUp}>
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-faint" />
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-xs text-red-400">
            {error}
          </div>
        ) : content !== null && isMarkdown && !showSource ? (
          <div className="prose-dark p-4 text-[13px] leading-relaxed text-secondary">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className ?? '');
                  const inline = !className;
                  return inline ? (
                    <code className="rounded bg-[#1e1e2e] px-1.5 py-0.5 text-[12px] text-orange-300" {...props}>{children}</code>
                  ) : (
                    <SyntaxHighlighter
                      language={match?.[1] ?? 'text'}
                      style={oneDark}
                      customStyle={{ margin: 0, padding: '0.75rem', background: '#1e1e2e', fontSize: '0.75rem', borderRadius: '0.375rem' }}
                      codeTagProps={{ style: { background: 'none' } }}
                    >
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  );
                },
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        ) : content !== null && language ? (
          <SyntaxHighlighter
            language={language}
            style={oneDark}
            showLineNumbers
            wrapLines
            lineProps={(lineNumber: number) => {
              const inSelection = selectionInfo
                && lineNumber >= selectionInfo.startLine
                && lineNumber <= selectionInfo.endLine;
              return {
                'data-line': String(lineNumber),
                style: {
                  display: 'block',
                  backgroundColor:
                    inSelection ? 'rgba(139, 92, 246, 0.18)'
                    : lineNumber === highlightLine ? 'rgba(250, 204, 21, 0.15)'
                    : undefined,
                },
              } as React.HTMLAttributes<HTMLElement>;
            }}
            customStyle={{
              margin: 0,
              padding: '0.75rem',
              background: 'var(--bg-surface)',
              fontSize: '0.75rem',
              lineHeight: '1.5',
            }}
            codeTagProps={{ style: { background: 'none' } }}
            lineNumberStyle={{ color: 'var(--text-faint)', minWidth: '2.5em', paddingRight: '1em' }}
          >
            {content}
          </SyntaxHighlighter>
        ) : (
          <pre className="p-3 text-[12px] leading-relaxed text-muted">
            {content}
          </pre>
        )}
      </div>
    </div>
  );
}
