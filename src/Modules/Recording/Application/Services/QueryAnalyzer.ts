// src/Modules/Recording/Application/Services/QueryAnalyzer.ts

export interface AnalyzedQuery {
  readonly operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'OTHER'
  readonly tables: readonly string[]
  readonly isTransaction: boolean
  readonly isSchemaChange: boolean
}

const TRANSACTION_KEYWORDS = /^\s*(BEGIN|START\s+TRANSACTION|COMMIT|ROLLBACK)\b/i
const SCHEMA_CHANGE_KEYWORDS = /^\s*(ALTER|CREATE|DROP|TRUNCATE)\s+(TABLE|INDEX|DATABASE)\b/i

const TABLE_PATTERNS = [
  /\bFROM\s+`?(\w[\w.-]*)`?/gi,
  /\bJOIN\s+`?(\w[\w.-]*)`?/gi,
  /\bINTO\s+`?(\w[\w.-]*)`?/gi,
  /\bUPDATE\s+`?(\w[\w.-]*)`?/gi,
]

function extractOperation(sql: string): AnalyzedQuery['operation'] {
  const trimmed = sql.trimStart().toUpperCase()
  if (trimmed.startsWith('SELECT')) return 'SELECT'
  if (trimmed.startsWith('INSERT')) return 'INSERT'
  if (trimmed.startsWith('UPDATE')) return 'UPDATE'
  if (trimmed.startsWith('DELETE')) return 'DELETE'
  return 'OTHER'
}

function extractTables(sql: string): readonly string[] {
  const tables = new Set<string>()

  for (const pattern of TABLE_PATTERNS) {
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(sql)) !== null) {
      let tableName = match[1]
      // Strip schema prefix: mydb.users → users
      const dotIdx = tableName.lastIndexOf('.')
      if (dotIdx !== -1) {
        tableName = tableName.slice(dotIdx + 1)
      }
      tables.add(tableName)
    }
  }

  return [...tables]
}

export function analyzeQuery(sql: string): AnalyzedQuery {
  return {
    operation: extractOperation(sql),
    tables: extractTables(sql),
    isTransaction: TRANSACTION_KEYWORDS.test(sql),
    isSchemaChange: SCHEMA_CHANGE_KEYWORDS.test(sql),
  }
}
