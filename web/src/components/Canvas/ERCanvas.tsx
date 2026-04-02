import { useCallback, useEffect, useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Connection,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useSchemaStore } from '@/stores/schemaStore'
import { TableNode, type TableNodeData } from './TableNode'
import { buildEdges } from './edges'
import { autoLayout } from './layoutEngine'
import { schemaApi } from '@/api/schema'

const nodeTypes = { tableNode: TableNode }

export function ERCanvas() {
  const { model, visibleGroups, selectTable, refreshModel } = useSchemaStore()

  const visibleTables = useMemo(() => {
    if (!model) return []
    const visible = new Set<string>()
    for (const [groupId, group] of Object.entries(model.groups)) {
      if (visibleGroups.has(groupId)) {
        for (const t of group.tables) visible.add(t)
      }
    }
    return Array.from(visible)
  }, [model, visibleGroups])

  const { layoutNodes, layoutEdges } = useMemo(() => {
    if (!model) return { layoutNodes: [], layoutEdges: [] }
    const nodes: Node[] = visibleTables.map((name) => ({
      id: name,
      type: 'tableNode',
      position: { x: 0, y: 0 },
      data: { table: model.tables[name] } satisfies TableNodeData,
    }))
    const allEdges = buildEdges(model).filter(
      (e) => visibleTables.includes(e.source) && visibleTables.includes(e.target)
    )
    return { layoutNodes: autoLayout(nodes, allEdges), layoutEdges: allEdges }
  }, [model, visibleTables])

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges)

  useEffect(() => {
    setNodes(layoutNodes)
    setEdges(layoutEdges)
  }, [layoutNodes, layoutEdges, setNodes, setEdges])

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
      className="bg-gray-950"
    >
      <Background color="#333" gap={20} />
      <Controls className="!bg-gray-800 !border-gray-700 !text-white" />
      <MiniMap className="!bg-gray-900" nodeColor="#4b5563" />
    </ReactFlow>
  )
}
