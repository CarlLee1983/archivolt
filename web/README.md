# 🎨 Archivolt Frontend

The web-based visual interface for **Archivolt**, providing an interactive canvas to explore, group, and annotate database schemas.

## ✨ Features

- **ER Visualization**: Interactive and zoomable canvas using [ReactFlow](https://reactflow.dev/).
- **Table Nodes**: Display table columns, types, and constraints.
- **Grouping**: Visually group related tables using grouping boxes.
- **Marker Synchronization**: Correlate UI actions (via Archivolt Marker) with recorded SQL queries.
- **Real-time Persistence**: Sync changes instantly to the backend API.

## 🛠️ Technology Stack

- **Framework**: React 18+
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **State Management**: [Zustand](https://github.com/pmndrs/zustand)
- **Canvas Engine**: [XYFlow (ReactFlow)](https://reactflow.dev/)
- **Layout Engine**: [Dagre](https://github.com/dagrejs/dagre) (for automatic schema layout)

## 🚀 Development

### Installation
```bash
# From the root directory
cd web
bun install
```

### Run Development Server
```bash
bun run dev
```
The frontend will start at [http://localhost:5173](http://localhost:5173).

### Build for Production
```bash
bun run build
```

## 🗺️ Project Structure

- `src/components/Canvas`: Core ReactFlow implementation (edges, nodes, layout).
- `src/stores`: Zustand state management for schema data and UI state.
- `src/api`: API client to communicate with the Archivolt backend.
- `src/types`: TypeScript definitions for the ER model and frontend state.

## 📜 Proxy Configuration

Vite is configured to proxy `/api` requests to `http://localhost:3100` (the default Archivolt API port). Ensure the backend server is running for full functionality.
