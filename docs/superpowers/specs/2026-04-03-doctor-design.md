# Doctor 功能設計

## 概述

Archivolt Doctor 是一個環境診斷與資料完整性檢查工具，提供 CLI 指令與啟動時自動檢查兩種使用方式。發現問題時支援互動式逐項修復。

## 使用方式

### CLI 指令

```bash
bun run dev doctor           # 完整檢查 + 互動修復
bun run dev doctor --no-fix  # 只報告，不詢問修復
```

### 啟動時自動檢查

Server 啟動時自動執行所有 checks（等同 `--no-fix` 模式）：
- 只在有 warn/error 時印出摘要
- 不阻止啟動，僅警告
- 不進入互動修復

## Domain 層

### 型別定義

```typescript
type CheckSeverity = 'ok' | 'warn' | 'error'

interface CheckResult {
  readonly name: string
  readonly category: 'environment' | 'data'
  readonly severity: CheckSeverity
  readonly message: string
  readonly fixable: boolean
}

interface IHealthCheck {
  readonly name: string
  readonly category: 'environment' | 'data'
  check(): Promise<CheckResult>
  fix?(): Promise<CheckResult>
}
```

`fixable` 由是否實作 `fix()` 方法決定。

## 檢查項清單

### 環境檢查 (environment)

| 檢查項 | 檢查內容 | 可修復 |
|--------|---------|--------|
| Bun 版本 | `bun --version` >= 1.0.0 | 否，提示升級指令 |
| dbcli 可用 | `dbcli --version` 可執行 | 否，提示安裝方式 |
| Port 可用 | :3100 未被佔用 | 否，提示誰佔用了 |
| 依賴安裝 | `node_modules` 存在且 lockfile 未過期 | 是，執行 `bun install` |
| Web 依賴安裝 | `web/node_modules` 存在 | 是，執行 `cd web && bun install` |
| recordings 目錄 | `data/recordings/` 存在 | 是，建立目錄 |

### 資料完整性 (data)

| 檢查項 | 檢查內容 | 可修復 |
|--------|---------|--------|
| archivolt.json 存在 | 檔案存在且可解析為合法 JSON | 否，提示需先 import schema |
| Schema 結構驗證 | 頂層結構符合 ERModel 型別 | 否，報告具體錯誤 |
| Virtual FK 參照完整性 | 所有 vFK 的 source/target table 和 column 都存在 | 是，移除 orphan vFK |
| Table Group 完整性 | group 內引用的 table 都存在 | 是，移除 orphan 引用 |
| 錄製資料完整性 | `data/recordings/*.jsonl` 可解析、session 未損壞 | 否，報告損壞的 session |

## 執行流程

1. 先執行所有 `category: 'environment'` 的 checks
2. 若環境檢查有任何 error，跳過資料完整性檢查並告知原因
3. 環境通過後，執行所有 `category: 'data'` 的 checks
4. 統一呈現結果報告
5. 若非 `--no-fix` 模式，逐項詢問可修復的問題是否執行修復

## 輸出格式

分「環境」「資料完整性」兩區塊，每項用符號標示：

- `✓` — ok
- `!` — warn
- `✗` — error

最後顯示統計摘要（N error, N warning, N passed）。互動修復以 `[1/N]` 編號逐項詢問 `(y/n)`。

## 架構設計

### 方案：單一 Check Pipeline + 環境優先分組

所有 checks 實作 `IHealthCheck` 介面，由 `DoctorService` 依序執行。環境組先跑，通過後跑資料組。簡單直接，易於擴充。

### 檔案結構

```
src/Modules/Doctor/
  Domain/
    IHealthCheck.ts              # 介面與型別
  Application/
    DoctorService.ts             # 執行 checks、收集結果
  Infrastructure/
    Checks/
      Environment/
        BunVersionCheck.ts
        DbcliAvailableCheck.ts
        PortAvailableCheck.ts
        DependenciesCheck.ts
        WebDependenciesCheck.ts
        RecordingsDirCheck.ts
      Data/
        ArchivoltJsonCheck.ts
        SchemaStructureCheck.ts
        VirtualFkIntegrityCheck.ts
        TableGroupIntegrityCheck.ts
        RecordingIntegrityCheck.ts
    DoctorReporter.ts            # 格式化輸出
    InteractivePrompter.ts       # 互動式 y/n 詢問
  Presentation/
    DoctorCommand.ts             # CLI 指令解析
```

### 整合點

1. **CLI 路由** — `src/index.ts` 新增 `doctor` case，導向 `DoctorCommand`
2. **啟動時檢查** — `src/bootstrap.ts` server 啟動後呼叫 `DoctorService`（靜默模式）
3. **DI 註冊** — 新增 `DoctorServiceProvider`，註冊所有 checks

### 依賴方向

```
DoctorCommand → DoctorService → IHealthCheck[]
                              → DoctorReporter
                              → InteractivePrompter
```

Domain 層零依賴。Infrastructure 的各 Check 可依賴 Bun API（fs、child_process）和 JsonFileRepository。
