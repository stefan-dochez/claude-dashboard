import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { IS_WINDOWS } from './platform.js';
import { createLogger } from './logger.js';

const log = createLogger('hook-injector');

// Events we listen to. UserPromptSubmit and Stop give us PROCESSING/IDLE.
// Notification fires when Claude needs the user's attention (idle wait, permission request).
const MANAGED_EVENTS = ['UserPromptSubmit', 'Stop', 'Notification'] as const;
export type HookEvent = typeof MANAGED_EVENTS[number];

// Resolve the bundled hook script path. Works whether running from src/ (tsx)
// or dist/ (compiled), since both sit one level below the backend root.
function resolveHookScriptPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', 'scripts', 'claude-dashboard-hook.mjs');
}

const HOOK_SCRIPT_PATH = resolveHookScriptPath();

// Single-quote-escape a path for sh. Wraps in single quotes; embedded quotes
// become '\''. Node binary paths and the bundled script path don't realistically
// contain single quotes, but we encode anyway since user paths can.
function shEscape(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

// On Windows, hooks run via cmd.exe. Quote with double quotes; if a path
// contains a double quote we just give up and pass it raw — Claude Code paths
// for node and our bundled script never realistically contain quotes.
function cmdQuote(s: string): string {
  if (s.includes('"')) return s;
  return `"${s}"`;
}

function buildHookCommand(): string {
  const node = process.execPath;
  if (IS_WINDOWS) {
    return `${cmdQuote(node)} ${cmdQuote(HOOK_SCRIPT_PATH)}`;
  }
  return `${shEscape(node)} ${shEscape(HOOK_SCRIPT_PATH)}`;
}

interface HookEntry {
  type?: string;
  command?: string;
}

interface HookGroup {
  matcher?: string;
  hooks?: HookEntry[];
}

interface SettingsShape {
  hooks?: Partial<Record<string, HookGroup[]>>;
  [key: string]: unknown;
}

// Filter our hooks (identified by the bundled script path appearing in the
// command) out of the settings object. Drops empty groups/events. Returns a
// flag indicating whether anything was changed.
function stripManagedHooks(settings: SettingsShape): boolean {
  const hooks = settings.hooks;
  if (!hooks || typeof hooks !== 'object') return false;
  let changed = false;
  for (const eventName of Object.keys(hooks)) {
    const groups = hooks[eventName];
    if (!Array.isArray(groups)) continue;
    const cleanedGroups: HookGroup[] = [];
    for (const group of groups) {
      const inner = Array.isArray(group?.hooks) ? group.hooks : [];
      const filtered = inner.filter(h => !(typeof h?.command === 'string' && h.command.includes(HOOK_SCRIPT_PATH)));
      if (filtered.length !== inner.length) changed = true;
      if (filtered.length > 0) {
        cleanedGroups.push({ ...group, hooks: filtered });
      } else {
        // group emptied — drop it (also marks change implicitly)
      }
    }
    if (cleanedGroups.length === 0) {
      delete hooks[eventName]; // eslint-disable-line @typescript-eslint/no-dynamic-delete
    } else {
      hooks[eventName] = cleanedGroups;
    }
  }
  if (Object.keys(hooks).length === 0) {
    delete settings.hooks;
  }
  return changed;
}

async function readSettings(filePath: string): Promise<SettingsShape> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed as SettingsShape : {};
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    log.warn(`Could not parse ${filePath}, ignoring: ${err instanceof Error ? err.message : err}`);
    return {};
  }
}

async function writeSettings(filePath: string, settings: SettingsShape): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
}

export interface InjectedHookHandle {
  settingsPath: string;
  /** True if we created the file (vs merged into a pre-existing one). Lets cleanup delete it cleanly. */
  createdFile: boolean;
}

/**
 * Inject our hook entries into <cwd>/.claude/settings.local.json. Merges with
 * any pre-existing hooks. Returns a handle used by removeHooks for cleanup.
 */
export async function injectHooks(cwd: string): Promise<InjectedHookHandle | null> {
  const settingsPath = path.join(cwd, '.claude', 'settings.local.json');
  let createdFile = false;
  try {
    await fs.access(settingsPath);
  } catch {
    createdFile = true;
  }

  const settings = await readSettings(settingsPath);
  // Strip any leftover hooks of ours from a previous (crashed) run before re-adding.
  stripManagedHooks(settings);

  if (!settings.hooks || typeof settings.hooks !== 'object') {
    settings.hooks = {};
  }
  const command = buildHookCommand();
  const ourGroup: HookGroup = { hooks: [{ type: 'command', command }] };
  for (const event of MANAGED_EVENTS) {
    const existing = settings.hooks[event];
    const groups = Array.isArray(existing) ? existing : [];
    settings.hooks[event] = [...groups, ourGroup];
  }

  try {
    await writeSettings(settingsPath, settings);
    log.info(`Injected dashboard hooks into ${settingsPath} (createdFile=${createdFile})`);
    return { settingsPath, createdFile };
  } catch (err) {
    log.warn(`Failed to write hooks to ${settingsPath}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

/** Remove our hook entries. If we created the file and it would now be empty, delete it. */
export async function removeHooks(handle: InjectedHookHandle): Promise<void> {
  try {
    const settings = await readSettings(handle.settingsPath);
    const changed = stripManagedHooks(settings);
    if (!changed) return;

    const isEmpty = Object.keys(settings).length === 0;
    if (handle.createdFile && isEmpty) {
      await fs.unlink(handle.settingsPath).catch(() => { /* may already be gone */ });
    } else {
      await writeSettings(handle.settingsPath, settings);
    }
    log.info(`Cleaned up dashboard hooks from ${handle.settingsPath}`);
  } catch (err) {
    log.warn(`Hook cleanup failed for ${handle.settingsPath}: ${err instanceof Error ? err.message : err}`);
  }
}

/** Map a hook event name → status update to apply. Returns null for events we ignore. */
export function eventToStatus(event: string | null | undefined): 'processing' | 'idle' | 'waiting_input' | null {
  switch (event) {
    case 'UserPromptSubmit': return 'processing';
    case 'Stop': return 'idle';
    case 'Notification': return 'waiting_input';
    default: return null;
  }
}
