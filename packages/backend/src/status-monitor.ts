import type { ProcessManager } from './process-manager.js';
import { INSTANCE_STATUS } from './process-manager.js';
import type { AppConfig } from './config.js';
import { createLogger } from './logger.js';

const log = createLogger('status-monitor');

// Strip ANSI escape sequences so prompt patterns can match clean text.
// The regex handles several distinct escape families commonly emitted by
// terminal applications like Claude Code:
//
//   \x1b\[[0-9;]*[A-Za-z]              — CSI (Control Sequence Introducer): colors, cursor movement, erase
//   \x1b\][^\x07\x1b]*(?:\x07|\x1b\\)  — OSC (Operating System Command): window title, hyperlinks
//   \x1b[()][0-9A-Za-z]                — Character set selection (G0/G1)
//   \x1b[=>NOM78cDHZ#]                 — Simple one-char escapes (keypad mode, cursor save, etc.)
//   \x1b\[[\?]?[0-9;]*[hlsr]           — Private/DEC mode set/reset (e.g. ?25h for cursor visibility)
const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][0-9A-Za-z]|\x1b[=>NOM78cDHZ#]|\x1b\[[?]?[0-9;]*[hlsr]/g;

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '');
}

export class StatusMonitor {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private compiledPatterns: RegExp[] = [];
  private readonly CHECK_INTERVAL = 1000; // 1 second
  private readonly IDLE_THRESHOLD = 30000; // 30 seconds
  // Per-instance UTC timestamp of the last time `esc to interrupt` was seen
  // in *new* PTY output. Used to debounce the PROCESSING signal so it stays
  // sticky for one CHECK_INTERVAL after Claude Code's last redraw containing
  // the marker — exactly long enough to bridge the gap between two ticks
  // when generation is still active.
  private readonly lastEscMarkerAt = new Map<string, number>();
  // Per-instance buffer length read at the previous tick. Lets us inspect
  // only the bytes that arrived since the last check, which avoids picking
  // up stale `esc to interrupt` occurrences from earlier generations that
  // are still sitting in the byte history.
  private readonly lastReadLength = new Map<string, number>();

  constructor(
    private processManager: ProcessManager,
    private config: AppConfig,
  ) {
    this.compilePatterns();
  }

  start(): void {
    if (this.intervalId) return;

    this.intervalId = setInterval(() => this.check(), this.CHECK_INTERVAL);
    log.info('Started');
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
        log.warn(`Invalid pattern: ${p}`);
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

      // Always check buffer for state markers, regardless of recent activity.
      // Claude Code's status line continuously emits output even when waiting
      // for input, so we can't rely on activity silence to trigger pattern checks.
      //
      // We use two *positive* signals rather than a single binary "is prompt"
      // check:
      //   - PROCESSING marker — `esc to interrupt` (Claude Code only renders
      //     this hint while a generation is in flight).
      //   - PROMPT markers — `shift+tab to cycle`, `accept edits on`, etc.
      //
      // State resolution:
      //   1. If a PROCESSING marker is in the recent screen frame → PROCESSING.
      //   2. Else if a PROMPT marker is anywhere in the cleaned tail →
      //      WAITING_INPUT (or IDLE after IDLE_THRESHOLD).
      //   3. Else → keep current status (don't oscillate when neither marker
      //      is present — typically a brief redraw window after switching tabs).
      try {
        const buffer = this.processManager.getBuffer(instance.id);
        const signals = this.classifyBuffer(instance.id, buffer, now);

        if (signals === 'processing') {
          this.processManager.updateStatus(instance.id, INSTANCE_STATUS.PROCESSING);
        } else if (signals === 'waiting') {
          if (timeSinceActivity > this.IDLE_THRESHOLD) {
            this.processManager.updateStatus(instance.id, INSTANCE_STATUS.IDLE);
          } else {
            this.processManager.updateStatus(instance.id, INSTANCE_STATUS.WAITING_INPUT);
          }
        }
        // 'unknown' → don't update; keep the last known status.
      } catch {
        // Instance might have been removed
      }
    }
  }

  // Drop the per-instance bookkeeping when an instance disappears. Called
  // from the socket layer; safe to call for unknown ids.
  forget(instanceId: string): void {
    this.lastEscMarkerAt.delete(instanceId);
    this.lastReadLength.delete(instanceId);
  }

  // Classify the buffer into one of three signals:
  //   'processing' — Claude Code is generating (esc-to-interrupt marker).
  //   'waiting'    — at the prompt (shift+tab to cycle, accept edits on, …).
  //   'unknown'    — neither marker present; caller should not update status.
  //
  // The PROCESSING decision is incremental: we only look at *new* bytes that
  // arrived since the previous tick, then sticky-hold the verdict for
  // `ESC_MARKER_TTL_MS` so a single missed redraw doesn't drop us out of
  // PROCESSING for one frame. This avoids two failure modes the previous
  // implementations hit:
  //   - looking at the whole tail picks up stale `esc to interrupt` bytes
  //     from a finished generation and keeps the spinner pinned
  //   - looking only at a tiny tail window misses the marker because the
  //     bottom hint is buried in a screen full of color codes
  private readonly ESC_MARKER_TTL_MS = 1500;
  private classifyBuffer(instanceId: string, buffer: string, now: number): 'processing' | 'waiting' | 'unknown' {
    if (buffer.length === 0) return 'unknown';

    // Inspect only the bytes that arrived since the previous tick.
    const previousLength = this.lastReadLength.get(instanceId) ?? 0;
    // `previousLength` may be greater than the current length if the buffer
    // has been trimmed (>512 KB). In that case fall back to scanning the
    // whole current buffer once.
    const newDataStart = previousLength <= buffer.length ? previousLength : 0;
    const newData = buffer.slice(newDataStart);
    this.lastReadLength.set(instanceId, buffer.length);

    if (newData.length > 0 && stripAnsi(newData).includes('esc to interrupt')) {
      this.lastEscMarkerAt.set(instanceId, now);
    }

    const lastEsc = this.lastEscMarkerAt.get(instanceId);
    if (lastEsc !== undefined && now - lastEsc <= this.ESC_MARKER_TTL_MS) {
      return 'processing';
    }

    // No active processing marker — look for a prompt hint anywhere in the
    // recent tail. Stale prompt hints are not a problem here since we only
    // return `waiting` when there is no fresher PROCESSING signal.
    const rawTail = buffer.slice(-20000);
    const cleanedTail = stripAnsi(rawTail);

    const PROMPT_MARKERS = [
      'shift+tab to cycle',
      'accept edits on',
      'plan mode on',
      'for shortcuts',
      '? for help',
    ];
    for (const marker of PROMPT_MARKERS) {
      if (cleanedTail.includes(marker)) return 'waiting';
    }

    // Fallback: cleaned-line scan for prompt-character endings (e.g. `❯`).
    const lines = rawTail.split('\r').slice(-50);
    for (const line of lines) {
      const cleaned = stripAnsi(line).trim();
      if (cleaned.length === 0) continue;
      if (/[❯›>]\s*$/.test(cleaned)) return 'waiting';
    }

    // Config-supplied patterns.
    if (this.compiledPatterns.length > 0) {
      const cleanedLines = lines
        .map(l => stripAnsi(l).trim())
        .filter(l => l.length > 0);
      const cleanedText = cleanedLines.join('\n');
      for (const pattern of this.compiledPatterns) {
        if (pattern.test(cleanedText)) return 'waiting';
      }
    }

    return 'unknown';
  }
}
