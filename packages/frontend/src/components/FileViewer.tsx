import { useState, useEffect, useCallback } from 'react';
import { FileText, X, Loader2, MessageSquare } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { detectLanguage } from '../utils/fileUtils';

interface FileViewerProps {
  filePath: string;
  onClose: () => void;
  onSendToChat?: (filePath: string, startLine: number, endLine: number, code: string) => void;
}

export default function FileViewer({ filePath, onClose, onSendToChat }: FileViewerProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState(0);
  const [selectionInfo, setSelectionInfo] = useState<{ startLine: number; endLine: number; text: string } | null>(null);

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !content) {
      setSelectionInfo(null);
      return;
    }
    const text = selection.toString().trim();
    if (!text) { setSelectionInfo(null); return; }

    // Find line numbers from selection
    const lines = content.split('\n');
    const beforeStart = content.indexOf(text);
    if (beforeStart < 0) { setSelectionInfo(null); return; }
    let startLine = 1;
    let charCount = 0;
    for (let i = 0; i < lines.length; i++) {
      if (charCount + lines[i].length >= beforeStart) { startLine = i + 1; break; }
      charCount += lines[i].length + 1;
    }
    const endLine = startLine + text.split('\n').length - 1;
    setSelectionInfo({ startLine, endLine, text });
  }, [content]);

  const fileName = filePath.split('/').pop() ?? filePath;
  const language = detectLanguage(filePath);

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
      <div className="flex-1 overflow-auto" onMouseUp={handleMouseUp}>
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-faint" />
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-xs text-red-400">
            {error}
          </div>
        ) : content !== null && language ? (
          <SyntaxHighlighter
            language={language}
            style={oneDark}
            showLineNumbers
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
