import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { Table } from '@/types/er-model'

export interface TableNodeData {
  table: Table
  [key: string]: unknown
}

function KeyIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline shrink-0">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  )
}

function TableNodeComponent({ data, selected }: NodeProps) {
  const table = (data as TableNodeData).table
  const fkColumns = new Set([
    ...table.foreignKeys.flatMap((fk) => fk.columns),
    ...table.virtualForeignKeys.flatMap((vfk) => vfk.columns),
  ])

  return (
    <div
      className={`rounded-lg border min-w-[200px] overflow-hidden shadow-lg shadow-black/20 transition-colors duration-150 ${
        selected
          ? 'border-primary bg-[#162036] ring-1 ring-primary/30'
          : 'border-border bg-panel hover:border-border/80'
      }`}
    >
      {/* Header */}
      <div className={`px-3 py-2 text-xs font-semibold font-mono border-b ${
        selected
          ? 'bg-primary/10 border-primary/20 text-text'
          : 'bg-card border-border-subtle text-text-dim'
      }`}>
        {table.name}
      </div>

      {/* Columns */}
      <div className="px-3 py-1.5">
        {table.columns.slice(0, 8).map((col) => (
          <div key={col.name} className="text-[11px] font-mono flex items-center justify-between gap-3 py-[3px]">
            <span className={`flex items-center gap-1 ${
              col.primaryKey === 1
                ? 'text-red-400'
                : fkColumns.has(col.name)
                  ? 'text-emerald-400'
                  : 'text-text-dim'
            }`}>
              {col.primaryKey === 1 && <KeyIcon />}
              {col.name}
            </span>
            <span className="text-muted text-[10px]">{col.type.replace(/\(.*\)/, '')}</span>
          </div>
        ))}
        {table.columns.length > 8 && (
          <div className="text-[10px] text-muted py-0.5">+{table.columns.length - 8} more</div>
        )}
        <div className="text-[10px] text-muted mt-1 border-t border-border-subtle pt-1 tabular-nums">
          {table.rowCount.toLocaleString()} rows
        </div>
      </div>

      <Handle type="target" position={Position.Left} className="!bg-emerald-500 !w-2 !h-2 !border-0" />
      <Handle type="source" position={Position.Right} className="!bg-primary !w-2 !h-2 !border-0" />
    </div>
  )
}

export const TableNode = memo(TableNodeComponent)
