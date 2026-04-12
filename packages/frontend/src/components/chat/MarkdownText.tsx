import { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check } from 'lucide-react';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="absolute right-2 top-2 rounded-md bg-elevated/80 p-1 text-faint opacity-0 transition-opacity hover:text-secondary group-hover/code:opacity-100"
      aria-label="Copy code"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export default function MarkdownText({ text }: { text: string }) {
  return (
    <div className="prose-invert max-w-none text-sm leading-relaxed text-primary">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className ?? '');
            const code = String(children).replace(/\n$/, '');
            if (match) {
              return (
                <div className="group/code relative">
                  <CopyButton text={code} />
                  <SyntaxHighlighter
                    style={oneDark}
                    language={match[1]}
                    PreTag="div"
                    customStyle={{ margin: '0.5rem 0', borderRadius: '0.5rem', fontSize: '0.8rem', background: 'var(--bg-codeblock)' }}
                  >
                    {code}
                  </SyntaxHighlighter>
                </div>
              );
            }
            return (
              <code className="rounded bg-codeblock px-1.5 py-0.5 text-[13px] text-secondary" {...props}>
                {children}
              </code>
            );
          },
          p({ children }) {
            return <p className="mb-2 last:mb-0">{children}</p>;
          },
          ul({ children }) {
            return <ul className="mb-2 ml-4 list-disc last:mb-0">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="mb-2 ml-4 list-decimal last:mb-0">{children}</ol>;
          },
          li({ children }) {
            return <li className="mb-0.5">{children}</li>;
          },
          a({ href, children }) {
            return <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">{children}</a>;
          },
          blockquote({ children }) {
            return <blockquote className="border-l-2 border-muted pl-3 italic text-muted">{children}</blockquote>;
          },
          table({ children }) {
            return <div className="overflow-x-auto"><table className="min-w-full text-xs">{children}</table></div>;
          },
          th({ children }) {
            return <th className="border border-border-default px-2 py-1 text-left font-medium">{children}</th>;
          },
          td({ children }) {
            return <td className="border border-border-default px-2 py-1">{children}</td>;
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
