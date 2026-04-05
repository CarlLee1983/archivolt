import { analyzeQuery } from '@/Modules/Recording/Application/Services/QueryAnalyzer'
import { createCapturedQuery } from '@/Modules/Recording/Domain/Session'
import type { RecordingSession } from '@/Modules/Recording/Domain/Session'
import type { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'
import { CanonicalJsonlParser } from '@/Modules/Recording/Infrastructure/Parsers/CanonicalJsonlParser'
import { MysqlGeneralLogParser } from '@/Modules/Recording/Infrastructure/Parsers/MysqlGeneralLogParser'
import { MysqlSlowQueryLogParser } from '@/Modules/Recording/Infrastructure/Parsers/MysqlSlowQueryLogParser'
import type { IQueryLogParser } from '@/Modules/Recording/Infrastructure/Parsers/IQueryLogParser'

export type ImportFormat = 'canonical' | 'general-log' | 'slow-log'

let _importCounter = 0

export class LogImportService {
  constructor(private readonly repo: RecordingRepository) {}

  async import(filePath: string, format: ImportFormat): Promise<string> {
    const parser = this.selectParser(format)
    const sessionId = `imp_${Date.now()}_${_importCounter++}`

    this.repo.openStreams(sessionId)

    let totalQueries = 0
    let firstTimestamp: number | undefined
    let lastTimestamp: number | undefined
    const byOperation: Record<string, number> = {}
    const tablesAccessed = new Set<string>()
    const connectionIds = new Set<string>()

    try {
      for await (const event of parser.parse(filePath)) {
        const { operation, tables } = analyzeQuery(event.sql)

        const query = createCapturedQuery({
          sessionId,
          connectionId: event.connectionId ? parseInt(event.connectionId, 10) : 0,
          sql: event.sql,
          operation,
          tables: [...tables],
          duration: event.durationMs ?? 0,
        })

        // Override auto-generated timestamp with log's timestamp
        const queryWithTs = { ...query, timestamp: event.timestamp }

        this.repo.appendQueries(sessionId, [queryWithTs])

        totalQueries++
        if (firstTimestamp === undefined || event.timestamp < firstTimestamp) {
          firstTimestamp = event.timestamp
        }
        if (lastTimestamp === undefined || event.timestamp > lastTimestamp) {
          lastTimestamp = event.timestamp
        }
        byOperation[operation] = (byOperation[operation] ?? 0) + 1
        for (const t of tables) tablesAccessed.add(t)
        if (event.connectionId) connectionIds.add(event.connectionId)
      }

      const session: RecordingSession = {
        id: sessionId,
        startedAt: firstTimestamp ?? Date.now(),
        endedAt: lastTimestamp ?? Date.now(),
        status: 'stopped',
        proxy: { listenPort: 0, targetHost: 'imported', targetPort: 0 },
        stats: {
          totalQueries,
          byOperation,
          tablesAccessed: [...tablesAccessed].sort(),
          connectionCount: connectionIds.size,
        },
      }

      await this.repo.saveSession(session)
      return sessionId
    } finally {
      await this.repo.closeStreams(sessionId)
    }
  }

  private selectParser(format: ImportFormat): IQueryLogParser {
    switch (format) {
      case 'canonical':   return new CanonicalJsonlParser()
      case 'general-log': return new MysqlGeneralLogParser()
      case 'slow-log':    return new MysqlSlowQueryLogParser()
    }
  }
}
