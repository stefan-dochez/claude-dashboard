# Claude Dashboard

Local web dashboard to run multiple Claude Code instances in parallel. Think poker multi-tabling, but for coding agents.

## Why

Claude Code is great, but one instance at a time is slow when you're juggling multiple tasks across projects. This dashboard lets you spawn several Claude Code sessions side-by-side, each in its own terminal, and quickly switch between them when they need your attention.

## Features

- **Multi-instance management** — Launch, monitor, and kill multiple Claude Code instances from one UI
- **Project explorer** — Auto-scans your workspace directories for projects, displayed as a file tree
- **Git worktrees** — Launch an instance with a task description and it creates an isolated git worktree + branch automatically. No more conflicts when running two tasks on the same project
- **Attention queue** — Instances waiting for input are queued and auto-surfaced. Typing in a terminal suppresses the queue so you don't get interrupted mid-prompt
- **Context banner** — Shows the current task and your last prompt above the terminal, so you instantly remember where you left off when switching instances
- **Embedded terminals** — Full xterm.js terminals with scrollback, links, and resize support

## Requirements

- macOS (node-pty needs Xcode CLI tools: `xcode-select --install`)
- Node.js 18+
- `claude` CLI in your PATH

## Install

```sh
git clone <repo-url> && cd claude-dashboard
npm install
```

## Usage

```sh
npm run dev
```

Opens at [http://localhost:5173](http://localhost:5173). Backend runs on port 3000.

### Configuration

Config lives at `~/.claude-dashboard/config.json`. Key settings:

- `scanPaths` — directories to scan for projects (e.g. `["~/Workspace"]`)
- `scanDepth` — how deep to look (default: 3)
- `maxInstances` — simultaneous instance limit (default: 10)

### Workflow

1. Pick a project in the sidebar
2. Enter a task description (or leave empty for no worktree)
3. Claude Code launches in an isolated worktree
4. Work across instances — the attention queue surfaces instances that need input
5. When done, kill the instance and optionally clean up the worktree + branch

## Stack

- **Backend**: Node.js, TypeScript, Express, socket.io, node-pty
- **Frontend**: React, TypeScript, Tailwind CSS, xterm.js, socket.io-client
- Monorepo with npm workspaces (`packages/backend` + `packages/frontend`)
