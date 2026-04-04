export interface ParsedSchema {
  readonly tables: readonly ParsedTable[]
}

export interface ParsedTable {
  readonly name: string
  readonly columns: readonly string[]
  readonly indexes: readonly ParsedIndex[]
  readonly primaryKey: readonly string[]
}

export interface ParsedIndex {
  readonly name: string
  readonly columns: readonly string[]
  readonly unique: boolean
}

function stripBackticks(s: string): string {
  return s.replace(/`/g, '').trim()
}

function extractColumns(columnsStr: string): readonly string[] {
  return columnsStr
    .split(',')
    .map((c) => stripBackticks(c.trim()).replace(/\(\d+\)$/, '')) // strip length suffix e.g. name(191)
    .filter(Boolean)
}

interface MutableTable {
  name: string
  columns: string[]
  indexes: ParsedIndex[]
  primaryKey: string[]
}

function parseTableBody(body: string): Pick<MutableTable, 'columns' | 'indexes' | 'primaryKey'> {
  const columns: string[] = []
  const indexes: ParsedIndex[] = []
  let primaryKey: string[] = []

  const lines = body
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  for (const line of lines) {
    // PRIMARY KEY (`col1`, `col2`)
    const pkMatch = line.match(/^PRIMARY\s+KEY\s*\(([^)]+)\)/i)
    if (pkMatch) {
      primaryKey = extractColumns(pkMatch[1]) as string[]
      continue
    }

    // UNIQUE KEY `name` (`col1`, `col2`)
    const uniqueMatch = line.match(/^UNIQUE\s+KEY\s+`?([^`(\s,]+)`?\s*\(([^)]+)\)/i)
    if (uniqueMatch) {
      indexes.push({ name: stripBackticks(uniqueMatch[1]), columns: extractColumns(uniqueMatch[2]), unique: true })
      continue
    }

    // KEY `name` (`col1`, `col2`)
    const keyMatch = line.match(/^KEY\s+`?([^`(\s,]+)`?\s*\(([^)]+)\)/i)
    if (keyMatch) {
      indexes.push({ name: stripBackticks(keyMatch[1]), columns: extractColumns(keyMatch[2]), unique: false })
      continue
    }

    // Column definition (not a constraint)
    if (!line.match(/^(CONSTRAINT|PRIMARY|UNIQUE|KEY|FULLTEXT|SPATIAL|ENGINE|DEFAULT\s+CHARSET|\))/i)) {
      const colMatch = line.match(/^`?([a-zA-Z_][a-zA-Z0-9_]*)`?\s+\w/)
      if (colMatch) columns.push(stripBackticks(colMatch[1]))
    }
  }

  return { columns, indexes, primaryKey }
}

export function parseDdlSchema(ddl: string): ParsedSchema {
  const mutableTables: MutableTable[] = []

  // Match CREATE TABLE ... ENGINE=... or closing );
  const tableRe = /CREATE\s+TABLE\s+`?([a-zA-Z_][a-zA-Z0-9_]*)`?\s*\(([\s\S]*?)\)\s*(?:ENGINE\b|;)/gi
  let tableMatch: RegExpExecArray | null

  while ((tableMatch = tableRe.exec(ddl)) !== null) {
    const tableName = stripBackticks(tableMatch[1])
    const body = tableMatch[2]
    const { columns, indexes, primaryKey } = parseTableBody(body)
    mutableTables.push({ name: tableName, columns, indexes, primaryKey })
  }

  // Build index map for external CREATE INDEX
  const tableIndexMap = new Map<string, ParsedIndex[]>()
  for (const tbl of mutableTables) tableIndexMap.set(tbl.name, [...tbl.indexes])

  // Match external CREATE [UNIQUE] INDEX name ON table(cols)
  const indexRe =
    /CREATE\s+(UNIQUE\s+)?INDEX\s+`?([a-zA-Z_][a-zA-Z0-9_]*)`?\s+ON\s+`?([a-zA-Z_][a-zA-Z0-9_]*)`?\s*\(([^)]+)\)/gi
  let indexMatch: RegExpExecArray | null

  while ((indexMatch = indexRe.exec(ddl)) !== null) {
    const unique = Boolean(indexMatch[1])
    const indexName = stripBackticks(indexMatch[2])
    const targetTable = stripBackticks(indexMatch[3])
    const columns = extractColumns(indexMatch[4])
    const existing = tableIndexMap.get(targetTable) ?? []
    tableIndexMap.set(targetTable, [...existing, { name: indexName, columns, unique }])
  }

  return {
    tables: mutableTables.map((t) => ({
      name: t.name,
      columns: t.columns as readonly string[],
      primaryKey: t.primaryKey as readonly string[],
      indexes: (tableIndexMap.get(t.name) ?? t.indexes) as readonly ParsedIndex[],
    })),
  }
}
