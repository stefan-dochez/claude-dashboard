---
name: electron-build
description: Build the Electron app, install it to /Applications, and launch it. Use when the user asks to build/install the desktop app.
---

# Electron Build & Install

Build the Electron desktop app, install it to /Applications, and launch it.

## Steps

1. **Build** everything with `npm run electron:build` (builds backend, frontend, prepares production deps, compiles Electron, packages as DMG).

2. **Mount** the DMG from `packages/electron/release/Claude Dashboard-<version>-arm64.dmg` using `hdiutil attach ... -nobrowse`.

3. **Install**:
   - Quit the running app if any: `osascript -e 'tell application "Claude Dashboard" to quit'`
   - Remove old version: `rm -rf "/Applications/Claude Dashboard.app"`
   - Copy new version: `cp -R "/Volumes/Claude Dashboard <version>-arm64/Claude Dashboard.app" /Applications/`

4. **Unmount** the DMG: `hdiutil detach "/Volumes/Claude Dashboard <version>-arm64"`.

5. **Launch** the app: `open -a "Claude Dashboard"`.
