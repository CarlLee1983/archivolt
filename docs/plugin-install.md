# Archivolt AI Skills — Installation Guide

Archivolt ships four AI skills that turn your AI coding assistant into a guided reverse-engineering workflow. Once installed, you can invoke them by name to walk through schema extraction, query recording, optimization analysis, and architecture recommendation — step by step.

## Skills included

| Skill | Trigger phrase | Purpose |
|-------|---------------|---------|
| `archivolt-schema` | "set up archivolt", "analyze my legacy DB schema" | Doctor check → DDL export → VFK review |
| `archivolt-record` | "record session", "capture queries" | Chrome extension + TCP proxy recording |
| `archivolt-analyze` | "run analysis", "generate optimization report" | Layer 1–3 analysis pipeline |
| `archivolt-advisor` | "recommend architecture", "help me migrate this old codebase" | Architecture recommendation from artifacts |

---

## Prerequisites

Archivolt must be installed first:

```bash
# From npm (recommended)
npm install -g archivolt

# Or from source
git clone https://github.com/CarlLee1983/Archivolt.git
cd archivolt
bun install
```

Verify the installation:

```bash
archivolt doctor
```

---

## Installation by platform

### Claude Code

```bash
archivolt install-skill
```

This copies all four `.md` skill files into `~/.claude/plugins/archivolt/skills/`.

**Activate:** Restart Claude Code. The skills load automatically on the next session.

**Verify:** Ask Claude Code: `"what archivolt skills do you have?"` — it should list all four skills.

---

### Cursor

```bash
archivolt install-skill --cursor
```

This writes `.mdc` files to `.cursor/rules/` in the current project directory.

**Scope:** Skills are project-scoped. Run this command inside each project where you want Archivolt guidance.

**Activate:** No restart needed — Cursor picks up `.cursor/rules/` changes immediately.

---

### Codex / ChatGPT system prompt

```bash
archivolt install-skill --codex
```

This writes `archivolt-skills-system-prompt.md` to the current directory — a single Markdown file that concatenates all four skills.

**Activate:** Prepend the contents of `archivolt-skills-system-prompt.md` to your Codex or ChatGPT custom system prompt.

```bash
# Preview the output
cat archivolt-skills-system-prompt.md | head -40
```

---

## What gets installed

`archivolt install-skill` copies:

- `archivolt-schema.md`, `archivolt-record.md`, `archivolt-analyze.md`, `archivolt-advisor.md` — core workflow skills
- `archivolt-implement.md` — optional guided scaffolding skill
- `playbooks/` — architecture phase sequences and framework command tables (used by `archivolt-implement`)

The `archivolt-implement` skill and playbooks are **optional**. Experienced developers who already know their architecture and tooling can use the other four skills without ever invoking `archivolt-implement`.

---

## Using the skills

Once installed, invoke a skill by describing what you want to do. The skill auto-triggers on matching phrases:

```
# Start from scratch on a legacy project
"I need to reverse-engineer this old codebase"

# After schema is ready, record query behavior
"capture queries from my running app"

# After recording, run analysis
"generate an optimization report"

# After analysis, get architecture advice
"recommend an architecture for refactoring this"
```

The full four-skill workflow produces:

```
archivolt-schema
  └─ schema.sql + archivolt.json (confirmed VFKs)
      └─ archivolt-record
           └─ recording session
               └─ archivolt-analyze
                    └─ optimize-report.md
                        └─ archivolt-advisor
                             └─ Architecture Recommendation Report
```

---

## Updating

After upgrading Archivolt, re-run the install command to pick up updated skills:

```bash
# Update the package
npm update -g archivolt

# Reinstall skills
archivolt install-skill          # Claude Code
archivolt install-skill --cursor # Cursor
archivolt install-skill --codex  # Codex
```

---

## Troubleshooting

**Skills not triggering in Claude Code**

Check that the files are in the right location:

```bash
ls ~/.claude/plugins/archivolt/skills/
```

Expected output:
```
archivolt-advisor.md
archivolt-analyze.md
archivolt-record.md
archivolt-schema.md
```

If the directory is empty, re-run `archivolt install-skill` and restart Claude Code.

**`archivolt: command not found`**

The CLI is not on your `PATH`. If installed globally via npm:

```bash
npm install -g archivolt
# Then verify
archivolt --version
```

If running from source, use `bun run dev` instead of `archivolt` for all commands.
