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
  
  if (!table) {
    return (
      <div className="terminal-window p-4 border-red-500 bg-red-500/10 text-red-500 font-mono text-xs">
        [ERROR] Table Data Missing
      </div>
    )
  }

  const fkColumns = new Set([
    ...table.foreignKeys.flatMap((fk) => fk.columns),
    ...table.virtualForeignKeys.flatMap((vfk) => vfk.columns),
  ])

  return (
    <div
      className={`terminal-window transition-all duration-500 flex flex-col ${
        selected
          ? 'border-primary ring-4 ring-primary/20 scale-[1.04] z-50 shadow-2xl bg-panel'
          : isLowDetail
            ? 'border-border bg-panel shadow-lg scale-[0.95]' 
            : 'border-border/60 hover:border-primary/50'
      } ${isLowDetail ? 'min-w-[180px]' : 'min-w-[280px]'} ${isDimmed ? 'opacity-20 grayscale' : ''}`}
    >
      {/* Header - 終端機風格 */}
      <div className={`px-4 py-2 border-b flex items-center justify-between transition-all ${
        selected ? 'bg-primary/10 border-primary/20' : 'bg-panel/50 border-border'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${selected ? 'bg-primary animate-pulse' : 'bg-slate-700'}`} />
          <span className={`font-mono truncate tracking-tight ${isLowDetail ? 'text-[13px] font-black text-text-bright' : 'text-xs font-bold text-text-bright'}`}>
            {table.name}
          </span>
        </div>
        {!isLowDetail && (
          <span className="text-[9px] font-mono text-text-muted uppercase tracking-widest">{table.engine}</span>
        )}
      </div>

      {/* Columns Area */}
      {!isLowDetail && (
        <div className="p-1 bg-card/30">
          <div className="space-y-0.5">
            {table.columns.slice(0, 12).map((col) => (
              <div key={col.name} className="text-[11px] font-mono flex items-center justify-between gap-4 py-1.5 px-3 rounded hover:bg-primary/5 transition-all group/col">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-[12px] flex shrink-0 items-center justify-center">
                    {col.primaryKey === 1 && <span className="text-warning"><KeyIcon /></span>}
                  </div>
                  <span className={`truncate ${
                    col.primaryKey === 1
                      ? 'text-warning font-bold'
                      : fkColumns.has(col.name)
                        ? 'text-primary font-bold'
                        : 'text-text group-hover/col:text-text-bright'
                  }`}>
                    {col.name}
                  </span>
                </div>
                <span className="text-text-muted text-[9px] font-bold uppercase tracking-tighter opacity-40 group-hover/col:opacity-80">{col.type.replace(/\(.*\)/, '')}</span>
              </div>
            ))}
            {table.columns.length > 12 && (
              <div className="text-[10px] text-text-muted py-2 text-center italic border-t border-border/30 mt-1">
                + {table.columns.length - 12} fields hidden
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Footer Stats */}
      {!isLowDetail && (
        <div className="px-4 py-2 border-t border-border/30 flex items-center justify-between text-[10px] font-mono bg-panel/20">
          <span className="text-text-dim uppercase tracking-widest font-bold">Tele_Rows</span>
          <span className="text-text-bright font-black">{table.rowCount.toLocaleString()}</span>
        </div>
      )}

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
