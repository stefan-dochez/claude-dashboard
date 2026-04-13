import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { IS_WINDOWS } from './platform.js';
import { createLogger } from './logger.js';

const execAsync = promisify(exec);
const log = createLogger('ide-service');

const IDE_TYPE = {
  VSCODE: 'vscode',
  RIDER: 'rider',
  WEBSTORM: 'webstorm',
} as const;
type IdeType = typeof IDE_TYPE[keyof typeof IDE_TYPE];

interface IdeInfo {
  id: IdeType;
  name: string;
  installed: boolean;
}

interface IdeDefinition {
  id: IdeType;
  name: string;
  /** CLI command name to check in PATH */
  cliCommands: string[];
  /** macOS bundle identifiers for fallback detection via mdfind */
  macBundleIds: string[];
  /** macOS app names for `open -a` fallback */
  macAppNames: string[];
  /** Windows executable names for `where` lookup */
  winExecutables: string[];
}

const IDE_DEFINITIONS: IdeDefinition[] = [
  {
    id: 'vscode',
    name: 'VS Code',
    cliCommands: ['code'],
    macBundleIds: ['com.microsoft.VSCode'],
    macAppNames: ['Visual Studio Code'],
    winExecutables: ['code.cmd', 'code'],
  },
  {
    id: 'rider',
    name: 'Rider',
    cliCommands: ['rider'],
    macBundleIds: ['com.jetbrains.rider'],
    macAppNames: ['Rider'],
    winExecutables: ['rider64.exe', 'rider.cmd'],
  },
  {
    id: 'webstorm',
    name: 'WebStorm',
    cliCommands: ['webstorm'],
    macBundleIds: ['com.jetbrains.WebStorm'],
    macAppNames: ['WebStorm'],
    winExecutables: ['webstorm64.exe', 'webstorm.cmd'],
  },
];

/**
 * Check if a command exists in the PATH.
 */
async function commandExists(cmd: string): Promise<boolean> {
  try {
    const which = IS_WINDOWS ? 'where' : 'which';
    await execAsync(`${which} ${cmd}`, { encoding: 'utf-8', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * macOS-only: check if an app is installed by bundle identifier using mdfind.
 */
async function macAppInstalled(bundleId: string): Promise<boolean> {
  if (IS_WINDOWS || process.platform !== 'darwin') return false;
  try {
    const { stdout } = await execAsync(
      `mdfind "kMDItemCFBundleIdentifier == '${bundleId}'"`,
      { encoding: 'utf-8', timeout: 5000 },
    );
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

export class IdeService {
  private detectionCache: IdeInfo[] | null = null;
  private cacheTimestamp = 0;
  private static CACHE_TTL = 60_000; // 1 minute

  /**
   * Detect which IDEs are installed on the system.
   */
  async detect(): Promise<IdeInfo[]> {
    const now = Date.now();
    if (this.detectionCache && now - this.cacheTimestamp < IdeService.CACHE_TTL) {
      return this.detectionCache;
    }

    const results = await Promise.all(
      IDE_DEFINITIONS.map(async (def): Promise<IdeInfo> => {
        // 1. Check CLI commands in PATH
        for (const cmd of def.cliCommands) {
          if (await commandExists(cmd)) {
            return { id: def.id, name: def.name, installed: true };
          }
        }

        // 2. macOS: check via mdfind bundle ID
        if (process.platform === 'darwin') {
          for (const bundleId of def.macBundleIds) {
            if (await macAppInstalled(bundleId)) {
              return { id: def.id, name: def.name, installed: true };
            }
          }
        }

        // 3. Windows: check via `where` for specific executables
        if (IS_WINDOWS) {
          for (const exe of def.winExecutables) {
            if (await commandExists(exe)) {
              return { id: def.id, name: def.name, installed: true };
            }
          }
        }

        return { id: def.id, name: def.name, installed: false };
      }),
    );

    this.detectionCache = results;
    this.cacheTimestamp = now;
    return results;
  }

  /**
   * Suggest the best IDE for a project based on files present in the directory.
   * - .sln, .csproj, .fsproj → Rider
   * - package.json, angular.json, tsconfig.json → WebStorm
   * - Fallback → VS Code
   */
  async suggestIde(projectPath: string): Promise<IdeType> {
    const installed = await this.detect();
    const installedIds = new Set(installed.filter(i => i.installed).map(i => i.id));

    try {
      const entries = await fs.readdir(projectPath);
      const entrySet = new Set(entries);

      // Check for .NET markers → Rider
      if (installedIds.has('rider')) {
        const hasDotnet = entrySet.has('.sln') ||
          entries.some(e => e.endsWith('.sln') || e.endsWith('.csproj') || e.endsWith('.fsproj'));
        if (!hasDotnet) {
          // Also check one level deep for .csproj in subdirectories
          const hasNestedDotnet = await this.hasFilePattern(projectPath, ['.sln', '.csproj', '.fsproj']);
          if (hasNestedDotnet) return 'rider';
        }
        if (hasDotnet) return 'rider';
      }

      // Check for web/JS/TS markers → WebStorm
      if (installedIds.has('webstorm')) {
        const hasWeb = entrySet.has('package.json') || entrySet.has('angular.json') ||
          entrySet.has('tsconfig.json') || entrySet.has('vite.config.ts') ||
          entrySet.has('vite.config.js') || entrySet.has('next.config.js') ||
          entrySet.has('next.config.ts') || entrySet.has('nuxt.config.ts');
        if (hasWeb) return 'webstorm';
      }
    } catch {
      // If we can't read the directory, fall through to default
    }

    // Fallback: VS Code if installed, otherwise first installed IDE
    if (installedIds.has('vscode')) return 'vscode';
    const firstInstalled = installed.find(i => i.installed);
    return firstInstalled?.id ?? 'vscode';
  }

  private async hasFilePattern(dirPath: string, extensions: string[]): Promise<boolean> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
          return true;
        }
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const subEntries = await fs.readdir(path.join(dirPath, entry.name));
          if (subEntries.some(e => extensions.some(ext => e.endsWith(ext)))) {
            return true;
          }
        }
      }
    } catch {
      // ignore
    }
    return false;
  }

  /**
   * Open a project in the specified IDE, or auto-detect the best one.
   */
  async open(projectPath: string, ide?: IdeType): Promise<{ ide: IdeType }> {
    const targetIde = ide ?? await this.suggestIde(projectPath);
    // Validate project path exists
    const stat = await fs.stat(projectPath);
    if (!stat.isDirectory()) {
      throw new Error(`Not a directory: ${projectPath}`);
    }

    const def = IDE_DEFINITIONS.find(d => d.id === targetIde);
    if (!def) {
      throw new Error(`Unknown IDE: ${targetIde}`);
    }

    const cmd = await this.buildOpenCommand(def, projectPath);
    log.info(`Opening ${projectPath} in ${def.name}: ${cmd}`);

    await execAsync(cmd, { encoding: 'utf-8', timeout: 10_000 });
    return { ide: targetIde };
  }

  private async buildOpenCommand(def: IdeDefinition, projectPath: string): Promise<string> {
    const quoted = JSON.stringify(projectPath);

    // 1. Try CLI command in PATH first (works cross-platform)
    for (const cmd of def.cliCommands) {
      if (await commandExists(cmd)) {
        return `${cmd} ${quoted}`;
      }
    }

    // 2. macOS fallback: `open -a "AppName"`
    if (process.platform === 'darwin') {
      for (const appName of def.macAppNames) {
        const appPath = await this.findMacApp(def);
        if (appPath) {
          return `open -a ${JSON.stringify(appPath)} ${quoted}`;
        }
        // Try by name directly
        return `open -a ${JSON.stringify(appName)} ${quoted}`;
      }
    }

    // 3. Windows fallback: try executable names
    if (IS_WINDOWS) {
      for (const exe of def.winExecutables) {
        if (await commandExists(exe)) {
          return `${exe} ${quoted}`;
        }
      }
      // Last resort on Windows: try start command with app name
      return `start "" ${JSON.stringify(def.name)} ${quoted}`;
    }

    // 4. Linux fallback: try xdg-open or the CLI commands
    throw new Error(`${def.name} not found. Install its CLI tools or add it to PATH.`);
  }

  private async findMacApp(def: IdeDefinition): Promise<string | null> {
    if (process.platform !== 'darwin') return null;
    for (const bundleId of def.macBundleIds) {
      try {
        const { stdout } = await execAsync(
          `mdfind "kMDItemCFBundleIdentifier == '${bundleId}'" | head -1`,
          { encoding: 'utf-8', timeout: 5000 },
        );
        const appPath = stdout.trim();
        if (appPath) return appPath;
      } catch {
        // continue
      }
    }
    return null;
  }
}

export { IDE_TYPE };
export type { IdeType, IdeInfo };
