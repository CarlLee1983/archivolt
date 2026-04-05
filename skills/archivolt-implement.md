---
name: archivolt-implement
description: >
  Guided scaffolding skill — reads Archivolt analysis artifacts and an architecture
  recommendation, asks for the target framework, then walks the developer phase-by-phase
  through generating controllers, routes, models, services, and repositories.
  Optional: skip this skill entirely if you already know your architecture and tooling.
triggers:
  - 幫我實作架構
  - 開始 scaffold
  - 帶我建立框架結構
  - implement the architecture
  - scaffold from archivolt
  - 我想要開始重構
---

# archivolt-implement

> **Language rule:** Detect the user's language from the conversation. Ask all quoted questions and confirmations in that language.

> **Optional tool:** This skill is intended for engineers who want guided scaffolding. Experienced developers may skip it and work directly from Archivolt artifacts.

Guide the developer from Archivolt analysis artifacts to a scaffolded project using their chosen architecture and framework.

---

## Step 1 — Read artifacts

Check for the following files in the current directory:

| File | Required? | Used for |
|------|-----------|---------|
| `optimize-report.md` | Preferred | Architecture name lookup |
| `archivolt.json` | Preferred | VFK cluster → module boundaries |
| `http-recording.json` | Optional | Route + Controller list |
| `schema.sql` | Preferred | Model fields, Repository schema |

Read each file that exists. If `optimize-report.md` is present, extract the architecture name from the first line matching `## Recommended Architecture:`.

If `optimize-report.md` is missing, ask:

> "找不到 `optimize-report.md`。請告訴我要用哪種架構？
> a) Slim MVC
> b) Hexagonal / Clean Architecture
> c) DDD + DCI
> d) Modular Monolith
> e) Microservices"

---

## Step 2 — Confirm framework

Ask the developer:

> "你的技術棧是？
> a) PHP + Laravel
> b) Node.js + Express
> c) Python + Django
> d) 其他（請說明）"

If the developer answers (d), ask them to provide a command table in the same format as `playbooks/commands-laravel.md`. Proceed using their inline table.

---

## Step 3 — Load playbooks

Use the Read tool to load:

1. `~/.claude/plugins/archivolt/skills/playbooks/<arch-slug>.md`
   - `slim-mvc.md` for Slim MVC
   - `ddd-dci.md` for DDD + DCI
   - `hexagonal.md` for Hexagonal / Clean Architecture
   - `modular-monolith.md` for Modular Monolith
   - `microservices.md` for Microservices

2. `~/.claude/plugins/archivolt/skills/playbooks/commands-<fw>.md`
   - `commands-laravel.md` for Laravel
   - `commands-express.md` for Express
   - `commands-django.md` for Django

Cross-reference the two files to build the execution plan:
- For each Phase in the architecture playbook, look up the `action:` key in the command table.
- Fill `{{Variable}}` placeholders using artifact data:
  - `{{Controller}}` — derived from HTTP recording endpoint groups or VFK cluster names
  - `{{Model}}` — derived from `schema.sql` table names
  - `{{method}}` / `{{path}}` — derived from HTTP recording

---

## Step 4 — Walk phases

For each Phase in order:

1. **Announce the phase:**
   > "Phase N: [Phase Name] — [description from playbook]"

2. **Show the commands** with all variables filled in. Example:
   ```
   php artisan make:controller OrderController --api
   php artisan make:controller ProductController --api
   ```

3. **Wait for confirmation:**
   > "以上指令準備執行，確認繼續？（輸入 'skip' 跳過這個 Phase）"

4. **Execute** using the Bash tool (one command at a time).

5. **Verify** using the `verify:` expression from the command table (file existence check or equivalent).

6. **Report result** and ask:
   > "Phase N 完成。繼續到 Phase N+1？"

**On failure:** Show the error output, suggest a fix based on the verify condition, and offer retry or skip.

**On skip:** Record the skipped phase in the SCAFFOLD.md output.

---

## Step 5 — Write SCAFFOLD.md

After all phases are complete (or skipped), write `SCAFFOLD.md` in the current directory:

```markdown
# Scaffold Summary

**Architecture:** [name]
**Framework:** [name]
**Date:** [YYYY-MM-DD]

## Files Generated

[List every file created during this session, one per line]

## Phases Skipped

| Phase | Reason |
|-------|--------|
[List any skipped phases and the reason given]

## Recommended Next Steps

- Run your test suite to verify the scaffold compiles
- Review generated files and fill in business logic
- Use `/tdd` or `/tdd-workflow` to write tests for each Service method
- Use `/archivolt-advisor` if you want a second opinion on architecture fit
```

---

## Artifact variable resolution reference

| Playbook variable | Resolved from |
|-------------------|--------------|
| `{{Controller}}` | HTTP recording endpoint groups (e.g. `/orders/*` → `OrderController`) |
| `{{Model}}` | `schema.sql` table names (singular, PascalCase) |
| `{{method}}` | HTTP recording HTTP method (GET/POST/PUT/DELETE) |
| `{{path}}` | HTTP recording URL path |
| `{{Module}}` | VFK cluster name from `archivolt.json` |
| `{{Repository}}` | `{{Model}}Repository` |
| `{{Service}}` | `{{Model}}Service` or cluster-level name |
| `{{action}}` | Derived from HTTP method: GET collection → `index`, GET single → `show`, POST → `store`, PUT/PATCH → `update`, DELETE → `destroy` |
| `{{table}}` | Original snake_case table name from `schema.sql` (before PascalCase conversion) |
