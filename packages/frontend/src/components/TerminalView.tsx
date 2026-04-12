import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { ArrowDownToLine } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';
import { useSocket } from '../hooks/useSocket';
import TerminalSearchBar from './TerminalSearchBar';

interface TerminalViewProps {
  instanceId: string;
  onTypingChange?: (typing: boolean) => void;
}

export default function TerminalView({ instanceId, onTypingChange }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const socket = useSocket();
  const [autoScroll, setAutoScroll] = useState(true);
  const autoScrollRef = useRef(true);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const currentInstanceId = instanceId;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#0a0a0a',
        foreground: '#e5e5e5',
        cursor: '#e5e5e5',
        selectionBackground: '#3b3b3b',
        black: '#0a0a0a',
        red: '#ff5555',
        green: '#50fa7b',
        yellow: '#f1fa8c',
        blue: '#6272a4',
        magenta: '#ff79c6',
        cyan: '#8be9fd',
        white: '#e5e5e5',
        brightBlack: '#555555',
        brightRed: '#ff6e6e',
        brightGreen: '#69ff94',
        brightYellow: '#ffffa5',
        brightBlue: '#d6acff',
        brightMagenta: '#ff92df',
        brightCyan: '#a4ffff',
        brightWhite: '#ffffff',
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const searchAddon = new SearchAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.loadAddon(searchAddon);
    term.open(containerRef.current);

    searchAddonRef.current = searchAddon;

    fitAddon.fit();

    termRef.current = term;
    fitRef.current = fitAddon;

    // Handle user input — track typing state
    term.onData(data => {
      socket.emit('terminal:input', { instanceId: currentInstanceId, data });

      if (onTypingChange) {
        // Enter/return releases typing lock
        if (data.includes('\r') || data.includes('\n')) {
          onTypingChange(false);
        } else {
          // Any printable character sets typing lock
          const hasPrintable = data.split('').some(ch => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) < 127);
          if (hasPrintable) {
            onTypingChange(true);
          }
        }
      }
    });

    // Only accept the first history event per attach cycle, and block live
    // output until history has been received to prevent overlaps.
    let historyWritten = false;
    let outputEnabled = false;
    let attached = false;

    // Detect user scrolling: disable auto-scroll when scrolled up, re-enable at bottom
    const viewport = containerRef.current?.querySelector('.xterm-viewport');
    const onScroll = () => {
      if (!viewport) return;
      const atBottom = viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 5;
      autoScrollRef.current = atBottom;
      setAutoScroll(atBottom);
    };
    viewport?.addEventListener('scroll', onScroll);

    const onOutput = ({ instanceId: id, data }: { instanceId: string; data: string }) => {
      if (id === currentInstanceId && outputEnabled) {
        term.write(data);
        if (autoScrollRef.current) {
          term.scrollToBottom();
        }
      }
    };

    const onHistory = ({ instanceId: id, data }: { instanceId: string; data: string }) => {
      if (id === currentInstanceId && !historyWritten) {
        historyWritten = true;
        term.reset();
        if (data.length > 0) {
          term.write(data);
        }
        outputEnabled = true;
      }
    };

    // Perform a resize + attach sequence.  Called on initial mount and
    // again whenever the socket reconnects (new socket.id → old attachment
    // is gone server-side, so we must re-attach to receive output).
    let pendingAttachTimer: ReturnType<typeof setTimeout> | undefined;
    const attachToInstance = () => {
      historyWritten = false;
      outputEnabled = false;

      socket.emit('terminal:resize', {
        instanceId: currentInstanceId,
        cols: term.cols,
        rows: term.rows,
      });

      clearTimeout(pendingAttachTimer);
      pendingAttachTimer = setTimeout(() => {
        socket.emit('terminal:attach', { instanceId: currentInstanceId });
        attached = true;
      }, 80);
    };

    // Re-attach after socket reconnection so live output resumes
    const onConnect = () => {
      if (attached) {
        console.log(`[terminal] Socket reconnected, re-attaching to ${currentInstanceId}`);
        attachToInstance();
      }
    };

    socket.on('terminal:output', onOutput);
    socket.on('terminal:history', onHistory);
    socket.on('connect', onConnect);

    // Initial attach
    attachToInstance();

    // Handle container resize
    const resizeObserver = new ResizeObserver(() => {
      if (fitAddon && term) {
        fitAddon.fit();
        socket.emit('terminal:resize', {
          instanceId: currentInstanceId,
          cols: term.cols,
          rows: term.rows,
        });
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      clearTimeout(pendingAttachTimer);
      viewport?.removeEventListener('scroll', onScroll);
      resizeObserver.disconnect();
      socket.off('terminal:output', onOutput);
      socket.off('terminal:history', onHistory);
      socket.off('connect', onConnect);
      socket.emit('terminal:detach', { instanceId: currentInstanceId });
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      searchAddonRef.current = null;
      // Reset typing state on unmount
      if (onTypingChange) onTypingChange(false);
    };
    // Only re-run when instanceId changes — socket is a stable singleton
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId]);

  // Cmd+F / Ctrl+F to open search, Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const scrollToBottom = useCallback(() => {
    if (termRef.current) {
      termRef.current.scrollToBottom();
      autoScrollRef.current = true;
      setAutoScroll(true);
    }
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    searchAddonRef.current?.clearDecorations();
    termRef.current?.focus();
  }, []);

  return (
    <div className="relative h-full w-full p-3">
      {searchOpen && searchAddonRef.current && (
        <TerminalSearchBar searchAddon={searchAddonRef.current} onClose={closeSearch} />
      )}
      <div
        ref={containerRef}
        className="h-full w-full overflow-hidden rounded-xl bg-codeblock p-2"
      />
      {!autoScroll && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-6 right-6 flex h-8 w-8 items-center justify-center rounded-full bg-elevated/80 text-muted shadow-lg backdrop-blur transition-colors hover:bg-hover hover:text-secondary"
          title="Scroll to bottom"
        >
          <ArrowDownToLine className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
