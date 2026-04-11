import { useMemo } from 'react';
import MarkdownText from './MarkdownText';
import ThinkingBlock from './ThinkingBlock';
import ToolGroupBlock from './ToolGroupBlock';
import type { ChatMessage, ContentBlock } from '../../types';

interface BlockGroup {
  type: 'text' | 'thinking' | 'tool_group';
  text?: string;
  thinking?: string;
  tools?: Array<{ use: ContentBlock; result?: ContentBlock }>;
}

function groupContentBlocks(blocks: ContentBlock[]): BlockGroup[] {
  const groups: BlockGroup[] = [];
  let pendingTools: Array<{ use: ContentBlock; result?: ContentBlock }> = [];

  const flushTools = () => {
    if (pendingTools.length > 0) {
      groups.push({ type: 'tool_group', tools: pendingTools });
      pendingTools = [];
    }
  };

  for (const block of blocks) {
    if (block.type === 'text') {
      flushTools();
      groups.push({ type: 'text', text: block.text });
    } else if (block.type === 'thinking') {
      flushTools();
      groups.push({ type: 'thinking', thinking: block.thinking });
    } else if (block.type === 'tool_use') {
      pendingTools.push({ use: block });
    } else if (block.type === 'tool_result') {
      const match = pendingTools.find(t => t.use.tool_use_id === block.tool_use_id);
      if (match) {
        match.result = block;
      } else {
        if (pendingTools.length > 0 && !pendingTools[pendingTools.length - 1].result) {
          pendingTools[pendingTools.length - 1].result = block;
        }
      }
    }
  }
  flushTools();
  return groups;
}

export default function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const groups = useMemo(
    () => isUser ? null : groupContentBlocks(message.content),
    [message.content, isUser],
  );

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-3xl bg-elevated px-5 py-3 text-sm leading-relaxed text-primary">
          {message.content[0]?.text ?? ''}
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      {groups?.map((group, i) => {
        switch (group.type) {
          case 'text':
            return <MarkdownText key={i} text={group.text ?? ''} />;
          case 'thinking':
            return <ThinkingBlock key={i} text={group.thinking ?? ''} isActive={false} />;
          case 'tool_group':
            return <ToolGroupBlock key={i} tools={group.tools ?? []} />;
          default:
            return null;
        }
      })}
    </div>
  );
}

