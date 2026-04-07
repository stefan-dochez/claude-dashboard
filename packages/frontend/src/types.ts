export interface Project {
  name: string;
  path: string;
  gitBranch: string | null;
  hasClaudeMd: boolean;
  lastModified: string;
  isWorktree: boolean;
  isMeta: boolean;
  parentProject?: string;
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

export interface SessionInfo {
  sessionId: string | null;
  model: string | null;
  tools?: string[];
  mcpServers?: { name: string; status: string }[];
  permissionMode?: string;
}

export interface AttentionQueueItem {
  instanceId: string;
  projectName: string;
  enteredAt: number;
}
