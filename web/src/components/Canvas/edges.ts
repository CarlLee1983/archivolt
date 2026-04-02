import type { Edge } from '@xyflow/react'
import type { ERModel } from '@/types/er-model'

export function buildEdges(model: ERModel): Edge[] {
  const edges: Edge[] = []

  for (const table of Object.values(model.tables)) {
    for (const fk of table.foreignKeys) {
      edges.push({
        id: `fk-${table.name}-${fk.name}`,
        source: table.name,
        target: fk.refTable,
        label: fk.columns[0],
        style: { stroke: '#22c55e', strokeWidth: 2 },
        labelStyle: { fill: '#22c55e', fontSize: 10 },
        type: 'default',
      })
    }

    for (const vfk of table.virtualForeignKeys) {
      const isManual = vfk.confidence === 'manual'
      edges.push({
        id: `vfk-${table.name}-${vfk.id}`,
        source: table.name,
        target: vfk.refTable,
        label: `${vfk.columns[0]}${isManual ? '' : ' ⚡'}`,
        style: {
          stroke: isManual ? '#a855f7' : '#f59e0b',
          strokeWidth: 2,
          strokeDasharray: isManual ? 'none' : '6 4',
        },
        labelStyle: { fill: isManual ? '#a855f7' : '#f59e0b', fontSize: 10 },
        type: 'default',
      })
    }
  }

  return edges
}
