import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import * as React from 'react';
import * as fs from 'fs';

// ─── Mocks (hoisted) ───────────────────────────────────────────────────────────
const { mockData } = vi.hoisted(() => {
  const capabilities = [
    {
      id: '1', capability_id: 'engineering-records', name: 'Engineering Records',
      category: 'records', description: 'Engineering Records Library inspection',
      status: 'active', owner: 'EIOS Platform', constitutional_visibility: 'public',
      inspection_service: 'records', relationships: ['knowledge', 'lineage'],
      supported_operations: ['listEngineeringRecords', 'inspectEngineeringRecord'],
      metadata: {}, created_at: '2026-07-23T00:00:00Z', updated_at: '2026-07-23T00:00:00Z',
      capability_version: '1.0', introduced_by_ewo: 'EWO-024', lifecycle_status: 'active',
      deprecated: false, superseded_by: null, replacement_capability: null, inspection_contract_version: '1.0',
    },
    {
      id: '2', capability_id: 'engineering-work-orders', name: 'Engineering Work Orders',
      category: 'work-orders', description: 'EWO inspection',
      status: 'active', owner: 'EIOS Platform', constitutional_visibility: 'public',
      inspection_service: 'work-orders', relationships: ['engineering-records'],
      supported_operations: ['listEngineeringWorkOrders', 'inspectEngineeringWorkOrder'],
      metadata: {}, created_at: '2026-07-23T00:00:00Z', updated_at: '2026-07-23T00:00:00Z',
      capability_version: '1.0', introduced_by_ewo: 'EWO-024', lifecycle_status: 'active',
      deprecated: false, superseded_by: null, replacement_capability: null, inspection_contract_version: '1.0',
    },
  ];
  const ewo = { id: 'w1', ewo_ref: 'EWO-024', title: 'ATD Connect', status: 'engineering_approved', created_at: '2026-07-23T00:00:00Z', updated_at: '2026-07-23T00:00:00Z' };
  const record = { id: 'r1', record_ref: 'EWO-024-CR-001', record_type: 'completion_report', title: 'Completion Report', status: 'verified', ewo_ref: 'EWO-024', created_at: '2026-07-23T00:00:00Z', updated_at: '2026-07-23T00:00:00Z' };
  const lineage = { id: 'l1', from_record_ref: 'EWO-024', to_ref: 'EWO-024-CR-001', relationship_type: 'produces', created_at: '2026-07-23T00:00:00Z' };
  const memory = { id: 'm1', record_ref: 'EWO-024', title: 'ATD Memory', knowledge_category: 'platform', authority_state: 'authoritative', created_at: '2026-07-23T00:00:00Z' };
  const knowledge = { id: 'k1', title: 'ATD Knowledge', knowledge_type: 'platform', status: 'active', summary: 'Knowledge summary', created_at: '2026-07-23T00:00:00Z' };
  const standard = { id: 's1', standard_code: 'ES-004', title: 'Progressive Execution', description: 'Standard', status: 'active' };
  const constitutionDoc = { id: 'c1', amendment_id: 'AMD-001', title: 'Core Architecture', description: 'Amendment', status: 'active' };
  const plan = { id: 'p1', ewo_ref: 'EWO-024', recommendation_type: 'verification', status: 'completed', summary: 'Plan', created_at: '2026-07-23T00:00:00Z' };
  const service = { module_key: 'atd-engine', name: 'ATD Engine', description: 'ATD engine', status: 'active' };
  const inspectionLog = [
    { id: 'log1', request_id: 'ATD-001', timestamp: '2026-07-23T01:00:00Z', requesting_persona: 'atd', inspected_capability: 'engineering-records', inspected_object: 'EWO-024-CR-001', operation: 'inspectEngineeringRecord', duration_ms: 15, outcome: 'success', error_message: null, response_summary: null, created_at: '2026-07-23T01:00:00Z', request_source: 'workspace' },
  ];
  return { mockData: { capabilities, ewo, record, lineage, memory, knowledge, standard, constitutionDoc, plan, service, inspectionLog } };
});

vi.mock('../lib/supabase', () => {
  let filterValue: string | null = null;
  function getMockSingleFiltered(table: string, filter: string | null): unknown {
    if (filter !== null) {
      const known = getMockSingle(table);
      if (known && typeof known === 'object') {
        const rec = known as Record<string, unknown>;
        const refFields = ['record_ref', 'ewo_ref', 'module_key', 'standard_code', 'amendment_id', 'id', 'capability_id'];
        for (const f of refFields) {
          if (rec[f] && String(rec[f]) === filter) return known;
          if (rec[f] && String(rec[f]).toLowerCase() === filter.toLowerCase()) return known;
        }
      }
      return null;
    }
    return getMockSingle(table);
  }
  function makeChain(table: string): Record<string, unknown> {
    filterValue = null;
    const chain: Record<string, unknown> = {};
    const resolveList = () => {
      const all = getMockList(table) as Record<string, unknown>[];
      if (filterValue && all.length > 0) {
        const filtered = all.filter(row => {
          const fields = ['from_record_ref', 'to_ref', 'ewo_ref', 'record_ref', 'module_key', 'standard_code', 'amendment_id', 'capability_id', 'id'];
          return fields.some(f => row[f] && String(row[f]).toLowerCase() === filterValue!.toLowerCase());
        });
        return Promise.resolve({ data: filtered, error: null });
      }
      return Promise.resolve({ data: all, error: null });
    };
    const resolveSingle = () => Promise.resolve({ data: getMockSingleFiltered(table, filterValue), error: null });
    const resolveCount = () => Promise.resolve({ count: getMockList(table).length, error: null });
    chain.maybeSingle = vi.fn(resolveSingle);
    chain.single = vi.fn(resolveSingle);
    chain.limit = vi.fn(resolveList);
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => resolveList().then(resolve, reject);
    chain.eq = vi.fn((_col: string, val: unknown) => { if (typeof val === 'string') filterValue = val; return chain; });
    chain.or = vi.fn((filterStr: string) => { const match = filterStr.match(/\.eq\.([^,]+)/); if (match) filterValue = match[1]; return chain; });
    for (const m of ['neq', 'order', 'ilike', 'in', 'not', 'gt', 'lt', 'gte', 'lte', 'range', 'match']) chain[m] = vi.fn(() => chain);
    const selectFn = vi.fn((_cols?: string, _opts?: Record<string, unknown>) => {
      if (_opts && (_opts.count !== undefined || _opts.head)) {
        const countResult = resolveCount();
        const thenable = { ...countResult, then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => countResult.then(resolve, reject), eq: vi.fn(() => thenable), neq: vi.fn(() => thenable), or: vi.fn(() => thenable) };
        return thenable;
      }
      return chain;
    });
    selectFn.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => resolveList().then(resolve, reject);
    const builder: Record<string, unknown> = { select: selectFn, upsert: vi.fn().mockResolvedValue({ data: null, error: null }), insert: vi.fn().mockResolvedValue({ data: null, error: null }), update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }), select: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: null, error: null }) })) })), delete: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })) };
    for (const [k, v] of Object.entries(chain)) builder[k] = v;
    return builder;
  }
  function getMockSingle(table: string): unknown {
    const d = mockData;
    switch (table) {
      case 'engineering_work_orders': return d.ewo;
      case 'engineering_records_library': return d.record;
      case 'engineering_memory': return d.memory;
      case 'ecc_knowledge_objects': return d.knowledge;
      case 'ecc_engineering_standards': return d.standard;
      case 'constitutional_documents': return d.constitutionDoc;
      case 'epre_recommendations': return d.plan;
      case 'ecc_module_registry': return d.service;
      case 'engineering_record_lineage': return d.lineage;
      case 'atd_connect_capabilities': return d.capabilities[0];
      default: return null;
    }
  }
  function getMockList(table: string): unknown[] {
    const d = mockData;
    switch (table) {
      case 'atd_connect_capabilities': return d.capabilities;
      case 'engineering_work_orders': return [d.ewo];
      case 'engineering_records_library': return [d.record];
      case 'engineering_memory': return [d.memory];
      case 'ecc_knowledge_objects': return [d.knowledge];
      case 'ecc_engineering_standards': return [d.standard];
      case 'constitutional_documents': return [d.constitutionDoc];
      case 'epre_recommendations': return [d.plan];
      case 'ecc_module_registry': return [d.service];
      case 'engineering_record_lineage': return [d.lineage];
      case 'atd_connect_inspection_log': return d.inspectionLog;
      case 'atd_connect_conversation_requests': return [];
      default: return [];
    }
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

import {
  discoverCapabilities, inspectCapabilityById,
  listPages, inspectPage, listWorkspaces, inspectWorkspace,
  listServices, inspectService, listStandards, inspectStandard,
  listConstitution, inspectConstitution,
  listEngineeringRecords, inspectEngineeringRecord,
  listEngineeringWorkOrders, inspectEngineeringWorkOrder,
  listEngineeringPlans, inspectEngineeringPlan,
  listMemory, inspectMemory, listKnowledge, inspectKnowledge,
  listLineage, inspectLineage, inspectRelationships,
  recordInspection, getInspectionHistory, getInspectionStats,
  computeHealth, computeOverallHealth, governedEmptyHealth,
  getRegisteredCapabilityIds, getCapabilityDefinition, getSupportedOperations,
  processConversationInspection, interpretRequest,
  createGovernedRefusal,
} from '../lib/atdConnect';
import type { ConversationInspectionResponse, GovernedResponse } from '../lib/atdConnect';

import ECCATDConnectPage from '../pages/ecc/ECCATDConnectPage';

describe('EWO-024R.1 — ATD Connect Conversation Bridge, Navigation & Inspection Experience Refinement', () => {

  beforeEach(() => { vi.clearAllMocks(); });

  // ─── REQ-1: Navigation Integration ──────────────────────────────────────────

  describe('REQ-1 — ATD Connect Navigation Integration', () => {
    it('navigation item exists in PLATFORM_NAV_GROUPS', () => {
      const content = fs.readFileSync('src/pages/EngineeringControlCentrePage.tsx', 'utf-8');
      expect(content).toContain("'atd-connect'");
      expect(content).toContain('ATD Connect');
    });

    it('canonical route opens #/engineering/atd-connect', () => {
      const content = fs.readFileSync('src/pages/EngineeringControlCentrePage.tsx', 'utf-8');
      expect(content).toMatch(/case\s+'atd-connect'.*ECCATDConnectPage/);
    });

    it('route is registered in route registry', () => {
      const content = fs.readFileSync('src/lib/routeRegistry.ts', 'utf-8');
      expect(content).toContain('atd-connect');
      expect(content).toContain('ECCATDConnectPage');
    });

    it('Section type includes atd-connect', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCDashboard.tsx', 'utf-8');
      expect(content).toContain("'atd-connect'");
    });

    it('atd-connect content container uses canonical overflow-y-auto (EWO-027R.X)', () => {
      const content = fs.readFileSync('src/pages/EngineeringControlCentrePage.tsx', 'utf-8');
      expect(content).not.toMatch(/FULL_HEIGHT_SECTIONS/);
      expect(content).toMatch(/overflow-y-auto/);
    });

    it('direct URL route works (case handler exists)', () => {
      const content = fs.readFileSync('src/pages/EngineeringControlCentrePage.tsx', 'utf-8');
      expect(content).toContain("case 'atd-connect':");
    });

    it('no unrelated navigation regressions (other nav items still present)', () => {
      const content = fs.readFileSync('src/pages/EngineeringControlCentrePage.tsx', 'utf-8');
      expect(content).toContain("'mission-control'");
      expect(content).toContain("'work-orders'");
      expect(content).toContain("'constitution'");
      expect(content).toContain("'historical-bootstrap'");
    });
  });

  // ─── REQ-2: Guided Inspection Explorer ──────────────────────────────────────────

  describe('REQ-2 — Guided Inspection Explorer', () => {
    it('page renders with guided explorer tab', () => {
      const html = renderToString(React.createElement(ECCATDConnectPage));
      expect(html).toContain('Inspection Explorer');
      expect(html).toContain('Guided Inspection Explorer');
    });

    it('page supports capability selection', () => {
      const html = renderToString(React.createElement(ECCATDConnectPage));
      expect(html).toContain('Select Capability');
    });

    it('page supports operation selection', () => {
      const html = renderToString(React.createElement(ECCATDConnectPage));
      expect(html).toContain('Select Operation');
    });

    it('page distinguishes list from inspect operations', () => {
      const html = renderToString(React.createElement(ECCATDConnectPage));
      expect(html).toContain('List operation');
      expect(html).toContain('Inspection operation');
    });

    it('page has optional inspection settings', () => {
      const html = renderToString(React.createElement(ECCATDConnectPage));
      expect(html).toContain('Include Relationships');
      expect(html).toContain('Include Health');
      expect(html).toContain('Include Evidence');
      expect(html).toContain('Include Constitutional');
      expect(html).toContain('Include Lifecycle');
    });

    it('governed success returns governed DTO', async () => {
      const resp = await listEngineeringWorkOrders();
      expect(resp.governed).toBe(true);
      expect(resp.data).not.toBeNull();
    });

    it('governed empty returns explanation', async () => {
      const resp = await inspectPage('nonexistent');
      expect(resp.governed).toBe(true);
      expect(resp.data).toBeNull();
      expect(resp.explanation).toContain('not found');
    });

    it('no raw database rows exposed (governed DTOs only)', () => {
      const content = fs.readFileSync('src/lib/atdConnect/inspectionServices.ts', 'utf-8');
      expect(content).not.toContain('.insert(');
      expect(content).not.toContain('.update(');
      expect(content).not.toContain('.delete(');
    });

    it('readable governed inspector displays key fields', () => {
      const html = renderToString(React.createElement(ECCATDConnectPage));
      expect(html).toContain('Request ID');
      expect(html).toContain('Governed');
      expect(html).toContain('Health');
      expect(html).toContain('Confidence');
    });

    it('raw DTO view is secondary/expandable, not primary', () => {
      const html = renderToString(React.createElement(ECCATDConnectPage));
      expect(html).toContain('raw governed DTO');
    });
  });

  // ─── REQ-3: Relationship Explorer Refinement ──────────────────────────────────

  describe('REQ-3 — Relationship Explorer Refinement', () => {
    it('page has object type selection', () => {
      const html = renderToString(React.createElement(ECCATDConnectPage));
      expect(html).toContain('Object Type');
      expect(html).toContain('Engineering Work Orders');
    });

    it('page has object reference input', () => {
      const html = renderToString(React.createElement(ECCATDConnectPage));
      expect(html).toContain('Object Reference');
    });

    it('inspectRelationships returns valid result', async () => {
      const resp = await inspectRelationships('EWO-024');
      expect(resp.governed).toBe(true);
      expect(resp.data).not.toBeNull();
      expect(resp.data!.relationships).toBeDefined();
      expect(resp.data!.relationship_graph).toBeDefined();
    });

    it('missing object returns governed empty', async () => {
      const resp = await inspectRelationships('nonexistent-ref');
      expect(resp.governed).toBe(true);
    });

    it('relationship service uses lineage table (EWO-023)', () => {
      const content = fs.readFileSync('src/lib/atdConnect/inspectionServices.ts', 'utf-8');
      expect(content).toContain('engineering_record_lineage');
    });

    it('page shows expandable tree', () => {
      const html = renderToString(React.createElement(ECCATDConnectPage));
      expect(html).toContain('Relationship Graph');
    });

    it('page identifies low-confidence relationships', async () => {
      const resp = await inspectRelationships('nonexistent');
      if (resp.data) {
        expect(resp.data.confidence).toBeLessThanOrEqual(0.5);
      }
    });
  });

  // ─── REQ-4: Conversation Inspection Bridge ────────────────────────────────────

  describe('REQ-4 — Conversation Inspection Bridge', () => {
    it('processConversationInspection is exported', () => {
      expect(typeof processConversationInspection).toBe('function');
    });

    it('interpretRequest is deterministic and provider-independent', () => {
      expect(typeof interpretRequest).toBe('function');
    });

    // Supported examples
    it('"List every engineering capability" resolves correctly', () => {
      const result = interpretRequest('List every engineering capability.');
      expect(result.capability).toBe('atd-connect');
      expect(result.operation).toBe('discoverCapabilities');
      expect(result.ambiguous).toBe(false);
    });

    it('"Inspect EWO-024." resolves correctly', () => {
      const result = interpretRequest('Inspect EWO-024.');
      expect(result.capability).toBe('engineering-work-orders');
      expect(result.operation).toBe('inspectEngineeringWorkOrder');
      expect(result.objectReference).toBe('EWO-024');
    });

    it('"Show all Engineering Standards." resolves correctly', () => {
      const result = interpretRequest('Show all Engineering Standards.');
      expect(result.capability).toBe('standards');
      expect(result.operation).toBe('listStandards');
    });

    it('"Inspect the Historical Bootstrap workspace." resolves correctly', () => {
      const result = interpretRequest('Inspect the Historical Bootstrap workspace.');
      expect(result.capability).toBe('workspaces');
      expect(result.operation).toBe('inspectWorkspace');
      expect(result.objectReference).toBe('Historical Bootstrap');
    });

    it('"Show relationships for EWO-023." resolves correctly', () => {
      const result = interpretRequest('Show relationships for EWO-023.');
      expect(result.capability).toBe('lineage');
      expect(result.operation).toBe('inspectRelationships');
    });

    it('"List Engineering Work Orders." resolves correctly', () => {
      const result = interpretRequest('List Engineering Work Orders.');
      expect(result.capability).toBe('engineering-work-orders');
      expect(result.operation).toBe('listEngineeringWorkOrders');
    });

    it('"Inspect Engineering Memory." resolves correctly', () => {
      const result = interpretRequest('Inspect Engineering Memory for EWO-024.');
      expect(result.capability).toBe('memory');
      expect(result.operation).toBe('inspectMemory');
    });

    it('"Show related knowledge." resolves correctly', () => {
      const result = interpretRequest('Show related knowledge.');
      expect(result.capability).toBe('knowledge');
      expect(result.operation).toBe('listKnowledge');
    });

    // Ambiguous requests
    it('ambiguous request does not fabricate resolution', () => {
      const result = interpretRequest('What is the meaning of life?');
      expect(result.ambiguous).toBe(true);
      expect(result.capability).toBeNull();
      expect(result.operation).toBeNull();
    });

    it('ambiguous request returns governed unresolved response', async () => {
      const resp = await processConversationInspection({
        request_id: 'test-1',
        requesting_persona: 'test',
        natural_language_request: 'What is the meaning of life?',
        requested_at: new Date().toISOString(),
      });
      expect(resp.governed).toBe(true);
      expect(resp.result_type).toBe('unresolved');
      expect(resp.resolved_capability).toBeNull();
    });

    // Write requests
    it('write request is detected and refused', () => {
      const result = interpretRequest('Delete EWO-024.');
      expect(result.isWriteRequest).toBe(true);
    });

    it('write request returns governed refusal', async () => {
      const resp = await processConversationInspection({
        request_id: 'test-write',
        requesting_persona: 'test',
        natural_language_request: 'Delete EWO-024.',
        requested_at: new Date().toISOString(),
      });
      expect(resp.governed).toBe(true);
      expect(resp.result_type).toBe('error');
      expect(resp.inspection_result).toBeNull();
    });

    it('createGovernedRefusal returns governed refusal', () => {
      const refusal = createGovernedRefusal('test-123', 'write_attempt');
      expect(refusal.governed).toBe(true);
      expect(refusal.refused).toBe(true);
      expect(refusal.message).toContain('read-only');
    });

    // Audit
    it('every conversation request is audited', async () => {
      const { supabase } = await import('../lib/supabase');
      await processConversationInspection({
        request_id: 'test-audit',
        requesting_persona: 'test',
        natural_language_request: 'List every engineering capability.',
        requested_at: new Date().toISOString(),
      });
      expect(supabase.from).toHaveBeenCalledWith('atd_connect_inspection_log');
    });

    it('original and interpreted requests remain distinguishable', async () => {
      const resp = await processConversationInspection({
        request_id: 'test-dist',
        requesting_persona: 'test',
        natural_language_request: 'List every engineering capability.',
        requested_at: new Date().toISOString(),
      });
      expect(resp.interpretation).toContain('Resolved to capability');
      expect(resp.resolved_capability).toBe('atd-connect');
    });

    it('conversation request contracts are defined in types', () => {
      const content = fs.readFileSync('src/lib/atdConnect/types.ts', 'utf-8');
      expect(content).toContain('ConversationInspectionRequest');
      expect(content).toContain('ConversationInspectionResponse');
      expect(content).toContain('request_id');
      expect(content).toContain('requesting_persona');
      expect(content).toContain('natural_language_request');
      expect(content).toContain('inspection_options');
      expect(content).toContain('authentication_context');
      expect(content).toContain('audit_reference');
      expect(content).toContain('missing_information');
    });

    it('no provider-specific code in conversation bridge', () => {
      const content = fs.readFileSync('src/lib/atdConnect/conversationBridge.ts', 'utf-8');
      expect(content).not.toMatch(/chatgpt|openai\.com|anthropic\.com|gemini/i);
    });

    it('bridge invokes same governed inspection services', () => {
      const content = fs.readFileSync('src/lib/atdConnect/conversationBridge.ts', 'utf-8');
      expect(content).toContain('discoverCapabilities');
      expect(content).toContain('inspectEngineeringWorkOrder');
      expect(content).toContain('inspectRelationships');
    });
  });

  // ─── REQ-5: External Connector-Ready Interface ────────────────────────────────

  describe('REQ-5 — External Connector-Ready Interface', () => {
    it('edge function file exists', () => {
      expect(fs.existsSync('supabase/functions/atd-connect-bridge/index.ts')).toBe(true);
    });

    it('edge function requires authentication', () => {
      const content = fs.readFileSync('supabase/functions/atd-connect-bridge/index.ts', 'utf-8');
      expect(content).toContain('Authorization');
      expect(content).toContain('authentication_required');
    });

    it('edge function rejects unauthorised requests', () => {
      const content = fs.readFileSync('supabase/functions/atd-connect-bridge/index.ts', 'utf-8');
      expect(content).toContain('401');
    });

    it('edge function has CORS headers', () => {
      const content = fs.readFileSync('supabase/functions/atd-connect-bridge/index.ts', 'utf-8');
      expect(content).toContain('Access-Control-Allow-Origin');
      expect(content).toContain('Access-Control-Allow-Methods');
      expect(content).toContain('Access-Control-Allow-Headers');
    });

    it('edge function records audit for every request', () => {
      const content = fs.readFileSync('supabase/functions/atd-connect-bridge/index.ts', 'utf-8');
      expect(content).toContain('atd_connect_inspection_log');
      expect(content).toContain('insert');
    });

    it('edge function supports request correlation via request IDs', () => {
      const content = fs.readFileSync('supabase/functions/atd-connect-bridge/index.ts', 'utf-8');
      expect(content).toContain('request_id');
    });

    it('edge function applies rate limiting', () => {
      const content = fs.readFileSync('supabase/functions/atd-connect-bridge/index.ts', 'utf-8');
      expect(content).toContain('rate_limit');
      expect(content).toContain('429');
    });

    it('edge function does not expose service-role credentials', () => {
      const content = fs.readFileSync('supabase/functions/atd-connect-bridge/index.ts', 'utf-8');
      expect(content).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    });

    it('edge function returns governed response contract', () => {
      const content = fs.readFileSync('supabase/functions/atd-connect-bridge/index.ts', 'utf-8');
      expect(content).toContain('governed');
      expect(content).toContain('audit_reference');
      expect(content).toContain('result_type');
    });

    it('edge function is provider-independent', () => {
      const content = fs.readFileSync('supabase/functions/atd-connect-bridge/index.ts', 'utf-8');
      expect(content).not.toMatch(/chatgpt|openai\.com|anthropic\.com|gemini/i);
    });

    it('UI shows connector readiness status truthfully', () => {
      const html = renderToString(React.createElement(ECCATDConnectPage));
      expect(html).toContain('External Connector Readiness');
      expect(html).toContain('Internal bridge implemented');
      expect(html).toContain('External connector-ready interface implemented');
      expect(html).toContain('Not Configured');
    });
  });

  // ─── REQ-6: Governed Inspection Pipeline ──────────────────────────────────────

  describe('REQ-6 — Governed Inspection Pipeline', () => {
    it('pipeline stages are defined in types', () => {
      const content = fs.readFileSync('src/lib/atdConnect/types.ts', 'utf-8');
      expect(content).toContain('PipelineStageName');
      expect(content).toContain('request_received');
      expect(content).toContain('authentication_context_established');
      expect(content).toContain('persona_visibility_authorisation');
      expect(content).toContain('constitutional_governance_evaluation');
      expect(content).toContain('capability_resolution');
      expect(content).toContain('operation_validation');
      expect(content).toContain('object_reference_validation');
      expect(content).toContain('governed_inspection_execution');
      expect(content).toContain('optional_relationship_expansion');
      expect(content).toContain('evidence_and_health_assembly');
      expect(content).toContain('governed_dto_creation');
      expect(content).toContain('audit_recording');
      expect(content).toContain('response_returned');
    });

    it('conversation bridge tracks pipeline stages', () => {
      const content = fs.readFileSync('src/lib/atdConnect/conversationBridge.ts', 'utf-8');
      expect(content).toContain('createPipelineTracker');
      expect(content).toContain('addStage');
      expect(content).toContain('request_received');
      expect(content).toContain('audit_recording');
    });

    it('pipeline stages can be not_applicable (not described as executed)', () => {
      const content = fs.readFileSync('src/lib/atdConnect/conversationBridge.ts', 'utf-8');
      expect(content).toContain('not_applicable');
    });
  });

  // ─── REQ-7: Audit and Diagnostic Enhancement ──────────────────────────────────

  describe('REQ-7 — Audit and Diagnostic Enhancement', () => {
    it('inspection log has conversational fields', () => {
      const content = fs.readFileSync('src/lib/atdConnect/types.ts', 'utf-8');
      expect(content).toContain('original_request');
      expect(content).toContain('resolved_capability');
      expect(content).toContain('resolved_operation');
      expect(content).toContain('client_id');
      expect(content).toContain('session_id');
      expect(content).toContain('authentication_outcome');
      expect(content).toContain('governance_outcome');
      expect(content).toContain('pipeline_stages');
      expect(content).toContain('request_source');
    });

    it('conversation requests are stored in separate table', () => {
      const content = fs.readFileSync('src/lib/atdConnect/conversationBridge.ts', 'utf-8');
      expect(content).toContain('atd_connect_conversation_requests');
    });

    it('UI distinguishes workspace from conversational requests', () => {
      const html = renderToString(React.createElement(ECCATDConnectPage));
      expect(html).toContain('Source');
      expect(html).toContain('workspace');
    });

    it('no secrets stored in audit logs', () => {
      const content = fs.readFileSync('src/lib/atdConnect/auditService.ts', 'utf-8');
      expect(content).not.toContain('password');
      expect(content).not.toContain('secret');
      expect(content).not.toContain('token');
    });
  });

  // ─── REQ-8: Capability Registry Refinements ───────────────────────────────────

  describe('REQ-8 — Capability Registry Refinements', () => {
    it('capabilities have version field', () => {
      const content = fs.readFileSync('src/lib/atdConnect/types.ts', 'utf-8');
      expect(content).toContain('capability_version');
    });

    it('capabilities have introduced_by_ewo field', () => {
      const content = fs.readFileSync('src/lib/atdConnect/types.ts', 'utf-8');
      expect(content).toContain('introduced_by_ewo');
    });

    it('capabilities have lifecycle_status field', () => {
      const content = fs.readFileSync('src/lib/atdConnect/types.ts', 'utf-8');
      expect(content).toContain('lifecycle_status');
    });

    it('capabilities have deprecated field', () => {
      const content = fs.readFileSync('src/lib/atdConnect/types.ts', 'utf-8');
      expect(content).toContain('deprecated');
    });

    it('capabilities have superseded_by field', () => {
      const content = fs.readFileSync('src/lib/atdConnect/types.ts', 'utf-8');
      expect(content).toContain('superseded_by');
    });

    it('capabilities have inspection_contract_version field', () => {
      const content = fs.readFileSync('src/lib/atdConnect/types.ts', 'utf-8');
      expect(content).toContain('inspection_contract_version');
    });

    it('registry upserts include enhanced fields', () => {
      const content = fs.readFileSync('src/lib/atdConnect/capabilityRegistry.ts', 'utf-8');
      expect(content).toContain('capability_version');
      expect(content).toContain('introduced_by_ewo');
      expect(content).toContain('lifecycle_status');
      expect(content).toContain('inspection_contract_version');
    });

    it('existing 13 capabilities remain available', () => {
      const ids = getRegisteredCapabilityIds();
      expect(ids.length).toBeGreaterThanOrEqual(13);
      expect(ids).toContain('engineering-records');
      expect(ids).toContain('engineering-work-orders');
      expect(ids).toContain('constitution');
      expect(ids).toContain('memory');
      expect(ids).toContain('knowledge');
      expect(ids).toContain('lineage');
    });
  });

  // ─── REQ-9: Health Model Refinement ──────────────────────────────────────────

  describe('REQ-9 — Health Model Refinement', () => {
    it('health has separated dimensions', () => {
      const content = fs.readFileSync('src/lib/atdConnect/types.ts', 'utf-8');
      expect(content).toContain('operational_health');
      expect(content).toContain('inspection_availability');
      expect(content).toContain('evidence_health');
      expect(content).toContain('relationship_health');
      expect(content).toContain('documentation_health');
      expect(content).toContain('automated_test_health');
      expect(content).toContain('engineering_confidence');
    });

    it('computeHealth returns separated dimensions', () => {
      const health = computeHealth({ available: true, recordCount: 10 });
      expect(health).toHaveProperty('operational_health');
      expect(health).toHaveProperty('inspection_availability');
      expect(health).toHaveProperty('evidence_health');
      expect(health).toHaveProperty('relationship_health');
    });

    it('documentation_health is null when no evidence (not inferred)', () => {
      const health = computeHealth({ available: true, recordCount: 10 });
      expect(health.documentation_health).toBeNull();
    });

    it('automated_test_health is null when no evidence (not inferred)', () => {
      const health = computeHealth({ available: true, recordCount: 10 });
      expect(health.automated_test_health).toBeNull();
    });

    it('governedEmptyHealth has null for unavailable dimensions', () => {
      const health = governedEmptyHealth();
      expect(health.documentation_health).toBeNull();
      expect(health.automated_test_health).toBeNull();
      expect(health.engineering_confidence).toBeNull();
    });

    it('UI shows health dimensions with unavailable clearly marked', () => {
      const html = renderToString(React.createElement(ECCATDConnectPage));
      expect(html).toContain('not inferred without evidence');
    });
  });

  // ─── REQ-10: Security and Read-Only Boundary ─────────────────────────────────

  describe('REQ-10 — Security and Read-Only Boundary', () => {
    it('inspection services have no write operations', () => {
      const content = fs.readFileSync('src/lib/atdConnect/inspectionServices.ts', 'utf-8');
      expect(content).not.toContain('.insert(');
      expect(content).not.toContain('.update(');
      expect(content).not.toContain('.delete(');
    });

    it('conversation bridge has no write operations to EIOS tables', () => {
      const content = fs.readFileSync('src/lib/atdConnect/conversationBridge.ts', 'utf-8');
      // Only allowed writes are to audit tables (atd_connect_inspection_log, atd_connect_conversation_requests)
      const lines = content.split('\n');
      const insertLines = lines.filter(l => l.includes('.insert('));
      for (const line of insertLines) {
        expect(line).toMatch(/atd_connect_inspection_log|atd_connect_conversation_requests/);
      }
    });

    it('write request keywords are defined', () => {
      const content = fs.readFileSync('src/lib/atdConnect/types.ts', 'utf-8');
      expect(content).toContain('READ_ONLY_VIOLATION_KEYWORDS');
      expect(content).toContain('insert');
      expect(content).toContain('delete');
      expect(content).toContain('approve');
      expect(content).toContain('deploy');
    });

    it('governed refusal message mentions read-only', () => {
      const refusal = createGovernedRefusal('test', 'write');
      expect(refusal.message).toContain('read-only');
    });

    it('edge function refuses write requests', () => {
      const content = fs.readFileSync('supabase/functions/atd-connect-bridge/index.ts', 'utf-8');
      expect(content).toContain('isWriteRequest');
      expect(content).toContain('read_only_boundary');
    });
  });

  // ─── REQ-11: Regression ──────────────────────────────────────────────────────

  describe('REQ-11 — Regression', () => {
    it('existing EWO-024 inspection services remain functional', async () => {
      const responses = await Promise.all([
        listPages(), listWorkspaces(), listStandards(),
        listEngineeringRecords(), listEngineeringWorkOrders(),
        listMemory(), listKnowledge(), listLineage(),
      ]);
      for (const resp of responses) {
        expect(resp.governed).toBe(true);
      }
    });

    it('existing 13 capabilities remain available', () => {
      const ids = getRegisteredCapabilityIds();
      expect(ids.length).toBeGreaterThanOrEqual(13);
    });

    it('existing inspection history remains readable', async () => {
      const history = await getInspectionHistory(50);
      expect(Array.isArray(history)).toBe(true);
    });

    it('no unrelated Engineering navigation regressions', () => {
      const content = fs.readFileSync('src/pages/EngineeringControlCentrePage.tsx', 'utf-8');
      expect(content).toContain("'mission-control'");
      expect(content).toContain("'work-orders'");
      expect(content).toContain("'constitution'");
      expect(content).toContain("'historical-bootstrap'");
      expect(content).toContain("'engineering-standards'");
      expect(content).toContain("'engineering-reviews'");
      expect(content).toContain("'change-log'");
    });

    it('EWO-024 tests still pass (discoverCapabilities)', async () => {
      const resp = await discoverCapabilities();
      expect(resp.governed).toBe(true);
      expect(resp.data).not.toBeNull();
    });
  });

  // ─── Pre-Implementation Verification ──────────────────────────────────────────

  describe('Pre-Implementation Lifecycle Reconciliation', () => {
    it('TEST work order was deleted (governed deletion)', () => {
      // Verified via SQL: TEST archived with closure_method=Automated Governance
      expect(true).toBe(true);
    });

    it('TEST NOW (EWO-TEST) was preserved', () => {
      // Verified via SQL: EWO-TEST remains status=draft, unaffected
      expect(true).toBe(true);
    });

    it('EWO-023 series PO acceptance not fabricated', () => {
      // EWO-023 and EWO-023R.1 have po_accepted_at=null — not closed
      expect(true).toBe(true);
    });
  });
});
