import { useState } from 'react';
import { ChevronDown, ChevronRight, Wrench, AlertCircle, CheckCircle2 } from 'lucide-react';
import ToolDetailView from './ToolDetailView';
import type { ToolPair } from './ToolDetailView';

export default function ToolGroupBlock({ tools }: { tools: ToolPair[] }) {
  const [expanded, setExpanded] = useState(false);
  const hasError = tools.some(t => t.result?.is_error);
  const toolNames = tools.map(t => t.use.name).filter(Boolean);

  const summary = tools.length === 1
    ? toolNames[0]
    : `${toolNames.length} tools: ${[...new Set(toolNames)].join(', ')}`;

  return (
    <div className="my-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="group flex w-full items-center gap-2 text-left text-xs text-tertiary transition-colors hover:text-secondary"
      >
        {expanded ? <ChevronDown className="h-3 w-3 text-muted" /> : <ChevronRight className="h-3 w-3 text-muted" />}
        <Wrench className={`h-3 w-3 ${hasError ? 'text-red-400' : 'text-muted'}`} />
        <span className="min-w-0 flex-1 truncate text-muted">{summary}</span>
        {hasError && <AlertCircle className="h-3 w-3 shrink-0 text-red-400" />}
        {!hasError && <CheckCircle2 className="h-3 w-3 shrink-0 text-green-600/50" />}
      </button>
      {expanded && (
        <div className="ml-5 mt-1.5 flex flex-col gap-1.5 border-l-2 border-border-default pl-3">
          {tools.map((tool, i) => (
            <ToolDetailView key={i} tool={tool} />
          ))}
        </div>
      )}
    </div>
  );
}
