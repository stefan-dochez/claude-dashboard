import { execFile } from 'child_process';
import { promisify } from 'util';
import type { TaskStore } from './task-store.js';
import { LIMITS } from './constants.js';
import { createLogger } from './logger.js';

const execFileAsync = promisify(execFile);
const log = createLogger('title-generator');

export async function generateSessionTitle(
  taskStore: TaskStore,
  taskId: string,
  firstPrompt: string,
  onTitle?: (taskId: string, title: string) => void,
): Promise<void> {
  try {
    const prompt = `Generate a very short title (3-8 words, no quotes, no punctuation at the end) summarizing this conversation starter:\n\n"${firstPrompt.slice(0, LIMITS.TITLE_PROMPT_LENGTH)}"`;

    const { stdout } = await execFileAsync('claude', [
      '-p', prompt,
      '--model', 'haiku',
    ], { timeout: 15000 });

    const title = stdout.trim() || null;

    if (title) {
      await taskStore.updateTitle(taskId, title);
      onTitle?.(taskId, title);
    }
  } catch (err) {
    log.warn(`Failed to generate title for ${taskId}:`, err instanceof Error ? err.message : err);
  }
}
