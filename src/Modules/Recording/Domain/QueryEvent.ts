/**
 * Canonical log input format. All IQueryLogParser implementations output this.
 * External tools targeting Archivolt should produce JSONL where each line is one QueryEvent.
 */
export interface QueryEvent {
  /** Unix ms timestamp, required */
  readonly timestamp: number
  /** Raw SQL string, required */
  readonly sql: string
  /** Connection ID string — used for flow grouping (general log provides this) */
  readonly connectionId?: string
  /** Execution time in milliseconds (slow log provides this) */
  readonly durationMs?: number
  /** Rows examined (slow log provides this) */
  readonly rowsExamined?: number
  /** Target database name */
  readonly database?: string
}
