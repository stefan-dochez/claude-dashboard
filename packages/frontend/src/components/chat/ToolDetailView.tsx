import type { ContentBlock } from '../../types';

interface ToolPair {
  use: ContentBlock;
  result?: ContentBlock;
}

const TOOL_RESULT_PREVIEW_LENGTH = 3000;

export default function ToolDetailView({ tool }: { tool: ToolPair }) {
  const input = tool.use.input as Record<string, unknown> | null;
  const name = tool.use.name ?? '';
  const isEdit = name === 'Edit' || name === 'Write';
  const isBash = name === 'Bash';
  const isRead = name === 'Read' || name === 'Glob' || name === 'Grep';

  const filePath = input?.file_path as string | undefined;
  const command = input?.command as string | undefined;
  const oldStr = input?.old_string as string | undefined;
  const newStr = input?.new_string as string | undefined;

  return (
    <div className="rounded border border-border-subtle bg-codeblock p-2">
      {/* Header: tool name + file path or command */}
      <div className="mb-1 flex items-center gap-1.5 text-[11px]">
        <span className="font-medium text-muted">{name}</span>
        {filePath && (
          <span className="truncate font-mono text-faint" title={filePath}>
            {filePath.split('/').pop()}
          </span>
        )}
        {isBash && command && (
          <span className="truncate font-mono text-faint" title={command}>
            $ {command.length > 60 ? command.slice(0, 60) + '...' : command}
          </span>
        )}
      </div>

      {/* Edit/Write: show diff */}
      {isEdit && oldStr != null && newStr != null && (
        <div className="max-h-48 overflow-auto rounded bg-root p-1.5 font-mono text-[11px] leading-relaxed">
          {oldStr.split('\n').map((line, i) => (
            <div key={`old-${i}`} className="text-red-400/70"><span className="mr-2 select-none text-red-400/40">-</span>{line}</div>
          ))}
          {newStr.split('\n').map((line, i) => (
            <div key={`new-${i}`} className="text-green-400/70"><span className="mr-2 select-none text-green-400/40">+</span>{line}</div>
          ))}
        </div>
      )}

      {/* Write (new file): show content */}
      {name === 'Write' && !oldStr && input?.content != null && (
        <div className="max-h-48 overflow-auto rounded bg-root p-1.5 font-mono text-[11px] leading-relaxed">
          {String(input.content).split('\n').map((line, i) => (
            <div key={i} className="text-green-400/70"><span className="mr-2 select-none text-green-400/40">+</span>{line}</div>
          ))}
        </div>
      )}

      {/* Bash: show command */}
      {isBash && command && !oldStr && (
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-root p-1.5 text-[11px] text-muted">
          $ {command}
        </pre>
      )}

      {/* Read/Glob/Grep: show path or pattern */}
      {isRead && !filePath && input != null && (
        <pre className="max-h-20 overflow-auto whitespace-pre-wrap text-[11px] text-faint">
          {typeof input === 'string' ? input : JSON.stringify(input, null, 2)}
        </pre>
      )}

      {/* Generic fallback for other tools */}
      {!isEdit && !isBash && !isRead && input != null && (
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-[11px] text-faint">
          {typeof input === 'string' ? input : JSON.stringify(input, null, 2)}
        </pre>
      )}

      {/* Result */}
      {tool.result && (
        <div className={`mt-1.5 border-t pt-1.5 ${tool.result.is_error ? 'border-red-500/20' : 'border-border-subtle'}`}>
          {isBash && !tool.result.is_error ? (
            <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-root p-1.5 text-[11px] text-muted">
              {(tool.result.content ?? tool.result.stdout ?? '').slice(0, TOOL_RESULT_PREVIEW_LENGTH)}
            </pre>
          ) : (
            <pre className={`max-h-32 overflow-auto whitespace-pre-wrap text-[11px] ${tool.result.is_error ? 'text-red-400/70' : 'text-muted'}`}>
              {(tool.result.content ?? tool.result.stdout ?? '').slice(0, TOOL_RESULT_PREVIEW_LENGTH)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export type { ToolPair };
