import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { createLogger } from './logger.js';
import { PATH_SEP, getExtraPaths } from './platform.js';

const log = createLogger('plugins-manager');
const execAsync = promisify(exec);

function enrichedEnv(): NodeJS.ProcessEnv {
  const extra = getExtraPaths();
  return {
    ...process.env,
    PATH: [...extra, process.env.PATH ?? ''].join(PATH_SEP),
  };
}

/** Default timeout for `claude plugin` CLI calls. Some network-backed ops (install/update) can take longer. */
const CLI_TIMEOUT_MS = 120_000;

export interface Marketplace {
  name: string;
  source: string;
  repo?: string;
  url?: string;
  path?: string;
  installLocation: string;
}

export interface InstalledPlugin {
  id: string;
  name: string;
  marketplaceName: string;
  version: string;
  scope: 'user' | 'project';
  enabled: boolean;
  installPath: string;
  installedAt: string;
  lastUpdated: string;
  errors?: string[];
  description?: string;
  hasUpdate?: boolean;
  availableVersion?: string;
}

export interface AvailablePlugin {
  pluginId: string;
  name: string;
  description: string;
  marketplaceName: string;
  source: unknown;
  installCount?: number;
  author?: { name?: string };
  keywords?: string[];
  category?: string;
  isInstalled: boolean;
}

export interface PluginsListResponse {
  marketplaces: Marketplace[];
  installed: InstalledPlugin[];
  available: AvailablePlugin[];
}

/**
 * Escape a single argument for safe inclusion in a shell command.
 * The CLI arguments (plugin ids, marketplace names, URLs) come from the UI —
 * wrap them in single quotes and escape any embedded single quotes.
 */
function shellQuote(arg: string): string {
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

/** Parse a plugin id of the form "name@marketplace". */
function splitPluginId(id: string): { name: string; marketplaceName: string } {
  const at = id.lastIndexOf('@');
  if (at < 0) return { name: id, marketplaceName: '' };
  return { name: id.slice(0, at), marketplaceName: id.slice(at + 1) };
}

interface RawInstalled {
  id: string;
  version: string;
  scope: string;
  enabled: boolean;
  installPath: string;
  installedAt: string;
  lastUpdated: string;
  errors?: string[];
}

interface RawAvailable {
  pluginId: string;
  name: string;
  description?: string;
  marketplaceName: string;
  source?: unknown;
  installCount?: number;
  author?: { name?: string };
  keywords?: string[];
  category?: string;
}

export class PluginsManager {
  private async runCli(args: string, timeoutMs = CLI_TIMEOUT_MS): Promise<string> {
    try {
      const { stdout } = await execAsync(`claude plugin ${args}`, { timeout: timeoutMs, env: enrichedEnv() });
      return stdout;
    } catch (err) {
      const e = err as { stderr?: string; message?: string };
      const detail = (e.stderr ?? '').trim() || e.message || 'unknown error';
      throw new Error(detail);
    }
  }

  async listMarketplaces(): Promise<Marketplace[]> {
    const out = await this.runCli('marketplace list --json', 30_000);
    try {
      return JSON.parse(out) as Marketplace[];
    } catch {
      log.warn('Failed to parse marketplace list output');
      return [];
    }
  }

  async addMarketplace(source: string): Promise<void> {
    await this.runCli(`marketplace add ${shellQuote(source)}`);
    log.info(`Added marketplace: ${source}`);
  }

  async removeMarketplace(name: string): Promise<void> {
    await this.runCli(`marketplace remove ${shellQuote(name)}`, 30_000);
    log.info(`Removed marketplace: ${name}`);
  }

  /** Update a specific marketplace (by name), or all if no name is passed. */
  async updateMarketplaces(name?: string): Promise<void> {
    const arg = name ? ` ${shellQuote(name)}` : '';
    await this.runCli(`marketplace update${arg}`);
    log.info(`Updated marketplace(s)${name ? `: ${name}` : ''}`);
  }

  /**
   * Return marketplaces + installed plugins + all available plugins (with isInstalled flag).
   * Single call strategy: one invocation of `plugin list --available --json`, plus one for marketplaces.
   */
  async listAll(): Promise<PluginsListResponse> {
    const [marketplaces, rawCombined] = await Promise.all([
      this.listMarketplaces(),
      this.runCli('list --available --json', 60_000),
    ]);

    let parsed: { installed: RawInstalled[]; available: RawAvailable[] };
    try {
      parsed = JSON.parse(rawCombined) as { installed: RawInstalled[]; available: RawAvailable[] };
    } catch {
      throw new Error('Failed to parse `claude plugin list --available` output');
    }

    const availableById = new Map<string, RawAvailable>();
    for (const a of parsed.available) availableById.set(a.pluginId, a);

    const installed: InstalledPlugin[] = parsed.installed.map(raw => {
      const { name, marketplaceName } = splitPluginId(raw.id);
      const avail = availableById.get(raw.id);
      return {
        id: raw.id,
        name,
        marketplaceName,
        version: raw.version,
        scope: (raw.scope === 'project' ? 'project' : 'user'),
        enabled: raw.enabled,
        installPath: raw.installPath,
        installedAt: raw.installedAt,
        lastUpdated: raw.lastUpdated,
        errors: raw.errors,
        description: avail?.description ?? '',
      };
    });

    const installedIds = new Set(installed.map(p => p.id));
    const available: AvailablePlugin[] = parsed.available.map(raw => ({
      pluginId: raw.pluginId,
      name: raw.name,
      description: raw.description ?? '',
      marketplaceName: raw.marketplaceName,
      source: raw.source,
      installCount: raw.installCount,
      author: raw.author,
      keywords: raw.keywords,
      category: raw.category,
      isInstalled: installedIds.has(raw.pluginId),
    }));

    return { marketplaces, installed, available };
  }

  async installPlugin(pluginId: string): Promise<void> {
    await this.runCli(`install ${shellQuote(pluginId)}`);
    log.info(`Installed plugin: ${pluginId}`);
  }

  async uninstallPlugin(pluginId: string): Promise<void> {
    await this.runCli(`uninstall ${shellQuote(pluginId)}`);
    log.info(`Uninstalled plugin: ${pluginId}`);
  }

  async updatePlugin(pluginId: string): Promise<void> {
    await this.runCli(`update ${shellQuote(pluginId)}`);
    log.info(`Updated plugin: ${pluginId}`);
  }

  async enablePlugin(pluginId: string): Promise<void> {
    await this.runCli(`enable ${shellQuote(pluginId)}`);
    log.info(`Enabled plugin: ${pluginId}`);
  }

  async disablePlugin(pluginId: string): Promise<void> {
    await this.runCli(`disable ${shellQuote(pluginId)}`);
    log.info(`Disabled plugin: ${pluginId}`);
  }

  /**
   * Read README.md from the plugin's install path, falling back to plugin.json if no README.
   * The installPath is provided by the CLI so we don't need to guess it.
   */
  async getPluginReadme(installPath: string): Promise<{ content: string; filename: string }> {
    const candidates = ['README.md', 'readme.md', 'README.MD', '.claude-plugin/plugin.json'];
    for (const name of candidates) {
      const full = path.join(installPath, name);
      try {
        const content = await fs.readFile(full, 'utf-8');
        return { content, filename: name };
      } catch {
        continue;
      }
    }
    throw new Error(`No README.md or plugin.json found in ${installPath}`);
  }
}
