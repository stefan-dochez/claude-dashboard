import { createContext } from 'react';
import type { Instance, BranchStatus } from '../types';

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
}

const SidebarActionsContext = createContext<SidebarActions | null>(null);

export { SidebarActionsContext };
export type { SidebarActions };
