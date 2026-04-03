import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { Table } from '@/types/er-model'

export interface TableNodeData {
  table: Table
  isLowDetail?: boolean
  isHighlighted?: boolean | null
  isDimmed?: boolean
  [key: string]: unknown
}

function KeyIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline shrink-0 drop-shadow-[0_0_8px_rgba(248,113,113,0.3)]">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  )
}

function TableNodeComponent({ data, selected }: NodeProps) {
  const { table, isLowDetail, isHighlighted, isDimmed } = data as TableNodeData
  const fkColumns = new Set([
    ...table.foreignKeys.flatMap((fk) => fk.columns),
    ...table.virtualForeignKeys.flatMap((vfk) => vfk.columns),
  ])

  return (
    <div
      className={`rounded-xl border transition-all duration-300 ${
        selected
          ? 'border-primary ring-4 ring-primary/30 scale-[1.05] z-50 shadow-[0_0_40px_rgba(59,130,246,0.5)]'
          : isLowDetail
            ? 'border-white/40 bg-[#1e293b] shadow-2xl scale-[0.95]' // Solid high-contrast block when zoomed out
            : 'border-white/10 backdrop-blur-md bg-white/5 hover:border-white/30 shadow-glass'
      } ${isLowDetail ? 'min-w-[180px]' : 'min-w-[240px]'} ${isDimmed ? 'opacity-15' : ''} ${isHighlighted === true ? 'ring-2 ring-primary/60 shadow-[0_0_20px_rgba(59,130,246,0.3)]' : ''}`}
    >
      {/* Visual Indicator for LOD mode */}
      {isLowDetail && (
        <div className="h-2 w-full bg-primary rounded-t-xl" />
      )}

      {/* Header */}
      <div className={`px-4 py-2.5 border-b flex items-center justify-between transition-all ${
        selected
          ? 'bg-primary/30 border-primary/20 text-white'
          : isLowDetail
            ? 'bg-[#0f172a] border-white/10'
            : 'bg-white/5 border-white/5 text-text-dim'
      }`}>
        <span className={`font-mono truncate ${isLowDetail ? 'text-[13px] font-black text-white' : 'text-xs font-bold'}`}>
          {table.name}
        </span>
        {!isLowDetail && (
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
          </div>
        )}
      </div>

      {/* Columns - Hidden in Low Detail */}
      {!isLowDetail && (
        <div className="px-3 py-2 bg-black/20 animate-in fade-in duration-300">
          {table.columns.slice(0, 10).map((col) => (
            <div key={col.name} className="text-[10px] font-mono flex items-center justify-between gap-4 py-1 group/col">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-[10px] flex shrink-0 items-center justify-center">
                  {col.primaryKey === 1 && <span className="text-red-400"><KeyIcon /></span>}
                </div>
                <span className={`truncate transition-colors ${
                  col.primaryKey === 1
                    ? 'text-red-400 font-semibold'
                    : fkColumns.has(col.name)
                      ? 'text-emerald-400'
                      : 'text-text-dim group-hover/col:text-text'
                }`}>
                  {col.name}
                </span>
              </div>
              <span className="text-muted/50 text-[9px] font-medium uppercase tracking-wider">{col.type.replace(/\(.*\)/, '')}</span>
            </div>
          ))}
          {table.columns.length > 10 && (
            <div className="text-[9px] text-muted/40 font-bold py-1 text-center italic">
              + {table.columns.length - 10} more columns
            </div>
          )}
        </div>
      )}
      
      {/* Footer */}
      <div className={`px-3 py-1.5 border-t flex items-center justify-between text-[9px] font-mono uppercase tracking-widest transition-all ${
        isLowDetail ? 'bg-[#0f172a] text-white/60 border-white/5' : 'bg-white/[0.02] border-white/5 text-muted/50'
      }`}>
        <span>{table.engine}</span>
        {!isLowDetail && <span className="tabular-nums">{table.rowCount.toLocaleString()} rows</span>}
      </div>

      <Handle 
        type="target" 
        position={Position.Left} 
        className={`!w-2.5 !h-2.5 !border-0 !shadow-[0_0_10px_rgba(16,185,129,0.6)] transition-all ${
          isLowDetail ? '!bg-emerald-400 scale-125' : '!bg-emerald-500'
        }`}
      />
      <Handle 
        type="source" 
        position={Position.Right} 
        className={`!w-2.5 !h-2.5 !border-0 !shadow-[0_0_10px_rgba(59,130,246,0.6)] transition-all ${
          isLowDetail ? '!bg-blue-400 scale-125' : '!bg-primary'
        }`}
      />
    </div>
  )
}

export const TableNode = memo(TableNodeComponent)
