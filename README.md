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
- **Powerful CLI**: Export your annotated schema directly to files or integrate with Laravel projects via Artisan.
- **Real-time Persistence**: Changes are saved instantly to a local `archivolt.json`, which serves as a single source of truth that is also LLM-readable.

---

## 🚀 Getting Started

### Prerequisites

- [Bun](https://bun.sh) (v1.0.0 or higher)
- [dbcli](https://github.com/intellectronica/dbcli) (to extract your database schema into JSON)

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
   Archivolt consumes JSON output from [dbcli](https://github.com/intellectronica/dbcli).
   ```bash
   bun run dev --input path/to/dbcli/config.json
   ```
   *Note: Use `--reimport` to update table/column information while preserving your existing annotations.*

2. **Start the visual interface**:
   The command above starts the API server. You also need to run the web frontend:
   ```bash
   bun run dev:all
   ```
   Open [http://localhost:5173](http://localhost:5173) in your browser.

3. **Exporting via CLI**:
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
