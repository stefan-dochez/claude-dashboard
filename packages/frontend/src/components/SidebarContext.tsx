import { createContext } from 'react';
import type { Instance } from '../types';

interface SidebarActions {
  onSelectInstance: (id: string) => void;
  onKillInstance: (id: string, deleteWorktree?: boolean) => void;
  onDismissInstance: (id: string) => void;
  onLaunch: (projectPath: string, taskDescription?: string, detachBranch?: boolean, branchPrefix?: string, mode?: 'terminal' | 'chat') => void;
  onDeleteWorktree: (projectPath: string, worktreePath: string) => void;
  onToggleFavorite: (projectPath: string) => void;
  onToggleMeta: (projectPath: string) => void;
  onRefreshProjects: () => void;
  selectedInstanceId: string | null;
  favoriteProjects: Set<string>;
  instancesByProject: Map<string, Instance[]>;
}

const SidebarActionsContext = createContext<SidebarActions | null>(null);

export { SidebarActionsContext };
export type { SidebarActions };
