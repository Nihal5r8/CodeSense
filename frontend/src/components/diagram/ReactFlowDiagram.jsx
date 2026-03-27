import { useEffect, useCallback, useState } from 'react'
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  useNodesState, useEdgesState, useReactFlow,
  MarkerType, Position, Handle, Panel,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

/* ─── DESIGN TOKENS ────────────────────────────────────────────────── */
const T = {
  start:     { border: '#00ff87', bg: '#001a0d', text: '#00ff87', badge: 'START'     },
  end:       { border: '#ff4d6d', bg: '#1a0009', text: '#ff4d6d', badge: 'END'       },
  process:   { border: '#00b4d8', bg: '#00111a', text: '#caf0f8', badge: null        },
  decision:  { border: '#ffd60a', bg: '#1a1500', text: '#ffd60a', badge: '◆ IF'      },
  io:        { border: '#c77dff', bg: '#0d0017', text: '#e0aaff', badge: '⬡ I/O'    },
  recursive: { border: '#ff6d00', bg: '#1a0a00', text: '#ffba08', badge: '↻ RECURSE' },
}

function getT(type) { return T[type] || T.process }

/* ─── SHARED GLOW STYLE ────────────────────────────────────────────── */
function glowStyle(type, selected) {
  const t = getT(type)
  return {
    border: `1.5px solid ${selected ? t.border : t.border + '99'}`,
    boxShadow: selected
      ? `0 0 0 1px ${t.border}44, 0 0 16px ${t.border}55, inset 0 0 12px ${t.border}11`
      : `0 0 8px ${t.border}22, inset 0 0 6px ${t.border}08`,
    transition: 'all 0.18s ease',
  }
}

/* ─── PROCESS / IO / RECURSIVE NODE ───────────────────────────────── */
function StdNode({ data, selected }) {
  const t = getT(data.ntype)
  return (
    <div style={{
      background: t.bg, borderRadius: 8,
      padding: '10px 14px', minWidth: 150, maxWidth: 210,
      cursor: 'pointer', ...glowStyle(data.ntype, selected),
    }}>
      <Handle type="target" position={Position.Top}
        style={{ background: t.border, width: 8, height: 8, border: 'none' }} />
      {t.badge && (
        <div style={{ fontSize: 9, color: t.border, letterSpacing: '1.2px',
                      marginBottom: 4, fontFamily: 'monospace', opacity: 0.85 }}>
          {t.badge}
        </div>
      )}
      <div style={{ color: t.text, fontWeight: 600, fontSize: 12.5,
                    lineHeight: 1.35, wordBreak: 'break-word' }}>
        {data.label}
      </div>
      {data.sublabel && (
        <div style={{
          marginTop: 5, padding: '3px 7px',
          background: t.border + '14', borderRadius: 4,
          fontFamily: 'monospace', fontSize: 10.5,
          color: t.border, wordBreak: 'break-all',
        }}>
          {data.sublabel}
        </div>
      )}
      <Handle type="source" position={Position.Bottom}
        style={{ background: t.border, width: 8, height: 8, border: 'none' }} />
    </div>
  )
}

/* ─── DECISION NODE ────────────────────────────────────────────────── */
function DecisionNode({ data, selected }) {
  const t = T.decision
  return (
    <div style={{
      background: t.bg, borderRadius: 8,
      padding: '10px 14px', minWidth: 150, maxWidth: 210,
      cursor: 'pointer', ...glowStyle('decision', selected),
    }}>
      <Handle type="target" position={Position.Top}
        style={{ background: t.border, width: 8, height: 8, border: 'none' }} />
      <div style={{ fontSize: 9, color: t.border, letterSpacing: '1.2px',
                    marginBottom: 4, fontFamily: 'monospace' }}>
        {t.badge}
      </div>
      <div style={{ color: t.text, fontWeight: 700, fontSize: 12.5, lineHeight: 1.35 }}>
        {data.label}
      </div>
      {data.sublabel && (
        <div style={{
          marginTop: 5, padding: '3px 7px',
          background: '#ffd60a14', borderRadius: 4,
          fontFamily: 'monospace', fontSize: 10.5, color: '#ffd60a99',
        }}>
          {data.sublabel}
        </div>
      )}
      <Handle id="true"  type="source" position={Position.Bottom}
        style={{ background: '#00ff87', width: 8, height: 8, left: '28%', border: 'none' }} />
      <Handle id="false" type="source" position={Position.Bottom}
        style={{ background: '#ff4d6d', width: 8, height: 8, left: '72%', border: 'none' }} />
    </div>
  )
}

/* ─── START / END NODE ─────────────────────────────────────────────── */
function TerminalNode({ data }) {
  const t = getT(data.ntype)
  const isStart = data.ntype === 'start'
  return (
    <div style={{
      background: t.bg, border: `2px solid ${t.border}`,
      borderRadius: 40, padding: '9px 28px', minWidth: 100,
      textAlign: 'center', boxShadow: `0 0 24px ${t.border}55`, cursor: 'default',
    }}>
      {!isStart && (
        <Handle type="target" position={Position.Top}
          style={{ background: t.border, width: 8, height: 8, border: 'none' }} />
      )}
      <div style={{ color: t.text, fontWeight: 800, fontSize: 11,
                    letterSpacing: '1.5px', textTransform: 'uppercase' }}>
        {data.label || (isStart ? 'START' : 'END')}
      </div>
      {isStart && (
        <Handle type="source" position={Position.Bottom}
          style={{ background: t.border, width: 8, height: 8, border: 'none' }} />
      )}
    </div>
  )
}

const nodeTypes = {
  process:   StdNode,
  io:        StdNode,
  recursive: StdNode,
  decision:  DecisionNode,
  start:     TerminalNode,
  end:       TerminalNode,
}

/* ─── EDGE COLORS ──────────────────────────────────────────────────── */
function edgeColor(label) {
  const l = (label || '').toLowerCase()
  if (l === 'true')  return '#00ff87'
  if (l === 'false') return '#ff4d6d'
  if (l.includes('loop') || l.includes('repeat') || l.includes('next')) return '#ffd60a'
  return '#2d6a8a'
}

/* ─── AUTO LAYOUT ──────────────────────────────────────────────────── */
function autoLayout(rawNodes, rawEdges) {
  const W = 220, H = 110  // tightened vertical spacing

  const inDeg = {}, children = {}
  rawNodes.forEach(n => { inDeg[n.id] = 0; children[n.id] = [] })
  rawEdges.forEach(e => {
    inDeg[e.target] = (inDeg[e.target] || 0) + 1
    if (children[e.source]) children[e.source].push(e.target)
  })

  const levels = {}
  const queue  = rawNodes.filter(n => !inDeg[n.id]).map(n => n.id)
  queue.forEach(id => { levels[id] = 0 })
  let qi = 0
  while (qi < queue.length) {
    const cur = queue[qi++]
    ;(children[cur] || []).forEach(child => {
      levels[child] = Math.max(levels[child] ?? 0, (levels[cur] ?? 0) + 1)
      if (!queue.includes(child)) queue.push(child)
    })
  }

  const byLevel = {}
  rawNodes.forEach(n => {
    const lv = levels[n.id] ?? 0
    if (!byLevel[lv]) byLevel[lv] = []
    byLevel[lv].push(n.id)
  })

  const positions = {}
  Object.entries(byLevel).forEach(([lv, ids]) => {
    const total = ids.length * W + (ids.length - 1) * 60
    ids.forEach((id, i) => {
      positions[id] = {
        x: -total / 2 + i * (W + 60),
        y: parseInt(lv) * H,
      }
    })
  })
  return positions
}

/* ─── JSON REPAIR ──────────────────────────────────────────────────── */
function repairJSON(str) {
  if (!str) return null
  const s = str.indexOf('{'), e = str.lastIndexOf('}')
  if (s === -1 || e === -1) return null
  let raw = str.slice(s, e + 1)
  raw = raw.replace(/,(\s*[}\]])/g, '$1')
  try { return JSON.parse(raw) } catch { return null }
}

/* ─── LEGEND ───────────────────────────────────────────────────────── */
const LEGEND = [
  { key: 'start',     label: 'Start / End'    },
  { key: 'process',   label: 'Process'        },
  { key: 'decision',  label: 'Decision'       },
  { key: 'io',        label: 'Input / Output' },
  { key: 'recursive', label: 'Recursive Call' },
]

/* ─── INNER COMPONENT (needs ReactFlowProvider context) ────────────── */
function ReactFlowDiagramInner({ visualization, title, language }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [diagramTitle, setDiagramTitle]  = useState('')
  const [selectedNode, setSelectedNode]  = useState(null)
  const [nodeCount, setNodeCount]        = useState(0)
  const [warn, setWarn]                  = useState('')
  const { fitView } = useReactFlow()

  useEffect(() => {
    if (!visualization) return
    setWarn('')
    setSelectedNode(null)

    let data = repairJSON(visualization)
    if (!data || !Array.isArray(data.nodes) || !data.nodes.length) {
      setWarn('Simplified diagram')
      data = {
        title: title || 'Algorithm Flow',
        nodes: [
          { id:'1', label:'Start',   type:'start',   sublabel:'', description:'' },
          { id:'2', label:'Process', type:'process', sublabel:'', description:'Main logic' },
          { id:'3', label:'End',     type:'end',     sublabel:'', description:'' },
        ],
        edges: [{ from:'1', to:'2', label:'' }, { from:'2', to:'3', label:'' }],
      }
    }

    setDiagramTitle(data.title || title || '')
    setNodeCount(data.nodes.length)

    const rawNodes = data.nodes.map(n => ({
      id:   String(n.id),
      type: n.type || 'process',
      data: { label: n.label||'', sublabel: n.sublabel||'',
              description: n.description||'', ntype: n.type||'process' },
      position: { x:0, y:0 },
    }))

    const rawEdges = data.edges.map((e, i) => {
      const lbl   = e.label || ''
      const color = edgeColor(lbl)
      const lLow  = lbl.toLowerCase()
      return {
        id:     `e${i}`,
        source: String(e.from),
        target: String(e.to),
        sourceHandle: lLow === 'true' ? 'true' : lLow === 'false' ? 'false' : null,
        label:  lbl,
        labelStyle:   { fill: color, fontSize: 10, fontWeight: 700 },
        labelBgStyle: { fill: '#0a0f14', fillOpacity: 0.9, rx: 4 },
        style:        { stroke: color, strokeWidth: 1.8 },
        animated:     lLow === 'true' || lLow.includes('loop') || lLow.includes('repeat'),
        markerEnd:    { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
        type:         'default',
      }
    })

    const positions = autoLayout(rawNodes, rawEdges)
    rawNodes.forEach(n => { n.position = positions[n.id] || { x:0, y:0 } })

    setNodes(rawNodes)
    setEdges(rawEdges)
  }, [visualization, title])

  // Fix 6: auto-fit after nodes are laid out
  useEffect(() => {
    if (nodes.length > 0) {
      setTimeout(() => {
        fitView({ padding: 0.12, duration: 400, maxZoom: 1.2 })
      }, 100)
    }
  }, [nodes, fitView])

  const onNodeClick = useCallback((_, node) => {
    setSelectedNode(p => p?.id === node.id ? null : node)
  }, [])

  if (!visualization) return null

  return (
    <div style={{
      width: '100%', height: 580,
      background: '#040810', borderRadius: 12, overflow: 'hidden',
      position: 'relative', border: '1px solid #0d2030',
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    }}>
      {/* ── HEADER BAR ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        padding: '9px 14px',
        background: 'linear-gradient(180deg,#040810 60%,#04081000)',
        display: 'flex', alignItems: 'center', gap: 10, pointerEvents: 'none',
      }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%',
                      background: '#00ff87', boxShadow: '0 0 8px #00ff8799' }} />
        <span style={{ color: '#c0d8e8', fontWeight: 700, fontSize: 12.5, letterSpacing: '.3px' }}>
          {diagramTitle || 'Algorithm Flow'}
        </span>
        {language && (
          <span style={{
            fontSize: 9, padding: '2px 8px',
            background: '#00b4d822', color: '#00b4d8',
            border: '1px solid #00b4d844',
            borderRadius: 4, letterSpacing: '1px', textTransform: 'uppercase',
          }}>
            {language}
          </span>
        )}
        {nodeCount > 0 && (
          <span style={{ fontSize: 9, color: '#4a6a80', marginLeft: 4 }}>
            {nodeCount} nodes
          </span>
        )}
        {warn && (
          <span style={{ fontSize: 9, color: '#ffd60a', marginLeft: 'auto', opacity: 0.75 }}>
            ⚠ {warn}
          </span>
        )}
      </div>

      {/* ── REACT FLOW CANVAS ── */}
      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.12, maxZoom: 1.2 }}
        minZoom={0.2}
        maxZoom={3}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant="dots" color="#0d2030" gap={22} size={1} />
        <Controls style={{
          background: '#061018', border: '1px solid #0d2030', borderRadius: 8, bottom: 80,
        }} />
        <MiniMap
          style={{
            background: '#040810',
            border: '1px solid #0d2030',
            borderRadius: 6,
            width: 100,
            height: 70,
          }}
          nodeColor={n => getT(n.data?.ntype)?.border || '#2d6a8a'}
          maskColor="#04081099"
          position="bottom-right"
        />

        {/* ── LEGEND ── */}
        <Panel position="bottom-left">
          <div style={{
            background: '#040810cc', border: '1px solid #0d2030',
            borderRadius: 8, padding: '7px 11px',
            display: 'flex', gap: 12, flexWrap: 'wrap',
            backdropFilter: 'blur(10px)',
          }}>
            {LEGEND.map(l => (
              <div key={l.key} style={{ display:'flex', alignItems:'center', gap: 5 }}>
                <div style={{
                  width: 9, height: 9,
                  borderRadius: l.key === 'start' || l.key === 'end' ? '50%' : 2,
                  background: getT(l.key).border + '22',
                  border: `1.5px solid ${getT(l.key).border}`,
                }} />
                <span style={{ fontSize: 9.5, color: '#4a6a80', whiteSpace: 'nowrap' }}>
                  {l.label}
                </span>
              </div>
            ))}
            <div style={{ display:'flex', alignItems:'center', gap: 5 }}>
              <div style={{ width: 18, height: 1.5, background: '#00ff87' }} />
              <span style={{ fontSize: 9.5, color: '#4a6a80' }}>True</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap: 5 }}>
              <div style={{ width: 18, height: 1.5, background: '#ff4d6d' }} />
              <span style={{ fontSize: 9.5, color: '#4a6a80' }}>False</span>
            </div>
          </div>
        </Panel>
      </ReactFlow>

      {/* ── NODE DETAIL TOOLTIP ── */}
      {selectedNode?.data?.description && (
        <div style={{
          position: 'absolute', bottom: 16, right: 16, zIndex: 20,
          background: '#061018',
          border: `1px solid ${getT(selectedNode.data.ntype).border}55`,
          borderRadius: 10, padding: '12px 15px', maxWidth: 250,
          boxShadow: `0 8px 32px #00000099`,
          animation: 'fadeIn .15s ease',
        }}>
          <div style={{ fontSize: 9, color: '#4a6a80', textTransform: 'uppercase',
                        letterSpacing: '1px', marginBottom: 5 }}>
            Node Detail
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 700,
                        color: getT(selectedNode.data.ntype).text, marginBottom: 5 }}>
            {selectedNode.data.label}
          </div>
          {selectedNode.data.sublabel && (
            <div style={{
              fontFamily: 'monospace', fontSize: 10.5,
              color: getT(selectedNode.data.ntype).border,
              background: getT(selectedNode.data.ntype).border + '14',
              padding: '3px 8px', borderRadius: 4, marginBottom: 6,
              wordBreak: 'break-all',
            }}>
              {selectedNode.data.sublabel}
            </div>
          )}
          <div style={{ fontSize: 11.5, color: '#7a9ab0', lineHeight: 1.55 }}>
            {selectedNode.data.description}
          </div>
          <div style={{ fontSize: 9, color: '#2d4a5a', marginTop: 7 }}>
            Click node to dismiss
          </div>
        </div>
      )}

      {/* ── KEYFRAMES ── */}
      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(4px) }
                            to   { opacity:1; transform:translateY(0) } }
        .react-flow__controls-button { background: #061018 !important;
          border-color: #0d2030 !important; color: #4a8aaa !important; }
        .react-flow__controls-button:hover { background: #0d2030 !important; }
        .react-flow__edge-path { filter: drop-shadow(0 0 2px currentColor); }
      `}</style>
    </div>
  )
}

/* ─── PUBLIC EXPORT — wraps with ReactFlowProvider ─────────────────── */
export default function ReactFlowDiagram(props) {
  return (
    <ReactFlowProvider>
      <ReactFlowDiagramInner {...props} />
    </ReactFlowProvider>
  )
}
