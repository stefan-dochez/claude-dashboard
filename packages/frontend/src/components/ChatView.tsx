import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  Send, Square, Loader2, ChevronDown, ChevronRight,
  Wrench, AlertCircle, CheckCircle2, Brain, User, Bot,
  Sparkles, Shield, CircleStop,
} from 'lucide-react';
import { useSocket } from '../hooks/useSocket';
import type { ChatMessage, ContentBlock, SessionInfo } from '../types';

interface ChatViewProps {
  instanceId: string;
  status: string;
  onTypingChange?: (typing: boolean) => void;
  initialModel?: string | null;
  initialPermissionMode?: string | null;
  initialEffort?: string | null;
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
  const preview = text.slice(0, 120).replace(/\n/g, ' ');

  return (
    <div className="my-1.5 rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 text-left text-xs text-violet-400"
      >
        <Brain className={`h-3 w-3 ${isActive ? 'animate-pulse' : ''}`} />
        <span className="font-medium">{isActive ? 'Thinking...' : 'Thought process'}</span>
        {expanded ? <ChevronDown className="ml-auto h-3 w-3" /> : <ChevronRight className="ml-auto h-3 w-3" />}
      </button>
      {expanded ? (
        <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap text-xs text-violet-300/70">{text}</pre>
      ) : (
        <p className="mt-1 truncate text-xs text-violet-300/50">{preview}{text.length > 120 ? '...' : ''}</p>
      )}
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

function ToolGroupBlock({ tools }: { tools: Array<{ use: ContentBlock; result?: ContentBlock }> }) {
  const [expanded, setExpanded] = useState(false);
  const hasError = tools.some(t => t.result?.is_error);
  const toolNames = tools.map(t => t.use.name).filter(Boolean);

  return (
    <div className={`my-1.5 rounded-lg border px-3 py-2 ${hasError ? 'border-red-500/20 bg-red-500/5' : 'border-border-default bg-elevated/30'}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 text-left text-xs"
      >
        <Wrench className={`h-3 w-3 ${hasError ? 'text-red-400' : 'text-blue-400'}`} />
        <span className="font-medium text-secondary">
          {toolNames.length === 1 ? toolNames[0] : `${toolNames.length} tools`}
        </span>
        {hasError && <AlertCircle className="h-3 w-3 text-red-400" />}
        {!hasError && <CheckCircle2 className="h-3 w-3 text-green-500/60" />}
        {expanded ? <ChevronDown className="ml-auto h-3 w-3 text-faint" /> : <ChevronRight className="ml-auto h-3 w-3 text-faint" />}
      </button>
      {expanded && (
        <div className="mt-2 flex flex-col gap-2">
          {tools.map((tool, i) => (
            <div key={i} className="rounded border border-border-subtle bg-codeblock p-2">
              <div className="mb-1 text-[11px] font-medium text-muted">{tool.use.name}</div>
              {tool.use.input != null && (
                <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-[11px] text-faint">
                  {typeof tool.use.input === 'string' ? tool.use.input : JSON.stringify(tool.use.input, null, 2)}
                </pre>
              )}
              {tool.result && (
                <div className={`mt-1.5 border-t pt-1.5 ${tool.result.is_error ? 'border-red-500/20' : 'border-border-subtle'}`}>
                  <pre className={`max-h-32 overflow-auto whitespace-pre-wrap text-[11px] ${tool.result.is_error ? 'text-red-400/70' : 'text-muted'}`}>
                    {(tool.result.content ?? tool.result.stdout ?? '').slice(0, 3000)}
                  </pre>
                </div>
              )}
            </div>
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

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${isUser ? 'bg-blue-600' : 'bg-amber-600'}`}>
        {isUser ? <User className="h-3.5 w-3.5 text-white" /> : <Bot className="h-3.5 w-3.5 text-white" />}
      </div>
      <div className={`min-w-0 max-w-[85%] ${isUser ? 'text-right' : ''}`}>
        {isUser ? (
          <div className="inline-block rounded-lg bg-input px-3 py-2 text-sm text-primary">
            {message.content[0]?.text ?? ''}
          </div>
        ) : (
          groups?.map((group, i) => {
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
          })
        )}
        <div className={`mt-1 text-[10px] text-faint ${isUser ? 'text-right' : ''}`}>
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>
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
    <div className="flex gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-600">
        <Bot className="h-3.5 w-3.5 text-white" />
      </div>
      <div className="min-w-0 max-w-[85%]">
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
          <div className="my-1.5 flex items-center gap-2 text-xs text-muted">
            <ToolProgressRing seconds={toolProgress.elapsedSeconds} />
            <span className="font-mono text-secondary">{toolProgress.toolName}</span>
            <span className="text-faint">{Math.round(toolProgress.elapsedSeconds)}s</span>
          </div>
        )}

        {/* Streaming text */}
        {streamingText ? (
          <div className="text-sm leading-relaxed text-primary">
            <MarkdownText text={streamingText} />
            <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-blue-400" />
          </div>
        ) : sending && !thinkingText && !toolProgress && streamingBlocks.length === 0 ? (
          <div className="flex items-center gap-2 py-2 text-xs text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Connecting...</span>
          </div>
        ) : null}
      </div>
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
    <div className="mx-4 mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
      <div className="flex items-center gap-2 text-xs text-amber-400">
        <Shield className="h-3.5 w-3.5" />
        <span className="font-medium">Permission: <span className="font-mono">{permission.toolName}</span></span>
      </div>
      {permission.title && <p className="mt-1.5 text-xs text-secondary">{permission.title}</p>}
      {permission.description && <p className="mt-1 text-xs text-muted">{permission.description}</p>}
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => onResolve(permission.toolUseId, true)}
          className="rounded bg-green-600/80 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-green-600"
        >
          <span className="mr-1 text-[10px] text-white/50">1</span> Yes
        </button>
        <button
          onClick={() => { onApproveAll(permission.toolName); onResolve(permission.toolUseId, true); }}
          className="rounded bg-blue-600/80 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-600"
        >
          <span className="mr-1 text-[10px] text-white/50">2</span> Always
        </button>
        <button
          onClick={() => onResolve(permission.toolUseId, false)}
          className="rounded bg-elevated px-3 py-1 text-xs font-medium text-secondary transition-colors hover:bg-hover"
        >
          <span className="mr-1 text-[10px] text-faint">3</span> No
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
      <div className="mx-4 mb-3 rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3">
        <p className="mb-2 text-xs text-cyan-300">{q.question}</p>
        <div className="flex flex-wrap gap-1.5">
          {q.options.map((opt, i) => (
            <button
              key={i}
              onClick={() => onAnswer(question.toolUseId, opt.label)}
              className="rounded bg-cyan-600/20 px-2.5 py-1 text-xs text-cyan-300 transition-colors hover:bg-cyan-600/40"
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-4 mb-3 rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3">
      <p className="mb-2 text-xs text-cyan-300">{q?.question ?? 'Claude has a question'}</p>
      <div className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && text.trim()) { onAnswer(question.toolUseId, text.trim()); setText(''); } }}
          className="flex-1 rounded border border-border-input bg-input px-2 py-1 text-xs text-primary outline-none focus:border-border-focus"
          placeholder="Type your answer..."
        />
        <button
          onClick={() => { if (text.trim()) { onAnswer(question.toolUseId, text.trim()); setText(''); } }}
          className="rounded bg-cyan-600/80 px-2.5 py-1 text-xs text-white hover:bg-cyan-600"
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

// --------------- Main ChatView ---------------

export default function ChatView({
  instanceId, status, onTypingChange,
  initialModel, initialPermissionMode, initialEffort,
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
      setPermissionQueue(prev => [...prev, data]);
    };

    const onUserQuestion = ({ instanceId: id, ...data }: {
      instanceId: string; toolUseId: string; questions: Array<{ question: string; options?: Array<{ label: string }> }>;
    }) => {
      if (id !== currentId) return;
      setPendingQuestion(data);
    };

    const onResult = ({ instanceId: id }: { instanceId: string }) => {
      if (id !== currentId) return;
      setSending(false);
      setToolProgress(null);
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
      if (flushTimerRef.current) cancelAnimationFrame(flushTimerRef.current);
      if (thinkingFlushTimerRef.current) cancelAnimationFrame(thinkingFlushTimerRef.current);
      if (onTypingChange) onTypingChange(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId]);

  // Send message
  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);
    setLastError(null);
    setStreamingText('');
    setThinkingText('');
    setStreamingBlocks([]);

    socket.emit('chat:send', {
      instanceId,
      prompt: text,
      model: selectedModel,
      permissionMode,
      effort: effortLevel,
    });

    if (onTypingChange) onTypingChange(false);

    // Reset textarea height
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setTimeout(scrollToBottom, 50);
  }, [input, sending, instanceId, socket, selectedModel, permissionMode, effortLevel, onTypingChange, scrollToBottom]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Auto-grow
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
    if (onTypingChange) onTypingChange(e.target.value.length > 0);
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
        </div>
      )}

      {/* Messages area */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          {messages.length === 0 && !sending && (
            <div className="flex flex-col items-center justify-center py-20 text-faint">
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-elevated">
                <Bot className="h-7 w-7" />
              </div>
              <p className="text-[15px] font-medium text-tertiary">Start a conversation</p>
              <p className="mt-2 text-[13px] text-faint">Messages are sent via the Claude Agent SDK</p>
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

      {/* Input bar */}
      <div className="border-t border-border-default bg-surface px-4 py-3">
        <div className="mx-auto max-w-3xl">
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={isExited ? 'Instance has exited' : 'Send a message... (Shift+Enter for newline)'}
            rows={1}
            disabled={isExited}
            className="w-full resize-none rounded-lg border border-border-input bg-input px-3 py-2 text-sm text-primary placeholder-placeholder outline-none transition-colors focus:border-border-focus disabled:opacity-50"
            style={{ minHeight: 20, maxHeight: 120 }}
          />

          {/* Controls row */}
          <div className="mt-2 flex items-center gap-1">
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
              onClick={sending ? undefined : handleSend}
              disabled={isExited || (!input.trim() && !sending)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                sending
                  ? 'bg-red-600/80 text-white hover:bg-red-600'
                  : input.trim()
                    ? 'bg-blue-600 text-white hover:bg-blue-500'
                    : 'bg-elevated text-faint'
              } disabled:opacity-40`}
            >
              {sending ? (
                <><CircleStop className="h-3.5 w-3.5" /> Stop</>
              ) : (
                <><Send className="h-3.5 w-3.5" /> Send</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
