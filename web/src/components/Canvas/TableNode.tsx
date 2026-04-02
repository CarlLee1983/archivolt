import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { Table } from '@/types/er-model'

export interface TableNodeData {
  table: Table
  [key: string]: unknown
}

function TableNodeComponent({ data, selected }: NodeProps) {
  const table = (data as TableNodeData).table
  const fkColumns = new Set([
    ...table.foreignKeys.flatMap((fk) => fk.columns),
    ...table.virtualForeignKeys.flatMap((vfk) => vfk.columns),
  ])

  return (
    <div className={`bg-gray-800 rounded-lg border-2 min-w-[180px] overflow-hidden ${selected ? 'border-purple-500' : 'border-gray-600'}`}>
      <div className="bg-gray-700 px-3 py-2 text-sm font-semibold text-white">{table.name}</div>
      <div className="px-3 py-1.5">
        {table.columns.slice(0, 8).map((col) => (
          <div key={col.name} className="text-xs flex justify-between gap-2 py-0.5">
            <span className={col.primaryKey === 1 ? 'text-red-400' : fkColumns.has(col.name) ? 'text-green-400' : 'text-gray-300'}>
              {col.primaryKey === 1 ? '🔑 ' : ''}{col.name}
            </span>
            <span className="text-gray-500">{col.type.replace(/\(.*\)/, '')}</span>
          </div>
        ))}
        {table.columns.length > 8 && <div className="text-xs text-gray-500 py-0.5">+{table.columns.length - 8} more</div>}
        <div className="text-xs text-gray-600 mt-1 border-t border-gray-700 pt-1">{table.rowCount.toLocaleString()} rows</div>
      </div>
      <Handle type="target" position={Position.Left} className="!bg-green-500 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-blue-500 !w-2 !h-2" />
    </div>
  )
}

export const TableNode = memo(TableNodeComponent)
