# AGENTS.md (Archivolt Marker Extension)

This file provides guidance for AI coding agents and assistants when working with the Chrome extension in this directory.

## Project Overview

**Archivolt Marker** is a Chrome extension that captures browser events (clicks, form submissions) and sends them as "markers" to the Archivolt recording API. This provides context for captured SQL queries.

## Commands

```bash
# Install dependencies
bun install

# Build the extension
bun run build.ts

# Build from root
bun run build:ext
```

## Architecture

- **Manifest V3**: Uses `manifest.json`.
- **Background Script (`src/background.ts`)**: Manages extension lifecycle and state.
- **Content Script (`src/content.ts`)**: Injected into web pages to listen for DOM events.
- **Popup (`src/popup.ts` / `src/popup.html`)**: UI to start/stop marker capture and configure the API endpoint.
- **Build System (`build.ts`)**: Uses `Bun.build` to transpile and bundle TypeScript into `dist/`.

## Data Flow

1. User interacts with a webpage.
2. `content.ts` captures the event (e.g., button click with text "Submit").
3. `content.ts` sends the event metadata to `background.ts`.
4. `background.ts` sends a POST request to `http://localhost:3100/api/recording/marker`.
5. Archivolt Server receives the marker and attaches it to the current active recording session.

## Conventions

- **Target**: Browser (ESM).
- **Styling**: Minimal CSS or Tailwind if configured.
- **Communication**: Uses `chrome.runtime.sendMessage` and `chrome.tabs.sendMessage`.
- **API Endpoint**: Default is `http://localhost:3100`.
