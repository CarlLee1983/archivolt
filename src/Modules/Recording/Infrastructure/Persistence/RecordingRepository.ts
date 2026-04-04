import { existsSync, mkdirSync, readdirSync, createWriteStream } from 'node:fs'
import type { WriteStream } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { RecordingSession, CapturedQuery } from '@/Modules/Recording/Domain/Session'
import type { OperationMarker } from '@/Modules/Recording/Domain/OperationMarker'
import type { HttpChunk } from '@/Modules/Recording/Domain/HttpChunk'

interface SessionStreams {
  queries: WriteStream
  markers: WriteStream
  httpChunks: WriteStream
}

export class RecordingRepository {
  private streams = new Map<string, SessionStreams>()

  constructor(private readonly baseDir: string) {
    if (!existsSync(baseDir)) {
      mkdirSync(baseDir, { recursive: true })
    }
  }

  private sessionDir(sessionId: string): string {
    return path.join(this.baseDir, sessionId)
  }

  private sessionFile(sessionId: string): string {
    return path.join(this.sessionDir(sessionId), 'session.json')
  }

  private queriesFile(sessionId: string): string {
    return path.join(this.sessionDir(sessionId), 'queries.jsonl')
  }

  private markersFile(sessionId: string): string {
    return path.join(this.sessionDir(sessionId), 'markers.jsonl')
  }

  private httpChunksFile(sessionId: string): string {
    return path.join(this.sessionDir(sessionId), 'http_chunks.jsonl')
  }

  private makeStream(filePath: string, sessionId: string, label: string): WriteStream {
    const s = createWriteStream(filePath, { flags: 'a' })
    s.on('error', (err) =>
      console.error(`[Recording] stream error [${sessionId}/${label}]:`, err),
    )
    return s
  }

  openStreams(sessionId: string): void {
    if (this.streams.has(sessionId)) {
      throw new Error(`[Recording] openStreams called twice for session ${sessionId}`)
    }
    const dir = this.sessionDir(sessionId)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    this.streams.set(sessionId, {
      queries:    this.makeStream(this.queriesFile(sessionId),    sessionId, 'queries.jsonl'),
      markers:    this.makeStream(this.markersFile(sessionId),    sessionId, 'markers.jsonl'),
      httpChunks: this.makeStream(this.httpChunksFile(sessionId), sessionId, 'http_chunks.jsonl'),
    })
  }

  async closeStreams(sessionId: string): Promise<void> {
    const s = this.streams.get(sessionId)
    if (!s) return
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        s.queries.end((err: Error | null | undefined) => (err ? reject(err) : resolve()))
      }),
      new Promise<void>((resolve, reject) => {
        s.markers.end((err: Error | null | undefined) => (err ? reject(err) : resolve()))
      }),
      new Promise<void>((resolve, reject) => {
        s.httpChunks.end((err: Error | null | undefined) => (err ? reject(err) : resolve()))
      }),
    ])
    this.streams.delete(sessionId)
  }

  appendQueries(sessionId: string, queries: readonly CapturedQuery[]): void {
    if (queries.length === 0) return
    const s = this.streams.get(sessionId)
    if (!s || s.queries.destroyed || s.queries.closed) return
    s.queries.write(queries.map((q) => JSON.stringify(q)).join('\n') + '\n')
  }

  appendMarkers(sessionId: string, markers: readonly OperationMarker[]): void {
    if (markers.length === 0) return
    const s = this.streams.get(sessionId)
    if (!s || s.markers.destroyed || s.markers.closed) return
    s.markers.write(markers.map((m) => JSON.stringify(m)).join('\n') + '\n')
  }

  appendHttpChunks(sessionId: string, chunks: readonly HttpChunk[]): void {
    if (chunks.length === 0) return
    const s = this.streams.get(sessionId)
    if (!s || s.httpChunks.destroyed || s.httpChunks.closed) return
    s.httpChunks.write(chunks.map((c) => JSON.stringify(c)).join('\n') + '\n')
  }

  async saveSession(session: RecordingSession): Promise<void> {
    const dir = this.sessionDir(session.id)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    await writeFile(this.sessionFile(session.id), JSON.stringify(session, null, 2), 'utf-8')
  }

  async loadSession(sessionId: string): Promise<RecordingSession | null> {
    const filePath = this.sessionFile(sessionId)
    if (!existsSync(filePath)) return null
    const text = await readFile(filePath, 'utf-8')
    return JSON.parse(text) as RecordingSession
  }

  async loadQueries(sessionId: string): Promise<CapturedQuery[]> {
    const filePath = this.queriesFile(sessionId)
    if (!existsSync(filePath)) return []
    const text = await readFile(filePath, 'utf-8')
    if (!text.trim()) return []
    return text.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line) as CapturedQuery)
  }

  async loadMarkers(sessionId: string): Promise<OperationMarker[]> {
    const filePath = this.markersFile(sessionId)
    if (!existsSync(filePath)) return []
    const text = await readFile(filePath, 'utf-8')
    if (!text.trim()) return []
    return text.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line) as OperationMarker)
  }

  async loadHttpChunks(sessionId: string): Promise<HttpChunk[]> {
    const filePath = this.httpChunksFile(sessionId)
    if (!existsSync(filePath)) return []
    const text = await readFile(filePath, 'utf-8')
    if (!text.trim()) return []
    return text.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line) as HttpChunk)
  }

  async listSessions(): Promise<RecordingSession[]> {
    if (!existsSync(this.baseDir)) return []
    const entries = readdirSync(this.baseDir, { withFileTypes: true })
    const sessions: RecordingSession[] = []
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const session = await this.loadSession(entry.name)
        if (session) sessions.push(session)
      }
    }
    return sessions
  }

  async exists(): Promise<boolean> {
    return existsSync(this.baseDir)
  }

  async getTableCount(): Promise<number> {
    return 0
  }

  async hasGroups(): Promise<boolean> {
    return false
  }
}
