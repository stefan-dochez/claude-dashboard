import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export default function ThinkingBlock({ text, isActive }: { text: string; isActive: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const preview = text.slice(0, 150).replace(/\n/g, ' ');

  return (
    <div className="my-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="group flex w-full items-center gap-2 text-left text-xs text-tertiary transition-colors hover:text-secondary"
      >
        {expanded ? <ChevronDown className="h-3 w-3 text-muted" /> : <ChevronRight className="h-3 w-3 text-muted" />}
        <span className={isActive ? 'italic text-tertiary' : 'text-muted'}>
          {isActive ? 'Thinking...' : 'Thought process'}
        </span>
      </button>
      {expanded ? (
        <pre className="mt-1.5 max-h-60 overflow-auto whitespace-pre-wrap border-l-2 border-border-default pl-4 text-xs leading-relaxed text-muted">{text}</pre>
      ) : !isActive ? (
        <p className="mt-0.5 truncate pl-5 text-xs text-faint">{preview}{text.length > 150 ? '...' : ''}</p>
      ) : null}
    </div>
  );
}
