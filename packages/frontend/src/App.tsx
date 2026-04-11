import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  Terminal, MessageSquare, GitBranch, PanelLeft, Loader2,
  FileCode2, GitPullRequest, FolderOpen, Info,
} from 'lucide-react';
import Sidebar from './components/Sidebar';
import ContextPanel from './components/ContextPanel';
import FileExplorer from './components/FileExplorer';
import TerminalView from './components/TerminalView';
import ChatView from './components/ChatView';
import ChangesView from './components/ChangesView';
import PullRequestView from './components/PullRequestView';
import FileViewer from './components/FileViewer';
import ResizeHandle from './components/ResizeHandle';
import CodeSearchModal from './components/CodeSearchModal';
import ScanPathsModal from './components/ScanPathsModal';
import ToastContainer from './components/ToastContainer';
import { useProjects } from './hooks/useProjects';
import { useInstances } from './hooks/useInstances';
import { useConfig } from './hooks/useConfig';
import { useAttentionQueue } from './hooks/useAttentionQueue';
import { useSocketStatus } from './hooks/useSocket';
import { useToasts } from './hooks/useToasts';

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
  const socketConnected = useSocketStatus();
  const { config, updateConfig } = useConfig();
  const { projects, loading: projectsLoading, refreshing: projectsRefreshing, refreshProjects, deleteWorktree } = useProjects();
  const { instances, spawnInstance, killInstance, dismissInstance, refetch: refetchInstances } = useInstances();
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [typingLocked, setTypingLocked] = useState(false);
  const { toasts, addToast, removeToast } = useToasts();
  const [scanPathsOpen, setScanPathsOpen] = useState(false);
  const [codeSearchOpen, setCodeSearchOpen] = useState(false);
  const autoOpenedRef = useRef(false);

  // Panel visibility & resizable widths
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [rightPanel, setRightPanel] = useState<'files' | 'context' | null>(null);
  const [rightPanelWidth, setRightPanelWidth] = useState(280);

  // Center tabs
  const [activeTab, setActiveTab] = useState<'main' | 'changes' | 'pr' | 'file'>('main');
  const [openedFile, setOpenedFile] = useState<string | null>(null);

  // Code selection for chat context
  const [codeSelection, setCodeSelection] = useState<{ filePath: string; startLine: number; endLine: number; code: string } | null>(null);

  const handleSelectInstance = useCallback((id: string | null) => {
    setSelectedInstanceId(prev => {
      // Only reset tab when switching to a different instance
      if (prev !== id) {
        setActiveTab('main');
        setOpenedFile(null);
      }
      return id;
    });
  }, []);

  const handleOpenFile = useCallback((filePath: string) => {
    setOpenedFile(filePath);
    setActiveTab('file');
  }, []);

  const handleSendToChat = useCallback((filePath: string, startLine: number, endLine: number, code: string) => {
    setCodeSelection({ filePath, startLine, endLine, code });
    setActiveTab('main');
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

  const handleLaunch = useCallback(async (projectPath: string, taskDescription?: string, detachBranch?: boolean, branchPrefix?: string, mode?: 'terminal' | 'chat', sessionId?: string) => {
    try {
      const instance = await spawnInstance(projectPath, taskDescription, detachBranch, branchPrefix, mode, sessionId);
      handleSelectInstance(instance.id);
      if (taskDescription || detachBranch) {
        refreshProjects();
      }
    } catch {
      // Error already logged in hook
    }
  }, [spawnInstance, refreshProjects, handleSelectInstance]);

  const handleKill = useCallback(async (id: string, deleteWt?: boolean) => {
    await killInstance(id, deleteWt);
    if (selectedInstanceId === id) {
      handleSelectInstance(null);
    }
    if (deleteWt) {
      refreshProjects();
    }
  }, [killInstance, selectedInstanceId, refreshProjects, handleSelectInstance]);

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

  const handleCheckoutDefault = useCallback(async (projectPath: string) => {
    setCheckingOutProjects(prev => new Set(prev).add(projectPath));
    const name = projectPath.split('/').pop() ?? projectPath;
    try {
      const res = await fetch('/api/git/checkout-default', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath }),
      });
      const result = await res.json();
      if (result.success) {
        addToast(result.message === 'Already on default branch' ? 'info' : 'success', name, result.message);
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

  const selectedInstance = instances.find(i => i.id === selectedInstanceId);

  const instanceProjectPath = selectedInstance
    ? (selectedInstance.worktreePath ?? selectedInstance.projectPath)
    : null;

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+Shift+F — code search (works even from inputs)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        setCodeSearchOpen(prev => !prev);
        return;
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        if (e.key === 'b') { e.preventDefault(); setSidebarOpen(prev => !prev); }
        if (e.key === 'e') { e.preventDefault(); setRightPanel(prev => prev === 'files' ? null : 'files'); }
        if (e.key === 'i') { e.preventDefault(); setRightPanel(prev => prev === 'context' ? null : 'context'); }
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
            onClick={() => setSidebarOpen(prev => !prev)}
            className={`rounded p-1 transition-colors hover:text-secondary ${sidebarOpen ? 'text-tertiary' : 'text-faint'}`}
            title="Toggle sidebar (⌘B)"
          >
            <PanelLeft className="h-3.5 w-3.5" />
          </button>
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
          onOpenScanPaths={() => setScanPathsOpen(true)}
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
          {/* Tabs (only when instance selected) */}
          {selectedInstance && (
            <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border-default px-3">
              {([
                {
                  key: 'main' as const,
                  label: selectedInstance.mode === 'chat' ? 'Chat' : 'Terminal',
                  Icon: selectedInstance.mode === 'chat' ? MessageSquare : Terminal,
                },
                { key: 'changes' as const, label: 'Changes', Icon: FileCode2 },
                { key: 'pr' as const, label: 'PR', Icon: GitPullRequest },
                ...(openedFile ? [{
                  key: 'file' as const,
                  label: openedFile.split('/').pop() ?? 'File',
                  Icon: FileCode2,
                }] : []),
              ]).map(({ key, label, Icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    activeTab === key
                      ? 'bg-elevated/50 text-primary'
                      : 'text-muted hover:text-secondary'
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-hidden">
            {selectedInstance ? (
              activeTab === 'main' ? (
                selectedInstance.status !== 'exited' ? (
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
                    />
                  ) : (
                    <TerminalView
                      key={selectedInstance.id}
                      instanceId={selectedInstance.id}
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
              ) : activeTab === 'file' && openedFile ? (
                <FileViewer
                  key={openedFile}
                  filePath={openedFile}
                  onClose={() => { setOpenedFile(null); setActiveTab('main'); }}
                  onSendToChat={selectedInstance?.mode === 'chat' ? handleSendToChat : undefined}
                />
              ) : activeTab === 'changes' ? (
                <ChangesView
                  key={`changes-${selectedInstance.id}`}
                  projectPath={instanceProjectPath!}
                />
              ) : (
                <PullRequestView
                  key={`pr-${selectedInstance.id}`}
                  projectPath={instanceProjectPath!}
                  branchName={selectedInstance.branchName}
                />
              )
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
      {scanPathsOpen && (
        <ScanPathsModal
          scanPaths={config?.scanPaths ?? []}
          metaProjects={config?.metaProjects ?? []}
          onSave={handleSaveScanPaths}
          onClose={() => setScanPathsOpen(false)}
        />
      )}

      {codeSearchOpen && instanceProjectPath && (
        <CodeSearchModal
          projectPath={instanceProjectPath}
          onOpenFile={handleOpenFile}
          onClose={() => setCodeSearchOpen(false)}
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

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
