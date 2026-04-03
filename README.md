# 🏛️ Archivolt

**Archivolt** is a local visualization and annotation tool designed to help developers of legacy projects understand, document, and export database relationships.

In many legacy systems, databases have numerous "implicit relationships"—columns named like `user_id` that aren't backed by actual foreign keys in the database engine. Archivolt provides a visual interface to annotate these relationships and export them into modern ORM formats or ER diagrams.

---

## ✨ Features

- **Visual Database Explorer**: Built with [ReactFlow](https://reactflow.dev/) for an interactive and zoomable schema visualization.
- **Virtual Foreign Keys (vFK)**: Annotate "implicit" relationships between tables without modifying the production database schema.
- **Intelligent Table Grouping**: Automatically groups tables using existing foreign keys, column naming patterns (e.g., `_id` suffixes), and table prefixes to make large schemas manageable.
- **Multi-Format Exporters**:
  - **Eloquent (PHP)**: Generates Laravel Models with `$fillable`, `$casts`, and relationship methods (`belongsTo`, `hasMany`, etc.).
  - **Prisma**: Generates `schema.prisma` with datasource and model relations.
  - **DBML**: Exports to [dbdiagram.io](https://dbdiagram.io) compatible format.
  - **Mermaid**: Generates ER diagram syntax for embedding in Markdown documentation.
- **Query Recording & Chunking**: Run a TCP proxy to capture live database queries. Automatically groups queries into logical "chunks" based on interaction time and browser events.
- **Chrome Extension Integration**: Capture browser events (clicks, fetch, navigation) to sync with database recording for end-to-end debugging.
- **Archivolt Doctor**: Built-in diagnostic tool to verify environment health, dependencies, and data integrity with interactive auto-fix suggestions.
- **Powerful CLI**: Export your annotated schema directly to files or integrate with Laravel projects via Artisan.
- **Real-time Persistence**: Changes are saved instantly to a local `archivolt.json`, which serves as a single source of truth that is also LLM-readable.

---

## 🚀 Getting Started

### Prerequisites

- [Bun](https://bun.sh) (v1.0.0 or higher)
- [dbcli](https://github.com/CarlLee1983/dbcli) (to extract your database schema into JSON)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/intellectronica/archivolt.git
   cd archivolt
   ```
2. Install dependencies:
   ```bash
   bun install
   ```

### Usage

1. **Import your database schema**:
   Archivolt consumes JSON output from [dbcli](https://github.com/CarlLee1983/dbcli).
   ```bash
   # Extract schema using dbcli
   dbcli schema --format json > my-database.json

   # Import into Archivolt
   bun run dev --input my-database.json
   ```
   *Note: Use `--reimport` to update table/column information while preserving your existing annotations.*

2. **Start the visual interface**:
   The command above starts the API server. You also need to run the web frontend:
   ```bash
   bun run dev:all
   ```
   Open [http://localhost:5173](http://localhost:5173) in your browser.

3. **Record database queries**:
   Archivolt can act as a TCP proxy between your application and the database, capturing all queries in real time without needing database credentials — authentication is handled directly between your app and the target DB.

   ```bash
   # Start recording — specify target DB directly
   bun run dev record start --target localhost:3306

   # Or read DB_HOST / DB_PORT from a .env file
   bun run dev record start --from-env /path/to/.env --port 13306
   ```

   Then point your application's DB connection to `127.0.0.1:13306` (or the port you specified). Press `Ctrl+C` to stop.

   ```bash
   # Manage recording sessions
   bun run dev record status              # Check if a recording is active
   bun run dev record list                # List all sessions
   bun run dev record summary <session-id> # View query stats for a session
   ```

4. **Exporting via CLI**:
   ```bash
   # Export to Laravel Eloquent models
   bun run dev export eloquent --laravel path/to/laravel-project

   # Export to Mermaid ER diagram
   bun run dev export mermaid --output ./docs/schema
   ```

---

## 🗺️ Project Structure

- `src/Modules/Schema`: Core business logic (DDD-first structure).
  - `Domain`: ER Model entities and grouping strategies.
  - `Application`: Services for importing, managing vFKs, and exporting.
  - `Infrastructure`: JSON persistence, Exporters (Eloquent, Prisma, etc.), and File Writers.
- `web/`: React + ReactFlow frontend application.
- `archivolt.json`: The local data store for your annotations.

---

## 📜 License

[MIT](LICENSE)
