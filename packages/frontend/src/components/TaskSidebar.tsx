import { useState } from 'react';
import { Plus, Trash2, Terminal, MessageSquare, Search, Loader2 } from 'lucide-react';
import type { Instance, InstanceStatus } from '../types';

interface TaskSidebarProps {
  instances: Instance[];
  selectedId: string | null;
  queuedIds: Set<string>;
  onSelect: (id: string) => void;
  onKill: (id: string, deleteWorktree?: boolean) => void;
  onDismiss: (id: string) => void;
  onNewTask: () => void;
}

const STATUS_DOT: Record<InstanceStatus, string> = {
  launching: 'bg-yellow-500',
  processing: 'bg-blue-500 animate-pulse',
  waiting_input: 'bg-green-500',
  idle: 'bg-muted',
  exited: 'bg-faint',
};

const STATUS_LABEL: Record<InstanceStatus, string> = {
  launching: 'Launching',
  processing: 'Processing',
  waiting_input: 'Waiting for input',
  idle: 'Idle',
  exited: 'Exited',
};

export default function TaskSidebar({
  instances, selectedId, queuedIds, onSelect, onKill, onDismiss, onNewTask,
}: TaskSidebarProps) {
  const [filter, setFilter] = useState('');
  const [confirmKillId, setConfirmKillId] = useState<string | null>(null);
  const [deleteWorktreeChecked, setDeleteWorktreeChecked] = useState(false);

  const sorted = [...instances].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const active = sorted.filter(i => i.status !== 'exited');
  const exited = sorted.filter(i => i.status === 'exited');

  const filtered = filter.trim()
    ? active.filter(i =>
        i.projectName.toLowerCase().includes(filter.toLowerCase()) ||
        (i.taskDescription?.toLowerCase().includes(filter.toLowerCase()) ?? false),
      )
    : active;

  const killTarget = instances.find(i => i.id === confirmKillId);
  const hasWorktree = killTarget?.worktreePath != null;

  return (
    <aside className="flex h-full shrink-0 flex-col bg-transparent" style={{ width: 260 }}>
      {/* New task button */}
      <div className="px-3 py-2">
        <button
          onClick={onNewTask}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-[13px] text-tertiary transition-colors hover:bg-elevated/30 hover:text-primary"
        >
          <Plus className="h-4 w-4" />
          New Task
        </button>
      </div>

      {/* Search */}
      {active.length > 3 && (
        <div className="relative px-3 pb-2">
          <Search className="absolute left-5 top-1.5 h-3.5 w-3.5 text-faint" />
          <input
            type="text"
            placeholder="Search tasks"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="w-full rounded bg-transparent py-1 pl-7 pr-2 text-[12px] text-tertiary placeholder-placeholder outline-none transition-colors focus:bg-surface/50"
          />
        </div>
      )}

      {/* Active tasks */}
      <div className="flex-1 overflow-y-auto px-2">
        <div className="flex flex-col gap-px">
          {filtered.length === 0 && active.length === 0 && (
            <p className="py-8 text-center text-xs text-faint">No active tasks</p>
          )}
          {filtered.length === 0 && active.length > 0 && (
            <p className="py-4 text-center text-xs text-faint">No matches</p>
          )}

          {filtered.map(instance => {
            const isSelected = instance.id === selectedId;
            const isChat = instance.mode === 'chat';
            const ModeIcon = isChat ? MessageSquare : Terminal;
            const label = instance.taskDescription ?? instance.projectName;

            return (
              <div
                key={instance.id}
                onClick={() => onSelect(instance.id)}
                className={`group flex w-full cursor-pointer flex-col rounded-lg px-3 py-2.5 text-left transition-colors ${
                  isSelected ? 'bg-elevated/50' : 'hover:bg-elevated/20'
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <span className={`block truncate text-[13px] leading-tight ${isSelected ? 'text-primary' : 'text-tertiary'}`}>
                      {label}
                    </span>
                    <span className="mt-1 flex items-center gap-1.5 text-[11px] text-faint">
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[instance.status]}`} />
                      {STATUS_LABEL[instance.status]}
                      {queuedIds.has(instance.id) && (
                        <span className="rounded bg-amber-500/15 px-1 py-0.5 text-[9px] font-medium text-amber-400">
                          Q
                        </span>
                      )}
                    </span>
                    {instance.taskDescription && (
                      <span className="mt-0.5 flex items-center gap-1 text-[11px] text-faint">
                        <ModeIcon className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">{instance.projectName}</span>
                      </span>
                    )}
                  </div>
                  {instance.status !== 'exited' && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setConfirmKillId(instance.id);
                        setDeleteWorktreeChecked(false);
                      }}
                      className="mt-0.5 shrink-0 rounded p-1 text-faint opacity-0 transition-all hover:text-rose-300 group-hover:opacity-100"
                      title="Kill"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Exited instances */}
          {exited.length > 0 && (
            <>
              {filtered.length > 0 && <div className="mx-1 my-2 border-t border-border-default" />}
              <span className="px-1 py-1 text-[10px] font-medium uppercase tracking-wider text-faint">Exited</span>
              {exited.map(instance => (
                <div
                  key={instance.id}
                  onClick={() => onSelect(instance.id)}
                  className={`group flex cursor-pointer items-start gap-2 rounded-lg px-3 py-2 transition-colors ${
                    instance.id === selectedId ? 'bg-elevated/50' : 'hover:bg-elevated/20'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] leading-tight text-faint">
                      {instance.taskDescription ?? instance.projectName}
                    </span>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); onDismiss(instance.id); }}
                    className="shrink-0 rounded p-1 text-faint opacity-0 transition-all hover:text-rose-300 group-hover:opacity-100"
                    title="Remove"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Kill confirmation modal */}
      {confirmKillId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setConfirmKillId(null)}
        >
          <div
            className="mx-4 w-full max-w-xs rounded-lg border border-border-input bg-surface p-4 shadow-lg"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-2 text-red-400">
              <Trash2 className="h-4 w-4" />
              <span className="text-sm font-semibold">Kill instance</span>
            </div>
            <p className="mb-3 text-xs text-tertiary">
              Kill <span className="font-medium text-primary">{killTarget?.projectName}</span>?
            </p>
            {hasWorktree && (
              <label className="mb-3 flex items-center gap-2 text-xs text-tertiary">
                <input
                  type="checkbox"
                  checked={deleteWorktreeChecked}
                  onChange={e => setDeleteWorktreeChecked(e.target.checked)}
                  className="rounded border-border-focus bg-elevated"
                />
                Also delete worktree and branch
              </label>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmKillId(null)}
                className="rounded px-3 py-1.5 text-xs text-tertiary transition-colors hover:bg-elevated hover:text-primary"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onKill(confirmKillId, hasWorktree ? deleteWorktreeChecked : undefined);
                  setConfirmKillId(null);
                }}
                className="rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-500"
              >
                Kill
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
