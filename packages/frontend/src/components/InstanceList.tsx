import { useState } from 'react';
import { Trash2, Terminal } from 'lucide-react';
import type { Instance, InstanceStatus } from '../types';

interface InstanceListProps {
  instances: Instance[];
  selectedId: string | null;
  queuedIds: Set<string>;
  onSelect: (id: string) => void;
  onKill: (id: string, deleteWorktree?: boolean) => void;
  onDismiss: (id: string) => void;
}

const STATUS_COLORS: Record<InstanceStatus, string> = {
  launching: 'bg-yellow-500',
  processing: 'bg-blue-500 animate-pulse',
  waiting_input: 'bg-green-500',
  idle: 'bg-neutral-500',
  exited: 'bg-red-500',
};

const STATUS_LABELS: Record<InstanceStatus, string> = {
  launching: 'Launching',
  processing: 'Processing',
  waiting_input: 'Waiting',
  idle: 'Idle',
  exited: 'Exited',
};

export default function InstanceList({ instances, selectedId, queuedIds, onSelect, onKill, onDismiss }: InstanceListProps) {
  // Build ordered array from queuedIds for position display
  const queuedArray = instances
    .filter(i => queuedIds.has(i.id))
    .map(i => i.id);
  const [confirmKillId, setConfirmKillId] = useState<string | null>(null);
  const [deleteWorktreeChecked, setDeleteWorktreeChecked] = useState(false);
  const [statusFilter, setStatusFilter] = useState<InstanceStatus | 'all'>('all');

  // Stable order: sort by creation date only (oldest first)
  const sorted = [...instances].sort((a, b) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const activeInstances = sorted.filter(i => i.status !== 'exited');
  const exitedInstances = sorted.filter(i => i.status === 'exited');
  const filtered = statusFilter === 'all'
    ? activeInstances
    : activeInstances.filter(i => i.status === statusFilter);

  if (sorted.length === 0) {
    return (
      <p className="py-4 text-center text-xs text-neutral-600">
        No active instances
      </p>
    );
  }

  const killTarget = instances.find(i => i.id === confirmKillId);
  const hasWorktree = killTarget?.worktreePath !== null && killTarget?.worktreePath !== undefined;

  return (
    <div className="flex flex-col gap-0.5">
      {activeInstances.length >= 2 && (
        <div className="mb-1.5 flex flex-wrap items-center gap-1">
          {(['all', 'waiting_input', 'processing', 'launching', 'idle'] as const).map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`rounded px-1.5 py-0.5 text-[12px] transition-colors ${
                statusFilter === status
                  ? 'bg-neutral-700 text-neutral-200'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {status === 'all' ? 'All' : status === 'waiting_input' ? 'Waiting' : status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
          {statusFilter !== 'all' && (
            <span className="ml-auto text-[12px] text-neutral-600">
              {filtered.length}/{activeInstances.length}
            </span>
          )}
        </div>
      )}
      {filtered.map(instance => {
        const isSelected = instance.id === selectedId;
        const isWaiting = instance.status === 'waiting_input';

        return (
          <button
            key={instance.id}
            onClick={() => onSelect(instance.id)}
            className={`group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
              isSelected
                ? 'bg-neutral-800 ring-1 ring-neutral-700'
                : 'hover:bg-neutral-800/50'
            }`}
          >
            <div className="relative shrink-0">
              <Terminal className="h-3.5 w-3.5 text-neutral-400" />
              <span
                className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ${STATUS_COLORS[instance.status]}`}
              />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-xs font-medium text-neutral-200" title={instance.projectName}>
                  {instance.projectName}
                </span>
                {isWaiting && (
                  <span className="shrink-0 rounded bg-green-500/10 px-1 py-0.5 text-[9px] font-medium text-green-400">
                    INPUT
                  </span>
                )}
                {queuedIds.has(instance.id) && (
                  <span className="shrink-0 rounded bg-amber-500/15 px-1 py-0.5 text-[9px] font-medium text-amber-400">
                    Q{queuedArray.indexOf(instance.id) + 1}
                  </span>
                )}
              </div>
              <span className="text-[12px] text-neutral-500">
                {STATUS_LABELS[instance.status]}
              </span>
              {instance.taskDescription && (
                <span className="block truncate text-[12px] text-neutral-500 italic" title={instance.taskDescription}>
                  {instance.taskDescription}
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
                className="shrink-0 rounded p-1 text-neutral-500 opacity-0 transition-all hover:bg-neutral-700 hover:text-red-400 group-hover:opacity-100"
                title="Kill instance"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </button>
        );
      })}

      {exitedInstances.length > 0 && (
        <>
          {filtered.length > 0 && <div className="mx-1 my-1 border-t border-neutral-800" />}
          {exitedInstances.map(instance => {
            const isSelected = instance.id === selectedId;
            return (
              <button
                key={instance.id}
                onClick={() => onSelect(instance.id)}
                className={`group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                  isSelected
                    ? 'bg-neutral-800 ring-1 ring-neutral-700'
                    : 'hover:bg-neutral-800/50'
                }`}
              >
                <div className="relative shrink-0">
                  <Terminal className="h-3.5 w-3.5 text-neutral-400" />
                  <span
                    className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ${STATUS_COLORS[instance.status]}`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-medium text-neutral-200" title={instance.projectName}>
                      {instance.projectName}
                    </span>
                  </div>
                  <span className="text-[12px] text-neutral-500">
                    {STATUS_LABELS[instance.status]}
                  </span>
                </div>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onDismiss(instance.id);
                  }}
                  className="shrink-0 rounded p-1 text-neutral-600 transition-colors hover:bg-neutral-700 hover:text-red-400"
                  title="Remove"
                  aria-label="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </button>
            );
          })}
        </>
      )}

      {confirmKillId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setConfirmKillId(null)}
        >
          <div
            className="mx-4 w-full max-w-xs rounded-lg border border-neutral-700 bg-neutral-900 p-4 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-2 text-red-400">
              <Trash2 className="h-4 w-4" />
              <span className="text-sm font-semibold">Kill instance</span>
            </div>
            <p className="mb-3 text-xs text-neutral-400">
              Kill <span className="font-medium text-neutral-200">{killTarget?.projectName}</span>? The process will be terminated.
            </p>
            {hasWorktree && (
              <label className="mb-3 flex items-center gap-2 text-xs text-neutral-400">
                <input
                  type="checkbox"
                  checked={deleteWorktreeChecked}
                  onChange={e => setDeleteWorktreeChecked(e.target.checked)}
                  className="rounded border-neutral-600 bg-neutral-800"
                />
                Also delete worktree and branch
              </label>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmKillId(null)}
                className="rounded px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
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
    </div>
  );
}
