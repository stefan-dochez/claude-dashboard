# Changelog

All notable changes to Claude Dashboard since the initial commit.

## [0.12.0]

### Features

- **Open in IDE** — Click the code icon (`</>`) on any project in the sidebar to open it in the appropriate IDE. Auto-detects the best IDE based on project files: `.sln`/`.csproj` → Rider, `package.json`/`tsconfig.json`/`angular.json` → WebStorm, fallback → VS Code. Backend service handles IDE detection (CLI path, macOS `mdfind`, Windows `where`), with a 1-minute detection cache. Cross-platform support (macOS, Windows, Linux).

## [0.11.1]

### Fixes

- **Markdown file rendering** — FileViewer now renders `.md` files as formatted HTML (headings, tables, lists, code blocks with syntax highlighting) instead of displaying raw source. Uses `react-markdown` + `remark-gfm` for GFM table support. A Source/Preview toggle in the header lets users switch between rendered and raw views.

## [0.11.0]

### Features

- **Broadcast mode** — Toggle the "Broadcast" button in the tab bar (visible in split mode with 2+ terminals) to send the same input to all split terminals simultaneously. When active, the button turns amber, each pane shows a ⚡ indicator in its header, and non-focused panes get an amber ring. Typing in the focused terminal forwards keystrokes to all other split instances via socket. Broadcast is automatically disabled when exiting split mode.

## [0.10.0]

### Features

- **Split terminal view** — Display 2-4 terminal instances side by side in a CSS grid layout. Click the "Split" button in the tab bar (visible when 2+ terminal instances are running) to enter split mode. An "Add terminal" pane with an instance picker lets you choose which instances to show. Each pane has a mini-header with project name, branch, and a close button. Click a pane to focus it (highlighted with a blue ring). "Unsplit" returns to single-terminal mode. Exited instances are automatically removed from the split.

## [0.9.1]

### Fixes

- **Export button placement** — Moved the session export button from a floating overlay in the terminal top-left corner to the tab bar, right-aligned next to Terminal/Changes/PR tabs. Cleaner placement with no content overlap.

## [0.9.0]

### Features

- **Export terminal session** — Download button (top-left of terminal) exports the full PTY buffer as a `.txt` file with ANSI sequences stripped. Backend endpoint `GET /api/instances/:id/export?format=txt` serves the content as an attachment with a timestamped filename (e.g. `claude-dashboard_2026-04-12T21-07-55.txt`).

## [0.8.0]

### Features

- **Terminal search (Cmd+F)** — Press `Cmd+F` (or `Ctrl+F` on Windows/Linux) in the terminal to open a floating search bar. Incremental search with match highlighting powered by xterm.js `SearchAddon`. Displays current/total match count (e.g. `2/5`). Navigate matches with `Enter` (next) and `Shift+Enter` (previous). Press `Escape` or the close button to dismiss. Decorations are cleared and focus returns to the terminal on close.

## [0.7.0]

### Features

- **Dark/Light theme toggle** — Sun/Moon button in the topbar to switch between dark and light themes. Persisted in localStorage. Also available via the command palette. Terminal stays dark in both modes. Meta theme-color tag updates dynamically for correct browser/OS chrome color.
- **Auto-scroll lock in terminal** — The terminal now detects when you scroll up and pauses auto-scrolling. A floating "scroll to bottom" button appears in the bottom-right corner. Auto-scroll re-enables when you scroll back to the bottom or click the button.
- **Close instance shortcut (Cmd/Ctrl+W)** — Kill the currently selected instance with a single keystroke. Also available in the command palette. Works on both macOS (Cmd+W) and Windows/Linux (Ctrl+W).
- **Tab persistence across sessions** — Selected instance, active tab, and opened file are saved to localStorage and restored on reload. Stale references (e.g. instance no longer running) are cleaned up automatically.

## [0.6.4]

### Fixes

- **Hide File Explorer & Context Info buttons without instance** — The File Explorer (⌘E) and Context Info (⌘I) buttons in the topbar are now completely hidden when no instance is selected, instead of being shown as disabled. Keyboard shortcuts are still ignored and the right panel auto-closes when the instance is deselected.
- **Restructure custom skills for proper discovery** — Moved skill files into subdirectories with `SKILL.md` naming convention for correct Claude Code discovery.

## [0.6.3]

### Fixes

- **Disable File Explorer & Context Info without instance** — The File Explorer (⌘E) and Context Info (⌘I) buttons in the topbar are now disabled (grayed out, non-clickable) when no instance is selected. Keyboard shortcuts are also ignored, commands are hidden from the palette, and the right panel auto-closes if the selected instance is deselected.

## [0.6.2]

### Features

- **Copy code blocks** — Hover any syntax-highlighted code block in chat to reveal a copy button (top-right corner). Copies the raw code to clipboard with a brief checkmark confirmation.

- **Slash command autocomplete** — Type `/` at the start of the chat input to see a dropdown of available skills with descriptions. Navigate with arrow keys, Tab/Enter to select, click outside or Escape to dismiss. Skills are loaded dynamically from three sources: project skills (`.claude/skills/*.md`), global skills (`~/.claude/skills/`), and marketplace plugins (`~/.claude/plugins/marketplaces/`). Marketplace skills are prefixed with their plugin name (e.g. `dataintegration-bee:feature-breakdown`). Commands are sent directly to the Claude SDK.

## [0.6.0]

### Features

- **System Notifications** — Native OS notifications when an instance transitions to `waiting_input` while the app is not in focus. Configurable via the command palette ("Enable/Disable Notifications"). Optional sound support. App badge count shows the number of instances waiting for input (via Web Badge API). Notification settings persisted in config.

- **Cost & Analytics Dashboard** — Full analytics modal accessible via `Cmd+Shift+A` or command palette. Displays: summary cards (total cost, tokens, tasks, avg cost/task), cost over time area chart, cost by project bar chart, cost by model bar chart, input/output token pie chart, and a detailed model comparison table. Filterable by time range (7d/30d/90d/all). Powered by recharts.

## [0.5.7]

### Features

- **Prompt Templates** — Reusable prompt template library accessible via `Cmd+T` or the template picker button in the chat input. Create, edit, duplicate, and delete templates with support for `{{variable}}` placeholders that are auto-detected and prompted before insertion. Templates can be scoped globally or per-project, with usage tracking and most-used-first sorting. Import/export templates as JSON for team sharing. Integrated into the command palette as "Prompt Templates". Full CRUD backend with persistence in `~/.claude-dashboard/config.json`.

### Fixes

- **Template picker click-outside race condition** — Clicking a template with variables appeared to do nothing because React flushed the state update (showing the variable fill dialog) before the document-level `mousedown` handler ran, detaching the click target from the DOM. The click-outside handler now ignores events whose target has been removed from the DOM by a React re-render.

## [0.5.5]

### Features

- **Command Palette (⌘K)** — VS Code-style command launcher accessible from anywhere via `Cmd+K` (or `Ctrl+K` on Windows/Linux). Fuzzy search across all available actions, active instances, and projects. Supports keyboard navigation (↑↓), instant execution (Enter), and displays keyboard shortcuts inline. Categories: Actions (toggle panels, switch tabs, open modals), Instances (switch to/kill running instances), Projects (quick launch in terminal or chat mode). Favorites appear first in project results.

- **Roadmap** — Added `ROADMAP.md` documenting planned features for v0.6, v0.7+, and v1.0.

## [0.5.4]

### Fixes

- **Context panel not resizable** — ContextPanel had a hardcoded `w-[280px]` width that ignored the parent's resize state. Changed to `w-full` so it respects the draggable `rightPanelWidth`, matching FileExplorer behavior.

## [0.5.3]

### Fixes

- **Gray resize handle** — Changed the panel resize handle color from blue to neutral gray for a more subtle appearance.

## [0.5.2]

### Bug Fixes

- **Status monitor stuck on "processing"** — Claude Code's TUI redraws the entire screen via cursor-positioning escape sequences. The previous approach stripped ANSI from a contiguous 4KB tail, producing mostly whitespace where prompt markers (`❯`, `for shortcuts`, etc.) were lost. Now uses a two-pass approach on a larger 20KB window: raw substring search for known markers, then per-line ANSI strip for config patterns and prompt characters.

## [0.5.1]

### Refactoring

- **Structured logger** — Replaced all `console.log` calls across 11 backend files with a lightweight leveled logger (`logger.ts`). Supports `error`, `warn`, `info`, `debug` levels with automatic `[module]` prefixes. Configurable via `LOG_LEVEL` env var.

- **Centralized constants** — Extracted ~20 magic numbers (timeouts, buffer sizes, PTY dimensions, search limits) into `constants.ts`. Eliminates scattered hardcoded values across `process-manager.ts`, `routes.ts`, `task-store.ts`, and `title-generator.ts`.

- **asyncHandler wrapper** — Introduced an `asyncHandler()` utility in `routes.ts` that wraps async route handlers with automatic error catching and JSON error responses. Eliminates ~30 identical try/catch blocks. Added `refreshProjectsInBackground()` helper to deduplicate 6 copies of the same pattern.

- **Path traversal validation** — File-serving endpoints (`/api/files`, `/api/files/content`, `/api/files/search`, `/api/code/search`) now validate that requested paths fall within configured `scanPaths`. Returns 403 for out-of-bounds paths.

- **Event listener cleanup** — `setupSocketHandlers` and `setupStreamSocketHandlers` now use named handler functions and return a cleanup function to remove all listeners. Prevents potential memory leaks if handlers were ever re-initialized.

- **ChatView component extraction** — Extracted 5 inline sub-components (`MarkdownText`, `ThinkingBlock`, `ToolDetailView`, `ToolGroupBlock`, `MessageBubble`) into `components/chat/`. Reduces ChatView by ~300 lines.

- **SidebarContext for prop drilling** — Introduced `SidebarActionsContext` + `useSidebarActions` hook to replace 18-prop drilling through `Sidebar` → `ProjectRow`. `ProjectRow` extracted to its own file, now takes 3 props instead of 18.

- **Shared frontend constants** — `STATUS_DOT` and `STATUS_LABEL` moved to `constants.ts`, eliminating duplication between Sidebar and the (now removed) TaskSidebar.

- **Dead code removal** — Removed 3 unused components (`TaskSidebar`, `ContextBanner`, `AttentionQueueBanner`), unused `Clock` import in `LaunchModal`, and dead `handleSkip`/`handleJump` callbacks in `App.tsx`. Lint now passes with 0 warnings.

## [0.5.0]

### Features

- **Chat UI redesign (Claude Desktop style)** — Complete visual overhaul of the chat interface to match Claude Desktop's appearance. Messages no longer use avatar circles or bubble styling — user messages are right-aligned with subtle background, assistant messages are plain text. Input area is now a single unified rounded container with textarea, attach button, model/permission/effort selectors, and send button all inside. Thinking blocks and tool groups use a cleaner, more compact collapsible style with left border indicators. Empty state simplified. Permission and question prompts restyled with rounded cards.

### Bug Fixes

- **Focus outline on chat input** — Fixed the global `*:focus-visible` violet outline appearing on the chat textarea. Inputs and textareas now suppress the global outline since their parent containers handle focus styling via `focus-within`.

- **Custom application menu** — Removed the default Electron menu bar on Windows/Linux (it served no purpose). On macOS, replaced it with a minimal menu: App (About, Hide, Quit), Edit (copy/paste for terminal), Window (Minimize, Zoom, Close).

### Bug Fixes

- **Git not found in Electron on Windows** — When the Electron app launched the backend, the inherited PATH did not include `C:\Program Files\Git\cmd`. All git commands (branch detection, worktree creation) failed silently, causing every project to show `gitBranch: null` and hiding the "New task" tab. Added Git's install directory to the extra paths in `platform.ts`, `scanner.ts`, `worktree-manager.ts`, and Electron's `getEnv()`.

- **Terminal output lost after socket reconnection** — When the WebSocket briefly disconnected (Wi-Fi hiccup, sleep/wake), the terminal would stop updating even though input still worked. Fixed by re-attaching to the PTY stream on socket reconnection. Also reordered backend attach logic to eliminate a potential output gap between history snapshot and live forwarding.

### Features

- **Windows compatibility** — Cross-platform support for Windows: centralized platform abstractions (`platform.ts`), cross-platform postinstall script, `/dev/null` → `nul` on Windows, cross-platform path shortening via `usePlatform` hook, Windows process kill via `taskkill`, PTY terminal name adaptation, and PowerShell equivalents for all shell scripts.

- **Resizable panels** — Sidebar and right panel (file explorer, context) are now draggable to resize. Hover the border between panels to reveal the resize handle. Sidebar clamps 200–480px, right panel 200–500px.

- **Token stats in history** — History entries now show model name, input/output token counts (in thousands), and cost. Helps track resource usage across sessions.

- **Kill confirmation for worktrees** — Killing an instance with a worktree now shows a 2-step confirmation: "Kill" (keep worktree) or "+wt" (kill and delete worktree). Non-worktree instances kill immediately as before.

- **Git workflow in Changes tab** — Commit, push, and create PRs directly from the Changes view. Commit form with message textarea, "Stage all" checkbox, and Cmd+Enter shortcut. Push auto-detects missing upstream and retries with `--set-upstream`. PR creation with inline title/body form, returns clickable PR URL.

- **File utilities extraction** — `getFileIcon()`, `detectLanguage()`, and icon/language mappings extracted to `utils/fileUtils.ts` for reuse. Added support for Dart, Lua, R, Scala, SCSS, and Less.

- **Code search modal** — Full-text search across project files (Cmd+Shift+F). Debounced grep-based search with results grouped by file, line numbers, match highlighting, and keyboard navigation (arrows + Enter). Opens the selected file in the file viewer.

- **@-mention autocomplete** — Type `@` in the chat input to search project files inline. Debounced search (150ms), keyboard navigation (↑↓/Tab/Enter), results inserted as file references. Works alongside the existing `+` context menu.

- **Staleness recovery** — If no streaming events are received for 30 seconds during chat processing, the UI automatically resets the sending state to prevent permanently stuck sessions. Clears on permission/question prompts.

- **Rate limit countdown** — When the API rate-limits a chat session, an amber banner shows the remaining time before the limit resets. Auto-dismisses when the cooldown expires.

- **Context usage bar** — Progress bar in the session info showing context window consumption (tokens used / max). Color-coded: green (<70%), amber (70-90%), red (>90%). Warning banner when context exceeds 80%, with `/compact` suggestion above 95%.

- **Code selection to chat** — Select code in the FileViewer, click "Send to chat" to attach it as context. Shows as a violet chip with file name, line range, and line count. Cleared after sending.

- **Terminal session resume** — Terminal sessions now track their Claude session ID (`--session-id` at spawn). Resuming from history uses `--resume <sessionId>` to continue the conversation. Both terminal and chat sessions are persisted to the task store.

- **Session history in launch modal** — New "History" tab in the launch modal shows past sessions for the selected project. Click to resume a session with its full conversation context.

- **Auto-generated session titles** — After the first user message, a lightweight Haiku call generates a 3-8 word title summarizing the session. Displayed in the sidebar history and launch modal instead of the raw first prompt.

- **Graceful shutdown persistence** — Active sessions are properly ended in the task store on app shutdown (SIGINT/SIGTERM). Orphaned tasks from crashes are auto-closed on next startup.

- **Dynamic version display** — App version shown at the bottom of the sidebar, fetched from the backend (`/api/version`). Automatically reflects the version set by CI from git tags.

- **Directory existence check** — The instance spawn route now verifies the target directory exists before launching, preventing crashes when resuming sessions on deleted worktrees.

- **History filtered by workspace** — The sidebar history section now only shows sessions belonging to the selected workspace/scan path.

- **Dynamic version display fix** — Version now correctly resolved from package.json using `import.meta.url` at startup, working in dev (tsx), prod (dist), and Electron. Falls back to `dev` if not found.

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
