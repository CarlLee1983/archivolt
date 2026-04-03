# 📍 Archivolt Marker (Chrome Extension)

**Archivolt Marker** is a companion Chrome extension designed to synchronize your browser interactions (clicks, form submissions, etc.) with Archivolt's database recording sessions.

This helps developers understand which specific UI action triggered a particular set of SQL queries when analyzing large amounts of database activity.

---

## ✨ Features

- **Automatic Event Tagging**: Listens for click and form events in the browser and automatically sends markers to the Archivolt API.
- **Contextual Synchronization**: Provides context for SQL recordings, such as "5 SQL queries triggered after clicking the 'Create Order' button."
- **Real-time Connectivity**: Synchronizes with the Archivolt core running at `localhost:3100` by default.

---

## 🛠️ Development & Build

### Prerequisites
- [Bun](https://bun.sh)

### Install Dependencies
```bash
bun install
```

### Build the Extension
Bundle the extension using Bun:
```bash
bun run build.ts
```
The bundled files will be generated in the `dist/` directory.

---

## 🚀 How to Install

1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **"Developer mode"** in the top right corner.
3. Click **"Load unpacked"**.
4. Select the `extension` directory from this project (ensure the `dist/` folder exists and contains `manifest.json`).

---

## 📜 Mechanism

The extension sends events to `http://localhost:3100/api/recording/marker`. Please ensure the Archivolt core service is running and listening on that port for markers to be recorded successfully.
