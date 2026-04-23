import { createContext } from 'react';
import type { Instance, BranchStatus, HistoryTask } from '../types';
import type { Toast } from '../hooks/useToasts';

interface IdeInfo {
  id: string;
  name: string;
  installed: boolean;
}

interface SidebarActions {
  onSelectInstance: (id: string) => void;
  onKillInstance: (id: string, deleteWorktree?: boolean) => void;
  onDismissInstance: (id: string) => void;
  onLaunch: (projectPath: string, taskDescription?: string, detachBranch?: boolean, branchPrefix?: string, mode?: 'terminal' | 'chat', sessionId?: string, startPoint?: string) => void;
  onDeleteWorktree: (projectPath: string, worktreePath: string) => void;
  onToggleFavorite: (projectPath: string) => void;
  onToggleMeta: (projectPath: string) => void;
  onOpenInIde: (projectPath: string) => void;
  onViewPrs: (projectPath: string) => void;
  installedIdes: IdeInfo[];
  onRefreshProjects: () => void;
  selectedInstanceId: string | null;
  favoriteProjects: Set<string>;
  instancesByProject: Map<string, Instance[]>;
  prCounts: Map<string, number>;
  /** Branch status (CI + PR state) keyed by worktree path or instance path. */
  branchStatuses: Map<string, BranchStatus>;
  /** Completed task history, shared across rows so a worktree can show its prior sessions. */
  history: HistoryTask[];
  /** Resume a session from history (uses worktreePath if still present, replays sessionId). */
  onResumeHistory: (task: HistoryTask) => void;
  /** Show a toast. Used by modals (e.g. LaunchModal) to surface backend errors. */
  addToast: (type: Toast['type'], message: string, detail?: string, duration?: number) => string;
}

const SidebarActionsContext = createContext<SidebarActions | null>(null);

export { SidebarActionsContext };
export type { SidebarActions };
