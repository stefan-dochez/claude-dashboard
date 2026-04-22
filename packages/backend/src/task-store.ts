import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { LIMITS } from './constants.js';
import { createLogger } from './logger.js';

const log = createLogger('task-store');

const STORE_DIR = path.join(os.homedir(), '.claude-dashboard');
const TASKS_FILE = path.join(STORE_DIR, 'tasks.json');

export interface StoredTask {
  id: string;
  projectPath: string;
  projectName: string;
  worktreePath: string | null;
  branchName: string | null;
  taskDescription: string | null;
  sessionId: string | null;
  model: string | null;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  mode: 'terminal' | 'chat';
  firstPrompt: string | null;
  title: string | null;
  createdAt: string;
  endedAt: string | null;
}

export class TaskStore {
  private tasks: StoredTask[] = [];

  async load(): Promise<StoredTask[]> {
    try {
      await fs.mkdir(STORE_DIR, { recursive: true });
      const data = await fs.readFile(TASKS_FILE, 'utf-8');
      this.tasks = JSON.parse(data);
    } catch {
      this.tasks = [];
    }

    // Clean up tasks from a previous crash/unclean shutdown:
    // - Remove empty sessions (no firstPrompt = user never sent a message)
    // - Close orphaned tasks that were still running
    const before = this.tasks.length;
    this.tasks = this.tasks.filter(t => t.firstPrompt);
    const removed = before - this.tasks.length;

    let orphansFixed = 0;
    for (const task of this.tasks) {
      if (!task.endedAt) {
        task.endedAt = new Date().toISOString();
        orphansFixed++;
      }
    }
    if (removed > 0 || orphansFixed > 0) {
      if (removed > 0) log.info(`Removed ${removed} empty session(s) with no user prompt`);
      if (orphansFixed > 0) log.info(`Closed ${orphansFixed} orphaned task(s) from previous session`);
      await this.save();
    }

    return this.tasks;
  }

  private async save(): Promise<void> {
    try {
      await fs.mkdir(STORE_DIR, { recursive: true });
      await fs.writeFile(TASKS_FILE, JSON.stringify(this.tasks, null, 2));
    } catch (err) {
      log.error('Failed to save:', err);
    }
  }

  async addTask(task: StoredTask): Promise<void> {
    // Replace existing with same id or same sessionId (resume case)
    const idx = this.tasks.findIndex(t =>
      t.id === task.id || (task.sessionId && t.sessionId === task.sessionId),
    );
    if (idx >= 0) {
      task.createdAt = this.tasks[idx].createdAt; // keep original creation date
      this.tasks[idx] = task;
    } else {
      this.tasks.unshift(task);
    }
    if (this.tasks.length > LIMITS.MAX_TASKS) {
      this.tasks = this.tasks.slice(0, LIMITS.MAX_TASKS);
    }
    await this.save();
  }

  async endTask(id: string, stats?: { totalCostUsd: number; totalInputTokens: number; totalOutputTokens: number }): Promise<void> {
    const task = this.tasks.find(t => t.id === id);
    if (task) {
      // Discard sessions where no prompt was ever sent
      if (!task.firstPrompt) {
        this.tasks = this.tasks.filter(t => t.id !== id);
        await this.save();
        return;
      }
      task.endedAt = new Date().toISOString();
      if (stats) {
        task.totalCostUsd = stats.totalCostUsd;
        task.totalInputTokens = stats.totalInputTokens;
        task.totalOutputTokens = stats.totalOutputTokens;
      }
      await this.save();
    }
  }

  async removeTask(id: string): Promise<void> {
    this.tasks = this.tasks.filter(t => t.id !== id);
    await this.save();
  }

  async removeByWorktreePath(worktreePath: string): Promise<number> {
    const before = this.tasks.length;
    this.tasks = this.tasks.filter(t => t.worktreePath !== worktreePath);
    const removed = before - this.tasks.length;
    if (removed > 0) await this.save();
    return removed;
  }

  async updateTitle(id: string, title: string): Promise<void> {
    const task = this.tasks.find(t => t.id === id);
    if (task) {
      task.title = title;
      await this.save();
    }
  }

  findBySessionId(sessionId: string): StoredTask | undefined {
    return this.tasks.find(t => t.sessionId === sessionId);
  }

  getAll(): StoredTask[] {
    return [...this.tasks];
  }

  getHistory(limit = 50): StoredTask[] {
    return this.tasks.filter(t => t.endedAt !== null).slice(0, limit);
  }
}
