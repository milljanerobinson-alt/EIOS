import { useState, useEffect, useCallback } from 'react';
import {
  X, Loader2, AlertTriangle, CheckCircle2, Archive,
  FileText, ShieldCheck, Package as PackageIcon, User,
  Calendar, Database, Upload, Eye, AlertCircle, Info,
  Fingerprint, ArrowRight,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  type ReconciliationCandidate,
  detectImportCandidates,
  createIdentityMapping,
} from '../../lib/identityReconciliationService';
import { guardImplementationEntry } from '../../lib/ensureEngineeringWorkOrder';

export interface EngineeringProvenance {
  id: string;
  ewo_id: string;
  source: string;
  imported_at: string;
  imported_by: string | null;
  confidence_level: 'High' | 'Medium' | 'Low';
  confidence_score: number;
  evidence_available: EvidenceItem[];
  evidence_summary: string | null;
  historical_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EvidenceItem {
  type: string;
  available: boolean;
  weight: number;
  count?: number;
}

export interface EvidenceEnrichment {
  id: string;
  ewo_id: string;
  evidence_type: string;
  evidence_description: string | null;
  evidence_content: string | null;
  enriched_by: string;
  enriched_at: string;
}

export interface HistoricalImportRecord {
  id: string;
  imported_by: string;
  imported_at: string;
  import_source: string;
  ewo_refs: string[];
  objects_created: number;
  warnings: string[];
  summary: string | null;
}

interface PreviewRow {
  ewo_ref: string;
  title: string;
  executive_summary: string;
  engineering_objective: string;
  status: string;
  is_duplicate: boolean;
  duplicate_warning: string | null;
}

const EVIDENCE_TYPES = [
  'Engineering Record',
  'Engineering Plan',
  'Completion Report',
  'Implementation Evidence',
  'Verification Evidence',
  'Product Owner Acceptance',
  'Original Prompt',
  'Engineering Package',
  'Original Build Logs',
  'Original Test Evidence',
  'Original Implementation Package',
];

export function HistoricalImportWizard({ onClose, onImported }: {
  onClose: () => void;
  onImported: () => void;
}) {
  const [step, setStep] = useState<'input' | 'preview' | 'identity' | 'importing' | 'done'>('input');
  const [importSource, setImportSource] = useState('Historical Engineering Archive');
  const [importedBy, setImportedBy] = useState('Engineering Governance');
  const [rawInput, setRawInput] = useState('');
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importResults, setImportResults] = useState<{
    created: number;
    skipped: number;
    warnings: string[];
    refs: string[];
  } | null>(null);
  const [identityCandidates, setIdentityCandidates] = useState<ReconciliationCandidate[]>([]);
  const [identityAccepted, setIdentityAccepted] = useState<Set<number>>(new Set());

  function parseInput(input: string): PreviewRow[] {
    const lines = input.trim().split('\n').map(l => l.trim()).filter(Boolean);
    const rows: PreviewRow[] = [];
    for (const line of lines) {
      const parts = line.split('|').map(p => p.trim());
      if (parts.length < 4) throw new Error(`Each line needs: EWO-Ref | Title | Executive Summary | Engineering Objective (line: "${line.slice(0, 50)}…")`);
      const [ewo_ref, title, executive_summary, engineering_objective] = parts;
      rows.push({
        ewo_ref, title, executive_summary, engineering_objective,
        status: 'closed',
        is_duplicate: false,
        duplicate_warning: null,
      });
    }
    return rows;
  }

  async function checkDuplicates(rows: PreviewRow[]): Promise<PreviewRow[]> {
    const refs = rows.map(r => r.ewo_ref);
    const { data: existing } = await supabase
      .from('engineering_work_orders')
      .select('ewo_ref')
      .in('ewo_ref', refs);
    const existingRefs = new Set((existing || []).map(e => e.ewo_ref));
    return rows.map(r => ({
      ...r,
      is_duplicate: existingRefs.has(r.ewo_ref),
      duplicate_warning: existingRefs.has(r.ewo_ref) ? `Duplicate: ${r.ewo_ref} already exists in the Engineering Ledger` : null,
    }));
  }

  const handlePreview = useCallback(async () => {
    setParseError(null);
    try {
      const parsed = parseInput(rawInput);
      const checked = await checkDuplicates(parsed);
      setPreviewRows(checked);
      // Run identity reconciliation
      const refs = checked.map(r => r.ewo_ref);
      const candidates = await detectImportCandidates(refs);
      setIdentityCandidates(candidates);
      setStep('preview');
    } catch (err) {
      setParseError((err as Error).message);
    }
  }, [rawInput]);

  async function handleImport() {
    setStep('importing');
    const nonDupes = previewRows.filter(r => !r.is_duplicate);
    const warnings: string[] = [];
    const createdRefs: string[] = [];

    for (const row of nonDupes) {
      // Guard: ensure canonical EWO registration before historical import
      const guard = await guardImplementationEntry(row.ewo_ref, 'historicalImport', {
        title: row.title,
        executiveSummary: row.executive_summary,
      });
      if (!guard.success) {
        warnings.push(`Failed to register ${row.ewo_ref}: ${guard.error}`);
        continue;
      }

      const { data: ewoData, error: ewoErr } = await supabase
        .from('engineering_work_orders')
        .insert({
          ewo_ref: row.ewo_ref,
          title: row.title,
          executive_summary: row.executive_summary,
          engineering_objective: row.engineering_objective,
          status: 'closed',
          priority: 'medium',
          risk_level: 'low',
          closure_method: 'Historical Migration',
          closure_reason: 'Imported from historical engineering archive',
          is_historical_import: true,
          import_source: importSource,
          imported_at: new Date().toISOString(),
          imported_by: importedBy,
          historical_notes: 'Imported from historical engineering archive. Original implementation evidence was not preserved in the governed ledger.',
          closed_at: new Date().toISOString(),
          closed_by: importedBy,
          report_generation_status: 'not_expected',
        })
        .select('id')
        .single();

      if (ewoErr) {
        warnings.push(`Failed to import ${row.ewo_ref}: ${ewoErr.message}`);
        continue;
      }

      const ewoId = ewoData.id;
      createdRefs.push(row.ewo_ref);

      const { data: confidence } = await supabase.rpc('calculate_ewo_confidence', { p_ewo_id: ewoId });

      await supabase.from('ewo_engineering_provenance').insert({
        ewo_id: ewoId,
        source: importSource,
        imported_at: new Date().toISOString(),
        imported_by: importedBy,
        confidence_level: (confidence as { level: string })?.level ?? 'Low',
        confidence_score: (confidence as { score: number })?.score ?? 0,
        evidence_available: (confidence as { evidence: EvidenceItem[] })?.evidence ?? [],
        evidence_summary: 'Historical record imported with available evidence. Missing evidence items are marked as unavailable.',
        historical_notes: 'Imported from historical engineering archive. Original implementation evidence was not preserved in the governed ledger.',
      });

      await supabase.from('ewo_lifecycle_events').insert({
        ewo_id: ewoId,
        from_status: null,
        to_status: 'closed',
        actor: importedBy,
        notes: `Historical Engineering Import: Imported from "${importSource}". This is a historical record — original lifecycle events were not preserved.`,
        metadata: { import_source: importSource, historical_import: true },
      });
    }

    const skipped = previewRows.filter(r => r.is_duplicate);
    if (skipped.length > 0) {
      warnings.push(`${skipped.length} duplicate(s) skipped: ${skipped.map(r => r.ewo_ref).join(', ')}`);
    }

    await supabase.from('ewo_historical_imports').insert({
      imported_by: importedBy,
      import_source: importSource,
      ewo_refs: createdRefs,
      objects_created: createdRefs.length,
      warnings,
      summary: `Imported ${createdRefs.length} historical EWO(s) from ${importSource}. ${skipped.length} duplicate(s) skipped.`,
    });

    setImportResults({
      created: createdRefs.length,
      skipped: skipped.length,
      warnings,
      refs: createdRefs,
    });
    setStep('done');
  }

  const dupes = previewRows.filter(r => r.is_duplicate);
  const importable = previewRows.filter(r => !r.is_duplicate);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center">
              <Archive className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Historical Engineering Import</h2>
              <p className="text-xs text-slate-400">Import historical work orders into the Engineering Ledger with provenance</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 'input' && (
            <div className="space-y-5">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex gap-3">
                <Info className="w-4.5 h-4.5 text-blue-600 shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800 space-y-1.5">
                  <p className="font-medium">Engineering Integrity Principle</p>
                  <p className="text-xs text-blue-700">Only import evidence that genuinely exists. Unknown information must remain unknown. Never invent implementation details, validation evidence, or timelines.</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Import Source</label>
                  <input className="input text-sm" value={importSource} onChange={e => setImportSource(e.target.value)} placeholder="e.g. Historical Engineering Archive" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Imported By</label>
                  <input className="input text-sm" value={importedBy} onChange={e => setImportedBy(e.target.value)} placeholder="e.g. Engineering Governance" />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                  Historical Work Orders (one per line)
                </label>
                <p className="text-xs text-slate-400 mb-2">
                  Format: <code className="text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">EWO-Ref | Title | Executive Summary | Engineering Objective</code>
                </p>
                <textarea
                  className="input text-sm font-mono resize-none"
                  rows={8}
                  value={rawInput}
                  onChange={e => setRawInput(e.target.value)}
                  placeholder={`EWO-100 | Historical Feature ABC | Executive summary of what was built | Engineering objective that was achieved\nEWO-101 | Legacy Platform Setup | Initial platform configuration | Establish core platform infrastructure`}
                />
                {parseError && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-red-600">
                    <AlertCircle className="w-3.5 h-3.5" /> {parseError}
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handlePreview}
                  disabled={!rawInput.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Eye className="w-4 h-4" /> Preview Import
                </button>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="px-2.5 py-1 bg-green-50 text-green-700 rounded-lg font-medium text-xs">{importable.length} to import</span>
                {dupes.length > 0 && (
                  <span className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-lg font-medium text-xs">{dupes.length} duplicates (will be skipped)</span>
                )}
              </div>

              <div className="space-y-2">
                {previewRows.map(row => (
                  <div key={row.ewo_ref} className={`p-3 rounded-xl border ${row.is_duplicate ? 'border-amber-200 bg-amber-50/50' : 'border-slate-200 bg-white'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-800">{row.ewo_ref}</span>
                          {row.is_duplicate ? (
                            <span className="flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                              <AlertTriangle className="w-3 h-3" /> Duplicate — will skip
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[10px] font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="w-3 h-3" /> Ready to import
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-700 mt-1">{row.title}</p>
                        <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{row.executive_summary}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2">
                <button onClick={() => setStep('input')} className="text-sm text-slate-500 hover:text-slate-700 font-medium">
                  ← Back to input
                </button>
                <button
                  onClick={() => setStep('identity')}
                  disabled={importable.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Fingerprint className="w-4 h-4" /> Review Identity Reconciliation
                </button>
              </div>
            </div>
          )}

          {step === 'identity' && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex gap-3">
                <Fingerprint className="w-4.5 h-4.5 text-blue-600 shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800 space-y-1.5">
                  <p className="font-medium">Identity Reconciliation Check</p>
                  <p className="text-xs text-blue-700">The reconciliation engine has detected the following identity relationships. Review each candidate before proceeding. Accepted mappings will be created as pending for PO review.</p>
                </div>
              </div>

              {identityCandidates.length === 0 ? (
                <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2 text-sm text-green-800">
                  <CheckCircle2 className="w-4.5 h-4.5 text-green-600" />
                  No identity conflicts detected. All references are new to the Engineering Ledger.
                </div>
              ) : (
                <div className="space-y-2">
                  {identityCandidates.map((c, i) => {
                    const accepted = identityAccepted.has(i);
                    return (
                      <div key={i} className={`p-3 rounded-xl border ${accepted ? 'border-green-200 bg-green-50/50' : 'border-amber-200 bg-amber-50/50'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-mono font-semibold text-slate-800">{c.canonical_reference}</span>
                              <ArrowRight className="w-3 h-3 text-slate-400" />
                              <span className="text-sm font-mono text-slate-600">{c.historical_reference}</span>
                              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${c.confidence === 'HIGH' ? 'text-green-700 bg-green-50 border-green-200' : 'text-amber-700 bg-amber-50 border-amber-200'}`}>
                                {c.confidence}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 mt-1">{c.provenance}</p>
                            <p className="text-xs text-blue-700 mt-1">Recommended: {c.recommended_action}</p>
                          </div>
                          <button
                            onClick={() => {
                              const next = new Set(identityAccepted);
                              if (next.has(i)) next.delete(i); else next.add(i);
                              setIdentityAccepted(next);
                            }}
                            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${accepted ? 'bg-green-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
                          >
                            {accepted ? <><CheckCircle2 className="w-3.5 h-3.5" /> Accepted</> : 'Accept Mapping'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <button onClick={() => setStep('preview')} className="text-sm text-slate-500 hover:text-slate-700 font-medium">
                  ← Back to preview
                </button>
                <button
                  onClick={async () => {
                    // Create accepted identity mappings
                    for (const idx of identityAccepted) {
                      await createIdentityMapping(identityCandidates[idx]);
                    }
                    await handleImport();
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Upload className="w-4 h-4" /> Import {importable.length} Historical Record{importable.length !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              <p className="text-sm text-slate-500 mt-4">Importing historical engineering records…</p>
            </div>
          )}

          {step === 'done' && importResults && (
            <div className="space-y-5">
              <div className="flex flex-col items-center py-6">
                <div className="w-14 h-14 rounded-full bg-green-50 border border-green-200 flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7 text-green-600" />
                </div>
                <h3 className="text-base font-semibold text-slate-900 mt-3">Import Complete</h3>
                <p className="text-sm text-slate-500 mt-1">
                  {importResults.created} historical record{importResults.created !== 1 ? 's' : ''} imported
                  {importResults.skipped > 0 ? ` · ${importResults.skipped} duplicate${importResults.skipped !== 1 ? 's' : ''} skipped` : ''}
                </p>
              </div>

              {importResults.refs.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Imported Work Orders</p>
                  <div className="flex flex-wrap gap-1.5">
                    {importResults.refs.map(ref => (
                      <span key={ref} className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded-lg">{ref}</span>
                    ))}
                  </div>
                </div>
              )}

              {importResults.warnings.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">Warnings</p>
                  <div className="space-y-1">
                    {importResults.warnings.map((w, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {w}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <button onClick={() => { onImported(); onClose(); }} className="px-4 py-2 bg-slate-800 text-white text-sm font-semibold rounded-lg hover:bg-slate-900 transition-colors">
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Engineering Provenance Panel ──────────────────────────────────────────────

export function EngineeringProvenancePanel({ provenance, enrichments, onEnrich, ewoId }: {
  provenance: EngineeringProvenance | null;
  enrichments: EvidenceEnrichment[];
  onEnrich: (ewoId: string) => void;
  ewoId: string;
}) {
  const [showEnrichForm, setShowEnrichForm] = useState(false);
  const [enrichType, setEnrichType] = useState(EVIDENCE_TYPES[0]);
  const [enrichDesc, setEnrichDesc] = useState('');
  const [enrichContent, setEnrichContent] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleEnrichSubmit() {
    setSaving(true);
    await supabase.from('ewo_evidence_enrichments').insert({
      ewo_id: ewoId,
      evidence_type: enrichType,
      evidence_description: enrichDesc || null,
      evidence_content: enrichContent || null,
      enriched_by: 'Engineering Governance',
    });
    setSaving(false);
    setShowEnrichForm(false);
    setEnrichDesc('');
    setEnrichContent('');
    onEnrich(ewoId);
  }

  if (!provenance) return null;

  const confidenceColor = provenance.confidence_level === 'High'
    ? 'text-green-600 bg-green-50 border-green-200'
    : provenance.confidence_level === 'Medium'
    ? 'text-amber-600 bg-amber-50 border-amber-200'
    : 'text-slate-600 bg-slate-50 border-slate-200';

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Archive className="w-4.5 h-4.5 text-amber-600" />
          <h3 className="text-sm font-semibold text-slate-800">Engineering Provenance</h3>
          <span className="text-[10px] font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full uppercase tracking-wide">Historical Record</span>
        </div>
        <button
          onClick={() => setShowEnrichForm(!showEnrichForm)}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
        >
          <Upload className="w-3.5 h-3.5" /> Enrich Evidence
        </button>
      </div>

      {/* Provenance metadata */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm mb-4">
        <div>
          <p className="text-xs font-medium text-slate-400 flex items-center gap-1"><Database className="w-3 h-3" /> Source</p>
          <p className="text-sm text-slate-700 mt-0.5">{provenance.source}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-400 flex items-center gap-1"><Calendar className="w-3 h-3" /> Imported</p>
          <p className="text-sm text-slate-700 mt-0.5">{new Date(provenance.imported_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-400 flex items-center gap-1"><User className="w-3 h-3" /> Imported By</p>
          <p className="text-sm text-slate-700 mt-0.5">{provenance.imported_by || '—'}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-400">Confidence</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${confidenceColor}`}>
              {provenance.confidence_level} · {provenance.confidence_score}%
            </span>
          </div>
        </div>
      </div>

      {/* Confidence bar */}
      <div className="mb-4">
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              provenance.confidence_level === 'High' ? 'bg-green-500'
              : provenance.confidence_level === 'Medium' ? 'bg-amber-500'
              : 'bg-slate-400'
            }`}
            style={{ width: `${provenance.confidence_score}%` }}
          />
        </div>
      </div>

      {/* Evidence availability */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Evidence Availability</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {provenance.evidence_available.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              {item.available ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
              ) : (
                <X className="w-3.5 h-3.5 text-slate-300 shrink-0" />
              )}
              <span className={item.available ? 'text-slate-700' : 'text-slate-400'}>
                {item.type}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Enrichments */}
      {enrichments.length > 0 && (
        <div className="mt-4 pt-4 border-t border-amber-200">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Evidence Enrichments ({enrichments.length})</p>
          <div className="space-y-1.5">
            {enrichments.map(enr => (
              <div key={enr.id} className="flex items-start gap-2 text-xs bg-white/60 rounded-lg px-3 py-2">
                <Upload className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <span className="font-medium text-slate-700">{enr.evidence_type}</span>
                  {enr.evidence_description && <p className="text-slate-500 mt-0.5">{enr.evidence_description}</p>}
                  <p className="text-[10px] text-slate-400 mt-0.5">By {enr.enriched_by} · {new Date(enr.enriched_at).toLocaleString('en-AU')}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Enrichment form */}
      {showEnrichForm && (
        <div className="mt-4 pt-4 border-t border-amber-200 space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Attach New Evidence</p>
          <select className="input text-sm" value={enrichType} onChange={e => setEnrichType(e.target.value)}>
            {EVIDENCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input className="input text-sm" value={enrichDesc} onChange={e => setEnrichDesc(e.target.value)} placeholder="Brief description of this evidence" />
          <textarea className="input text-sm resize-none" rows={3} value={enrichContent} onChange={e => setEnrichContent(e.target.value)} placeholder="Evidence content (optional)" />
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => setShowEnrichForm(false)} className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 font-medium">Cancel</button>
            <button
              onClick={handleEnrichSubmit}
              disabled={saving || !enrichType}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Attach Evidence
            </button>
          </div>
        </div>
      )}

      {/* Historical notes */}
      {provenance.historical_notes && (
        <div className="mt-4 pt-4 border-t border-amber-200">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Historical Notes</p>
          <p className="text-xs text-slate-500 leading-relaxed">{provenance.historical_notes}</p>
        </div>
      )}
    </div>
  );
}
