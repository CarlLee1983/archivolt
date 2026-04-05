# Instruction Contradictions & Resolutions

When multiple instruction files (e.g., `CLAUDE.md`, `AGENTS.md`, `skills/*.md`) in this project conflict, the Agent **MUST** follow the priority tier defined in this document.

## 1. Priority Tier

If instructions conflict, prioritize them in the following order (from highest to lowest):
1. **User Direct Prompt** (Explicit instructions in the current conversation)
2. **CONTRADICTIONS.md** (This document's arbitration results)
3. **AGENTS.md** (Core architecture and language policy)
4. **CLAUDE.md** (Skill routing and basic operations)
5. **skills/*.md** (Task-specific expert guidance)
6. **Existing Code Patterns** (Local style and conventions)

---

## 2. Known Contradictions & Resolutions

| Conflict | Source A | Source B | Resolution |
| :--- | :--- | :--- | :--- |
| **Package Management** | `package.json` | General AI / CLI norms | **Always use `bun`**. Do not use `npm` or `pnpm` unless explicitly required (e.g., extension build). |
| **Language Policy** | AI Default (EN) | `AGENTS.md` | **Communication must be in Traditional Chinese**. Git commits and code comments must be in English. |
| **Component Style** | `web/` (Functional) | Legacy Docs (Class) | **Use Functional Components** with Hooks for all new frontend work. |
| **Path Aliases** | Relative (`../../`) | `tsconfig.json` | **Prefer `@/*` (Backend) or `@web/*` (Frontend)** aliases over relative paths. |

---

## 3. Conflict Resolution Protocol

If you encounter an **unlisted** conflict while executing a task:
1. **Stop immediately**.
2. Report the conflict to the user (identify the source files and line numbers).
3. Ask the user: "This is a new instruction conflict. Which directive should I follow, or is this a specific exception?"
4. Once resolved, **update this document** to record the result, preventing future occurrences.
