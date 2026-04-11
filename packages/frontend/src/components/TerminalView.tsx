import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useSocket } from '../hooks/useSocket';

interface TerminalViewProps {
  instanceId: string;
  onTypingChange?: (typing: boolean) => void;
}

export default function TerminalView({ instanceId, onTypingChange }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const socket = useSocket();

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

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(containerRef.current);

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

    const onOutput = ({ instanceId: id, data }: { instanceId: string; data: string }) => {
      if (id === currentInstanceId && outputEnabled) {
        term.write(data);
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
      resizeObserver.disconnect();
      socket.off('terminal:output', onOutput);
      socket.off('terminal:history', onHistory);
      socket.off('connect', onConnect);
      socket.emit('terminal:detach', { instanceId: currentInstanceId });
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      // Reset typing state on unmount
      if (onTypingChange) onTypingChange(false);
    };
    // Only re-run when instanceId changes — socket is a stable singleton
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId]);

  return (
    <div className="h-full w-full p-3">
      <div
        ref={containerRef}
        className="h-full w-full overflow-hidden rounded-xl bg-codeblock p-2"
      />
    </div>
  );
}
