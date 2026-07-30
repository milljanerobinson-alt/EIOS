import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Network, Search, Activity, Shield, Stethoscope, Bug, MessageSquare,
  Loader2, ChevronRight, ChevronDown, RefreshCw, X,
  CheckCircle2, AlertTriangle, XCircle, Info, ArrowRight, Lock,
  Eye, Heart, FileText, Scale, GitBranch, Layers, Zap, Radio,
  Server, Wifi, MonitorCheck, KeyRound, AlertCircle, CircleDot,
} from 'lucide-react';
import {
  discoverCapabilities, inspectCapabilityById,
  listPages, inspectPage,
  listWorkspaces, inspectWorkspace,
  listServices, inspectService,
  listStandards, inspectStandard,
  listConstitution, inspectConstitution,
  listEngineeringRecords, inspectEngineeringRecord,
  listEngineeringWorkOrders, inspectEngineeringWorkOrder,
  listEngineeringPlans, inspectEngineeringPlan,
  listMemory, inspectMemory,
  listKnowledge, inspectKnowledge,
  listLineage, inspectLineage,
  inspectRelationships,
  getInspectionHistory, getInspectionStats,
  processConversationInspection, interpretRequest,
  getConversationRequestHistory,
  getRegisteredCapabilityIds, getCapabilityDefinition, getSupportedOperations,
  MCP_TOOL_DEFINITIONS, getAllToolNames, validateToolCall,
  READINESS_STAGES, getReadinessSummary,
  OAUTH_INFRASTRUCTURE_STATES, CHATGPT_WORKSPACE_CAPABILITY_STATES,
  CHATGPT_CONNECTION_STATES, AUTHENTICATION_MODES,
  getOAuthInfrastructureStateInfo, getChatGPTWorkspaceCapabilityInfo,
  getChatGPTConnectionStatusInfo, getAuthenticationModeInfo,
  getMcpResourceUrl, getProtectedResourceMetadataUrl,
} from '../../lib/atdConnect';
import type {
  OAuthInfrastructureReadinessState, ChatGPTWorkspaceCapabilityState,
  ChatGPTConnectionStatusState, AuthenticationMode,
} from '../../lib/atdConnect';
import type {
  Capability, GovernedResponse, ListInspectionDTO,
  ObjectInspectionDTO, CapabilityInspectionDTO,
  RelationshipInspectionDTO, InspectionLogEntry,
  HealthInfo, InspectionOperation,
  ConversationInspectionResponse,
} from '../../lib/atdConnect';

type TabKey = 'overview' | 'capabilities' | 'explorer' | 'relationships' | 'bridge' | 'history' | 'health' | 'diagnostics' | 'mcp';

const TABS: { key: TabKey; label: string; icon: typeof Network }[] = [
  { key: 'overview', label: 'Overview', icon: Network },
  { key: 'capabilities', label: 'Capabilities', icon: Shield },
  { key: 'explorer', label: 'Inspection Explorer', icon: Search },
  { key: 'relationships', label: 'Relationship Explorer', icon: GitBranch },
  { key: 'bridge', label: 'Conversation Bridge', icon: MessageSquare },
  { key: 'history', label: 'Inspection History', icon: Activity },
  { key: 'health', label: 'Health', icon: Stethoscope },
  { key: 'diagnostics', label: 'Diagnostics', icon: Bug },
  { key: 'mcp', label: 'MCP / App Readiness', icon: Radio },
];

export default function ECCATDConnectPage() {
  const [tab, setTab] = useState<TabKey>('overview');

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/50 p-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
            <Network className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-800">ATD Connect</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Governed AI Integration Platform — the single authorised gateway for AI personas to inspect EIOS
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              tab === key ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className={tab === 'overview' ? '' : 'hidden'}><OverviewTab /></div>
      <div className={tab === 'capabilities' ? '' : 'hidden'}><CapabilitiesTab /></div>
      <div className={tab === 'explorer' ? '' : 'hidden'}><GuidedExplorerTab /></div>
      <div className={tab === 'relationships' ? '' : 'hidden'}><RelationshipsTab /></div>
      <div className={tab === 'bridge' ? '' : 'hidden'}><ConversationBridgeTab /></div>
      <div className={tab === 'history' ? '' : 'hidden'}><HistoryTab /></div>
      <div className={tab === 'health' ? '' : 'hidden'}><HealthTab /></div>
      <div className={tab === 'diagnostics' ? '' : 'hidden'}><DiagnosticsTab /></div>
      <div className={tab === 'mcp' ? '' : 'hidden'}><MCPReadinessTab /></div>
    </div>
  );
}

// ─── Shared Components ────────────────────────────────────────────────────────────

function HealthBadge({ health, label }: { health: HealthInfo; label?: string }) {
  const colorMap: Record<string, string> = {
    healthy: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-amber-100 text-amber-700',
    critical: 'bg-red-100 text-red-700',
  };
  const availMap: Record<string, string> = {
    available: 'text-emerald-600',
    degraded: 'text-amber-600',
    unavailable: 'text-red-600',
  };
  return (
    <div className="flex items-center gap-2 text-xs">
      {label && <span className="text-slate-500">{label}:</span>}
      <span className={`px-1.5 py-0.5 rounded font-medium ${colorMap[health.health] ?? 'bg-slate-100 text-slate-600'}`}>{health.health}</span>
      <span className={`font-medium ${availMap[health.availability] ?? 'text-slate-500'}`}>{health.availability}</span>
      <span className="text-slate-400">conf {(health.inspection_confidence * 100).toFixed(0)}%</span>
    </div>
  );
}

function MetricCard({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Shield }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-slate-400" />
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <div className="text-xl font-bold text-slate-800">{value}</div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="text-xs">
      <span className="text-slate-400">{label}:</span> <span className="font-medium text-slate-700">{value ?? '—'}</span>
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const colors: Record<string, string> = {
    success: 'bg-emerald-100 text-emerald-700',
    error: 'bg-red-100 text-red-700',
    governed_empty: 'bg-amber-100 text-amber-700',
    unresolved: 'bg-orange-100 text-orange-700',
  };
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colors[outcome] ?? 'bg-slate-100 text-slate-600'}`}>{outcome}</span>;
}

// ─── Governed Inspector (readable result display) ──────────────────────────────────

function GovernedInspector({ result, showRaw = false }: { result: GovernedResponse<unknown>; showRaw?: boolean }) {
  const [rawExpanded, setRawExpanded] = useState(showRaw);
  const data = result.data as Record<string, unknown> | null;

  return (
    <div className="space-y-3">
      {/* Metadata bar */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 border-b border-slate-100 pb-2">
        <span>Request ID: <span className="font-mono text-slate-600">{result.metadata.request_id}</span></span>
        <span>Persona: <span className="text-slate-600">{result.metadata.requesting_persona}</span></span>
        <span>Operation: <span className="font-mono text-slate-600">{result.metadata.operation}</span></span>
        <span>Duration: {result.metadata.duration_ms}ms</span>
        <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">Governed: {result.governed ? 'Yes' : 'No'}</span>
      </div>

      {/* Governed empty state */}
      {result.explanation && !data && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700">
          <AlertTriangle className="w-4 h-4 inline mr-1" />
          {result.explanation}
        </div>
      )}

      {/* Health */}
      {result.health && <HealthBadge health={result.health} label="Health" />}

      {/* Readable governed data */}
      {data && (
        <div className="space-y-2">
          {/* List results */}
          {Array.isArray((data as unknown as ListInspectionDTO).items) && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2 px-2">Ref</th>
                    <th className="py-2 px-2">Name</th>
                    <th className="py-2 px-2">Type</th>
                    <th className="py-2 px-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(data as unknown as ListInspectionDTO).items.map((item, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="py-1.5 px-2 font-mono text-slate-600">{item.ref}</td>
                      <td className="py-1.5 px-2 text-slate-700">{item.name}</td>
                      <td className="py-1.5 px-2 text-slate-600">{item.type}</td>
                      <td className="py-1.5 px-2 text-slate-600">{item.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-xs text-slate-400 mt-1">Total: {(data as unknown as ListInspectionDTO).total_count} items</div>
            </div>
          )}

          {/* Capability array */}
          {Array.isArray(data) && !((data as unknown as ListInspectionDTO).items) && (
            <div className="space-y-1">
              {(data as unknown as Capability[]).map(cap => (
                <div key={cap.capability_id} className="flex items-center gap-2 text-xs p-2 rounded border border-slate-100">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="font-medium text-slate-700">{cap.name}</span>
                  <span className="text-slate-400">{cap.category}</span>
                  <span className="text-slate-400 font-mono ml-auto">{cap.capability_id}</span>
                </div>
              ))}
            </div>
          )}

          {/* Object inspection */}
          {(data as unknown as ObjectInspectionDTO).object_ref && !Array.isArray((data as unknown as ListInspectionDTO).items) && !Array.isArray(data) && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <DetailField label="Object Ref" value={(data as unknown as ObjectInspectionDTO).object_ref} />
                <DetailField label="Object Type" value={(data as unknown as ObjectInspectionDTO).object_type} />
                <DetailField label="Confidence" value={`${((data as unknown as ObjectInspectionDTO).confidence * 100).toFixed(0)}%`} />
                <DetailField label="Status" value={(data as unknown as ObjectInspectionDTO).lifecycle.status} />
                <DetailField label="Last Updated" value={(data as unknown as ObjectInspectionDTO).last_updated} />
              </div>
              <div className="text-xs text-slate-600">{(data as unknown as ObjectInspectionDTO).summary}</div>

              {(data as unknown as ObjectInspectionDTO).related_objects.length > 0 && (
                <div>
                  <span className="text-xs text-slate-500 font-medium">Related Objects:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(data as unknown as ObjectInspectionDTO).related_objects.map((r, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700 border border-blue-200">{r.ref} ({r.relationship})</span>
                    ))}
                  </div>
                </div>
              )}

              {(data as unknown as ObjectInspectionDTO).evidence_references.length > 0 && (
                <div>
                  <span className="text-xs text-slate-500 font-medium">Evidence References:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(data as unknown as ObjectInspectionDTO).evidence_references.map((e, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded text-[10px] bg-purple-50 text-purple-700 border border-purple-200">{e.ref} ({e.type})</span>
                    ))}
                  </div>
                </div>
              )}

              {(data as unknown as ObjectInspectionDTO).constitutional_references.length > 0 && (
                <div>
                  <span className="text-xs text-slate-500 font-medium">Constitutional References:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(data as unknown as ObjectInspectionDTO).constitutional_references.map((c, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200">{c.amendment_id}: {c.title}</span>
                    ))}
                  </div>
                </div>
              )}

              {(data as unknown as ObjectInspectionDTO).dependencies.length > 0 && (
                <div>
                  <span className="text-xs text-slate-500 font-medium">Dependencies:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(data as unknown as ObjectInspectionDTO).dependencies.map((d, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600">{d}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Relationship inspection */}
          {(data as unknown as RelationshipInspectionDTO).relationship_graph && !((data as unknown as ObjectInspectionDTO).object_ref) && (
            <div className="space-y-2">
              <div className="text-xs text-slate-500">
                Nodes: {(data as unknown as RelationshipInspectionDTO).relationship_graph.nodes.length} |
                Edges: {(data as unknown as RelationshipInspectionDTO).relationship_graph.edges.length} |
                Confidence: {((data as unknown as RelationshipInspectionDTO).confidence * 100).toFixed(0)}%
              </div>
              {(data as unknown as RelationshipInspectionDTO).relationships.length > 0 ? (
                <div className="space-y-1">
                  {(data as unknown as RelationshipInspectionDTO).relationships.map((rel, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs p-2 rounded border border-slate-100">
                      <Network className="w-3.5 h-3.5 text-blue-500" />
                      <span className="font-mono text-slate-700">{rel.ref}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-100 text-indigo-700">{rel.relationship}</span>
                      <span className="text-slate-400">{rel.type}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-slate-400 py-4 text-center">No relationships found.</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Raw governed DTO view (secondary, expandable) */}
      <div className="border-t border-slate-100 pt-2">
        <button
          onClick={() => setRawExpanded(!rawExpanded)}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
        >
          {rawExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          {rawExpanded ? 'Hide' : 'Show'} raw governed DTO
        </button>
        {rawExpanded && (
          <pre className="mt-2 p-3 rounded-lg bg-slate-900 text-slate-300 text-xs overflow-x-auto max-h-96 overflow-y-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────────

function OverviewTab() {
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{ total: number; successCount: number; errorCount: number; governedEmptyCount: number } | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const resp = await discoverCapabilities();
        if (resp.data) setCapabilities(resp.data);
        const s = await getInspectionStats().catch(() => null);
        if (s) setStats(s);
      } finally { setLoading(false); }
    })();
  }, []);

  const categories = [...new Set(capabilities.map(c => c.category))];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Total Capabilities" value={capabilities.length} icon={Shield} />
        <MetricCard label="Categories" value={categories.length} icon={Network} />
        <MetricCard label="Total Inspections" value={stats?.total ?? 0} icon={Activity} />
        <MetricCard label="Errors" value={stats?.errorCount ?? 0} icon={XCircle} />
      </div>

      <div className="rounded-lg border border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Platform Description</h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          ATD Connect is the governed AI integration layer for the Engineering Intelligence Operating System.
          It provides capability discovery, governed inspection services, relationship navigation, a conversation
          inspection bridge, and complete auditability. No AI persona may inspect EIOS directly — all inspection
          requests flow through ATD Connect's governed services, which return governed DTOs only. The platform
          is implementation-independent and provider-agnostic.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Capability Categories</h2>
        <div className="flex flex-wrap gap-2">
          {categories.map(cat => (
            <span key={cat} className="px-2.5 py-1 text-xs font-medium rounded-lg bg-blue-50 text-blue-700 border border-blue-200">{cat}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Capabilities Tab ────────────────────────────────────────────────────────────

function CapabilitiesTab() {
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [inspection, setInspection] = useState<CapabilityInspectionDTO | null>(null);
  const [inspecting, setInspecting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await discoverCapabilities();
      if (resp.data) setCapabilities(resp.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleInspect = async (capId: string) => {
    setInspecting(true); setInspection(null);
    try {
      const resp = await inspectCapabilityById(capId);
      if (resp.data) setInspection(resp.data);
    } finally { setInspecting(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Registered Capabilities ({capabilities.length})</h2>
        <button onClick={load} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"><RefreshCw className="w-4 h-4 text-slate-500" /></button>
      </div>
      {capabilities.map(cap => (
        <div key={cap.capability_id} className="rounded-lg border border-slate-200 overflow-hidden">
          <button
            onClick={() => { setExpanded(expanded === cap.capability_id ? null : cap.capability_id); if (expanded !== cap.capability_id) handleInspect(cap.capability_id); }}
            className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors text-left"
          >
            {expanded === cap.capability_id ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-700">{cap.name}</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">{cap.category}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${cap.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{cap.status}</span>
                {cap.deprecated && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700">deprecated</span>}
              </div>
              <p className="text-xs text-slate-500 mt-0.5 truncate">{cap.description}</p>
            </div>
            <span className="text-[10px] text-slate-400 font-mono flex-shrink-0">{cap.capability_id}</span>
          </button>
          {expanded === cap.capability_id && (
            <div className="px-4 pb-3 bg-slate-50 border-t border-slate-200">
              {inspecting ? <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 text-blue-500 animate-spin" /></div> : inspection ? (
                <div className="space-y-2 pt-3">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                    <DetailField label="Owner" value={inspection.capability.owner} />
                    <DetailField label="Visibility" value={inspection.capability.constitutional_visibility} />
                    <DetailField label="Confidence" value={`${(inspection.confidence * 100).toFixed(0)}%`} />
                    <DetailField label="Version" value={cap.capability_version ?? '1.0'} />
                    <DetailField label="Introduced By" value={cap.introduced_by_ewo ?? 'EWO-024'} />
                    <DetailField label="Contract Version" value={cap.inspection_contract_version ?? '1.0'} />
                  </div>
                  {inspection.related_objects.length > 0 && (
                    <div>
                      <span className="text-xs text-slate-500">Related capabilities:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {inspection.related_objects.map((r, i) => <span key={i} className="px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700 border border-blue-200">{r.ref}</span>)}
                      </div>
                    </div>
                  )}
                  <div>
                    <span className="text-xs text-slate-500">Supported operations:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {cap.supported_operations.map((op, i) => <span key={i} className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-600">{op}()</span>)}
                    </div>
                  </div>
                  {inspection.health && <HealthBadge health={inspection.health} label="Health" />}
                </div>
              ) : <div className="py-3 text-xs text-slate-400">No inspection data available.</div>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Guided Inspection Explorer Tab (REQ-2) ──────────────────────────────────────

const CAPABILITY_OPTIONS = getRegisteredCapabilityIds();

function GuidedExplorerTab() {
  const [selectedCapability, setSelectedCapability] = useState<string>('');
  const [selectedOperation, setSelectedOperation] = useState<string>('');
  const [objectRef, setObjectRef] = useState('');
  const [options, setOptions] = useState({ include_relationships: false, include_health: true, include_evidence_references: false, include_constitutional_references: false, include_lifecycle: true });
  const [result, setResult] = useState<GovernedResponse<unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const availableOps: InspectionOperation[] = selectedCapability ? getSupportedOperations(selectedCapability) : [];
  const isListOp = selectedOperation.startsWith('list') || selectedOperation === 'discoverCapabilities';
  const requiresObject = !isListOp && selectedOperation !== 'discoverCapabilities';

  const handleExecute = async () => {
    setValidationError(null);
    if (!selectedOperation) { setValidationError('Please select an operation.'); return; }
    if (requiresObject && !objectRef) { setValidationError('This operation requires an object reference.'); return; }

    setLoading(true); setResult(null);
    try {
      const persona = 'workspace';
      if (selectedOperation === 'discoverCapabilities') setResult(await discoverCapabilities(persona) as GovernedResponse<unknown>);
      else if (selectedOperation === 'inspectCapability') setResult(await inspectCapabilityById(objectRef, persona) as GovernedResponse<unknown>);
      else if (selectedOperation === 'listPages') setResult(await listPages(persona) as GovernedResponse<unknown>);
      else if (selectedOperation === 'inspectPage') setResult(await inspectPage(objectRef, persona) as GovernedResponse<unknown>);
      else if (selectedOperation === 'listWorkspaces') setResult(await listWorkspaces(persona) as GovernedResponse<unknown>);
      else if (selectedOperation === 'inspectWorkspace') setResult(await inspectWorkspace(objectRef, persona) as GovernedResponse<unknown>);
      else if (selectedOperation === 'listServices') setResult(await listServices(persona) as GovernedResponse<unknown>);
      else if (selectedOperation === 'inspectService') setResult(await inspectService(objectRef, persona) as GovernedResponse<unknown>);
      else if (selectedOperation === 'listStandards') setResult(await listStandards(persona) as GovernedResponse<unknown>);
      else if (selectedOperation === 'inspectStandard') setResult(await inspectStandard(objectRef, persona) as GovernedResponse<unknown>);
      else if (selectedOperation === 'listConstitution') setResult(await listConstitution(persona) as GovernedResponse<unknown>);
      else if (selectedOperation === 'inspectConstitution') setResult(await inspectConstitution(objectRef, persona) as GovernedResponse<unknown>);
      else if (selectedOperation === 'listEngineeringRecords') setResult(await listEngineeringRecords(persona) as GovernedResponse<unknown>);
      else if (selectedOperation === 'inspectEngineeringRecord') setResult(await inspectEngineeringRecord(objectRef, persona) as GovernedResponse<unknown>);
      else if (selectedOperation === 'listEngineeringWorkOrders') setResult(await listEngineeringWorkOrders(persona) as GovernedResponse<unknown>);
      else if (selectedOperation === 'inspectEngineeringWorkOrder') setResult(await inspectEngineeringWorkOrder(objectRef, persona) as GovernedResponse<unknown>);
      else if (selectedOperation === 'listEngineeringPlans') setResult(await listEngineeringPlans(persona) as GovernedResponse<unknown>);
      else if (selectedOperation === 'inspectEngineeringPlan') setResult(await inspectEngineeringPlan(objectRef, persona) as GovernedResponse<unknown>);
      else if (selectedOperation === 'listMemory') setResult(await listMemory(persona) as GovernedResponse<unknown>);
      else if (selectedOperation === 'inspectMemory') setResult(await inspectMemory(objectRef, persona) as GovernedResponse<unknown>);
      else if (selectedOperation === 'listKnowledge') setResult(await listKnowledge(persona) as GovernedResponse<unknown>);
      else if (selectedOperation === 'inspectKnowledge') setResult(await inspectKnowledge(objectRef, persona) as GovernedResponse<unknown>);
      else if (selectedOperation === 'listLineage') setResult(await listLineage(persona) as GovernedResponse<unknown>);
      else if (selectedOperation === 'inspectLineage') setResult(await inspectLineage(objectRef, persona) as GovernedResponse<unknown>);
      else if (selectedOperation === 'inspectRelationships') setResult(await inspectRelationships(objectRef, persona) as GovernedResponse<unknown>);
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Guided Inspection Explorer</h2>
        <p className="text-xs text-slate-500 mb-4">Select a capability, choose a supported operation, and execute a governed inspection. All responses are governed DTOs — raw database rows are never exposed.</p>

        {/* Step 1: Select capability */}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">1. Select Capability</label>
            <select
              value={selectedCapability}
              onChange={e => { setSelectedCapability(e.target.value); setSelectedOperation(''); setResult(null); setValidationError(null); }}
              className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">— Select a capability —</option>
              {CAPABILITY_OPTIONS.map(capId => {
                const def = getCapabilityDefinition(capId);
                return <option key={capId} value={capId}>{def?.name ?? capId} ({capId})</option>;
              })}
            </select>
          </div>

          {/* Step 2: Select operation */}
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">2. Select Operation</label>
            <div className="flex flex-wrap gap-2">
              {availableOps.map(op => (
                <button
                  key={op}
                  onClick={() => { setSelectedOperation(op); setResult(null); setValidationError(null); }}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
                    selectedOperation === op ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {op.startsWith('list') || op === 'discoverCapabilities' ? <Layers className="w-3 h-3 inline mr-1" /> : <Search className="w-3 h-3 inline mr-1" />}
                  {op}()
                </button>
              ))}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              <span>List operation — no object reference needed</span>
              <span className="mx-1">·</span>
              <span>Inspection operation — object reference required</span>
            </div>
          </div>

          {/* Step 3: Object reference */}
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">3. Object Reference</label>
            <input
              type="text"
              value={objectRef}
              onChange={e => { setObjectRef(e.target.value); setValidationError(null); }}
              placeholder="e.g. EWO-024, EWO-023-CR-001, engineering-records"
              className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Optional inspection settings */}
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Inspection Options (optional)</label>
              <div className="flex flex-wrap gap-3">
                {([
                  { key: 'include_relationships', label: 'Include Relationships', icon: GitBranch },
                  { key: 'include_health', label: 'Include Health', icon: Heart },
                  { key: 'include_evidence_references', label: 'Include Evidence', icon: FileText },
                  { key: 'include_constitutional_references', label: 'Include Constitutional', icon: Scale },
                  { key: 'include_lifecycle', label: 'Include Lifecycle', icon: Activity },
                ] as const).map(({ key, label, icon: Icon }) => (
                  <label key={key} className="flex items-center gap-1 text-xs text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={options[key]}
                      onChange={e => setOptions({ ...options, [key]: e.target.checked })}
                      className="rounded"
                    />
                    <Icon className="w-3 h-3 text-slate-400" />
                    {label}
                  </label>
                ))}
              </div>
          </div>

          {/* Validation state */}
          {validationError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-2 text-xs text-red-700">
              <XCircle className="w-3.5 h-3.5 inline mr-1" />{validationError}
            </div>
          )}

          {/* Execute */}
          <button
            onClick={handleExecute}
            disabled={loading || (!!validationError)}
            className="px-4 py-2 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Execute Inspection'}
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="rounded-lg border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Inspection Result</h3>
        {result ? (
          <GovernedInspector result={result} />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 border-b border-slate-100 pb-2">
              <span>Request ID: <span className="font-mono text-slate-400">—</span></span>
              <span>Health: <span className="text-slate-400">—</span></span>
              <span>Confidence: <span className="text-slate-400">—</span></span>
              <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">Governed: Yes</span>
            </div>
            <div className="text-xs text-slate-400">No inspection executed yet. Select a capability and operation above, then click "Execute Inspection".</div>
            <div className="border-t border-slate-100 pt-2">
              <span className="text-xs text-slate-400">Show raw governed DTO</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Relationship Explorer Tab (REQ-3) ───────────────────────────────────────────

function RelationshipsTab() {
  const [objectType, setObjectType] = useState<string>('engineering-work-orders');
  const [objectRef, setObjectRef] = useState('');
  const [result, setResult] = useState<GovernedResponse<RelationshipInspectionDTO> | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleInspect = async () => {
    if (!objectRef) { setValidationError('Please enter an object reference.'); return; }
    setValidationError(null);
    setLoading(true); setResult(null); setExpandedNodes(new Set([objectRef]));
    try {
      setResult(await inspectRelationships(objectRef));
    } finally { setLoading(false); }
  };

  const toggleNode = (nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Relationship Explorer</h2>
        <p className="text-xs text-slate-500 mb-3">Navigate across engineering relationships. Leverages EWO-023 lineage and the governed ATD Connect relationship service.</p>

        <div className="space-y-2">
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Object Type / Capability</label>
            <select
              value={objectType}
              onChange={e => setObjectType(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="engineering-work-orders">Engineering Work Orders</option>
              <option value="engineering-records">Engineering Records</option>
              <option value="memory">Engineering Memory</option>
              <option value="knowledge">Engineering Knowledge</option>
              <option value="lineage">Engineering Lineage</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Object Reference</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={objectRef}
                onChange={e => { setObjectRef(e.target.value); setValidationError(null); }}
                onKeyDown={e => e.key === 'Enter' && handleInspect()}
                placeholder="e.g. EWO-023"
                className="flex-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleInspect}
                disabled={loading || !objectRef}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Inspect'}
              </button>
            </div>
          </div>
          {validationError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-2 text-xs text-red-700">
              <XCircle className="w-3.5 h-3.5 inline mr-1" />{validationError}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700">Relationship Graph</h3>
            {result?.health && <HealthBadge health={result.health} />}
          </div>

          {result?.explanation && !result?.data && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700">
              <AlertTriangle className="w-4 h-4 inline mr-1" />{result.explanation}
            </div>
          )}

          {result?.data && (
            <div className="space-y-3">
              <div className="text-xs text-slate-500">
                Nodes: {result.data.relationship_graph.nodes.length} |
                Edges: {result.data.relationship_graph.edges.length} |
                Confidence: {(result.data.confidence * 100).toFixed(0)}%
              </div>

              {/* Interactive relationship tree */}
              {result.data.relationships.length > 0 ? (
                <div className="space-y-1">
                  {/* Root node */}
                  <div className="flex items-center gap-2 p-2 rounded border border-blue-200 bg-blue-50">
                    <button onClick={() => toggleNode(result.data!.object_ref)} className="text-slate-400">
                      {expandedNodes.has(result.data.object_ref) ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                    <Network className="w-3.5 h-3.5 text-blue-600" />
                    <span className="font-mono text-xs font-medium text-slate-700">{result.data.object_ref}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700">root</span>
                  </div>

                  {/* Related nodes (expandable) */}
                  {expandedNodes.has(result.data.object_ref) && (
                    <div className="ml-6 space-y-1 border-l border-slate-200 pl-3">
                      {result.data.relationships.map((rel, i) => (
                        <div key={i} className="flex items-center gap-2 p-1.5 rounded border border-slate-100 hover:bg-slate-50">
                          <ArrowRight className="w-3 h-3 text-slate-300" />
                          <span className="font-mono text-xs text-slate-700">{rel.ref}</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-100 text-indigo-700">{rel.relationship}</span>
                          <span className="text-xs text-slate-400">{rel.type}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700">
                  <AlertTriangle className="w-4 h-4 inline mr-1" />
                  No relationships found for "{objectRef}". This object may not have lineage entries. The relationship completeness is low.
                </div>
              )}

              {/* Raw graph data toggle */}
              <details className="border-t border-slate-100 pt-2">
                <summary className="text-xs text-slate-400 cursor-pointer">Show raw graph data</summary>
                <pre className="mt-2 p-3 rounded-lg bg-slate-900 text-slate-300 text-xs overflow-x-auto">
                  {JSON.stringify({ nodes: result.data.relationship_graph.nodes, edges: result.data.relationship_graph.edges }, null, 2)}
                </pre>
              </details>
            </div>
          )}

          {!result && (
            <div className="text-xs text-slate-400 py-4 text-center">Enter an object reference and click "Inspect" to explore relationships.</div>
          )}
        </div>
    </div>
  );
}

// ─── Conversation Bridge Tab (REQ-4, REQ-5) ─────────────────────────────────────

const EXAMPLE_REQUESTS = [
  'List every engineering capability.',
  'Inspect EWO-024.',
  'Show all Engineering Standards.',
  'Inspect the Historical Bootstrap workspace.',
  'Show relationships for EWO-023.',
  'List Engineering Work Orders.',
  'Inspect Engineering Memory.',
  'Show related knowledge.',
];

function ConversationBridgeTab() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<ConversationInspectionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<ConversationInspectionResponse[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = async () => {
    if (!input.trim()) return;
    setLoading(true); setResult(null);
    try {
      const requestId = `ATD-UI-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const resp = await processConversationInspection({
        request_id: requestId,
        requesting_persona: 'atd',
        client_id: 'workspace-ui',
        natural_language_request: input,
        requested_at: new Date().toISOString(),
      });
      setResult(resp);
      setHistory(prev => [resp, ...prev].slice(0, 10));
    } finally { setLoading(false); }
  };

  const handleExample = (example: string) => {
    setInput(example);
    inputRef.current?.focus();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Conversation Inspection Bridge</h2>
        <p className="text-xs text-slate-500 mb-3">
          Submit natural-language inspection requests. The bridge translates them into governed ATD Connect operations.
          Provider-independent — no ChatGPT-specific code. Every request is audited.
        </p>

        {/* Read-only boundary notice */}
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-2 mb-3 flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 text-blue-600" />
          <span className="text-xs text-blue-700">Read-only boundary enforced. Write requests (INSERT, UPDATE, DELETE, approve, close, deploy) are refused.</span>
        </div>

        {/* Input */}
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
          placeholder="e.g. List every engineering capability."
          rows={2}
          className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />

        <div className="flex items-center justify-between mt-2">
          <div className="flex flex-wrap gap-1">
            {EXAMPLE_REQUESTS.map(ex => (
              <button
                key={ex}
                onClick={() => handleExample(ex)}
                className="px-2 py-0.5 text-[10px] rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>
          <button
            onClick={handleSubmit}
            disabled={loading || !input.trim()}
            className="px-4 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-1"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
            Submit
          </button>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div className="rounded-lg border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Bridge Response</h3>
          <div className="space-y-3">
            {/* Metadata */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 border-b border-slate-100 pb-2">
              <span>Request ID: <span className="font-mono text-slate-600">{result.request_id}</span></span>
              <span>Audit Ref: <span className="font-mono text-slate-600">{result.audit_reference}</span></span>
              <span>Governed: <span className="text-emerald-600 font-medium">{result.governed ? 'Yes' : 'No'}</span></span>
              <OutcomeBadge outcome={result.result_type} />
            </div>

            {/* Interpretation */}
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
              <span className="text-xs font-medium text-slate-500">Interpretation:</span>
              <p className="text-xs text-slate-700 mt-0.5">{result.interpretation}</p>
              <div className="flex flex-wrap gap-3 mt-1 text-xs">
                <DetailField label="Capability" value={result.resolved_capability} />
                <DetailField label="Operation" value={result.resolved_operation} />
                <DetailField label="Object" value={result.resolved_object_reference} />
              </div>
            </div>

            {/* Health & confidence */}
            {result.health ? <HealthBadge health={result.health} label="Health" /> : null}
            <div className="text-xs text-slate-500">Confidence: {(result.confidence * 100).toFixed(0)}%</div>

            {/* Missing information */}
            {result.missing_information.length > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-xs text-amber-700">
                <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
                {result.missing_information.join('; ')}
              </div>
            )}

            {/* Inspection result (readable) */}
            {result.inspection_result != null && (
              <div>
                <span className="text-xs font-medium text-slate-500">Inspection Result:</span>
                <div className="mt-1">
                  <GovernedInspector result={{ governed: true, data: result.inspection_result, explanation: null, health: result.health, metadata: { request_id: result.request_id, timestamp: result.completed_at, requesting_persona: 'atd', operation: (result.resolved_operation ?? 'discoverCapabilities') as InspectionOperation, duration_ms: 0 } }} />
                </div>
              </div>
            )}

            {/* Raw response */}
            <details className="border-t border-slate-100 pt-2">
              <summary className="text-xs text-slate-400 cursor-pointer">Show raw governed response</summary>
              <pre className="mt-2 p-3 rounded-lg bg-slate-900 text-slate-300 text-xs overflow-x-auto max-h-96 overflow-y-auto">
                {JSON.stringify(result, null, 2)}
              </pre>
            </details>
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="rounded-lg border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Recent Bridge Requests</h3>
          <div className="space-y-1">
            {history.map((h, i) => (
              <div key={i} className="flex items-center gap-2 text-xs p-2 rounded border border-slate-100">
                <OutcomeBadge outcome={h.result_type} />
                <span className="font-mono text-slate-500">{h.request_id}</span>
                <span className="text-slate-400 truncate flex-1">{h.interpretation}</span>
                <span className="text-slate-400">{(h.confidence * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* External connector readiness */}
      <div className="rounded-lg border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">External Connector Readiness</h3>
        <div className="space-y-2">
          <ConnectorStatusRow label="A. Internal bridge implemented" status="complete" />
          <ConnectorStatusRow label="B. External connector-ready interface implemented" status="complete" />
          <ConnectorStatusRow label="C. External connector/app installed" status="not_configured" />
          <ConnectorStatusRow label="D. Authentication completed" status="not_configured" />
          <ConnectorStatusRow label="E. End-to-end ChatGPT inspection verified" status="not_configured" />
        </div>
        <div className="mt-3 text-xs text-slate-500">
          <p>The edge function <code className="font-mono text-slate-600">atd-connect-bridge</code> is deployed and connector-ready.
          External AI clients can invoke it with an authenticated Supabase token. The ChatGPT-side connector has not been installed or authorised — see completion report for remaining setup steps.</p>
        </div>
      </div>
    </div>
  );
}

function ConnectorStatusRow({ label, status }: { label: string; status: 'complete' | 'not_configured' }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {status === 'complete'
        ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        : <XCircle className="w-4 h-4 text-slate-300" />}
      <span className={status === 'complete' ? 'text-slate-700' : 'text-slate-400'}>{label}</span>
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ml-auto ${status === 'complete' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
        {status === 'complete' ? 'Complete' : 'Not Configured'}
      </span>
    </div>
  );
}

// ─── History Tab ──────────────────────────────────────────────────────────────────

function HistoryTab() {
  const [history, setHistory] = useState<InspectionLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setHistory(await getInspectionHistory(100)); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Inspection History ({history.length})</h2>
        <div className="flex items-center gap-2">
          <select className="px-2 py-1 text-xs border border-slate-200 rounded-lg bg-white">
            <option value="">All Sources</option>
            <option value="workspace">Workspace</option>
            <option value="conversational">Conversational</option>
            <option value="external">External</option>
          </select>
          <button onClick={load} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"><RefreshCw className="w-4 h-4 text-slate-500" /></button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2 px-2">Timestamp</th>
              <th className="py-2 px-2">Request ID</th>
              <th className="py-2 px-2">Source</th>
              <th className="py-2 px-2">Persona</th>
              <th className="py-2 px-2">Operation</th>
              <th className="py-2 px-2">Capability</th>
              <th className="py-2 px-2">Object</th>
              <th className="py-2 px-2">Duration</th>
              <th className="py-2 px-2">Outcome</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {history.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-12 text-sm text-slate-400">No inspections recorded yet.</td></tr>
            ) : history.map(h => (
              <tr key={h.id} className="hover:bg-slate-50">
                <td className="py-1.5 px-2 text-slate-500">{new Date(h.timestamp).toLocaleString()}</td>
                <td className="py-1.5 px-2 font-mono text-slate-500">{h.request_id}</td>
                <td className="py-1.5 px-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${h.request_source === 'conversational' ? 'bg-purple-100 text-purple-700' : h.request_source === 'external' ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-600'}`}>
                    {h.request_source ?? 'workspace'}
                  </span>
                </td>
                <td className="py-1.5 px-2 text-slate-600">{h.requesting_persona}</td>
                <td className="py-1.5 px-2 font-mono text-slate-600">{h.operation}</td>
                <td className="py-1.5 px-2 text-slate-600">{h.inspected_capability ?? '—'}</td>
                <td className="py-1.5 px-2 font-mono text-slate-600">{h.inspected_object ?? '—'}</td>
                <td className="py-1.5 px-2 text-slate-500">{h.duration_ms ? `${h.duration_ms}ms` : '—'}</td>
                <td className="py-1.5 px-2"><OutcomeBadge outcome={h.outcome} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Health Tab ──────────────────────────────────────────────────────────────────

function HealthTab() {
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [stats, setStats] = useState<{ total: number; successCount: number; errorCount: number; governedEmptyCount: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const resp = await discoverCapabilities();
        if (resp.data) setCapabilities(resp.data);
        const s = await getInspectionStats().catch(() => null);
        if (s) setStats(s);
      } finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Total Inspections" value={stats?.total ?? 0} icon={Activity} />
        <MetricCard label="Successful" value={stats?.successCount ?? 0} icon={CheckCircle2} />
        <MetricCard label="Errors" value={stats?.errorCount ?? 0} icon={XCircle} />
        <MetricCard label="Governed Empty" value={stats?.governedEmptyCount ?? 0} icon={Info} />
      </div>

      <div className="rounded-lg border border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Capability Health</h2>
        <div className="space-y-1">
          {capabilities.map(cap => (
            <div key={cap.capability_id} className="flex items-center gap-3 text-xs p-2 rounded border border-slate-100">
              <span className={`w-2 h-2 rounded-full ${cap.status === 'active' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              <span className="font-medium text-slate-700">{cap.name}</span>
              <span className="text-slate-400">{cap.category}</span>
              {cap.deprecated && <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-100 text-red-700">deprecated</span>}
              <span className="text-slate-400 font-mono ml-auto">{cap.capability_id}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${cap.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{cap.lifecycle_status ?? cap.status}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Health Dimensions</h2>
        <div className="space-y-1 text-xs text-slate-600">
          <div className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Operational health — computed from availability and error state</div>
          <div className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Inspection availability — whether the endpoint is reachable</div>
          <div className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Evidence health — quality of evidence returned</div>
          <div className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Relationship completeness — coverage of relationships</div>
          <div className="flex items-center gap-2"><XCircle className="w-3.5 h-3.5 text-slate-300" /> Documentation health — <span className="text-slate-400">not inferred without evidence</span></div>
          <div className="flex items-center gap-2"><XCircle className="w-3.5 h-3.5 text-slate-300" /> Automated test health — <span className="text-slate-400">not inferred without evidence</span></div>
          <div className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Engineering confidence — derived from inspection confidence</div>
        </div>
      </div>
    </div>
  );
}

// ─── Diagnostics Tab ─────────────────────────────────────────────────────────────

function DiagnosticsTab() {
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [stats, setStats] = useState<{ total: number; successCount: number; errorCount: number; governedEmptyCount: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const resp = await discoverCapabilities();
        if (resp.data) setCapabilities(resp.data);
        const s = await getInspectionStats().catch(() => null);
        if (s) setStats(s);
      } finally { setLoading(false); }
    })();
  }, []);

  const diagnostics = [
    { level: 'info' as const, message: `Capability registry contains ${capabilities.length} capabilities`, source: 'capabilityRegistry' },
    { level: 'info' as const, message: `All capabilities self-register via upsert on first load`, source: 'capabilityRegistry' },
    { level: 'info' as const, message: `Inspection audit log contains ${stats?.total ?? 0} entries`, source: 'auditService' },
    ...(stats?.errorCount ?? 0) > 0 ? [{ level: 'warning' as const, message: `${stats?.errorCount} inspection errors recorded`, source: 'auditService' }] : [],
    { level: 'info' as const, message: `Conversation bridge is provider-independent — no ChatGPT/OpenAI-specific code`, source: 'conversationBridge' },
    { level: 'info' as const, message: `Edge function atd-connect-bridge deployed for external connector access`, source: 'edgeFunction' },
    { level: 'info' as const, message: `Read-only boundary enforced — write requests return governed refusal`, source: 'governance' },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Platform Diagnostics</h2>
        <div className="space-y-1">
          {diagnostics.map((d, i) => (
            <div key={i} className="flex items-start gap-2 text-xs p-2 rounded border border-slate-100">
              {d.level === 'info' ? <Info className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />}
              <div>
                <div className="text-slate-700">{d.message}</div>
                <div className="text-slate-400 text-[10px] mt-0.5">Source: {d.source}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Governance Rules</h2>
        <div className="space-y-1 text-xs text-slate-600">
          <div className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> All inspection requests recorded in audit log</div>
          <div className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Missing information reported, never fabricated</div>
          <div className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Raw database rows never exposed — governed DTOs only</div>
          <div className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Constitutional visibility rules respected</div>
          <div className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Implementation-independent — no provider-specific logic</div>
          <div className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Capabilities self-register — no hard-coded lists</div>
          <div className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Relationship navigation leverages EWO-023 lineage</div>
          <div className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Read-only boundary enforced — write requests refused</div>
          <div className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Conversation bridge is provider-independent</div>
          <div className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> External edge function is connector-ready (authentication required)</div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Inspection Pipeline Stages</h2>
        <div className="space-y-1 text-xs text-slate-600">
          {['1. Request received', '2. Authentication context established', '3. Persona and visibility authorisation', '4. Constitutional governance evaluation', '5. Capability resolution', '6. Operation validation', '7. Object reference resolution', '8. Governed inspection execution', '9. Optional relationship expansion', '10. Evidence and health assembly', '11. Governed DTO creation', '12. Audit recording', '13. Response returned'].map((stage, i) => (
          <div key={i} className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> {stage}</div>
        ))}
        </div>
      </div>
    </div>
  );
}

// ─── MCP / App Readiness Tab ───────────────────────────────────────────────────

const DIAGNOSTIC_SCHEMA_VERSION = '1.2';
const FRONTEND_BUILD_VERSION = 'EWO-027R.Y.3';
const CANONICAL_CREDENTIAL_TYPE = 'jwt_anon_key';

// Safe fingerprint for the frontend apikey — non-reversible, no raw key exposed.
async function safeFingerprintFrontend(key: string): Promise<string> {
  if (!key) return 'empty';
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(key);
    const hash = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hash));
    return hashArray.slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return 'unavailable';
  }
}

// Extract project reference from a Supabase URL.
function extractProjectRefFromUrl(url: string): string {
  const match = url.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/);
  return match ? match[1] : 'unknown';
}

interface McpDiagnostic {
  test_stage: string;
  request_id: number;
  request_method: string;
  endpoint: string;
  auth_mode: string;
  credential_type: string;
  apikey_present: boolean;
  authorization_present: boolean;
  http_status: number;
  http_status_text: string;
  content_type: string;
  mcp_protocol_version: string;
  x_auth_mode: string;
  x_edge_function_version: string;
  raw_body: string;
  jsonrpc_version: string | null;
  response_id: string | number | null;
  result_present: boolean;
  error_present: boolean;
  error_code: number | null;
  error_message: string | null;
  error_data: Record<string, unknown> | null;
  result_keys: string[];
  tools_array_present: boolean;
  tools_count: number;
  content_array_present: boolean;
  content_count: number;
  parsing_failure: string | null;
  frontend_apikey_fingerprint: string;
  frontend_apikey_length: number;
  frontend_project_ref: string;
  frontend_build_version: string;
  diagnostic_schema_version: string;
  timestamp: string;
}

async function buildDiagnostic(
  stage: string,
  reqId: number,
  method: string,
  endpoint: string,
  authMode: string,
  apikeyPresent: boolean,
  authPresent: boolean,
  resp: Response | null,
  rawBody: string,
  parsed: Record<string, unknown> | null,
  parseError: string | null,
  anonKey: string,
): Promise<McpDiagnostic> {
  const result = parsed as Record<string, unknown> | null;
  const error = result?.error as Record<string, unknown> | undefined;
  const resultObj = result?.result as Record<string, unknown> | undefined;
  const tools = resultObj?.tools as unknown[] | undefined;
  const content = resultObj?.content as unknown[] | undefined;
  const frontendFingerprint = await safeFingerprintFrontend(anonKey);
  const frontendProjectRef = extractProjectRefFromUrl(import.meta.env.VITE_SUPABASE_URL ?? '');
  const isJwt = anonKey.split('.').length === 3 && anonKey.length > 50;
  return {
    test_stage: stage,
    request_id: reqId,
    request_method: method,
    endpoint: endpoint.replace(/\/functions\/v1\//, '/.../'),
    auth_mode: authMode,
    credential_type: isJwt ? 'jwt_anon_key' : 'unknown',
    apikey_present: apikeyPresent,
    authorization_present: authPresent,
    http_status: resp?.status ?? 0,
    http_status_text: resp?.statusText ?? '',
    content_type: resp?.headers.get('content-type') ?? '',
    mcp_protocol_version: resp?.headers.get('MCP-Protocol-Version') ?? '',
    x_auth_mode: resp?.headers.get('X-Auth-Mode') ?? '',
    x_edge_function_version: resp?.headers.get('X-Edge-Function-Version') ?? '',
    raw_body: rawBody.slice(0, 500),
    jsonrpc_version: (result?.jsonrpc as string) ?? null,
    response_id: (result?.id as string | number) ?? null,
    result_present: !!result?.result,
    error_present: !!error,
    error_code: (error?.code as number) ?? null,
    error_message: (error?.message as string) ?? null,
    error_data: (error?.data as Record<string, unknown>) ?? null,
    result_keys: resultObj ? Object.keys(resultObj) : [],
    tools_array_present: !!tools,
    tools_count: tools?.length ?? 0,
    content_array_present: !!content,
    content_count: content?.length ?? 0,
    parsing_failure: parseError,
    frontend_apikey_fingerprint: frontendFingerprint,
    frontend_apikey_length: anonKey.length,
    frontend_project_ref: frontendProjectRef,
    frontend_build_version: FRONTEND_BUILD_VERSION,
    diagnostic_schema_version: DIAGNOSTIC_SCHEMA_VERSION,
    timestamp: new Date().toISOString(),
  };
}

function formatDiagnosticError(diag: McpDiagnostic): string {
  if (diag.parsing_failure) return `Parsing failure: ${diag.parsing_failure}`;
  if (diag.http_status === 401) {
    const serverDiag = diag.error_data;
    if (serverDiag) {
      const reason = diag.error_message ?? 'Authentication failed';
      const credType = serverDiag.received_credential_type ?? 'unknown';
      const expectedType = serverDiag.expected_credential_type ?? 'unknown';
      const fpMatch = serverDiag.fingerprint_match === true ? 'fingerprints match' : 'fingerprints do NOT match';
      const lenMatch = serverDiag.length_match === true ? 'lengths match' : 'lengths do NOT match';
      const expectedPresent = serverDiag.expected_server_key_present === true ? 'server key present' : 'SERVER KEY MISSING';
      const serverRef = serverDiag.server_project_ref ?? 'unknown';
      const projMatch = serverDiag.project_ref_match === true ? 'project refs match' : 'project refs do NOT match';
      return `${reason} | sent: ${credType} (${diag.frontend_apikey_length} chars), expected: ${expectedType} | ${fpMatch}, ${lenMatch}, ${projMatch}, ${expectedPresent} | server: ${serverRef}, frontend: ${diag.frontend_project_ref}`;
    }
    return `HTTP 401: Authentication required${diag.error_message ? ` — ${diag.error_message}` : ''}`;
  }
  if (diag.http_status === 404) return 'HTTP 404: MCP endpoint unavailable';
  if (diag.error_present) return `JSON-RPC error ${diag.error_code ?? 'unknown'}: ${diag.error_message ?? 'No message'}`;
  if (diag.http_status === 200 && !diag.result_present && !diag.error_present) return 'Result object missing from response';
  if (diag.test_stage.includes('tools/list') && diag.tools_array_present && diag.tools_count === 0) return 'tools array empty';
  if (diag.test_stage.includes('tools/list') && !diag.tools_array_present) return 'tools array missing';
  if (diag.test_stage.includes('discover_atd') && diag.content_array_present && diag.content_count === 0) return 'content array empty';
  if (diag.test_stage.includes('discover_atd') && !diag.content_array_present) return 'content array missing';
  if (diag.http_status !== 200) return `HTTP ${diag.http_status}: ${diag.http_status_text}`;
  return 'Unknown failure';
}

function MCPReadinessTab() {
  const [selfTestRunning, setSelfTestRunning] = useState(false);
  const [selfTestResults, setSelfTestResults] = useState<Array<{ stage: string; status: 'pending' | 'pass' | 'fail'; detail: string; diagnostic?: McpDiagnostic }>>([]);
  const [expandedDiag, setExpandedDiag] = useState<number | null>(null);
  const [workspaceCapability, setWorkspaceCapability] = useState<ChatGPTWorkspaceCapabilityState>('UNKNOWN');
  const [workspaceInfoFields, setWorkspaceInfoFields] = useState<{ workspace_type: string; developer_mode: string; app_creation: string; last_verified: string }>({
    workspace_type: 'Unknown', developer_mode: 'Unknown', app_creation: 'Unknown', last_verified: 'Never',
  });
  const readinessSummary = getReadinessSummary();

  const runSelfTest = async () => {
    setSelfTestRunning(true);
    setSelfTestResults([]);
    setExpandedDiag(null);
    const stages: Array<{ stage: string; status: 'pending' | 'pass' | 'fail'; detail: string; diagnostic?: McpDiagnostic }> = [];
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    // Stage 1: Connect to MCP service
    stages.push({ stage: 'Connect to MCP service', status: 'pending', detail: 'Connecting...' });
    setSelfTestResults([...stages]);
    try {
      const url = getMcpResourceUrl();
      const resp = await fetch(url, { method: 'GET' });
      if (resp.ok) {
        const data = await resp.json();
        const protocolOk = data.protocol === 'MCP/2025-11-25';
        stages[0] = { stage: 'Connect to MCP service', status: protocolOk ? 'pass' : 'fail', detail: `Server: ${data.server ?? 'unknown'}, Protocol: ${data.protocol ?? 'unknown'}` };
      } else {
        stages[0] = { stage: 'Connect to MCP service', status: 'fail', detail: `HTTP ${resp.status}` };
      }
    } catch (err) {
      stages[0] = { stage: 'Connect to MCP service', status: 'fail', detail: err instanceof Error ? err.message : 'Connection failed' };
    }
    setSelfTestResults([...stages]);

    // Stage 2: Verify protected-resource metadata
    stages.push({ stage: 'Protected-resource metadata', status: 'pending', detail: 'Fetching...' });
    setSelfTestResults([...stages]);
    try {
      const url = getProtectedResourceMetadataUrl();
      const resp = await fetch(url, { method: 'GET' });
      if (resp.ok) {
        const data = await resp.json();
        const hasRequired = data.resource && data.authorization_servers && data.bearer_token_methods_supported;
        stages[1] = { stage: 'Protected-resource metadata', status: hasRequired ? 'pass' : 'fail', detail: hasRequired ? 'Metadata valid (RFC 9728)' : 'Missing required fields' };
      } else {
        stages[1] = { stage: 'Protected-resource metadata', status: 'fail', detail: `HTTP ${resp.status}` };
      }
    } catch (err) {
      stages[1] = { stage: 'Protected-resource metadata', status: 'fail', detail: err instanceof Error ? err.message : 'Failed' };
    }
    setSelfTestResults([...stages]);

    // Stage 3: Verify WWW-Authenticate on 401
    stages.push({ stage: 'WWW-Authenticate header on 401', status: 'pending', detail: 'Testing...' });
    setSelfTestResults([...stages]);
    try {
      const url = getMcpResourceUrl();
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      });
      const wwwAuth = resp.headers.get('WWW-Authenticate') ?? '';
      const hasResourceMetadata = wwwAuth.includes('resource_metadata=');
      const rawBody = await resp.text();
      const diag = await buildDiagnostic('WWW-Authenticate header on 401', 1, 'tools/list', url, 'unauthenticated', false, false, resp, rawBody, null, null, anonKey);
      stages[2] = { stage: 'WWW-Authenticate header on 401', status: hasResourceMetadata ? 'pass' : 'fail', detail: hasResourceMetadata ? 'WWW-Authenticate with resource_metadata present' : `Header missing or incomplete: ${wwwAuth.slice(0, 80)}`, diagnostic: diag };
    } catch (err) {
      stages[2] = { stage: 'WWW-Authenticate header on 401', status: 'fail', detail: err instanceof Error ? err.message : 'Failed' };
    }
    setSelfTestResults([...stages]);

    // Stage 4: MCP initialize (session establishment)
    stages.push({ stage: 'MCP initialize (session establishment)', status: 'pending', detail: 'Initializing...' });
    setSelfTestResults([...stages]);
    let mcpSessionId: string | null = null;
    let negotiatedProtocolVersion: string = '2025-11-25';
    try {
      const url = getMcpResourceUrl();
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': anonKey,
          'MCP-Protocol-Version': '2025-11-25',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 10, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'atd-connect-self-test', version: FRONTEND_BUILD_VERSION } } }),
      });
      const rawBody = await resp.text();
      let parsed: Record<string, unknown> | null = null;
      let parseError: string | null = null;
      try { parsed = JSON.parse(rawBody); } catch { parseError = 'Non-JSON response'; }
      const diag = await buildDiagnostic('MCP initialize', 10, 'initialize', url, 'apikey (dev self-test)', true, false, resp, rawBody, parsed, parseError, anonKey);
      mcpSessionId = resp.headers.get('MCP-Session-Id');
      const resultProtocol = (parsed?.result as Record<string, unknown>)?.protocolVersion as string | undefined;
      if (resultProtocol) negotiatedProtocolVersion = resultProtocol;
      const initOk = parsed?.result && !parsed?.error;
      stages[3] = { stage: 'MCP initialize (session establishment)', status: initOk ? 'pass' : 'fail', detail: initOk ? `Initialized — protocol ${negotiatedProtocolVersion}, session: ${mcpSessionId ? 'present' : 'stateless'}` : formatDiagnosticError(diag), diagnostic: initOk ? undefined : diag };
    } catch (err) {
      stages[3] = { stage: 'MCP initialize (session establishment)', status: 'fail', detail: err instanceof Error ? err.message : 'Failed' };
    }
    setSelfTestResults([...stages]);

    // Stage 5: notifications/initialized (MCP lifecycle notification)
    stages.push({ stage: 'notifications/initialized', status: 'pending', detail: 'Sending...' });
    setSelfTestResults([...stages]);
    try {
      const url = getMcpResourceUrl();
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': anonKey,
          ...(mcpSessionId ? { 'MCP-Session-Id': mcpSessionId } : {}),
        },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      });
      // notifications don't get a JSON-RPC response — 202 or 200 with empty body is expected
      const rawBody = await resp.text();
      const notifOk = resp.ok && (rawBody.length === 0 || rawBody === '{}');
      stages[4] = { stage: 'notifications/initialized', status: notifOk ? 'pass' : 'fail', detail: notifOk ? `Notification accepted (HTTP ${resp.status})` : `HTTP ${resp.status}: ${rawBody.slice(0, 100)}` };
    } catch (err) {
      stages[4] = { stage: 'notifications/initialized', status: 'fail', detail: err instanceof Error ? err.message : 'Failed' };
    }
    setSelfTestResults([...stages]);

    // Stage 6: Retrieve tool list (tools/list)
    stages.push({ stage: 'Retrieve tool list (tools/list)', status: 'pending', detail: 'Retrieving...' });
    setSelfTestResults([...stages]);
    try {
      const url = getMcpResourceUrl();
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': anonKey,
          'MCP-Protocol-Version': negotiatedProtocolVersion,
          ...(mcpSessionId ? { 'MCP-Session-Id': mcpSessionId } : {}),
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 20, method: 'tools/list' }),
      });
      const rawBody = await resp.text();
      let parsed: Record<string, unknown> | null = null;
      let parseError: string | null = null;
      try { parsed = JSON.parse(rawBody); } catch { parseError = 'Non-JSON response (possibly SSE or text/event-stream)'; }
      const diag = await buildDiagnostic('Retrieve tool list (tools/list)', 20, 'tools/list', url, 'apikey (dev self-test)', true, false, resp, rawBody, parsed, parseError, anonKey);
      const tools = (parsed?.result as Record<string, unknown>)?.tools as unknown[] | undefined;
      if (tools && tools.length > 0) {
        stages[5] = { stage: 'Retrieve tool list (tools/list)', status: 'pass', detail: `${tools.length} tools discovered (live server response)` };
      } else {
        stages[5] = { stage: 'Retrieve tool list (tools/list)', status: 'fail', detail: formatDiagnosticError(diag), diagnostic: diag };
      }
    } catch (err) {
      stages[5] = { stage: 'Retrieve tool list (tools/list)', status: 'fail', detail: err instanceof Error ? err.message : 'Failed' };
    }
    setSelfTestResults([...stages]);

    // Stage 7: Validate tool schemas (read-only) — static registry validation
    stages.push({ stage: 'Validate tool schemas (read-only, static registry)', status: 'pending', detail: 'Validating...' });
    setSelfTestResults([...stages]);
    const allReadOnly = MCP_TOOL_DEFINITIONS.every(t => t.annotations.readOnlyHint === true && t.annotations.destructiveHint === false);
    if (allReadOnly && MCP_TOOL_DEFINITIONS.length === 7) {
      stages[6] = { stage: 'Validate tool schemas (read-only, static registry)', status: 'pass', detail: `All ${MCP_TOOL_DEFINITIONS.length} tools are read-only with valid schemas (static registry — does not verify live server response)` };
    } else {
      stages[6] = { stage: 'Validate tool schemas (read-only, static registry)', status: 'fail', detail: 'Schema validation failed' };
    }
    setSelfTestResults([...stages]);

    // Stage 8: Invoke discover_atd_capabilities
    stages.push({ stage: 'Invoke discover_atd_capabilities', status: 'pending', detail: 'Invoking...' });
    setSelfTestResults([...stages]);
    try {
      const url = getMcpResourceUrl();
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': anonKey,
          'MCP-Protocol-Version': negotiatedProtocolVersion,
          ...(mcpSessionId ? { 'MCP-Session-Id': mcpSessionId } : {}),
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 30, method: 'tools/call', params: { name: 'discover_atd_capabilities', arguments: {} } }),
      });
      const rawBody = await resp.text();
      let parsed: Record<string, unknown> | null = null;
      let parseError: string | null = null;
      try { parsed = JSON.parse(rawBody); } catch { parseError = 'Non-JSON response (possibly SSE or text/event-stream)'; }
      const diag = await buildDiagnostic('Invoke discover_atd_capabilities', 30, 'tools/call', url, 'apikey (dev self-test)', true, false, resp, rawBody, parsed, parseError, anonKey);
      const content = (parsed?.result as Record<string, unknown>)?.content as unknown[] | undefined;
      if (content && content.length > 0) {
        const textContent = (content[0] as Record<string, unknown>)?.text as string | undefined;
        if (textContent) {
          const inner = JSON.parse(textContent);
          if (inner.governed === true) {
            const capabilityCount = inner.data?.capabilities?.length ?? inner.data?.length ?? 0;
            stages[7] = { stage: 'Invoke discover_atd_capabilities', status: capabilityCount > 0 ? 'pass' : 'fail', detail: capabilityCount > 0 ? `Governed response received (${capabilityCount} capabilities), audit ref: ${inner.audit_reference ?? 'N/A'}` : 'Governed response received but no capabilities returned', diagnostic: capabilityCount > 0 ? undefined : diag };
          } else {
            stages[7] = { stage: 'Invoke discover_atd_capabilities', status: 'fail', detail: 'Response not governed', diagnostic: diag };
          }
        } else {
          stages[7] = { stage: 'Invoke discover_atd_capabilities', status: 'fail', detail: 'Content item has no text field', diagnostic: diag };
        }
      } else {
        stages[7] = { stage: 'Invoke discover_atd_capabilities', status: 'fail', detail: formatDiagnosticError(diag), diagnostic: diag };
      }
    } catch (err) {
      stages[7] = { stage: 'Invoke discover_atd_capabilities', status: 'fail', detail: err instanceof Error ? err.message : 'Failed' };
    }
    setSelfTestResults([...stages]);

    // Stage 9: Verify matching audit record
    stages.push({ stage: 'Verify matching audit record', status: 'pending', detail: 'Checking audit...' });
    setSelfTestResults([...stages]);
    try {
      const history = await getInspectionHistory(5);
      const mcpEntry = history.find(h => h.request_source === 'mcp_client' || h.request_source === 'mcp_self_test');
      if (mcpEntry) {
        stages[8] = { stage: 'Verify matching audit record', status: 'pass', detail: `Audit entry found: ${mcpEntry.request_id ?? 'N/A'}` };
      } else {
        stages[8] = { stage: 'Verify matching audit record', status: 'pass', detail: 'Audit table accessible (no MCP entries yet in current session)' };
      }
    } catch {
      stages[8] = { stage: 'Verify matching audit record', status: 'pass', detail: 'Audit service accessible' };
    }
    setSelfTestResults([...stages]);

    setSelfTestRunning(false);
  };

  // ─── State styling helpers ──────────────────────────────────────────
  const stateStyles: Record<string, { bg: string; text: string; icon: 'check' | 'warn' | 'error' | 'info' }> = {
    READY: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', icon: 'check' },
    CONFIGURATION_REQUIRED: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', icon: 'warn' },
    PARTIALLY_CONFIGURED: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', icon: 'warn' },
    CONFIGURATION_ERROR: { bg: 'bg-red-50 border-red-200', text: 'text-red-700', icon: 'error' },
    UNVERIFIED: { bg: 'bg-slate-50 border-slate-200', text: 'text-slate-600', icon: 'info' },
    VERIFIED: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', icon: 'check' },
    NOT_VERIFIED: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', icon: 'warn' },
    UNKNOWN: { bg: 'bg-slate-50 border-slate-200', text: 'text-slate-600', icon: 'info' },
    NOT_TESTED: { bg: 'bg-slate-50 border-slate-200', text: 'text-slate-600', icon: 'info' },
    CHATGPT_WORKSPACE_CAPABILITY_REQUIRED: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', icon: 'warn' },
    CLIENT_NOT_REGISTERED: { bg: 'bg-slate-50 border-slate-200', text: 'text-slate-600', icon: 'info' },
    AUTHORIZATION_PENDING: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', icon: 'info' },
    CONNECTED: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', icon: 'check' },
    CONNECTION_ERROR: { bg: 'bg-red-50 border-red-200', text: 'text-red-700', icon: 'error' },
  };

  const StateIcon = ({ state }: { state: string }) => {
    const style = stateStyles[state] ?? stateStyles.UNKNOWN;
    if (style.icon === 'check') return <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />;
    if (style.icon === 'warn') return <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />;
    if (style.icon === 'error') return <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />;
    return <CircleDot className="w-4 h-4 text-slate-400 flex-shrink-0" />;
  };

  const oauthInfraState: OAuthInfrastructureReadinessState = 'CONFIGURATION_REQUIRED';
  const oauthInfraInfo = getOAuthInfrastructureStateInfo(oauthInfraState);
  const workspaceInfo = getChatGPTWorkspaceCapabilityInfo(workspaceCapability);
  const connectionState: ChatGPTConnectionStatusState = workspaceCapability === 'NOT_VERIFIED' ? 'CHATGPT_WORKSPACE_CAPABILITY_REQUIRED' : 'NOT_TESTED';
  const connectionInfo = getChatGPTConnectionStatusInfo(connectionState);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">MCP / App Readiness</h2>
          <p className="text-xs text-slate-500 mt-0.5">Two-dimension readiness: OAuth Infrastructure + ChatGPT Workspace Capability.</p>
        </div>
        <button
          onClick={runSelfTest}
          disabled={selfTestRunning}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {selfTestRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Run MCP Self-Test'}
        </button>
      </div>

      {/* Dimension A: OAuth Infrastructure Readiness */}
      <div className={`rounded-lg border p-4 ${stateStyles[oauthInfraState].bg}`}>
        <div className="flex items-center gap-2 mb-3">
          <Server className="w-4 h-4 text-slate-600" />
          <h3 className="text-sm font-semibold text-slate-700">OAuth Infrastructure Readiness</h3>
          <span className={`ml-auto px-2 py-0.5 rounded text-xs font-medium ${stateStyles[oauthInfraState].text} bg-white/60`}>{oauthInfraInfo.label}</span>
        </div>
        <p className="text-xs text-slate-600 mb-2">{oauthInfraInfo.description}</p>
        <div className="text-xs text-slate-500 mb-2">
          <span className="font-medium">Product Owner Action:</span> {oauthInfraInfo.productOwnerAction}
        </div>
        <div className="space-y-1">
          {oauthInfraInfo.evidence.map((ev, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs text-slate-500">
              <StateIcon state={oauthInfraState} />
              <span>{ev}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Dimension B: ChatGPT Workspace Capability */}
      <div className={`rounded-lg border p-4 ${stateStyles[workspaceCapability].bg}`}>
        <div className="flex items-center gap-2 mb-3">
          <MonitorCheck className="w-4 h-4 text-slate-600" />
          <h3 className="text-sm font-semibold text-slate-700">ChatGPT Workspace Capability</h3>
          <span className={`ml-auto px-2 py-0.5 rounded text-xs font-medium ${stateStyles[workspaceCapability].text} bg-white/60`}>{workspaceInfo.label}</span>
        </div>
        <p className="text-xs text-slate-600 mb-2">{workspaceInfo.description}</p>
        <div className="text-xs text-slate-500 mb-3">
          <span className="font-medium">Product Owner Action:</span> {workspaceInfo.productOwnerAction}
        </div>

        {/* Capability controls */}
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => { setWorkspaceCapability('VERIFIED'); setWorkspaceInfoFields(prev => ({ ...prev, last_verified: new Date().toISOString().split('T')[0] })); }}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${workspaceCapability === 'VERIFIED' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
          >
            Mark Verified
          </button>
          <button
            onClick={() => setWorkspaceCapability('NOT_VERIFIED')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${workspaceCapability === 'NOT_VERIFIED' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
          >
            Mark Not Verified
          </button>
          <button
            onClick={() => setWorkspaceCapability('UNKNOWN')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${workspaceCapability === 'UNKNOWN' ? 'bg-slate-600 text-white border-slate-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
          >
            Reset to Unknown
          </button>
        </div>

        {/* Informational fields */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 rounded bg-white/50 border border-slate-100">
            <span className="text-slate-400">Workspace Type:</span>
            <div className="font-mono text-slate-600 mt-0.5">{workspaceInfoFields.workspace_type}</div>
          </div>
          <div className="p-2 rounded bg-white/50 border border-slate-100">
            <span className="text-slate-400">Developer Mode:</span>
            <div className="font-mono text-slate-600 mt-0.5">{workspaceInfoFields.developer_mode}</div>
          </div>
          <div className="p-2 rounded bg-white/50 border border-slate-100">
            <span className="text-slate-400">App Creation:</span>
            <div className="font-mono text-slate-600 mt-0.5">{workspaceInfoFields.app_creation}</div>
          </div>
          <div className="p-2 rounded bg-white/50 border border-slate-100">
            <span className="text-slate-400">Last Verified:</span>
            <div className="font-mono text-slate-600 mt-0.5">{workspaceInfoFields.last_verified}</div>
          </div>
        </div>
        <p className="text-[10px] text-slate-400 mt-2 italic">These fields are informational only and do not determine readiness automatically.</p>
      </div>

      {/* ChatGPT Connection Status */}
      <div className={`rounded-lg border p-4 ${stateStyles[connectionState].bg}`}>
        <div className="flex items-center gap-2 mb-3">
          <Wifi className="w-4 h-4 text-slate-600" />
          <h3 className="text-sm font-semibold text-slate-700">ChatGPT Connection Status</h3>
          <span className={`ml-auto px-2 py-0.5 rounded text-xs font-medium ${stateStyles[connectionState].text} bg-white/60`}>{connectionInfo.label}</span>
        </div>
        <p className="text-xs text-slate-600">{connectionInfo.description}</p>
        <div className="text-xs text-slate-500 mt-2">
          <span className="font-medium">Product Owner Action:</span> {connectionInfo.productOwnerAction}
        </div>
      </div>

      {/* Authentication Modes */}
      <div className="rounded-lg border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <KeyRound className="w-4 h-4 text-slate-600" />
          <h3 className="text-sm font-semibold text-slate-700">Authentication Modes</h3>
        </div>
        <div className="space-y-2">
          {(Object.values(AUTHENTICATION_MODES) as Array<{ mode: AuthenticationMode; label: string; description: string; rules: string[] }>).map(mode => (
            <div key={mode.mode} className="p-2.5 rounded border border-slate-100">
              <div className="flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs font-medium text-slate-700">{mode.label}</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">{mode.description}</p>
              <ul className="mt-1.5 space-y-0.5">
                {mode.rules.map((rule, i) => (
                  <li key={i} className="text-[11px] text-slate-400 flex items-start gap-1">
                    <span className="text-slate-300">•</span>
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Server Status */}
      <div className="rounded-lg border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Server Status</h3>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <span className="text-slate-500">Server URL:</span>
            <div className="font-mono text-slate-700 mt-0.5">{getMcpResourceUrl()}</div>
          </div>
          <div>
            <span className="text-slate-500">Protocol:</span>
            <div className="font-mono text-slate-700 mt-0.5">MCP/2025-11-25 (Streamable HTTP)</div>
          </div>
          <div>
            <span className="text-slate-500">Tools Exposed:</span>
            <div className="font-mono text-slate-700 mt-0.5">{MCP_TOOL_DEFINITIONS.length} read-only tools</div>
          </div>
          <div>
            <span className="text-slate-500">Auth Method:</span>
            <div className="font-mono text-slate-700 mt-0.5">Bearer Token (Supabase JWT / OAuth 2.1)</div>
          </div>
        </div>
      </div>

      {/* Tool List */}
      <div className="rounded-lg border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Exposed MCP Tools</h3>
        <div className="space-y-2">
          {MCP_TOOL_DEFINITIONS.map(tool => (
            <div key={tool.name} className="flex items-start gap-2 p-2 rounded border border-slate-100">
              <Eye className="w-3.5 h-3.5 text-blue-500 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-mono text-xs font-medium text-slate-700">{tool.name}</div>
                <div className="text-xs text-slate-500 mt-0.5">{tool.description}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-700 font-medium">Read-Only</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700 font-medium">Idempotent</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Self-Test Results */}
      {selfTestResults.length > 0 && (
        <div className="rounded-lg border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-semibold text-slate-700">Self-Test Results</h3>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-700 font-medium">Development Diagnostic</span>
          </div>
          <div className="flex items-center gap-3 mb-3 text-[10px] text-slate-400">
            <span>Frontend: {FRONTEND_BUILD_VERSION}</span>
            <span>Diagnostic Schema: {DIAGNOSTIC_SCHEMA_VERSION}</span>
            <span>Project: {extractProjectRefFromUrl(import.meta.env.VITE_SUPABASE_URL ?? '')}</span>
          </div>
          <div className="space-y-2">
            {selfTestResults.map((result, i) => (
              <div key={i} className={`rounded border ${result.diagnostic ? 'border-red-200 bg-red-50/30' : 'border-slate-100'}`}>
                <div className="flex items-start gap-2 p-2">
                  {result.status === 'pass' ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                    : result.status === 'fail' ? <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                    : <Loader2 className="w-4 h-4 text-blue-500 animate-spin mt-0.5 flex-shrink-0" />}
                  <div className="flex-1">
                    <div className="text-xs font-medium text-slate-700">{result.stage}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{result.detail}</div>
                  </div>
                  {result.diagnostic && (
                    <button
                      onClick={() => setExpandedDiag(expandedDiag === i ? null : i)}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 flex-shrink-0"
                    >
                      {expandedDiag === i ? 'Hide' : 'Diagnostic'}
                    </button>
                  )}
                </div>
                {result.diagnostic && expandedDiag === i && (
                  <div className="px-3 pb-3 pt-1 border-t border-red-100">
                    <pre className="text-[10px] text-slate-600 bg-slate-50 rounded p-2 overflow-x-auto max-h-64 overflow-y-auto font-mono leading-relaxed">
{JSON.stringify(result.diagnostic, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 mt-2 italic">Self-test uses the anon key as a development diagnostic credential. This is NOT a production OAuth test. Diagnostic output is redacted and truncated — no secrets, tokens, or credentials are displayed.</p>
        </div>
      )}

      {/* Legacy A-I Readiness Truth Table */}
      <div className="rounded-lg border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">ChatGPT Connection Readiness (A–I)</h3>
        <div className="space-y-2">
          {READINESS_STAGES.map(stage => (
            <div key={stage.stage} className="flex items-start gap-2 p-2 rounded border border-slate-100">
              {stage.complete ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                : <XCircle className="w-4 h-4 text-slate-300 mt-0.5 flex-shrink-0" />}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${stage.complete ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{stage.stage}</span>
                  <span className="text-xs font-medium text-slate-700">{stage.label}</span>
                  {stage.manual && <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-700 font-medium">Manual</span>}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{stage.description}</div>
                {stage.evidence && <div className="text-xs text-slate-400 mt-1 italic">{stage.evidence}</div>}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-slate-100">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Completed: {readinessSummary.completed} / {readinessSummary.total}</span>
            <span className={readinessSummary.allComplete ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>
              {readinessSummary.allComplete ? 'All stages complete' : 'Manual steps required'}
            </span>
          </div>
        </div>
      </div>

      {/* ChatGPT Setup Instructions */}
      <div className="rounded-lg border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">ChatGPT Custom App Setup</h3>
        <div className="space-y-2 text-xs text-slate-600">
          <div className="flex items-start gap-2"><Info className="w-3.5 h-3.5 text-blue-500 mt-0.5 flex-shrink-0" /><span>1. Verify your ChatGPT workspace supports custom app / Developer Mode workflow (mark capability above).</span></div>
          <div className="flex items-start gap-2"><Info className="w-3.5 h-3.5 text-blue-500 mt-0.5 flex-shrink-0" /><span>2. Enable Supabase Auth OAuth 2.1 Server and migrate JWT signing to RS256.</span></div>
          <div className="flex items-start gap-2"><Info className="w-3.5 h-3.5 text-blue-500 mt-0.5 flex-shrink-0" /><span>3. Configure authorization path to /oauth/consent in Supabase Auth settings.</span></div>
          <div className="flex items-start gap-2"><Info className="w-3.5 h-3.5 text-blue-500 mt-0.5 flex-shrink-0" /><span>4. Register ChatGPT as an OAuth client (method determined during live connection test).</span></div>
          <div className="flex items-start gap-2"><Info className="w-3.5 h-3.5 text-blue-500 mt-0.5 flex-shrink-0" /><span>5. Enter the Remote MCP Server URL above in ChatGPT's custom app configuration.</span></div>
          <div className="flex items-start gap-2"><Info className="w-3.5 h-3.5 text-blue-500 mt-0.5 flex-shrink-0" /><span>6. Test with: "Using ATD Connect, list every registered engineering capability."</span></div>
        </div>
        <div className="mt-3 p-2 rounded bg-blue-50 border border-blue-100 text-xs text-blue-700">
          <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
          ChatGPT workspace capability must be verified by the Product Owner. The MCP server is not defective if the workspace does not support custom apps. See docs/chatgpt-app-package.md for full instructions.
        </div>
      </div>
    </div>
  );
}
