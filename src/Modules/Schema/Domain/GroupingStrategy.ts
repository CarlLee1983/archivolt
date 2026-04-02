import type { Table, Group } from './ERModel'
import type { SuggestedRelation } from './RelationInferrer'

class UnionFind {
  private readonly parent: Map<string, string> = new Map()

  find(x: string): string {
    if (!this.parent.has(x)) {
      this.parent.set(x, x)
    }
    const p = this.parent.get(x)!
    if (p === x) return x
    const root = this.find(p)
    this.parent.set(x, root)
    return root
  }

  union(a: string, b: string): void {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) {
      this.parent.set(ra, rb)
    }
  }

  groups(items: string[]): Map<string, string[]> {
    const result = new Map<string, string[]>()
    for (const item of items) {
      const root = this.find(item)
      if (!result.has(root)) result.set(root, [])
      result.get(root)!.push(item)
    }
    return result
  }
}

function toTitleCase(str: string): string {
  return str
    .split(/[_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function commonPrefix(names: string[]): string {
  if (names.length === 0) return ''
  // Work segment-by-segment on underscore-split tokens
  const segmented = names.map((n) => n.split('_'))
  const minLen = Math.min(...segmented.map((s) => s.length))
  let sharedSegments = 0
  for (let i = 0; i < minLen; i++) {
    const seg = segmented[0][i]
    if (segmented.every((s) => s[i] === seg)) {
      sharedSegments = i + 1
    } else {
      break
    }
  }
  if (sharedSegments === 0) return ''
  return segmented[0].slice(0, sharedSegments).join('_')
}

function groupName(tables: string[]): string {
  if (tables.length === 1) return tables[0]
  const prefix = commonPrefix(tables)
  if (prefix.length >= 3) return toTitleCase(prefix)
  // Fall back to largest table name
  return tables.reduce((a, b) => (a.length >= b.length ? a : b))
}

export function computeGroups(
  tables: Record<string, Table>,
  suggestions: readonly SuggestedRelation[],
): Record<string, Group> {
  const tableNames = Object.keys(tables)
  if (tableNames.length === 0) return {}

  const uf = new UnionFind()

  // Initialise all tables
  for (const name of tableNames) uf.find(name)

  // 1. Union by explicit FK
  for (const table of Object.values(tables)) {
    for (const fk of table.foreignKeys) {
      if (fk.refTable in tables) {
        uf.union(table.name, fk.refTable)
      }
    }
  }

  // 2. Union by suggested relations
  for (const s of suggestions) {
    if (s.sourceTable in tables && s.refTable in tables) {
      uf.union(s.sourceTable, s.refTable)
    }
  }

  // 3. Union singletons by common prefix (need ≥2 tables sharing prefix)
  const currentGroups = uf.groups(tableNames)
  const singletons = [...currentGroups.entries()]
    .filter(([, members]) => members.length === 1)
    .map(([, members]) => members[0])

  // Build prefix buckets for singletons
  const prefixBuckets = new Map<string, string[]>()
  for (const name of singletons) {
    const parts = name.split('_')
    // Try prefixes of increasing length (at least 1 segment)
    for (let len = 1; len < parts.length; len++) {
      const prefix = parts.slice(0, len).join('_')
      if (!prefixBuckets.has(prefix)) prefixBuckets.set(prefix, [])
      prefixBuckets.get(prefix)!.push(name)
    }
  }

  // Union singletons that share a prefix bucket of ≥2
  for (const members of prefixBuckets.values()) {
    if (members.length >= 2) {
      for (let i = 1; i < members.length; i++) {
        uf.union(members[0], members[i])
      }
    }
  }

  // Build final groups
  const finalGroups = uf.groups(tableNames)
  const result: Record<string, Group> = {}
  const uncategorised: string[] = []

  for (const [, members] of finalGroups) {
    if (members.length === 1) {
      uncategorised.push(members[0])
    } else {
      const name = groupName(members)
      result[name] = {
        name,
        tables: [...members].sort(),
        auto: true,
      }
    }
  }

  if (uncategorised.length > 0) {
    result['未分類'] = {
      name: '未分類',
      tables: uncategorised.sort(),
      auto: true,
    }
  }

  return result
}
