---
name: release
description: Bump version, update changelog, commit, push, and tag. Use when the user asks to release, commit+push, or "version bump" changes. NOT the same as the "ship" skill which creates PRs.
---

# Release

Complete workflow to ship changes: bump version, update CHANGELOG, commit, push, and create a git tag.

## Steps

1. **Determine bump type** from the changes:
   - `fix` or cosmetic change → patch (0.0.X)
   - `feat` or new functionality → minor (0.X.0)
   - Breaking change → major (X.0.0)
   - If ambiguous, ask the user.

2. **Bump version** in all 4 package.json files (keep them in sync):
   - `package.json` (root)
   - `packages/backend/package.json`
   - `packages/frontend/package.json`
   - `packages/electron/package.json`

3. **Update CHANGELOG.md**:
   - Add a new `## [X.Y.Z]` section at the top (above the previous version).
   - Add entries under the appropriate subsection (`### Features`, `### Fixes`, `### Refactoring`, etc.).
   - Format: `- **Short title** — Description of the change.`
   - Do NOT remove or modify existing entries.

4. **Commit** all changes (code + version bumps + changelog) in a single commit:
   - Message format: `type(scope): description` (conventional commits)
   - Include `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`

5. **Push** to main directly (solo project, no branches/PRs).

6. **Create and push a git tag** `vX.Y.Z`.
