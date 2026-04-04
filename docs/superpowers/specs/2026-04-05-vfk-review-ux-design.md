# VFK Review UX 設計規格

## 概述

Archivolt 的核心使用場景是「確認關聯」，而非手動畫線。系統會自動推算虛擬外鍵（VFK），使用者的主要工作是審查這些建議並確認或忽略。本規格設計一套以「審查」為中心的 UX，讓使用者高效處理大量自動建議。

## 設計決策

- **主入口**：獨立 Review Tab，與 Canvas Tab 並列於頂部導航
- **確認模式**：預設一鍵確認（inline 展示推算結果），需要修改才展開表單
- **畫布聯動**：可選，使用者主動點「在畫布定位」才跳轉
- **拒絕處理**：標記為「已忽略」，可復原，不從系統刪除

## 導航結構

頂部新增兩個 Tab：

```
┌──────────────────────────────────────────────────────┐
│  Archivolt                [Canvas]  [Review ⚡ 23]   │
└──────────────────────────────────────────────────────┘
```

- `Review` Tab badge 顯示待審查數量（`confidence === 'auto-suggested'` 的 VFK 數）
- 數量為 0 時 badge 消失
- 點「在畫布定位」時自動切換到 Canvas Tab

## Review 頁面

### 三個子 Tab

- **待審查**：顯示所有 `confidence: 'auto-suggested'` 的 VFK
- **已確認**：顯示所有 `confidence: 'manual'` 的 VFK（唯讀，供查看）
- **已忽略**：顯示所有 `confidence: 'ignored'` 的 VFK，可復原

### 待審查清單佈局

每條建議預設摺疊，顯示推算結果與操作按鈕：

```
┌────────────────────────────────────────────────────┐
│  order_items.user_id  →  users.id                  │
│  [✓ 確認]  [✗ 忽略]  [⊞ 在畫布定位]               │
└────────────────────────────────────────────────────┘
```

點擊 `▼` 或需要修改時展開行內表單：

```
┌────────────────────────────────────────────────────┐
│  ▼  products.category_id  →  ?                     │
│  ┌────────────────────────────────────────────┐    │
│  │  來源欄位: [category_id        ▼]           │    │
│  │  目標表:   [categories        ▼]           │    │
│  │  目標欄位: [id                ▼]           │    │
│  │  [✓ 確認]  [取消]                          │    │
│  └────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────┘
```

推算目標不確定時（無法找到匹配表），顯示 `→ ?` 並強制展開等待使用者填寫。

### 已忽略 Tab

```
┌────────────────────────────────────────────────────┐
│  chat_messages.sender_id  →  users.id              │
│  忽略於 2026-04-05         [↩ 復原至待審查]         │
└────────────────────────────────────────────────────┘
```

## 畫布定位流程

點擊 `[⊞ 在畫布定位]` 後：

1. 切換到 Canvas Tab
2. 畫布 pan + zoom 至兩張相關表（使用現有 `fitBounds` 機制）
3. 兩張表節點觸發短暫 highlight pulse 動畫（約 1.5 秒）
4. 兩者之間的橙色虛線邊加粗顯示
5. 若 Focus Mode 已開啟，以其中一張表為中心啟動 Focus Mode

使用者看完後點頂部 `[Review]` Tab 返回繼續審查。

## 資料模型變更

### ERModel 型別擴充

```typescript
// 前（ERModel.ts）
confidence: 'manual' | 'auto-suggested'

// 後
confidence: 'manual' | 'auto-suggested' | 'ignored'
```

### confidence 狀態對應

| confidence | 畫布顯示 | Review 清單 |
|---|---|---|
| `auto-suggested` | 橙色虛線 ⚡ | 待審查 Tab |
| `manual` | 紫色實線 | 已確認 Tab |
| `ignored` | 不顯示 | 已忽略 Tab |

## API 變更

### 新增端點

```
PATCH /api/virtual-fk/:id
Body: { confidence: 'manual' | 'ignored' | 'auto-suggested' }
說明: 更新 VFK 狀態（確認 / 忽略 / 復原）
```

### 現有端點調整

```
PUT /api/virtual-fk
Body: {
  tableName: string,
  columns: string[],
  refTable: string,
  refColumns: string[],
  confidence?: 'manual' | 'auto-suggested'  // 預設 'manual'
}
說明: 新增時可同時修改欄位對應（確認並修正）
```

## 前端變更清單

### 新增元件

- `web/src/pages/ReviewPage.tsx` — Review 頁面主體
- `web/src/components/Review/SuggestionList.tsx` — 待審查清單
- `web/src/components/Review/SuggestionRow.tsx` — 單條建議列（摺疊 + 展開表單）
- `web/src/components/Review/ConfirmedList.tsx` — 已確認清單（唯讀）
- `web/src/components/Review/IgnoredList.tsx` — 已忽略清單

### 修改現有檔案

- `web/src/App.tsx` — 新增頂部 Tab 導航，路由到 Canvas / Review 頁面
- `web/src/components/Canvas/edges.ts` — `buildEdges` 跳過 `confidence === 'ignored'`
- `web/src/stores/schemaStore.ts` — 新增 `pendingVFKCount` 計算屬性（供 badge 使用）
- `web/src/api/schema.ts` — 新增 `patchVirtualFK(id, confidence)` API 方法

### 後端變更

- `src/Modules/Schema/Application/Services/VirtualFKService.ts` — 新增 `updateConfidence(id, confidence)` 方法
- `src/Modules/Schema/Presentation/Controllers/SchemaController.ts` — 新增 PATCH handler
- `src/Modules/Schema/Presentation/Routes/Schema.routes.ts` — 新增 PATCH 路由
- `src/Modules/Schema/Domain/ERModel.ts` — 擴充 `confidence` 型別

## 非功能需求

- **即時存檔**：確認 / 忽略 / 復原操作後立即寫入 `archivolt.json`
- **樂觀更新**：前端先更新 UI，API 呼叫失敗時回滾
- **無需分頁**：99 張表的場景下建議數量有限，清單全部顯示即可
