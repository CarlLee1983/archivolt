# Proxy 效能優化設計

## 目標

降低 TCP Proxy（DB 側錄）與 HTTP Proxy（API 側錄）對目標應用的延遲影響，使側錄機制可在 100+ QPS 的正常環境中持續收集，額外延遲 < 10ms（理想目標 < 1ms）。

## 問題根源

### 瓶頸 1【最嚴重】RecordingRepository append 是 O(n)

`appendQueries`、`appendMarkers`、`appendHttpChunks` 每次都先 `readFile` 整個 JSONL 檔案，再 `writeFile` 寫回。隨著 session 累積，檔案愈大，每次 flush 的 I/O 成本線性增長。

### 瓶頸 2【HTTP Proxy 阻塞回應】

`HttpProxy` 中 `await onChunk(...)` 之後才 `return new Response`，導致 client 必須等磁碟 I/O 完成才能拿到回應，疊加瓶頸 1 後每個 HTTP 請求額外增加數十毫秒。

### 瓶頸 3【並發寫入 race condition】

`RecordingService.handleQuery` 呼叫 `this.flush()` 但不 await，導致多個 flush 可能同時讀寫同一個 JSONL 檔案，造成資料損壞風險。

## 方案選擇

| 方案 | 描述 | 結論 |
|------|------|------|
| A 最小修復 | appendFile + fire-and-forget | 解決瓶頸 1/2，但保留 race condition 風險 |
| **B WriteStream 架構** | 持久 WriteStream + incremental stats | 解決全部三個瓶頸，複雜度適中 ✅ |
| C Ring Buffer + WAL | 記憶體 buffer + fsync + worker | 解 crash durability，但 ring overflow 無解，過度設計 ✗ |

## 採用方案：B — WriteStream 架構

### 改動範圍

| 檔案 | 改動摘要 |
|------|---------|
| `RecordingRepository.ts` | 新增 `openStreams` / `closeStreams`；append 方法改為同步 `stream.write()` |
| `RecordingService.ts` | 移除 `buffer[]`、`flushTimer`、`allQueries[]`；改用 incremental stats |
| `HttpProxy.ts` | `onChunk` 改為 fire-and-forget，立刻回傳 response |

TcpProxy、Domain 型別、JSONL 格式完全不變。

## 詳細設計

### RecordingRepository

Session 生命週期新增兩個方法管理 WriteStream：

```typescript
// Session 啟動時呼叫
openStreams(sessionId: string): void {
  const dir = this.sessionDir(sessionId)
  mkdirSync(dir, { recursive: true })
  const make = (filename: string) => {
    const s = fs.createWriteStream(path.join(dir, filename), { flags: 'a' })
    s.on('error', (err) =>
      console.error(`[Recording] stream error [${sessionId}/${filename}]:`, err)
    )
    return s
  }
  this.streams.set(sessionId, {
    queries:    make('queries.jsonl'),
    markers:    make('markers.jsonl'),
    httpChunks: make('http_chunks.jsonl'),
  })
}

// Session 停止時呼叫（等全部 buffered write 落地）
async closeStreams(sessionId: string): Promise<void> {
  const s = this.streams.get(sessionId)
  if (!s) return
  await Promise.all([
    new Promise<void>((res) => s.queries.end(res)),
    new Promise<void>((res) => s.markers.end(res)),
    new Promise<void>((res) => s.httpChunks.end(res)),
  ])
  this.streams.delete(sessionId)
}
```

Append 方法改為同步 `stream.write()`，加 destroyed/closed guard 防 race condition：

```typescript
appendQueries(sessionId: string, queries: readonly CapturedQuery[]): void {
  const s = this.streams.get(sessionId)
  if (!s || queries.length === 0) return
  if (s.queries.destroyed || s.queries.closed) return
  s.queries.write(queries.map((q) => JSON.stringify(q)).join('\n') + '\n')
}
// markers / httpChunks 同理
```

讀取方法（`loadQueries` 等）只在分析階段（session 已停止後）呼叫，維持現有實作不動。

### RecordingService

移除 `buffer`、`flushTimer`、`allQueries`，改用 incremental stats：

```typescript
private stats = {
  totalQueries: 0,
  byOperation: {} as Record<string, number>,
  tablesAccessed: new Set<string>(),
}

private handleQuery(query: CapturedQuery): void {
  this.repo.appendQueries(this.currentSession!.id, [query])  // 直接 push
  this.stats.totalQueries++
  this.stats.byOperation[query.operation] = (this.stats.byOperation[query.operation] ?? 0) + 1
  query.tables.forEach((t) => this.stats.tablesAccessed.add(t))
}

async start(config: ProxyConfig): Promise<RecordingSession> {
  const session = createSession(config)
  this.repo.openStreams(session.id)          // ← 新增
  this._proxyPort = await this.proxy.start()
  await this.repo.saveSession(session)
  // 不再需要 setInterval
  return session
}

async stop(): Promise<RecordingSession> {
  await this.proxy?.stop()
  await this.repo.closeStreams(this.currentSession!.id)  // ← 保證落地

  const stopped = stopSession(
    applyIncrementalStats(this.currentSession!, this.stats, this.proxy?.connectionCount ?? 0)
  )
  await this.repo.saveSession(stopped)
  this.stats = { totalQueries: 0, byOperation: {}, tablesAccessed: new Set() }
  this.currentSession = null
  return stopped
}
```

`addMarker` 呼叫 `repo.appendMarkers()`，同樣改為 stream write（同步，不 await）。

### HttpProxy

唯一改動：`onChunk` 不再 await：

```typescript
// 拿到 upstream response 後
void onChunk([requestChunk, responseChunk])  // fire-and-forget
return new Response(resBuffer, {
  status: targetResponse.status,
  headers: targetResponse.headers,
})
```

Session 停止後抵達的 chunk 會被 `appendHttpChunks` 的 `destroyed/closed` guard 靜默丟棄，屬於 session 邊界的合理行為。

## 資料完整性保證

| 情境 | 保證 |
|------|------|
| 正常 `record stop` | `closeStreams` await 所有 stream.end()，全部落地後才標記 stopped ✅ |
| Process crash / kill -9 | 損失 OS stream 內部 buffer（通常 < 4KB），可接受 |
| 磁碟滿 | stream error handler 記 log，proxy 繼續運作不中斷 ✅ |
| Session 停止後的遲到 chunk | guard 靜默丟棄，不影響已落地資料 ✅ |

## 延遲預估

| 路徑 | 優化前 | 優化後 |
|------|--------|--------|
| TCP Proxy（每筆 SQL）| flush 時 ≈ 數 ms（讀整個檔） | `stream.write()` ≈ 0.02ms |
| HTTP Proxy（每個 request）| `await onChunk` ≈ 數 ms | fire-and-forget ≈ 0ms 額外延遲 |
| Session stop | buffer flush + 統計計算 | `await stream.end()` + incremental stats |

## 測試策略

現有 integration test 架構不變，以下新增或調整：

- `RecordingRepository`：驗證 `openStreams` → append × N → `closeStreams` 後 JSONL 行數正確
- `RecordingService`：驗證 stop 後 `session.stats` 與實際寫入的 queries 一致
- `HttpProxy`：驗證 fire-and-forget 下 response 立即回傳，chunk 非同步寫入（mock stream）
- Race condition：模擬 session stop 與 HTTP chunk 同時抵達，驗證不 crash、不損壞已落地資料
