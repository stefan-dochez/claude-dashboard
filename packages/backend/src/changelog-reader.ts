import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from './logger.js';

const log = createLogger('changelog-reader');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ChangelogEntry {
  version: string;
  content: string;
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

function findChangelogPath(): string | null {
  const candidates = [
    process.env.CHANGELOG_PATH,
    path.resolve(__dirname, '../../../CHANGELOG.md'),
    path.resolve(__dirname, '../../CHANGELOG.md'),
    path.resolve(process.cwd(), 'CHANGELOG.md'),
    path.resolve(process.cwd(), '../../CHANGELOG.md'),
  ].filter((p): p is string => Boolean(p));
  for (const p of candidates) {
    try {
      if (fsSync.statSync(p).isFile()) return p;
    } catch { /* not found, try next */ }
  }
  return null;
}

function parseSections(text: string): ChangelogEntry[] {
  const sections: ChangelogEntry[] = [];
  const headerRe = /^## \[([^\]]+)\]/;
  let current: { version: string; lines: string[] } | null = null;
  for (const line of text.split('\n')) {
    const match = line.match(headerRe);
    if (match) {
      if (current) sections.push({ version: current.version, content: current.lines.join('\n').trim() });
      current = { version: match[1], lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push({ version: current.version, content: current.lines.join('\n').trim() });
  return sections;
}

/**
 * Read changelog entries in the range (since, currentVersion].
 * If `since` is null, returns only the entry matching currentVersion.
 */
export async function readChangelogSince(
  since: string | null,
  currentVersion: string,
): Promise<ChangelogEntry[]> {
  const filepath = findChangelogPath();
  if (!filepath) {
    log.warn('CHANGELOG.md not found — tried CHANGELOG_PATH env var and common relative paths');
    return [];
  }
  const text = await fs.readFile(filepath, 'utf-8');
  const sections = parseSections(text);
  return sections.filter(s => {
    if (compareSemver(s.version, currentVersion) > 0) return false;
    if (since === null) return compareSemver(s.version, currentVersion) === 0;
    return compareSemver(s.version, since) > 0;
  });
}
