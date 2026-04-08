import fs from 'fs/promises';
import path from 'path';
import os from 'os';

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
    return this.tasks;
  }

  private async save(): Promise<void> {
    try {
      await fs.mkdir(STORE_DIR, { recursive: true });
      await fs.writeFile(TASKS_FILE, JSON.stringify(this.tasks, null, 2));
    } catch (err) {
      console.log('[task-store] Failed to save:', err);
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
    // Keep max 100 tasks
    if (this.tasks.length > 100) {
      this.tasks = this.tasks.slice(0, 100);
    }
    await this.save();
  }

  async endTask(id: string, stats?: { totalCostUsd: number; totalInputTokens: number; totalOutputTokens: number }): Promise<void> {
    const task = this.tasks.find(t => t.id === id);
    if (task) {
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

  getAll(): StoredTask[] {
    return [...this.tasks];
  }

  getHistory(limit = 50): StoredTask[] {
    return this.tasks.filter(t => t.endedAt !== null).slice(0, limit);
  }
}
