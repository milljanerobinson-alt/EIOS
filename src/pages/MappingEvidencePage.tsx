import { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft, Plus, Pencil, Trash2, X, ChevronDown, ChevronRight,
  FileText, Link2, CheckCircle2, AlertCircle, Loader2, History,
  Eye, Printer, BookOpen, Shield, Clock, ClipboardList,
  Award, RotateCcw, Save, ExternalLink, Info,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import type {
  Qualification, QualificationLLNRequirement,
  MappingEvidence, MappingUnitEvidence, MappingEvidenceAttachment,
  MappingEvidenceReview, MappingEvidenceAudit,
  EvidenceStatus, EvidenceMethodology, EvidenceAttachmentType,
} from '../lib/types';
import {
  SIX_SKILLS, LEVEL_COLORS, METHODOLOGY_LABELS,
  ATTACHMENT_TYPE_LABELS, EVIDENCE_STATUS_CONFIG,
} from '../lib/types';

// ── Constants ────────────────────────────────────────────────────────────────

const ACSF_FIVE_SKILLS = SIX_SKILLS.filter((s) => s.key !== 'digital_literacy');

const EVIDENCE_SKILL_KEYS: Array<{ key: keyof MappingEvidence; label: string }> = [
  { key: 'acsf_learning',   label: 'Learning' },
  { key: 'acsf_reading',    label: 'Reading' },
  { key: 'acsf_writing',    label: 'Writing' },
  { key: 'acsf_oral_comm',  label: 'Oral Communication' },
  { key: 'acsf_numeracy',   label: 'Numeracy' },
];

const UNIT_SKILL_KEYS: Array<{ key: keyof MappingUnitEvidence; label: string }> = [
  { key: 'learning_level',   label: 'Learning' },
  { key: 'reading_level',    label: 'Reading' },
  { key: 'writing_level',    label: 'Writing' },
  { key: 'oral_comm_level',  label: 'Oral Comm' },
  { key: 'numeracy_level',   label: 'Numeracy' },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function LevelBadge({ level }: { level: number | null | undefined }) {
  const l = level ?? 0;
  return (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded text-xs font-semibold border ${LEVEL_COLORS[l] ?? LEVEL_COLORS[0]}`}>
      {l ? l : '—'}
    </span>
  );
}

function StatusBadge({ status }: { status: EvidenceStatus }) {
  const cfg = EVIDENCE_STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function SectionCard({ title, icon: Icon, children, action }: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface Props {
  qualId: string;
  onBack: () => void;
}

type Tab = 'overview' | 'units' | 'attachments' | 'reviews' | 'versions' | 'audit';

export function MappingEvidencePage({ qualId, onBack }: Props) {
  const { profile } = useAuth();

  // Core data
  const [qual, setQual] = useState<Qualification | null>(null);
  const [reqs, setReqs] = useState<QualificationLLNRequirement[]>([]);
  const [allVersions, setAllVersions] = useState<MappingEvidence[]>([]);
  const [activeEvidence, setActiveEvidence] = useState<MappingEvidence | null>(null);
  const [units, setUnits] = useState<MappingUnitEvidence[]>([]);
  const [attachments, setAttachments] = useState<MappingEvidenceAttachment[]>([]);
  const [reviews, setReviews] = useState<MappingEvidenceReview[]>([]);
  const [auditLog, setAuditLog] = useState<MappingEvidenceAudit[]>([]);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState<Tab>('overview');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // ── Edit evidence form ──────────────────────────────────────────────────────
  const [showEvidenceForm, setShowEvidenceForm] = useState(false);
  const [isNewVersion, setIsNewVersion] = useState(false);
  const [evidenceForm, setEvidenceForm] = useState<Partial<MappingEvidence>>({});

  // ── Unit evidence modal ─────────────────────────────────────────────────────
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [editingUnit, setEditingUnit] = useState<MappingUnitEvidence | null>(null);
  const [unitForm, setUnitForm] = useState<Partial<MappingUnitEvidence>>({});

  // ── Attachment modal ────────────────────────────────────────────────────────
  const [showAttachModal, setShowAttachModal] = useState(false);
  const [editingAttach, setEditingAttach] = useState<MappingEvidenceAttachment | null>(null);
  const [attachForm, setAttachForm] = useState<Partial<MappingEvidenceAttachment>>({});

  // ── Review modal ────────────────────────────────────────────────────────────
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewForm, setReviewForm] = useState<Partial<MappingEvidenceReview>>({});

  // ── Version compare ─────────────────────────────────────────────────────────
  const [compareVersion, setCompareVersion] = useState<MappingEvidence | null>(null);

  // ── Explain panel ───────────────────────────────────────────────────────────
  const [showExplain, setShowExplain] = useState(false);

  function showToast(type: 'success' | 'error', msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [qualRes, reqsRes, versionsRes, auditRes] = await Promise.all([
      supabase.from('qualifications').select('*').eq('id', qualId).maybeSingle(),
      supabase.from('qualification_lln_requirements').select('*').eq('qualification_id', qualId),
      supabase.from('qualification_mapping_evidence')
        .select('*')
        .eq('qualification_id', qualId)
        .order('version_number', { ascending: false }),
      supabase.from('mapping_evidence_audit')
        .select('*')
        .eq('qualification_id', qualId)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    setQual(qualRes.data as Qualification | null);
    setReqs((reqsRes.data ?? []) as QualificationLLNRequirement[]);

    const versions = (versionsRes.data ?? []) as MappingEvidence[];
    setAllVersions(versions);
    const current = versions.find((v) => v.status === 'active') ?? versions[0] ?? null;
    setActiveEvidence(current);

    setAuditLog((auditRes.data ?? []) as MappingEvidenceAudit[]);

    if (current) {
      const [uRes, aRes, rRes] = await Promise.all([
        supabase.from('mapping_unit_evidence').select('*').eq('evidence_id', current.id).order('unit_type').order('uoc_code'),
        supabase.from('mapping_evidence_attachments').select('*').eq('evidence_id', current.id).order('uploaded_at', { ascending: false }),
        supabase.from('mapping_evidence_reviews').select('*').eq('evidence_id', current.id).order('review_date', { ascending: false }),
      ]);
      setUnits((uRes.data ?? []) as MappingUnitEvidence[]);
      setAttachments((aRes.data ?? []) as MappingEvidenceAttachment[]);
      setReviews((rRes.data ?? []) as MappingEvidenceReview[]);
    } else {
      setUnits([]); setAttachments([]); setReviews([]);
    }
    setLoading(false);
  }, [qualId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Evidence form handlers ─────────────────────────────────────────────────

  function openEditEvidence() {
    if (!activeEvidence) {
      // Create first evidence record
      const levelsFromReqs: Record<string, number> = {};
      for (const r of reqs) {
        const skill = ACSF_FIVE_SKILLS.find((s) => s.skill === r.acsf_skill);
        if (skill) levelsFromReqs[skill.key] = r.minimum_acsf_level;
      }
      setEvidenceForm({
        status: 'draft',
        methodology: 'highest_across_mandatory_units',
        methodology_notes: '',
        mapping_notes: '',
        acsf_learning:   levelsFromReqs['learning']   ?? null,
        acsf_reading:    levelsFromReqs['reading']    ?? null,
        acsf_writing:    levelsFromReqs['writing']    ?? null,
        acsf_oral_comm:  levelsFromReqs['oral_communication'] ?? null,
        acsf_numeracy:   levelsFromReqs['numeracy']   ?? null,
        review_interval_months: 24,
        created_by_name: profile?.full_name ?? '',
      });
      setIsNewVersion(false);
    } else {
      setEvidenceForm({ ...activeEvidence });
      setIsNewVersion(false);
    }
    setShowEvidenceForm(true);
  }

  function openNewVersion() {
    if (!activeEvidence) return;
    setEvidenceForm({
      ...activeEvidence,
      id: undefined,
      status: 'draft',
      change_reason: '',
      created_by_name: profile?.full_name ?? '',
    });
    setIsNewVersion(true);
    setShowEvidenceForm(true);
  }

  async function saveEvidence() {
    setSaving(true);
    try {
      const nextReview = evidenceForm.last_reviewed_at
        ? new Date(new Date(evidenceForm.last_reviewed_at).getTime() + (evidenceForm.review_interval_months ?? 24) * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        : null;

      if (!activeEvidence || !evidenceForm.id) {
        // Insert first/new version
        const versionNumber = isNewVersion ? (allVersions.length + 1) : 1;
        const { data, error } = await supabase.from('qualification_mapping_evidence').insert({
          qualification_id: qualId,
          version_number: versionNumber,
          status: evidenceForm.status ?? 'draft',
          methodology: evidenceForm.methodology ?? 'highest_across_mandatory_units',
          methodology_notes: evidenceForm.methodology_notes ?? null,
          mapping_notes: evidenceForm.mapping_notes ?? null,
          acsf_learning:  evidenceForm.acsf_learning  ?? null,
          acsf_reading:   evidenceForm.acsf_reading   ?? null,
          acsf_writing:   evidenceForm.acsf_writing   ?? null,
          acsf_oral_comm: evidenceForm.acsf_oral_comm ?? null,
          acsf_numeracy:  evidenceForm.acsf_numeracy  ?? null,
          review_interval_months: evidenceForm.review_interval_months ?? 24,
          last_reviewed_at: evidenceForm.last_reviewed_at ?? null,
          next_review_date: nextReview,
          created_by_name: evidenceForm.created_by_name ?? null,
          reviewed_by_name: evidenceForm.reviewed_by_name ?? null,
          approved_by_name: evidenceForm.approved_by_name ?? null,
          previous_version_id: isNewVersion ? (activeEvidence?.id ?? null) : null,
          change_reason: evidenceForm.change_reason ?? null,
        }).select().maybeSingle();
        if (error) throw error;
        if (isNewVersion && activeEvidence) {
          await supabase.from('qualification_mapping_evidence')
            .update({ status: 'archived' })
            .eq('id', activeEvidence.id);
        }
        await logEvidenceAudit(data?.id, 'evidence.created', null, data);
      } else {
        // Update existing draft
        const { error } = await supabase.from('qualification_mapping_evidence').update({
          status: evidenceForm.status,
          methodology: evidenceForm.methodology,
          methodology_notes: evidenceForm.methodology_notes ?? null,
          mapping_notes: evidenceForm.mapping_notes ?? null,
          acsf_learning:  evidenceForm.acsf_learning  ?? null,
          acsf_reading:   evidenceForm.acsf_reading   ?? null,
          acsf_writing:   evidenceForm.acsf_writing   ?? null,
          acsf_oral_comm: evidenceForm.acsf_oral_comm ?? null,
          acsf_numeracy:  evidenceForm.acsf_numeracy  ?? null,
          review_interval_months: evidenceForm.review_interval_months ?? 24,
          last_reviewed_at: evidenceForm.last_reviewed_at ?? null,
          next_review_date: nextReview,
          reviewed_by_name: evidenceForm.reviewed_by_name ?? null,
          approved_by_name: evidenceForm.approved_by_name ?? null,
          change_reason: evidenceForm.change_reason ?? null,
          updated_at: new Date().toISOString(),
        }).eq('id', evidenceForm.id);
        if (error) throw error;
        await logEvidenceAudit(evidenceForm.id, 'evidence.updated', activeEvidence, evidenceForm);
      }

      setShowEvidenceForm(false);
      showToast('success', isNewVersion ? 'New version created.' : 'Evidence record saved.');
      await loadAll();
    } catch (e: any) {
      showToast('error', e.message ?? 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  // ── Unit handlers ──────────────────────────────────────────────────────────

  function openAddUnit() {
    setEditingUnit(null);
    setUnitForm({ unit_type: 'core', evidence_id: activeEvidence?.id });
    setShowUnitModal(true);
  }

  function openEditUnit(u: MappingUnitEvidence) {
    setEditingUnit(u);
    setUnitForm({ ...u });
    setShowUnitModal(true);
  }

  async function saveUnit() {
    if (!activeEvidence) return;
    if (!unitForm.uoc_code?.trim() || !unitForm.uoc_title?.trim()) return;
    setSaving(true);
    try {
      if (editingUnit) {
        await supabase.from('mapping_unit_evidence').update({
          uoc_code: unitForm.uoc_code, uoc_title: unitForm.uoc_title,
          unit_type: unitForm.unit_type ?? 'core',
          learning_level: unitForm.learning_level ?? null,
          reading_level: unitForm.reading_level ?? null,
          writing_level: unitForm.writing_level ?? null,
          oral_comm_level: unitForm.oral_comm_level ?? null,
          numeracy_level: unitForm.numeracy_level ?? null,
          evidence_notes: unitForm.evidence_notes ?? null,
          reasoning: unitForm.reasoning ?? null,
        }).eq('id', editingUnit.id);
        await logEvidenceAudit(activeEvidence.id, 'unit_evidence.updated', editingUnit, unitForm);
      } else {
        await supabase.from('mapping_unit_evidence').insert({
          evidence_id: activeEvidence.id,
          uoc_code: unitForm.uoc_code, uoc_title: unitForm.uoc_title,
          unit_type: unitForm.unit_type ?? 'core',
          learning_level: unitForm.learning_level ?? null,
          reading_level: unitForm.reading_level ?? null,
          writing_level: unitForm.writing_level ?? null,
          oral_comm_level: unitForm.oral_comm_level ?? null,
          numeracy_level: unitForm.numeracy_level ?? null,
          evidence_notes: unitForm.evidence_notes ?? null,
          reasoning: unitForm.reasoning ?? null,
        });
        await logEvidenceAudit(activeEvidence.id, 'unit_evidence.added', null, unitForm);
      }
      setShowUnitModal(false);
      await loadAll();
    } catch (e: any) {
      showToast('error', e.message ?? 'Failed to save unit.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteUnit(id: string) {
    if (!activeEvidence) return;
    await supabase.from('mapping_unit_evidence').delete().eq('id', id);
    await logEvidenceAudit(activeEvidence.id, 'unit_evidence.deleted', { id }, null);
    await loadAll();
  }

  // ── Attachment handlers ────────────────────────────────────────────────────

  function openAddAttach() {
    setEditingAttach(null);
    setAttachForm({ evidence_type: 'training_package_docs', uploaded_by_name: profile?.full_name ?? '' });
    setShowAttachModal(true);
  }

  function openEditAttach(a: MappingEvidenceAttachment) {
    setEditingAttach(a);
    setAttachForm({ ...a });
    setShowAttachModal(true);
  }

  async function saveAttach() {
    if (!activeEvidence || !attachForm.title?.trim()) return;
    setSaving(true);
    try {
      if (editingAttach) {
        await supabase.from('mapping_evidence_attachments').update({
          title: attachForm.title, evidence_type: attachForm.evidence_type,
          description: attachForm.description ?? null,
          file_url: attachForm.file_url ?? null,
          external_url: attachForm.external_url ?? null,
        }).eq('id', editingAttach.id);
        await logEvidenceAudit(activeEvidence.id, 'attachment.updated', editingAttach, attachForm);
      } else {
        await supabase.from('mapping_evidence_attachments').insert({
          evidence_id: activeEvidence.id,
          title: attachForm.title, evidence_type: attachForm.evidence_type ?? 'other',
          description: attachForm.description ?? null,
          file_url: attachForm.file_url ?? null,
          external_url: attachForm.external_url ?? null,
          uploaded_by_name: attachForm.uploaded_by_name ?? null,
        });
        await logEvidenceAudit(activeEvidence.id, 'attachment.added', null, attachForm);
      }
      setShowAttachModal(false);
      await loadAll();
    } catch (e: any) {
      showToast('error', e.message ?? 'Failed to save attachment.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteAttach(id: string) {
    if (!activeEvidence) return;
    await supabase.from('mapping_evidence_attachments').delete().eq('id', id);
    await logEvidenceAudit(activeEvidence.id, 'attachment.deleted', { id }, null);
    await loadAll();
  }

  // ── Review handlers ────────────────────────────────────────────────────────

  function openAddReview() {
    setReviewForm({
      review_date: new Date().toISOString().split('T')[0],
      reviewer_name: profile?.full_name ?? '',
      outcome: 'approved',
    });
    setShowReviewModal(true);
  }

  async function saveReview() {
    if (!activeEvidence || !reviewForm.reviewer_name?.trim()) return;
    setSaving(true);
    try {
      await supabase.from('mapping_evidence_reviews').insert({
        evidence_id: activeEvidence.id,
        review_date: reviewForm.review_date ?? new Date().toISOString().split('T')[0],
        reviewer_name: reviewForm.reviewer_name,
        reason: reviewForm.reason ?? null,
        summary: reviewForm.summary ?? null,
        outcome: reviewForm.outcome ?? 'approved',
      });
      // Update last_reviewed_at on evidence record
      const nextReview = new Date(
        new Date().getTime() + (activeEvidence.review_interval_months ?? 24) * 30 * 24 * 60 * 60 * 1000
      ).toISOString().split('T')[0];
      await supabase.from('qualification_mapping_evidence').update({
        last_reviewed_at: new Date().toISOString(),
        next_review_date: nextReview,
        reviewed_by_name: reviewForm.reviewer_name,
        status: reviewForm.outcome === 'approved' ? 'active' : activeEvidence.status,
        updated_at: new Date().toISOString(),
      }).eq('id', activeEvidence.id);
      await logEvidenceAudit(activeEvidence.id, 'review.completed', null, reviewForm);
      setShowReviewModal(false);
      showToast('success', 'Review recorded.');
      await loadAll();
    } catch (e: any) {
      showToast('error', e.message ?? 'Failed to save review.');
    } finally {
      setSaving(false);
    }
  }

  // ── Audit helper ───────────────────────────────────────────────────────────

  async function logEvidenceAudit(evidenceId: string | null | undefined, action: string, prev: any, next: any) {
    await supabase.from('mapping_evidence_audit').insert({
      evidence_id: evidenceId ?? null,
      qualification_id: qualId,
      actor: profile?.full_name ?? 'admin',
      action,
      previous_value: prev ? JSON.parse(JSON.stringify(prev)) : null,
      new_value: next ? JSON.parse(JSON.stringify(next)) : null,
    });
  }

  // ── PDF Print ──────────────────────────────────────────────────────────────

  function handlePrint() {
    if (!activeEvidence) return;
    logEvidenceAudit(activeEvidence.id, 'pdf.generated', null, { generated_by: profile?.full_name });
    window.print();
  }

  // ── Review reminder indicator ──────────────────────────────────────────────

  const reviewDue = activeEvidence?.next_review_date
    ? new Date(activeEvidence.next_review_date) <= new Date()
    : false;

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading evidence record…
      </div>
    );
  }

  if (!qual) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
        <AlertCircle className="w-8 h-8" />
        <p>Qualification not found.</p>
        <button onClick={onBack} className="btn-secondary text-sm">Go Back</button>
      </div>
    );
  }

  const TABS: Array<{ id: Tab; label: string; icon: React.ComponentType<{ className?: string }>; count?: number }> = [
    { id: 'overview',     label: 'Overview',     icon: BookOpen },
    { id: 'units',        label: 'Unit Evidence', icon: ClipboardList, count: units.length },
    { id: 'attachments',  label: 'Source Evidence', icon: FileText, count: attachments.length },
    { id: 'reviews',      label: 'Reviews',      icon: CheckCircle2, count: reviews.length },
    { id: 'versions',     label: 'Versions',     icon: History, count: allVersions.length },
    { id: 'audit',        label: 'Audit Log',    icon: Shield, count: auditLog.length },
  ];

  return (
    <div className="space-y-6 print:space-y-4">

      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl px-4 py-3 shadow-xl text-sm font-medium print:hidden ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 print:hidden">
        <div className="flex items-start gap-3">
          <button onClick={onBack} className="mt-0.5 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-xl font-bold text-slate-900">{qual.code}</h2>
              {activeEvidence && <StatusBadge status={activeEvidence.status} />}
              {reviewDue && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                  <Clock className="w-3 h-3" /> Review Overdue
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-0.5">{qual.name}</p>
            {activeEvidence && (
              <p className="text-xs text-slate-400 mt-0.5">
                Version {activeEvidence.version_number} ·{' '}
                {activeEvidence.last_reviewed_at
                  ? `Last reviewed ${new Date(activeEvidence.last_reviewed_at).toLocaleDateString('en-AU')}`
                  : 'Not yet reviewed'
                }
                {activeEvidence.next_review_date && (
                  <> · Next review {new Date(activeEvidence.next_review_date).toLocaleDateString('en-AU')}</>
                )}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {activeEvidence && (
            <>
              <button onClick={() => setShowExplain(true)} className="btn-secondary text-sm gap-1.5">
                <Eye className="w-4 h-4" /> Explain Mapping
              </button>
              <button onClick={handlePrint} className="btn-secondary text-sm gap-1.5">
                <Printer className="w-4 h-4" /> Generate PDF
              </button>
              <button onClick={openNewVersion} className="btn-secondary text-sm gap-1.5">
                <RotateCcw className="w-4 h-4" /> New Version
              </button>
            </>
          )}
          <button onClick={openEditEvidence} className="btn-primary text-sm gap-1.5">
            {activeEvidence ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {activeEvidence ? 'Edit Evidence' : 'Create Evidence Record'}
          </button>
        </div>
      </div>

      {/* ── Print header (visible only when printing) ── */}
      <div className="hidden print:block border-b border-slate-200 pb-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">ACSF Mapping Evidence Report</h1>
            <p className="text-lg text-slate-700 mt-1">{qual.code} — {qual.name}</p>
            {activeEvidence && (
              <p className="text-sm text-slate-500 mt-1">Version {activeEvidence.version_number} · Status: {EVIDENCE_STATUS_CONFIG[activeEvidence.status].label}</p>
            )}
          </div>
          <div className="text-right text-sm text-slate-500">
            <p>Generated {new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
            {profile?.full_name && <p>By {profile.full_name}</p>}
          </div>
        </div>
      </div>

      {/* ── No evidence yet ── */}
      {!activeEvidence && (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center">
          <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-700 mb-1">No mapping evidence record yet</h3>
          <p className="text-sm text-slate-400 mb-5 max-w-sm mx-auto">
            Create an evidence record to document how the ACSF mapping was determined — required for compliance audits.
          </p>
          <button onClick={openEditEvidence} className="btn-primary text-sm gap-1.5">
            <Plus className="w-4 h-4" /> Create Evidence Record
          </button>
        </div>
      )}

      {/* ── Tabs + Content ── */}
      {activeEvidence && (
        <>
          {/* Tab bar */}
          <div className="border-b border-slate-200 print:hidden">
            <div className="flex gap-1 overflow-x-auto">
              {TABS.map(({ id, label, icon: Icon, count }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    tab === id
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                  {count !== undefined && count > 0 && (
                    <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${tab === id ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                      {count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ── OVERVIEW TAB ── */}
          {(tab === 'overview' || true /* always show in print */) && (
            <div className={tab === 'overview' ? 'space-y-5' : 'hidden print:block space-y-5'}>

              {/* ACSF levels */}
              <SectionCard title="Current ACSF Levels" icon={Award}>
                <div className="grid grid-cols-5 gap-3">
                  {EVIDENCE_SKILL_KEYS.map(({ key, label }) => {
                    const val = activeEvidence[key] as number | null;
                    return (
                      <div key={key} className="text-center">
                        <div className={`mx-auto w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold border-2 ${LEVEL_COLORS[val ?? 0]}`}>
                          {val ?? '—'}
                        </div>
                        <p className="text-xs text-slate-500 mt-1.5 leading-tight">{label}</p>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>

              {/* Methodology */}
              <SectionCard title="Methodology" icon={BookOpen}>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 bg-slate-50 rounded-lg p-3">
                    <CheckCircle2 className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {METHODOLOGY_LABELS[activeEvidence.methodology]}
                      </p>
                      {activeEvidence.methodology_notes && (
                        <p className="text-xs text-slate-500 mt-1 whitespace-pre-line">{activeEvidence.methodology_notes}</p>
                      )}
                    </div>
                  </div>
                </div>
              </SectionCard>

              {/* Mapping notes */}
              {activeEvidence.mapping_notes && (
                <SectionCard title="Mapping Notes" icon={FileText}>
                  <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{activeEvidence.mapping_notes}</p>
                </SectionCard>
              )}

              {/* Record details */}
              <SectionCard title="Record Details" icon={Info}>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  {[
                    ['Version', `v${activeEvidence.version_number}`],
                    ['Status', EVIDENCE_STATUS_CONFIG[activeEvidence.status].label],
                    ['Review Interval', `Every ${activeEvidence.review_interval_months} months`],
                    ['Created By', activeEvidence.created_by_name ?? '—'],
                    ['Reviewed By', activeEvidence.reviewed_by_name ?? '—'],
                    ['Approved By', activeEvidence.approved_by_name ?? '—'],
                    ['Last Reviewed', activeEvidence.last_reviewed_at
                      ? new Date(activeEvidence.last_reviewed_at).toLocaleDateString('en-AU')
                      : '—'],
                    ['Next Review', activeEvidence.next_review_date
                      ? new Date(activeEvidence.next_review_date).toLocaleDateString('en-AU')
                      : '—'],
                  ].map(([label, value]) => (
                    <div key={label} className="flex flex-col gap-0.5">
                      <dt className="text-xs text-slate-400 font-medium uppercase tracking-wide">{label}</dt>
                      <dd className="text-slate-700">{value}</dd>
                    </div>
                  ))}
                </dl>
              </SectionCard>
            </div>
          )}

          {/* ── UNITS TAB ── */}
          {(tab === 'units') && (
            <div className="space-y-4 print:hidden">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">{units.length} unit{units.length !== 1 ? 's' : ''} recorded</p>
                <button onClick={openAddUnit} className="btn-primary text-sm gap-1.5">
                  <Plus className="w-4 h-4" /> Add Unit
                </button>
              </div>

              {units.length === 0 ? (
                <div className="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center">
                  <ClipboardList className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">No unit evidence added yet. Add units to document per-unit ACSF levels and reasoning.</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Unit</th>
                        <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                        {UNIT_SKILL_KEYS.map(({ label }) => (
                          <th key={label} className="text-center px-2 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-12">{label.substring(0,3)}</th>
                        ))}
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {units.map((u) => (
                        <tr key={u.id} className="hover:bg-slate-50/50 group">
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-800 text-xs">{u.uoc_code}</p>
                            <p className="text-slate-500 text-xs mt-0.5 line-clamp-1">{u.uoc_title}</p>
                            {u.reasoning && <p className="text-slate-400 text-xs mt-1 italic line-clamp-2">"{u.reasoning}"</p>}
                          </td>
                          <td className="px-3 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.unit_type === 'core' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                              {u.unit_type === 'core' ? 'Core' : 'Elective'}
                            </span>
                          </td>
                          {UNIT_SKILL_KEYS.map(({ key }) => (
                            <td key={key} className="px-2 py-3 text-center">
                              <LevelBadge level={u[key] as number | null} />
                            </td>
                          ))}
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => openEditUnit(u)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => deleteUnit(u.id)} className="p-1.5 rounded-md hover:bg-rose-50 text-slate-400 hover:text-rose-500">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── ATTACHMENTS TAB ── */}
          {tab === 'attachments' && (
            <div className="space-y-4 print:hidden">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">{attachments.length} source document{attachments.length !== 1 ? 's' : ''}</p>
                <button onClick={openAddAttach} className="btn-primary text-sm gap-1.5">
                  <Plus className="w-4 h-4" /> Add Evidence
                </button>
              </div>
              {attachments.length === 0 ? (
                <div className="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center">
                  <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">No source evidence added. Attach training package docs, companion volumes, or external references.</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {attachments.map((a) => (
                    <div key={a.id} className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-start gap-4 group">
                      <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                        {a.evidence_type === 'external_url' ? <Link2 className="w-4 h-4 text-blue-500" /> : <FileText className="w-4 h-4 text-blue-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium text-slate-800">{a.title}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{ATTACHMENT_TYPE_LABELS[a.evidence_type]}</p>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            {(a.external_url || a.file_url) && (
                              <a href={a.external_url || a.file_url || '#'} target="_blank" rel="noopener noreferrer"
                                className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                            <button onClick={() => openEditAttach(a)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => deleteAttach(a.id)} className="p-1.5 rounded-md hover:bg-rose-50 text-slate-400 hover:text-rose-500">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        {a.description && <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{a.description}</p>}
                        <p className="text-xs text-slate-400 mt-1.5">
                          {a.uploaded_by_name && <>Uploaded by {a.uploaded_by_name} · </>}
                          {new Date(a.uploaded_at).toLocaleDateString('en-AU')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── REVIEWS TAB ── */}
          {tab === 'reviews' && (
            <div className="space-y-4 print:hidden">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">{reviews.length} review{reviews.length !== 1 ? 's' : ''} recorded</p>
                <button onClick={openAddReview} className="btn-primary text-sm gap-1.5">
                  <Plus className="w-4 h-4" /> Record Review
                </button>
              </div>
              {reviews.length === 0 ? (
                <div className="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center">
                  <CheckCircle2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">No reviews recorded yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {reviews.map((r) => (
                    <div key={r.id} className="bg-white rounded-xl border border-slate-200 px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <span className={`mt-0.5 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            r.outcome === 'approved' ? 'bg-emerald-100 text-emerald-700'
                            : r.outcome === 'requires_changes' ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-100 text-slate-600'
                          }`}>
                            {r.outcome === 'approved' ? 'Approved' : r.outcome === 'requires_changes' ? 'Requires Changes' : 'Archived'}
                          </span>
                          <div>
                            <p className="text-sm font-medium text-slate-800">{r.reviewer_name}</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {new Date(r.review_date).toLocaleDateString('en-AU', { day: '2-digit', month: 'long', year: 'numeric' })}
                            </p>
                          </div>
                        </div>
                      </div>
                      {r.reason && <p className="text-xs text-slate-500 mt-2.5"><span className="font-medium text-slate-600">Reason: </span>{r.reason}</p>}
                      {r.summary && <p className="text-xs text-slate-500 mt-1.5 whitespace-pre-line leading-relaxed">{r.summary}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── VERSIONS TAB ── */}
          {tab === 'versions' && (
            <div className="space-y-4 print:hidden">
              <div className="grid gap-3">
                {allVersions.map((v) => (
                  <div key={v.id} className={`bg-white rounded-xl border px-5 py-4 ${v.id === activeEvidence?.id ? 'border-blue-300 ring-1 ring-blue-200' : 'border-slate-200'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span className="text-sm font-bold text-slate-700">v{v.version_number}</span>
                        <StatusBadge status={v.status} />
                        {v.id === activeEvidence?.id && (
                          <span className="text-xs text-blue-600 font-medium">Current</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setCompareVersion(compareVersion?.id === v.id ? null : v)}
                          className={`text-xs px-2.5 py-1 rounded-md border font-medium transition-colors ${
                            compareVersion?.id === v.id
                              ? 'bg-blue-50 border-blue-300 text-blue-700'
                              : 'border-slate-200 text-slate-500 hover:text-slate-700 hover:border-slate-300'
                          }`}
                        >
                          {compareVersion?.id === v.id ? 'Hide Details' : 'View Details'}
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 mt-1.5">
                      Created {new Date(v.created_at).toLocaleDateString('en-AU', { day: '2-digit', month: 'long', year: 'numeric' })}
                      {v.created_by_name && <> by {v.created_by_name}</>}
                    </p>
                    {v.change_reason && (
                      <p className="text-xs text-slate-500 mt-1.5 italic">Reason: {v.change_reason}</p>
                    )}
                    {compareVersion?.id === v.id && (
                      <div className="mt-4 pt-4 border-t border-slate-100">
                        <div className="grid grid-cols-5 gap-2 mb-3">
                          {EVIDENCE_SKILL_KEYS.map(({ key, label }) => (
                            <div key={key} className="text-center">
                              <LevelBadge level={v[key] as number | null} />
                              <p className="text-xs text-slate-400 mt-1 leading-tight">{label}</p>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-slate-500">
                          <span className="font-medium">Methodology:</span> {METHODOLOGY_LABELS[v.methodology]}
                        </p>
                        {v.mapping_notes && (
                          <p className="text-xs text-slate-500 mt-1 line-clamp-3">{v.mapping_notes}</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── AUDIT TAB ── */}
          {tab === 'audit' && (
            <div className="print:hidden">
              {auditLog.length === 0 ? (
                <div className="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center">
                  <Shield className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">No audit events recorded yet.</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Timestamp</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actor</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {auditLog.map((entry) => (
                        <tr key={entry.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                            {new Date(entry.created_at).toLocaleString('en-AU')}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-700">{entry.actor ?? '—'}</td>
                          <td className="px-4 py-3">
                            <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                              {entry.action}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Print-only: all sections ── */}
          <div className="hidden print:block space-y-6 mt-6">
            {units.length > 0 && (
              <div>
                <h2 className="text-base font-bold text-slate-800 mb-3 border-b pb-2">Unit Evidence</h2>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="text-left p-2 border border-slate-200">Unit Code</th>
                      <th className="text-left p-2 border border-slate-200">Unit Title</th>
                      <th className="text-center p-2 border border-slate-200">Type</th>
                      <th className="text-center p-2 border border-slate-200">Lrn</th>
                      <th className="text-center p-2 border border-slate-200">Rdg</th>
                      <th className="text-center p-2 border border-slate-200">Wri</th>
                      <th className="text-center p-2 border border-slate-200">Oral</th>
                      <th className="text-center p-2 border border-slate-200">Num</th>
                    </tr>
                  </thead>
                  <tbody>
                    {units.map((u) => (
                      <tr key={u.id}>
                        <td className="p-2 border border-slate-200 font-mono">{u.uoc_code}</td>
                        <td className="p-2 border border-slate-200">{u.uoc_title}</td>
                        <td className="p-2 border border-slate-200 text-center capitalize">{u.unit_type}</td>
                        {UNIT_SKILL_KEYS.map(({ key }) => (
                          <td key={key} className="p-2 border border-slate-200 text-center">
                            {(u[key] as number | null) ?? '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {attachments.length > 0 && (
              <div>
                <h2 className="text-base font-bold text-slate-800 mb-3 border-b pb-2">Source Evidence</h2>
                {attachments.map((a) => (
                  <div key={a.id} className="mb-2 text-xs">
                    <span className="font-medium">{a.title}</span> — {ATTACHMENT_TYPE_LABELS[a.evidence_type]}
                    {a.description && <span className="text-slate-500"> · {a.description}</span>}
                  </div>
                ))}
              </div>
            )}
            {reviews.length > 0 && (
              <div>
                <h2 className="text-base font-bold text-slate-800 mb-3 border-b pb-2">Review History</h2>
                {reviews.map((r) => (
                  <div key={r.id} className="mb-3 text-xs">
                    <p><span className="font-medium">{r.review_date}</span> — {r.reviewer_name} — <span className="capitalize">{r.outcome.replace('_', ' ')}</span></p>
                    {r.summary && <p className="text-slate-500 mt-0.5">{r.summary}</p>}
                  </div>
                ))}
              </div>
            )}
            <div className="text-center text-xs text-slate-400 mt-8 pt-4 border-t">
              Generated by LLN Platform · {new Date().toLocaleString('en-AU')}
            </div>
          </div>
        </>
      )}

      {/* ── Evidence Edit Modal ── */}
      {showEvidenceForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {isNewVersion ? 'Create New Version' : activeEvidence ? 'Edit Evidence Record' : 'Create Evidence Record'}
              </h3>
              <button onClick={() => setShowEvidenceForm(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

              {/* Status + methodology */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Status</label>
                  <select className="input text-sm" value={evidenceForm.status ?? 'draft'}
                    onChange={(e) => setEvidenceForm((p) => ({ ...p, status: e.target.value as EvidenceStatus }))}>
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
                <div>
                  <label className="label">Review Interval</label>
                  <select className="input text-sm" value={evidenceForm.review_interval_months ?? 24}
                    onChange={(e) => setEvidenceForm((p) => ({ ...p, review_interval_months: Number(e.target.value) as 12 | 24 | 36 }))}>
                    <option value={12}>Every 12 months</option>
                    <option value={24}>Every 24 months</option>
                    <option value={36}>Every 36 months</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="label">Methodology</label>
                <select className="input text-sm" value={evidenceForm.methodology ?? 'highest_across_mandatory_units'}
                  onChange={(e) => setEvidenceForm((p) => ({ ...p, methodology: e.target.value as EvidenceMethodology }))}>
                  {Object.entries(METHODOLOGY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Methodology Notes</label>
                <textarea className="input text-sm resize-none" rows={2}
                  placeholder="Additional notes about the mapping methodology used…"
                  value={evidenceForm.methodology_notes ?? ''}
                  onChange={(e) => setEvidenceForm((p) => ({ ...p, methodology_notes: e.target.value }))} />
              </div>

              {/* ACSF Levels */}
              <div>
                <label className="label mb-2">ACSF Levels</label>
                <div className="grid grid-cols-5 gap-2">
                  {EVIDENCE_SKILL_KEYS.map(({ key, label }) => (
                    <div key={key}>
                      <p className="text-xs text-slate-500 text-center mb-1.5 leading-tight">{label}</p>
                      <select
                        className={`w-full text-center text-sm font-semibold rounded-lg border py-2 ${LEVEL_COLORS[(evidenceForm[key] as number) ?? 0]}`}
                        value={(evidenceForm[key] as number) ?? 0}
                        onChange={(e) => setEvidenceForm((p) => ({ ...p, [key]: Number(e.target.value) || null }))}>
                        <option value={0}>—</option>
                        {[1,2,3,4,5].map((l) => <option key={l} value={l}>Level {l}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mapping notes */}
              <div>
                <label className="label">Mapping Notes</label>
                <textarea className="input text-sm resize-none" rows={4}
                  placeholder="Document why the mapping was chosen, assumptions made, industry requirements, packaging rule considerations, known limitations…"
                  value={evidenceForm.mapping_notes ?? ''}
                  onChange={(e) => setEvidenceForm((p) => ({ ...p, mapping_notes: e.target.value }))} />
              </div>

              {/* People */}
              <div className="grid grid-cols-3 gap-4">
                {[
                  { key: 'created_by_name', label: 'Created By' },
                  { key: 'reviewed_by_name', label: 'Reviewed By' },
                  { key: 'approved_by_name', label: 'Approved By' },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label className="label">{label}</label>
                    <input className="input text-sm" value={(evidenceForm as any)[key] ?? ''}
                      onChange={(e) => setEvidenceForm((p) => ({ ...p, [key]: e.target.value }))} />
                  </div>
                ))}
              </div>

              <div>
                <label className="label">Last Reviewed Date</label>
                <input type="date" className="input text-sm"
                  value={evidenceForm.last_reviewed_at ? evidenceForm.last_reviewed_at.split('T')[0] : ''}
                  onChange={(e) => setEvidenceForm((p) => ({ ...p, last_reviewed_at: e.target.value ? new Date(e.target.value).toISOString() : null }))} />
              </div>

              {isNewVersion && (
                <div>
                  <label className="label">Reason for New Version <span className="text-rose-500">*</span></label>
                  <input className="input text-sm"
                    placeholder="Describe what changed and why a new version was created…"
                    value={evidenceForm.change_reason ?? ''}
                    onChange={(e) => setEvidenceForm((p) => ({ ...p, change_reason: e.target.value }))} />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
              <button onClick={() => setShowEvidenceForm(false)} className="btn-secondary text-sm">Cancel</button>
              <button onClick={saveEvidence} disabled={saving || (isNewVersion && !evidenceForm.change_reason?.trim())} className="btn-primary text-sm gap-1.5">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Saving…' : isNewVersion ? 'Create New Version' : 'Save Record'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Unit Evidence Modal ── */}
      {showUnitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">{editingUnit ? 'Edit Unit Evidence' : 'Add Unit Evidence'}</h3>
              <button onClick={() => setShowUnitModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">UoC Code <span className="text-rose-500">*</span></label>
                  <input className="input text-sm" placeholder="e.g. BSBWOR301"
                    value={unitForm.uoc_code ?? ''}
                    onChange={(e) => setUnitForm((p) => ({ ...p, uoc_code: e.target.value.toUpperCase() }))} />
                </div>
                <div>
                  <label className="label">Type</label>
                  <select className="input text-sm" value={unitForm.unit_type ?? 'core'}
                    onChange={(e) => setUnitForm((p) => ({ ...p, unit_type: e.target.value as 'core' | 'elective' }))}>
                    <option value="core">Core</option>
                    <option value="elective">Elective</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Unit Title <span className="text-rose-500">*</span></label>
                <input className="input text-sm" placeholder="e.g. Organise personal work priorities and development"
                  value={unitForm.uoc_title ?? ''}
                  onChange={(e) => setUnitForm((p) => ({ ...p, uoc_title: e.target.value }))} />
              </div>
              <div>
                <label className="label mb-2">ACSF Levels for this Unit</label>
                <div className="grid grid-cols-5 gap-2">
                  {UNIT_SKILL_KEYS.map(({ key, label }) => (
                    <div key={key}>
                      <p className="text-xs text-slate-500 text-center mb-1.5 leading-tight">{label}</p>
                      <select
                        className={`w-full text-center text-sm font-semibold rounded-lg border py-2 ${LEVEL_COLORS[(unitForm[key] as number) ?? 0]}`}
                        value={(unitForm[key] as number) ?? 0}
                        onChange={(e) => setUnitForm((p) => ({ ...p, [key]: Number(e.target.value) || null }))}>
                        <option value={0}>—</option>
                        {[1,2,3,4,5].map((l) => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Reasoning</label>
                <textarea className="input text-sm resize-none" rows={2}
                  placeholder="e.g. Reading Level 3 because learners must interpret workplace procedures and multiple document types."
                  value={unitForm.reasoning ?? ''}
                  onChange={(e) => setUnitForm((p) => ({ ...p, reasoning: e.target.value }))} />
              </div>
              <div>
                <label className="label">Evidence Notes</label>
                <textarea className="input text-sm resize-none" rows={2}
                  value={unitForm.evidence_notes ?? ''}
                  onChange={(e) => setUnitForm((p) => ({ ...p, evidence_notes: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
              <button onClick={() => setShowUnitModal(false)} className="btn-secondary text-sm">Cancel</button>
              <button onClick={saveUnit} disabled={saving || !unitForm.uoc_code?.trim() || !unitForm.uoc_title?.trim()} className="btn-primary text-sm gap-1.5">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Saving…' : 'Save Unit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Attachment Modal ── */}
      {showAttachModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">{editingAttach ? 'Edit Source Evidence' : 'Add Source Evidence'}</h3>
              <button onClick={() => setShowAttachModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
              <div>
                <label className="label">Title <span className="text-rose-500">*</span></label>
                <input className="input text-sm" placeholder="e.g. Training Package Documentation – BSB41315"
                  value={attachForm.title ?? ''}
                  onChange={(e) => setAttachForm((p) => ({ ...p, title: e.target.value }))} />
              </div>
              <div>
                <label className="label">Evidence Type</label>
                <select className="input text-sm" value={attachForm.evidence_type ?? 'training_package_docs'}
                  onChange={(e) => setAttachForm((p) => ({ ...p, evidence_type: e.target.value as EvidenceAttachmentType }))}>
                  {Object.entries(ATTACHMENT_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Description</label>
                <textarea className="input text-sm resize-none" rows={2}
                  value={attachForm.description ?? ''}
                  onChange={(e) => setAttachForm((p) => ({ ...p, description: e.target.value }))} />
              </div>
              <div>
                <label className="label">External URL</label>
                <input className="input text-sm" type="url" placeholder="https://…"
                  value={attachForm.external_url ?? ''}
                  onChange={(e) => setAttachForm((p) => ({ ...p, external_url: e.target.value }))} />
              </div>
              <div>
                <label className="label">Uploaded By</label>
                <input className="input text-sm"
                  value={attachForm.uploaded_by_name ?? ''}
                  onChange={(e) => setAttachForm((p) => ({ ...p, uploaded_by_name: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
              <button onClick={() => setShowAttachModal(false)} className="btn-secondary text-sm">Cancel</button>
              <button onClick={saveAttach} disabled={saving || !attachForm.title?.trim()} className="btn-primary text-sm gap-1.5">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Review Modal ── */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Record Review</h3>
              <button onClick={() => setShowReviewModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Reviewer <span className="text-rose-500">*</span></label>
                  <input className="input text-sm" value={reviewForm.reviewer_name ?? ''}
                    onChange={(e) => setReviewForm((p) => ({ ...p, reviewer_name: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Review Date</label>
                  <input type="date" className="input text-sm" value={reviewForm.review_date ?? ''}
                    onChange={(e) => setReviewForm((p) => ({ ...p, review_date: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="label">Outcome</label>
                <select className="input text-sm" value={reviewForm.outcome ?? 'approved'}
                  onChange={(e) => setReviewForm((p) => ({ ...p, outcome: e.target.value as any }))}>
                  <option value="approved">Approved</option>
                  <option value="requires_changes">Requires Changes</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <div>
                <label className="label">Reason for Review</label>
                <input className="input text-sm" placeholder="e.g. Annual scheduled review"
                  value={reviewForm.reason ?? ''}
                  onChange={(e) => setReviewForm((p) => ({ ...p, reason: e.target.value }))} />
              </div>
              <div>
                <label className="label">Summary of Changes</label>
                <textarea className="input text-sm resize-none" rows={3}
                  placeholder="Describe what was reviewed and any changes made…"
                  value={reviewForm.summary ?? ''}
                  onChange={(e) => setReviewForm((p) => ({ ...p, summary: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
              <button onClick={() => setShowReviewModal(false)} className="btn-secondary text-sm">Cancel</button>
              <button onClick={saveReview} disabled={saving || !reviewForm.reviewer_name?.trim()} className="btn-primary text-sm gap-1.5">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {saving ? 'Saving…' : 'Record Review'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Explain Mapping Panel ── */}
      {showExplain && activeEvidence && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4 print:hidden">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-blue-500" />
                <h3 className="text-base font-bold text-slate-900">Explain Mapping</h3>
              </div>
              <button onClick={() => setShowExplain(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

              {/* Qual */}
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Qualification</p>
                <p className="text-sm font-bold text-slate-900">{qual.code}</p>
                <p className="text-sm text-slate-600">{qual.name}</p>
              </div>

              {/* ACSF levels */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2.5">Final ACSF Levels</p>
                <div className="grid grid-cols-5 gap-2">
                  {EVIDENCE_SKILL_KEYS.map(({ key, label }) => (
                    <div key={key} className="text-center">
                      <div className={`mx-auto w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold border-2 ${LEVEL_COLORS[(activeEvidence[key] as number) ?? 0]}`}>
                        {(activeEvidence[key] as number) ?? '—'}
                      </div>
                      <p className="text-xs text-slate-500 mt-1.5 leading-tight">{label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Methodology */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Methodology</p>
                <div className="bg-blue-50 rounded-xl p-3">
                  <p className="text-sm font-medium text-blue-800">{METHODOLOGY_LABELS[activeEvidence.methodology]}</p>
                  {activeEvidence.methodology_notes && (
                    <p className="text-xs text-blue-700 mt-1.5 whitespace-pre-line">{activeEvidence.methodology_notes}</p>
                  )}
                </div>
              </div>

              {/* Units summary */}
              {units.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Contributing Units ({units.length})
                  </p>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {units.map((u) => (
                      <div key={u.id} className="flex items-start gap-2 bg-slate-50 rounded-lg p-2.5">
                        <span className={`mt-0.5 shrink-0 px-1.5 py-0.5 rounded text-xs font-medium ${u.unit_type === 'core' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'}`}>
                          {u.unit_type === 'core' ? 'Core' : 'Elec'}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-700">{u.uoc_code} — {u.uoc_title}</p>
                          {u.reasoning && <p className="text-xs text-slate-500 mt-0.5 italic">{u.reasoning}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {activeEvidence.mapping_notes && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Supporting Notes</p>
                  <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed bg-slate-50 rounded-xl p-3">{activeEvidence.mapping_notes}</p>
                </div>
              )}

              {/* Evidence */}
              {attachments.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Source Evidence ({attachments.length})</p>
                  <div className="space-y-1.5">
                    {attachments.map((a) => (
                      <div key={a.id} className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
                        <FileText className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="font-medium">{a.title}</span>
                        <span className="text-slate-400">— {ATTACHMENT_TYPE_LABELS[a.evidence_type]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Latest review */}
              {reviews.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Latest Review</p>
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-xs font-medium text-slate-700">{reviews[0].reviewer_name} · {new Date(reviews[0].review_date).toLocaleDateString('en-AU')}</p>
                    <p className={`text-xs mt-0.5 font-medium ${reviews[0].outcome === 'approved' ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {reviews[0].outcome === 'approved' ? 'Approved' : reviews[0].outcome === 'requires_changes' ? 'Requires Changes' : 'Archived'}
                    </p>
                    {reviews[0].summary && <p className="text-xs text-slate-500 mt-1">{reviews[0].summary}</p>}
                  </div>
                </div>
              )}

              {/* Version */}
              <div className="flex items-center justify-between text-xs text-slate-400 bg-slate-50 rounded-xl px-3 py-2">
                <span>Version {activeEvidence.version_number}</span>
                <span>Created {new Date(activeEvidence.created_at).toLocaleDateString('en-AU')}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
