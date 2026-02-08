# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Network Capture Inspector is a Chrome extension (Manifest V3) that captures and inspects XHR/Fetch network requests. It provides a developer inspector tool for gathering network logs, console output, and click activity for debugging and AI-assisted testing.

## Development Commands

### Loading the Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked" and select this folder
4. After making changes, click the refresh icon on the extension card

### Debugging

- **Content Script**: Use browser DevTools console on the webpage
- **Service Worker**: Right-click extension icon → "Inspect popup" → "Service Worker" tab
- **Side Panel**: Right-click extension icon → "Inspect popup"

## Architecture

### Message Flow

The extension uses a three-layer architecture with message passing:

```
Page Context (MAIN world)     →    Content Script (Isolated world)    →    Background Service Worker
   injected.js                         content-script.js                    service-worker.js
   (intercepts fetch/XHR)              (bridges via postMessage)            (stores data, manages state)
```

1. **injected.js** runs in MAIN world to intercept `fetch()` and `XMLHttpRequest` in the actual page context
2. **content-script.js** runs in isolated world, receives data via `window.postMessage`, forwards to background via `chrome.runtime.sendMessage`
3. **service-worker.js** stores captured requests/logs in memory, filters by monitored tab

### Key Components

| Component | Purpose |
|-----------|---------|
| `background/service-worker.js` | Central state management, stores requests/logs, handles tab monitoring |
| `content/injected.js` | Page context injection, intercepts fetch/XHR/console, click capture |
| `content/content-script.js` | Bridge between page context and service worker |
| `sidepanel/sidepanel.js` | Main UI - request list, filtering, copy functionality |
| `popup/popup.js` | Alternative popup UI (simpler version) |
| `console-viewer/` | Separate window for viewing console logs |
| `markup-viewer/` | Screenshot annotation tool using Fabric.js |

### State Management

- **monitoredTabId**: Only one tab is monitored at a time (set when clicking extension icon)
- **isRecording/isConsoleRecording**: Toggle capture on/off
- **autoClearEnabled**: Auto-clear data on page reload
- Requests limited to 200, console logs to 500 (in-memory only)

### Message Types

Key message types used in `chrome.runtime.onMessage`:

- `NETWORK_REQUEST` / `GET_REQUESTS` / `CLEAR_REQUESTS` - Network capture
- `CONSOLE_LOG` / `GET_CONSOLE_LOGS` / `CLEAR_CONSOLE_LOGS` - Console capture
- `IS_TAB_MONITORED` - Check if current tab is being monitored
- `ENABLE_CONSOLE_INTERCEPTION` - Toggle interception on/off
- `SET_RECORDING` / `SET_CONSOLE_RECORDING` - Recording state

### CAPTCHA/Security Exclusions

The extension automatically excludes interception on security-sensitive pages:
- reCAPTCHA, hCAPTCHA, FunCAPTCHA
- Cloudflare challenges
- OAuth providers (Auth0, Okta, Duo)
- Login pages (Google, Microsoft)

## File Structure Notes

- `sidepanel/` is the primary UI (opens in Chrome side panel)
- `popup/` is an alternative simpler interface
- `fabric.min.js` is bundled for screenshot annotation (Fabric.js library)
- Icons in `icons/` at 16, 48, 128px sizes

## Testing

No automated test suite. Test manually:
1. Load extension in Chrome
2. Click extension icon on a webpage to open side panel
3. Make network requests on the page
4. Verify requests appear in side panel
5. Test filtering, copying, console capture
