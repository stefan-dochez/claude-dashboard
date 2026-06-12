import os from 'os';
import path from 'path';
import { execFile } from 'child_process';

export const IS_WINDOWS = process.platform === 'win32';

/**
 * Null device path — `/dev/null` on Unix, `nul` on Windows.
 */
export const NULL_DEVICE = IS_WINDOWS ? 'nul' : '/dev/null';

/**
 * Path separator for the PATH environment variable.
 */
export const PATH_SEP = IS_WINDOWS ? ';' : ':';

/**
 * Replace the user's home directory prefix with `~` in a file path.
 * Works on both Unix (`/Users/foo/bar` → `~/bar`) and Windows (`C:\Users\foo\bar` → `~\bar`).
 */
export function shortenHomePath(fullPath: string): string {
  const home = os.homedir();
  if (fullPath === home) return '~';
  // Normalize separators for comparison on Windows
  const normalizedPath = fullPath.replace(/\\/g, '/');
  const normalizedHome = home.replace(/\\/g, '/');
  if (normalizedPath.startsWith(normalizedHome + '/')) {
    return '~' + fullPath.slice(home.length);
  }
  return fullPath;
}

/**
 * Extra directories to prepend to PATH for finding node / claude binaries.
 */
export function getExtraPaths(): string[] {
  if (IS_WINDOWS) {
    const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
    const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
    const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
    return [
      path.join(os.homedir(), '.local', 'bin'),
      path.join(programFiles, 'nodejs'),
      path.join(appData, 'npm'),
      path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'nodejs'),
      path.join(programFiles, 'Git', 'cmd'),
      path.join(programFiles, 'GitHub CLI'),
      path.join(programFilesX86, 'GitHub CLI'),
      path.join(localAppData, 'Programs', 'GitHub CLI'),
    ];
  }
  return [
    path.join(os.homedir(), '.local', 'bin'),
    '/usr/local/bin',
    '/opt/homebrew/bin',
  ];
}

/**
 * Open a folder in the OS file manager (Finder on macOS, Explorer on Windows,
 * the default file manager via `xdg-open` on Linux).
 */
export function openInFileManager(folderPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const command = IS_WINDOWS ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    execFile(command, [folderPath], error => {
      // explorer.exe exits with code 1 even on success — ignore the error on Windows.
      if (error && !IS_WINDOWS) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

/**
 * PTY terminal name to pass to node-pty.
 * Windows conpty ignores this value, but we avoid 'xterm-256color' which
 * can confuse some Windows terminal hosts.
 */
export const PTY_TERM_NAME = IS_WINDOWS ? 'cygwin' : 'xterm-256color';
