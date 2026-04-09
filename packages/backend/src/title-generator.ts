import Anthropic from '@anthropic-ai/sdk';
import type { TaskStore } from './task-store.js';

const client = new Anthropic();

export async function generateSessionTitle(
  taskStore: TaskStore,
  taskId: string,
  firstPrompt: string,
): Promise<void> {
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 30,
      messages: [
        {
          role: 'user',
          content: `Generate a very short title (3-8 words, no quotes, no punctuation at the end) summarizing this conversation starter:\n\n"${firstPrompt.slice(0, 500)}"`,
        },
      ],
    });

    const title = response.content[0].type === 'text'
      ? response.content[0].text.trim()
      : null;

    if (title) {
      await taskStore.updateTitle(taskId, title);
    }
  } catch (err) {
    console.log(`[title-generator] Failed to generate title for ${taskId}:`, err instanceof Error ? err.message : err);
  }
}
