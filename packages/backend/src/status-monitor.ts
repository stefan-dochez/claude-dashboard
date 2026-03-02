import type { ProcessManager } from './process-manager.js';
import { INSTANCE_STATUS } from './process-manager.js';
import type { AppConfig } from './config.js';

// Strip ANSI escape sequences so prompt patterns can match clean text
// Covers: CSI sequences, OSC sequences, simple escapes (colors, cursor, etc.)
const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][0-9A-Za-z]|\x1b[=>NOM78cDHZ#]|\x1b\[[\?]?[0-9;]*[hlsr]/g;

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '');
}

export class StatusMonitor {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private compiledPatterns: RegExp[] = [];
  private readonly CHECK_INTERVAL = 1000; // 1 second
  private readonly IDLE_THRESHOLD = 30000; // 30 seconds

  constructor(
    private processManager: ProcessManager,
    private config: AppConfig,
  ) {
    this.compilePatterns();
  }

  start(): void {
    if (this.intervalId) return;

    this.intervalId = setInterval(() => this.check(), this.CHECK_INTERVAL);
    console.log('[status-monitor] Started');
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private compilePatterns(): void {
    this.compiledPatterns = this.config.statusPatterns.waitingInput.map(p => {
      try {
        return new RegExp(p, 'm');
      } catch {
        console.log(`[status-monitor] Invalid pattern: ${p}`);
        return null;
      }
    }).filter((p): p is RegExp => p !== null);
  }

  private check(): void {
    const instances = this.processManager.getAll();
    const now = Date.now();

    for (const instance of instances) {
      if (instance.status === INSTANCE_STATUS.EXITED) continue;

      const lastActivity = this.processManager.getLastActivity(instance.id);
      if (!lastActivity) continue;

      // Transition launching → processing once we see any output
      if (instance.status === INSTANCE_STATUS.LAUNCHING) {
        const buffer = this.processManager.getBuffer(instance.id);
        if (buffer.length > 0) {
          this.processManager.updateStatus(instance.id, INSTANCE_STATUS.PROCESSING);
        }
        continue;
      }

      const timeSinceActivity = now - lastActivity.getTime();

      // Always check buffer for prompt patterns, regardless of recent activity.
      // Claude Code's status line continuously emits output even when waiting
      // for input, so we can't rely on activity silence to trigger pattern checks.
      try {
        const buffer = this.processManager.getBuffer(instance.id);
        const isWaiting = this.checkForPrompt(buffer);

        if (isWaiting) {
          if (timeSinceActivity > this.IDLE_THRESHOLD) {
            this.processManager.updateStatus(instance.id, INSTANCE_STATUS.IDLE);
          } else {
            this.processManager.updateStatus(instance.id, INSTANCE_STATUS.WAITING_INPUT);
          }
        } else {
          this.processManager.updateStatus(instance.id, INSTANCE_STATUS.PROCESSING);
        }
      } catch {
        // Instance might have been removed
      }
    }
  }

  private checkForPrompt(buffer: string): boolean {
    if (buffer.length === 0) return false;

    // Take the tail, strip ANSI escapes, then test patterns against clean text
    const tail = stripAnsi(buffer.slice(-4000));

    for (const pattern of this.compiledPatterns) {
      if (pattern.test(tail)) {
        return true;
      }
    }

    return false;
  }
}
