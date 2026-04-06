import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Terminal, FileCode2, GitPullRequest } from 'lucide-react';
import Sidebar from './components/Sidebar';
import TerminalView from './components/TerminalView';
import ChangesView from './components/ChangesView';
import PullRequestView from './components/PullRequestView';
import AttentionQueueBanner from './components/AttentionQueueBanner';
import ContextBanner from './components/ContextBanner';
import ScanPathsModal from './components/ScanPathsModal';
import ToastContainer from './components/ToastContainer';
import { useProjects } from './hooks/useProjects';
import { useInstances } from './hooks/useInstances';
import { useConfig } from './hooks/useConfig';
import { useAttentionQueue } from './hooks/useAttentionQueue';
import { useSocketStatus } from './hooks/useSocket';
import { useToasts } from './hooks/useToasts';

export default function App() {
  const socketConnected = useSocketStatus();
  const { config, updateConfig } = useConfig();
  const { projects, loading: projectsLoading, refreshing: projectsRefreshing, refreshProjects, deleteWorktree } = useProjects();
  const { instances, spawnInstance, killInstance } = useInstances();
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'terminal' | 'changes' | 'pr'>('terminal');
  const [typingLocked, setTypingLocked] = useState(false);
  const { toasts, addToast, removeToast } = useToasts();
  const [scanPathsOpen, setScanPathsOpen] = useState(false);
  const autoOpenedRef = useRef(false);

  const handleSelectInstance = useCallback((id: string | null) => {
    setSelectedInstanceId(id);
    setActiveTab('terminal');
  }, []);

  const { queue, skipInstance, jumpToInstance } = useAttentionQueue({
    instances,
    selectedInstanceId,
    onSelectInstance: handleSelectInstance,
    typingLocked,
  });

  const queuedIds = useMemo(
    () => new Set(queue.map(q => q.instanceId)),
    [queue],
  );

  const handleLaunch = useCallback(async (projectPath: string, taskDescription?: string, detachBranch?: boolean, branchPrefix?: string) => {
    try {
      const instance = await spawnInstance(projectPath, taskDescription, detachBranch, branchPrefix);
      handleSelectInstance(instance.id);
      if (taskDescription || detachBranch) {
        // A worktree was created — refresh project list to show it
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

  const handleDeleteWorktree = useCallback(async (projectPath: string, worktreePath: string) => {
    await deleteWorktree(projectPath, worktreePath);
  }, [deleteWorktree]);

  const handleSkip = useCallback((id: string) => {
    setTypingLocked(false);
    skipInstance(id);
  }, [skipInstance]);

  const handleJump = useCallback((id: string) => {
    setTypingLocked(false);
    jumpToInstance(id);
  }, [jumpToInstance]);

  const handleTypingChange = useCallback((typing: boolean) => {
    setTypingLocked(typing);
  }, []);

  const handleSaveScanPaths = useCallback(async (paths: string[], metaProjects: string[]) => {
    try {
      await updateConfig({ scanPaths: paths, metaProjects });
      refreshProjects();
      setScanPathsOpen(false);
    } catch {
      // Error already logged in hook
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

  const [pullingProjects, setPullingProjects] = useState<Set<string>>(new Set());
  const [pullingAll, setPullingAll] = useState(false);

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
        addToast(
          result.message === 'Already up to date' ? 'info' : 'success',
          `${name}`,
          result.message,
        );
      } else {
        addToast('error', `${name} — pull failed`, result.message);
      }
    } catch (err) {
      addToast('error', `${name} — pull failed`, err instanceof Error ? err.message : 'Network error');
    } finally {
      setPullingProjects(prev => {
        const next = new Set(prev);
        next.delete(projectPath);
        return next;
      });
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
        if (updated.length > 0) {
          addToast('error', `${updated.length} updated, ${failed.length} failed`, detail, 8000);
        } else {
          addToast('error', `${failed.length} repo${failed.length > 1 ? 's' : ''} failed to update`, detail, 8000);
        }
      }
    } catch (err) {
      addToast('error', 'Pull all failed', err instanceof Error ? err.message : 'Network error');
    } finally {
      setPullingAll(false);
      refreshProjects();
    }
  }, [refreshProjects, addToast]);

  const selectedInstance = instances.find(i => i.id === selectedInstanceId);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (!selectedInstance) return;

      // Ctrl/Cmd + 1/2/3 for tabs
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        if (e.key === '1') { e.preventDefault(); setActiveTab('terminal'); }
        if (e.key === '2') { e.preventDefault(); setActiveTab('changes'); }
        if (e.key === '3') { e.preventDefault(); setActiveTab('pr'); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedInstance]);

  return (
    <div className="flex h-screen bg-[#0a0a0a]">
      <Sidebar
        projects={projects}
        projectsLoading={projectsLoading}
        projectsRefreshing={projectsRefreshing}
        instances={instances}
        selectedInstanceId={selectedInstanceId}
        scanPaths={config?.scanPaths ?? []}
        favoriteProjects={favoriteProjects}
        pullingProjects={pullingProjects}
        pullingAll={pullingAll}
        queuedIds={queuedIds}
        onRefreshProjects={refreshProjects}
        onLaunchProject={handleLaunch}
        onSelectInstance={handleSelectInstance}
        onKillInstance={handleKill}
        onDeleteWorktree={handleDeleteWorktree}
        onToggleFavorite={handleToggleFavorite}
        onPullProject={handlePullProject}
        onPullAll={handlePullAll}
        onOpenScanPaths={() => setScanPathsOpen(true)}
      />

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <div className="flex items-center justify-between border-b border-neutral-800 bg-[#0f0f0f] px-4 py-2">
          <div className="flex items-center gap-4">
            {/* Instance info */}
            <div className="flex items-center gap-2">
              {selectedInstance ? (
                <>
                  <span className="text-sm font-medium text-neutral-200">
                    {selectedInstance.projectName}
                  </span>
                  <span className="text-xs text-neutral-500">
                    {selectedInstance.id.slice(0, 8)}
                  </span>
                </>
              ) : (
                <span className="text-sm text-neutral-500">No instance selected</span>
              )}
            </div>

            {/* Tabs */}
            {selectedInstance && (
              <div className="flex items-center gap-1">
                {([
                  { key: 'terminal' as const, label: 'Terminal', Icon: Terminal },
                  { key: 'changes' as const, label: 'Changes', Icon: FileCode2 },
                  { key: 'pr' as const, label: 'Pull Request', Icon: GitPullRequest },
                ]).map(({ key, label, Icon }, index) => (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors ${
                      activeTab === key
                        ? 'bg-neutral-700/50 text-neutral-200'
                        : 'text-neutral-500 hover:bg-neutral-800 hover:text-neutral-400'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                    <span className="ml-1 hidden text-[9px] text-neutral-600 lg:inline">⌘{index + 1}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            {typingLocked && (
              <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] font-medium text-violet-400" title="Queue auto-select paused while you type">
                typing
              </span>
            )}
            {queue.length > 0 && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-400">
                {queue.length} queued
              </span>
            )}
            <span>{instances.filter(i => i.status !== 'exited').length} active</span>
            <span className={`h-2 w-2 rounded-full ${socketConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} title={socketConnected ? 'Connected' : 'Disconnected'} />
          </div>
        </div>

        <AttentionQueueBanner
          queue={queue}
          selectedInstanceId={selectedInstanceId}
          onSkip={handleSkip}
          onJump={handleJump}
        />

        {selectedInstance && (
          <ContextBanner
            taskDescription={selectedInstance.taskDescription}
            branchName={selectedInstance.branchName}
            lastUserPrompt={selectedInstance.lastUserPrompt}
          />
        )}

        {/* Content area */}
        <div className="flex-1 overflow-hidden">
          {selectedInstance ? (
            <>
              {activeTab === 'terminal' && (
                selectedInstance.status !== 'exited' ? (
                  <TerminalView
                    key={selectedInstance.id}
                    instanceId={selectedInstance.id}
                    onTypingChange={handleTypingChange}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-center">
                      <Terminal className="mx-auto mb-4 h-12 w-12 text-neutral-700" />
                      <p className="text-sm text-neutral-500">Instance has exited</p>
                    </div>
                  </div>
                )
              )}
              {activeTab === 'changes' && (
                <ChangesView
                  key={`changes-${selectedInstance.id}`}
                  projectPath={selectedInstance.worktreePath ?? selectedInstance.projectPath}
                />
              )}
              {activeTab === 'pr' && (
                <PullRequestView
                  key={`pr-${selectedInstance.id}`}
                  projectPath={selectedInstance.worktreePath ?? selectedInstance.projectPath}
                  branchName={selectedInstance.branchName}
                />
              )}
            </>
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <Terminal className="mx-auto mb-4 h-12 w-12 text-neutral-700" />
                <p className="text-sm text-neutral-500">
                  Select an instance or launch a project
                </p>
                <p className="mt-1 text-xs text-neutral-600">
                  Choose a project from the sidebar to get started
                </p>
              </div>
            </div>
          )}
        </div>
      </main>

      {scanPathsOpen && (
        <ScanPathsModal
          scanPaths={config?.scanPaths ?? []}
          metaProjects={config?.metaProjects ?? []}
          onSave={handleSaveScanPaths}
          onClose={() => setScanPathsOpen(false)}
        />
      )}

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
