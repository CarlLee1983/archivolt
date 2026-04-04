import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import type { RecordingSession, CapturedQuery } from '@/Modules/Recording/Domain/Session'
import type { OperationMarker } from '@/Modules/Recording/Domain/OperationMarker'
import type { HttpChunk } from '@/Modules/Recording/Domain/HttpChunk'

export class RecordingRepository {
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

  async saveSession(session: RecordingSession): Promise<void> {
    const dir = this.sessionDir(session.id)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    const json = JSON.stringify(session, null, 2)
    await writeFile(this.sessionFile(session.id), json, 'utf-8')
  }

  async loadSession(sessionId: string): Promise<RecordingSession | null> {
    const filePath = this.sessionFile(sessionId)
    if (!existsSync(filePath)) return null
    const text = await readFile(filePath, 'utf-8')
    return JSON.parse(text) as RecordingSession
  }

  async appendQueries(sessionId: string, queries: readonly CapturedQuery[]): Promise<void> {
    if (queries.length === 0) return
    const lines = queries.map((q) => JSON.stringify(q)).join('\n') + '\n'
    const filePath = this.queriesFile(sessionId)
    const existing = existsSync(filePath) ? await readFile(filePath, 'utf-8') : ''
    await writeFile(filePath, existing + lines, 'utf-8')
  }

  async appendMarkers(sessionId: string, markers: readonly OperationMarker[]): Promise<void> {
    if (markers.length === 0) return
    const lines = markers.map((m) => JSON.stringify(m)).join('\n') + '\n'
    const filePath = this.markersFile(sessionId)
    const existing = existsSync(filePath) ? await readFile(filePath, 'utf-8') : ''
    await writeFile(filePath, existing + lines, 'utf-8')
  }

  async loadMarkers(sessionId: string): Promise<OperationMarker[]> {
    const filePath = this.markersFile(sessionId)
    if (!existsSync(filePath)) return []
    const text = await readFile(filePath, 'utf-8')
    if (!text.trim()) return []
    return text
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as OperationMarker)
  }

  async loadQueries(sessionId: string): Promise<CapturedQuery[]> {
    const filePath = this.queriesFile(sessionId)
    if (!existsSync(filePath)) return []
    const text = await readFile(filePath, 'utf-8')
    if (!text.trim()) return []
    return text
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as CapturedQuery)
  }

  async appendHttpChunks(sessionId: string, chunks: readonly HttpChunk[]): Promise<void> {
    if (chunks.length === 0) return
    const lines = chunks.map((c) => JSON.stringify(c)).join('\n') + '\n'
    const filePath = this.httpChunksFile(sessionId)
    const existing = existsSync(filePath) ? await readFile(filePath, 'utf-8') : ''
    await writeFile(filePath, existing + lines, 'utf-8')
  }

  async loadHttpChunks(sessionId: string): Promise<HttpChunk[]> {
    const filePath = this.httpChunksFile(sessionId)
    if (!existsSync(filePath)) return []
    const text = await readFile(filePath, 'utf-8')
    if (!text.trim()) return []
    return text
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as HttpChunk)
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
}
