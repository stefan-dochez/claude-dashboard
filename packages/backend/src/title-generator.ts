import Anthropic from '@anthropic-ai/sdk';
import type { TaskStore } from './task-store.js';
import { LIMITS } from './constants.js';
import { createLogger } from './logger.js';

const log = createLogger('title-generator');

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
          content: `Generate a very short title (3-8 words, no quotes, no punctuation at the end) summarizing this conversation starter:\n\n"${firstPrompt.slice(0, LIMITS.TITLE_PROMPT_LENGTH)}"`,
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
    log.warn(`Failed to generate title for ${taskId}:`, err instanceof Error ? err.message : err);
  }
}
