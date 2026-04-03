# Conventions

- **Path alias**：`@/*` 對應 `./src/*`（backend 與 vitest），`@web/*` 對應 `./web/src/*`（vitest）
- **Interface 命名**：`I` 前綴（IExporter, IFileWriter, IContainer, IHealthCheck, IPrompter）
- **Formatter**：Biome，2 space indent，single quotes，100 char line width
- **Immutability**：Domain 實體使用 readonly 屬性
- **測試結構**：`test/unit/` 鏡射 `src/` 目錄結構
- **Vitest globals**：已啟用，不需 import `describe`/`it`/`expect`
- **DDD 分層**：Domain 層不依賴框架，不引用外部套件
- **Service Provider**：每個模組透過 `*ServiceProvider` 註冊依賴
