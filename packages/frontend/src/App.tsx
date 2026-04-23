import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  Terminal, MessageSquare, GitBranch, PanelLeft, Loader2,
  FileCode2, GitPullRequest, FolderOpen, Info, Sun, Moon, Download,
  Columns2, Maximize2, Radio, Package, X,
} from 'lucide-react';
import Sidebar from './components/Sidebar';
import ContextPanel from './components/ContextPanel';
import FileExplorer from './components/FileExplorer';
import TerminalView from './components/TerminalView';
import SplitTerminalView from './components/SplitTerminalView';
import ChatView from './components/ChatView';
import ChangesView from './components/ChangesView';
import PullRequestView from './components/PullRequestView';
import AggregatedPrView from './components/AggregatedPrView';
import HealthBanner from './components/HealthBanner';
import UpdateBanner from './components/UpdateBanner';
import FileViewer from './components/FileViewer';
import ResizeHandle from './components/ResizeHandle';
import SearchEverywhere from './components/SearchEverywhere';
import CommandPalette from './components/CommandPalette';
import ScanPathsModal from './components/ScanPathsModal';
import PromptTemplatesModal from './components/PromptTemplatesModal';
import PluginsModal from './components/PluginsModal';
import CostDashboard from './components/CostDashboard';
import ToastContainer from './components/ToastContainer';
import StashConfirmModal from './components/StashConfirmModal';
import WhatsNewModal, { type ChangelogEntry } from './components/WhatsNewModal';
import { useProjects } from './hooks/useProjects';
import { useInstances } from './hooks/useInstances';
import { useConfig } from './hooks/useConfig';
import { useAttentionQueue } from './hooks/useAttentionQueue';
import { useSocket, useSocketStatus } from './hooks/useSocket';
import { useToasts } from './hooks/useToasts';
import { useCommands } from './hooks/useCommands';
import { usePromptTemplates } from './hooks/usePromptTemplates';
import { useNotifications } from './hooks/useNotifications';
import { useIde } from './hooks/useIde';
import type { TerminalThemeId } from './terminal-themes';

// --------------- Status Icon ---------------

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'processing':
      return <Loader2 className="h-3 w-3 animate-spin text-blue-400" />;
    case 'waiting_input':
      return <div className="h-2 w-2 rounded-full bg-green-500" />;
    case 'idle':
      return <div className="h-2 w-2 rounded-full bg-muted" />;
    case 'launching':
      return <Loader2 className="h-3 w-3 animate-spin text-amber-400" />;
    case 'exited':
      return <div className="h-2 w-2 rounded-full bg-faint" />;
    default:
      return null;
  }
}

// --------------- App ---------------

export default function App() {
  const socket = useSocket();
  const socketConnected = useSocketStatus();
  const { config, updateConfig } = useConfig();
  const { projects, loading: projectsLoading, refreshing: projectsRefreshing, refreshProjects, deleteWorktree } = useProjects();
  const { instances, spawnInstance, killInstance, dismissInstance, refetch: refetchInstances } = useInstances();
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(() => {
    return localStorage.getItem('dashboard:selectedInstanceId');
  });
  const [typingLocked, setTypingLocked] = useState(false);
  const { toasts, addToast, removeToast } = useToasts();
  const { installedIdes, openInIde } = useIde();
  const [scanPathsOpen, setScanPathsOpen] = useState(false);
  const [searchEverywhere, setSearchEverywhere] = useState<{ tab: 'all' | 'files' | 'text' } | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [templatesModalOpen, setTemplatesModalOpen] = useState(false);
  const [pluginsModalOpen, setPluginsModalOpen] = useState(false);
  const [pendingTemplateContent, setPendingTemplateContent] = useState<string | null>(null);
  const [costDashboardOpen, setCostDashboardOpen] = useState(false);
  const [prViewProject, setPrViewProject] = useState<{ path: string; name: string } | null>(null);
  const [whatsNew, setWhatsNew] = useState<{ currentVersion: string; previousVersion: string | null; entries: ChangelogEntry[] } | null>(null);
  const autoOpenedRef = useRef(false);
  const selectedInstanceIdRef = useRef(selectedInstanceId);
  selectedInstanceIdRef.current = selectedInstanceId;

  // Theme
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('dashboard:theme') as 'dark' | 'light') ?? 'dark';
  });
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.className = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0d0d0d' : '#f5f5f5');
    localStorage.setItem('dashboard:theme', theme);
  }, [theme]);
  const toggleTheme = useCallback(() => setTheme(prev => prev === 'dark' ? 'light' : 'dark'), []);

  // "What's new" modal — show once after an app version bump. Compares the
  // current backend version against localStorage and fetches the changelog
  // delta. Skipped in dev (would fire on every bump).
  useEffect(() => {
    if (import.meta.env.DEV) return;
    const LAST_SEEN_KEY = 'dashboard:last-seen-version';
    let cancelled = false;
    (async () => {
      try {
        const versionRes = await fetch('/api/version');
        if (!versionRes.ok) return;
        const { version } = await versionRes.json() as { version: string };
        if (cancelled || !version) return;
        const lastSeen = localStorage.getItem(LAST_SEEN_KEY);
        if (lastSeen === version) return;
        if (lastSeen === null) {
          // First launch — just record the version without showing the modal.
          localStorage.setItem(LAST_SEEN_KEY, version);
          return;
        }
        const res = await fetch(`/api/changelog?since=${encodeURIComponent(lastSeen)}`);
        if (!res.ok) return;
        const { entries } = await res.json() as { currentVersion: string; entries: ChangelogEntry[] };
        if (cancelled) return;
        if (entries.length === 0) {
          // No changelog delta — silently ack the version bump.
          localStorage.setItem(LAST_SEEN_KEY, version);
          return;
        }
        setWhatsNew({ currentVersion: version, previousVersion: lastSeen, entries });
      } catch {
        // Silent: don't spam user if the backend is briefly unavailable.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleDismissWhatsNew = useCallback(() => {
    if (whatsNew) {
      localStorage.setItem('dashboard:last-seen-version', whatsNew.currentVersion);
    }
    setWhatsNew(null);
  }, [whatsNew]);

  // Panel visibility & resizable widths
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [rightPanel, setRightPanel] = useState<'files' | 'context' | null>(null);
  const [rightPanelWidth, setRightPanelWidth] = useState(280);
  const [workspacePanelWidth, setWorkspacePanelWidth] = useState(() => {
    const stored = localStorage.getItem('dashboard:workspacePanelWidth');
    const parsed = stored ? parseInt(stored, 10) : NaN;
    return Number.isFinite(parsed) ? Math.max(320, Math.min(900, parsed)) : 540;
  });

  // Center tabs — restore last selected instance + tab from localStorage
  const [activeTab, setActiveTab] = useState<'main' | 'changes' | 'pr' | 'file'>(() => {
    return (localStorage.getItem('dashboard:activeTab') as 'main' | 'changes' | 'pr' | 'file') ?? 'main';
  });
  const [openFiles, setOpenFiles] = useState<{ path: string; highlightLine?: number }[]>(() => {
    try {
      const raw = localStorage.getItem('dashboard:openFiles');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((e): e is { path: string; highlightLine?: number } =>
        e && typeof e.path === 'string'
      );
    } catch {
      return [];
    }
  });
  const [activeFilePath, setActiveFilePath] = useState<string | null>(() => {
    return localStorage.getItem('dashboard:activeFilePath');
  });

  // Split terminal mode
  const [splitInstanceIds, setSplitInstanceIds] = useState<string[]>([]);
  const isSplitMode = splitInstanceIds.length >= 1;

  const enterSplitMode = useCallback((firstId: string) => {
    setSplitInstanceIds([firstId]);
  }, []);

  const addToSplit = useCallback((id: string) => {
    setSplitInstanceIds(prev => prev.length < 4 && !prev.includes(id) ? [...prev, id] : prev);
  }, []);

  const removeFromSplit = useCallback((id: string) => {
    setSplitInstanceIds(prev => {
      const next = prev.filter(x => x !== id);
      return next;
    });
  }, []);

  const exitSplitMode = useCallback(() => {
    setSplitInstanceIds([]);
    setBroadcastEnabled(false);
  }, []);

  const [broadcastEnabled, setBroadcastEnabled] = useState(false);

  // Clean up split when instances exit or are killed
  useEffect(() => {
    if (splitInstanceIds.length === 0) return;
    const aliveIds = instances.filter(i => i.status !== 'exited').map(i => i.id);
    const filtered = splitInstanceIds.filter(id => aliveIds.includes(id));
    if (filtered.length !== splitInstanceIds.length) {
      setSplitInstanceIds(filtered);
    }
  }, [instances, splitInstanceIds]);

  // Code selection for chat context
  const [codeSelection, setCodeSelection] = useState<{ filePath: string; startLine: number; endLine: number; code: string } | null>(null);

  const handleSelectInstance = useCallback((id: string | null) => {
    setSelectedInstanceId(prev => {
      // Only reset tab when switching to a different instance
      if (prev !== id) {
        setActiveTab('main');
        setOpenFiles([]);
        setActiveFilePath(null);
      }
      return id;
    });
    if (id) setPrViewProject(null);
  }, []);

  const handleOpenFile = useCallback((filePath: string, line?: number) => {
    setOpenFiles(prev => {
      const idx = prev.findIndex(f => f.path === filePath);
      if (idx >= 0) {
        if (prev[idx].highlightLine === line) return prev;
        return prev.map((f, i) => i === idx ? { ...f, highlightLine: line } : f);
      }
      return [...prev, { path: filePath, highlightLine: line }];
    });
    setActiveFilePath(filePath);
    setActiveTab('file');
  }, []);

  const handleCloseFile = useCallback((filePath: string) => {
    const idx = openFiles.findIndex(f => f.path === filePath);
    if (idx < 0) return;
    const next = openFiles.filter(f => f.path !== filePath);
    setOpenFiles(next);
    if (activeFilePath === filePath) {
      if (next.length === 0) {
        setActiveFilePath(null);
        setActiveTab('main');
      } else {
        setActiveFilePath(next[Math.min(idx, next.length - 1)].path);
      }
    }
  }, [openFiles, activeFilePath]);

  const handleSendToChat = useCallback((filePath: string, startLine: number, endLine: number, code: string) => {
    setCodeSelection({ filePath, startLine, endLine, code });
  }, []);

  const { queue, skipInstance: _skipInstance, jumpToInstance: _jumpToInstance } = useAttentionQueue({
    instances,
    selectedInstanceId,
    onSelectInstance: handleSelectInstance,
    typingLocked,
  });

  const queuedIds = useMemo(
    () => new Set(queue.map(q => q.instanceId)),
    [queue],
  );

  const handleLaunch = useCallback(async (projectPath: string, taskDescription?: string, detachBranch?: boolean, branchPrefix?: string, mode?: 'terminal' | 'chat', sessionId?: string, startPoint?: string) => {
    try {
      const instance = await spawnInstance(projectPath, taskDescription, detachBranch, branchPrefix, mode, sessionId, startPoint);
      handleSelectInstance(instance.id);
      if (taskDescription || detachBranch) {
        refreshProjects();
      }
    } catch (err) {
      const title = detachBranch
        ? 'Failed to detach branch to worktree'
        : taskDescription
          ? 'Failed to create worktree'
          : 'Failed to launch';
      addToast('error', title, err instanceof Error ? err.message : 'Unknown error', 10000);
    }
  }, [spawnInstance, refreshProjects, handleSelectInstance, addToast]);

  const handleKill = useCallback(async (id: string, deleteWt?: boolean) => {
    await killInstance(id, deleteWt);
    if (selectedInstanceId === id) {
      handleSelectInstance(null);
    }
    if (deleteWt) {
      refreshProjects();
    }
  }, [killInstance, selectedInstanceId, refreshProjects, handleSelectInstance]);

  const handleKillRef = useRef(handleKill);
  handleKillRef.current = handleKill;

  const [pendingDelete, setPendingDelete] = useState<{ projectPath: string; worktreePath: string; name: string; timeoutId: ReturnType<typeof setTimeout> } | null>(null);
  const pendingDeleteRef = useRef<{ timeoutId: ReturnType<typeof setTimeout> } | null>(null);

  const handleUndoDelete = useCallback(() => {
    if (pendingDeleteRef.current) {
      clearTimeout(pendingDeleteRef.current.timeoutId);
      pendingDeleteRef.current = null;
    }
    setPendingDelete(null);
  }, []);

  const handleDeleteWorktree = useCallback((projectPath: string, worktreePath: string) => {
    if (pendingDeleteRef.current) {
      clearTimeout(pendingDeleteRef.current.timeoutId);
    }
    const name = worktreePath.split('/').pop() ?? worktreePath;
    const timeoutId = setTimeout(async () => {
      await deleteWorktree(projectPath, worktreePath);
      refetchInstances();
      pendingDeleteRef.current = null;
      setPendingDelete(null);
    }, 5000);
    pendingDeleteRef.current = { timeoutId };
    setPendingDelete({ projectPath, worktreePath, name, timeoutId });
  }, [deleteWorktree, refetchInstances]);

  const handleTypingChange = useCallback((typing: boolean) => {
    setTypingLocked(typing);
  }, []);

  const handleSaveScanPaths = useCallback(async (paths: string[], metaProjects: string[]) => {
    try {
      await updateConfig({ scanPaths: paths, metaProjects });
      refreshProjects();
      setScanPathsOpen(false);
    } catch {
      // Error already logged
    }
  }, [updateConfig, refreshProjects]);

  useEffect(() => {
    if (!projectsLoading && projects.length === 0 && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      setScanPathsOpen(true);
    }
  }, [projectsLoading, projects.length]);

  const favoriteProjects = useMemo(() => new Set(config?.favoriteProjects ?? []), [config?.favoriteProjects]);

  const handleToggleFavorite = useCallback(async (projectPath: string) => {
    const current = config?.favoriteProjects ?? [];
    const next = current.includes(projectPath)
      ? current.filter(p => p !== projectPath)
      : [...current, projectPath];
    await updateConfig({ favoriteProjects: next });
  }, [config?.favoriteProjects, updateConfig]);

  const handleToggleMeta = useCallback(async (projectPath: string) => {
    const current = config?.metaProjects ?? [];
    const next = current.includes(projectPath)
      ? current.filter(p => p !== projectPath)
      : [...current, projectPath];
    await updateConfig({ metaProjects: next });
    refreshProjects();
  }, [config?.metaProjects, updateConfig, refreshProjects]);

  const [pullingProjects, setPullingProjects] = useState<Set<string>>(new Set());
  const [pullingAll, setPullingAll] = useState(false);
  const [checkingOutProjects, setCheckingOutProjects] = useState<Set<string>>(new Set());
  const [stashConfirm, setStashConfirm] = useState<{ projectPath: string; projectName: string; currentBranch: string } | null>(null);

  const handlePullProject = useCallback(async (projectPath: string) => {
    setPullingProjects(prev => new Set(prev).add(projectPath));
    const name = projectPath.split('/').pop() ?? projectPath;
    try {
      const res = await fetch('/api/git/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath }),
      });
      const result = await res.json();
      if (result.success) {
        addToast(result.message === 'Already up to date' ? 'info' : 'success', name, result.message);
      } else {
        addToast('error', `${name} — pull failed`, result.message);
      }
    } catch (err) {
      addToast('error', `${name} — pull failed`, err instanceof Error ? err.message : 'Network error');
    } finally {
      setPullingProjects(prev => { const next = new Set(prev); next.delete(projectPath); return next; });
      refreshProjects();
    }
  }, [refreshProjects, addToast]);

  const handlePullAll = useCallback(async () => {
    setPullingAll(true);
    try {
      const res = await fetch('/api/git/pull-all', { method: 'POST' });
      const results: Array<{ name: string; success: boolean; message: string }> = await res.json();
      const updated = results.filter(r => r.success && r.message !== 'Already up to date');
      const failed = results.filter(r => !r.success);
      if (failed.length === 0 && updated.length === 0) {
        addToast('info', 'All repos up to date');
      } else if (failed.length === 0) {
        addToast('success', `${updated.length} repo${updated.length > 1 ? 's' : ''} updated`);
      } else {
        const detail = failed.map(r => `${r.name}: ${r.message}`).join('\n');
        addToast('error', `${failed.length} repo${failed.length > 1 ? 's' : ''} failed`, detail, 8000);
      }
    } catch (err) {
      addToast('error', 'Pull all failed', err instanceof Error ? err.message : 'Network error');
    } finally {
      setPullingAll(false);
      refreshProjects();
    }
  }, [refreshProjects, addToast]);

  const handleCheckoutDefault = useCallback(async (projectPath: string, autoStash = false) => {
    setCheckingOutProjects(prev => new Set(prev).add(projectPath));
    const name = projectPath.split(/[\\/]/).pop() ?? projectPath;
    try {
      const res = await fetch('/api/git/checkout-default', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath, autoStash }),
      });
      const result = await res.json();
      if (result.success) {
        addToast(result.message === 'Already on default branch' ? 'info' : 'success', name, result.message);
      } else if (result.needsStash) {
        // Let the user decide — open a confirmation modal, don't toast.
        setStashConfirm({ projectPath, projectName: name, currentBranch: result.branch || '' });
      } else {
        addToast('error', name, result.message);
      }
    } catch (err) {
      addToast('error', name, err instanceof Error ? err.message : 'Network error');
    } finally {
      setCheckingOutProjects(prev => { const next = new Set(prev); next.delete(projectPath); return next; });
      refreshProjects();
    }
  }, [refreshProjects, addToast]);

  const handleOpenInIde = useCallback(async (projectPath: string) => {
    if (installedIdes.length === 0) {
      addToast('error', 'No IDE found', 'No supported IDE detected on your system');
      return;
    }
    const name = projectPath.split('/').pop() ?? projectPath;
    try {
      const result = await openInIde(projectPath);
      const ideName = installedIdes.find(i => i.id === result.ide)?.name ?? result.ide;
      addToast('success', `Opened in ${ideName}`, name);
    } catch (err) {
      addToast('error', 'Failed to open in IDE', err instanceof Error ? err.message : 'Unknown error');
    }
  }, [installedIdes, openInIde, addToast]);

  const handleViewPrs = useCallback((projectPath: string) => {
    const project = projects.find(p => p.path === projectPath);
    setPrViewProject({ path: projectPath, name: project?.name ?? projectPath.split('/').pop() ?? projectPath });
    // Deselect any instance so the main panel shows the PR view
    setSelectedInstanceId(null);
  }, [projects]);

  const selectedInstance = instances.find(i => i.id === selectedInstanceId);

  const instanceProjectPath = selectedInstance
    ? (selectedInstance.worktreePath ?? selectedInstance.projectPath)
    : null;

  // Notifications
  const notificationConfig = useMemo(() => config?.notifications ?? { enabled: true, sound: false }, [config?.notifications]);
  useNotifications(instances, notificationConfig, handleSelectInstance);

  // Prompt templates
  const {
    templates, createTemplate, updateTemplate, deleteTemplate,
    recordUsage: recordTemplateUsage, importTemplates, exportTemplates,
  } = usePromptTemplates(instanceProjectPath);

  // Command palette
  const commands = useCommands({
    instances,
    selectedInstanceId,
    onSelectInstance: handleSelectInstance,
    onKillInstance: handleKill,
    projects,
    favoriteProjects,
    onLaunchProject: handleLaunch,
    sidebarOpen,
    onToggleSidebar: useCallback(() => setSidebarOpen(prev => !prev), []),
    rightPanel,
    onToggleFiles: useCallback(() => setRightPanel(prev => prev === 'files' ? null : 'files'), []),
    onToggleContext: useCallback(() => setRightPanel(prev => prev === 'context' ? null : 'context'), []),
    activeTab,
    onSetTab: setActiveTab,
    selectedInstance,
    onOpenSearchEverywhere: useCallback(() => setSearchEverywhere({ tab: 'all' }), []),
    onOpenCodeSearch: useCallback(() => setSearchEverywhere({ tab: 'text' }), []),
    onOpenScanPaths: useCallback(() => setScanPathsOpen(true), []),
    onOpenTemplates: useCallback(() => setTemplatesModalOpen(true), []),
    onOpenCostDashboard: useCallback(() => setCostDashboardOpen(true), []),
    onOpenPlugins: useCallback(() => setPluginsModalOpen(true), []),
    onToggleNotifications: useCallback(async () => {
      const current = config?.notifications ?? { enabled: true, sound: false };
      await updateConfig({ notifications: { ...current, enabled: !current.enabled } });
    }, [config?.notifications, updateConfig]),
    notificationsEnabled: config?.notifications?.enabled ?? true,
    onToggleTitleGeneration: useCallback(async () => {
      await updateConfig({ generateTitles: !(config?.generateTitles ?? true) });
    }, [config?.generateTitles, updateConfig]),
    titleGenerationEnabled: config?.generateTitles ?? true,
    onRefreshProjects: refreshProjects,
    theme,
    onToggleTheme: toggleTheme,
    terminalTheme: (config?.terminalTheme ?? 'clear-dark') as TerminalThemeId,
    onSetTerminalTheme: useCallback(async (id: TerminalThemeId) => {
      await updateConfig({ terminalTheme: id });
    }, [updateConfig]),
  });

  // Persist tab state to localStorage
  useEffect(() => { localStorage.setItem('dashboard:activeTab', activeTab); }, [activeTab]);
  useEffect(() => {
    localStorage.setItem('dashboard:workspacePanelWidth', String(workspacePanelWidth));
  }, [workspacePanelWidth]);
  useEffect(() => {
    if (openFiles.length) localStorage.setItem('dashboard:openFiles', JSON.stringify(openFiles));
    else localStorage.removeItem('dashboard:openFiles');
  }, [openFiles]);
  useEffect(() => {
    if (activeFilePath) localStorage.setItem('dashboard:activeFilePath', activeFilePath);
    else localStorage.removeItem('dashboard:activeFilePath');
  }, [activeFilePath]);
  useEffect(() => {
    if (selectedInstanceId) localStorage.setItem('dashboard:selectedInstanceId', selectedInstanceId);
    else localStorage.removeItem('dashboard:selectedInstanceId');
  }, [selectedInstanceId]);

  // Validate restored state — clear if instance no longer exists or tab is invalid
  useEffect(() => {
    if (selectedInstanceId && instances.length > 0 && !instances.some(i => i.id === selectedInstanceId)) {
      setSelectedInstanceId(null);
      setActiveTab('main');
      setOpenFiles([]);
      setActiveFilePath(null);
    }
  }, [selectedInstanceId, instances]);
  useEffect(() => {
    if (activeTab === 'file' && !activeFilePath) setActiveTab('main');
  }, [activeTab, activeFilePath]);
  // Keep activeFilePath in sync with openFiles (e.g. stale localStorage restore)
  useEffect(() => {
    if (activeFilePath && !openFiles.some(f => f.path === activeFilePath)) {
      setActiveFilePath(openFiles[0]?.path ?? null);
    }
  }, [activeFilePath, openFiles]);
  // When switching file in the panel, drop any stale selection from the previous
  // file so Claude's IDE-side state reflects "no selection in the new file yet".
  useEffect(() => {
    setCodeSelection(prev => (prev && prev.filePath !== activeFilePath ? null : prev));
  }, [activeFilePath]);

  // Close right panel when no instance is selected
  useEffect(() => {
    if (!selectedInstanceId) setRightPanel(null);
  }, [selectedInstanceId]);

  // Push IDE state (open files, active file, selection) to the backend so the
  // per-instance MCP server can answer Claude's tool calls like getOpenEditors
  // and getCurrentSelection. The selection is only pushed when it belongs to
  // the currently active file — this avoids sending a stale selection from a
  // file the user has already closed or navigated away from.
  useEffect(() => {
    if (!selectedInstanceId) return;
    const selectionForPush = codeSelection && codeSelection.filePath === activeFilePath
      ? { filePath: codeSelection.filePath, startLine: codeSelection.startLine, endLine: codeSelection.endLine, text: codeSelection.code }
      : null;
    socket.emit('ide:state', {
      instanceId: selectedInstanceId,
      openFiles,
      activeFilePath,
      selection: selectionForPush,
    });
  }, [socket, selectedInstanceId, openFiles, activeFilePath, codeSelection]);

  // Receive open-file / close-tab requests that Claude issued via the MCP server
  useEffect(() => {
    const onOpenFile = ({ instanceId, filePath, startLine }: { instanceId: string; filePath: string; startLine?: number }) => {
      if (instanceId !== selectedInstanceId) return;
      handleOpenFile(filePath, startLine);
    };
    const onCloseTab = ({ instanceId, tabName }: { instanceId: string; tabName: string }) => {
      if (instanceId !== selectedInstanceId) return;
      // Match by full path or basename
      const match = openFiles.find(f => f.path === tabName || f.path.endsWith(`/${tabName}`));
      if (match) handleCloseFile(match.path);
    };
    socket.on('ide:open-file', onOpenFile);
    socket.on('ide:close-tab', onCloseTab);
    return () => {
      socket.off('ide:open-file', onOpenFile);
      socket.off('ide:close-tab', onCloseTab);
    };
  }, [socket, selectedInstanceId, openFiles, handleOpenFile, handleCloseFile]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K — command palette (works even from inputs)
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(prev => !prev);
        return;
      }
      // Cmd+Shift+F — search everywhere, Text tab preselected (works even from inputs)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        setSearchEverywhere(prev => prev ? null : { tab: 'text' });
        return;
      }
      // Cmd+T — search everywhere, All tab (works even from inputs)
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key === 't') {
        e.preventDefault();
        setSearchEverywhere(prev => prev ? null : { tab: 'all' });
        return;
      }
      // Cmd+Shift+T — prompt templates (moved from Cmd+T)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        setTemplatesModalOpen(prev => !prev);
        return;
      }
      // Cmd+Shift+A — cost & analytics
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        setCostDashboardOpen(prev => !prev);
        return;
      }
      // Cmd+W — kill selected instance
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key === 'w') {
        if (selectedInstanceIdRef.current) {
          e.preventDefault();
          handleKillRef.current(selectedInstanceIdRef.current);
        }
        return;
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        if (e.key === 'b') { e.preventDefault(); setSidebarOpen(prev => !prev); }
        if (e.key === 'e' && selectedInstanceIdRef.current) { e.preventDefault(); setRightPanel(prev => prev === 'files' ? null : 'files'); }
        if (e.key === 'i' && selectedInstanceIdRef.current) { e.preventDefault(); setRightPanel(prev => prev === 'context' ? null : 'context'); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex h-screen flex-col bg-root">
      {/* Topbar — extra left padding for macOS traffic lights in Electron */}
      <div
        className="flex h-10 shrink-0 items-center px-4"
        style={{
          WebkitAppRegion: 'drag',
          paddingLeft: navigator.userAgent.includes('Electron') && navigator.platform.startsWith('Mac') ? 80 : undefined,
        } as React.CSSProperties}
      >
        {/* Left: project + branch */}
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-[13px] font-medium text-secondary">
            {selectedInstance ? selectedInstance.projectName : 'Claude Dashboard'}
          </span>
          {selectedInstance?.branchName && (
            <>
              <GitBranch className="h-3 w-3 text-faint" />
              <span className="text-[12px] text-muted">{selectedInstance.branchName}</span>
            </>
          )}
        </div>

        {/* Center: status + task description */}
        {selectedInstance && (
          <>
            <span className="mx-3 text-faint">|</span>
            <StatusIcon status={selectedInstance.status} />
            {selectedInstance.mode === 'chat' && (
              <span className="ml-2 rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-medium text-blue-400">Chat</span>
            )}
            {selectedInstance.taskDescription && (
              <div className="mx-3 min-w-0 flex-1">
                <span className="block truncate text-[12px] text-muted">{selectedInstance.taskDescription}</span>
              </div>
            )}
          </>
        )}

        {/* Right: indicators + sidebar toggle */}
        <div className="ml-auto flex shrink-0 items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {typingLocked && (
            <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] font-medium text-violet-400">typing</span>
          )}
          {(() => {
            const alive = instances.filter(i => i.status !== 'exited');
            if (alive.length === 0) return null;
            const hasProcessing = alive.some(i => i.status === 'processing' || i.status === 'launching');
            const hasWaiting = alive.some(i => i.status === 'waiting_input');
            const dotClass = hasProcessing
              ? 'bg-blue-500 animate-pulse'
              : hasWaiting
                ? 'bg-green-500'
                : 'bg-muted';
            return (
              <span className="flex items-center gap-1.5 text-[11px] text-faint">
                <span className={`h-2 w-2 rounded-full ${dotClass}`} />
                {alive.length} instance{alive.length > 1 ? 's' : ''}
              </span>
            );
          })()}
          <span className={`h-2 w-2 rounded-full ${socketConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
          <button
            onClick={toggleTheme}
            className="rounded p-1 text-faint transition-colors hover:text-secondary"
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={() => setPluginsModalOpen(true)}
            className="rounded p-1 text-faint transition-colors hover:text-secondary"
            title="Plugins"
          >
            <Package className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setSidebarOpen(prev => !prev)}
            className={`rounded p-1 transition-colors hover:text-secondary ${sidebarOpen ? 'text-tertiary' : 'text-faint'}`}
            title="Toggle sidebar (⌘B)"
          >
            <PanelLeft className="h-3.5 w-3.5" />
          </button>
          {selectedInstance && (
            <>
              <button
                onClick={() => setRightPanel(prev => prev === 'files' ? null : 'files')}
                className={`rounded p-1 transition-colors hover:text-secondary ${rightPanel === 'files' ? 'text-tertiary' : 'text-faint'}`}
                title="File explorer (⌘E)"
              >
                <FolderOpen className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setRightPanel(prev => prev === 'context' ? null : 'context')}
                className={`rounded p-1 transition-colors hover:text-secondary ${rightPanel === 'context' ? 'text-tertiary' : 'text-faint'}`}
                title="Context info (⌘I)"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Body — 2-column layout */}
      <div className="flex min-h-0 flex-1 gap-2 px-2 pb-2">
        {/* Left — Sidebar (instances + projects) */}
        <Sidebar
          projects={projects}
          projectsLoading={projectsLoading}
          projectsRefreshing={projectsRefreshing}
          instances={instances}
          selectedInstanceId={selectedInstanceId}
          scanPaths={config?.scanPaths ?? []}
          favoriteProjects={favoriteProjects}
          pullingProjects={pullingProjects}
          checkingOutProjects={checkingOutProjects}
          pullingAll={pullingAll}
          queuedIds={queuedIds}
          onRefreshProjects={refreshProjects}
          onLaunchProject={handleLaunch}
          onSelectInstance={handleSelectInstance}
          onKillInstance={handleKill}
          onDismissInstance={dismissInstance}
          onDeleteWorktree={handleDeleteWorktree}
          onToggleFavorite={handleToggleFavorite}
          onToggleMeta={handleToggleMeta}
          onPullProject={handlePullProject}
          onPullAll={handlePullAll}
          onCheckoutDefault={handleCheckoutDefault}
          onOpenInIde={handleOpenInIde}
          onViewPrs={handleViewPrs}
          installedIdes={installedIdes}
          onOpenScanPaths={() => setScanPathsOpen(true)}
          addToast={addToast}
          collapsed={!sidebarOpen}
          onExpand={() => setSidebarOpen(true)}
          width={sidebarWidth}
        />

        {sidebarOpen && (
          <ResizeHandle
            side="left"
            onResize={delta => setSidebarWidth(w => Math.max(200, Math.min(480, w + delta)))}
          />
        )}

        {/* Center — main content */}
        <main className="flex flex-1 flex-col overflow-hidden rounded-xl bg-surface">
          <UpdateBanner />
          <HealthBanner />
          {/* Panel toggles (only when instance selected). The main chat/terminal is always visible now;
              clicking a toggle opens/closes a side panel beside it. */}
          {selectedInstance && (
            <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border-default px-3">
              <div className="flex items-center gap-1.5 px-1.5 py-1 text-[11px] font-medium text-secondary">
                {selectedInstance.mode === 'chat' ? (
                  <MessageSquare className="h-3 w-3" />
                ) : (
                  <Terminal className="h-3 w-3" />
                )}
                {selectedInstance.mode === 'chat' ? 'Chat' : 'Terminal'}
              </div>
              <div className="mx-1 h-4 w-px bg-border-default" />
              {([
                { key: 'changes' as const, label: 'Changes', Icon: FileCode2 },
                { key: 'pr' as const, label: 'PR', Icon: GitPullRequest },
                ...(openFiles.length > 0 ? [{
                  key: 'file' as const,
                  label: openFiles.length === 1
                    ? (openFiles[0].path.split('/').pop() ?? 'File')
                    : `Files (${openFiles.length})`,
                  Icon: FileCode2,
                }] : []),
              ]).map(({ key, label, Icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(activeTab === key ? 'main' : key)}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    activeTab === key
                      ? 'bg-elevated/50 text-primary'
                      : 'text-muted hover:text-secondary'
                  }`}
                  title={activeTab === key ? 'Close side panel' : `Open ${label} panel`}
                >
                  <Icon className="h-3 w-3" />
                  {label}
                </button>
              ))}
              {/* Right-aligned actions */}
              <div className="ml-auto flex items-center gap-1">
                {selectedInstance.mode === 'terminal' && selectedInstance.status !== 'exited' && (
                  <>
                    {isSplitMode ? (
                      <>
                        <button
                          onClick={exitSplitMode}
                          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-blue-400 transition-colors hover:bg-elevated/50 hover:text-blue-300"
                          title="Exit split view"
                        >
                          <Maximize2 className="h-3 w-3" />
                          Unsplit
                        </button>
                        {splitInstanceIds.length > 1 && (
                          <button
                            onClick={() => setBroadcastEnabled(prev => !prev)}
                            className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] transition-colors ${
                              broadcastEnabled
                                ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                                : 'text-muted hover:bg-elevated/50 hover:text-secondary'
                            }`}
                            title={broadcastEnabled ? 'Disable broadcast — stop sending input to all terminals' : 'Broadcast — send input to all terminals'}
                          >
                            <Radio className="h-3 w-3" />
                            Broadcast
                          </button>
                        )}
                      </>
                    ) : (
                      instances.filter(i => i.mode === 'terminal' && i.status !== 'exited').length > 1 && (
                        <button
                          onClick={() => enterSplitMode(selectedInstance.id)}
                          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-muted transition-colors hover:bg-elevated/50 hover:text-secondary"
                          title="Split view — show multiple terminals"
                        >
                          <Columns2 className="h-3 w-3" />
                          Split
                        </button>
                      )
                    )}
                    <button
                      onClick={() => {
                        const a = document.createElement('a');
                        a.href = `/api/instances/${selectedInstance.id}/export?format=txt`;
                        a.download = '';
                        a.click();
                      }}
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-muted transition-colors hover:bg-elevated/50 hover:text-secondary"
                      title="Export session as text"
                    >
                      <Download className="h-3 w-3" />
                      Export
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Content row: chat/terminal stays visible at all times; Changes / PR / FileViewer
              live in a resizable side panel that pushes the chat instead of replacing it. */}
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              {selectedInstance ? (
                isSplitMode ? (
                  <SplitTerminalView
                    instanceIds={splitInstanceIds}
                    instances={instances}
                    focusedId={selectedInstance.id}
                    broadcastEnabled={broadcastEnabled}
                    terminalTheme={config?.terminalTheme as TerminalThemeId | undefined}
                    onFocus={handleSelectInstance}
                    onRemoveFromSplit={removeFromSplit}
                    onAddToSplit={addToSplit}
                    onTypingChange={handleTypingChange}
                  />
                ) : selectedInstance.status !== 'exited' ? (
                  selectedInstance.mode === 'chat' ? (
                    <ChatView
                      key={selectedInstance.id}
                      instanceId={selectedInstance.id}
                      projectPath={instanceProjectPath!}
                      status={selectedInstance.status}
                      onTypingChange={handleTypingChange}
                      initialModel={selectedInstance.model}
                      initialPermissionMode={null}
                      initialEffort={null}
                      codeSelection={codeSelection}
                      onClearCodeSelection={() => setCodeSelection(null)}
                      templates={templates}
                      onRecordTemplateUsage={recordTemplateUsage}
                      onOpenTemplateManager={() => setTemplatesModalOpen(true)}
                      pendingTemplateContent={pendingTemplateContent}
                      onClearPendingTemplate={() => setPendingTemplateContent(null)}
                    />
                  ) : (
                    <TerminalView
                      key={selectedInstance.id}
                      instanceId={selectedInstance.id}
                      terminalTheme={config?.terminalTheme as TerminalThemeId | undefined}
                      onTypingChange={handleTypingChange}
                    />
                  )
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <div className="max-w-xs text-center">
                      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-elevated">
                        <Terminal className="h-7 w-7 text-faint" />
                      </div>
                      <p className="text-[15px] font-medium text-tertiary">Instance has exited</p>
                    </div>
                  </div>
                )
              ) : prViewProject ? (
                <AggregatedPrView
                  key={prViewProject.path}
                  projectPath={prViewProject.path}
                  projectName={prViewProject.name}
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <div className="max-w-xs text-center">
                    <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-elevated">
                      <MessageSquare className="h-7 w-7 text-faint" />
                    </div>
                    <p className="text-[15px] font-medium text-tertiary">No task selected</p>
                    <p className="mt-2 text-[13px] leading-relaxed text-faint">
                      Select a project from the sidebar to get started
                    </p>
                  </div>
                </div>
              )}
            </div>

            {selectedInstance && activeTab !== 'main' && (
              <>
                <ResizeHandle
                  side="right"
                  onResize={delta => setWorkspacePanelWidth(w => Math.max(320, Math.min(900, w + delta)))}
                />
                <div
                  style={{ width: workspacePanelWidth }}
                  className="flex shrink-0 flex-col overflow-hidden border-l border-border-default"
                >
                  {activeTab === 'file' && activeFilePath && (
                    <div className="flex min-h-0 flex-1 flex-col">
                      {openFiles.length > 1 && (
                        <div className="flex h-8 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border-default bg-surface px-1">
                          {openFiles.map(f => (
                            <button
                              key={f.path}
                              onClick={() => setActiveFilePath(f.path)}
                              className={`group flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-[11px] ${
                                activeFilePath === f.path
                                  ? 'bg-elevated/50 text-primary'
                                  : 'text-muted hover:text-secondary'
                              }`}
                              title={f.path}
                            >
                              <FileCode2 className="h-3 w-3" />
                              <span className="max-w-[160px] truncate">{f.path.split('/').pop()}</span>
                              <span
                                role="button"
                                onClick={e => { e.stopPropagation(); handleCloseFile(f.path); }}
                                onMouseDown={e => e.stopPropagation()}
                                className="rounded p-0.5 text-faint opacity-60 transition-opacity hover:bg-elevated hover:text-secondary group-hover:opacity-100"
                                title="Close file"
                              >
                                <X className="h-3 w-3" />
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      <FileViewer
                        key={activeFilePath}
                        filePath={activeFilePath}
                        highlightLine={openFiles.find(f => f.path === activeFilePath)?.highlightLine}
                        onClose={() => handleCloseFile(activeFilePath)}
                        onSendToChat={selectedInstance.mode === 'chat' ? handleSendToChat : undefined}
                        onSelectionChange={sel => setCodeSelection(
                          sel ? { filePath: sel.filePath, startLine: sel.startLine, endLine: sel.endLine, code: sel.text } : null,
                        )}
                      />
                    </div>
                  )}
                  {activeTab === 'changes' && (
                    <ChangesView
                      key={`changes-${selectedInstance.id}`}
                      projectPath={instanceProjectPath!}
                    />
                  )}
                  {activeTab === 'pr' && (
                    <PullRequestView
                      key={`pr-${selectedInstance.id}`}
                      projectPath={instanceProjectPath!}
                      branchName={selectedInstance.branchName}
                    />
                  )}
                </div>
              </>
            )}
          </div>
        </main>

        {/* Right panel — animated toggle */}
        {selectedInstance && instanceProjectPath && rightPanel && (
          <ResizeHandle
            side="right"
            onResize={delta => setRightPanelWidth(w => Math.max(200, Math.min(500, w + delta)))}
          />
        )}
        {selectedInstance && instanceProjectPath && (
          <div
            style={{
              width: rightPanel ? rightPanelWidth : 0,
              opacity: rightPanel ? 1 : 0,
              transition: rightPanel ? undefined : 'width 200ms ease-in-out, opacity 200ms ease-in-out',
            }}
            className="shrink-0 overflow-hidden"
          >
            {rightPanel === 'files' && (
              <FileExplorer
                key={`files-${selectedInstance.id}`}
                projectPath={instanceProjectPath}
                onOpenFile={handleOpenFile}
              />
            )}
            {rightPanel === 'context' && (
              <ContextPanel
                key={`ctx-${selectedInstance.id}`}
                instanceId={selectedInstance.id}
                onOpenFile={handleOpenFile}
              />
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {commandPaletteOpen && (
        <CommandPalette
          commands={commands}
          onClose={() => setCommandPaletteOpen(false)}
        />
      )}

      {scanPathsOpen && (
        <ScanPathsModal
          scanPaths={config?.scanPaths ?? []}
          metaProjects={config?.metaProjects ?? []}
          onSave={handleSaveScanPaths}
          onClose={() => setScanPathsOpen(false)}
        />
      )}

      {searchEverywhere && instanceProjectPath && (
        <SearchEverywhere
          projectPath={instanceProjectPath}
          initialTab={searchEverywhere.tab}
          onOpenFile={handleOpenFile}
          onClose={() => setSearchEverywhere(null)}
        />
      )}

      {templatesModalOpen && (
        <PromptTemplatesModal
          templates={templates}
          projectPath={instanceProjectPath}
          onClose={() => setTemplatesModalOpen(false)}
          onInsert={(template) => {
            setTemplatesModalOpen(false);
            recordTemplateUsage(template.id);
            setPendingTemplateContent(template.content);
          }}
          onCreate={createTemplate}
          onUpdate={updateTemplate}
          onDelete={deleteTemplate}
          onImport={importTemplates}
          onExport={exportTemplates}
        />
      )}

      {costDashboardOpen && (
        <CostDashboard onClose={() => setCostDashboardOpen(false)} />
      )}

      {pluginsModalOpen && (
        <PluginsModal onClose={() => setPluginsModalOpen(false)} />
      )}

      {whatsNew && (
        <WhatsNewModal
          currentVersion={whatsNew.currentVersion}
          previousVersion={whatsNew.previousVersion}
          entries={whatsNew.entries}
          onClose={handleDismissWhatsNew}
        />
      )}

      {pendingDelete && (
        <div className="fixed bottom-16 right-4 z-[100] flex items-center gap-3 rounded-lg border border-border-default bg-surface px-4 py-2.5 shadow-lg">
          <span className="text-xs text-secondary">Worktree <span className="font-medium text-primary">{pendingDelete.name}</span> will be deleted</span>
          <button
            onClick={handleUndoDelete}
            className="rounded bg-elevated px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-hover"
          >
            Undo
          </button>
        </div>
      )}

      {stashConfirm && (
        <StashConfirmModal
          projectName={stashConfirm.projectName}
          currentBranch={stashConfirm.currentBranch}
          onConfirm={() => {
            const { projectPath } = stashConfirm;
            setStashConfirm(null);
            handleCheckoutDefault(projectPath, true);
          }}
          onCancel={() => setStashConfirm(null)}
        />
      )}

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
