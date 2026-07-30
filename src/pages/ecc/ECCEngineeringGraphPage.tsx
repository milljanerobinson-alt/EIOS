import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Network, Search, Filter, Plus, Trash2, RefreshCw,
  ZoomIn, ZoomOut, Maximize2, X, ChevronRight, ChevronDown,
  AlertTriangle, ArrowRight, BarChart2, Layers, Link2,
  Edit3, Save, Info, Tag, Clock, CheckCircle, Loader2,
} from 'lucide-react';
import {
  loadGraphData, loadEntities, createEntity, updateEntity, deleteEntity,
  createRelationship, deleteRelationship,
  loadImpactAnalyses, createImpactAnalysis,
  computeGraphStats, computeInitialLayout,
  getEntityWithRelationships,
  ENTITY_TYPE_LABELS, ENTITY_TYPE_COLORS, RELATIONSHIP_LABELS, ENTITY_TYPE_TIER,
  type EigEntity, type EigRelationship, type ImpactAnalysis,
  type GraphData, type EntityWithRelationships, type GraphStats, type NodePosition,
  type EntityType, type RelationshipType, type EntityStatus,
} from '../../lib/eigService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function typeLabel(t: string) {
  return ENTITY_TYPE_LABELS[t] ?? t;
}

function typeColors(t: string) {
  return ENTITY_TYPE_COLORS[t] ?? { bg: 'bg-slate-100', text: 'text-slate-700', dot: 'bg-slate-400', node: '#64748b' };
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-700',
    planned: 'bg-blue-100 text-blue-700',
    deprecated: 'bg-amber-100 text-amber-700',
    archived: 'bg-slate-100 text-slate-500',
  };
  return map[status] ?? 'bg-slate-100 text-slate-600';
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'graph' | 'entities' | 'impact';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview',  label: 'Overview',        icon: <BarChart2 size={15} /> },
  { id: 'graph',     label: 'Graph Explorer',  icon: <Network size={15} /> },
  { id: 'entities',  label: 'Entity Browser',  icon: <Layers size={15} /> },
  { id: 'impact',    label: 'Impact Analysis', icon: <AlertTriangle size={15} /> },
];

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ stats, entities, relationships }: { stats: GraphStats; entities: EigEntity[]; relationships: EigRelationship[] }) {
  const tierOrder = [0, 1, 2, 3, 4, 5];
  const tierLabels: Record<number, string> = {
    0: 'Mission Layer',
    1: 'Release Layer',
    2: 'Work Layer',
    3: 'Platform Layer',
    4: 'Component Layer',
    5: 'Risk & Debt Layer',
  };

  const entitiesByTier: Record<number, number> = {};
  for (const e of entities) {
    const t = ENTITY_TYPE_TIER[e.entity_type] ?? 5;
    entitiesByTier[t] = (entitiesByTier[t] ?? 0) + 1;
  }

  const relTypeCount: Record<string, number> = {};
  for (const r of relationships) {
    relTypeCount[r.relationship_type] = (relTypeCount[r.relationship_type] ?? 0) + 1;
  }
  const topRelTypes = Object.entries(relTypeCount).sort((a, b) => b[1] - a[1]).slice(0, 6);

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Entities', value: stats.totalEntities, color: 'text-blue-600' },
          { label: 'Relationships', value: stats.totalRelationships, color: 'text-emerald-600' },
          { label: 'Entity Types', value: Object.keys(stats.byType).length, color: 'text-violet-600' },
          { label: 'Avg Connections', value: stats.totalEntities > 0 ? ((stats.totalRelationships * 2) / stats.totalEntities).toFixed(1) : '0', color: 'text-amber-600' },
        ].map(k => (
          <div key={k.label} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">{k.label}</p>
            <p className={`text-3xl font-bold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Entity type breakdown */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800 text-sm">Entity Breakdown</h3>
          </div>
          <div className="p-4 space-y-2 max-h-72 overflow-y-auto">
            {Object.entries(stats.byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => {
              const c = typeColors(type);
              const pct = stats.totalEntities > 0 ? (count / stats.totalEntities) * 100 : 0;
              return (
                <div key={type} className="flex items-center gap-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${c.bg} ${c.text} min-w-[140px]`}>
                    {typeLabel(type)}
                  </span>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${c.dot}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-slate-600 w-6 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Architecture tiers */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800 text-sm">Architecture Tiers</h3>
          </div>
          <div className="p-4 space-y-3">
            {tierOrder.map(tier => {
              const count = entitiesByTier[tier] ?? 0;
              if (count === 0) return null;
              return (
                <div key={tier} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">{tier}</div>
                  <span className="text-sm text-slate-600 flex-1">{tierLabels[tier]}</span>
                  <span className="text-sm font-semibold text-slate-800">{count} nodes</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Most connected */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800 text-sm">Most Connected Nodes</h3>
          </div>
          <div className="divide-y divide-slate-50">
            {stats.mostConnected.filter(x => x.connectionCount > 0).slice(0, 8).map(({ entity, connectionCount }) => {
              const c = typeColors(entity.entity_type);
              return (
                <div key={entity.id} className="px-5 py-3 flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.dot}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{entity.name}</p>
                    <p className="text-xs text-slate-500">{typeLabel(entity.entity_type)}</p>
                  </div>
                  <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">{connectionCount}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top relationship types */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800 text-sm">Top Relationship Types</h3>
          </div>
          <div className="p-4 space-y-2">
            {topRelTypes.map(([type, count]) => {
              const pct = stats.totalRelationships > 0 ? (count / stats.totalRelationships) * 100 : 0;
              return (
                <div key={type} className="flex items-center gap-3">
                  <span className="text-xs text-slate-600 min-w-[140px]">{RELATIONSHIP_LABELS[type] ?? type}</span>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-slate-600 w-6 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Graph Explorer Tab ────────────────────────────────────────────────────────

const NODE_W = 140;
const NODE_H = 44;

interface GraphNode {
  entity: EigEntity;
  x: number;
  y: number;
}

function GraphExplorerTab({ graphData }: { graphData: GraphData }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [positions, setPositions] = useState<Record<string, NodePosition>>({});
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 0.72 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [filterType, setFilterType] = useState('');
  const [selectedDetail, setSelectedDetail] = useState<EntityWithRelationships | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Pan state
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const transformStart = useRef({ x: 0, y: 0 });

  // Drag state
  const isDragging = useRef(false);
  const dragId = useRef<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  const { entities, relationships } = graphData;

  useEffect(() => {
    setPositions(computeInitialLayout(entities));
  }, [entities]);

  const visibleIds = new Set(
    entities
      .filter(e => {
        if (filterType && e.entity_type !== filterType) return false;
        if (searchQ && !e.name.toLowerCase().includes(searchQ.toLowerCase())) return false;
        return true;
      })
      .map(e => e.id)
  );

  const visibleEntities = entities.filter(e => visibleIds.has(e.id));
  const visibleRels = relationships.filter(r => visibleIds.has(r.from_entity_id) && visibleIds.has(r.to_entity_id));

  // SVG coordinate helpers
  function svgPt(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: (clientX - rect.left - transform.x) / transform.scale,
      y: (clientY - rect.top  - transform.y) / transform.scale,
    };
  }

  function onSvgMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    const target = e.target as SVGElement;
    const nodeEl = target.closest('[data-nodeid]') as SVGElement | null;
    if (nodeEl) {
      const id = nodeEl.getAttribute('data-nodeid')!;
      isDragging.current = true;
      dragId.current = id;
      const pt = svgPt(e.clientX, e.clientY);
      const pos = positions[id] ?? { x: 0, y: 0 };
      dragOffset.current = { x: pt.x - pos.x, y: pt.y - pos.y };
      e.stopPropagation();
      return;
    }
    isPanning.current = true;
    panStart.current = { x: e.clientX, y: e.clientY };
    transformStart.current = { x: transform.x, y: transform.y };
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (isDragging.current && dragId.current) {
        const pt = svgPt(e.clientX, e.clientY);
        setPositions(prev => ({ ...prev, [dragId.current!]: { x: pt.x - dragOffset.current.x, y: pt.y - dragOffset.current.y } }));
      } else if (isPanning.current) {
        const dx = e.clientX - panStart.current.x;
        const dy = e.clientY - panStart.current.y;
        setTransform(t => ({ ...t, x: transformStart.current.x + dx, y: transformStart.current.y + dy }));
      }
    }
    function onMouseUp() {
      isDragging.current = false;
      dragId.current = null;
      isPanning.current = false;
    }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  });

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setTransform(t => {
      const newScale = Math.max(0.1, Math.min(3, t.scale * factor));
      return {
        scale: newScale,
        x: mx - (mx - t.x) * (newScale / t.scale),
        y: my - (my - t.y) * (newScale / t.scale),
      };
    });
  }

  function fitAll() {
    if (visibleEntities.length === 0) return;
    const xs = visibleEntities.map(e => positions[e.id]?.x ?? 0);
    const ys = visibleEntities.map(e => positions[e.id]?.y ?? 0);
    const minX = Math.min(...xs) - 40;
    const minY = Math.min(...ys) - 40;
    const maxX = Math.max(...xs) + NODE_W + 40;
    const maxY = Math.max(...ys) + NODE_H + 40;
    const svg = svgRef.current;
    if (!svg) return;
    const vw = svg.clientWidth, vh = svg.clientHeight;
    const s = Math.min(vw / (maxX - minX), vh / (maxY - minY), 1.4);
    setTransform({ scale: s, x: -minX * s + (vw - (maxX - minX) * s) / 2, y: -minY * s + (vh - (maxY - minY) * s) / 2 });
  }

  async function onNodeClick(id: string) {
    if (selectedId === id) { setSelectedId(null); setSelectedDetail(null); return; }
    setSelectedId(id);
    setLoadingDetail(true);
    const detail = await getEntityWithRelationships(id);
    setSelectedDetail(detail);
    setLoadingDetail(false);
  }

  const entityTypes = [...new Set(entities.map(e => e.entity_type))].sort();

  // Build edge paths with arrow markers
  function edgePath(r: EigRelationship): string {
    const from = positions[r.from_entity_id];
    const to   = positions[r.to_entity_id];
    if (!from || !to) return '';
    const fx = from.x + NODE_W / 2;
    const fy = from.y + NODE_H / 2;
    const tx = to.x   + NODE_W / 2;
    const ty = to.y   + NODE_H / 2;
    const mx = (fx + tx) / 2;
    const my = (fy + ty) / 2;
    return `M${fx},${fy} Q${mx},${my - 30} ${tx},${ty}`;
  }

  const selectedEntity = selectedId ? entities.find(e => e.id === selectedId) : null;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Toolbar + canvas */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-200 bg-white flex-shrink-0">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="Search nodes..."
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">All types</option>
            {entityTypes.map(t => <option key={t} value={t}>{typeLabel(t)}</option>)}
          </select>
          <div className="flex items-center gap-1 ml-auto">
            <button onClick={() => setTransform(t => ({ ...t, scale: Math.min(3, t.scale * 1.2) }))} className="p-1.5 rounded hover:bg-slate-100 text-slate-600" title="Zoom in"><ZoomIn size={15} /></button>
            <button onClick={() => setTransform(t => ({ ...t, scale: Math.max(0.1, t.scale * 0.8) }))} className="p-1.5 rounded hover:bg-slate-100 text-slate-600" title="Zoom out"><ZoomOut size={15} /></button>
            <button onClick={fitAll} className="p-1.5 rounded hover:bg-slate-100 text-slate-600" title="Fit all"><Maximize2 size={15} /></button>
          </div>
          <span className="text-xs text-slate-400">{visibleEntities.length} nodes · {visibleRels.length} edges</span>
        </div>

        {/* SVG canvas */}
        <div className="flex-1 relative overflow-hidden bg-slate-50">
          <svg
            ref={svgRef}
            className="w-full h-full select-none"
            style={{ cursor: isPanning.current ? 'grabbing' : 'grab' }}
            onMouseDown={onSvgMouseDown}
            onWheel={onWheel}
          >
            <defs>
              <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#94a3b8" />
              </marker>
              <marker id="arrowhead-selected" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#3b82f6" />
              </marker>
            </defs>
            <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
              {/* Tier labels */}
              {[0,1,2,3,4,5].map(tier => {
                const tierNames = ['Mission Layer','Release Layer','Work Layer','Platform Layer','Component Layer','Risk & Debt'];
                const yPos = [80,210,340,470,600,730][tier];
                return (
                  <text key={tier} x={20} y={yPos - 10} fontSize="10" fill="#cbd5e1" fontWeight="600" letterSpacing="0.05em" textAnchor="start">
                    {tierNames[tier].toUpperCase()}
                  </text>
                );
              })}

              {/* Edges */}
              {visibleRels.map(r => {
                const isHighlighted = selectedId && (r.from_entity_id === selectedId || r.to_entity_id === selectedId);
                const d = edgePath(r);
                if (!d) return null;
                return (
                  <path
                    key={r.id}
                    d={d}
                    fill="none"
                    stroke={isHighlighted ? '#3b82f6' : '#cbd5e1'}
                    strokeWidth={isHighlighted ? 1.5 : 0.8}
                    strokeDasharray={isHighlighted ? undefined : '4 3'}
                    markerEnd={isHighlighted ? 'url(#arrowhead-selected)' : 'url(#arrowhead)'}
                    opacity={selectedId && !isHighlighted ? 0.25 : 0.8}
                  />
                );
              })}

              {/* Nodes */}
              {visibleEntities.map(entity => {
                const pos = positions[entity.id];
                if (!pos) return null;
                const c = typeColors(entity.entity_type);
                const isSelected = entity.id === selectedId;
                const isHovered  = entity.id === hoveredId;
                const isConnected = selectedId && relationships.some(
                  r => (r.from_entity_id === selectedId && r.to_entity_id === entity.id) ||
                       (r.to_entity_id === selectedId   && r.from_entity_id === entity.id)
                );
                const dimmed = selectedId && !isSelected && !isConnected;
                return (
                  <g
                    key={entity.id}
                    data-nodeid={entity.id}
                    transform={`translate(${pos.x},${pos.y})`}
                    style={{ cursor: 'pointer', opacity: dimmed ? 0.3 : 1 }}
                    onClick={(e) => { e.stopPropagation(); onNodeClick(entity.id); }}
                    onMouseEnter={() => setHoveredId(entity.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <rect
                      width={NODE_W} height={NODE_H} rx={6}
                      fill="white"
                      stroke={isSelected ? '#3b82f6' : isHovered ? '#94a3b8' : '#e2e8f0'}
                      strokeWidth={isSelected ? 2 : 1}
                      filter={isSelected || isHovered ? 'drop-shadow(0 2px 6px rgba(0,0,0,0.12))' : undefined}
                    />
                    <rect width={4} height={NODE_H} rx="2" fill={c.node} />
                    <text x={12} y={16} fontSize="9" fill="#94a3b8" fontWeight="600" letterSpacing="0.04em">
                      {typeLabel(entity.entity_type).toUpperCase().slice(0, 14)}
                    </text>
                    <text x={12} y={30} fontSize="11" fill="#1e293b" fontWeight="500">
                      {entity.name.length > 14 ? entity.name.slice(0, 14) + '…' : entity.name}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
          {/* Click-off to deselect */}
          {selectedId && (
            <button
              className="absolute top-3 right-3 text-xs text-slate-500 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-sm hover:bg-slate-50"
              onClick={() => { setSelectedId(null); setSelectedDetail(null); }}
            >
              <X size={11} className="inline mr-1" />Deselect
            </button>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selectedEntity && (
        <div className="w-72 border-l border-slate-200 bg-white flex flex-col flex-shrink-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{typeLabel(selectedEntity.entity_type)}</p>
              <p className="text-sm font-semibold text-slate-800 leading-tight mt-0.5">{selectedEntity.name}</p>
            </div>
            <button onClick={() => { setSelectedId(null); setSelectedDetail(null); }} className="text-slate-400 hover:text-slate-600 flex-shrink-0 mt-0.5"><X size={14} /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
            {selectedEntity.entity_ref && (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">Reference</p>
                <p className="font-mono text-xs bg-slate-50 rounded px-2 py-1 text-slate-700">{selectedEntity.entity_ref}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">Status</p>
              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusBadge(selectedEntity.status)}`}>{selectedEntity.status}</span>
            </div>
            {selectedEntity.description && (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">Description</p>
                <p className="text-xs text-slate-600 leading-relaxed">{selectedEntity.description}</p>
              </div>
            )}
            {selectedEntity.tags?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">Tags</p>
                <div className="flex flex-wrap gap-1">
                  {selectedEntity.tags.map(tag => (
                    <span key={tag} className="px-1.5 py-0.5 rounded text-xs bg-slate-100 text-slate-600">{tag}</span>
                  ))}
                </div>
              </div>
            )}

            {loadingDetail && (
              <div className="flex items-center gap-2 text-slate-400 text-xs py-2">
                <Loader2 size={13} className="animate-spin" />Loading relationships...
              </div>
            )}

            {selectedDetail && !loadingDetail && (
              <>
                {selectedDetail.outgoing.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-2">Outgoing ({selectedDetail.outgoing.length})</p>
                    <div className="space-y-1.5">
                      {selectedDetail.outgoing.map(({ rel, target }) => (
                        <div key={rel.id} className="flex items-start gap-2">
                          <ArrowRight size={11} className="text-blue-400 flex-shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="text-xs text-slate-500">{RELATIONSHIP_LABELS[rel.relationship_type] ?? rel.relationship_type}</p>
                            <p className="text-xs font-medium text-slate-700 truncate">{target.name}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {selectedDetail.incoming.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-2">Incoming ({selectedDetail.incoming.length})</p>
                    <div className="space-y-1.5">
                      {selectedDetail.incoming.map(({ rel, source }) => (
                        <div key={rel.id} className="flex items-start gap-2">
                          <ArrowRight size={11} className="text-emerald-400 flex-shrink-0 mt-0.5 rotate-180" />
                          <div className="min-w-0">
                            <p className="text-xs text-slate-500">{RELATIONSHIP_LABELS[rel.relationship_type] ?? rel.relationship_type}</p>
                            <p className="text-xs font-medium text-slate-700 truncate">{source.name}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Entity Browser Tab ───────────────────────────────────────────────────────

function EntityBrowserTab() {
  const [entities, setEntities] = useState<EigEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selected, setSelected] = useState<EntityWithRelationships | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newEntity, setNewEntity] = useState({ name: '', entity_type: 'component' as string, entity_ref: '', description: '', status: 'active' as string });

  async function loadList() {
    setLoading(true);
    const data = await loadEntities({ entityType: filterType || undefined, status: filterStatus || undefined, search: searchQ || undefined });
    setEntities(data);
    setLoading(false);
  }

  useEffect(() => { loadList(); }, [filterType, filterStatus, searchQ]);

  async function selectEntity(id: string) {
    if (selected?.entity.id === id) { setSelected(null); return; }
    setLoadingDetail(true);
    const d = await getEntityWithRelationships(id);
    setSelected(d);
    setLoadingDetail(false);
  }

  async function handleCreate() {
    if (!newEntity.name.trim()) return;
    setCreating(true);
    await createEntity({ ...newEntity, entity_ref: newEntity.entity_ref || undefined, description: newEntity.description || undefined });
    setCreating(false);
    setShowCreate(false);
    setNewEntity({ name: '', entity_type: 'component', entity_ref: '', description: '', status: 'active' });
    loadList();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this entity? This will also remove its relationships.')) return;
    await deleteEntity(id);
    if (selected?.entity.id === id) setSelected(null);
    loadList();
  }

  const entityTypes = Object.keys(ENTITY_TYPE_LABELS).sort();
  const statusOptions: EntityStatus[] = ['active', 'planned', 'deprecated', 'archived'];

  return (
    <div className="flex h-full overflow-hidden">
      {/* List panel */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-slate-200">
        {/* Filters */}
        <div className="px-4 py-3 border-b border-slate-200 bg-white flex items-center gap-2 flex-wrap flex-shrink-0">
          <div className="relative flex-1 min-w-[160px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="Search entities..."
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All types</option>
            {entityTypes.map(t => <option key={t} value={t}>{typeLabel(t)}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All statuses</option>
            {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={() => setShowCreate(true)} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors">
            <Plus size={14} />New Entity
          </button>
        </div>

        {/* Create form */}
        {showCreate && (
          <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 flex-shrink-0">
            <p className="text-xs font-semibold text-blue-800 mb-2">New Entity</p>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input value={newEntity.name} onChange={e => setNewEntity(p => ({ ...p, name: e.target.value }))} placeholder="Name *" className="px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input value={newEntity.entity_ref} onChange={e => setNewEntity(p => ({ ...p, entity_ref: e.target.value }))} placeholder="Reference (e.g. EWO-017)" className="px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <select value={newEntity.entity_type} onChange={e => setNewEntity(p => ({ ...p, entity_type: e.target.value }))} className="px-2 py-1.5 text-sm border border-slate-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {entityTypes.map(t => <option key={t} value={t}>{typeLabel(t)}</option>)}
              </select>
              <select value={newEntity.status} onChange={e => setNewEntity(p => ({ ...p, status: e.target.value }))} className="px-2 py-1.5 text-sm border border-slate-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <input value={newEntity.description} onChange={e => setNewEntity(p => ({ ...p, description: e.target.value }))} placeholder="Description (optional)" className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2" />
            <div className="flex gap-2">
              <button onClick={handleCreate} disabled={creating || !newEntity.name.trim()} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {creating ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}Save
              </button>
              <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded hover:bg-slate-50">Cancel</button>
            </div>
          </div>
        )}

        {/* Entity list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400"><Loader2 size={20} className="animate-spin mr-2" />Loading...</div>
          ) : entities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Network size={32} className="mb-3 opacity-40" />
              <p className="text-sm">No entities found</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {entities.map(entity => {
                const c = typeColors(entity.entity_type);
                const isSelected = selected?.entity.id === entity.id;
                return (
                  <div
                    key={entity.id}
                    onClick={() => selectEntity(entity.id)}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-slate-50 ${isSelected ? 'bg-blue-50 hover:bg-blue-50' : ''}`}
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-800 truncate">{entity.name}</p>
                        {entity.entity_ref && <span className="text-xs text-slate-400 font-mono flex-shrink-0">{entity.entity_ref}</span>}
                      </div>
                      <p className="text-xs text-slate-500">{typeLabel(entity.entity_type)}</p>
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${statusBadge(entity.status)}`}>{entity.status}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(entity.id); }}
                      className="text-slate-300 hover:text-red-500 flex-shrink-0 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 flex-shrink-0">
          <p className="text-xs text-slate-400">{entities.length} entities</p>
        </div>
      </div>

      {/* Detail panel */}
      {(selected || loadingDetail) && (
        <div className="w-80 flex flex-col flex-shrink-0 overflow-hidden bg-white">
          {loadingDetail ? (
            <div className="flex-1 flex items-center justify-center text-slate-400"><Loader2 size={18} className="animate-spin mr-2" />Loading...</div>
          ) : selected ? (
            <>
              <div className="px-4 py-3 border-b border-slate-200 flex items-start justify-between">
                <div className="min-w-0">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${typeColors(selected.entity.entity_type).bg} ${typeColors(selected.entity.entity_type).text}`}>
                    {typeLabel(selected.entity.entity_type)}
                  </span>
                  <p className="text-sm font-semibold text-slate-800 mt-1 leading-tight">{selected.entity.name}</p>
                </div>
                <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 ml-2 flex-shrink-0"><X size={14} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
                {selected.entity.entity_ref && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1">Reference</p>
                    <p className="font-mono text-xs bg-slate-50 rounded px-2 py-1">{selected.entity.entity_ref}</p>
                  </div>
                )}
                <div className="flex gap-4">
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1">Status</p>
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusBadge(selected.entity.status)}`}>{selected.entity.status}</span>
                  </div>
                  {selected.entity.version && (
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-1">Version</p>
                      <p className="text-xs text-slate-700">{selected.entity.version}</p>
                    </div>
                  )}
                </div>
                {selected.entity.description && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1">Description</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{selected.entity.description}</p>
                  </div>
                )}
                {selected.entity.tags?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1">Tags</p>
                    <div className="flex flex-wrap gap-1">
                      {selected.entity.tags.map(t => <span key={t} className="px-1.5 py-0.5 rounded text-xs bg-slate-100 text-slate-600">{t}</span>)}
                    </div>
                  </div>
                )}
                {selected.outgoing.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-2">Depends On / References ({selected.outgoing.length})</p>
                    <div className="space-y-2">
                      {selected.outgoing.map(({ rel, target }) => (
                        <div key={rel.id} className="flex items-start gap-2 p-2 bg-slate-50 rounded">
                          <ArrowRight size={11} className="text-blue-400 mt-0.5 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs text-slate-500">{RELATIONSHIP_LABELS[rel.relationship_type] ?? rel.relationship_type}</p>
                            <p className="text-xs font-medium text-slate-700 truncate">{target.name}</p>
                            <p className="text-xs text-slate-400">{typeLabel(target.entity_type)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {selected.incoming.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-2">Referenced By ({selected.incoming.length})</p>
                    <div className="space-y-2">
                      {selected.incoming.map(({ rel, source }) => (
                        <div key={rel.id} className="flex items-start gap-2 p-2 bg-emerald-50 rounded">
                          <ArrowRight size={11} className="text-emerald-400 mt-0.5 flex-shrink-0 rotate-180" />
                          <div className="min-w-0">
                            <p className="text-xs text-slate-500">{RELATIONSHIP_LABELS[rel.relationship_type] ?? rel.relationship_type}</p>
                            <p className="text-xs font-medium text-slate-700 truncate">{source.name}</p>
                            <p className="text-xs text-slate-400">{typeLabel(source.entity_type)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ─── Impact Analysis Tab ───────────────────────────────────────────────────────

function ImpactAnalysisTab({ entities }: { entities: EigEntity[] }) {
  const [analyses, setAnalyses] = useState<ImpactAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ImpactAnalysis | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ trigger_entity_id: '', trigger_ref: '', trigger_type: 'ewo' });

  async function loadList() {
    setLoading(true);
    const data = await loadImpactAnalyses();
    setAnalyses(data);
    setLoading(false);
  }

  useEffect(() => { loadList(); }, []);

  async function handleCreate() {
    setCreating(true);
    const entity = entities.find(e => e.id === form.trigger_entity_id);
    const input: Partial<ImpactAnalysis> = {
      trigger_entity_id: form.trigger_entity_id || null,
      trigger_ref: form.trigger_ref || (entity?.entity_ref ?? null),
      trigger_type: form.trigger_type,
      analysis_status: 'pending',
      affected_systems: [],
      affected_components: [],
      dependency_changes: [],
      risks: [],
      implementation_order: [],
      testing_requirements: [],
      supporting_evidence: [],
    };
    const result = await createImpactAnalysis(input);
    if (result) { setAnalyses(prev => [result, ...prev]); setSelected(result); }
    setCreating(false);
    setShowCreate(false);
    setForm({ trigger_entity_id: '', trigger_ref: '', trigger_type: 'ewo' });
  }

  function statusIcon(status: string) {
    if (status === 'complete')   return <CheckCircle size={14} className="text-emerald-500" />;
    if (status === 'generating') return <Loader2 size={14} className="text-blue-500 animate-spin" />;
    if (status === 'failed')     return <AlertTriangle size={14} className="text-red-500" />;
    return <Clock size={14} className="text-slate-400" />;
  }

  function statusLabel(s: string) {
    return { pending: 'Pending', generating: 'Generating', complete: 'Complete', failed: 'Failed' }[s] ?? s;
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* List */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-slate-200">
        <div className="px-4 py-3 border-b border-slate-200 bg-white flex items-center gap-2 flex-shrink-0">
          <p className="text-sm font-semibold text-slate-700">Impact Analyses</p>
          <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{analyses.length}</span>
          <button onClick={() => setShowCreate(true)} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors">
            <Plus size={14} />New Analysis
          </button>
        </div>

        {showCreate && (
          <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 flex-shrink-0">
            <p className="text-xs font-semibold text-amber-800 mb-2">New Impact Analysis</p>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <select
                value={form.trigger_entity_id}
                onChange={e => setForm(p => ({ ...p, trigger_entity_id: e.target.value }))}
                className="px-2 py-1.5 text-sm border border-slate-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 col-span-2"
              >
                <option value="">Select trigger entity (optional)</option>
                {entities.filter(e => ['ewo','release','specification','engineering_review'].includes(e.entity_type)).map(e => (
                  <option key={e.id} value={e.id}>{e.name} {e.entity_ref ? `(${e.entity_ref})` : ''}</option>
                ))}
              </select>
              <input value={form.trigger_ref} onChange={e => setForm(p => ({ ...p, trigger_ref: e.target.value }))} placeholder="Trigger ref (e.g. EWO-017)" className="px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <select value={form.trigger_type} onChange={e => setForm(p => ({ ...p, trigger_type: e.target.value }))} className="px-2 py-1.5 text-sm border border-slate-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="ewo">EWO</option>
                <option value="release">Release</option>
                <option value="specification">Specification</option>
                <option value="engineering_review">Engineering Review</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={handleCreate} disabled={creating} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}Create
              </button>
              <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded hover:bg-slate-50">Cancel</button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400"><Loader2 size={20} className="animate-spin mr-2" />Loading...</div>
          ) : analyses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <AlertTriangle size={32} className="mb-3 opacity-40" />
              <p className="text-sm">No impact analyses yet</p>
              <p className="text-xs mt-1">Create one to trace change impacts across the graph</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {analyses.map(a => (
                <div
                  key={a.id}
                  onClick={() => setSelected(selected?.id === a.id ? null : a)}
                  className={`px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors ${selected?.id === a.id ? 'bg-blue-50' : ''}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {statusIcon(a.analysis_status)}
                    <span className="text-xs font-semibold text-slate-700">{a.trigger_ref ?? a.trigger_type}</span>
                    <span className="text-xs text-slate-400 capitalize">{a.trigger_type}</span>
                    <span className="ml-auto text-xs text-slate-400">{new Date(a.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="flex gap-4 text-xs text-slate-500 pl-5">
                    <span>{a.affected_systems.length} systems</span>
                    <span>{a.affected_components.length} components</span>
                    <span>{a.risks.length} risks</span>
                    {a.complexity_score != null && <span className="font-medium text-amber-600">Complexity {a.complexity_score}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Analysis detail */}
      {selected && (
        <div className="w-96 flex flex-col flex-shrink-0 overflow-hidden bg-white">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              {statusIcon(selected.analysis_status)}
              <p className="text-sm font-semibold text-slate-800">{selected.trigger_ref ?? selected.trigger_type}</p>
              <span className="text-xs text-slate-500 capitalize">{statusLabel(selected.analysis_status)}</span>
            </div>
            <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
            {selected.summary && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Summary</p>
                <p className="text-sm text-slate-700 leading-relaxed">{selected.summary}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {selected.complexity_score != null && (
                <div className="bg-amber-50 rounded-lg p-3">
                  <p className="text-xs text-amber-700 font-medium">Complexity</p>
                  <p className="text-2xl font-bold text-amber-600">{selected.complexity_score}</p>
                </div>
              )}
              {selected.effort_estimate && (
                <div className="bg-blue-50 rounded-lg p-3">
                  <p className="text-xs text-blue-700 font-medium">Effort</p>
                  <p className="text-sm font-bold text-blue-600">{selected.effort_estimate}</p>
                </div>
              )}
            </div>

            {selected.affected_systems.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Affected Systems ({selected.affected_systems.length})</p>
                <div className="flex flex-wrap gap-1">
                  {selected.affected_systems.map((s, i) => <span key={i} className="px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-700">{s}</span>)}
                </div>
              </div>
            )}
            {selected.affected_components.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Affected Components ({selected.affected_components.length})</p>
                <div className="flex flex-wrap gap-1">
                  {selected.affected_components.map((s, i) => <span key={i} className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700">{s}</span>)}
                </div>
              </div>
            )}
            {selected.risks.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">Identified Risks</p>
                <div className="space-y-1">
                  {selected.risks.map((r, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-red-700 bg-red-50 rounded px-2 py-1.5">
                      <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />{r}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {selected.implementation_order.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Implementation Order</p>
                <ol className="space-y-1">
                  {selected.implementation_order.map((step, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                      <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold flex-shrink-0 text-[10px]">{i+1}</span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {selected.testing_requirements.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Testing Requirements</p>
                <div className="space-y-1">
                  {selected.testing_requirements.map((r, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-emerald-700 bg-emerald-50 rounded px-2 py-1.5">
                      <CheckCircle size={11} className="flex-shrink-0 mt-0.5" />{r}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {selected.release_implications && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Release Implications</p>
                <p className="text-xs text-slate-600 leading-relaxed">{selected.release_implications}</p>
              </div>
            )}
            {selected.governance_implications && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Governance Implications</p>
                <p className="text-xs text-slate-600 leading-relaxed">{selected.governance_implications}</p>
              </div>
            )}
            {selected.confidence_score != null && (
              <div className="flex items-center gap-2 text-xs text-slate-500 border-t border-slate-100 pt-3">
                <Info size={12} />Confidence score: <span className="font-semibold text-slate-700">{Math.round(selected.confidence_score * 100)}%</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ECCEngineeringGraphPage() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [graphData, setGraphData] = useState<GraphData>({ entities: [], relationships: [] });
  const [stats, setStats] = useState<GraphStats>({ totalEntities: 0, totalRelationships: 0, byType: {}, mostConnected: [] });
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    const data = await loadGraphData();
    setGraphData(data);
    setStats(computeGraphStats(data.entities, data.relationships));
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <Network size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900">Engineering Intelligence Graph</h1>
            <p className="text-xs text-slate-500">Knowledge graph connecting all engineering artefacts</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!loading && (
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="font-semibold text-slate-700">{stats.totalEntities}</span> entities ·
              <span className="font-semibold text-slate-700">{stats.totalRelationships}</span> relationships
            </div>
          )}
          <button onClick={refresh} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 disabled:opacity-50 transition-colors">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 px-6 bg-white border-b border-slate-200 flex-shrink-0">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading && activeTab === 'overview' ? (
        <div className="flex-1 flex items-center justify-center text-slate-400">
          <Loader2 size={24} className="animate-spin mr-3" />Loading graph data...
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          {activeTab === 'overview'  && <OverviewTab stats={stats} entities={graphData.entities} relationships={graphData.relationships} />}
          {activeTab === 'graph'     && <GraphExplorerTab graphData={graphData} />}
          {activeTab === 'entities'  && <EntityBrowserTab />}
          {activeTab === 'impact'    && <ImpactAnalysisTab entities={graphData.entities} />}
        </div>
      )}
    </div>
  );
}
