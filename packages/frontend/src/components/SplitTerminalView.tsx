import { useState, useCallback } from 'react';
import { X, Plus } from 'lucide-react';
import TerminalView from './TerminalView';
import { useSocket } from '../hooks/useSocket';
import type { Instance } from '../types';

interface SplitTerminalViewProps {
  instanceIds: string[];
  instances: Instance[];
  focusedId: string;
  broadcastEnabled: boolean;
  onFocus: (id: string) => void;
  onRemoveFromSplit: (id: string) => void;
  onAddToSplit: (id: string) => void;
  onTypingChange?: (typing: boolean) => void;
}

export default function SplitTerminalView({
  instanceIds,
  instances,
  focusedId,
  broadcastEnabled,
  onFocus,
  onRemoveFromSplit,
  onAddToSplit,
  onTypingChange,
}: SplitTerminalViewProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const socket = useSocket();

  const cols = instanceIds.length <= 2 ? instanceIds.length : 2;
  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gap: '2px',
    height: '100%',
    width: '100%',
  };

  // Terminal instances eligible to add (alive, terminal mode, not already in split)
  const eligibleInstances = instances.filter(
    i => i.mode === 'terminal' && i.status !== 'exited' && !instanceIds.includes(i.id)
  );

  const handleTypingChange = useCallback((typing: boolean) => {
    onTypingChange?.(typing);
  }, [onTypingChange]);

  // Broadcast: when focused terminal sends input, forward to all other split terminals
  const handleBroadcastInput = useCallback((sourceId: string, data: string) => {
    if (!broadcastEnabled) return;
    for (const id of instanceIds) {
      if (id !== sourceId) {
        socket.emit('terminal:input', { instanceId: id, data });
      }
    }
  }, [broadcastEnabled, instanceIds, socket]);

  return (
    <div className="relative h-full w-full">
      <div style={gridStyle}>
        {instanceIds.map(id => {
          const instance = instances.find(i => i.id === id);
          const isFocused = id === focusedId;

          return (
            <div
              key={id}
              onClick={() => onFocus(id)}
              className={`relative flex flex-col overflow-hidden ${
                isFocused ? 'ring-1 ring-blue-500/60 rounded-xl'
                  : broadcastEnabled ? 'ring-1 ring-amber-500/40 rounded-xl'
                  : ''
              }`}
            >
              {/* Mini header */}
              <div className="flex h-6 shrink-0 items-center justify-between bg-surface px-2">
                <span className="truncate text-[10px] text-muted">
                  {instance?.projectName ?? 'Unknown'}
                  {instance?.branchName ? ` · ${instance.branchName}` : ''}
                  {broadcastEnabled && <span className="ml-1 text-amber-400">⚡</span>}
                </span>
                {instanceIds.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemoveFromSplit(id); }}
                    className="flex h-4 w-4 items-center justify-center rounded text-faint hover:text-secondary transition-colors"
                    title="Remove from split"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className="flex-1 overflow-hidden">
                <TerminalView
                  instanceId={id}
                  onTypingChange={isFocused ? handleTypingChange : undefined}
                  onInput={isFocused ? (data) => handleBroadcastInput(id, data) : undefined}
                />
              </div>
            </div>
          );
        })}

        {/* Add pane button (if < 4 instances and there are eligible ones) */}
        {instanceIds.length < 4 && eligibleInstances.length > 0 && (
          <div className="relative flex items-center justify-center bg-root/50 rounded-xl min-h-[200px]">
            <button
              onClick={() => setPickerOpen(!pickerOpen)}
              className="flex flex-col items-center gap-2 rounded-xl px-6 py-4 text-muted transition-colors hover:bg-elevated/50 hover:text-secondary"
            >
              <Plus className="h-6 w-6" />
              <span className="text-xs">Add terminal</span>
            </button>

            {pickerOpen && (
              <div className="absolute top-1/2 left-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border-default bg-elevated p-2 shadow-xl">
                <div className="mb-1 px-2 text-[10px] font-medium uppercase text-faint">Instances</div>
                {eligibleInstances.map(inst => (
                  <button
                    key={inst.id}
                    onClick={() => { onAddToSplit(inst.id); setPickerOpen(false); }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-secondary transition-colors hover:bg-hover"
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${
                      inst.status === 'processing' ? 'bg-blue-400' :
                      inst.status === 'waiting_input' ? 'bg-green-400' : 'bg-zinc-500'
                    }`} />
                    <span className="truncate">{inst.projectName}</span>
                    {inst.branchName && <span className="text-faint truncate">· {inst.branchName}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
