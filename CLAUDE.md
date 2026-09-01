# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

BLDesk — an Electron + React desktop client for the BinaryLane cloud API (`https://api.binarylane.com.au`), styled after BinaryLane's mPanel/PanelSite web console. The same renderer bundle is also shipped to Android via Capacitor. Upstream is `termau/bldesk`; `markc/bldesk` is a fork (`origin` = fork, `upstream` = termau).

## Commands

```bash
npm ci                    # install (see "npm 12 / Node 26" below)
npm run dev               # electron-vite dev server with HMR
npm run build             # generate-api + electron-vite build → out/{main,preload,renderer}
npm run typecheck         # tsc for node (main/preload/shared) AND web (renderer) projects
npm run typecheck:node    # just main/preload
npm run typecheck:web     # just renderer
npm run generate-api      # openapi.json → src/shared/api/schema.d.ts (runs as part of build)
npm run format            # prettier --write .
npx electron .            # run the production build in out/ (after npm run build)
npm run pack:linux        # @electron/packager → release/BLDesk-linux-x64 (also pack:win, pack:mac)
npm run build:linux       # electron-builder equivalent (also build:win, build:mac, build:unpack)
npm run cap:sync          # build + npx cap sync android
```

There is **no test suite** and no lint script. "Testing" = `npm run typecheck` + `npm run build` + launching the built app and checking the `[Main]`/`[Renderer]` console lines (renderer console output is forwarded to the terminal by the main process).

### Local environment gotchas (cachyos, npm 12, Node 26)

- npm 12 blocks postinstall scripts unless listed in `package.json` `allowScripts` — `electron` and `esbuild` are already allowlisted there.
- `node_modules/electron/install.js` silently fails under Node 26 (exit 0, `dist/` contains only `locales/`, no `path.txt`). Fix by hand: `unzip -q ~/.cache/electron/*/electron-v<ver>-linux-x64.zip -d node_modules/electron/dist && printf electron > node_modules/electron/path.txt`.
- Smoke-testing with `timeout N npx electron .` needs `timeout --foreground` — otherwise the whole process group is signalled and Chromium dies with a bogus `GPU process isn't usable` FATAL.
- Screenshots on KDE Wayland: `grim` doesn't work; the window is XWayland, so `xdotool search --name BLDesk` + `import -window $W out.png`.

## Architecture

Three electron-vite targets, built from `electron.vite.config.ts` into `out/`:

| Target | Source | tsconfig | Notes |
|---|---|---|---|
| main | `src/main/` | `tsconfig.node.json` | Node/Electron process. Externalises deps. |
| preload | `src/preload/` | `tsconfig.node.json` | Emits `out/preload/index.mjs`. |
| renderer | `src/renderer/` | `tsconfig.web.json` | React 18 + Tailwind, `base: './'` so it loads from `file://` and from Capacitor's `out/renderer` webDir. |

Path aliases: `@shared/*` → `src/shared/*` (all targets), `@renderer/*` → `src/renderer/src/*` (renderer only). Both tsconfigs are `strict`; the web one also has `noUnusedLocals`/`noUnusedParameters`.

### The `window.bldeskApi` bridge — one interface, two implementations

`src/shared/ipc-types.ts` defines `IpcApi` (vault profiles, native terminal, rescue console, local SSH keys, notifications, window controls, openExternal). Everything platform-specific the renderer needs goes through `window.bldeskApi: IpcApi`.

- **Electron:** `src/preload/index.ts` exposes it via `contextBridge`, each method an `ipcRenderer.invoke('<ns>:<name>')`. Handlers live in `registerIpcHandlers()` in `src/main/index.ts` with channel names `vault:*`, `terminal:*`, `console:*`, `system:*`, `window:*`, `shell:*`.
- **Android/web:** `src/renderer/src/api/mobile-bridge.ts` `initMobileBridge()` installs a JS implementation backed by `@capacitor/preferences` (falls back to `localStorage`) when `window.bldeskApi` is absent. `App.tsx` dynamically imports and awaits it on startup when `window.bldeskApi` is missing (upstream `2c70e02`), so the Capacitor build gets the bridge without pulling Capacitor into the Electron bundle.

Adding a native capability means touching all three: the `IpcApi` type, the preload + main handler, and the mobile bridge (even if it's a no-op there).

### Token vault

`src/main/safeStorage.ts` `VaultManager` stores profiles in `<userData>/vault.enc` (Linux: `~/.config/bldesk/vault.enc`) as JSON; only the token is encrypted (Electron `safeStorage`, hex-encoded; base64 fallback if no keyring). `getProfiles()` strips tokens; `getActiveProfile()` decrypts the active one. Never hand-edit the vault — write through Electron so the keyring-derived key matches. The mobile bridge stores profiles unencrypted in Capacitor Preferences.

### API layer (renderer)

- `src/shared/api/schema.d.ts` is **generated** from `openapi.json` (BinaryLane OpenAPI 3.0.4) by `openapi-typescript`; it's committed but regenerated on every `npm run build`. Don't edit it — change `openapi.json` and regenerate.
- `src/renderer/src/api/client.ts` `createBinaryLaneClient(token)` wraps `openapi-fetch` with a custom `fetch` that: short-circuits to a synthetic 401 when the token is empty; normalises non-JSON error bodies to JSON; dispatches a `bldesk:auth_error` window event on 401/403 (App shows a banner); and applies **mutation anti-spam** — identical `method:url:body` mutations are rejected within a 1.5 s cooldown and de-duplicated while in flight. Pair this with the `QueryClient` in `App.tsx`: `mutations.retry: 0`, queries never retry 401/403/404.
- `src/renderer/src/api/queries.ts` holds every TanStack Query hook (`useServers`, `useServerActionMutation`, `useFirewallRules`, backups, DNS, load balancers, billing, …). Hooks take `client: BinaryLaneClient | null` and are `enabled: !!client`. `useServers` paginates `/v2/servers` (200/page, max 10 pages) and caches results in `localStorage` under `bldesk_cached_servers_<profileId>` for instant cold-start via `initialData`. Polling intervals are set per hook (servers 15 s, server detail 10 s, metrics 5 s).

### Renderer shell

`App.tsx` `MainDashboard` owns all top-level state: profile list + active profile (loaded via `bldeskApi`), the memoised API client (rebuilt when the active token changes), the active sidebar tab, selected server, and modal open flags. Feature areas are one component directory each under `src/renderer/src/components/` and are switched on `activeTab`; there's no router. Switching profile calls `queryClient.invalidateQueries()`.

Server sub-tabs (`ServerSubTab` in `Sidebar.tsx`) are rendered as `activeSubTab === '…'` branches inside `ServerDetails.tsx`; every id in the sidebar list must have a branch or the pane is silently empty. The Network tab lives in its own `ServerNetwork.tsx` and uses `useNetworkActionMutation` (`queries.ts`), which polls `/v2/actions/{id}` to completion — prefer it over the fire-and-forget `useServerActionMutation` for any action whose result the UI must reflect.

Theming: `ThemeContext` toggles the `dark` class on `<html>` (Tailwind `darkMode: 'class'`), persisted in `localStorage.bldesk_theme`. Brand colours are in `tailwind.config.js` (`brand.*`, `panel.*`) — BinaryLane blue `#017cb6`, gold `#f1ca00`, slate `#343a40` — though many components use the hex literals directly.

### Main process specifics

- Window is created `show: false` and shown on `ready-to-show`; `webSecurity: false` is deliberate (direct cross-origin calls to the BinaryLane API from a `file://` renderer). `contextIsolation: true`, `nodeIntegration: false`.
- Preload/renderer/icon paths are resolved by probing candidate lists (`getPreloadPath`, `getRendererPath`, `getIconPath`) so the same code works in dev, `out/`, and packaged asar; icons fall back to data URLs in `src/main/embedded-icons.ts` (generated by `generate-embedded-icons.cjs`).
- `src/main/terminal.ts` spawns a per-platform native terminal running `ssh` (wt.exe → PowerShell on Windows, osascript Terminal.app on macOS, `x-terminal-emulator` → `gnome-terminal` on Linux).
- Single-instance lock, system tray with Open/Quit, `window-all-closed` quits on every platform.

### Android

`android/` is a committed Capacitor 8 project (`appId com.termau.bldesk`, webDir `out/renderer`, `CapacitorHttp` enabled). `capacitor.config.ts` and `capacitor.config.json` are duplicates — keep them in sync. CI (`.github/workflows/android.yml`) builds a debug APK on `v*` tags with Node 22 / JDK 21 / API 36.

## Release

`.github/workflows/release.yml` runs on `v*` tags: `npm install --legacy-peer-deps`, `generate-api`, `build`, then `pack:win` / `pack:mac` (universal) / `pack:linux` via `@electron/packager`, zips them, and attaches to a GitHub Release. Version lives in `package.json` (`chore(release): bump version to x.y.z` commits).
