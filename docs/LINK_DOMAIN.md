# `link.binarylane.com.au` — Universal Links for BLDesk

**Status: parked.** Nothing here is needed for `bldesk://` links to work between people who have BLDesk installed. This domain is what makes a link *also* work for people who don't — it falls through to mPanel — and what lets macOS / Android open the app directly from a link with no interstitial once the apps are signed.

Effort split: the sysadmin side is about an afternoon and never needs touching again. The app side waits on code signing (macOS) and a release keystore (Android).

---

## What it does

`https://link.binarylane.com.au/server/12345/network`

| Where the link is clicked | Result |
|---|---|
| Any platform, BLDesk installed | Redirect page hands off to `bldesk://server/12345/network`; BLDesk opens the server |
| Any platform, BLDesk not installed | Redirect page falls through to the equivalent mPanel URL after ~1 s |
| macOS with a **signed** BLDesk (Mail, Messages, Safari) | OS opens BLDesk directly, no page shown (Universal Links) |
| Android with a **release-signed** BLDesk | OS opens BLDesk directly, no chooser (App Links) |

The path grammar is identical to `bldesk://` (see `DEEP_LINKS.md`): `/server/<id>[/<subtab>]`, `/console/<id>`, `/ssh/<id>`, `/tab/<name>`, `/home`, optional `?account=`.

---

## Part 1 — Sysadmin (do once, ~afternoon)

### 1.1 DNS

`A` and `AAAA` records for `link.binarylane.com.au` pointing at the anycast edge.

### 1.2 TLS

A valid certificate for the exact hostname. Let's Encrypt is fine.

Constraints that matter for the well-known files (Apple and Google fetch them):

- Must be served on the canonical hostname — no `www.` bounce
- Must be a direct `200` — **no** redirects of any kind on `/.well-known/*`
- HTTPS only; HTTP can 301 to HTTPS for everything except those two paths (just don't listen on 80 at all is simplest)

### 1.3 Static files

Three files in the web root:

```
/srv/link.binarylane/
├── index.html
└── .well-known/
    ├── apple-app-site-association     (no extension — deliberate)
    └── assetlinks.json
```

#### `index.html` — the redirect page

Every path serves this same file. It tries the `bldesk://` scheme and falls back to mPanel if the app doesn't take focus.

```html
<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Opening in BLDesk…</title>
<style>
  body{font:14px/1.5 system-ui,sans-serif;background:#212529;color:#f8f9fa;display:grid;place-items:center;min-height:100vh;margin:0}
  main{text-align:center;padding:2rem}
  a{color:#f1ca00}
  .brand{font-weight:700;font-size:1.25rem;margin-bottom:1rem}
  .brand b{color:#017cb6}.brand i{color:#f1ca00;font-style:normal}
  button{margin:.25rem;padding:.5rem 1rem;border:0;border-radius:6px;background:#017cb6;color:#fff;font:inherit;cursor:pointer}
  button.alt{background:#343a40}
</style>
<main>
  <div class="brand"><b>binary</b><i>lane</i> BLDesk</div>
  <p id="msg">Opening in BLDesk…</p>
  <p>
    <button id="openApp">Open in BLDesk</button>
    <button id="openWeb" class="alt">Open in mPanel</button>
  </p>
  <p><small>Don't have BLDesk? <a href="https://github.com/termau/bldesk/releases/latest">Download</a></small></p>
</main>
<script>
  // Path + query are carried through unchanged; the grammar matches bldesk:// exactly.
  const path = location.pathname.replace(/^\/+/, '') + location.search
  const app  = 'bldesk://' + path

  // TODO(mPanel owner): map BLDesk paths to real mPanel URLs.
  // Placeholder assumes mPanel mirrors the same path shape.
  const web  = 'https://home.binarylane.com.au/' + path

  document.getElementById('openApp').onclick = () => (location.href = app)
  document.getElementById('openWeb').onclick = () => location.replace(web)

  // Attempt the app; if the page is still visible after 1.2 s, assume no handler.
  let fallback = setTimeout(() => location.replace(web), 1200)
  const cancel = () => clearTimeout(fallback)
  addEventListener('pagehide', cancel)                 // app took over
  addEventListener('blur', cancel)                     // OS "open with" prompt appeared
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel() })

  location.href = app
</script>
</html>
```

The only thing to fill in is the `web` mapping — whoever owns mPanel needs to say what `/server/12345/network` corresponds to on the web side. If it isn't a simple prefix, do the translation in an nginx `map` instead and pass the result to the page via a query param.

#### `.well-known/apple-app-site-association`

Served as `application/json`. Harmless until the macOS app is signed; becomes live the moment it is.

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appIDs": ["TEAMID.com.termau.bldesk"],
        "components": [
          { "/": "/server/*" },
          { "/": "/console/*" },
          { "/": "/ssh/*" },
          { "/": "/tab/*" },
          { "/": "/home" }
        ]
      }
    ]
  }
}
```

Replace `TEAMID` with the 10-character Team ID from the Apple Developer account (Membership page). Apple's CDN caches this file for up to 24 h — don't expect edits to show up quickly.

#### `.well-known/assetlinks.json`

Served as `application/json`. Harmless until the Android app has a release keystore.

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.termau.bldesk",
      "sha256_cert_fingerprints": ["REPLACE:WITH:RELEASE:KEY:SHA256:FINGERPRINT"]
    }
  }
]
```

Fingerprint comes from `keytool -list -v -keystore release.jks -alias <alias>` (the `SHA256:` line, colon-separated uppercase hex). The current Android workflow builds a **debug** APK, so this waits for a real signing key.

### 1.4 nginx

```nginx
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name link.binarylane.com.au;

    ssl_certificate     /etc/letsencrypt/live/link.binarylane.com.au/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/link.binarylane.com.au/privkey.pem;

    root /srv/link.binarylane;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff always;

    # Well-known files: exact type, no redirects, short cache
    location = /.well-known/apple-app-site-association {
        default_type application/json;
        add_header Cache-Control "public, max-age=3600";
    }
    location = /.well-known/assetlinks.json {
        default_type application/json;
        add_header Cache-Control "public, max-age=3600";
    }

    # Everything else is the redirect page
    location / {
        try_files /index.html =404;
        add_header Cache-Control "public, max-age=300";
    }
}

# Optional: plain-HTTP redirect for humans typing the hostname.
# Do NOT let this affect /.well-known — it never should, since those are fetched over HTTPS only.
server {
    listen 80;
    listen [::]:80;
    server_name link.binarylane.com.au;
    return 301 https://$host$request_uri;
}
```

### 1.5 Verify

```bash
# Well-known files: 200, application/json, no redirect
curl -sI https://link.binarylane.com.au/.well-known/apple-app-site-association | grep -Ei 'HTTP/|content-type'
curl -sI https://link.binarylane.com.au/.well-known/assetlinks.json            | grep -Ei 'HTTP/|content-type'

# Redirect page on an arbitrary path
curl -s https://link.binarylane.com.au/server/12345/network | grep -c 'bldesk://'
```

Apple's validator: https://app-site-association.cdn-apple.com/a/v1/link.binarylane.com.au (shows what Apple's CDN currently sees).
Google's: https://developers.google.com/digital-asset-links/tools/generator

---

## Part 2 — App side (blocked on signing)

### 2.1 Accept `https://link.binarylane.com.au/…` in the parser

`src/shared/deeplink.ts` — add a second accepted origin. The path grammar is the same, so it's a normalisation step at the top of `parseDeepLink`:

```ts
export const LINK_HOST = 'link.binarylane.com.au'

export function isDeepLinkUrl(value: string | undefined | null): value is string {
  if (typeof value !== 'string') return false
  const v = value.toLowerCase()
  return v.startsWith(`${DEEP_LINK_SCHEME}:`) || v.startsWith(`https://${LINK_HOST}/`)
}

// inside parseDeepLink, after `new URL(raw)`:
if (url.protocol === 'https:' && url.hostname === LINK_HOST) {
  // https://link…/server/1 → treat exactly like bldesk://server/1
  url = new URL(`${DEEP_LINK_SCHEME}://${url.pathname.replace(/^\/+/, '')}${url.search}`)
}
```

`findDeepLinkInArgv` and `DeepLinkManager.dispatch` already go through `isDeepLinkUrl`, so nothing else changes.

### 2.2 macOS — Associated Domains entitlement

Requires Developer ID signing (see `AUTO_UPDATE.md` → Known limitations). Then in `package.json`:

```json
"mac": {
  "entitlements": "build/entitlements.mac.plist",
  "entitlementsInherit": "build/entitlements.mac.plist"
}
```

`build/entitlements.mac.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.developer.associated-domains</key>
  <array>
    <string>applinks:link.binarylane.com.au</string>
  </array>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
</dict>
</plist>
```

Universal Links arrive through the same `open-url` event as `bldesk://`, so `DeepLinkManager` needs no change beyond 2.1.

### 2.3 Android — App Links intent filter

In `android/app/src/main/AndroidManifest.xml`, inside the main `<activity>`:

```xml
<!-- bldesk:// custom scheme -->
<intent-filter>
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="bldesk" />
</intent-filter>

<!-- https://link.binarylane.com.au — verified App Link (needs assetlinks.json + release signing) -->
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="https" android:host="link.binarylane.com.au" />
</intent-filter>
```

Then wire delivery in `src/renderer/src/api/mobile-bridge.ts`:

```bash
npm install @capacitor/app
npx cap sync android
```

```ts
import { App as CapApp } from '@capacitor/app'

// replace the stubs:
getPendingDeepLink: async () => {
  const launch = await CapApp.getLaunchUrl()
  return launch?.url ?? null
},
deepLinkReady: async () => {},
onDeepLink: (listener) => {
  const sub = CapApp.addListener('appUrlOpen', ({ url }) => listener(url))
  return () => { sub.then((s) => s.remove()) }
}
```

`useDeepLinkRouter` is platform-agnostic and needs no change.

### 2.4 Windows / Linux

No universal-link mechanism exists for unpackaged desktop apps. The redirect page is the whole story there and it already works via the registered `bldesk://` scheme. (MSIX-packaged Windows apps can declare `windows.appUriHandler`; not worth it unless BLDesk ships through the Microsoft Store.)

### 2.5 Switch "Copy link" to the https form

Once the domain is live, `copyDeepLink()` in `src/renderer/src/lib/deeplinks.ts` should emit `https://link.binarylane.com.au/…` instead of `bldesk://…`, so copied links are safe to paste to anyone. One-line change in `formatDeepLink` (or a `formatWebLink` sibling) — keep `bldesk://` as the internal form.

---

## Checklist

**Sysadmin (unblocked now)**
- [ ] DNS A/AAAA for `link.binarylane.com.au`
- [ ] TLS cert
- [ ] Deploy `index.html`, both `.well-known` files, nginx config
- [ ] mPanel owner supplies the path → mPanel URL mapping; fill in `web` in `index.html`
- [ ] `curl` checks in §1.5 pass

**App (blocked)**
- [ ] macOS Developer ID + notarisation (from `AUTO_UPDATE.md`) → fill `TEAMID` in AASA → §2.2
- [ ] Android release keystore → fill fingerprint in `assetlinks.json` → §2.3
- [ ] §2.1 parser change (can be done any time; harmless before the domain exists)
- [ ] §2.5 flip "Copy link" to https form once the domain is live
