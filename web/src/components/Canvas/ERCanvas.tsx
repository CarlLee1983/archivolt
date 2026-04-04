import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  useReactFlow,
  useStore,
  ReactFlowProvider,
  type Node,
  type Connection,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useSchemaStore, tableMatchesFilter, getNeighborTables } from '@/stores/schemaStore'
import { useRecordingStore, getActiveChunkTables } from '@/stores/recordingStore'
import { TableNode, type TableNodeData } from './TableNode'
import { buildEdges } from './edges'
import { autoLayout } from './layoutEngine'
import { schemaApi } from '@/api/schema'
import { VFKDialog } from './VFKDialog'

const nodeTypes = { tableNode: TableNode }

// Selector for zoom level to implement LOD
const zoomSelector = (state: any) => state.transform[2]

function ERCanvasInner() {
  const { 
    model, visibleGroups, tableFilter, selectTable, refreshModel, selectedTable, focusMode 
  } = useSchemaStore()
  const { setCenter, fitBounds } = useReactFlow()
  const zoom = useStore(zoomSelector)
  const highlightTables = useRecordingStore((s) => getActiveChunkTables(s))
  const activeChunk = useRecordingStore((s) => {
    if (!s.activeChunkId) return null
    return s.chunks.find((c) => c.id === s.activeChunkId) ?? null
  })
  const autoFocus = useRecordingStore((s) => s.autoFocus)

  const keyword = tableFilter.trim().toLowerCase()

  // LOD: Hide columns when zoom < 0.5
  const isLowDetail = zoom < 0.5

  const visibleTables = useMemo(() => {
    if (!model) return []
    
    // If Focus Mode is ON and a table is selected, only show neighbors
    let neighborSet: Set<string> | null = null
    if (focusMode && selectedTable && model) {
      neighborSet = getNeighborTables(selectedTable, model)
    }

    const visible = new Set<string>()
    for (const [groupId, group] of Object.entries(model.groups)) {
      if (visibleGroups.has(groupId)) {
        for (const t of group.tables) {
          if (neighborSet && !neighborSet.has(t)) continue // Filter by focus
          if (tableMatchesFilter(t, keyword, model.tables)) {
            visible.add(t)
          }
        }
      }
    }
    // Ensure we only include tables that actually exist in the model
    return Array.from(visible).filter(t => !!model.tables[t])
  }, [model, visibleGroups, keyword, selectedTable, focusMode])

  const { layoutNodes, layoutEdges } = useMemo(() => {
    if (!model || visibleTables.length === 0) return { layoutNodes: [], layoutEdges: [] }
    const nodes: Node[] = visibleTables.map((name) => ({
      id: name,
      type: 'tableNode',
      position: { x: 0, y: 0 },
      data: {
        table: model.tables[name],
        isLowDetail,
        isHighlighted: highlightTables ? highlightTables.has(name) : null,
        isDimmed: highlightTables ? !highlightTables.has(name) : false,
      } satisfies TableNodeData,
    }))
    const playbackPattern = activeChunk?.pattern ?? null
    const allEdges = buildEdges(model, playbackPattern, highlightTables).filter(
      (e) => visibleTables.includes(e.source) && visibleTables.includes(e.target),
    )
    return { layoutNodes: autoLayout(nodes, allEdges), layoutEdges: allEdges }
  }, [model, visibleTables, isLowDetail, highlightTables, activeChunk?.pattern])

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges)

  useEffect(() => {
    setNodes(layoutNodes)
    setEdges(layoutEdges)
  }, [layoutNodes, layoutEdges, setNodes, setEdges])

  // Smooth teleport to selected table
  useEffect(() => {
    if (selectedTable) {
      const node = nodes.find(n => n.id === selectedTable)
      if (node && node.measured?.width) {
        setCenter(
          node.position.x + node.measured.width / 2, 
          node.position.y + (node.measured.height || 0) / 2, 
          { zoom: Math.max(zoom, 0.8), duration: 800 }
        )
      }
    }
  }, [selectedTable, setCenter, nodes, zoom])

  // Auto-focus: fit bounds to active chunk tables during playback
  useEffect(() => {
    if (!autoFocus || !highlightTables || highlightTables.size === 0) return
    const targetNodes = nodes.filter((n) => highlightTables.has(n.id))
    if (targetNodes.length === 0) return

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const n of targetNodes) {
      const w = n.measured?.width ?? 200
      const h = n.measured?.height ?? 100
      minX = Math.min(minX, n.position.x)
      minY = Math.min(minY, n.position.y)
      maxX = Math.max(maxX, n.position.x + w)
      maxY = Math.max(maxY, n.position.y + h)
    }

    const padding = 80
    fitBounds(
      { x: minX - padding, y: minY - padding, width: maxX - minX + padding * 2, height: maxY - minY + padding * 2 },
      { duration: 600 },
    )
  }, [highlightTables, autoFocus, nodes, fitBounds])

  const [pendingConnection, setPendingConnection] = useState<{ source: string; target: string } | null>(null)

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    selectTable(node.id)
  }, [selectTable])

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return
    setPendingConnection({ source: connection.source, target: connection.target })
  }, [])

  const handleVFKConfirm = useCallback(async (sourceColumn: string, targetColumn: string) => {
    if (!pendingConnection) return
    try {
      await schemaApi.addVirtualFK({
        tableName: pendingConnection.source,
        columns: [sourceColumn],
        refTable: pendingConnection.target,
        refColumns: [targetColumn],
      })
      const updated = await schemaApi.getSchema()
      refreshModel(updated)
    } catch (e) {
      console.error('Failed to add virtual FK:', e)
    } finally {
      setPendingConnection(null)
    }
  }, [pendingConnection, refreshModel])

  const handleVFKCancel = useCallback(() => {
    setPendingConnection(null)
  }, [])

  if (!model) return null

  const pendingSourceTable = pendingConnection ? model.tables[pendingConnection.source] : null
  const pendingTargetTable = pendingConnection ? model.tables[pendingConnection.target] : null

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        className="bg-surface"
        defaultEdgeOptions={{
          type: 'smoothstep',
          style: { stroke: '#444c56', strokeWidth: 1.5 },
        }}
      >
        <Background color="#444c56" gap={32} size={1} variant={BackgroundVariant.Dots} />
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="text-center space-y-4 opacity-40">
              <div className="text-4xl font-black text-text-muted tracking-tighter uppercase">No_Tables_Visible</div>
              <p className="text-xs font-mono text-text-dim max-w-xs mx-auto leading-relaxed">
                Check visibility settings in the sidebar or adjust your filter.
                {focusMode ? ' (Focus Mode is currently ON)' : ''}
              </p>
            </div>
          </div>
        )}
        <MiniMap
          nodeColor="#539bf5"
          maskColor="rgba(13,17,23,0.8)"
          className={selectedTable ? 'minimap-shifted' : ''}
        />
      </ReactFlow>
      {pendingConnection && pendingSourceTable && pendingTargetTable && (
        <VFKDialog
          sourceTable={pendingSourceTable}
          targetTable={pendingTargetTable}
          onConfirm={handleVFKConfirm}
          onCancel={handleVFKCancel}
        />
      )}
    </>
  )
}

export function ERCanvas() {
  return <ERCanvasInner />
}
