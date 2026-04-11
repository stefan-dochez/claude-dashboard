import { useState, useEffect } from 'react';
import { FileText, X, Loader2 } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { detectLanguage } from '../utils/fileUtils';

interface FileViewerProps {
  filePath: string;
  onClose: () => void;
}

export default function FileViewer({ filePath, onClose }: FileViewerProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState(0);

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
        <button
          onClick={onClose}
          className="ml-auto rounded p-0.5 text-faint transition-colors hover:bg-elevated hover:text-secondary"
          title="Close file"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
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
