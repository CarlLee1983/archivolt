import { useCallback, useEffect, useMemo } from 'react'
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

const nodeTypes = { tableNode: TableNode }

// Selector for zoom level to implement LOD
const zoomSelector = (state: any) => state.transform[2]

function ERCanvasInner() {
  const { 
    model, visibleGroups, tableFilter, selectTable, refreshModel, selectedTable, focusMode 
  } = useSchemaStore()
  const { setCenter } = useReactFlow()
  const zoom = useStore(zoomSelector)
  const highlightTables = useRecordingStore((s) => getActiveChunkTables(s))

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
    return Array.from(visible)
  }, [model, visibleGroups, keyword, selectedTable, focusMode])

  const { layoutNodes, layoutEdges } = useMemo(() => {
    if (!model) return { layoutNodes: [], layoutEdges: [] }
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
    const allEdges = buildEdges(model).filter(
      (e) => visibleTables.includes(e.source) && visibleTables.includes(e.target)
    )
    const styledEdges = highlightTables
      ? allEdges.map((edge) => {
          const bothHighlighted = highlightTables.has(edge.source) && highlightTables.has(edge.target)
          return bothHighlighted
            ? { ...edge, style: { ...edge.style, stroke: '#60a5fa', strokeWidth: 3 } }
            : { ...edge, style: { ...edge.style, opacity: 0.15 } }
        })
      : allEdges
    return { layoutNodes: autoLayout(nodes, styledEdges), layoutEdges: styledEdges }
  }, [model, visibleTables, isLowDetail, highlightTables])

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
  }, [selectedTable, setCenter, nodes])

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    selectTable(node.id)
  }, [selectTable])

  const onConnect = useCallback(async (connection: Connection) => {
    if (!model || !connection.source || !connection.target) return
    const sourceTable = model.tables[connection.source]
    if (!sourceTable) return

    const candidate = sourceTable.columns.find((c) =>
      c.name.endsWith('_id') && !sourceTable.foreignKeys.some((fk) => fk.columns.includes(c.name))
    )

    if (!candidate) return

    try {
      await schemaApi.addVirtualFK({
        tableName: connection.source,
        columns: [candidate.name],
        refTable: connection.target,
        refColumns: ['id'],
      })
      const updated = await schemaApi.getSchema()
      refreshModel(updated)
    } catch (e) {
      console.error('Failed to add virtual FK:', e)
    }
  }, [model, refreshModel])

  if (!model) return null

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={onNodeClick}
      onConnect={onConnect}
      nodeTypes={nodeTypes}
      fitView
      className="bg-surface"
      defaultEdgeOptions={{
        type: 'smoothstep',
        style: { stroke: '#334155', strokeWidth: 1.5 },
      }}
    >
      <Background color="#1e293b" gap={24} size={1} variant={BackgroundVariant.Dots} />
      <Controls />
      <MiniMap 
        nodeColor="#3b82f6" 
        maskColor="rgba(2,6,23,0.8)" 
        className={selectedTable ? 'minimap-shifted' : ''} 
      />
    </ReactFlow>
  )
}

export function ERCanvas() {
  return (
    <ReactFlowProvider>
      <ERCanvasInner />
    </ReactFlowProvider>
  )
}
