import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Archive, Search, FileText, Download, Filter,
  CheckCircle2, Clock, AlertCircle, BookOpen,
  Building2, GitBranch, Shield, ArrowUpDown,
  ChevronDown, X, AlertTriangle, Info, Brain,
  Link2, Layers, ChevronRight, Tag, Cpu,
  History, Star, Lightbulb, TrendingUp,
  Network, Calendar, BarChart3, Package,
  FileCode, FileJson, Zap, Activity,
  Gavel, RefreshCw, Fingerprint, ArrowRight,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { EngineeringBreadcrumbs } from '../../components/ecc/EngineeringBreadcrumbs';
import { RelatedEngineeringPanel } from '../../components/ecc/RelatedEngineeringPanel';
import { pushNavHistory, saveNavContext } from '../../lib/engineeringNavigationService';
import {
  exportCompletionReport, exportExecutiveSummary,
  exportTechnicalReport, exportMarkdown,
  exportJson, exportEngineeringPackage,
} from './ECCRecordsLibraryExports';
import type {
  EngineeringRecord, MemoryEntry, LineageEntry,
  ActiveTab, SortKey, SortDir,
} from './ECCRecordsLibraryTypes';
import {
  TYPE_CFG, AUTHORITY_CFG, MEMORY_CATEGORY_CFG,
  LINEAGE_TYPE_CFG, KNOWLEDGE_DOMAINS,
} from './ECCRecordsLibraryTypes';
import { runCompletionGovernance } from '../../lib/completionGovernanceEngine';

// ─── Sub-components ───────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const cfg = TYPE_CFG[type];
  if (!cfg) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {cfg.label}
    </span>
  );
}

function AuthorityBadge({ state }: { state: string | null }) {
  const cfg = AUTHORITY_CFG[state ?? 'provisional'] ?? AUTHORITY_CFG.provisional;
  const Icon = state === 'authoritative' ? CheckCircle2
    : state === 'provisional' ? Clock
    : state === 'non_authoritative' ? AlertTriangle : Info;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <Icon size={10} />
      {cfg.label}
    </span>
  );
}

function GovernanceBadge({ status }: { status: string | null }) {
  if (!status || status === 'pending') return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border bg-slate-50 text-slate-500 border-slate-200">
      <Clock size={9} />Governance Pending
    </span>
  );
  if (status === 'running') return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border bg-blue-50 text-blue-600 border-blue-200">
      <RefreshCw size={9} className="animate-spin" />Governance Running
    </span>
  );
  if (status === 'complete') return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">
      <Gavel size={9} />Governance Complete
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border bg-red-50 text-red-600 border-red-200">
      <AlertTriangle size={9} />Governance Error
    </span>
  );
}

function SectionPanel({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-100 rounded-lg overflow-hidden">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left">
        <div className="flex items-center gap-2">
          <Icon size={12} className="text-slate-500" />
          <span className="text-xs font-semibold text-slate-700">{title}</span>
        </div>
        <ChevronDown size={12} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-4 py-3 bg-white text-xs text-slate-600 space-y-2">{children}</div>}
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (!items.length) return <span className="text-slate-400 italic">None recorded</span>;
  return (
    <ul className="space-y-1">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2">
          <span className="mt-1 w-1 h-1 rounded-full bg-slate-400 flex-shrink-0" />
          <span className="leading-relaxed">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function TagChips({ tags, colour = 'slate' }: { tags: string[]; colour?: string }) {
  if (!tags.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {tags.map(tag => (
        <span key={tag} className={`text-xs px-2 py-0.5 rounded-full bg-${colour}-50 text-${colour}-600 border border-${colour}-200`}>{tag}</span>
      ))}
    </div>
  );
}

function RatingPill({ label, value, colour }: { label: string; value: string; colour: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border bg-${colour}-50 text-${colour}-700 border-${colour}-200`}>
      <span className="font-medium">{label}:</span> {value}
    </span>
  );
}

// ─── Export menu ──────────────────────────────────────────────────────────────

function ExportMenu({ record }: { record: EngineeringRecord }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const options: { label: string; icon: React.ElementType; action: () => void; note?: string }[] = [
    { label: 'Completion Report (PDF)',  icon: FileText,  action: () => { exportCompletionReport(record); setOpen(false); } },
    { label: 'Executive Summary (PDF)',  icon: FileText,  action: () => { exportExecutiveSummary(record); setOpen(false); } },
    { label: 'Technical Report (PDF)',   icon: FileText,  action: () => { exportTechnicalReport(record); setOpen(false); } },
    { label: 'Markdown',                 icon: FileCode,  action: () => { exportMarkdown(record); setOpen(false); } },
    { label: 'JSON Record',              icon: FileJson,  action: () => { exportJson(record); setOpen(false); } },
    { label: 'Engineering Package',      icon: Package,   action: () => { exportEngineeringPackage(record); setOpen(false); }, note: 'JSON manifest' },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-lg transition-colors"
      >
        <Download size={12} />
        Export
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
          {options.map(opt => (
            <button
              key={opt.label}
              onClick={opt.action}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-xs text-slate-700 hover:bg-slate-50 transition-colors text-left"
            >
              <opt.icon size={13} className="text-slate-400 flex-shrink-0" />
              <span className="flex-1">{opt.label}</span>
              {opt.note && <span className="text-slate-400">{opt.note}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Record Card ──────────────────────────────────────────────────────────────

function RecordCard({ record, onRefresh }: { record: EngineeringRecord; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [govRunning, setGovRunning] = useState(false);
  const [govError, setGovError] = useState<string | null>(null);
  const isNonAuth = record.authority_state === 'non_authoritative' || record.authority_state === 'superseded';
  const summary = record.implementation_summary?.executive_summary ?? (record.content?.executive_summary as string | undefined);
  const hasStructured = !!(record.engineering_objective || record.implementation_summary || record.validation_summary || record.engineering_knowledge);
  const relCount = [
    ...(record.relationships?.related_ewos ?? []),
    ...(record.relationships?.related_features ?? []),
    ...(record.relationships?.related_standards ?? []),
    ...(record.relationships?.related_constitutional_decisions ?? []),
  ].length;

  const canRunGovernance = record.authority_state === 'authoritative'
    && (record.governance_status === 'pending' || record.governance_status === null || record.governance_status === 'error');

  async function handleRunGovernance() {
    setGovRunning(true);
    setGovError(null);
    try {
      const result = await runCompletionGovernance(record.id, {
        acceptedBy: record.po_accepted_by ?? 'Product Owner',
        statement: record.po_acceptance_statement ?? 'Product Owner Accepted — Engineering Completion Governance Engine initiated.',
      });
      if (!result.success) setGovError(result.error ?? 'Governance failed');
      else onRefresh();
    } catch (err) {
      setGovError(err instanceof Error ? err.message : String(err));
    } finally {
      setGovRunning(false);
    }
  }

  const exportCount = [record.exports_generated].filter(Boolean).length
    + (record.export_urls ? Object.keys(record.export_urls).length : 0);

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${isNonAuth ? 'border-red-200 bg-red-50/20 opacity-60' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'}`}>
      <div className="flex items-start gap-4 px-5 py-4">
        <div className="flex-shrink-0 pt-0.5">
          <span className={`text-xs font-mono font-bold ${isNonAuth ? 'text-red-400' : 'text-slate-500'}`}>{record.record_ref}</span>
          <div className="text-xs text-slate-400 mt-0.5">v{record.record_version}</div>
          {record.is_backfill && (
            <span className="mt-1 inline-flex items-center text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200">Backfill</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <TypeBadge type={record.record_type} />
            <AuthorityBadge state={record.authority_state} />
            {!isNonAuth && <GovernanceBadge status={record.governance_status ?? null} />}
            {record.engineering_memory_extracted && (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">
                <Brain size={9} />Memory
              </span>
            )}
            {record.exports_generated && (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
                <Package size={9} />Exports
              </span>
            )}
            {record.lineage_established && (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                <Network size={9} />Lineage
              </span>
            )}
            {relCount > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
                <Link2 size={9} />{relCount}
              </span>
            )}
          </div>

          <p className={`text-sm font-semibold leading-snug ${isNonAuth ? 'text-red-700 line-through decoration-red-400' : 'text-slate-800'}`}>
            {record.title}
          </p>

          <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
            <span className="flex items-center gap-1"><Building2 size={10} />{record.programme}</span>
            {record.ewo_ref && <span className="flex items-center gap-1"><GitBranch size={10} />{record.ewo_ref}</span>}
            {record.completion_date && <span className="flex items-center gap-1"><Clock size={10} />{new Date(record.completion_date).toLocaleDateString()}</span>}
            {record.primary_engineer && <span className="flex items-center gap-1"><Cpu size={10} />{record.primary_engineer}</span>}
          </div>

          {isNonAuth && record.correction_reason && (
            <p className="text-xs text-red-600 mt-1.5">
              <span className="font-semibold">Correction: </span>
              {record.correction_reason.slice(0, 120)}{record.correction_reason.length > 120 ? '…' : ''}
            </p>
          )}
          {!isNonAuth && record.source_evidence && (
            <p className="text-xs text-emerald-700 mt-1 flex items-center gap-1">
              <CheckCircle2 size={10} />
              <span className="truncate">{record.source_evidence.slice(0, 90)}{record.source_evidence.length > 90 ? '…' : ''}</span>
            </p>
          )}

          {/* Enrichment pills */}
          {!isNonAuth && (record.complexity || record.risk_rating || record.confidence) && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {record.complexity && <RatingPill label="Complexity" value={record.complexity} colour={record.complexity === 'critical' ? 'red' : record.complexity === 'high' ? 'orange' : record.complexity === 'medium' ? 'amber' : 'emerald'} />}
              {record.risk_rating && <RatingPill label="Risk" value={record.risk_rating} colour={record.risk_rating === 'critical' ? 'red' : record.risk_rating === 'high' ? 'orange' : record.risk_rating === 'medium' ? 'amber' : 'emerald'} />}
              {record.confidence && <RatingPill label="Confidence" value={record.confidence} colour={record.confidence === 'high' ? 'emerald' : record.confidence === 'medium' ? 'amber' : 'slate'} />}
            </div>
          )}

          {record.semantic_metadata?.keywords && record.semantic_metadata.keywords.length > 0 && (
            <TagChips tags={record.semantic_metadata.keywords.slice(0, 5)} colour="slate" />
          )}

          {/* PO Acceptance trigger */}
          {!isNonAuth && canRunGovernance && (
            <div className="mt-2">
              <button
                onClick={handleRunGovernance}
                disabled={govRunning}
                className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {govRunning ? <RefreshCw size={11} className="animate-spin" /> : <Gavel size={11} />}
                {govRunning ? 'Running Governance…' : 'Run Completion Governance'}
              </button>
              {govError && <p className="text-xs text-red-600 mt-1">{govError}</p>}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {(hasStructured || summary) && (
            <button onClick={() => setExpanded(e => !e)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              <ChevronDown size={14} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
          )}
          {!isNonAuth && <ExportMenu record={record} />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-4 space-y-3">
          {summary && (
            <div className="text-xs text-slate-600 leading-relaxed bg-white rounded-lg p-3 border border-slate-100">{summary}</div>
          )}
          {record.engineering_objective && (
            <SectionPanel title="Engineering Objective" icon={TrendingUp}>
              {record.engineering_objective.original_objective && <div>{record.engineering_objective.original_objective}</div>}
              {record.engineering_objective.business_outcome && <div><span className="font-semibold text-slate-700">Business Outcome: </span>{record.engineering_objective.business_outcome}</div>}
              {record.engineering_objective.scope && <div><span className="font-semibold text-slate-700">Scope: </span>{record.engineering_objective.scope}</div>}
            </SectionPanel>
          )}
          {record.implementation_summary && (
            <SectionPanel title="Implementation Summary" icon={FileText}>
              {record.implementation_summary.files_created?.length ? <div><div className="font-semibold text-slate-700 mb-1">Files Created</div><BulletList items={record.implementation_summary.files_created} /></div> : null}
              {record.implementation_summary.files_modified?.length ? <div><div className="font-semibold text-slate-700 mb-1">Files Modified</div><BulletList items={record.implementation_summary.files_modified} /></div> : null}
              {record.implementation_summary.database_changes?.length ? <div><div className="font-semibold text-slate-700 mb-1">Database Changes</div><BulletList items={record.implementation_summary.database_changes} /></div> : null}
            </SectionPanel>
          )}
          {record.validation_summary && (
            <SectionPanel title="Validation" icon={CheckCircle2}>
              {record.validation_summary.build_result && <div className="flex items-center gap-2"><span className="font-semibold text-slate-700">Build:</span><span className={record.validation_summary.build_result === 'PASSED' ? 'text-emerald-600 font-medium' : 'text-red-600 font-medium'}>{record.validation_summary.build_result}</span></div>}
              {record.validation_summary.test_result && <div className="flex items-center gap-2"><span className="font-semibold text-slate-700">Tests:</span><span className={record.validation_summary.test_result.includes('PASS') ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>{record.validation_summary.test_result}</span></div>}
              {record.validation_summary.constitutional_validation && <div><span className="font-semibold text-slate-700">Constitutional: </span>{record.validation_summary.constitutional_validation}</div>}
            </SectionPanel>
          )}
          {record.engineering_knowledge && (
            <SectionPanel title="Engineering Knowledge" icon={Brain}>
              {record.engineering_knowledge.lessons_learned?.length ? <div><div className="font-semibold text-slate-700 mb-1">Lessons Learned</div><BulletList items={record.engineering_knowledge.lessons_learned} /></div> : null}
              {record.engineering_knowledge.architectural_decisions?.length ? <div><div className="font-semibold text-slate-700 mb-1">Architectural Decisions</div><BulletList items={record.engineering_knowledge.architectural_decisions} /></div> : null}
              {record.engineering_knowledge.future_recommendations?.length ? <div><div className="font-semibold text-violet-700 mb-1">Future Recommendations</div><BulletList items={record.engineering_knowledge.future_recommendations} /></div> : null}
            </SectionPanel>
          )}
          {record.relationships && Object.values(record.relationships).some(v => Array.isArray(v) && v.length > 0) && (
            <SectionPanel title="Relationships" icon={Link2}>
              {record.relationships.related_ewos?.length ? <div><span className="font-semibold text-slate-700">EWOs: </span>{record.relationships.related_ewos.join(', ')}</div> : null}
              {record.relationships.related_constitutional_decisions?.length ? <div><span className="font-semibold text-slate-700">Decisions: </span>{record.relationships.related_constitutional_decisions.join(', ')}</div> : null}
              {record.relationships.related_standards?.length ? <div><span className="font-semibold text-slate-700">Standards: </span>{record.relationships.related_standards.join(', ')}</div> : null}
            </SectionPanel>
          )}
          {record.semantic_metadata && (
            <SectionPanel title="Semantic Metadata" icon={Tag}>
              {record.semantic_metadata.keywords?.length ? <div><div className="font-semibold text-slate-700 mb-1">Keywords</div><TagChips tags={record.semantic_metadata.keywords} colour="slate" /></div> : null}
              {record.semantic_metadata.engineering_domains?.length ? <div><div className="font-semibold text-slate-700 mb-1">Domains</div><TagChips tags={record.semantic_metadata.engineering_domains} colour="blue" /></div> : null}
              {record.semantic_metadata.subsystems?.length ? <div><div className="font-semibold text-slate-700 mb-1">Subsystems</div><TagChips tags={record.semantic_metadata.subsystems} colour="teal" /></div> : null}
            </SectionPanel>
          )}
          {record.technologies?.length && (
            <SectionPanel title="Technologies & Enrichment" icon={Cpu}>
              {record.technologies.length ? <div><span className="font-semibold text-slate-700">Technologies: </span>{record.technologies.join(', ')}</div> : null}
              {record.subsystems_affected?.length ? <div><span className="font-semibold text-slate-700">Subsystems: </span>{record.subsystems_affected.join(', ')}</div> : null}
              {record.applications_affected?.length ? <div><span className="font-semibold text-slate-700">Applications: </span>{record.applications_affected.join(', ')}</div> : null}
              {record.engineering_disciplines?.length ? <div><span className="font-semibold text-slate-700">Disciplines: </span>{record.engineering_disciplines.join(', ')}</div> : null}
            </SectionPanel>
          ) || null}
          {(record.po_accepted_at || record.po_acceptance_statement) && (
            <SectionPanel title="Product Owner Acceptance" icon={Star}>
              <div className="flex items-center gap-2"><CheckCircle2 size={12} className="text-emerald-500" /><span className="font-semibold text-emerald-700">Accepted</span>{record.po_accepted_at && <span className="text-slate-500">{new Date(record.po_accepted_at).toLocaleDateString()}</span>}</div>
              {record.po_accepted_by && <div><span className="font-semibold text-slate-700">By: </span>{record.po_accepted_by}</div>}
              {record.po_acceptance_statement && <div className="italic text-slate-600">"{record.po_acceptance_statement}"</div>}
            </SectionPanel>
          )}
          {/* Governance panel */}
          {record.governance_status === 'complete' && (
            <SectionPanel title="Completion Governance" icon={Gavel}>
              <div className="space-y-1">
                {([
                  { label: 'Record Ratified', done: true },
                  { label: 'Memory Extracted',  done: record.knowledge_extracted },
                  { label: 'Exports Generated', done: record.exports_generated },
                  { label: 'Lineage Established', done: record.lineage_established },
                ] as { label: string; done: boolean }[]).map(({ label, done }) => (
                  <div key={label} className="flex items-center gap-2">
                    {done
                      ? <CheckCircle2 size={11} className="text-emerald-500 flex-shrink-0" />
                      : <AlertCircle size={11} className="text-slate-300 flex-shrink-0" />}
                    <span className={done ? 'text-emerald-700 font-medium' : 'text-slate-400'}>{label}</span>
                  </div>
                ))}
                {record.completion_report_ref && (
                  <div className="mt-2 pt-2 border-t border-slate-100">
                    <span className="text-slate-500">Completion Report Ref: </span>
                    <span className="font-mono text-slate-700">{record.completion_report_ref}</span>
                  </div>
                )}
              </div>
            </SectionPanel>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Memory Card ──────────────────────────────────────────────────────────────

function MemoryCard({ entry }: { entry: MemoryEntry }) {
  const cfg = MEMORY_CATEGORY_CFG[entry.knowledge_category] ?? { label: entry.knowledge_category, colour: 'slate' };
  const Icon = entry.knowledge_category === 'architecture' ? Cpu
    : entry.knowledge_category === 'pattern' ? TrendingUp
    : entry.knowledge_category === 'lesson_learned' ? Lightbulb
    : entry.knowledge_category === 'anti_pattern' ? AlertTriangle
    : entry.knowledge_category === 'known_risk' ? Shield
    : entry.knowledge_category === 'engineering_decision' ? BookOpen
    : entry.knowledge_category === 'validation_outcome' ? CheckCircle2
    : Brain;

  return (
    <div className="border border-slate-200 bg-white rounded-xl p-4 hover:border-slate-300 hover:shadow-sm transition-all">
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 w-8 h-8 rounded-lg bg-${cfg.colour}-50 border border-${cfg.colour}-200 flex items-center justify-center`}>
          <Icon size={14} className={`text-${cfg.colour}-600`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full bg-${cfg.colour}-50 text-${cfg.colour}-700 border border-${cfg.colour}-200`}>{cfg.label}</span>
            <span className="text-xs font-mono text-slate-400">{entry.record_ref}</span>
            {entry.knowledge_domain && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">{entry.knowledge_domain}</span>
            )}
          </div>
          <p className="text-sm font-semibold text-slate-800 mb-1">{entry.title}</p>
          <p className="text-xs text-slate-500 leading-relaxed">{entry.content}</p>
          {entry.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {entry.tags.map(tag => <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-mono">{tag}</span>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Lineage Card ─────────────────────────────────────────────────────────────

function LineageCard({ entry }: { entry: LineageEntry }) {
  const cfg = LINEAGE_TYPE_CFG[entry.relationship_type] ?? { label: entry.relationship_type, colour: 'slate' };
  return (
    <div className="border border-slate-200 bg-white rounded-xl p-4 hover:border-slate-300 transition-colors">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-mono font-bold text-slate-500">{entry.from_record_ref}</span>
        <ChevronRight size={12} className="text-slate-300" />
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full bg-${cfg.colour}-50 text-${cfg.colour}-700 border border-${cfg.colour}-200`}>{cfg.label}</span>
        <ChevronRight size={12} className="text-slate-300" />
        <span className="text-xs font-mono font-bold text-slate-700">{entry.to_ref}</span>
        <span className="ml-auto text-xs text-slate-400">{new Date(entry.created_at).toLocaleDateString()}</span>
      </div>
      {entry.notes && <p className="text-xs text-slate-500 mt-2 leading-relaxed">{entry.notes}</p>}
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ records, memory, lineage, onRefresh }: { records: EngineeringRecord[]; memory: MemoryEntry[]; lineage: LineageEntry[]; onRefresh: () => void }) {
  const auth = records.filter(r => r.authority_state === 'authoritative');
  const constitutional = records.filter(r => r.record_type === 'constitutional_document' && r.authority_state !== 'non_authoritative');
  const withMemory = records.filter(r => r.engineering_memory_extracted);
  const govComplete = auth.filter(r => r.governance_status === 'complete').length;
  const govPending  = auth.filter(r => !r.governance_status || r.governance_status === 'pending').length;
  const backfill    = records.filter(r => r.is_backfill).length;

  const categoryCounts = memory.reduce<Record<string, number>>((acc, e) => {
    acc[e.knowledge_category] = (acc[e.knowledge_category] ?? 0) + 1;
    return acc;
  }, {});
  const domainCounts = memory.reduce<Record<string, number>>((acc, e) => {
    if (e.knowledge_domain) acc[e.knowledge_domain] = (acc[e.knowledge_domain] ?? 0) + 1;
    return acc;
  }, {});
  const topDomains = Object.entries(domainCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const recentRecords = auth.slice(0, 5);
  const recentMemory = memory.slice(0, 4);

  const architectureDecisions = memory.filter(m => m.knowledge_category === 'architecture').length;
  const patterns = memory.filter(m => m.knowledge_category === 'pattern').length;
  const risks = memory.filter(m => m.knowledge_category === 'known_risk').length;
  const lessons = memory.filter(m => m.knowledge_category === 'lesson_learned').length;

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Engineering Records', value: auth.length, sub: `${records.filter(r => r.authority_state === 'provisional').length} provisional`, colour: 'slate', icon: Archive },
          { label: 'Constitutional Docs', value: constitutional.length, sub: 'Ratified', colour: 'rose', icon: Shield },
          { label: 'Knowledge Entries', value: memory.length, sub: `${withMemory.length} records mined`, colour: 'violet', icon: Brain },
          { label: 'Lineage Links', value: lineage.length, sub: `${new Set(lineage.map(l => l.from_record_ref)).size} records linked`, colour: 'blue', icon: Network },
        ].map(({ label, value, sub, colour, icon: Icon }) => (
          <div key={label} className={`bg-${colour}-50 border border-${colour}-100 rounded-xl p-4`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs font-medium text-${colour}-600`}>{label}</span>
              <Icon size={14} className={`text-${colour}-400`} />
            </div>
            <p className={`text-2xl font-bold text-${colour}-700`}>{value}</p>
            <p className={`text-xs text-${colour}-500 mt-0.5`}>{sub}</p>
          </div>
        ))}
      </div>

      {/* Governance metrics */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <Gavel size={14} className="text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-800">Completion Governance Status</h3>
          {govPending > 0 && (
            <span className="ml-auto text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">{govPending} pending</span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Governance Complete', value: govComplete, colour: 'emerald', icon: CheckCircle2 },
            { label: 'Governance Pending',  value: govPending,  colour: 'amber',   icon: Clock        },
            { label: 'Backfill Records',    value: backfill,    colour: 'slate',   icon: History      },
          ].map(({ label, value, colour, icon: Icon }) => (
            <div key={label} className={`bg-${colour}-50 border border-${colour}-100 rounded-lg p-3`}>
              <div className="flex items-center gap-1.5 mb-1">
                <Icon size={11} className={`text-${colour}-500`} />
                <span className={`text-xs text-${colour}-600`}>{label}</span>
              </div>
              <p className={`text-xl font-bold text-${colour}-700`}>{value}</p>
            </div>
          ))}
        </div>
        {auth.length > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-500">Governance coverage</span>
              <span className="text-xs font-semibold text-slate-700">{auth.length > 0 ? Math.round((govComplete / auth.length) * 100) : 0}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${auth.length > 0 ? (govComplete / auth.length) * 100 : 0}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Knowledge breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Category distribution */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <Brain size={14} className="text-violet-500" />
            <h3 className="text-sm font-semibold text-slate-800">Knowledge Categories</h3>
          </div>
          <div className="space-y-2">
            {Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]).map(([cat, count]) => {
              const cfg = MEMORY_CATEGORY_CFG[cat] ?? { label: cat, colour: 'slate' };
              const pct = memory.length ? Math.round((count / memory.length) * 100) : 0;
              return (
                <div key={cat}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-600">{cfg.label}</span>
                    <span className="text-xs font-semibold text-slate-700">{count}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full bg-${cfg.colour}-400 rounded-full`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            {memory.length === 0 && <p className="text-xs text-slate-400 italic">No knowledge entries yet</p>}
          </div>
        </div>

        {/* Domain distribution */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <Tag size={14} className="text-blue-500" />
            <h3 className="text-sm font-semibold text-slate-800">Knowledge Domains</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {topDomains.map(([domain, count]) => (
              <div key={domain} className="flex items-center gap-1.5 bg-blue-50 border border-blue-100 rounded-lg px-2.5 py-1.5">
                <span className="text-xs font-medium text-blue-700">{domain}</span>
                <span className="text-xs text-blue-400 font-semibold">{count}</span>
              </div>
            ))}
            {topDomains.length === 0 && <p className="text-xs text-slate-400 italic">No domains assigned yet</p>}
          </div>
        </div>
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Architecture Decisions', value: architectureDecisions, colour: 'blue' },
          { label: 'Patterns',               value: patterns,              colour: 'violet' },
          { label: 'Lessons Learned',        value: lessons,               colour: 'amber' },
          { label: 'Known Risks',            value: risks,                 colour: 'orange' },
        ].map(({ label, value, colour }) => (
          <div key={label} className={`bg-${colour}-50 border border-${colour}-100 rounded-xl p-3 text-center`}>
            <p className={`text-xl font-bold text-${colour}-700`}>{value}</p>
            <p className={`text-xs text-${colour}-600 mt-0.5`}>{label}</p>
          </div>
        ))}
      </div>

      {/* Recent records + recent memory side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity size={14} className="text-emerald-500" />
            <h3 className="text-sm font-semibold text-slate-800">Recent Engineering Records</h3>
          </div>
          <div className="space-y-2">
            {recentRecords.map(r => (
              <div key={r.id} className="flex items-start gap-3 py-2 border-b border-slate-50 last:border-0">
                <span className="text-xs font-mono text-slate-400 flex-shrink-0 pt-0.5">{r.record_ref}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700 truncate">{r.title}</p>
                  {r.completion_date && <p className="text-xs text-slate-400">{new Date(r.completion_date).toLocaleDateString()}</p>}
                </div>
              </div>
            ))}
            {recentRecords.length === 0 && <p className="text-xs text-slate-400 italic">No authoritative records yet</p>}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Brain size={14} className="text-violet-500" />
            <h3 className="text-sm font-semibold text-slate-800">Recent Knowledge Entries</h3>
          </div>
          <div className="space-y-2">
            {recentMemory.map(e => {
              const cfg = MEMORY_CATEGORY_CFG[e.knowledge_category] ?? { label: e.knowledge_category, colour: 'slate' };
              return (
                <div key={e.id} className="flex items-start gap-2 py-2 border-b border-slate-50 last:border-0">
                  <span className={`text-xs px-1.5 py-0.5 rounded bg-${cfg.colour}-50 text-${cfg.colour}-700 flex-shrink-0`}>{cfg.label.split(' ')[0]}</span>
                  <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">{e.title}</p>
                </div>
              );
            })}
            {recentMemory.length === 0 && <p className="text-xs text-slate-400 italic">No knowledge entries yet</p>}
          </div>
        </div>
      </div>

      {/* Future Architecture */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Cpu size={14} className="text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-700">Engineering Memory — Future Architecture</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {[
            { name: 'Overview', status: 'live' },
            { name: 'Records', status: 'live' },
            { name: 'Knowledge', status: 'live' },
            { name: 'Lineage', status: 'live' },
            { name: 'Timeline', status: 'live' },
            { name: 'Search', status: 'live' },
            { name: 'Analytics', status: 'planned' },
            { name: 'Constitution', status: 'planned' },
          ].map(({ name, status }) => (
            <div key={name} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${status === 'live' ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-100 border-slate-200'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${status === 'live' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
              <span className={status === 'live' ? 'text-emerald-700 font-medium' : 'text-slate-500'}>{name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Timeline Tab ─────────────────────────────────────────────────────────────

function TimelineTab({ records }: { records: EngineeringRecord[] }) {
  const [filterProduct, setFilterProduct] = useState('all');
  const [filterType, setFilterType] = useState('all');

  const auth = records.filter(r => r.authority_state !== 'non_authoritative');
  const allProducts = [...new Set(auth.flatMap(r => r.applications_affected ?? []))].sort();

  const filtered = auth.filter(r => {
    if (filterProduct !== 'all' && !(r.applications_affected ?? []).includes(filterProduct)) return false;
    if (filterType !== 'all' && r.record_type !== filterType) return false;
    return true;
  }).sort((a, b) => {
    const da = a.completion_date ?? a.created_at;
    const db = b.completion_date ?? b.created_at;
    return db.localeCompare(da);
  });

  // Group by year-month
  const grouped = filtered.reduce<Record<string, EngineeringRecord[]>>((acc, r) => {
    const d = r.completion_date ?? r.created_at;
    const key = d ? new Date(d).toLocaleDateString('en-AU', { year: 'numeric', month: 'long' }) : 'Undated';
    (acc[key] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <Calendar size={15} className="text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-blue-900">Engineering Timeline</p>
          <p className="text-xs text-blue-700 mt-0.5">Chronological view of all accepted engineering work. Each entry links to its canonical Engineering Record.</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <select value={filterProduct} onChange={e => setFilterProduct(e.target.value)} className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer">
          <option value="all">All Products</option>
          {allProducts.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer">
          <option value="all">All Types</option>
          {Object.entries(TYPE_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="text-xs text-slate-400 self-center ml-auto">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Timeline entries */}
      {Object.keys(grouped).length === 0 ? (
        <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl">
          <Calendar size={28} className="text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-500">No timeline entries match your filters</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([period, periodRecords]) => (
            <div key={period}>
              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-slate-800 border-2 border-white shadow-sm" />
                  <h3 className="text-sm font-bold text-slate-700">{period}</h3>
                </div>
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs text-slate-400">{periodRecords.length} record{periodRecords.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="ml-1 pl-5 border-l-2 border-slate-200 space-y-3">
                {periodRecords.map(r => (
                  <div key={r.id} className="relative">
                    <div className="absolute -left-[1.4rem] top-3 w-2.5 h-2.5 rounded-full border-2 border-white shadow-sm" style={{ background: r.record_type === 'constitutional_document' ? '#f43f5e' : r.record_type === 'completion_report' ? '#10b981' : r.record_type === 'decision_record' ? '#f59e0b' : '#3b82f6' }} />
                    <div className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-xs font-mono text-slate-400">{r.record_ref}</span>
                            <TypeBadge type={r.record_type} />
                            <AuthorityBadge state={r.authority_state} />
                          </div>
                          <p className="text-sm font-semibold text-slate-800">{r.title}</p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                            <span className="flex items-center gap-1"><Building2 size={10} />{r.programme}</span>
                            {r.ewo_ref && <span className="flex items-center gap-1"><GitBranch size={10} />{r.ewo_ref}</span>}
                            {r.completion_date && <span className="flex items-center gap-1"><Calendar size={10} />{new Date(r.completion_date).toLocaleDateString()}</span>}
                          </div>
                          {(r.complexity || r.risk_rating) && (
                            <div className="flex gap-1.5 mt-1.5">
                              {r.complexity && <RatingPill label="Complexity" value={r.complexity} colour={r.complexity === 'critical' ? 'red' : r.complexity === 'high' ? 'orange' : r.complexity === 'medium' ? 'amber' : 'emerald'} />}
                              {r.risk_rating && <RatingPill label="Risk" value={r.risk_rating} colour={r.risk_rating === 'high' || r.risk_rating === 'critical' ? 'red' : r.risk_rating === 'medium' ? 'amber' : 'emerald'} />}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ECCRecordsLibraryPage({ objectRef }: { objectRef?: string } = {}) {
  const [records, setRecords] = useState<EngineeringRecord[]>([]);
  const [memory, setMemory] = useState<MemoryEntry[]>([]);
  const [lineage, setLineage] = useState<LineageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');

  // Records tab state
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterAuthority, setFilterAuthority] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('completion_date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Memory tab state
  const [memSearch, setMemSearch] = useState('');
  const [memCategory, setMemCategory] = useState('all');
  const [memDomain, setMemDomain] = useState('all');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [recRes, memRes, linRes] = await Promise.all([
      supabase.from('engineering_records_library').select('*').order('completion_date', { ascending: false }),
      supabase.from('engineering_memory').select('*').order('created_at', { ascending: false }),
      supabase.from('engineering_record_lineage').select('*').order('created_at', { ascending: false }),
    ]);
    if (recRes.error) setError(recRes.error.message);
    else if (recRes.data) setRecords(recRes.data as EngineeringRecord[]);
    if (memRes.data) setMemory(memRes.data as MemoryEntry[]);
    if (linRes.data) setLineage(linRes.data as LineageEntry[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // EWO-014.13: Auto-select record from URL objectRef (direct object navigation)
  const [selectedRecord, setSelectedRecord] = useState<EngineeringRecord | null>(null);
  useEffect(() => {
    if (!objectRef || records.length === 0) return;
    if (selectedRecord?.record_ref === objectRef) return; // already selected — avoid loop
    const found = records.find(r => r.record_ref === objectRef);
    if (found) {
      setSelectedRecord(found);
      const slug = found.record_ref.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      const canonicalUrl = `#/engineering/records-library/${slug}`;
      if (window.location.hash !== canonicalUrl) {
        window.location.hash = canonicalUrl;
      }
      pushNavHistory({ object_ref: found.record_ref, object_type: 'engineering_record', title: found.title, canonical_url: canonicalUrl });
      saveNavContext({ object_ref: found.record_ref, object_type: 'engineering_record', section: 'records-library' });
    }
  }, [objectRef, records]);

  // EWO-014.13: Listen for cross-page navigation to a specific record
  useEffect(() => {
    const handler = () => {
      const targetRef = sessionStorage.getItem('ecc_selected_record_ref');
      if (!targetRef) return;
      const found = records.find(r => r.record_ref === targetRef);
      if (found) setSelectedRecord(found);
      sessionStorage.removeItem('ecc_selected_record_ref');
    };
    window.addEventListener('ecc:navigateToRecords', handler);
    return () => window.removeEventListener('ecc:navigateToRecords', handler);
  }, [records]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  const filteredRecords = records
    .filter(r => {
      if (filterType !== 'all' && r.record_type !== filterType) return false;
      if (filterAuthority !== 'all' && r.authority_state !== filterAuthority) return false;
      if (search) {
        const q = search.toLowerCase();
        const kw = r.semantic_metadata?.keywords?.join(' ') ?? '';
        const tech = (r.technologies ?? []).join(' ');
        const sub = (r.subsystems_affected ?? []).join(' ');
        const apps = (r.applications_affected ?? []).join(' ');
        return r.title.toLowerCase().includes(q)
          || r.record_ref.toLowerCase().includes(q)
          || (r.ewo_ref ?? '').toLowerCase().includes(q)
          || r.programme.toLowerCase().includes(q)
          || kw.toLowerCase().includes(q)
          || tech.toLowerCase().includes(q)
          || sub.toLowerCase().includes(q)
          || apps.toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => {
      let av = '', bv = '';
      if (sortKey === 'completion_date') { av = a.completion_date ?? ''; bv = b.completion_date ?? ''; }
      else if (sortKey === 'record_ref') { av = a.record_ref; bv = b.record_ref; }
      else if (sortKey === 'title') { av = a.title; bv = b.title; }
      else if (sortKey === 'record_type') { av = a.record_type; bv = b.record_type; }
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });

  const filteredMemory = memory.filter(e => {
    if (memCategory !== 'all' && e.knowledge_category !== memCategory) return false;
    if (memDomain !== 'all' && e.knowledge_domain !== memDomain) return false;
    if (memSearch) {
      const q = memSearch.toLowerCase();
      return e.title.toLowerCase().includes(q)
        || e.content.toLowerCase().includes(q)
        || e.record_ref.toLowerCase().includes(q)
        || e.tags.some(t => t.toLowerCase().includes(q))
        || (e.knowledge_domain ?? '').toLowerCase().includes(q);
    }
    return true;
  });

  const stats = {
    total:         records.filter(r => r.authority_state !== 'non_authoritative').length,
    authoritative: records.filter(r => r.authority_state === 'authoritative').length,
    memoryCount:   memory.length,
    lineageCount:  lineage.length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500">Loading engineering records…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle size={28} className="text-red-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-600">Failed to load records</p>
          <p className="text-xs text-slate-400 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  const TABS: { key: ActiveTab; label: string; icon: React.ElementType }[] = [
    { key: 'overview',  label: 'Overview',  icon: BarChart3  },
    { key: 'records',   label: 'Records',   icon: Archive    },
    { key: 'memory',    label: 'Memory',    icon: Brain      },
    { key: 'lineage',   label: 'Lineage',   icon: Network    },
    { key: 'timeline',  label: 'Timeline',  icon: Calendar   },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Sticky header */}
      <div className="flex-shrink-0 px-6 pt-6 pb-4 bg-white border-b border-slate-100">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Archive size={20} className="text-slate-600" />
              <h1 className="text-xl font-bold text-slate-900">Engineering Records</h1>
            </div>
            <p className="text-sm text-slate-500">Permanent engineering memory — canonical source of truth for all accepted engineering work</p>
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            { label: 'Records',   value: stats.total,         colour: 'slate',  tab: 'records'  as ActiveTab },
            { label: 'Auth',      value: stats.authoritative, colour: 'emerald', tab: 'records'  as ActiveTab },
            { label: 'Memory',    value: stats.memoryCount,   colour: 'violet', tab: 'memory'   as ActiveTab },
            { label: 'Lineage',   value: stats.lineageCount,  colour: 'blue',   tab: 'lineage'  as ActiveTab },
          ].map(({ label, value, colour, tab }) => (
            <button key={label} onClick={() => setActiveTab(tab)} className={`text-left px-3 py-2 rounded-lg border transition-all ${activeTab === tab ? `bg-${colour}-100 border-${colour}-300` : `bg-${colour}-50 border-${colour}-100 hover:border-${colour}-200`}`}>
              <p className={`text-lg font-bold text-${colour}-700`}>{value}</p>
              <p className={`text-xs text-${colour}-600`}>{label}</p>
            </button>
          ))}
        </div>

        {/* Tab navigation */}
        <div className="flex gap-0.5 bg-slate-100 p-1 rounded-xl w-fit">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setActiveTab(key)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeTab === key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-5">

          {/* ── Overview ─────────────────────────────────────────────────────── */}
          {activeTab === 'overview' && <OverviewTab records={records} memory={memory} lineage={lineage} onRefresh={fetchAll} />}

          {/* ── Records ──────────────────────────────────────────────────────── */}
          {activeTab === 'records' && (
            <div className="space-y-4">
              {/* Search + filters */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search by title, ref, EWO, keywords, technologies, subsystems…"
                    className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X size={14} /></button>}
                </div>
                <div className="flex gap-2">
                  <div className="relative">
                    <Filter size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <select value={filterType} onChange={e => setFilterType(e.target.value)} className="pl-8 pr-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer">
                      <option value="all">All Types</option>
                      {Object.entries(TYPE_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <select value={filterAuthority} onChange={e => setFilterAuthority(e.target.value)} className="px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer">
                    <option value="all">All Authority</option>
                    {Object.entries(AUTHORITY_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Sort bar */}
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <span className="mr-2">Sort:</span>
                {([['record_ref', 'Ref'], ['completion_date', 'Date'], ['record_type', 'Type'], ['title', 'Title']] as [SortKey, string][]).map(([key, label]) => (
                  <button key={key} onClick={() => handleSort(key)} className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border transition-colors ${sortKey === key ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-200 hover:border-slate-300 text-slate-600'}`}>
                    {label}<ArrowUpDown size={9} />
                  </button>
                ))}
                <span className="ml-auto text-slate-400">{filteredRecords.length} record{filteredRecords.length !== 1 ? 's' : ''}</span>
              </div>

              {/* Records */}
              {(() => {
                const auth = filteredRecords.filter(r => r.authority_state !== 'non_authoritative');
                const nonAuth = filteredRecords.filter(r => r.authority_state === 'non_authoritative');
                if (auth.length === 0 && nonAuth.length === 0) {
                  return (
                    <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl">
                      <Archive size={28} className="text-slate-300 mx-auto mb-2" />
                      <p className="text-sm font-medium text-slate-500">No records match your filters</p>
                      <button onClick={() => { setSearch(''); setFilterType('all'); setFilterAuthority('all'); }} className="text-xs text-blue-600 hover:text-blue-700 mt-2">Clear filters</button>
                    </div>
                  );
                }
                return (
                  <div className="space-y-6">
                    {auth.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <CheckCircle2 size={13} className="text-emerald-600" />
                          <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Engineering Records ({auth.length})</h3>
                        </div>
                        <div className="space-y-3">{auth.map(r => <RecordCard key={r.id} record={r} onRefresh={fetchAll} />)}</div>
                      </div>
                    )}
                    {nonAuth.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <AlertTriangle size={13} className="text-red-500" />
                          <h3 className="text-xs font-semibold text-red-600 uppercase tracking-wide">Non-Authoritative Dev Seeds ({nonAuth.length})</h3>
                          <span className="text-xs text-slate-400">— retained for audit lineage only</span>
                        </div>
                        <div className="space-y-2">{nonAuth.map(r => <RecordCard key={r.id} record={r} onRefresh={fetchAll} />)}</div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── Memory ───────────────────────────────────────────────────────── */}
          {activeTab === 'memory' && (
            <div className="space-y-4">
              <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 flex items-start gap-3">
                <Brain size={15} className="text-violet-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-violet-900">Engineering Memory</p>
                  <p className="text-xs text-violet-700 mt-0.5 leading-relaxed">Structured knowledge extracted from accepted Engineering Records. Future Engineering Intelligence will query this layer for "Have we solved this before?" and "Which patterns succeeded?"</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={memSearch}
                    onChange={e => setMemSearch(e.target.value)}
                    placeholder="Search knowledge entries, tags, domains…"
                    className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                  {memSearch && <button onClick={() => setMemSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X size={14} /></button>}
                </div>
                <select value={memCategory} onChange={e => setMemCategory(e.target.value)} className="px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-500 appearance-none cursor-pointer">
                  <option value="all">All Categories</option>
                  {Object.entries(MEMORY_CATEGORY_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <select value={memDomain} onChange={e => setMemDomain(e.target.value)} className="px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-500 appearance-none cursor-pointer">
                  <option value="all">All Domains</option>
                  {KNOWLEDGE_DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">{filteredMemory.length} entr{filteredMemory.length !== 1 ? 'ies' : 'y'}</span>
              </div>

              {filteredMemory.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl">
                  <Brain size={28} className="text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-medium text-slate-500">No knowledge entries match your filters</p>
                  <button onClick={() => { setMemSearch(''); setMemCategory('all'); setMemDomain('all'); }} className="text-xs text-violet-600 hover:text-violet-700 mt-2">Clear filters</button>
                </div>
              ) : (
                <div className="space-y-3">{filteredMemory.map(e => <MemoryCard key={e.id} entry={e} />)}</div>
              )}
            </div>
          )}

          {/* ── Lineage ───────────────────────────────────────────────────────── */}
          {activeTab === 'lineage' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
                <Network size={15} className="text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-blue-900">Engineering Lineage</p>
                  <p className="text-xs text-blue-700 mt-0.5 leading-relaxed">Explicit relationships between Engineering Records and engineering objects. Prepared for: Standards, Risks, Test Plans, Architecture Decisions, Releases, Roadmap Items, future EWOs.</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(LINEAGE_TYPE_CFG).map(([type, cfg]) => (
                  <span key={type} className={`text-xs px-2 py-0.5 rounded-full bg-${cfg.colour}-50 text-${cfg.colour}-700 border border-${cfg.colour}-200`}>{cfg.label}</span>
                ))}
              </div>
              <span className="text-xs text-slate-500 block">{lineage.length} link{lineage.length !== 1 ? 's' : ''}</span>
              {lineage.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl">
                  <Network size={28} className="text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-medium text-slate-500">No lineage links recorded</p>
                </div>
              ) : (
                <div className="space-y-3">{lineage.map(e => <LineageCard key={e.id} entry={e} />)}</div>
              )}
            </div>
          )}

          {/* ── Timeline ─────────────────────────────────────────────────────── */}
          {activeTab === 'timeline' && <TimelineTab records={records} />}

          {/* Append-only footer */}
          <div className="mt-6 bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-start gap-3">
            <Layers size={15} className="text-slate-500 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-slate-500 space-y-1">
              <p><span className="font-semibold text-slate-700">Append-only archive.</span> Engineering Records, Memory entries, and Lineage links are never deleted or modified. Amendments create new records with supersession links. Enforced at database level via RLS.</p>
              <p className="flex items-center gap-1.5 text-slate-400"><History size={10} />PDF exports are derived representations. The canonical source is always the structured Engineering Record. (CD-007-R1)</p>
            </div>
          </div>

        </div>
      </div>

      {/* EWO-014.13: Record detail overlay with breadcrumbs + related panel */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-6" onClick={() => { setSelectedRecord(null); if (window.location.hash.includes('/records-library/')) { window.location.hash = '#/engineering/records-library'; } }}>
          <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-3 border-b border-slate-200 bg-slate-50/50">
              <EngineeringBreadcrumbs objectRef={selectedRecord.record_ref} />
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="flex gap-6">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <Archive size={18} className="text-slate-600" />
                    <span className="text-sm font-mono text-slate-500">{selectedRecord.record_ref}</span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 mb-3">{selectedRecord.title}</h2>
                  {selectedRecord.ewo_ref && selectedRecord.record_ref !== selectedRecord.ewo_ref && (
                    <div className="mb-3 p-2.5 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2 text-xs text-blue-800">
                      <Fingerprint className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>This artefact forms part of the Engineering Identity for <span className="font-mono font-semibold">{selectedRecord.ewo_ref}</span>.</span>
                    </div>
                  )}
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <dt className="text-slate-500">Type</dt><dd className="text-slate-800">{selectedRecord.record_type}</dd>
                    <dt className="text-slate-500">Status</dt><dd className="text-slate-800">{selectedRecord.status}</dd>
                    <dt className="text-slate-500">Programme</dt><dd className="text-slate-800">{selectedRecord.programme || '—'}</dd>
                    <dt className="text-slate-500">EWO</dt><dd className="text-slate-800">{selectedRecord.ewo_ref || '—'}</dd>
                    <dt className="text-slate-500">Completion</dt><dd className="text-slate-800">{selectedRecord.completion_date || '—'}</dd>
                    <dt className="text-slate-500">Governance</dt><dd className="text-slate-800">{selectedRecord.governance_status}</dd>
                  </dl>
                  {selectedRecord.engineering_objective && (
                    <div className="mt-4">
                      <h3 className="text-sm font-semibold text-slate-700 mb-1">Engineering Objective</h3>
                      <pre className="text-xs text-slate-600 bg-slate-50 rounded-lg p-3 whitespace-pre-wrap">{JSON.stringify(selectedRecord.engineering_objective, null, 2)}</pre>
                    </div>
                  )}
                  {selectedRecord.implementation_summary && (
                    <div className="mt-4">
                      <h3 className="text-sm font-semibold text-slate-700 mb-1">Implementation Summary</h3>
                      <pre className="text-xs text-slate-600 bg-slate-50 rounded-lg p-3 whitespace-pre-wrap">{JSON.stringify(selectedRecord.implementation_summary, null, 2)}</pre>
                    </div>
                  )}
                </div>
                <div className="w-72 shrink-0">
                  <RelatedEngineeringPanel objectRef={selectedRecord.record_ref} />
                </div>
              </div>
            </div>
            <div className="px-6 py-3 border-t border-slate-200 flex justify-end">
              <button onClick={() => { setSelectedRecord(null); if (window.location.hash.includes('/records-library/')) { window.location.hash = '#/engineering/records-library'; } }} className="px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
