# Conventions

- **Path aliases**: `@/*` → `./src/*` (backend and Vitest), `@web/*` → `./web/src/*` (Vitest)
- **Interface naming**: `I` prefix (IExporter, IFileWriter, IContainer, IHealthCheck, IPrompter)
- **Formatter**: Biome, 2-space indent, single quotes, 100-character line width
- **Immutability**: Domain entities use `readonly` properties
- **Tests**: `test/unit/` mirrors `src/`
- **Vitest globals**: enabled; no `import` for `describe` / `it` / `expect`
- **DDD layering**: Domain has no framework dependencies and does not import external packages
- **Service providers**: each module registers dependencies via `*ServiceProvider`
