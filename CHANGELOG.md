# Changelog

All notable changes to Claude Dashboard since the initial commit.

## [0.21.4]

### UX

- **CI status as a left border, not a trailing icon** — The circle icons in the right column competed for attention with the status dot, mode icon, timestamp, and hover actions, making each row feel cluttered. Replaced with a 2px vertical stripe on the left edge of each session/worktree row, colored by aggregated CI state (green passed / rose failed / amber pulsed running) or PR state (violet merged, nothing for closed). Rendered via a `::before` pseudo-element so it doesn't consume layout space — the row content stays exactly where it was. Details (`3 passed · 1 failed · 2 running` or `PR merged`) are surfaced via a native `title` tooltip on the row.

  **Cleanup** — `CiStatusBadge.tsx` is gone, its type exports moved to `types.ts` as part of the frontend's shared type barrel. The alignment scaffolding added in 0.21.3 (`w-[28px]` timestamp/spacer, `w-3` badge slot, `min-w-[54px]` action container) is reverted since badges no longer need to line up in a column.

## [0.21.3]

### UX

- **CI badges aligned between session and worktree rows** — Session rows had a timestamp between the branch name and the CI badge; worktree rows didn't, so the two badges landed at different x-offsets and looked randomly placed when expanded under the same project. Both row types now share the same right-hand column layout: a fixed-width `w-[28px]` slot for the metadata (timestamp on sessions, empty spacer on worktrees), a `w-3` slot for the badge, and a shared `min-w-[54px]` slot for the hover actions. Both CI badges now sit in the same column regardless of the row type, and the differing action-button counts (IDE+kill on sessions vs. IDE+play+delete on worktrees) no longer pull the badges left/right.

## [0.21.2]

### Fixes

- **Sidebar CI badge reflected the wrong workflow** — `gh run list --branch X --limit 1` returns whichever workflow finished most recently, which on repos with several workflows attached to `pull_request` (e.g. `PR Labeler`, `Clear skip CI on Renovate PR`, the real CI) was often a trivial job. The tooltip showed `CI passed — PR Labeler` or `CI cancelled — Clear skip CI on Renovate PR` even when the actual CI was in a different state. Replaced with an aggregated read: a single `gh api repos/{slug}/commits/{branch}/check-runs` call gathers every check-run on the branch head and the service folds them into one state via shared `aggregateChecks()`. `cancelled`/`skipped`/`neutral` conclusions are ignored in the fold so a skipped workflow can't drag the result to a misleading grey, and `failure` still wins over `running` so an actionable red doesn't hide behind a still-running job. Tooltip now shows a count summary (`3 passed · 1 failed · 2 running`).

### Features

- **Distinguish merged / closed PRs in the sidebar and PR view** — A CI icon on a merged PR is stale by construction; a failed CI run next to a long-merged branch is actively misleading. The batch endpoint now also looks up the most recent PR per branch (`gh pr list --head <branch> --state all --limit 1 --json state,url`) and returns a `BranchStatus { ciState, ciSummary, prState, prUrl }`. Render priority in `CiStatusBadge`: merged PR → violet `GitMerge` icon (no CI color); closed PR → muted dash; open PR or no PR → the CI-state icon as before. The `PR` button in the Pull Request view header gets the same treatment: violet `GitMerge` pill for merged, muted `XCircle` for closed, and the previous CI-state coloring for open/unknown. `/api/git/pr-url` now returns `{ url, state }` rather than just `{ url }`.

  **Shape change** — `POST /api/git/ci-status` response went from `{ path: CiRun }` (a raw `gh run list` row) to `{ path: BranchStatus }`. The old `CiStatusService.getLatestRunForBranch` / `getLatestRunsBatch` / `noWorkflowsCache` are gone — all replaced by `getBranchStatus` / `getBranchStatusBatch`, keyed by `${path}::${branch}` with a 60s TTL.

## [0.21.1]

### UX

- **CI badges moved from project rows to instance/worktree rows** — The v0.21.0 design put a CI icon on every root project row, which was ambiguous: the badge reflected the current branch of the repo, but with several worktrees in flight there's no visual hint of *which* branch that was. The badge now appears inline on each active-session row and each standalone worktree row instead, right next to the branch name it refers to — never on a project root. Workspaces/monorepos were already skipped.

- **CI summary surfaced on the PR button, not in a pill list** — The `Checks` block under the PR header listed every check run (dozens on repos with matrix jobs — see the banking-consolidation monorepo), which drowned the commit list. The block is gone: the existing `PR` link in the Pull Request tab header is now colored by the aggregated CI state of the head commit — green (all passed), rose (any failed), amber with a pulse (any running), or the previous neutral green when no check data is available. The tooltip shows a compact summary (`3 passed · 1 failed · 2 running`), and the icon changes to match (check / X / circle-dot). Failure takes priority over running so an actionable red state isn't hidden behind a running job.

  Backend is unchanged — both `POST /api/git/ci-status` (batch) and `GET /api/git/checks` endpoints are still in use. The unused `ChecksBlock` and `CiStatusBadge` v1 components were deleted and `CiStatusBadge` was re-added with a simpler single-icon API.

## [0.21.0]

### Features

- **GitHub Actions status** — Every simple repo in the sidebar now shows a small colored icon reflecting the latest workflow run on its current branch: green check (success), red X (failure), animated amber dot (queued/in-progress), muted dash (cancelled/skipped). Click the icon to open the run on GitHub. Workspaces and monorepos don't get a badge since they span multiple branches. The Pull Request tab gains a `Checks` block above the commits list: a compact flex-wrap of pills, one per check run on the head commit, with the same color scheme and a count summary (`3 passed · 1 failed`).

  **Backend** — new `CiStatusService` wrapping `gh run list --branch` (for the sidebar badge) and `gh api repos/{slug}/commits/{sha}/check-runs` (for the PR view pill list). Slug resolution is reused from `PrAggregator` via a new public `resolveGitHubSlug()` accessor so the permanent slug cache isn't duplicated. Two caches: 60s TTL for the latest-run-per-branch (CI state changes fast), 2min TTL for per-commit checks (more stable). A session-wide `noWorkflowsCache` remembers repos whose first `gh run list` returned `[]` so the sidebar batch doesn't keep hammering `gh` for repos that will never have runs. Two new REST endpoints: `POST /api/git/ci-status` (batched `{ projects: [{path, branch}] }`) and `GET /api/git/checks?path=X&sha=Y`. PATH is enriched with `getExtraPaths()` so the `gh` binary resolves inside Electron.

### Fixes

- **Hidden files/folders invisible in File Explorer** — The `/api/files` endpoint was filtering out every entry whose name started with `.`, so dotfiles (`.env`, `.gitignore`) and dot-directories (`.claude/`, `.idea/`, `.github/`) never appeared in the tree. Changed the filter to only exclude `.git` (which would flood the tree with thousands of internal objects), alongside the existing `node_modules`, `dist`, `__pycache__` exclusions.

## [0.20.7]

### Fixes

- **Escape sequences polluting session history prompts** — After v0.20.6 enabled the WebGL renderer, xterm.js started responding to DECRQM mode queries (e.g. `CSI ? 2026 $ p` for synchronized output). The response `ESC[?2026;2$y` was sent through the terminal input stream, and the backend's escape-stripping regex in `process-manager.trackInput` only covered parameter bytes (`0-9 ; ?`) and finals (`a-zA-Z~`) — it didn't match intermediate bytes like `$` (0x24), so DECRQM responses slipped through and got prefixed to the captured `firstUserPrompt`. Broadened the regex to the full CSI grammar: `ESC [ <params 0x30-0x3F>* <intermediates 0x20-0x2F>* <final 0x40-0x7E>`. Existing history entries created between v0.20.6 and this release will still show the prefix — new sessions are clean.

## [0.20.6]

### Fixes

- **Terminal glyph overlap with emojis and Unicode characters** — Long sessions containing emojis (e.g. `✅`) or wide Unicode characters could end up with overlapping/shifted text in the embedded terminal, making the output unreadable. Root cause: xterm.js defaults to Unicode 6 (1991) glyph widths, which treat modern emojis as 1 cell while they render as 2 cells — every subsequent character then lands at the wrong column. Two fixes in `TerminalView`: (1) load `@xterm/addon-unicode11` and activate `term.unicode.activeVersion = '11'` so glyph widths match what the PTY on the backend assumed, and (2) load `@xterm/addon-webgl` (with a silent fallback to the DOM renderer if the GPU context fails) for more reliable monospace alignment and faster rendering.

## [0.20.5]

### Features

- **Periodic update check** — The update banner no longer only checks at startup. It now polls `/api/update-check` every 30 minutes, and additionally re-checks whenever the window regains focus if the last check is more than 10 minutes old. That catches the common case where the app has been sitting in the background for hours and a new release shipped in the meantime — you come back to the app and see the banner almost immediately instead of having to restart. If a poll returns "no update available" while a banner is showing (e.g. you just installed the update in-app), the banner now clears itself so stale state doesn't linger.

  **Backend** — `update-checker` cache TTL shortened from 6h to 1h so that the frontend polls have a chance to pick up a new release within the hour without every poll hitting the GitHub API. Error responses still cache for 1 minute to keep retries cheap when offline.

## [0.20.4]

### Fixes

- **"Install & restart" hidden on non-macOS** — The in-app install flow has only been validated on macOS. On Windows the current implementation (`spawn` the NSIS installer with `/S` then quit) has known gaps: the `oneClick: false` wizard still shows, the app is not relaunched automatically, and file locks can race with the uninstall-and-replace step. Until the Windows flow is hardened (likely via a PowerShell helper script analogous to the macOS bash one), the update banner on non-macOS platforms only shows "View release", letting users download the installer manually. The dormant Windows code path in `update-installer.ts` is kept in place so it can be re-enabled once tested.

## [0.20.3]

### Fixes

- **CI green again** — The v0.20.2 commit shipped with a TypeScript parse error in `update-installer.ts`: a comment inside the shell-script template literal contained backticks (`` `name` ``) and angle brackets (`<name>`), which TS tried to interpret as a nested template literal and a generic type. Rewrote the comment with plain quotes. The local `npm run typecheck` didn't catch this because the root script only covered `backend` and `frontend`; it now also runs against `packages/electron` so the same class of miss won't slip through again. Note: v0.20.2 CI failed to publish assets, so in-app updates from 0.20.1 should jump straight to 0.20.3.

## [0.20.2]

### Fixes

- **In-app updater didn't relaunch the app after install** — The swap script ended with `open -a "$(app.getName())"`, but `app.getName()` returned the npm `name` field (`@claude-dashboard/electron`) instead of the user-facing `productName`, so LaunchServices responded with `Unable to find application named '@claude-dashboard/electron'` and the app stayed closed after an update. Two complementary fixes: (1) set `productName: "Claude Dashboard"` at the top level of `packages/electron/package.json` so `app.getName()` returns the right value everywhere, and (2) rework the swap script to use `open "${appBundlePath}"` (direct path, no name lookup) before the cleanup steps — with a retry after 1s and an `open -a` fallback — so a detach/rm failure can't block the relaunch either. Log output is in `~/.claude-dashboard/logs/updater.log`.

## [0.20.1]

### Features

- **"View release on GitHub" links in the What's new modal** — Each version header in the modal now has a small `GitHub` chip that opens the corresponding release page in a new tab, and the modal footer has a `View full release notes on GitHub` link pointing to the latest entry. Useful when the inline changelog is truncated and you want the full commit list, assets, or social preview. Backend: `/api/changelog` now enriches each entry with a `releaseUrl` built from the repo configured on `UpdateChecker` (reused via a new `getRepo()` getter, so the URL stays consistent with `UPDATE_REPO` overrides).

## [0.20.0]

### Features

- **"What's new" modal after an update** — The first time the app launches under a new version, a modal shows the changelog delta since the previously-seen version. If you jump across multiple versions (e.g. 0.18.2 → 0.20.0), every intermediate section is rendered, not just the latest. Markdown is rendered with `react-markdown` + `remark-gfm` and styled inline (no new deps). Dismissing the modal persists the current version to `localStorage['dashboard:last-seen-version']`, so it only reappears after the *next* bump. First-ever launch silently records the version without showing anything. Disabled in Vite dev mode to avoid firing on every bump during local development.

  **Plumbing** — backend has a new `GET /api/changelog?since=<version>` endpoint that reads `CHANGELOG.md`, parses `## [X.Y.Z]` sections, and filters by semver to return entries strictly greater than `since` and less-or-equal to the running backend version. `CHANGELOG.md` is now bundled as an electron-builder `extraResource`, and the main process passes `CHANGELOG_PATH` as an env var so the packaged backend knows where to read from. In dev mode the reader falls back to the repo-root path.

## [0.19.0]

### Features

- **In-app auto-updater** — The update banner now offers an "Install & restart" button that downloads the new release asset from GitHub and applies the update in place — no more manual DMG mount/copy dance. Only shown when running inside the packaged Electron app and when the release has a matching asset for the current platform/arch (macOS arm64/x64 DMG, Windows x64 NSIS exe). The banner shows a progress bar during download and a phase indicator (Downloading → Preparing → Restarting). On failure, a fallback link lets the user download the asset manually from the GitHub release.

  **How it works (macOS, unsigned)** — `electron-updater` / Squirrel.Mac require a valid code signature, which rules them out for unsigned builds. Instead, the main process writes a detached bash script that: (1) waits for the current app PID to exit, (2) mounts the DMG, (3) moves the old `.app` aside as a backup, (4) copies the new bundle into the same install path (resolved dynamically from `process.execPath`, so `~/Applications` works as well as `/Applications`), (5) strips `com.apple.quarantine` to avoid Gatekeeper re-prompts, (6) detaches the volume and cleans up, (7) relaunches via `open -a`. If the copy fails, the backup is restored.

  **Windows** — launches the NSIS installer produced by electron-builder with `/S` (silent) as a detached process; it kills the old instance, installs the new version, and relaunches itself.

  **Plumbing** — new `preload.ts` exposes `window.electronAPI.update` via `contextBridge` (contextIsolation stays on, no nodeIntegration). `update-installer.ts` handles HTTPS download with redirect following (GitHub asset URLs redirect to a signed CDN URL) and streams progress to the renderer via IPC. `update-checker.ts` now returns a platform/arch-matched `asset: { name, url, size } | null` alongside the release metadata.

## [0.18.2]

### UI

- **Plugins manager — smoother mutation feedback** — Install/uninstall/update/enable/disable no longer wipe the modal body with a centered "Loading…" during the post-mutation refetch. The list stays visible, a discreet "Refreshing…" indicator appears in the header, and the specific action button shows its own spinner + label (`Installing…`, `Uninstalling…`, `Updating…`, `Enabling…`, `Disabling…`). Internally, `usePlugins` now distinguishes initial `loading` from subsequent `refreshing`, and the modal tracks `{ id, action }` instead of a shared `busyId`.

## [0.18.1]

### Fixes

- **Plugins manager fails with `claude: command not found` in Electron** — `plugins-manager.ts` invoked `claude plugin ...` via `exec` without enriching the child-process `PATH` with `getExtraPaths()`, so the binary installed in `/opt/homebrew/bin` (or `~/.local/bin`) was not resolved when the backend ran inside the packaged Electron app. Same class of bug previously fixed on `health.ts` and `title-generator.ts`.

## [0.18.0]

### Features

- **Plugins manager** — New modal that wraps the `claude plugin` CLI so you can manage marketplaces and plugins without dropping to a terminal. Lists all configured marketplaces as removable pills (with an `Add` input that takes `owner/repo`, a git URL, or a local path) and an `Update all` button. Two-column body: available plugins on the left (filterable per marketplace, full-text search across name/description/keywords) and installed plugins on the right. Each installed plugin shows its version, scope, last-updated time, install errors surfaced by the CLI, and a single-click `Enabled/Disabled` toggle. `Install`, `Update`, and `Uninstall` actions are wired through the CLI and the list refreshes automatically on success. `View README` opens the plugin's README.md (or `.claude-plugin/plugin.json` fallback) in a preview sub-modal. Accessible via a Package icon in the topbar and a `Plugins: Open manager` entry in the command palette (⌘K). User-scope only for the MVP; project-scope plugins are listed but not actionable here.

## [0.17.3]

### Fixes

- **Status stuck on "processing"** — Added `"shift+tab to cycle"` to the list of prompt markers matched by the status monitor. Recent Claude CLI versions no longer emit the previously-matched strings (`"for shortcuts"`, `"? for help"`) at the idle prompt, so the detector never saw the instance return to `waiting_input` and the blue spinner stayed up indefinitely. The mode-cycle hint is present at the prompt in all modes (default / accept-edits / plan) and disappears during generation, making it a stable signal.

## [0.17.2]

### Fixes

- **Terminal frozen after DECRQM sequence** — Switched the frontend Vite minifier from esbuild to Terser. esbuild's aggressive DCE of transpiled `const enum` declarations was stripping the outer `var V;` while keeping the IIFE `(void 0 || (n = {}))` that references it, causing a `ReferenceError: n is not defined` at runtime inside xterm's `requestMode`/DECRQM handler. The symptom was a silently frozen terminal in packaged builds only: user input still reached the PTY but `term.write()` crashed on the first DECRQM reply, so no output was ever rendered.

## [0.17.1]

### Features

- **View menu with DevTools & Reload** — Added a native "View" menu (macOS) exposing Reload (`Cmd+R`), Force Reload (`Cmd+Shift+R`), Toggle Developer Tools (`Cmd+Opt+I`), zoom controls, and fullscreen. Makes renderer-side diagnostics possible in packaged builds without a dev setup.

## [0.17.0]

### Features

- **Update available banner** — At startup, the dashboard checks GitHub for the latest release (`stefan-dochez/claude-dashboard`) and shows a dismissible banner at the top of the main panel when a newer version is published. Includes a "View release" link to the GitHub release page. Result is cached server-side for 6 hours to avoid rate-limit pressure, and per-version dismissals persist in localStorage so the banner reappears only when a new version ships. Repo can be overridden via the `UPDATE_REPO` env var.

## [0.16.0]

### Features

- **Custom start point for new worktree** — The "New task" form now shows a "Based on:" selector listing all local branches and remote-only branches. By default, new worktrees branch off `origin/main` (unchanged); users can now pick any other branch as the starting point, enabling sub-branch workflows without manual git commands. Backend: new `GET /api/git/start-points` endpoint and `createWorktree` accepts an optional `startPoint` argument.

## [0.14.9]

### Features

- **Configurable terminal theme** — Terminal color scheme is now configurable via the command palette (`Cmd+K` → "Terminal Theme"). Ships with 7 presets: Clear Dark, Clear Light, Pro, Homebrew, Novel, Ocean, and Dracula. Theme is persisted in config and updates live without restarting terminals.

## [0.14.8]

### Fixes

- **Open in IDE missing on worktree rows** — Added the "Open in IDE" button on worktree rows (without active instances) so users can open a worktree directory directly from the sidebar.

## [0.14.7]

### Fixes

- **Open in IDE opens project instead of worktree** — The "Open in IDE" button on the project row always used `project.path`, even for instances running on a worktree. Added an "Open in IDE" button on each instance row that uses `inst.worktreePath` when available, so clicking it opens the actual working directory.

## [0.14.6]

### Fixes

- **Open in IDE button hidden on active projects** — The "Open in IDE" button was inside a `!hasActivity` conditional block, making it invisible on projects with running instances. Moved it outside so it always appears on hover.

## [0.14.5]

### Fixes

- **Terminal scroll broken during output** — Removed the explicit `scrollToBottom()` call from the output handler, which was overriding xterm.js's native `isUserScrolling` flag and forcing the viewport back to the bottom. xterm natively preserves viewport position when the user has scrolled up; our manual scroll management was fighting against it. Simplified from ~40 lines of scroll logic to ~10.

## [0.14.4]

### Fixes

- **Terminal scroll position lost during output** — Replaced the pixel-based `scrollTop` save/restore with line-based buffer tracking (`viewportY`/`baseY`). The old approach broke when the scrollback buffer wrapped and evicted old lines, causing the terminal to jump. The new approach computes the exact line drift and uses `scrollToLine()` to keep the viewport anchored.

## [0.14.3]

### Fixes

- **Health check and title generation fail in Electron** — `health.ts` and `title-generator.ts` did not enrich the PATH with `getExtraPaths()`, so binaries like `claude` and `gh` installed in `~/.local/bin` or `/opt/homebrew/bin` were not found when running inside the Electron app.

## [0.14.2]

### Fixes

- **Title generation broken by invalid CLI flag** — Removed the unsupported `--max-tokens` flag from the `claude` CLI call, which caused title generation to silently fail and fall back to displaying the raw first prompt.
- **Configurable title generation** — Title generation can now be toggled on/off via the `generateTitles` config option. Toggle available in the command palette (Cmd+K → "Title Generation").

## [0.14.1]

### Fixes

- **Session titles without API key** — Title generation now uses the `claude` CLI (`claude -p --model haiku`) instead of the Anthropic SDK, leveraging the existing OAuth authentication. No `ANTHROPIC_API_KEY` needed. Removed the API key check from the health report.

## [0.14.0]

### Features

- **Dependency health check** — The backend checks for required dependencies (git, claude, gh, gh auth, ANTHROPIC_API_KEY) at startup and logs their status. A new `GET /api/health` endpoint exposes the full report. On the frontend, a dismissable amber banner appears at the top if any dependency is missing, with details on how to fix each issue. The banner remembers which issues were dismissed (localStorage) and re-appears only if new issues are detected.

## [0.13.1]

### Fixes

- **PR badge count inconsistent with PR view** — Badge and PR view used separate data-fetching paths (batched search vs per-project query), causing different "mine" counts. Now workspace/monorepo badge counts reuse `getPrs` (same cache as the view) so both always show consistent data. Simple repos still use a batched search for efficiency.

## [0.13.0]

### Features

- **Aggregated PR view** — Click the PR badge on any project to see all open pull requests. For workspaces and monorepos, PRs are aggregated across all sub-repos via a batched GitHub search API call. PR view shows title, author, repo, branch, age, and draft status, grouped by repository. Click any PR to open it on GitHub.
- **PR count badge on all projects** — Every project in the sidebar shows a blue badge with the number of PRs assigned to you (authored, assigned, or review-requested). Badge disappears on hover, replaced by action buttons. Counts are fetched in a single batched `POST /api/git/pr-counts` endpoint.
- **Mine / All filter** — The PR view defaults to "Mine" (PRs where you are author, assignee, or reviewer). Toggle to "All" to see every open PR. GitHub username is resolved via `gh api user` and cached server-side.

### Fixes

- **PR count cache** — `getPrCounts` results and GitHub slug lookups are now cached (2min TTL for counts, permanent for slugs) to avoid redundant `git remote` and API calls.
- **Sidebar filter no longer triggers PR refetch** — PR counts are based on the full unfiltered project list, so typing in the search box no longer causes unnecessary API calls.
- **PR button visible for active projects** — The PR hover action button is now shown regardless of whether the project has running instances.
- **Path validation on pr-counts endpoint** — `POST /api/git/pr-counts` validates all project paths against allowed scan paths and input types.

## [0.12.3]

### Fixes

- **Empty sessions in history** — Sessions where no prompt was ever sent (instance spawned then killed/abandoned) were persisted in history as blank "Session" entries with no title. Now `endTask` discards sessions without a `firstPrompt`, and `load()` cleans up any existing empty sessions on startup.

## [0.12.2]

### Fixes

- **Scroll position lost during terminal output** — When the terminal was actively writing, scrolling up was impossible because xterm's internal scroll-to-bottom on `write()` triggered the scroll handler, re-enabling auto-scroll. Now scroll events are suppressed during writes when auto-scroll is off, and the viewport position is restored after each write.

## [0.12.1]

### Fixes

- **Terminal links opening about:blank** — Clicking URLs in the xterm.js terminal opened an empty `about:blank` tab instead of the actual URL. The default WebLinksAddon handler uses `window.open()` then assigns `location.href`, which modern browsers block. Replaced with a direct `window.open(uri, '_blank', 'noopener')` call.

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
