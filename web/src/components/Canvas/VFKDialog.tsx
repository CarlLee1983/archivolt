import { useState } from 'react'
import type { Table } from '@/types/er-model'

export interface VFKDialogProps {
  sourceTable: Table
  targetTable: Table
  onConfirm: (sourceColumn: string, targetColumn: string) => void
  onCancel: () => void
}

function guessSourceColumn(sourceTable: Table, targetTable: Table): string {
  const existingFkColumns = new Set(
    sourceTable.foreignKeys.flatMap((fk) => fk.columns)
  )

  // Try target_name + _id first
  const targetIdCandidate = `${targetTable.name}_id`
  const hasTargetId = sourceTable.columns.some((c) => c.name === targetIdCandidate)
  if (hasTargetId) return targetIdCandidate

  // Then any *_id not already an FK
  const anyIdColumn = sourceTable.columns.find(
    (c) => c.name.endsWith('_id') && !existingFkColumns.has(c.name)
  )
  if (anyIdColumn) return anyIdColumn.name

  return sourceTable.columns[0]?.name ?? ''
}

function guessTargetColumn(targetTable: Table): string {
  const hasId = targetTable.columns.some((c) => c.name === 'id')
  if (hasId) return 'id'
  return targetTable.primaryKey[0] ?? targetTable.columns[0]?.name ?? ''
}

export function VFKDialog({ sourceTable, targetTable, onConfirm, onCancel }: VFKDialogProps) {
  const [sourceColumn, setSourceColumn] = useState(() => guessSourceColumn(sourceTable, targetTable))
  const [targetColumn, setTargetColumn] = useState(() => guessTargetColumn(targetTable))

  const canConfirm = sourceColumn !== '' && targetColumn !== ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/40">
      <div className="bg-surface border border-white/10 rounded-lg shadow-xl w-96 p-6 flex flex-col gap-5">
        <h2 className="text-text text-lg font-semibold">建立 Virtual Foreign Key</h2>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-muted text-sm">
              來源欄位
              <span className="text-white/40 ml-1">({sourceTable.name})</span>
            </label>
            <select
              value={sourceColumn}
              onChange={(e) => setSourceColumn(e.target.value)}
              className="bg-primary/20 border border-white/10 text-text rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-white/20"
            >
              {sourceTable.columns.map((col) => (
                <option key={col.name} value={col.name}>
                  {col.name}
                  {col.type ? ` (${col.type})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-muted text-sm">
              目標欄位
              <span className="text-white/40 ml-1">({targetTable.name})</span>
            </label>
            <select
              value={targetColumn}
              onChange={(e) => setTargetColumn(e.target.value)}
              className="bg-primary/20 border border-white/10 text-text rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-white/20"
            >
              {targetTable.columns.map((col) => (
                <option key={col.name} value={col.name}>
                  {col.name}
                  {col.type ? ` (${col.type})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-1">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-muted hover:text-text border border-white/10 rounded hover:bg-white/5 transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => onConfirm(sourceColumn, targetColumn)}
            disabled={!canConfirm}
            className="px-4 py-2 text-sm text-white bg-primary/80 hover:bg-primary rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            確認建立
          </button>
        </div>
      </div>
    </div>
  )
}
