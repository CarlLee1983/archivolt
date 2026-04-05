import type { QueryEvent } from '@/Modules/Recording/Domain/QueryEvent'

/**
 * Converts a log file (any format) to a stream of QueryEvents.
 * Implementations MUST read the file line-by-line to keep memory O(1).
 */
export interface IQueryLogParser {
  /**
   * Async generator that yields one QueryEvent per parsed log entry.
   * Skips non-query lines (headers, connect/quit events, comments).
   */
  parse(filePath: string): AsyncGenerator<QueryEvent>
}
