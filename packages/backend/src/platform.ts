import os from 'os';
import path from 'path';

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
    const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
    return [
      path.join(os.homedir(), '.local', 'bin'),
      path.join(programFiles, 'nodejs'),
      path.join(appData, 'npm'),
      path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'nodejs'),
    ];
  }
  return [
    path.join(os.homedir(), '.local', 'bin'),
    '/usr/local/bin',
    '/opt/homebrew/bin',
  ];
}

/**
 * PTY terminal name to pass to node-pty.
 * Windows conpty ignores this value, but we avoid 'xterm-256color' which
 * can confuse some Windows terminal hosts.
 */
export const PTY_TERM_NAME = IS_WINDOWS ? 'cygwin' : 'xterm-256color';
