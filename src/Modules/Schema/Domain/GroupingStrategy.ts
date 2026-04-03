import type { Table, Group } from './ERModel'
import type { SuggestedRelation } from './RelationInferrer'

const HUB_THRESHOLD = 5
const MAX_GROUP_SIZE = 20

/* ─── Union-Find ─── */

class UnionFind {
  private readonly parent: Map<string, string> = new Map()
  private readonly rank: Map<string, number> = new Map()

  find(x: string): string {
    if (!this.parent.has(x)) {
      this.parent.set(x, x)
      this.rank.set(x, 0)
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
    if (ra === rb) return
    const rankA = this.rank.get(ra) ?? 0
    const rankB = this.rank.get(rb) ?? 0
    if (rankA < rankB) {
      this.parent.set(ra, rb)
    } else if (rankA > rankB) {
      this.parent.set(rb, ra)
    } else {
      this.parent.set(ra, rb)
      this.rank.set(rb, rankB + 1)
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

/* ─── Naming helpers ─── */

function toTitleCase(str: string): string {
  return str
    .split(/[_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function commonPrefix(names: string[]): string {
  if (names.length === 0) return ''
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
  // Fallback: most common first segment
  const segCounts = new Map<string, number>()
  for (const t of tables) {
    const seg = t.split('_')[0]
    segCounts.set(seg, (segCounts.get(seg) ?? 0) + 1)
  }
  const topSeg = [...segCounts.entries()].sort((a, b) => b[1] - a[1])[0]
  if (topSeg && topSeg[1] >= tables.length * 0.4) {
    return toTitleCase(topSeg[0])
  }
  return toTitleCase(tables.reduce((a, b) => (a.length <= b.length ? a : b)))
}

/* ─── Hub detection ─── */

function findHubs(
  tables: Record<string, Table>,
  suggestions: readonly SuggestedRelation[],
): Set<string> {
  const inDegree = new Map<string, number>()

  for (const table of Object.values(tables)) {
    for (const fk of table.foreignKeys) {
      if (fk.refTable in tables) {
        inDegree.set(fk.refTable, (inDegree.get(fk.refTable) ?? 0) + 1)
      }
    }
  }
  for (const s of suggestions) {
    if (s.refTable in tables) {
      inDegree.set(s.refTable, (inDegree.get(s.refTable) ?? 0) + 1)
    }
  }

  const hubs = new Set<string>()
  for (const [name, degree] of inDegree) {
    if (degree >= HUB_THRESHOLD) {
      hubs.add(name)
    }
  }
  return hubs
}

/* ─── Split oversized groups by prefix ─── */

function splitByPrefix(tables: string[]): string[][] {
  // Build prefix buckets (first segment)
  const buckets = new Map<string, string[]>()
  for (const t of tables) {
    const seg = t.split('_')[0]
    if (!buckets.has(seg)) buckets.set(seg, [])
    buckets.get(seg)!.push(t)
  }

  const result: string[][] = []
  const remaining: string[] = []

  for (const members of buckets.values()) {
    if (members.length >= 2) {
      result.push(members)
    } else {
      remaining.push(...members)
    }
  }

  if (remaining.length > 0) {
    result.push(remaining)
  }

  return result
}

/* ─── Assign hubs to their best-fit group ─── */

function assignHubs(
  hubs: Set<string>,
  groups: Map<string, string[]>,
  tables: Record<string, Table>,
  suggestions: readonly SuggestedRelation[],
): void {
  // Build adjacency: hub → set of connected non-hub tables
  const hubEdges = new Map<string, Map<string, number>>()
  for (const hub of hubs) hubEdges.set(hub, new Map())

  for (const table of Object.values(tables)) {
    for (const fk of table.foreignKeys) {
      if (hubs.has(fk.refTable) && !hubs.has(table.name)) {
        const m = hubEdges.get(fk.refTable)!
        m.set(table.name, (m.get(table.name) ?? 0) + 1)
      }
      if (hubs.has(table.name) && !hubs.has(fk.refTable)) {
        const m = hubEdges.get(table.name)!
        m.set(fk.refTable, (m.get(fk.refTable) ?? 0) + 1)
      }
    }
  }
  for (const s of suggestions) {
    if (hubs.has(s.refTable) && !hubs.has(s.sourceTable)) {
      const m = hubEdges.get(s.refTable)!
      m.set(s.sourceTable, (m.get(s.sourceTable) ?? 0) + 1)
    }
    if (hubs.has(s.sourceTable) && !hubs.has(s.refTable)) {
      const m = hubEdges.get(s.sourceTable)!
      m.set(s.refTable, (m.get(s.refTable) ?? 0) + 1)
    }
  }

  // Map: table → which group root it belongs to
  const tableToGroup = new Map<string, string>()
  for (const [root, members] of groups) {
    for (const t of members) tableToGroup.set(t, root)
  }

  // Assign each hub to the group with the most connections
  for (const hub of hubs) {
    const connections = hubEdges.get(hub)!
    const groupScores = new Map<string, number>()
    for (const [neighbor, weight] of connections) {
      const groupRoot = tableToGroup.get(neighbor)
      if (groupRoot) {
        groupScores.set(groupRoot, (groupScores.get(groupRoot) ?? 0) + weight)
      }
    }

    if (groupScores.size === 0) continue

    const bestGroup = [...groupScores.entries()].sort((a, b) => b[1] - a[1])[0][0]
    const members = groups.get(bestGroup)
    if (members) {
      members.push(hub)
      tableToGroup.set(hub, bestGroup)
    }
  }
}

/* ─── Main ─── */

export function computeGroups(
  tables: Record<string, Table>,
  suggestions: readonly SuggestedRelation[],
): Record<string, Group> {
  const tableNames = Object.keys(tables)
  if (tableNames.length === 0) return {}

  const hubs = findHubs(tables, suggestions)
  const nonHubTables = tableNames.filter((t) => !hubs.has(t))

  const uf = new UnionFind()

  // Initialise all non-hub tables
  for (const name of nonHubTables) uf.find(name)

  // 1. Union by explicit FK (skip if either side is hub)
  for (const table of Object.values(tables)) {
    if (hubs.has(table.name)) continue
    for (const fk of table.foreignKeys) {
      if (hubs.has(fk.refTable)) continue
      if (fk.refTable in tables) {
        uf.union(table.name, fk.refTable)
      }
    }
  }

  // 2. Union by suggested relations (skip hubs)
  for (const s of suggestions) {
    if (hubs.has(s.sourceTable) || hubs.has(s.refTable)) continue
    if (s.sourceTable in tables && s.refTable in tables) {
      uf.union(s.sourceTable, s.refTable)
    }
  }

  // 3. Union singletons by common prefix (need ≥2 tables sharing prefix)
  const currentGroups = uf.groups(nonHubTables)
  const singletons = [...currentGroups.entries()]
    .filter(([, members]) => members.length === 1)
    .map(([, members]) => members[0])

  const prefixBuckets = new Map<string, string[]>()
  for (const name of singletons) {
    const parts = name.split('_')
    for (let len = 1; len < parts.length; len++) {
      const prefix = parts.slice(0, len).join('_')
      if (!prefixBuckets.has(prefix)) prefixBuckets.set(prefix, [])
      prefixBuckets.get(prefix)!.push(name)
    }
  }

  for (const members of prefixBuckets.values()) {
    if (members.length >= 2) {
      for (let i = 1; i < members.length; i++) {
        uf.union(members[0], members[i])
      }
    }
  }

  // 4. Assign hubs to their best-fit group
  const groupsBeforeHubs = uf.groups(nonHubTables)
  assignHubs(hubs, groupsBeforeHubs, tables, suggestions)

  // 5. Post-process: split oversized groups
  const finalClusters: string[][] = []
  const assigned = new Set<string>()

  for (const members of groupsBeforeHubs.values()) {
    if (members.length > MAX_GROUP_SIZE) {
      for (const sub of splitByPrefix(members)) {
        finalClusters.push(sub)
      }
    } else {
      finalClusters.push(members)
    }
    for (const t of members) assigned.add(t)
  }

  // Collect unassigned hubs (no connections to any group)
  const unassignedHubs = [...hubs].filter((h) => !assigned.has(h))
  if (unassignedHubs.length > 0) {
    finalClusters.push(unassignedHubs)
  }

  // 6. Build result
  const result: Record<string, Group> = {}
  const uncategorised: string[] = []

  for (const members of finalClusters) {
    if (members.length === 1) {
      uncategorised.push(members[0])
    } else {
      const name = groupName(members)
      // Handle duplicate names by appending count
      const uniqueName = name in result ? `${name} (${Object.keys(result).length})` : name
      result[uniqueName] = {
        name: uniqueName,
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

export function mergeGroupsForReimport(
  tables: Record<string, Table>,
  existingGroups: Record<string, Group>,
  suggestions: readonly SuggestedRelation[],
): Record<string, Group> {
  // 1. Preserve locked groups (auto: false), only keep tables that still exist
  const locked: Record<string, Group> = {}
  const lockedTables = new Set<string>()
  for (const [name, group] of Object.entries(existingGroups)) {
    if (!group.auto) {
      const validTables = group.tables.filter((t) => t in tables)
      if (validTables.length > 0) {
        locked[name] = { ...group, tables: validTables }
        for (const t of validTables) lockedTables.add(t)
      }
    }
  }

  // 2. Compute auto groups for remaining tables
  const remainingTables: Record<string, Table> = {}
  for (const [name, table] of Object.entries(tables)) {
    if (!lockedTables.has(name)) remainingTables[name] = table
  }
  const autoGroups = computeGroups(remainingTables, suggestions)

  // 3. Merge
  return { ...locked, ...autoGroups }
}
