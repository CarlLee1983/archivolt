import Dagre from '@dagrejs/dagre'
import type { Node, Edge } from '@xyflow/react'

export function autoLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 120 })

  for (const node of nodes) {
    g.setNode(node.id, { width: 200, height: 150 })
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target)
  }

  Dagre.layout(g)

  return nodes.map((node) => {
    const pos = g.node(node.id)
    return { ...node, position: { x: pos.x - 100, y: pos.y - 75 } }
  })
}
