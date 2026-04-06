import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ConfigService } from './config.js';

const execPromise = promisify(exec);
function execAsync(cmd: string, opts: { encoding: BufferEncoding; cwd?: string; timeout?: number }) {
  return execPromise(cmd, { ...opts, shell: process.platform === 'win32' ? true as unknown as string : undefined });
}

interface Project {
  name: string;
  path: string;
  gitBranch: string | null;
  hasClaudeMd: boolean;
  lastModified: Date;
  isWorktree: boolean;
  isMeta: boolean;
  parentProject?: string;
}

export class ProjectScanner {
  private cache: Project[] | null = null;
  private cacheTimestamp = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(private configService: ConfigService) {}

  async scan(): Promise<Project[]> {
    const now = Date.now();
    if (this.cache && now - this.cacheTimestamp < this.CACHE_TTL) {
      return this.cache;
    }

    const config = await this.configService.get();
    const projects: Project[] = [];
    const seen = new Set<string>();

    const resolvedMetaProjects = new Set(
      (config.metaProjects ?? []).map(p =>
        path.resolve(p.replace(/^~/, os.homedir())),
      ),
    );

    for (const scanPath of config.scanPaths) {
      const resolved = path.resolve(scanPath.replace(/^~/, os.homedir()));
      await this.scanDirectory(resolved, config.projectMarkers, config.scanDepth, projects, seen, resolvedMetaProjects);
    }

    // Sort by name
    projects.sort((a, b) => a.name.localeCompare(b.name));

    this.cache = projects;
    this.cacheTimestamp = now;
    console.log(`[scanner] Found ${projects.length} projects`);
    return projects;
  }

  async refresh(): Promise<Project[]> {
    this.cache = null;
    this.cacheTimestamp = 0;
    return this.scan();
  }

  private async scanDirectory(
    dir: string,
    markers: string[],
    depth: number,
    results: Project[],
    seen: Set<string>,
    metaProjects: Set<string>,
  ): Promise<void> {
    if (depth < 0) return;

    try {
      const stat = await fs.stat(dir);
      if (!stat.isDirectory()) return;
    } catch {
      return;
    }

    const realDir = await fs.realpath(dir).catch(() => dir);
    if (seen.has(realDir)) return;

    // Check if this directory is a project
    const isProject = await this.hasAnyMarker(dir, markers);
    if (isProject) {
      seen.add(realDir);
      const isMeta = metaProjects.has(realDir) || metaProjects.has(dir);
      const project = await this.buildProject(dir, undefined, isMeta);
      results.push(project);

      // Also check for git worktrees
      const worktrees = await this.detectWorktrees(dir);
      for (const wt of worktrees) {
        if (!seen.has(wt)) {
          seen.add(wt);
          const wtProject = await this.buildProject(wt, dir);
          results.push(wtProject);
        }
      }

      // For meta-projects, continue scanning subdirectories with extra depth
      // since sub-repos can be nested deeply (e.g. src/team/app/<repo>)
      if (isMeta) {
        const config = await this.configService.get();
        const metaDepth = config.scanDepth + 3;
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
              await this.scanDirectory(path.join(dir, entry.name), markers, metaDepth - 1, results, seen, metaProjects);
            }
          }
        } catch {
          // Permission denied or other errors
        }
      }

      return;
    }

    // Not a project, scan subdirectories
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await this.scanDirectory(path.join(dir, entry.name), markers, depth - 1, results, seen, metaProjects);
        }
      }
    } catch {
      // Permission denied or other errors
    }
  }

  private async hasAnyMarker(dir: string, markers: string[]): Promise<boolean> {
    for (const marker of markers) {
      try {
        await fs.access(path.join(dir, marker));
        return true;
      } catch {
        // Marker not found
      }
    }
    return false;
  }

  private async buildProject(projectPath: string, parentProject?: string, isMeta = false): Promise<Project> {
    const name = path.basename(projectPath);
    const gitBranch = await this.getGitBranch(projectPath);
    const hasClaudeMd = await fs.access(path.join(projectPath, 'CLAUDE.md')).then(() => true).catch(() => false);
    const lastModified = await this.getLastModified(projectPath);
    const isWorktree = parentProject !== undefined || await this.isGitWorktree(projectPath);

    return {
      name,
      path: projectPath,
      gitBranch,
      hasClaudeMd,
      lastModified,
      isWorktree,
      isMeta,
      ...(parentProject ? { parentProject } : {}),
    };
  }

  private async getGitBranch(dir: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', {
        cwd: dir,
        encoding: 'utf-8',
        timeout: 5000,
      });
      const branch = stdout.trim();
      return branch || null;
    } catch {
      return null;
    }
  }

  private async isGitWorktree(dir: string): Promise<boolean> {
    try {
      const gitPath = path.join(dir, '.git');
      const stat = await fs.stat(gitPath);
      if (stat.isFile()) {
        // .git is a file in worktrees, pointing to the main repo
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  private async detectWorktrees(dir: string): Promise<string[]> {
    const worktreesDir = path.join(dir, '.git', 'worktrees');
    const worktrees: string[] = [];

    try {
      const entries = await fs.readdir(worktreesDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          try {
            const gitdirFile = path.join(worktreesDir, entry.name, 'gitdir');
            const gitdir = (await fs.readFile(gitdirFile, 'utf-8')).trim();
            const worktreePath = path.dirname(gitdir);
            const resolvedPath = path.resolve(worktreePath);
            try {
              await fs.access(resolvedPath);
              worktrees.push(resolvedPath);
            } catch {
              // Worktree directory no longer exists
            }
          } catch {
            // Can't read gitdir
          }
        }
      }
    } catch {
      // No worktrees directory
    }

    return worktrees;
  }

  private async getLastModified(dir: string): Promise<Date> {
    try {
      const stat = await fs.stat(dir);
      return stat.mtime;
    } catch {
      return new Date();
    }
  }
}

export type { Project };
