import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  Loader2, ChevronDown, ChevronRight,
  Wrench, AlertCircle, AlertTriangle, CheckCircle2, Brain,
  Sparkles, Shield, CircleStop, Plus, X, ArrowUp,
  FileText, GitBranch, GitCommit, FileCode2,
} from 'lucide-react';
import { useSocket } from '../hooks/useSocket';
import type { ChatMessage, ContentBlock, SessionInfo } from '../types';

interface ContextItem {
  type: 'file' | 'branch' | 'commit' | 'changes';
  label: string;
  value: string;
}

export interface CodeSelection {
  filePath: string;
  startLine: number;
  endLine: number;
  code: string;
}

interface ChatViewProps {
  instanceId: string;
  projectPath: string;
  status: string;
  onTypingChange?: (typing: boolean) => void;
  initialModel?: string | null;
  initialPermissionMode?: string | null;
  initialEffort?: string | null;
  codeSelection?: CodeSelection | null;
  onClearCodeSelection?: () => void;
}

// --------------- Block grouping ---------------

interface BlockGroup {
  type: 'text' | 'thinking' | 'tool_group';
  text?: string;
  thinking?: string;
  tools?: Array<{ use: ContentBlock; result?: ContentBlock }>;
}

function groupContentBlocks(blocks: ContentBlock[]): BlockGroup[] {
  const groups: BlockGroup[] = [];
  let pendingTools: Array<{ use: ContentBlock; result?: ContentBlock }> = [];

  const flushTools = () => {
    if (pendingTools.length > 0) {
      groups.push({ type: 'tool_group', tools: pendingTools });
      pendingTools = [];
    }
  };

  for (const block of blocks) {
    if (block.type === 'text') {
      flushTools();
      groups.push({ type: 'text', text: block.text });
    } else if (block.type === 'thinking') {
      flushTools();
      groups.push({ type: 'thinking', thinking: block.thinking });
    } else if (block.type === 'tool_use') {
      pendingTools.push({ use: block });
    } else if (block.type === 'tool_result') {
      // Match to last pending tool_use
      const match = pendingTools.find(t => t.use.tool_use_id === block.tool_use_id);
      if (match) {
        match.result = block;
      } else {
        // Orphan result — attach to last tool or create standalone
        if (pendingTools.length > 0 && !pendingTools[pendingTools.length - 1].result) {
          pendingTools[pendingTools.length - 1].result = block;
        }
      }
    }
  }
  flushTools();
  return groups;
}

// --------------- Sub-components ---------------

function MarkdownText({ text }: { text: string }) {
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
                <SyntaxHighlighter
                  style={oneDark}
                  language={match[1]}
                  PreTag="div"
                  customStyle={{ margin: '0.5rem 0', borderRadius: '0.5rem', fontSize: '0.8rem', background: 'var(--bg-codeblock)' }}
                >
                  {code}
                </SyntaxHighlighter>
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

function ThinkingBlock({ text, isActive }: { text: string; isActive: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const preview = text.slice(0, 150).replace(/\n/g, ' ');

  return (
    <div className="my-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="group flex w-full items-center gap-2 text-left text-xs text-tertiary transition-colors hover:text-secondary"
      >
        {expanded ? <ChevronDown className="h-3 w-3 text-muted" /> : <ChevronRight className="h-3 w-3 text-muted" />}
        <span className={isActive ? 'italic text-tertiary' : 'text-muted'}>
          {isActive ? 'Thinking...' : 'Thought process'}
        </span>
      </button>
      {expanded ? (
        <pre className="mt-1.5 max-h-60 overflow-auto whitespace-pre-wrap border-l-2 border-border-default pl-4 text-xs leading-relaxed text-muted">{text}</pre>
      ) : !isActive ? (
        <p className="mt-0.5 truncate pl-5 text-xs text-faint">{preview}{text.length > 150 ? '...' : ''}</p>
      ) : null}
    </div>
  );
}

function ToolProgressRing({ seconds }: { seconds: number }) {
  const radius = 5;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(seconds / 60, 1);
  const offset = circumference * (1 - progress);

  return (
    <svg className="-rotate-90" width="14" height="14" viewBox="0 0 14 14">
      <circle cx="7" cy="7" r={radius} fill="none" stroke="currentColor" strokeWidth="2" className="text-faint/30" />
      <circle
        cx="7" cy="7" r={radius} fill="none" stroke="currentColor" strokeWidth="2"
        strokeDasharray={circumference} strokeDashoffset={offset}
        className="text-blue-400 transition-all"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ToolDetailView({ tool }: { tool: { use: ContentBlock; result?: ContentBlock } }) {
  const input = tool.use.input as Record<string, unknown> | null;
  const name = tool.use.name ?? '';
  const isEdit = name === 'Edit' || name === 'Write';
  const isBash = name === 'Bash';
  const isRead = name === 'Read' || name === 'Glob' || name === 'Grep';

  const filePath = input?.file_path as string | undefined;
  const command = input?.command as string | undefined;
  const oldStr = input?.old_string as string | undefined;
  const newStr = input?.new_string as string | undefined;

  return (
    <div className="rounded border border-border-subtle bg-codeblock p-2">
      {/* Header: tool name + file path or command */}
      <div className="mb-1 flex items-center gap-1.5 text-[11px]">
        <span className="font-medium text-muted">{name}</span>
        {filePath && (
          <span className="truncate font-mono text-faint" title={filePath}>
            {filePath.split('/').pop()}
          </span>
        )}
        {isBash && command && (
          <span className="truncate font-mono text-faint" title={command}>
            $ {command.length > 60 ? command.slice(0, 60) + '...' : command}
          </span>
        )}
      </div>

      {/* Edit/Write: show diff */}
      {isEdit && oldStr != null && newStr != null && (
        <div className="max-h-48 overflow-auto rounded bg-root p-1.5 font-mono text-[11px] leading-relaxed">
          {oldStr.split('\n').map((line, i) => (
            <div key={`old-${i}`} className="text-red-400/70"><span className="mr-2 select-none text-red-400/40">-</span>{line}</div>
          ))}
          {newStr.split('\n').map((line, i) => (
            <div key={`new-${i}`} className="text-green-400/70"><span className="mr-2 select-none text-green-400/40">+</span>{line}</div>
          ))}
        </div>
      )}

      {/* Write (new file): show content */}
      {name === 'Write' && !oldStr && input?.content != null && (
        <div className="max-h-48 overflow-auto rounded bg-root p-1.5 font-mono text-[11px] leading-relaxed">
          {String(input.content).split('\n').map((line, i) => (
            <div key={i} className="text-green-400/70"><span className="mr-2 select-none text-green-400/40">+</span>{line}</div>
          ))}
        </div>
      )}

      {/* Bash: show command */}
      {isBash && command && !oldStr && (
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-root p-1.5 text-[11px] text-muted">
          $ {command}
        </pre>
      )}

      {/* Read/Glob/Grep: show path or pattern */}
      {isRead && !filePath && input != null && (
        <pre className="max-h-20 overflow-auto whitespace-pre-wrap text-[11px] text-faint">
          {typeof input === 'string' ? input : JSON.stringify(input, null, 2)}
        </pre>
      )}

      {/* Generic fallback for other tools */}
      {!isEdit && !isBash && !isRead && input != null && (
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-[11px] text-faint">
          {typeof input === 'string' ? input : JSON.stringify(input, null, 2)}
        </pre>
      )}

      {/* Result */}
      {tool.result && (
        <div className={`mt-1.5 border-t pt-1.5 ${tool.result.is_error ? 'border-red-500/20' : 'border-border-subtle'}`}>
          {isBash && !tool.result.is_error ? (
            <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-root p-1.5 text-[11px] text-muted">
              {(tool.result.content ?? tool.result.stdout ?? '').slice(0, 3000)}
            </pre>
          ) : (
            <pre className={`max-h-32 overflow-auto whitespace-pre-wrap text-[11px] ${tool.result.is_error ? 'text-red-400/70' : 'text-muted'}`}>
              {(tool.result.content ?? tool.result.stdout ?? '').slice(0, 3000)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function ToolGroupBlock({ tools }: { tools: Array<{ use: ContentBlock; result?: ContentBlock }> }) {
  const [expanded, setExpanded] = useState(false);
  const hasError = tools.some(t => t.result?.is_error);
  const toolNames = tools.map(t => t.use.name).filter(Boolean);

  // Summary for collapsed state
  const summary = tools.length === 1
    ? toolNames[0]
    : `${toolNames.length} tools: ${[...new Set(toolNames)].join(', ')}`;

  return (
    <div className="my-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="group flex w-full items-center gap-2 text-left text-xs text-tertiary transition-colors hover:text-secondary"
      >
        {expanded ? <ChevronDown className="h-3 w-3 text-muted" /> : <ChevronRight className="h-3 w-3 text-muted" />}
        <Wrench className={`h-3 w-3 ${hasError ? 'text-red-400' : 'text-muted'}`} />
        <span className="min-w-0 flex-1 truncate text-muted">{summary}</span>
        {hasError && <AlertCircle className="h-3 w-3 shrink-0 text-red-400" />}
        {!hasError && <CheckCircle2 className="h-3 w-3 shrink-0 text-green-600/50" />}
      </button>
      {expanded && (
        <div className="ml-5 mt-1.5 flex flex-col gap-1.5 border-l-2 border-border-default pl-3">
          {tools.map((tool, i) => (
            <ToolDetailView key={i} tool={tool} />
          ))}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const groups = useMemo(
    () => isUser ? null : groupContentBlocks(message.content),
    [message.content, isUser],
  );

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-3xl bg-elevated px-5 py-3 text-sm leading-relaxed text-primary">
          {message.content[0]?.text ?? ''}
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      {groups?.map((group, i) => {
        switch (group.type) {
          case 'text':
            return <MarkdownText key={i} text={group.text ?? ''} />;
          case 'thinking':
            return <ThinkingBlock key={i} text={group.thinking ?? ''} isActive={false} />;
          case 'tool_group':
            return <ToolGroupBlock key={i} tools={group.tools ?? []} />;
          default:
            return null;
        }
      })}
    </div>
  );
}

// --------------- Live Working Block ---------------

function LiveWorkingBlock({
  streamingText, thinkingText, streamingBlocks, toolProgress, sending,
}: {
  streamingText: string;
  thinkingText: string;
  streamingBlocks: ContentBlock[];
  toolProgress: { toolName: string; elapsedSeconds: number } | null;
  sending: boolean;
}) {
  const isStreaming = streamingText.length > 0 || thinkingText.length > 0 || streamingBlocks.length > 0;
  if (!isStreaming && !sending) return null;

  return (
    <div className="min-w-0">
      {/* Thinking */}
      {thinkingText && (
        <ThinkingBlock text={thinkingText} isActive={true} />
      )}

      {/* Streaming tool blocks */}
      {streamingBlocks.length > 0 && (
        <ToolGroupBlock tools={streamingBlocks
          .filter(b => b.type === 'tool_use')
          .map(use => ({
            use,
            result: streamingBlocks.find(b => b.type === 'tool_result' && b.tool_use_id === use.tool_use_id),
          }))}
        />
      )}

      {/* Tool progress */}
      {toolProgress && (
        <div className="my-2 flex items-center gap-2 text-xs text-muted">
          <ToolProgressRing seconds={toolProgress.elapsedSeconds} />
          <span className="font-mono text-tertiary">{toolProgress.toolName}</span>
          <span className="text-faint">{Math.round(toolProgress.elapsedSeconds)}s</span>
        </div>
      )}

      {/* Streaming text */}
      {streamingText ? (
        <div className="text-sm leading-relaxed text-primary">
          <MarkdownText text={streamingText} />
          <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-tertiary" />
        </div>
      ) : sending && !thinkingText && !toolProgress && streamingBlocks.length === 0 ? (
        <div className="flex items-center gap-2 py-2 text-xs text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Thinking...</span>
        </div>
      ) : null}
    </div>
  );
}

// --------------- Permission Prompt ---------------

function PermissionPrompt({ permission, onResolve, onApproveAll }: {
  permission: { toolName: string; toolInput: unknown; toolUseId: string; title?: string; description?: string };
  onResolve: (toolUseId: string, allow: boolean, message?: string) => void;
  onApproveAll: (toolName: string) => void;
}) {
  return (
    <div className="mx-auto mb-3 max-w-3xl rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
      <div className="flex items-center gap-2 text-xs text-amber-400">
        <Shield className="h-3.5 w-3.5" />
        <span className="font-medium">Permission required</span>
        <span className="font-mono text-amber-400/70">{permission.toolName}</span>
      </div>
      {permission.title && <p className="mt-2 text-sm text-secondary">{permission.title}</p>}
      {permission.description && <p className="mt-1 text-xs text-muted">{permission.description}</p>}
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => onResolve(permission.toolUseId, true)}
          className="rounded-lg bg-green-600/80 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-600"
        >
          Allow
        </button>
        <button
          onClick={() => onApproveAll(permission.toolName)}
          className="rounded-lg bg-elevated px-3.5 py-1.5 text-xs font-medium text-secondary transition-colors hover:bg-hover"
        >
          Always allow
        </button>
        <button
          onClick={() => onResolve(permission.toolUseId, false)}
          className="rounded-lg px-3.5 py-1.5 text-xs text-muted transition-colors hover:bg-hover hover:text-secondary"
        >
          Deny
        </button>
      </div>
    </div>
  );
}

// --------------- User Question ---------------

function UserQuestionPrompt({ question, onAnswer }: {
  question: { toolUseId: string; questions: Array<{ question: string; options?: Array<{ label: string }> }> };
  onAnswer: (toolUseId: string, answer: string) => void;
}) {
  const [text, setText] = useState('');
  const q = question.questions[0];

  if (q?.options && q.options.length > 0) {
    return (
      <div className="mx-auto mb-3 max-w-3xl rounded-xl border border-border-default bg-elevated/50 p-4">
        <p className="mb-3 text-sm text-secondary">{q.question}</p>
        <div className="flex flex-wrap gap-2">
          {q.options.map((opt, i) => (
            <button
              key={i}
              onClick={() => onAnswer(question.toolUseId, opt.label)}
              className="rounded-lg border border-border-default bg-elevated px-3 py-1.5 text-xs text-secondary transition-colors hover:bg-hover hover:text-primary"
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto mb-3 max-w-3xl rounded-xl border border-border-default bg-elevated/50 p-4">
      <p className="mb-3 text-sm text-secondary">{q?.question ?? 'Claude has a question'}</p>
      <div className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && text.trim()) { onAnswer(question.toolUseId, text.trim()); setText(''); } }}
          className="flex-1 rounded-lg border border-border-input bg-input px-3 py-1.5 text-sm text-primary outline-none transition-colors focus:border-border-focus"
          placeholder="Type your answer..."
        />
        <button
          onClick={() => { if (text.trim()) { onAnswer(question.toolUseId, text.trim()); setText(''); } }}
          className="rounded-lg bg-primary px-3.5 py-1.5 text-xs font-medium text-root hover:opacity-80"
        >
          Send
        </button>
      </div>
    </div>
  );
}

// --------------- Selectors ---------------

const MODEL_OPTIONS = [
  { value: 'claude-opus-4-6', label: 'Opus', badge: 'default' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet', badge: null },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku', badge: null },
] as const;

const PERMISSION_OPTIONS = [
  { value: 'default', label: 'Ask' },
  { value: 'plan', label: 'Plan' },
  { value: 'auto-edit', label: 'Auto-Edit' },
  { value: 'full-access', label: 'Full Access' },
] as const;

const EFFORT_OPTIONS = [
  { value: 'high', label: 'High', color: 'text-violet-400' },
  { value: 'medium', label: 'Medium', color: 'text-blue-400' },
  { value: 'low', label: 'Low', color: 'text-faint' },
] as const;

function Dropdown<T extends string>({ value, options, onChange, icon: Icon, label }: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string; badge?: string | null; color?: string }>;
  onChange: (v: T) => void;
  icon: React.ElementType;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded px-2 py-1 text-[12px] text-muted transition-colors hover:bg-elevated hover:text-secondary"
        title={label}
      >
        <Icon className="h-3 w-3" />
        <span>{selected?.label ?? value}</span>
        <ChevronDown className="h-2.5 w-2.5" />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-1 min-w-[140px] rounded-lg border border-border-default bg-popover py-1 shadow-lg">
          {options.map(opt => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-hover ${
                opt.value === value ? 'text-primary' : 'text-muted'
              }`}
            >
              <span className={opt.color ?? ''}>{opt.label}</span>
              {opt.badge && <span className="rounded bg-badge px-1.5 py-0.5 text-[10px] text-faint">{opt.badge}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// --------------- Rate Limit Countdown ---------------

function RateLimitCountdown({ resetsAt }: { resetsAt: number }) {
  const [remaining, setRemaining] = useState('');
  useEffect(() => {
    const update = () => {
      const diff = Math.max(0, Math.ceil((resetsAt * 1000 - Date.now()) / 1000));
      if (diff <= 0) { setRemaining(''); return; }
      const m = Math.floor(diff / 60);
      const s = diff % 60;
      setRemaining(m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [resetsAt]);
  if (!remaining) return null;
  return <span className="tabular-nums">— resumes in {remaining}</span>;
}

// --------------- Main ChatView ---------------

export default function ChatView({
  instanceId, projectPath, status, onTypingChange,
  initialModel, initialPermissionMode, initialEffort,
  codeSelection, onClearCodeSelection,
}: ChatViewProps) {
  const socket = useSocket();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Core state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [thinkingText, setThinkingText] = useState('');
  const [streamingBlocks, setStreamingBlocks] = useState<ContentBlock[]>([]);
  const [toolProgress, setToolProgress] = useState<{ toolName: string; elapsedSeconds: number } | null>(null);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState('');
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  // @-mention autocomplete
  const [mentionActive, setMentionActive] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionResults, setMentionResults] = useState<Array<{ label: string; insertText: string }>>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Staleness recovery
  const stalenessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Rate limit
  const [rateLimitInfo, setRateLimitInfo] = useState<{ resetsAt?: number } | null>(null);

  // Context usage
  const [contextUsage, setContextUsage] = useState<{ usedTokens: number; maxTokens: number } | null>(null);

  // Context attachments
  const [contextItems, setContextItems] = useState<ContextItem[]>([]);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuSection, setContextMenuSection] = useState<'files' | 'branches' | 'commits' | null>(null);
  const [contextSearchResults, setContextSearchResults] = useState<Array<{ label: string; value: string }>>([]);
  const [contextLoading, setContextLoading] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Selectors
  const [selectedModel, setSelectedModel] = useState(initialModel ?? 'claude-opus-4-6');
  const [permissionMode, setPermissionMode] = useState(initialPermissionMode ?? 'default');
  const [effortLevel, setEffortLevel] = useState(initialEffort ?? 'high');

  // Permission / question
  const [permissionQueue, setPermissionQueue] = useState<Array<{
    toolName: string; toolInput: unknown; toolUseId: string; title?: string; description?: string;
  }>>([]);
  const [pendingQuestion, setPendingQuestion] = useState<{
    toolUseId: string; questions: Array<{ question: string; options?: Array<{ label: string }> }>;
  } | null>(null);

  // RAF-throttled streaming
  const deltaBufferRef = useRef('');
  const thinkingBufferRef = useRef('');
  const flushTimerRef = useRef<number | null>(null);
  const thinkingFlushTimerRef = useRef<number | null>(null);

  // Auto-scroll
  const isAtBottomRef = useRef(true);

  const scrollToBottom = useCallback(() => {
    if (isAtBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 60;
    };
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Staleness timer — reset UI if no events for 30s during streaming
  const resetStalenessTimer = useCallback(() => {
    if (stalenessTimerRef.current) clearTimeout(stalenessTimerRef.current);
    stalenessTimerRef.current = setTimeout(() => {
      setSending(false);
      setToolProgress(null);
    }, 30_000);
  }, []);

  const clearStalenessTimer = useCallback(() => {
    if (stalenessTimerRef.current) {
      clearTimeout(stalenessTimerRef.current);
      stalenessTimerRef.current = null;
    }
  }, []);

  // @-mention search
  useEffect(() => {
    if (!mentionActive || !mentionQuery) {
      setMentionResults([]);
      return;
    }
    if (mentionSearchTimer.current) clearTimeout(mentionSearchTimer.current);
    mentionSearchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/files/search?path=${encodeURIComponent(projectPath)}&q=${encodeURIComponent(mentionQuery)}`);
        if (res.ok) {
          const files: Array<{ name: string; path: string; relative: string }> = await res.json();
          setMentionResults(files.slice(0, 12).map(f => ({ label: f.relative, insertText: f.relative })));
          setMentionIndex(0);
        }
      } catch {
        setMentionResults([]);
      }
    }, 150);
    return () => { if (mentionSearchTimer.current) clearTimeout(mentionSearchTimer.current); };
  }, [mentionActive, mentionQuery, projectPath]);

  // Load message history
  useEffect(() => {
    fetch(`/api/instances/${instanceId}/messages`)
      .then(res => res.json())
      .then((msgs: ChatMessage[]) => {
        setMessages(msgs);
        setTimeout(scrollToBottom, 50);
      })
      .catch(err => console.error('[ChatView] Failed to load messages:', err));
  }, [instanceId, scrollToBottom]);

  // Socket events
  useEffect(() => {
    const currentId = instanceId;
    socket.emit('instance:join', { instanceId: currentId });

    const onMessage = ({ instanceId: id, message }: { instanceId: string; message: ChatMessage }) => {
      if (id !== currentId) return;
      setStreamingText('');
      setThinkingText('');
      setStreamingBlocks([]);
      setToolProgress(null);
      deltaBufferRef.current = '';
      thinkingBufferRef.current = '';
      setMessages(prev => [...prev, message]);
      if (message.role === 'assistant') setSending(false);
      setTimeout(scrollToBottom, 50);
    };

    const onContentBlock = ({ instanceId: id, block }: { instanceId: string; block: ContentBlock }) => {
      if (id !== currentId) return;
      setStreamingBlocks(prev => [...prev, block]);
      scrollToBottom();
    };

    const onStreamDelta = ({ instanceId: id, text, thinking }: { instanceId: string; text?: string; thinking?: string }) => {
      if (id !== currentId) return;
      resetStalenessTimer();
      if (text) {
        deltaBufferRef.current += text;
        if (!flushTimerRef.current) {
          flushTimerRef.current = window.requestAnimationFrame(() => {
            const buffered = deltaBufferRef.current;
            deltaBufferRef.current = '';
            flushTimerRef.current = null;
            setStreamingText(prev => prev + buffered);
            scrollToBottom();
          });
        }
      }
      if (thinking) {
        thinkingBufferRef.current += thinking;
        if (!thinkingFlushTimerRef.current) {
          thinkingFlushTimerRef.current = window.requestAnimationFrame(() => {
            const buffered = thinkingBufferRef.current;
            thinkingBufferRef.current = '';
            thinkingFlushTimerRef.current = null;
            setThinkingText(prev => prev + buffered);
          });
        }
      }
    };

    const onToolProgress = ({ instanceId: id, toolName, elapsedSeconds }: { instanceId: string; toolName: string; elapsedSeconds: number }) => {
      if (id !== currentId) return;
      resetStalenessTimer();
      setToolProgress({ toolName, elapsedSeconds });
    };

    const onStatus = ({ instanceId: id, status: s }: { instanceId: string; status: string }) => {
      if (id !== currentId) return;
      if (s === 'waiting_input') setSending(false);
    };

    const onSession = ({ instanceId: id, ...info }: { instanceId: string } & SessionInfo) => {
      if (id !== currentId) return;
      setSessionInfo(info);
    };

    const onError = ({ instanceId: id, error }: { instanceId: string; error: string }) => {
      if (id !== currentId) return;
      setLastError(error);
      setSending(false);
    };

    const onPermissionRequest = ({ instanceId: id, ...data }: {
      instanceId: string; toolName: string; toolInput: unknown; toolUseId: string; title?: string; description?: string;
    }) => {
      if (id !== currentId) return;
      clearStalenessTimer();
      setPermissionQueue(prev => [...prev, data]);
    };

    const onUserQuestion = ({ instanceId: id, ...data }: {
      instanceId: string; toolUseId: string; questions: Array<{ question: string; options?: Array<{ label: string }> }>;
    }) => {
      if (id !== currentId) return;
      clearStalenessTimer();
      setPendingQuestion(data);
    };

    const onResult = ({ instanceId: id, usedTokens, maxTokens }: { instanceId: string; usedTokens?: number; maxTokens?: number }) => {
      if (id !== currentId) return;
      clearStalenessTimer();
      setSending(false);
      setToolProgress(null);
      if (usedTokens != null && maxTokens != null && maxTokens > 0) {
        setContextUsage({ usedTokens, maxTokens });
      }
    };

    const onRateLimit = ({ instanceId: id, status, resetsAt }: { instanceId: string; status?: string; resetsAt?: number }) => {
      if (id !== currentId) return;
      // Only show banner when actually rate-limited, not for informational 'allowed' events
      if (status === 'allowed' || !status) {
        setRateLimitInfo(null);
        return;
      }
      setRateLimitInfo({ resetsAt });
      if (resetsAt) {
        const delay = (resetsAt * 1000) - Date.now();
        if (delay > 0) {
          setTimeout(() => setRateLimitInfo(null), Math.min(delay + 1000, 3_600_000));
        }
      }
    };

    socket.on('chat:message', onMessage);
    socket.on('chat:content_block', onContentBlock);
    socket.on('chat:stream_delta', onStreamDelta);
    socket.on('chat:tool_progress', onToolProgress);
    socket.on('instance:status', onStatus);
    socket.on('chat:session', onSession);
    socket.on('chat:error', onError);
    socket.on('chat:permission_request', onPermissionRequest);
    socket.on('chat:user_question', onUserQuestion);
    socket.on('chat:result', onResult);
    socket.on('chat:rate_limit', onRateLimit);

    return () => {
      socket.emit('instance:leave', { instanceId: currentId });
      socket.off('chat:message', onMessage);
      socket.off('chat:content_block', onContentBlock);
      socket.off('chat:stream_delta', onStreamDelta);
      socket.off('chat:tool_progress', onToolProgress);
      socket.off('instance:status', onStatus);
      socket.off('chat:session', onSession);
      socket.off('chat:error', onError);
      socket.off('chat:permission_request', onPermissionRequest);
      socket.off('chat:user_question', onUserQuestion);
      socket.off('chat:result', onResult);
      socket.off('chat:rate_limit', onRateLimit);
      clearStalenessTimer();
      if (flushTimerRef.current) cancelAnimationFrame(flushTimerRef.current);
      if (thinkingFlushTimerRef.current) cancelAnimationFrame(thinkingFlushTimerRef.current);
      if (onTypingChange) onTypingChange(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId]);

  // Send message
  // Context menu helpers
  const fetchContextSection = useCallback(async (section: 'files' | 'branches' | 'commits') => {
    setContextLoading(true);
    setContextSearchResults([]);
    try {
      if (section === 'files') {
        const res = await fetch(`/api/files/search?path=${encodeURIComponent(projectPath)}&q=`);
        if (res.ok) {
          const files: Array<{ name: string; path: string; relative: string }> = await res.json();
          setContextSearchResults(files.map(f => ({ label: f.relative, value: f.path })));
        }
      } else if (section === 'branches') {
        const res = await fetch(`/api/git/branches?path=${encodeURIComponent(projectPath)}`);
        if (res.ok) {
          const branches: Array<{ name: string }> = await res.json();
          setContextSearchResults(branches.map(b => ({ label: b.name, value: b.name })));
        }
      } else if (section === 'commits') {
        const res = await fetch(`/api/git/commits?path=${encodeURIComponent(projectPath)}&limit=15`);
        if (res.ok) {
          const commits: Array<{ hash: string; message: string; date: string }> = await res.json();
          setContextSearchResults(commits.map(c => ({ label: `${c.hash.slice(0, 7)} ${c.message}`, value: c.hash })));
        }
      }
    } catch { /* ignore */ }
    setContextLoading(false);
  }, [projectPath]);

  const addContextItem = useCallback((type: ContextItem['type'], label: string, value: string) => {
    setContextItems(prev => {
      if (prev.some(c => c.value === value)) return prev;
      return [...prev, { type, label, value }];
    });
    setContextMenuOpen(false);
    setContextMenuSection(null);
  }, []);

  const removeContextItem = useCallback((value: string) => {
    setContextItems(prev => prev.filter(c => c.value !== value));
  }, []);

  const addChangesContext = useCallback(async () => {
    try {
      const res = await fetch(`/api/git/diff?path=${encodeURIComponent(projectPath)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.diff) {
          addContextItem('changes', 'Local changes', data.diff);
        }
      }
    } catch { /* ignore */ }
    setContextMenuOpen(false);
  }, [projectPath, addContextItem]);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenuOpen(false);
        setContextMenuSection(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [contextMenuOpen]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);
    setLastError(null);
    setStreamingText('');
    setThinkingText('');
    setStreamingBlocks([]);

    // Build prompt with context
    const allContext = [...contextItems];
    if (codeSelection) {
      allContext.push({
        type: 'file',
        label: `${codeSelection.filePath.split('/').pop()}:${codeSelection.startLine}-${codeSelection.endLine}`,
        value: codeSelection.code,
      });
    }

    let prompt = text;
    if (allContext.length > 0) {
      const contextParts = allContext.map(c => {
        switch (c.type) {
          case 'file': return `[File: ${c.label}]\n${c.value}`;
          case 'branch': return `[Git Branch: ${c.label}]`;
          case 'commit': return `[Git Commit: ${c.label}]`;
          case 'changes': return `[Local Changes]\n${c.value}`;
          default: return c.value;
        }
      });
      prompt = `Context:\n${contextParts.join('\n\n')}\n\n---\n\n${text}`;
      setContextItems([]);
      onClearCodeSelection?.();
    }

    socket.emit('chat:send', {
      instanceId,
      prompt,
      model: selectedModel,
      permissionMode,
      effort: effortLevel,
    });

    resetStalenessTimer();
    if (onTypingChange) onTypingChange(false);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setTimeout(scrollToBottom, 50);
  }, [input, sending, instanceId, socket, selectedModel, permissionMode, effortLevel, onTypingChange, scrollToBottom, contextItems, codeSelection, onClearCodeSelection, resetStalenessTimer]);

  const handleMentionSelect = useCallback((result: { label: string; insertText: string }) => {
    const cursorPos = textareaRef.current?.selectionStart ?? input.length;
    const beforeCursor = input.slice(0, cursorPos);
    const atIdx = beforeCursor.lastIndexOf('@');
    if (atIdx >= 0) {
      const newInput = input.slice(0, atIdx) + '@' + result.insertText + ' ' + input.slice(cursorPos);
      setInput(newInput);
    }
    setMentionActive(false);
    setMentionQuery('');
  }, [input]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // @-mention keyboard navigation
    if (mentionActive && mentionResults.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(prev => Math.min(prev + 1, mentionResults.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(prev => Math.max(prev - 1, 0)); return; }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        handleMentionSelect(mentionResults[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); setMentionActive(false); setMentionQuery(''); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend, mentionActive, mentionResults, mentionIndex, handleMentionSelect]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    // Auto-grow
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
    if (onTypingChange) onTypingChange(val.length > 0);

    // @-mention detection
    const cursorPos = e.target.selectionStart;
    const beforeCursor = val.slice(0, cursorPos);
    const atIdx = beforeCursor.lastIndexOf('@');
    if (atIdx >= 0 && (atIdx === 0 || /\s/.test(beforeCursor[atIdx - 1]))) {
      const query = beforeCursor.slice(atIdx + 1);
      if (!query.includes(' ') && query.length > 0) {
        setMentionActive(true);
        setMentionQuery(query);
      } else {
        setMentionActive(false);
        setMentionQuery('');
      }
    } else {
      setMentionActive(false);
      setMentionQuery('');
    }
  }, [onTypingChange]);

  // Permission handlers
  const handleResolvePermission = useCallback((toolUseId: string, allow: boolean, message?: string) => {
    socket.emit('chat:resolve_permission', { instanceId, toolUseId, allow, message });
    setPermissionQueue(prev => prev.filter(p => p.toolUseId !== toolUseId));
  }, [instanceId, socket]);

  const handleApproveAll = useCallback((toolName: string) => {
    socket.emit('chat:approve_tool', { instanceId, toolName });
    setPermissionQueue(prev => prev.filter(p => p.toolName !== toolName));
  }, [instanceId, socket]);

  const handleAnswerQuestion = useCallback((toolUseId: string, answer: string) => {
    socket.emit('chat:resolve_question', { instanceId, toolUseId, answer });
    setPendingQuestion(null);
  }, [instanceId, socket]);

  const pendingPermission = permissionQueue[0] ?? null;
  const isExited = status === 'exited';

  return (
    <div className="flex h-full flex-col">
      {/* Session info bar */}
      {sessionInfo && (
        <div className="flex items-center gap-3 border-b border-border-default px-4 py-1.5 text-[11px] text-muted">
          {sessionInfo.model && <span>Model: <span className="text-secondary">{sessionInfo.model}</span></span>}
          {sessionInfo.tools && <span>{sessionInfo.tools.length} tools</span>}
          {sessionInfo.mcpServers && sessionInfo.mcpServers.length > 0 && (
            <span>{sessionInfo.mcpServers.length} MCP</span>
          )}
          {sessionInfo.permissionMode && <span>Mode: {sessionInfo.permissionMode}</span>}
          {contextUsage && contextUsage.maxTokens > 0 && (
            <span className="flex items-center gap-1.5" title={`${contextUsage.usedTokens.toLocaleString()} / ${contextUsage.maxTokens.toLocaleString()} tokens`}>
              <div className="h-1 w-16 overflow-hidden rounded-full bg-elevated">
                <div
                  className={`h-full rounded-full transition-all ${
                    contextUsage.usedTokens / contextUsage.maxTokens > 0.9 ? 'bg-rose-400'
                      : contextUsage.usedTokens / contextUsage.maxTokens > 0.7 ? 'bg-amber-400'
                      : 'bg-emerald-400'
                  }`}
                  style={{ width: `${Math.min(100, (contextUsage.usedTokens / contextUsage.maxTokens) * 100)}%` }}
                />
              </div>
              <span>{Math.round((contextUsage.usedTokens / contextUsage.maxTokens) * 100)}% ctx</span>
            </span>
          )}
        </div>
      )}

      {/* Messages area */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          {messages.length === 0 && !sending && (
            <div className="flex flex-col items-center justify-center py-24 text-faint">
              <Sparkles className="mb-4 h-8 w-8 text-muted" />
              <p className="text-[15px] text-tertiary">How can I help you?</p>
            </div>
          )}

          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))}

          {/* Live streaming */}
          <LiveWorkingBlock
            streamingText={streamingText}
            thinkingText={thinkingText}
            streamingBlocks={streamingBlocks}
            toolProgress={toolProgress}
            sending={sending}
          />

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Error banner */}
      {lastError && (
        <div className="border-t border-red-500/20 bg-red-500/5 px-4 py-2">
          <div className="mx-auto flex max-w-3xl items-center gap-2 text-xs text-red-400">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">{lastError}</span>
            <button onClick={() => setLastError(null)} className="text-muted hover:text-secondary">&times;</button>
          </div>
        </div>
      )}

      {/* Rate limit banner */}
      {rateLimitInfo && (
        <div className="border-t border-amber-500/20 bg-amber-500/5 px-4 py-2">
          <div className="mx-auto flex max-w-3xl items-center gap-2 text-xs text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>Rate limit reached {rateLimitInfo.resetsAt && <RateLimitCountdown resetsAt={rateLimitInfo.resetsAt} />}</span>
          </div>
        </div>
      )}

      {/* Context usage warning */}
      {contextUsage && contextUsage.maxTokens > 0 && contextUsage.usedTokens / contextUsage.maxTokens > 0.8 && (
        <div className={`border-t px-4 py-1.5 ${
          contextUsage.usedTokens / contextUsage.maxTokens > 0.95
            ? 'border-rose-500/20 bg-rose-500/5'
            : 'border-amber-500/20 bg-amber-500/5'
        }`}>
          <div className="mx-auto flex max-w-3xl items-center gap-2 text-[11px]">
            <AlertTriangle className={`h-3 w-3 shrink-0 ${
              contextUsage.usedTokens / contextUsage.maxTokens > 0.95 ? 'text-rose-400' : 'text-amber-400'
            }`} />
            <span className={contextUsage.usedTokens / contextUsage.maxTokens > 0.95 ? 'text-rose-300' : 'text-amber-300'}>
              Context {Math.round((contextUsage.usedTokens / contextUsage.maxTokens) * 100)}% full
              {contextUsage.usedTokens / contextUsage.maxTokens > 0.95 && ' — consider starting a new task or using /compact'}
            </span>
          </div>
        </div>
      )}

      {/* Permission prompt */}
      {pendingPermission && (
        <PermissionPrompt
          permission={pendingPermission}
          onResolve={handleResolvePermission}
          onApproveAll={handleApproveAll}
        />
      )}

      {/* User question */}
      {pendingQuestion && (
        <UserQuestionPrompt
          question={pendingQuestion}
          onAnswer={handleAnswerQuestion}
        />
      )}

      {/* Input area */}
      <div className="px-4 pb-4 pt-2">
        <div className="mx-auto max-w-3xl">
          {/* Context chips + code selection */}
          {(contextItems.length > 0 || codeSelection) && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {contextItems.map(item => (
                <span key={item.value} className="flex items-center gap-1 rounded-full bg-elevated px-2.5 py-1 text-[11px] text-secondary">
                  {item.type === 'file' && <FileText className="h-2.5 w-2.5 text-blue-400" />}
                  {item.type === 'branch' && <GitBranch className="h-2.5 w-2.5 text-violet-400" />}
                  {item.type === 'commit' && <GitCommit className="h-2.5 w-2.5 text-amber-400" />}
                  {item.type === 'changes' && <FileCode2 className="h-2.5 w-2.5 text-green-400" />}
                  <span className="max-w-[150px] truncate">{item.label}</span>
                  <button onClick={() => removeContextItem(item.value)} className="ml-0.5 text-faint hover:text-secondary">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
              {codeSelection && (
                <span className="flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[11px] text-violet-300">
                  <FileText className="h-2.5 w-2.5" />
                  <span className="max-w-[200px] truncate">{codeSelection.filePath.split('/').pop()}:{codeSelection.startLine}-{codeSelection.endLine}</span>
                  <span className="text-[9px] text-violet-300/60">{codeSelection.endLine - codeSelection.startLine + 1}L</span>
                  <button onClick={onClearCodeSelection} className="ml-0.5 text-violet-300/50 hover:text-violet-200">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              )}
            </div>
          )}

          {/* Unified input container */}
          <div className="relative rounded-2xl border border-border-input bg-input transition-colors focus-within:border-border-focus">
            {/* @-mention dropdown */}
            {mentionActive && mentionResults.length > 0 && (
              <div className="absolute bottom-full left-4 right-4 z-20 mb-1">
                <div className="overflow-hidden rounded-xl border border-border-input bg-popover shadow-xl">
                  <div className="max-h-48 overflow-y-auto py-1">
                    {mentionResults.map((result, i) => (
                      <button
                        key={result.label}
                        onMouseDown={e => { e.preventDefault(); handleMentionSelect(result); }}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors ${
                          i === mentionIndex ? 'bg-elevated text-primary' : 'text-tertiary hover:bg-hover'
                        }`}
                      >
                        <FileText className="h-3 w-3 shrink-0 text-blue-400" />
                        <span className="min-w-0 truncate">{result.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={isExited ? 'Instance has exited' : 'Send a message...'}
              rows={1}
              disabled={isExited}
              className="w-full resize-none bg-transparent px-4 pb-1 pt-3 text-sm text-primary placeholder-placeholder outline-none focus-visible:outline-none disabled:opacity-50"
              style={{ minHeight: 20, maxHeight: 120 }}
            />

            {/* Bottom row inside input: attach + controls + send */}
            <div className="flex items-center gap-1 px-2 pb-2">
              {/* Context menu button */}
              <div ref={contextMenuRef} className="relative">
                <button
                  onClick={() => { setContextMenuOpen(!contextMenuOpen); setContextMenuSection(null); }}
                  className={`rounded-lg p-1.5 transition-colors ${contextMenuOpen ? 'bg-hover text-primary' : 'text-muted hover:bg-hover hover:text-secondary'}`}
                  title="Attach context"
                  disabled={isExited}
                >
                  <Plus className="h-4 w-4" />
                </button>
                {contextMenuOpen && (
                  <div className="absolute bottom-full left-0 z-50 mb-1 min-w-[200px] rounded-xl border border-border-default bg-popover py-1 shadow-lg">
                    {!contextMenuSection ? (
                      <>
                        <button onClick={() => { setContextMenuSection('files'); fetchContextSection('files'); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-secondary hover:bg-hover">
                          <FileText className="h-3 w-3 text-blue-400" /> Files
                        </button>
                        <button onClick={() => { setContextMenuSection('branches'); fetchContextSection('branches'); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-secondary hover:bg-hover">
                          <GitBranch className="h-3 w-3 text-violet-400" /> Branches
                        </button>
                        <button onClick={() => { setContextMenuSection('commits'); fetchContextSection('commits'); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-secondary hover:bg-hover">
                          <GitCommit className="h-3 w-3 text-amber-400" /> Commits
                        </button>
                        <button onClick={addChangesContext} className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-secondary hover:bg-hover">
                          <FileCode2 className="h-3 w-3 text-green-400" /> Local changes
                        </button>
                      </>
                    ) : (
                      <div className="max-h-48 overflow-y-auto">
                        {contextLoading ? (
                          <div className="flex justify-center py-3"><Loader2 className="h-3 w-3 animate-spin text-faint" /></div>
                        ) : contextSearchResults.length === 0 ? (
                          <p className="px-3 py-2 text-xs text-faint">Nothing found</p>
                        ) : (
                          contextSearchResults.map(r => (
                            <button
                              key={r.value}
                              onClick={() => {
                                const typeMap = { files: 'file', branches: 'branch', commits: 'commit' } as const;
                                addContextItem(typeMap[contextMenuSection!], r.label, r.value);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-1 text-left text-[12px] text-tertiary hover:bg-hover hover:text-secondary"
                            >
                              <span className="min-w-0 truncate">{r.label}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Model / Permission / Effort selectors */}
              <Dropdown
                value={selectedModel}
                options={MODEL_OPTIONS}
                onChange={setSelectedModel}
                icon={Sparkles}
                label="Model"
              />
              <Dropdown
                value={permissionMode}
                options={PERMISSION_OPTIONS}
                onChange={setPermissionMode}
                icon={Shield}
                label="Permission mode"
              />
              <Dropdown
                value={effortLevel}
                options={EFFORT_OPTIONS}
                onChange={setEffortLevel}
                icon={Brain}
                label="Effort level"
              />

              <div className="flex-1" />

              {/* Send / Stop */}
              <button
                onClick={sending ? () => socket.emit('chat:interrupt', { instanceId }) : handleSend}
                disabled={isExited || (!input.trim() && !sending)}
                className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${
                  sending
                    ? 'bg-red-600/80 text-white hover:bg-red-600'
                    : input.trim()
                      ? 'bg-primary text-root hover:opacity-80'
                      : 'bg-elevated text-faint'
                } disabled:opacity-30`}
                title={sending ? 'Stop' : 'Send'}
              >
                {sending ? (
                  <CircleStop className="h-4 w-4" />
                ) : (
                  <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
