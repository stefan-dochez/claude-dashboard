# Changelog

All notable changes to Claude Dashboard since the initial commit.

## [Unreleased]

### Features

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

### Fixes

- **PR diff comparing against stale local branch** (`25f1f35` fix) — Branch diff now compares against `origin/<branch>` instead of the local branch to avoid showing incorrect file counts.

- **Buffer lookup crash** (`ba46bf7`) — `getBuffer()` now returns an empty string instead of throwing when an instance is not found.

- **Noisy detach logs** (`ba46bf7`) — Terminal detach events are only logged when the socket was actually attached.

- **Terminal shown for exited instances** (`ba46bf7`) — Exited instances no longer render the terminal component; an "Instance has exited" message is shown instead.
