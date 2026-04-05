---
name: archivolt-schema
description: Set up Archivolt for a legacy project — run doctor, collect DDL schema, and guide VFK review. Use when starting Archivolt on a new project or when schema has changed.
triggers:
  - 分析我的舊資料庫 schema
  - 設定 Archivolt
  - review VFK
  - set up archivolt
  - 我要逆向分析這個舊專案
---

# archivolt-schema

Guide the developer through environment setup, schema collection, and Virtual Foreign Key review for a legacy database.

## When to use

Run this skill once at the start of a legacy reverse-engineering project, or whenever the schema changes significantly.

## Step 1 — Doctor check

Run the health check to verify CLI, DB connectivity, and dependencies:

```bash
archivolt doctor
```

**Expected output:** All checks pass (✅). If any check fails, follow the fix instructions printed by doctor before continuing.

**Gate:** Do not proceed until `archivolt doctor` exits without errors.

## Step 2 — DB connection setup

If doctor reported a DB connection failure:

1. Locate or create `.env` in the project root
2. Set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
3. Re-run `archivolt doctor` and confirm the DB check passes

## Step 3 — Schema collection

Export the full DDL schema:

```bash
archivolt analyze --ddl schema.sql
```

**Expected output:** `schema.sql` written to the current directory, containing `CREATE TABLE` statements for all tables.

Verify: `wc -l schema.sql` should show a non-zero line count.

## Step 4 — VFK review

Archivolt auto-detects Virtual Foreign Keys (name-based matching). Now confirm or reject them:

1. Start the web UI:
   ```bash
   bun run dev:all
   ```
2. Open `http://localhost:5173` in the browser
3. Navigate to the **Review** page (sidebar)
4. For each **Pending** VFK:
   - Click **Confirm** if the relationship is real
   - Click **Ignore** if it is a false positive
5. Optionally add manual VFKs for relationships the auto-detection missed

**Gate:** Ask the developer:

> "VFK 審查完成了嗎？Pending 數量是否歸零，或剩餘的都是你決定忽略的？"

Only proceed when the developer confirms.

## Output artifacts

- `schema.sql` — DDL snapshot used by `archivolt-analyze`
- `archivolt.json` — Updated with confirmed/ignored VFKs

## Next step

Run `/archivolt-record` to capture query behavior from the application.
