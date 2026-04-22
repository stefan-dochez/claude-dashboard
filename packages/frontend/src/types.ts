export const PROJECT_TYPE = {
  REPO: 'repo',
  WORKSPACE: 'workspace',
  MONOREPO: 'monorepo',
} as const;
export type ProjectType = typeof PROJECT_TYPE[keyof typeof PROJECT_TYPE];

export interface Project {
  name: string;
  path: string;
  gitBranch: string | null;
  hasClaudeMd: boolean;
  lastModified: string;
  isWorktree: boolean;
  type: ProjectType;
  parentProject?: string;
}

export type CiState = 'success' | 'failure' | 'running' | 'neutral';
export type PrState = 'OPEN' | 'MERGED' | 'CLOSED';

export interface CiSummary {
  passed: number;
  failed: number;
  running: number;
  total: number;
}

/** Aggregated state of a branch: CI status derived from check-runs, plus PR state. */
export interface BranchStatus {
  ciState: CiState | null;
  ciSummary: CiSummary;
  prState: PrState | null;
  prUrl: string | null;
}

export const INSTANCE_STATUS = {
  LAUNCHING: 'launching',
  PROCESSING: 'processing',
  WAITING_INPUT: 'waiting_input',
  IDLE: 'idle',
  EXITED: 'exited',
} as const;

export type InstanceStatus = typeof INSTANCE_STATUS[keyof typeof INSTANCE_STATUS];

export interface Instance {
  id: string;
  projectPath: string;
  projectName: string;
  pid: number;
  status: InstanceStatus;
  createdAt: string;
  lastActivity: string;
  taskDescription: string | null;
  worktreePath: string | null;
  parentProjectPath: string | null;
  branchName: string | null;
  lastUserPrompt: string | null;
  mode?: 'terminal' | 'chat';
  sessionId?: string | null;
  model?: string | null;
  totalCostUsd?: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
}

export interface InstanceContext {
  instanceId: string;
  taskDescription: string | null;
  lastUserPrompt: string | null;
}

export interface GitFileStatus {
  status: string;
  path: string;
}

export interface BranchDiffResponse {
  diff: string;
  baseBranch: string;
  currentBranch: string;
  stats: {
    filesChanged: number;
    additions: number;
    deletions: number;
  };
  commits: Array<{
    hash: string;
    message: string;
    date: string;
  }>;
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking';
  text?: string;
  thinking?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
  stdout?: string;
  stderr?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: ContentBlock[];
  timestamp: string;
}

export interface HistoryTask {
  id: string;
  projectPath: string;
  projectName: string;
  worktreePath: string | null;
  branchName: string | null;
  taskDescription: string | null;
  sessionId: string | null;
  model: string | null;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  mode: 'terminal' | 'chat';
  firstPrompt: string | null;
  title: string | null;
  createdAt: string;
  endedAt: string | null;
}

export interface SessionInfo {
  sessionId: string | null;
  model: string | null;
  tools?: string[];
  mcpServers?: { name: string; status: string }[];
  permissionMode?: string;
}

export interface PullRequest {
  repo: string;
  repoName: string;
  number: number;
  title: string;
  url: string;
  author: string;
  assignees: string[];
  reviewers: string[];
  branch: string;
  baseBranch: string;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AttentionQueueItem {
  instanceId: string;
  projectName: string;
  enteredAt: number;
}

export interface PromptTemplateVariable {
  name: string;
  defaultValue?: string;
  placeholder?: string;
}

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  variables: PromptTemplateVariable[];
  tags: string[];
  scope: 'global' | 'project';
  projectPath?: string;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

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
