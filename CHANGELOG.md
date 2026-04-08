# Changelog

All notable changes to Claude Dashboard since the initial commit.

## [Unreleased]

### Features

- **Chat interrupt** — Stop button now interrupts the active SDK conversation immediately.

- **Diff views in chat** — Edit/Write tool results show colored diffs (red for removed, green for added) instead of raw JSON. Bash commands show `$ command` with output below. File paths shown in tool headers.

- **Context attachments** — `+` button in chat input to attach files, branches, commits, or local changes to the message. Context chips shown above the textarea with remove buttons. Context prepended to the prompt when sending.

- **Task persistence** — Active tasks saved to `~/.claude-dashboard/tasks.json`. Task history endpoint (`GET /api/tasks/history`) for past tasks with cost/token stats. Tasks marked as ended when instances are killed.

- **Electron app** — Desktop app via Electron. Single command `npm run electron:dev` launches backend, frontend, and Electron window. `npm run electron:build` packages as `.dmg` (macOS) / `.exe` (Windows). macOS traffic lights support with draggable titlebar. Auto-detects running servers. Backend serves frontend static files in production. node-pty prebuilds bundled with correct permissions.

- **Unified sidebar** — Projects, instances, and worktrees merged into a single view. Active projects (with running instances or worktrees) float to the top and auto-expand. Instances and worktrees shown inline under their parent project. Click a project to launch, click an active project to expand/collapse. Worktrees clickable to resume. Workspace selector prominent at the top. Duplicate project names show their workspace origin. Favorite/play buttons hidden on active projects.

- **Instance status indicator** — Topbar shows a single `● N instances` with a color dot reflecting the highest-priority status (blue animated = processing, green = waiting, grey = idle).

- **Chat mode (Agent SDK)** — New instance mode using the Claude Agent SDK instead of PTY. Supports structured message streaming, markdown rendering (react-markdown + Prism syntax highlighting), thinking blocks, tool use/result grouping, tool progress ring, and permission/question prompts. Model (Opus/Sonnet/Haiku), permission mode (Ask/Plan/Auto-Edit/Full Access), and effort level (High/Medium/Low) selectable from the input bar.

- **Terminal / Chat toggle** — Launch modal now has a Terminal/Chat mode toggle. Terminal uses PTY as before, Chat uses the Agent SDK.

- **Design token system** — Complete visual overhaul with semantic CSS tokens (`bg-root`, `bg-surface`, `text-primary`, `text-muted`, `border-border-default`, etc.) via `@theme` blocks. Dark theme by default, light theme ready. Custom thin scrollbars (6px, themed). All 25+ frontend components migrated from hardcoded Tailwind colors to tokens.

- **2-column layout** — Sidebar (instances + projects) on the left, main content (Chat/Terminal + Changes/PR tabs) in the center. Sidebar collapsible with animation (⌘B).

- **Context panel** — Toggleable right panel (⌘I) showing instance context: branch, path, model, cost, token usage, modified files list, and collapsible CLAUDE.md preview. Auto-refreshes every 10s.

- **File explorer** — Toggleable right panel (⌘E) with a tree view of the project files. Lazy-loaded directory expansion, file type icons (color-coded by extension), search bar with debounced fuzzy find. Clicking a file opens it in the center column with syntax highlighting and line numbers.

- **File viewer** — New center tab for viewing file contents with Prism syntax highlighting, line numbers, and a close button. Opened from the file explorer or modified files list.

- **Claude AI favicon** — Favicon updated to the Anthropic star/sun logo in black on white.

- **Compact views for panels** — ChangesView and PullRequestView redesigned with vertical layout (file list on top, diff below) to work in narrow panels. PR header stacks vertically with compact commit chips.

- **Status monitor fix** — Improved Claude Code TUI prompt detection with heuristics for "for shortcuts" text and Jamber cactus marker, fixing the infinite spinner issue for terminal instances.

- **Windows support** — Fixed binary resolution (`claude.exe`), PATH separator (`;` vs `:`), process tree killing (`taskkill /F /T`), and worktree removal retry on EBUSY. Platform-adaptive keyboard shortcut hints (`Ctrl+` on Windows, `⌘` on macOS).

- **Pull / update repos** — Pull latest changes for a single repo (download icon on each project row) or all repos at once (download icon in the Projects header). Uses `git pull --ff-only` to avoid merge conflicts. Spinner feedback during pull.

- **Favorite projects** — Star projects to pin them at the top of the sidebar. Favorites are persisted in config and appear in a dedicated section above the tree view. In flat and search views, favorites are sorted first.

- **Branch prefix selector** (`4f711d0`) — When creating a worktree, choose the branch prefix (`feat/`, `fix/`, `chore/`, `test/`, `docs/`, `refactor/`, `claude/`). Defaults to `feat/`. A live preview of the full branch name is shown in the launch modal.

- **Changes view** (`25f1f35`) — New "Changes" tab in the main content area (alongside Terminal). Shows modified files with their status (modified, added, deleted, untracked) in a left panel, and a unified diff viewer on the right. Similar to the JetBrains Commit tab.

- **Pull Request view** (`25f1f35`) — New "Pull Request" tab showing the diff between the current branch and `origin/<default-branch>`. Displays branch info, file/addition/deletion stats, commit list, and full unified diff.

- **Tab system** (`25f1f35`) — The main content area now has three tabs: Terminal, Changes, and Pull Request. Tab resets to Terminal when switching instances.

- **Worktree robustness improvements** (`ba46bf7`) — Fetch origin and use latest remote default branch when creating worktrees or detaching branches. Prune stale worktree entries before removal. Kill running instances before deleting worktrees. Confirmation dialog before worktree deletion. Increased meta-project scan depth.

- **Tree / flat view toggle** (`9f07821`) — Button next to the search bar to switch between folder tree view and flat alphabetical list. Filter/search works in both modes.

- **Claude-styled favicon** (`19a1a9f`) — Custom SVG favicon matching Claude branding.

- **Resizable sidebar** (`3d5f1dd`) — Drag the right edge of the sidebar to resize (200px–600px).

- **Meta-projects support** (`799f757`) — Projects containing sub-projects (monorepos) are scanned recursively. Configurable `metaProjects` list in settings.

- **Detach branch to worktree** (`799f757`) — Move the current non-main branch to a worktree and reset the repo to the default branch, with automatic stash/restore for uncommitted changes.

- **Resume existing worktrees** (`799f757`) — "Resume" tab in the launch modal to relaunch Claude on previously created worktrees.

- **Scan paths editor** (`6de8a02`) — In-app settings modal to configure project scan paths. Auto-opens when no projects are found on first launch.

- **Syntax highlighting in diffs** — Regex-based token coloring (keywords, strings, comments, numbers) on context lines. Zero dependencies.

- **Collapsible diff sections** — Click file headers to collapse/expand hunks. Chevron + line count indicator. Collapse all / Expand all button.

- **Instance status filter** — Filter buttons (All/Waiting/Processing/Launching/Idle) in the Instances section, visible when 2+ active instances.

- **Undo worktree deletion** — 5-second undo banner after confirming worktree deletion. Click Undo to cancel.

- **Minimum font size 12px** — All `text-[10px]` and `text-[11px]` bumped to `text-[12px]` for readability (except diffs and keyboard hints).

- **Sidebar resize handle** — 8px wide hit area with a visible pill indicator on hover, replacing the invisible 1px handle.

- **Expandable ContextBanner** — Click the last user prompt to expand/collapse (was clamped to 5 lines with no way to see more).

- **Always-visible action icons** — Favorite, pull, delete, and launch buttons are now always visible (muted color) instead of appearing only on hover. Icons aligned with the repo name line.

- **Independent favorite/tree expand state** — Expanding worktrees in the favorites section no longer expands them in the tree view and vice versa.

- **Worktree row alignment** — Worktree sub-rows are now aligned with the parent project's branch line.

- **Branch to worktree** — New "Branches" tab in the launch modal lists local branches without an existing worktree. Click a branch to create a worktree and launch Claude in it.

- **Checkout default branch** — New button (↺) to switch a project back to its default branch (main/master/develop). Replaces the pull button when on a non-main branch. Checks for uncommitted changes before switching. Shared spinner for both operations.

- **Launch on current branch** — New "Launch on {branch}" button in the launch modal to run Claude directly on the current branch without creating a worktree.

- **PR link in branch diff view** — The Pull Request tab now shows a clickable link to the GitHub PR when one exists for the current branch (via `gh pr view`).

- **Sidebar polish** — Default width increased to 340px. Custom chevron on the root selector dropdown for consistent spacing.

### Accessibility

- **Keyboard-discoverable actions** — All hover-only buttons (favorite, pull, delete, launch) now appear on `focus-visible`, making them accessible via keyboard Tab navigation.

- **Toast aria-live** — Toast container uses `aria-live="polite"` and `role="status"` so screen readers announce notifications. Close button has `aria-label`.

- **Semantic HTML fix** — Replaced `<span role="button">` with real `<button>` in AttentionQueueBanner.

- **Modal focus trap** — Tab/Shift+Tab is trapped within LaunchModal, ScanPathsModal, and delete confirmation dialogs. First focusable element is auto-focused on open.

- **Aria-labels** — All icon-only buttons across the app now have `aria-label` attributes.

- **Focus outline** — Global `focus-visible` violet outline for all interactive elements.

### UX

- **Socket connection indicator** — Green/red dot in the topbar showing WebSocket connection status. Red pulses when disconnected.

- **Typing lock indicator** — Violet "typing" badge in topbar when queue auto-select is paused because the user is typing in the terminal.

- **Keyboard shortcuts** — `⌘1`/`⌘2`/`⌘3` (or Ctrl) to switch between Terminal, Changes, and Pull Request tabs. Hints shown on tab buttons.

- **Copy commit hash** — Hover a commit chip in the Pull Request view to reveal a copy button for the hash.

### Refactoring

- **Async git operations** — All `execSync` calls in the backend replaced with async `exec` (promisified). No longer blocks the event loop during git fetch, pull, diff, or worktree operations. `pull-all` now runs pulls in parallel via `Promise.all`.

- **React Context for ProjectList** — Replaced 16-prop drilling through TreeNodeList/FolderRow/ProjectRow with a `ProjectTreeContext`. Reduced `TreeProps` to only folder-specific props.

- **Socket reconnection** — Added automatic reconnection with infinite retries and connect/disconnect logging.

- **Render-time setState fix** — Moved `setExpanded` logic from render phase into `useEffect` in ProjectList.

- **Toast ID generation** — Replaced module-level increment counter with `crypto.randomUUID()` to avoid potential collisions.

- **DiffViewer keys** — Replaced array index keys with `file.fileName` for stable list rendering.

- **Scanner homedir** — Replaced `process.env.HOME` with `os.homedir()` for reliability.

### Fixes

- **Worktree deletion resilience** — Branch cleanup (`git branch -D`) now runs even if directory removal fails. Frontend instance list is re-synced after worktree deletion.

- **Kill TDZ crash** — Fixed `ReferenceError: Cannot access 'forceKillTimeout' before initialization` when killing an already-exited process.

- **Dismiss exited instances** — Exited instances now have a remove button to clear them from the list (client-side only, no backend call).

- **Pull spinner flash on mouse leave** — Spinner and download button are now separate elements to prevent the download icon from briefly flashing when the pull completes and the mouse is no longer hovering.

- **PR diff comparing against stale local branch** (`25f1f35` fix) — Branch diff now compares against `origin/<branch>` instead of the local branch to avoid showing incorrect file counts.

- **Buffer lookup crash** (`ba46bf7`) — `getBuffer()` now returns an empty string instead of throwing when an instance is not found.

- **Noisy detach logs** (`ba46bf7`) — Terminal detach events are only logged when the socket was actually attached.

- **Terminal shown for exited instances** (`ba46bf7`) — Exited instances no longer render the terminal component; an "Instance has exited" message is shown instead.
