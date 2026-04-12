import { useMemo } from 'react';
import {
  PanelLeft, FolderOpen, Info, Terminal, FileCode2,
  GitPullRequest, Search, Settings, Play, XCircle,
  Star, RefreshCw, MessageSquare,
} from 'lucide-react';
import type { Command } from '../components/CommandPalette';
import type { Instance, Project } from '../types';

// Detect platform once — use Cmd symbol on macOS, Ctrl on Windows/Linux
const IS_MAC = navigator.platform.startsWith('Mac') || navigator.platform === 'iPhone';
const MOD = IS_MAC ? '\u2318' : 'Ctrl+';
const SHIFT = IS_MAC ? '\u21e7' : 'Shift+';

interface UseCommandsOptions {
  // Instances
  instances: Instance[];
  selectedInstanceId: string | null;
  onSelectInstance: (id: string | null) => void;
  onKillInstance: (id: string, deleteWt?: boolean) => void;

  // Projects
  projects: Project[];
  favoriteProjects: Set<string>;
  onLaunchProject: (projectPath: string, task?: string, detach?: boolean, prefix?: string, mode?: 'terminal' | 'chat', sessionId?: string) => void;

  // Panels
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  rightPanel: 'files' | 'context' | null;
  onToggleFiles: () => void;
  onToggleContext: () => void;

  // Tabs
  activeTab: string;
  onSetTab: (tab: 'main' | 'changes' | 'pr' | 'file') => void;
  selectedInstance: Instance | undefined;

  // Modals
  onOpenCodeSearch: () => void;
  onOpenScanPaths: () => void;

  // Projects
  onRefreshProjects: () => void;
}

export function useCommands(options: UseCommandsOptions): Command[] {
  const {
    instances,
    selectedInstanceId,
    onSelectInstance,
    onKillInstance,
    projects,
    favoriteProjects,
    onLaunchProject,
    sidebarOpen,
    onToggleSidebar,
    rightPanel,
    onToggleFiles,
    onToggleContext,
    onSetTab,
    selectedInstance,
    onOpenCodeSearch,
    onOpenScanPaths,
    onRefreshProjects,
  } = options;

  return useMemo(() => {
    const commands: Command[] = [];

    // ---- Actions ----

    commands.push({
      id: 'toggle-sidebar',
      label: sidebarOpen ? 'Hide Sidebar' : 'Show Sidebar',
      category: 'action',
      icon: PanelLeft,
      iconColor: 'text-muted',
      shortcut: `${MOD}B`,
      keywords: ['panel', 'sidebar', 'toggle', 'collapse'],
      onExecute: onToggleSidebar,
    });

    commands.push({
      id: 'toggle-files',
      label: rightPanel === 'files' ? 'Hide File Explorer' : 'Show File Explorer',
      category: 'action',
      icon: FolderOpen,
      iconColor: 'text-muted',
      shortcut: `${MOD}E`,
      keywords: ['file', 'explorer', 'tree', 'browse'],
      onExecute: onToggleFiles,
    });

    commands.push({
      id: 'toggle-context',
      label: rightPanel === 'context' ? 'Hide Context Panel' : 'Show Context Panel',
      category: 'action',
      icon: Info,
      iconColor: 'text-muted',
      shortcut: `${MOD}I`,
      keywords: ['context', 'info', 'details', 'claude.md', 'tokens', 'cost'],
      onExecute: onToggleContext,
    });

    commands.push({
      id: 'code-search',
      label: 'Search in Files',
      description: 'Full-text code search',
      category: 'action',
      icon: Search,
      iconColor: 'text-blue-400',
      shortcut: `${MOD}${SHIFT}F`,
      keywords: ['grep', 'find', 'search', 'code'],
      onExecute: onOpenCodeSearch,
    });

    commands.push({
      id: 'scan-paths',
      label: 'Configure Workspaces',
      description: 'Edit scan paths',
      category: 'action',
      icon: Settings,
      iconColor: 'text-muted',
      keywords: ['settings', 'config', 'workspace', 'scan', 'paths'],
      onExecute: onOpenScanPaths,
    });

    commands.push({
      id: 'refresh-projects',
      label: 'Refresh Projects',
      description: 'Rescan all workspaces',
      category: 'action',
      icon: RefreshCw,
      iconColor: 'text-muted',
      keywords: ['reload', 'scan', 'refresh'],
      onExecute: onRefreshProjects,
    });

    // Tab switching (only when an instance is selected)
    if (selectedInstance) {
      const isChat = selectedInstance.mode === 'chat';

      commands.push({
        id: 'tab-main',
        label: isChat ? 'Switch to Chat Tab' : 'Switch to Terminal Tab',
        category: 'action',
        icon: isChat ? MessageSquare : Terminal,
        iconColor: 'text-muted',
        shortcut: `${MOD}1`,
        keywords: ['tab', 'terminal', 'chat', 'main'],
        onExecute: () => onSetTab('main'),
      });

      commands.push({
        id: 'tab-changes',
        label: 'Switch to Changes Tab',
        category: 'action',
        icon: FileCode2,
        iconColor: 'text-muted',
        shortcut: `${MOD}2`,
        keywords: ['tab', 'changes', 'diff', 'git'],
        onExecute: () => onSetTab('changes'),
      });

      commands.push({
        id: 'tab-pr',
        label: 'Switch to Pull Request Tab',
        category: 'action',
        icon: GitPullRequest,
        iconColor: 'text-muted',
        shortcut: `${MOD}3`,
        keywords: ['tab', 'pr', 'pull', 'request', 'review'],
        onExecute: () => onSetTab('pr'),
      });
    }

    // ---- Instances ----

    const aliveInstances = instances.filter(i => i.status !== 'exited');
    for (const inst of aliveInstances) {
      const isCurrent = inst.id === selectedInstanceId;

      if (!isCurrent) {
        commands.push({
          id: `select-${inst.id}`,
          label: `Switch to ${inst.projectName}`,
          description: inst.taskDescription ?? inst.branchName ?? undefined,
          category: 'instance',
          icon: inst.mode === 'chat' ? MessageSquare : Terminal,
          iconColor: inst.status === 'processing' ? 'text-blue-400'
            : inst.status === 'waiting_input' ? 'text-green-400'
              : 'text-muted',
          keywords: [inst.projectName, inst.branchName ?? '', inst.taskDescription ?? '', 'switch', 'select'],
          onExecute: () => onSelectInstance(inst.id),
        });
      }

      commands.push({
        id: `kill-${inst.id}`,
        label: `Kill ${inst.projectName}`,
        description: inst.taskDescription ?? inst.branchName ?? undefined,
        category: 'instance',
        icon: XCircle,
        iconColor: 'text-red-400',
        keywords: [inst.projectName, 'stop', 'kill', 'terminate', 'close'],
        onExecute: () => onKillInstance(inst.id),
      });
    }

    // ---- Projects ----

    // Sort: favorites first, then alphabetical
    const sortedProjects = [...projects]
      .filter(p => !p.isWorktree) // Only show main projects, not worktrees
      .sort((a, b) => {
        const aFav = favoriteProjects.has(a.path) ? 0 : 1;
        const bFav = favoriteProjects.has(b.path) ? 0 : 1;
        if (aFav !== bFav) return aFav - bFav;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 20); // Limit to 20 projects to keep the palette snappy

    for (const project of sortedProjects) {
      const isFav = favoriteProjects.has(project.path);

      commands.push({
        id: `launch-terminal-${project.path}`,
        label: `Launch ${project.name}`,
        description: project.gitBranch ? `on ${project.gitBranch}` : undefined,
        category: 'project',
        icon: isFav ? Star : Play,
        iconColor: isFav ? 'text-amber-400' : 'text-green-400',
        keywords: [project.name, project.gitBranch ?? '', 'launch', 'start', 'terminal', 'open'],
        onExecute: () => onLaunchProject(project.path, undefined, undefined, undefined, 'terminal'),
      });

      commands.push({
        id: `launch-chat-${project.path}`,
        label: `Chat ${project.name}`,
        description: project.gitBranch ? `on ${project.gitBranch}` : undefined,
        category: 'project',
        icon: MessageSquare,
        iconColor: 'text-blue-400',
        keywords: [project.name, 'chat', 'agent', 'sdk'],
        onExecute: () => onLaunchProject(project.path, undefined, undefined, undefined, 'chat'),
      });
    }

    return commands;
  }, [
    instances, selectedInstanceId, onSelectInstance, onKillInstance,
    projects, favoriteProjects, onLaunchProject,
    sidebarOpen, onToggleSidebar, rightPanel, onToggleFiles, onToggleContext,
    onSetTab, selectedInstance,
    onOpenCodeSearch, onOpenScanPaths, onRefreshProjects,
  ]);
}
