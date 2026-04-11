// ---- Timeouts (milliseconds) ----

export const TIMEOUTS = {
  /** SIGTERM → SIGKILL escalation when killing a PTY process */
  KILL_SIGTERM: 3000,
  /** Hard give-up timeout when killing a single PTY process */
  KILL_GIVE_UP: 5000,
  /** Hard ceiling for killAll — force-destroy remaining after this */
  KILL_ALL: 8000,
  /** Default timeout for short git commands (rev-parse, branch, etc.) */
  GIT_SHORT: 5000,
  /** Timeout for git fetch / clone / worktree add */
  GIT_LONG: 30000,
  /** Timeout for git push */
  GIT_PUSH: 60000,
  /** Timeout for GitHub CLI commands (gh pr view, gh pr create) */
  GH_CLI: 10000,
  /** Timeout for shell search commands (find, grep) */
  SHELL_SEARCH: 5000,
  /** Timeout for grep code search */
  SHELL_GREP: 10000,
  /** Timeout for git commit */
  GIT_COMMIT: 30000,
  /** Timeout for git add */
  GIT_ADD: 15000,
} as const;

// ---- Buffer / Size limits ----

export const LIMITS = {
  /** Max PTY output buffer per instance (bytes) */
  PTY_BUFFER_BYTES: 512 * 1024,
  /** Max file size readable via the file content endpoint (bytes) */
  FILE_READ_MAX_BYTES: 500 * 1024,
  /** Max tasks stored in task history */
  MAX_TASKS: 100,
  /** Max depth for find command in file search */
  FILE_SEARCH_DEPTH: 8,
  /** Max results from file search */
  FILE_SEARCH_RESULTS: 50,
  /** Max results from code search (file groups) */
  CODE_SEARCH_RESULTS: 30,
  /** Max lines returned from code search grep */
  CODE_SEARCH_LINES: 200,
  /** Max line length in grep results */
  GREP_LINE_LENGTH: 200,
  /** Default git log limit */
  GIT_LOG_LIMIT: 20,
  /** First user prompt truncation length */
  FIRST_PROMPT_LENGTH: 200,
  /** Title generator prompt truncation length */
  TITLE_PROMPT_LENGTH: 500,
  /** Tool result content preview length */
  TOOL_RESULT_PREVIEW: 3000,
} as const;

// ---- PTY defaults ----

export const PTY_DEFAULTS = {
  COLS: 120,
  ROWS: 30,
} as const;
