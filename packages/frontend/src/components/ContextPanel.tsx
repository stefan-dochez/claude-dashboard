import { useState, useEffect, useCallback } from 'react';
import {
  Info, FileText, ChevronRight, ChevronDown,
  GitBranch, Coins, Clock, Cpu, FileEdit, Loader2,
} from 'lucide-react';
import { usePlatform } from '../hooks/usePlatform';

// --------------- Context Panel ---------------

interface ContextPanelProps {
  instanceId: string;
  onOpenFile: (filePath: string) => void;
}

interface InstanceContext {
  claudeMd: string | null;
  modifiedFiles: string[];
  stats: {
    totalCostUsd: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    sessionId: string | null;
    model: string | null;
  } | null;
  projectPath: string;
  worktreePath: string | null;
  branchName: string | null;
}

export default function ContextPanel({ instanceId, onOpenFile }: ContextPanelProps) {
  const [data, setData] = useState<InstanceContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [claudeMdExpanded, setClaudeMdExpanded] = useState(false);
  const { shortenPath } = usePlatform();

  const fetchContext = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/instances/${instanceId}/context`);
      if (res.ok) {
        setData(await res.json());
      }
    } catch (err) {
      console.error('[ContextPanel] Failed to fetch context:', err);
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  useEffect(() => {
    fetchContext();
    const interval = setInterval(fetchContext, 10000);
    return () => clearInterval(interval);
  }, [fetchContext]);

  if (loading && !data) {
    return (
      <aside className="flex h-full w-[280px] shrink-0 items-center justify-center rounded-xl bg-surface">
        <Loader2 className="h-4 w-4 animate-spin text-faint" />
      </aside>
    );
  }

  if (!data) return null;

  const cwd = data.worktreePath ?? data.projectPath;

  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col overflow-hidden rounded-xl bg-surface">
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {/* Branch + path */}
        <div className="mb-3 flex flex-col gap-1">
          {data.branchName && (
            <div className="flex items-center gap-1.5 text-[12px]">
              <GitBranch className="h-3 w-3 text-violet-400" />
              <span className="font-mono text-violet-300">{data.branchName}</span>
            </div>
          )}
          <div className="truncate text-[11px] text-faint" title={cwd}>
            {shortenPath(cwd)}
          </div>
        </div>

        {/* Stats (chat mode) */}
        {data.stats && (
          <div className="mb-3 grid grid-cols-2 gap-2">
            {data.stats.model && (
              <div className="flex items-center gap-1.5 rounded-lg bg-elevated/40 px-2 py-1.5">
                <Cpu className="h-3 w-3 text-blue-400" />
                <div>
                  <div className="text-[10px] text-faint">Model</div>
                  <div className="text-[11px] text-secondary">{data.stats.model.replace('claude-', '').replace(/-\d+$/, '')}</div>
                </div>
              </div>
            )}
            {data.stats.totalCostUsd > 0 && (
              <div className="flex items-center gap-1.5 rounded-lg bg-elevated/40 px-2 py-1.5">
                <Coins className="h-3 w-3 text-amber-400" />
                <div>
                  <div className="text-[10px] text-faint">Cost</div>
                  <div className="text-[11px] text-secondary">${data.stats.totalCostUsd.toFixed(4)}</div>
                </div>
              </div>
            )}
            <div className="flex items-center gap-1.5 rounded-lg bg-elevated/40 px-2 py-1.5">
              <Clock className="h-3 w-3 text-green-400" />
              <div>
                <div className="text-[10px] text-faint">Input tokens</div>
                <div className="text-[11px] text-secondary">{(data.stats.totalInputTokens / 1000).toFixed(1)}k</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg bg-elevated/40 px-2 py-1.5">
              <Clock className="h-3 w-3 text-cyan-400" />
              <div>
                <div className="text-[10px] text-faint">Output tokens</div>
                <div className="text-[11px] text-secondary">{(data.stats.totalOutputTokens / 1000).toFixed(1)}k</div>
              </div>
            </div>
          </div>
        )}

        {/* Modified files */}
        {data.modifiedFiles.length > 0 && (
          <div className="mb-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted">
              <FileEdit className="h-3 w-3" />
              Modified files
              <span className="text-faint">{data.modifiedFiles.length}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              {data.modifiedFiles.map(f => (
                <button
                  key={f}
                  onClick={() => onOpenFile(`${cwd}/${f}`)}
                  className="truncate rounded px-2 py-0.5 text-left font-mono text-[11px] text-yellow-400/70 transition-colors hover:bg-elevated/30 hover:text-yellow-400"
                  title={f}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* CLAUDE.md */}
        {data.claudeMd && (
          <div>
            <button
              onClick={() => setClaudeMdExpanded(!claudeMdExpanded)}
              className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted hover:text-secondary"
            >
              {claudeMdExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <FileText className="h-3 w-3" />
              CLAUDE.md
            </button>
            {claudeMdExpanded && (
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-codeblock p-2 text-[11px] text-muted">
                {data.claudeMd}
              </pre>
            )}
          </div>
        )}

        {!data.claudeMd && data.modifiedFiles.length === 0 && !data.stats && (
          <div className="flex flex-col items-center justify-center py-8 text-faint">
            <Info className="mb-2 h-5 w-5" />
            <span className="text-xs">No context available</span>
          </div>
        )}
      </div>
    </aside>
  );
}
