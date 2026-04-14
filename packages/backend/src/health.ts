import { execFile } from 'child_process';
import { promisify } from 'util';
import { createLogger } from './logger.js';
import { TIMEOUTS } from './constants.js';
import { PATH_SEP, getExtraPaths } from './platform.js';

const execFileAsync = promisify(execFile);
const log = createLogger('health');

function enrichedEnv(): NodeJS.ProcessEnv {
  const extra = getExtraPaths();
  return {
    ...process.env,
    PATH: [...extra, process.env.PATH ?? ''].join(PATH_SEP),
  };
}

export interface DependencyStatus {
  name: string;
  ok: boolean;
  version: string | null;
  detail: string | null;
}

export interface HealthReport {
  ok: boolean;
  dependencies: DependencyStatus[];
}

async function checkBinary(
  name: string,
  args: string[],
  parseVersion: (stdout: string) => string,
): Promise<DependencyStatus> {
  try {
    const { stdout } = await execFileAsync(name, args, { timeout: TIMEOUTS.GIT_SHORT, env: enrichedEnv() });
    const version = parseVersion(stdout.trim());
    return { name, ok: true, version, detail: null };
  } catch {
    return { name, ok: false, version: null, detail: 'not found in PATH' };
  }
}

async function checkGhAuth(): Promise<DependencyStatus> {
  try {
    const { stdout } = await execFileAsync('gh', ['auth', 'status'], {
      timeout: TIMEOUTS.GH_CLI,
      env: enrichedEnv(),
    });
    // gh auth status outputs to stderr on older versions, stdout on newer
    const output = stdout.trim();
    const userMatch = output.match(/Logged in to .+ as (\S+)/);
    const user = userMatch ? userMatch[1] : null;
    return {
      name: 'gh (auth)',
      ok: true,
      version: null,
      detail: user ? `authenticated as ${user}` : 'authenticated',
    };
  } catch (err) {
    // gh auth status exits with non-zero if not authenticated, but may still output info
    const message = err instanceof Error ? (err as { stderr?: string }).stderr ?? err.message : '';
    const userMatch = String(message).match(/Logged in to .+ as (\S+)/);
    if (userMatch) {
      return {
        name: 'gh (auth)',
        ok: true,
        version: null,
        detail: `authenticated as ${userMatch[1]}`,
      };
    }
    return {
      name: 'gh (auth)',
      ok: false,
      version: null,
      detail: 'not authenticated — run `gh auth login`',
    };
  }
}

export async function runHealthCheck(): Promise<HealthReport> {
  const deps = await Promise.all([
    checkBinary('git', ['--version'], s => s.replace('git version ', '')),
    checkBinary('claude', ['--version'], s => s.split('\n')[0]),
    checkBinary('gh', ['--version'], s => {
      const m = s.match(/gh version ([\d.]+)/);
      return m ? m[1] : s.split('\n')[0];
    }),
    checkGhAuth(),
  ]);

  const ok = deps.every(d => d.ok);

  // Log results at startup
  for (const dep of deps) {
    const icon = dep.ok ? '✓' : '✗';
    const info = [dep.version, dep.detail].filter(Boolean).join(' — ');
    if (dep.ok) {
      log.info(`${icon} ${dep.name}${info ? ` (${info})` : ''}`);
    } else {
      log.warn(`${icon} ${dep.name} — ${dep.detail}`);
    }
  }

  return { ok, dependencies: deps };
}
