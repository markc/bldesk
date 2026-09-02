# BLDesk (BinaryLane Desktop) ⚡

[![Cross-Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux%20%7C%20Android-blue.svg)](#platform-support)
[![Electron](https://img.shields.io/badge/Electron-33+-47848F?logo=electron&logoColor=white)](#tech-stack)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6+-3178C6?logo=typescript&logoColor=white)](#tech-stack)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=black)](#tech-stack)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-38B2AC?logo=tailwind-css&logoColor=white)](#tech-stack)
[![OpenAPI](https://img.shields.io/badge/OpenAPI-3.0.4-6BA539?logo=openapi-initiative&logoColor=white)](#api-coverage)

A modern, high-performance, cross-platform desktop management client for [BinaryLane Cloud](https://www.binarylane.com.au), designed with official **PanelSite (mPanel)** look and feel, multi-account token vaults, and desktop native capabilities.

---

## 📸 Screenshots

### 🌙 Virtual Servers Dashboard (Dark Mode)
![BLDesk Virtual Servers Dashboard](docs/screenshots/dashboard-dark.png)

### ☀️ Cloud Network Firewall (Light Mode)
![BLDesk Cloud Network Firewall](docs/screenshots/firewall-light.png)

### ☀️ Server Backups & Disk Snapshots (Light Mode)
![BLDesk Server Backups & Snapshots](docs/screenshots/backups-light.png)

---

## ✨ Key Features

* **⚡ Complete Compute Fleet Management**: Live server grid/list with real-time status gauges, OS distribution logos (Ubuntu, Debian, Windows, Alma, Rocky, CentOS, FreeBSD, openSUSE, Fedora, cPanel, BYO), IP addressing, and quick action buttons.
* **🎨 Authentic PanelSite Look & Feel**: Styled in official BinaryLane blue (`#017cb6`), dark slate (`#343a40`), and gold accents (`#f1ca00`) with persistent **Dark Mode / Light Mode** switching.
* **🛡️ Built-in Anti-Spam & Mutation Safeguards**: Zero-retry policy on mutations, client-side 1.5s in-flight request deduplication, and UI double-click locks to prevent accidental duplicate actions.
* **⚡ 0ms Instant Cold-Start**: Local profile caching rehydrates server lists instantaneously on startup while performing non-blocking background synchronization.
* **🔒 Hardware-Encrypted Vault**: API tokens and OAuth credentials secured with Electron `safeStorage` (macOS Keychain, Windows DPAPI, Linux Secret Service).
* **🖥️ Native & Embedded Terminals**: One-click SSH launch in your native terminal (iTerm2, macOS Terminal, Windows Terminal, Alacritty) or inline web terminal via `xterm.js`.
* **🌐 VPCs, Firewalls & Load Balancers**: Interactive Inbound/Outbound firewall rule manager, VPC network routing, and load balancer health monitoring.
* **💾 Snapshots & Automated Backups**: Create point-in-time snapshots, manage scheduled nightly backups, and mount backup images as secondary drives.
* **🌍 DNS Zone Manager**: Full DNS record management (A, AAAA, CNAME, MX, TXT, SRV, NS, CAA) with real-time propagation checks.
* **⌨️ Command Palette (`Cmd+K` / `Ctrl+K`)**: Instant fuzzy search across servers, IP addresses, VPCs, and navigation tabs.

---

## ⌨️ Useful Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Cmd + K` / `Ctrl + K` | Open Command Palette (search servers, VPCs, actions) |
| `Cmd + R` / `F5` | Refresh & reload current view |
| `Cmd + Option + I` / `F12` | Toggle Developer Tools Inspector |

---

## 🚀 Getting Started

### Prerequisites
* [Node.js](https://nodejs.org) (v20+ recommended)
* [npm](https://npmjs.com)

### Installation & Development
```bash
# Clone the repository
git clone https://github.com/termau/bldesk.git
cd bldesk

# Install dependencies
npm install

# Start local development server (with HMR)
npm run dev
```

### Packaging & Builds

```bash
# Build macOS application (.app, .dmg, .zip)
npm run build:mac

# Build Windows installer & portable package
npm run build:win

# Build Linux AppImage & deb
npm run build:linux

# Sync and prepare Android Capacitor build
npm run cap:sync
```

### 🚀 Cutting a New Release (with Auto-Update)

BLDesk supports cross-platform in-app auto-updating via `electron-updater` and GitHub Releases:

```bash
# 1. Bump version
npm version patch --no-git-tag-version

# 2. Commit and tag (tag must match version)
git commit -am "chore(release): v1.0.X"
git tag v1.0.X

# 3. Push commit & tag to trigger CI release workflow
git push && git push --tags
```

For more in-depth architectural and agent instructions, see [AGENTS.md](AGENTS.md) and [docs/AUTO_UPDATE.md](docs/AUTO_UPDATE.md).

---

## 🛠️ Architecture & Tech Stack

* **Runtime**: Electron + Node.js
* **Bundler**: `electron-vite` + `electron-builder`
* **Frontend**: React 18 + TypeScript + Tailwind CSS + Lucide Icons
* **Data Fetching**: TanStack Query v5 (React Query) with custom anti-spam client
* **Auto-Update**: `electron-updater` with multi-OS GitHub Release manifests
* **API Schema**: Strongly-typed OpenAPI fetch client generated from BinaryLane OpenAPI 3.0.4
* **Terminal**: `xterm.js` + `xterm-addon-fit` + `xterm-addon-web-links`
* **Mobile / Touch**: Capacitor for Android mobile deployments

---

## 📄 License
MIT © [termau](https://github.com/termau)
