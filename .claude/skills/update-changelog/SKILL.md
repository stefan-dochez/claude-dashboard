---
name: update-changelog
description: Update CHANGELOG.md after a feature or fix
autoTrigger:
  - after_commit
---

# Update Changelog

After each commit that adds a feature or fixes a bug, update `CHANGELOG.md` at the project root.

## Steps

1. Read the current `CHANGELOG.md`.
2. Determine the type of change from the commit message:
   - `feat` or new functionality → add under `### Features`
   - `fix` or bug correction → add under `### Fixes`
3. Add a new bullet point under the `## [Unreleased]` section, in the appropriate subsection.
4. Format: `- **Short title** — Description of the change.`
5. Keep entries in reverse chronological order (newest first in each section).
6. Do NOT remove or modify existing entries.
7. Do NOT commit the changelog update separately — it should be part of the same commit as the code change, or amended into it if the commit already happened.
