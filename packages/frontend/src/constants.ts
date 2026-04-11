import type { InstanceStatus } from './types';

// ---- Status display ----

export const STATUS_DOT: Record<InstanceStatus, string> = {
  launching: 'bg-yellow-500',
  processing: 'bg-blue-500 animate-pulse',
  waiting_input: 'bg-green-500',
  idle: 'bg-muted',
  exited: 'bg-faint',
};

export const STATUS_LABEL: Record<InstanceStatus, string> = {
  launching: 'Launching',
  processing: 'Processing',
  waiting_input: 'Waiting',
  idle: 'Idle',
  exited: 'Exited',
};
