import { useEffect } from 'react';
import { Sparkles, X, ExternalLink } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useFocusTrap } from '../hooks/useFocusTrap';

export interface ChangelogEntry {
  version: string;
  content: string;
  releaseUrl?: string;
}

interface WhatsNewModalProps {
  currentVersion: string;
  previousVersion: string | null;
  entries: ChangelogEntry[];
  onClose: () => void;
}

export default function WhatsNewModal({ currentVersion, previousVersion, entries, onClose }: WhatsNewModalProps) {
  const ref = useFocusTrap<HTMLDivElement>();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-8" onClick={onClose}>
      <div
        ref={ref}
        className="flex h-full max-h-[720px] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border-default bg-modal shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center border-b border-border-default px-5 py-4">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-primary">
            <Sparkles className="h-4 w-4 text-violet-400" />
            What&apos;s new
          </h2>
          <span className="ml-3 text-[11px] text-faint">
            {previousVersion
              ? <>Updated from <span className="font-mono text-muted">{previousVersion}</span> to <span className="font-mono text-primary">{currentVersion}</span></>
              : <>Version <span className="font-mono text-primary">{currentVersion}</span></>
            }
          </span>
          <button
            onClick={onClose}
            className="ml-auto rounded p-1 text-muted transition-colors hover:bg-elevated hover:text-primary"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {entries.length === 0 ? (
            <p className="text-[13px] text-muted">No changelog entries found for this version.</p>
          ) : (
            entries.map(entry => (
              <section key={entry.version} className="mb-6 last:mb-0">
                <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-primary">
                  <span className="font-mono text-violet-400">v{entry.version}</span>
                  {entry.releaseUrl && (
                    <a
                      href={entry.releaseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-normal text-muted transition-colors hover:bg-elevated hover:text-primary"
                      title="View release on GitHub"
                    >
                      <ExternalLink className="h-2.5 w-2.5" />
                      GitHub
                    </a>
                  )}
                </h3>
                <div className="text-[13px] leading-relaxed text-secondary">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h3: ({ children }) => (
                        <h4 className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted first:mt-0">{children}</h4>
                      ),
                      ul: ({ children }) => <ul className="mb-3 space-y-1.5 pl-0">{children}</ul>,
                      li: ({ children }) => (
                        <li className="flex gap-2 text-[13px]">
                          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted" />
                          <span className="flex-1">{children}</span>
                        </li>
                      ),
                      p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                      strong: ({ children }) => <strong className="font-semibold text-primary">{children}</strong>,
                      code: ({ children }) => (
                        <code className="rounded bg-codeblock px-1 py-0.5 font-mono text-[11px] text-secondary">{children}</code>
                      ),
                      a: ({ href, children }) => (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300">{children}</a>
                      ),
                    }}
                  >{entry.content}</ReactMarkdown>
                </div>
              </section>
            ))
          )}
        </div>

        <div className="flex items-center border-t border-border-default px-5 py-3">
          {(() => {
            const latest = entries[entries.length - 1];
            if (!latest?.releaseUrl) return null;
            return (
              <a
                href={latest.releaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[11px] text-muted transition-colors hover:text-primary"
              >
                <ExternalLink className="h-3 w-3" />
                View full release notes on GitHub
              </a>
            );
          })()}
          <button
            onClick={onClose}
            className="ml-auto rounded-md bg-blue-600 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-blue-500"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
