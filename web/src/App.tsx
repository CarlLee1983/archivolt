import { useEffect } from 'react'
import { useSchemaStore } from '@/stores/schemaStore'
import { ERCanvas } from '@/components/Canvas/ERCanvas'

export default function App() {
  const { model, loading, error, fetchSchema, visibleGroups, toggleGroup, selectedTable } = useSchemaStore()

  useEffect(() => {
    fetchSchema()
  }, [fetchSchema])

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-red-400">
        <p>Error: {error}</p>
      </div>
    )
  }

  if (loading || !model) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-400">
        <p>Loading schema...</p>
      </div>
    )
  }

  const selected = selectedTable ? model.tables[selectedTable] : null

  return (
    <div className="flex h-screen bg-gray-950 text-white">
      {/* Left: Group Panel */}
      <div className="w-60 bg-gray-900 border-r border-gray-800 p-4 overflow-y-auto">
        <h2 className="text-sm font-bold text-red-400 mb-3">Groups</h2>
        {Object.entries(model.groups).map(([id, group]) => (
          <button
            key={id}
            onClick={() => toggleGroup(id)}
            className={`w-full text-left bg-gray-800 rounded-lg p-3 mb-2 transition ${
              visibleGroups.has(id) ? 'border border-blue-500' : 'border border-transparent opacity-60'
            }`}
          >
            <div className="text-sm font-semibold">{group.name}</div>
            <div className="text-xs text-gray-500 mt-1">{group.tables.length} tables</div>
          </button>
        ))}
      </div>

      {/* Center: ReactFlow Canvas */}
      <div className="flex-1">
        <ERCanvas />
      </div>

      {/* Right: Detail Panel */}
      <div className="w-64 bg-gray-900 border-l border-gray-800 p-4 overflow-y-auto">
        <h2 className="text-sm font-bold text-red-400 mb-3">Details</h2>
        {selected ? (
          <div>
            <h3 className="text-sm font-semibold mb-2">{selected.name}</h3>
            <p className="text-xs text-gray-500 mb-3">{selected.engine} | {selected.rowCount.toLocaleString()} rows</p>
            <div className="text-xs space-y-1">
              {selected.columns.map((col) => (
                <div key={col.name} className="flex justify-between">
                  <span className={col.primaryKey === 1 ? 'text-red-400' : 'text-gray-300'}>{col.name}</span>
                  <span className="text-gray-500">{col.type}</span>
                </div>
              ))}
            </div>
            {selected.foreignKeys.length > 0 && (
              <div className="mt-3">
                <div className="text-xs font-semibold text-green-400 mb-1">FK ({selected.foreignKeys.length})</div>
                {selected.foreignKeys.map((fk) => (
                  <div key={fk.name} className="text-xs text-gray-300">→ {fk.refTable}.{fk.refColumns[0]}</div>
                ))}
              </div>
            )}
            {selected.virtualForeignKeys.length > 0 && (
              <div className="mt-3">
                <div className="text-xs font-semibold text-amber-400 mb-1">Virtual FK ({selected.virtualForeignKeys.length})</div>
                {selected.virtualForeignKeys.map((vfk) => (
                  <div key={vfk.id} className="text-xs text-gray-300">
                    → {vfk.refTable}.{vfk.refColumns[0]} ({vfk.confidence})
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-500">Select a table to see details</p>
        )}
      </div>
    </div>
  )
}
