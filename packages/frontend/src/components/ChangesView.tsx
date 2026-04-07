import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Check, FileText, FilePlus, FileX, FileQuestion, ChevronRight, ChevronDown } from 'lucide-react';
import DiffViewer from './DiffViewer';
import type { GitFileStatus } from '../types';

interface ChangesViewProps {
  projectPath: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof FileText }> = {
  'M': { label: 'Modified', color: 'text-yellow-400', icon: FileText },
  'A': { label: 'Added', color: 'text-green-400', icon: FilePlus },
  'D': { label: 'Deleted', color: 'text-red-400', icon: FileX },
  '??': { label: 'Untracked', color: 'text-neutral-400', icon: FileQuestion },
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
          ? 'bg-neutral-700/50 text-neutral-200'
          : 'text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-300'
      }`}
      title={`${config.label}: ${file.path}`}
    >
      <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${config.color}`} />
      <span className="min-w-0 flex-1 truncate font-mono text-[12px]">
        <span className={config.color}>{fileName}</span>
        {parentPath && (
          <span className="ml-1.5 text-neutral-600">{parentPath}</span>
        )}
      </span>
      <span className="flex-shrink-0 font-mono text-[12px] text-neutral-600">
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

  const trackedFiles = files.filter(f => f.status.trim() !== '??');
  const untrackedFiles = files.filter(f => f.status.trim() === '??');

  const modifications = trackedFiles.filter(f => f.status.includes('M')).length;
  const additions = trackedFiles.filter(f => f.status.includes('A')).length;
  const deletions = trackedFiles.filter(f => f.status.includes('D')).length;

  return (
    <div className="flex h-full">
      {/* File list panel */}
      <div className="flex w-72 flex-shrink-0 flex-col border-r border-neutral-800 bg-[#0f0f0f]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-neutral-300">Changes</span>
            {!loading && (
              <span className="rounded-full bg-neutral-800 px-1.5 py-0.5 text-[12px] text-neutral-400">
                {files.length}
              </span>
            )}
          </div>
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-300"
            title="Refresh"
            aria-label="Refresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Stats */}
        {trackedFiles.length > 0 && (
          <div className="flex gap-3 border-b border-neutral-800 px-3 py-1.5 text-[12px]">
            {modifications > 0 && <span className="text-yellow-400">{modifications} modified</span>}
            {additions > 0 && <span className="text-green-400">{additions} added</span>}
            {deletions > 0 && <span className="text-red-400">{deletions} deleted</span>}
          </div>
        )}

        {/* Show all button */}
        {files.length > 0 && (
          <button
            onClick={handleShowAll}
            className={`mx-2 mt-2 rounded px-2 py-1 text-left text-xs transition-colors ${
              showAll
                ? 'bg-neutral-700/50 text-neutral-200'
                : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-300'
            }`}
          >
            All changes
          </button>
        )}

        {/* Scrollable file lists */}
        <div className="flex-1 overflow-auto pb-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-4 w-4 animate-spin text-neutral-600" />
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Check className="mb-2 h-5 w-5 text-green-500/50" />
              <span className="text-xs text-neutral-500">No changes</span>
            </div>
          ) : (
            <>
              {/* Tracked changes section */}
              {trackedFiles.length > 0 && (
                <div className="px-1 pt-1">
                  <button
                    onClick={() => setChangesCollapsed(!changesCollapsed)}
                    className="flex w-full items-center gap-1 rounded px-1 py-1 text-[12px] font-medium text-neutral-400 hover:text-neutral-300"
                  >
                    {changesCollapsed
                      ? <ChevronRight className="h-3 w-3 flex-shrink-0" />
                      : <ChevronDown className="h-3 w-3 flex-shrink-0" />
                    }
                    <span>Changes</span>
                    <span className="ml-1 text-neutral-600">{trackedFiles.length} files</span>
                  </button>
                  {!changesCollapsed && (
                    <div className="px-1">
                      {trackedFiles.map((file) => (
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

              {/* Unversioned files section */}
              {untrackedFiles.length > 0 && (
                <div className="px-1 pt-2">
                  <button
                    onClick={() => setUntrackedCollapsed(!untrackedCollapsed)}
                    className="flex w-full items-center gap-1 rounded px-1 py-1 text-[12px] font-medium text-neutral-400 hover:text-neutral-300"
                  >
                    {untrackedCollapsed
                      ? <ChevronRight className="h-3 w-3 flex-shrink-0" />
                      : <ChevronDown className="h-3 w-3 flex-shrink-0" />
                    }
                    <span>Unversioned Files</span>
                    <span className="ml-1 text-neutral-600">{untrackedFiles.length} files</span>
                  </button>
                  {!untrackedCollapsed && (
                    <div className="px-1">
                      {untrackedFiles.map((file) => (
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
            </>
          )}
        </div>
      </div>

      {/* Diff panel */}
      <div className="flex-1 overflow-hidden">
        {diffLoading ? (
          <div className="flex h-full items-center justify-center">
            <RefreshCw className="h-5 w-5 animate-spin text-neutral-600" />
          </div>
        ) : diff ? (
          <DiffViewer diff={diff} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-neutral-500">
            {files.length > 0 ? 'Select a file to view its diff' : 'No changes in working directory'}
          </div>
        )}
      </div>
    </div>
  );
}
