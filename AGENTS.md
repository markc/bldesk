# BLDesk — Agent & Developer Guide 🤖⚡

This guide documents essential commands, build instructions, and release protocols for AI agents and human contributors working on BLDesk.

---

## 🏗️ Tech Stack & Structure

- **Desktop Framework**: Electron 33 + Vite (`electron-vite`)
- **Frontend**: React 18, TypeScript, Tailwind CSS, Lucide Icons
- **State & Networking**: TanStack Query v5 with custom anti-spam and request deduplication client
- **Auto-Update**: `electron-updater` + GitHub Releases (`latest.yml`, `latest-mac.yml`, `latest-linux.yml`)
- **Mobile**: Capacitor 8 for Android builds

### Directory Map
- `src/main/`: Electron main process (`index.ts`, `updater.ts`, `safeStorage.ts`, `terminal.ts`)
- `src/preload/`: Context bridge exposing typed `bldeskApi` to the renderer (`index.ts`)
- `src/renderer/src/`: React renderer SPA
  - `components/layout/UpdateMenu.tsx`: Auto-update trigger and popover in the title bar
  - `components/layout/TitleBar.tsx`: Desktop custom window controls and profile switcher
  - `api/mobile-bridge.ts`: In-browser / Capacitor bridge fallback for `bldeskApi`
- `src/shared/`: Shared IPC types (`ipc-types.ts`) and SSH helpers (`ssh.ts`)
- `.github/workflows/`: CI/CD workflows (`release.yml`, `android.yml`)

---

## 🛠️ Development & Build Commands

### 1. Verification (Always run before committing)
```bash
# Typecheck both Node (main/preload) and Web (renderer) TypeScript projects:
npm run typecheck

# Full bundle build:
npm run build
```

### 2. Local Testing
```bash
# Run in dev mode with Hot Module Replacement (HMR):
npm run dev

# Run built production bundle preview:
npm run start
```

### 3. Local Packaging (Non-publishing)
```bash
# Package local unpacked directory build:
npm run build:unpack

# Package Windows NSIS installer & portable executable:
npm run build:win

# Package macOS DMG & zip (Universal: Apple Silicon + Intel):
npm run build:mac

# Package Linux AppImage & deb:
npm run build:linux

# Sync web assets to Android Capacitor:
npm run cap:sync
```

---

## 🚀 Release & Auto-Update Protocol

Auto-update relies on `electron-updater` querying GitHub Releases. Releases **must** be created using the following workflow so update manifests and checksum blockmaps are generated properly.

### Creating a Release

1. **Bump Version**: Ensure `package.json` and `package-lock.json` versions are bumped:
   ```bash
   npm version patch --no-git-tag-version    # or minor / major
   ```
2. **Commit & Tag**: The Git tag **must** match the version in `package.json` (prefixed with `v`):
   ```bash
   git commit -am "chore(release): v1.0.X"
   git tag v1.0.X
   ```
3. **Push to Remote**:
   ```bash
   git push origin main
   git push origin v1.0.X
   ```

### What Happens Automatically in GitHub Actions
1. `.github/workflows/release.yml` triggers on `v*` tag pushes.
2. Validates that the git tag version strictly matches `package.json`.
3. Runs `npm run typecheck` and `npm run build`.
4. Executes `npx electron-builder --publish always` across Windows, macOS, and Ubuntu runners.
5. Generates and uploads to the GitHub Release:
   - Installers: `.exe` (NSIS), `.dmg`, `.zip`, `.AppImage`, `.deb`
   - Manifests & Blockmaps: `latest.yml`, `latest-mac.yml`, `latest-linux.yml`, and `*.blockmap`
6. Deployed clients automatically detect the update, download deltas in the background, and prompt users to restart.

### Beta Channel Releases
For prereleases (e.g. `1.1.0-beta.1`):
```bash
npm version 1.1.0-beta.1 --no-git-tag-version
git commit -am "chore(release): v1.1.0-beta.1"
git tag v1.1.0-beta.1
git push origin main && git push origin v1.1.0-beta.1
```
This produces `beta.yml` manifests, targeting only clients that selected the **Beta** channel in their Update Settings.
