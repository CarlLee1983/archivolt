---
name: archivolt-record
description: Capture application query behavior via Chrome extension (primary) or DB proxy (fallback). Use when you need to record representative user workflows for analysis.
triggers:
  - 幫我側錄操作行為
  - 開始錄製
  - capture queries
  - record session
  - 我要側錄 app 行為
---

# archivolt-record

Guide the developer through recording a query session. The Chrome extension path captures rich UI semantic markers (navigate/click/submit events) which significantly improves business-flow detection. The proxy-only path is a fallback when Chrome extension setup is not feasible.

## When to use

Run this skill each time you need to capture a new set of application behaviors for analysis.

## Prerequisites

- `archivolt-schema` has been run and `archivolt.json` exists
- DB proxy port (default 13306) is accessible
- Application is running locally or on a reachable host

---

## Path A — Chrome Extension + Proxy (★★★★★ Recommended)

With the Chrome extension, every navigation, form submit, and click is sent as an operation marker to the proxy. This annotates query chunks with UI context, enabling precise business-flow identification in `archivolt-advisor`.

### Step A1 — Build the extension

The agent runs this automatically:

```bash
bun run build:ext
```

**Expected output:** `extension/dist/` created containing `background.js`, `content.js`, `popup.html`.

Verify: `ls extension/dist/` should list the files above.

### Step A2 — Load extension in Chrome (manual)

Chrome's extension management page is protected and cannot be automated.

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `extension/dist/` directory from this project
5. The **Archivolt Marker** extension icon should appear in the toolbar

### Step A3 — Start recording

```bash
archivolt record start --target localhost:3306
```

Replace `localhost:3306` with your actual DB host and port.

**Expected output:**
```
✅ Proxy listening on 0.0.0.0:13306 → localhost:3306
📍 Session ID: <uuid>
```

### Step A4 — Activate extension and point app at proxy

1. Click the **Archivolt Marker** extension icon in the Chrome toolbar
2. Select the tab running your application
3. Click **Start recording**

Reconfigure your application's DB connection string to use the proxy port (13306 by default) instead of the real DB port. For example, if your `.env` has `DB_PORT=3306`, change it to `DB_PORT=13306`.

### Step A5 — Operate the application

Perform representative workflows — login, create records, search, update, delete, checkout. Cover the main user journeys. Aim for 5–15 minutes of realistic activity.

The extension automatically sends a marker for each page navigation, form submit, and significant click. These markers will appear as semantic labels on query chunks in the Timeline Panel.

### Step A6 — Stop recording

```bash
archivolt record stop
```

Then click **Stop recording** in the extension popup.

**Verify the session was captured:**
```bash
archivolt record status
```
Expected: Session listed with a non-zero query count.

---

## Path B — DB Proxy Only (★★★ Fallback)

Use this path if Chrome extension installation is not feasible (e.g., remote machine, restricted environment, or analysis of existing log files).

> ⚠️ **Data quality warning:** Without the Chrome extension, query chunks are split using 500 ms silence intervals only. There are no UI semantic markers. This reduces the accuracy of Use Case identification and architecture recommendations in `archivolt-advisor`. For best results, prefer Path A.

### Step B1 — Start proxy

```bash
archivolt record start --target localhost:3306
```

### Step B2 — Operate the application

Point the application's DB connection at the proxy port (13306). Perform representative workflows.

### Step B3 — Stop proxy

```bash
archivolt record stop
```

**Verify:**
```bash
archivolt record status
```
Expected: Session listed with query count > 0.

---

## Output artifacts

- Recording session stored in Archivolt data directory (viewable via `archivolt record list`)
- `markers.jsonl` inside the session directory (Path A only)

## Next step

Run `/archivolt-analyze` to generate the optimization report and ER export from this session.
