import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Check, FileText, FilePlus, FileX, FileQuestion, ChevronRight, ChevronDown, GitCommit, Upload, GitPullRequest, Loader2, ExternalLink } from 'lucide-react';
import DiffViewer from './DiffViewer';
import type { GitFileStatus } from '../types';

interface ChangesViewProps {
  projectPath: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof FileText }> = {
  'M': { label: 'Modified', color: 'text-yellow-400', icon: FileText },
  'A': { label: 'Added', color: 'text-green-400', icon: FilePlus },
  'D': { label: 'Deleted', color: 'text-red-400', icon: FileX },
  '??': { label: 'Untracked', color: 'text-tertiary', icon: FileQuestion },
  'R': { label: 'Renamed', color: 'text-blue-400', icon: ChevronRight },
  'C': { label: 'Copied', color: 'text-blue-400', icon: FilePlus },
};

function getStatusConfig(status: string) {
  const trimmed = status.trim();
  return STATUS_CONFIG[trimmed] ?? STATUS_CONFIG[trimmed[0]] ?? STATUS_CONFIG['M'];
}

function getFileName(filePath: string): string {
  return filePath.replace(/\/$/, '').split('/').pop() || filePath;
}

function getParentPath(filePath: string): string {
  const parts = filePath.replace(/\/$/, '').split('/');
  return parts.length > 1 ? parts.slice(0, -1).join('/') : '';
}

interface FileListItemProps {
  file: GitFileStatus;
  isSelected: boolean;
  onClick: () => void;
}

function FileListItem({ file, isSelected, onClick }: FileListItemProps) {
  const config = getStatusConfig(file.status);
  const Icon = config.icon;
  const fileName = getFileName(file.path);
  const parentPath = getParentPath(file.path);

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left transition-colors ${
        isSelected
          ? 'bg-hover/50 text-primary'
          : 'text-tertiary hover:bg-elevated/50 hover:text-secondary'
      }`}
      title={`${config.label}: ${file.path}`}
    >
      <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${config.color}`} />
      <span className="min-w-0 flex-1 truncate font-mono text-[12px]">
        <span className={config.color}>{fileName}</span>
        {parentPath && (
          <span className="ml-1.5 text-faint">{parentPath}</span>
        )}
      </span>
      <span className="flex-shrink-0 font-mono text-[12px] text-faint">
        {file.status.trim() === '??' ? 'U' : file.status.trim()}
      </span>
    </button>
  );
}

export default function ChangesView({ projectPath }: ChangesViewProps) {
  const [files, setFiles] = useState<GitFileStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diff, setDiff] = useState('');
  const [diffLoading, setDiffLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [changesCollapsed, setChangesCollapsed] = useState(false);
  const [untrackedCollapsed, setUntrackedCollapsed] = useState(false);

  // Commit / Push / PR state
  const [commitMessage, setCommitMessage] = useState('');
  const [addAll, setAddAll] = useState(true);
  const [commitLoading, setCommitLoading] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [prFormOpen, setPrFormOpen] = useState(false);
  const [prTitle, setPrTitle] = useState('');
  const [prBody, setPrBody] = useState('');
  const [prLoading, setPrLoading] = useState(false);
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/git/status?path=${encodeURIComponent(projectPath)}`);
      if (!res.ok) throw new Error('Failed to fetch status');
      const data: GitFileStatus[] = await res.json();
      setFiles(data);
    } catch (err) {
      console.error('[ChangesView] Error fetching status:', err);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  const fetchDiff = useCallback(async (filePath?: string) => {
    setDiffLoading(true);
    try {
      const fileParam = filePath ? `&file=${encodeURIComponent(filePath)}` : '';
      const res = await fetch(`/api/git/diff?path=${encodeURIComponent(projectPath)}${fileParam}`);
      if (!res.ok) throw new Error('Failed to fetch diff');
      const data = await res.json();
      setDiff(data.diff);
    } catch (err) {
      console.error('[ChangesView] Error fetching diff:', err);
      setDiff('');
    } finally {
      setDiffLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (!loading && files.length > 0) {
      setShowAll(true);
      fetchDiff();
    }
  }, [loading, files.length, fetchDiff]);

  const handleFileClick = (filePath: string) => {
    setSelectedFile(filePath);
    setShowAll(false);
    fetchDiff(filePath);
  };

  const handleShowAll = () => {
    setSelectedFile(null);
    setShowAll(true);
    fetchDiff();
  };

  const handleCommit = useCallback(async () => {
    if (!commitMessage.trim()) return;
    setCommitLoading(true);
    setActionError(null);
    try {
      const res = await fetch('/api/git/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath, message: commitMessage.trim(), addAll }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCommitMessage('');
      fetchStatus();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Commit failed');
    } finally {
      setCommitLoading(false);
    }
  }, [projectPath, commitMessage, addAll, fetchStatus]);

  const handlePush = useCallback(async (setUpstream = false) => {
    setPushLoading(true);
    setActionError(null);
    try {
      const res = await fetch('/api/git/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath, setUpstream }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.needsUpstream && !setUpstream) {
          // Auto-retry with --set-upstream
          return handlePush(true);
        }
        throw new Error(data.error);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Push failed');
    } finally {
      setPushLoading(false);
    }
  }, [projectPath]);

  const handleCreatePR = useCallback(async () => {
    if (!prTitle.trim()) return;
    setPrLoading(true);
    setActionError(null);
    try {
      const res = await fetch('/api/git/create-pr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath, title: prTitle.trim(), body: prBody.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPrUrl(data.url);
      setPrFormOpen(false);
      setPrTitle('');
      setPrBody('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'PR creation failed');
    } finally {
      setPrLoading(false);
    }
  }, [projectPath, prTitle, prBody]);

  const trackedFiles = files.filter(f => f.status.trim() !== '??');
  const untrackedFiles = files.filter(f => f.status.trim() === '??');

  const modifications = trackedFiles.filter(f => f.status.includes('M')).length;
  const additions = trackedFiles.filter(f => f.status.includes('A')).length;
  const deletions = trackedFiles.filter(f => f.status.includes('D')).length;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border-default px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-secondary">Changes</span>
          {!loading && files.length > 0 && (
            <span className="rounded-full bg-elevated px-1.5 py-0.5 text-[12px] text-tertiary">
              {files.length}
            </span>
          )}
          {trackedFiles.length > 0 && (
            <div className="flex gap-2 text-[11px]">
              {modifications > 0 && <span className="text-yellow-400">~{modifications}</span>}
              {additions > 0 && <span className="text-green-400">+{additions}</span>}
              {deletions > 0 && <span className="text-red-400">-{deletions}</span>}
            </div>
          )}
        </div>
        <button
          onClick={fetchStatus}
          disabled={loading}
          className="rounded p-1 text-muted transition-colors hover:bg-elevated hover:text-secondary"
          title="Refresh"
          aria-label="Refresh"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* File list (collapsible top section) */}
      <div className="shrink-0 overflow-auto border-b border-border-default" style={{ maxHeight: '40%' }}>
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <RefreshCw className="h-4 w-4 animate-spin text-faint" />
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Check className="mb-2 h-5 w-5 text-green-500/50" />
            <span className="text-xs text-muted">No changes</span>
          </div>
        ) : (
          <div className="px-1 py-1">
            {/* Show all button */}
            <button
              onClick={handleShowAll}
              className={`mb-0.5 w-full rounded px-2 py-1 text-left text-xs transition-colors ${
                showAll
                  ? 'bg-hover/50 text-primary'
                  : 'text-tertiary hover:bg-elevated hover:text-secondary'
              }`}
            >
              All changes
            </button>

            {/* Tracked changes */}
            {trackedFiles.length > 0 && (
              <div>
                <button
                  onClick={() => setChangesCollapsed(!changesCollapsed)}
                  className="flex w-full items-center gap-1 rounded px-1 py-1 text-[11px] font-medium text-muted hover:text-secondary"
                >
                  {changesCollapsed
                    ? <ChevronRight className="h-3 w-3 shrink-0" />
                    : <ChevronDown className="h-3 w-3 shrink-0" />
                  }
                  <span>Tracked</span>
                  <span className="ml-1 text-faint">{trackedFiles.length}</span>
                </button>
                {!changesCollapsed && trackedFiles.map(file => (
                  <FileListItem
                    key={file.path}
                    file={file}
                    isSelected={!showAll && selectedFile === file.path}
                    onClick={() => handleFileClick(file.path)}
                  />
                ))}
              </div>
            )}

            {/* Untracked files */}
            {untrackedFiles.length > 0 && (
              <div className="mt-1">
                <button
                  onClick={() => setUntrackedCollapsed(!untrackedCollapsed)}
                  className="flex w-full items-center gap-1 rounded px-1 py-1 text-[11px] font-medium text-muted hover:text-secondary"
                >
                  {untrackedCollapsed
                    ? <ChevronRight className="h-3 w-3 shrink-0" />
                    : <ChevronDown className="h-3 w-3 shrink-0" />
                  }
                  <span>Untracked</span>
                  <span className="ml-1 text-faint">{untrackedFiles.length}</span>
                </button>
                {!untrackedCollapsed && untrackedFiles.map(file => (
                  <FileListItem
                    key={file.path}
                    file={file}
                    isSelected={!showAll && selectedFile === file.path}
                    onClick={() => handleFileClick(file.path)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Commit / Push / PR form */}
      {!loading && files.length > 0 && (
        <div className="shrink-0 border-b border-border-default px-2 py-2 space-y-1.5">
          <textarea
            value={commitMessage}
            onChange={e => { setCommitMessage(e.target.value); setActionError(null); }}
            placeholder="Commit message..."
            rows={2}
            className="w-full resize-none rounded bg-elevated/40 px-2 py-1.5 text-[12px] text-secondary placeholder-placeholder outline-none focus:bg-elevated"
            onKeyDown={e => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                handleCommit();
              }
            }}
          />
          <div className="flex items-center gap-1.5">
            <label className="flex items-center gap-1 text-[11px] text-muted cursor-pointer select-none">
              <input type="checkbox" checked={addAll} onChange={e => setAddAll(e.target.checked)} className="h-3 w-3 accent-green-500" />
              Stage all
            </label>
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={handleCommit}
                disabled={commitLoading || !commitMessage.trim()}
                className="flex items-center gap-1 rounded bg-green-700/40 px-2 py-1 text-[11px] font-medium text-green-300 transition-colors hover:bg-green-700/60 disabled:opacity-40"
              >
                {commitLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitCommit className="h-3 w-3" />}
                Commit
              </button>
              <button
                onClick={() => handlePush()}
                disabled={pushLoading}
                className="flex items-center gap-1 rounded bg-blue-700/40 px-2 py-1 text-[11px] font-medium text-blue-300 transition-colors hover:bg-blue-700/60 disabled:opacity-40"
              >
                {pushLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                Push
              </button>
              <button
                onClick={() => { setPrFormOpen(!prFormOpen); setActionError(null); }}
                disabled={prLoading}
                className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-40 ${
                  prFormOpen ? 'bg-violet-700/40 text-violet-300' : 'bg-elevated text-muted hover:text-secondary'
                }`}
              >
                {prLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitPullRequest className="h-3 w-3" />}
                PR
              </button>
            </div>
          </div>

          {/* PR form (inline) */}
          {prFormOpen && (
            <div className="space-y-1.5 rounded bg-elevated/30 p-2">
              <input
                type="text"
                value={prTitle}
                onChange={e => setPrTitle(e.target.value)}
                placeholder="PR title..."
                className="w-full rounded bg-elevated/60 px-2 py-1 text-[12px] text-secondary placeholder-placeholder outline-none focus:bg-elevated"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreatePR(); } }}
              />
              <textarea
                value={prBody}
                onChange={e => setPrBody(e.target.value)}
                placeholder="Description (optional)..."
                rows={2}
                className="w-full resize-none rounded bg-elevated/60 px-2 py-1 text-[12px] text-secondary placeholder-placeholder outline-none focus:bg-elevated"
              />
              <button
                onClick={handleCreatePR}
                disabled={prLoading || !prTitle.trim()}
                className="flex items-center gap-1 rounded bg-violet-700/40 px-2.5 py-1 text-[11px] font-medium text-violet-300 transition-colors hover:bg-violet-700/60 disabled:opacity-40"
              >
                {prLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitPullRequest className="h-3 w-3" />}
                Create PR
              </button>
            </div>
          )}

          {/* PR URL result */}
          {prUrl && (
            <a
              href={prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-300"
            >
              <ExternalLink className="h-3 w-3" />
              {prUrl}
            </a>
          )}

          {/* Error display */}
          {actionError && (
            <p className="text-[11px] text-red-400">{actionError}</p>
          )}
        </div>
      )}

      {/* Diff panel (takes remaining space) */}
      <div className="min-h-0 flex-1 overflow-auto">
        {diffLoading ? (
          <div className="flex h-full items-center justify-center">
            <RefreshCw className="h-5 w-5 animate-spin text-faint" />
          </div>
        ) : diff ? (
          <DiffViewer diff={diff} />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted">
            {files.length > 0 ? 'Select a file' : 'No changes'}
          </div>
        )}
      </div>
    </div>
  );
}
