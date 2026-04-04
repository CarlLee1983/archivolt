import type { Edge } from '@xyflow/react'
import type { ERModel } from '@/types/er-model'

type ChunkPattern = 'read' | 'write' | 'mixed' | null

const PATTERN_LABEL: Record<string, { text: string; color: string }> = {
  read: { text: 'R', color: '#22c55e' },
  write: { text: 'W', color: '#f59e0b' },
  mixed: { text: 'R/W', color: '#a855f7' },
}

export function buildEdges(
  model: ERModel,
  playbackPattern?: ChunkPattern,
  highlightTables?: Set<string> | null,
): Edge[] {
  const edges: Edge[] = []

  for (const table of Object.values(model.tables)) {
    for (const fk of table.foreignKeys) {
      const bothHighlighted = highlightTables
        ? highlightTables.has(table.name) && highlightTables.has(fk.refTable)
        : false
      const dimmed = highlightTables ? !bothHighlighted : false
      const patternInfo = bothHighlighted && playbackPattern ? PATTERN_LABEL[playbackPattern] : null

      edges.push({
        id: `fk-${table.name}-${fk.name}`,
        source: table.name,
        target: fk.refTable,
        label: patternInfo ? `${fk.columns[0]} [${patternInfo.text}]` : fk.columns[0],
        style: {
          stroke: bothHighlighted && patternInfo ? patternInfo.color : '#22c55e',
          strokeWidth: bothHighlighted ? 3 : dimmed ? 1.5 : 2,
          opacity: dimmed ? 0.15 : 1,
        },
        labelStyle: {
          fill: bothHighlighted && patternInfo ? patternInfo.color : '#22c55e',
          fontSize: 10,
        },
        type: 'default',
      })
    }

    for (const vfk of table.virtualForeignKeys) {
      if (vfk.confidence === 'ignored') continue
      const isManual = vfk.confidence === 'manual'
      const bothHighlighted = highlightTables
        ? highlightTables.has(table.name) && highlightTables.has(vfk.refTable)
        : false
      const dimmed = highlightTables ? !bothHighlighted : false
      const patternInfo = bothHighlighted && playbackPattern ? PATTERN_LABEL[playbackPattern] : null
      const baseColor = isManual ? '#a855f7' : '#f59e0b'

      edges.push({
        id: `vfk-${table.name}-${vfk.id}`,
        source: table.name,
        target: vfk.refTable,
        label: patternInfo
          ? `${vfk.columns[0]} [${patternInfo.text}]`
          : `${vfk.columns[0]}${isManual ? '' : ' ⚡'}`,
        style: {
          stroke: bothHighlighted && patternInfo ? patternInfo.color : baseColor,
          strokeWidth: bothHighlighted ? 3 : dimmed ? 1.5 : 2,
          strokeDasharray: isManual ? 'none' : '6 4',
          opacity: dimmed ? 0.15 : 1,
        },
        labelStyle: {
          fill: bothHighlighted && patternInfo ? patternInfo.color : baseColor,
          fontSize: 10,
        },
        type: 'default',
      })
    }
  }

  return edges
}
