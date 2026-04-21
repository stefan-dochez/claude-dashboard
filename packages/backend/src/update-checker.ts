import { createLogger } from './logger.js';

const log = createLogger('update-checker');

const DEFAULT_REPO = 'stefan-dochez/claude-dashboard';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const ERROR_CACHE_TTL_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;

export interface UpdateAsset {
  name: string;
  url: string;
  size: number;
}

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
  publishedAt: string | null;
  checkedAt: string;
  error: string | null;
  /** Download asset for the current platform/arch (macOS DMG or Windows EXE). Null if no match. */
  asset: UpdateAsset | null;
}

interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface GitHubRelease {
  tag_name: string;
  html_url: string;
  published_at: string;
  draft: boolean;
  prerelease: boolean;
  assets: GitHubAsset[];
}

/**
 * Pick the release asset that matches the current platform/arch.
 * macOS arm64 → `*-arm64.dmg`; macOS x64 → `*-x64.dmg` or plain `*.dmg`;
 * Windows → `*.exe` (NSIS installer produced by electron-builder).
 */
function pickAsset(assets: GitHubAsset[]): UpdateAsset | null {
  const isMac = process.platform === 'darwin';
  const isWin = process.platform === 'win32';
  const arch = process.arch;

  const matches = assets.filter(a => {
    const name = a.name.toLowerCase();
    if (isMac) {
      if (!name.endsWith('.dmg')) return false;
      if (arch === 'arm64') return name.includes('arm64');
      if (arch === 'x64') return name.includes('x64') || !name.includes('arm64');
      return false;
    }
    if (isWin) return name.endsWith('.exe');
    return false;
  });
  if (matches.length === 0) return null;
  // Prefer exact arch match when multiple candidates
  const best = matches[0];
  return { name: best.name, url: best.browser_download_url, size: best.size };
}

/** Compare semver-ish strings ("v1.2.3" == "1.2.3"). Prerelease suffixes are stripped. */
function compareSemver(a: string, b: string): number {
  const parse = (v: string) => v.replace(/^v/, '').split('-')[0].split('.').map(n => parseInt(n, 10) || 0);
  const aParts = parse(a);
  const bParts = parse(b);
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export class UpdateChecker {
  private cached: UpdateCheckResult | null = null;
  private cachedAt = 0;
  private cachedTtl = CACHE_TTL_MS;
  private inFlight: Promise<UpdateCheckResult> | null = null;
  private readonly repo: string;

  constructor(private readonly currentVersion: string, repo?: string) {
    this.repo = repo ?? DEFAULT_REPO;
  }

  /** Repo identifier in `owner/name` form — used to build per-version release URLs. */
  getRepo(): string {
    return this.repo;
  }

  async check(force = false): Promise<UpdateCheckResult> {
    if (!force && this.cached && Date.now() - this.cachedAt < this.cachedTtl) {
      return this.cached;
    }
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.fetch()
      .then(result => {
        this.cached = result;
        this.cachedAt = Date.now();
        this.cachedTtl = CACHE_TTL_MS;
        this.inFlight = null;
        return result;
      })
      .catch((err: unknown) => {
        this.inFlight = null;
        const message = err instanceof Error ? err.message : 'Unknown error';
        log.warn('Update check failed:', message);
        const errorResult: UpdateCheckResult = {
          currentVersion: this.currentVersion,
          latestVersion: null,
          updateAvailable: false,
          releaseUrl: null,
          publishedAt: null,
          checkedAt: new Date().toISOString(),
          error: message,
          asset: null,
        };
        this.cached = errorResult;
        this.cachedAt = Date.now();
        this.cachedTtl = ERROR_CACHE_TTL_MS;
        return errorResult;
      });
    return this.inFlight;
  }

  private async fetch(): Promise<UpdateCheckResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await globalThis.fetch(
        `https://api.github.com/repos/${this.repo}/releases/latest`,
        {
          headers: {
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'claude-dashboard',
          },
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        throw new Error(`GitHub API ${response.status}`);
      }
      const release = await response.json() as GitHubRelease;
      const latestVersion = release.tag_name;
      const updateAvailable = this.currentVersion !== 'dev'
        && !release.draft
        && !release.prerelease
        && compareSemver(latestVersion, this.currentVersion) > 0;
      return {
        currentVersion: this.currentVersion,
        latestVersion,
        updateAvailable,
        releaseUrl: release.html_url,
        publishedAt: release.published_at,
        checkedAt: new Date().toISOString(),
        error: null,
        asset: updateAvailable ? pickAsset(release.assets ?? []) : null,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
