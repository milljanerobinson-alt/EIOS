import { useState, useEffect, useCallback } from 'react';
import {
  Brain, ChevronDown, ChevronRight, CheckCircle2, Clock, AlertCircle,
  FileText, BookOpen, Search, Filter, Download, RefreshCw, Eye,
  MessageSquare, History, ClipboardList, Award, Shield, Loader2,
  ChevronLeft, TrendingUp, Zap, Users, XCircle, Plus, Trash2,
  Sparkles, X, Pencil, Tag, AlertTriangle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

// ─── Types ─────────────────────────────────────────────────────────────────

type SkillType = 'reading' | 'writing' | 'oral_communication' | 'numeracy' | 'learning';

interface ACSFIndicator {
  id: string;
  skill_type: SkillType;
  level: number;
  indicator_code: string;
  descriptor_text: string;
  cognitive_demand: 'simple' | 'embedded' | 'complex';
  trigger_verbs: string[];
}

interface UoCEntry {
  uoc_code: string;
  uoc_title: string;
  training_package: string;
  reading_level: number;
  writing_level: number;
  oral_comm_level: number;
  numeracy_level: number;
  learning_level: number;
  task_tags: string[];
  complexity_indicators: string[];
}

interface FeatureEvidence {
  id?: string;
  skill_type: SkillType;
  supported_level: number;
  unit_code: string;
  unit_title: string;
  section_ref: string;
  excerpt: string;
  matched_indicator_code: string;
  matched_indicator_descriptor: string;
  feature_type: string;
  trigger_word: string;
  reasoning_note: string;
}

interface SkillAnalysis {
  recommended_level: number;
  confidence: number;
  matched_indicators: string[];
  trigger_patterns: string[];
  reasoning_steps: string[];
  unit_count: number;
}

interface EEAEAnalysis {
  id: string;
  qualification_code: string;
  qualification_name: string;
  aqf_level: string | null;
  training_package: string | null;
  status: 'draft' | 'in_review' | 'approved' | 'rejected';
  version: number;
  reading_level: number | null;
  writing_level: number | null;
  oral_level: number | null;
  numeracy_level: number | null;
  learning_level: number | null;
  reading_confidence: number | null;
  writing_confidence: number | null;
  oral_confidence: number | null;
  numeracy_confidence: number | null;
  learning_confidence: number | null;
  analysis_data: Record<string, SkillAnalysis>;
  units_analysed: number;
  indicators_matched: number;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface AuditEntry {
  id: string;
  analysis_id: string;
  actor_name: string;
  action: string;
  previous_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
}

interface QualRow {
  id: string;
  code: string;
  name: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const SKILLS: { key: SkillType; label: string; short: string; color: string; bg: string }[] = [
  { key: 'reading',            label: 'Reading',           short: 'Read', color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200' },
  { key: 'writing',            label: 'Writing',           short: 'Write', color: 'text-violet-700', bg: 'bg-violet-50 border-violet-200' },
  { key: 'oral_communication', label: 'Oral Communication', short: 'Oral', color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200' },
  { key: 'numeracy',           label: 'Numeracy',          short: 'Num',  color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  { key: 'learning',           label: 'Learning',          short: 'Learn', color: 'text-rose-700',   bg: 'bg-rose-50 border-rose-200' },
];

const LEVEL_FIELD: Record<SkillType, keyof EEAEAnalysis> = {
  reading: 'reading_level', writing: 'writing_level',
  oral_communication: 'oral_level', numeracy: 'numeracy_level', learning: 'learning_level',
};
const CONF_FIELD: Record<SkillType, keyof EEAEAnalysis> = {
  reading: 'reading_confidence', writing: 'writing_confidence',
  oral_communication: 'oral_confidence', numeracy: 'numeracy_confidence', learning: 'learning_confidence',
};

const STATUS_CONFIG = {
  draft:     { label: 'Draft',       bg: 'bg-slate-100 text-slate-700',  icon: Clock },
  in_review: { label: 'In Review',   bg: 'bg-amber-100 text-amber-700',  icon: Eye },
  approved:  { label: 'Approved',    bg: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  rejected:  { label: 'Rejected',    bg: 'bg-rose-100 text-rose-700',    icon: XCircle },
};

// ─── Engine ─────────────────────────────────────────────────────────────────

function runEngine(
  units: UoCEntry[],
  indicators: ACSFIndicator[],
  skill: SkillType,
): SkillAnalysis {
  const skillLevelKey = ({
    reading: 'reading_level', writing: 'writing_level',
    oral_communication: 'oral_comm_level', numeracy: 'numeracy_level', learning: 'learning_level',
  } as Record<SkillType, string>)[skill];

  const relevantUnits = units.filter((u) => (u as unknown as Record<string, number>)[skillLevelKey] > 0);
  const skillIndicators = indicators.filter((i) => i.skill_type === skill);

  // For each unit, find matching indicators
  const matchedSet = new Map<string, { indicator: ACSFIndicator; units: Set<string>; trigger: string }>();

  for (const unit of relevantUnits) {
    const allTags = [...(unit.task_tags ?? []), ...(unit.complexity_indicators ?? [])].join(' ').toLowerCase();
    for (const ind of skillIndicators) {
      const hit = ind.trigger_verbs.find((v) => allTags.includes(v.toLowerCase()));
      if (hit) {
        const existing = matchedSet.get(ind.indicator_code);
        if (existing) {
          existing.units.add(unit.uoc_code);
        } else {
          matchedSet.set(ind.indicator_code, { indicator: ind, units: new Set([unit.uoc_code]), trigger: hit });
        }
      }
    }
  }

  // Determine highest level with ≥1 match
  let recommendedLevel = 0;
  let confidence = 0;
  const matchedByLevel = new Map<number, { indicator: ACSFIndicator; units: Set<string>; trigger: string }[]>();
  for (const [, v] of matchedSet) {
    const lvl = v.indicator.level;
    if (!matchedByLevel.has(lvl)) matchedByLevel.set(lvl, []);
    matchedByLevel.get(lvl)!.push(v);
  }

  for (let lvl = 5; lvl >= 1; lvl--) {
    const matches = matchedByLevel.get(lvl) ?? [];
    const totalAtLevel = skillIndicators.filter((i) => i.level === lvl).length || 1;
    if (matches.length >= 1) {
      const unitCount = new Set(matches.flatMap((m) => [...m.units])).size;
      recommendedLevel = lvl;
      confidence = Math.min(0.97, (matches.length / totalAtLevel) * (0.7 + Math.min(unitCount, 5) * 0.06));
      break;
    }
  }

  // Build output
  const allMatched = [...matchedSet.values()].filter((m) => m.indicator.level <= recommendedLevel);
  const matched_indicators = allMatched.map((m) => m.indicator.indicator_code);
  const trigger_patterns = [...new Set(allMatched.map((m) => m.trigger))];

  const reasoning_steps: string[] = [];
  if (recommendedLevel === 0) {
    reasoning_steps.push('No units with matching ACSF indicators found for this skill.');
  } else {
    const cog = allMatched.map((m) => m.indicator.cognitive_demand).filter(Boolean);
    const hasCog = (d: string) => cog.includes(d);
    if (hasCog('complex')) reasoning_steps.push(`Units require complex, multi-step ${skill.replace('_', ' ')} tasks.`);
    if (hasCog('embedded')) reasoning_steps.push(`Embedded ${skill.replace('_', ' ')} tasks identified — meaning not always stated directly.`);
    if (hasCog('simple')) reasoning_steps.push(`Familiar, procedural ${skill.replace('_', ' ')} tasks underpin unit requirements.`);
    const uocCount = new Set(allMatched.flatMap((m) => [...m.units])).size;
    reasoning_steps.push(`${uocCount} unit(s) provide supporting evidence across ${matched_indicators.length} matched ACSF indicator(s).`);
    reasoning_steps.push(`Trigger patterns detected: ${trigger_patterns.slice(0, 4).join(', ')}.`);
    reasoning_steps.push(`Complexity aligns most strongly with ACSF Level ${recommendedLevel} descriptors.`);
  }

  return {
    recommended_level: recommendedLevel,
    confidence,
    matched_indicators,
    trigger_patterns,
    reasoning_steps,
    unit_count: new Set(allMatched.flatMap((m) => [...m.units])).size,
  };
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function ConfidenceBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-[11px] text-slate-400">—</span>;
  const pct = Math.round(value * 100);
  const cls = value >= 0.75 ? 'bg-emerald-100 text-emerald-700' : value >= 0.5 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700';
  return <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${cls}`}>{pct}%</span>;
}

function LevelDots({ level, max = 5 }: { level: number | null; max?: number }) {
  if (!level) return <span className="text-slate-400 text-sm">—</span>;
  return (
    <div className="flex gap-1 items-center">
      {Array.from({ length: max }, (_, i) => (
        <div key={i} className={`w-2.5 h-2.5 rounded-full ${i < level ? 'bg-primary-500' : 'bg-slate-200'}`} />
      ))}
      <span className="text-sm font-bold text-slate-800 ml-1">{level}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: EEAEAnalysis['status'] }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.bg}`}>
      <Icon className="w-3.5 h-3.5" /> {cfg.label}
    </span>
  );
}

// ─── EAEEPage ─────────────────────────────────────────────────────────────────

export function EAEEPage() {
  const { profile } = useAuth();
  const [view, setView] = useState<'list' | 'run' | 'detail' | 'library'>('list');
  const [analyses, setAnalyses] = useState<EEAEAnalysis[]>([]);
  const [selected, setSelected] = useState<EEAEAnalysis | null>(null);
  const [qualifications, setQualifications] = useState<QualRow[]>([]);
  const [selectedQualId, setSelectedQualId] = useState('');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<'summary' | 'reasoning' | 'evidence' | 'review' | 'audit'>('summary');
  const [evidence, setEvidence] = useState<FeatureEvidence[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [expandedSkill, setExpandedSkill] = useState<SkillType | null>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [evidenceSkillFilter, setEvidenceSkillFilter] = useState('');
  const [editingLevels, setEditingLevels] = useState(false);
  const [manualLevels, setManualLevels] = useState<Partial<Record<SkillType, number>>>({});
  const [savingManual, setSavingManual] = useState(false);

  // ── Library state ────────────────────────────────────────────────────────────
  const [libEntries, setLibEntries] = useState<UoCEntry[]>([]);
  const [libLoading, setLibLoading] = useState(false);
  const [libSearch, setLibSearch] = useState('');
  const [showAIDrawer, setShowAIDrawer] = useState(false);
  const [editingEntry, setEditingEntry] = useState<UoCEntry | null>(null);
  const [extractForm, setExtractForm] = useState({ unit_code: '', unit_title: '', foundation_skills_text: '' });
  const [extracted, setExtracted] = useState<(UoCEntry & { evidence_basis?: string; source_type?: string; confidence?: string }) | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  const [savingUnit, setSavingUnit] = useState(false);

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadAnalyses = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('eaee_analyses')
      .select('*')
      .order('updated_at', { ascending: false });
    setAnalyses((data ?? []) as EEAEAnalysis[]);
    setLoading(false);
  }, []);

  const loadQualifications = useCallback(async () => {
    const { data } = await supabase
      .from('qualifications')
      .select('id, code, name')
      .eq('active', true)
      .order('code');
    setQualifications((data ?? []) as QualRow[]);
  }, []);

  const loadEvidence = useCallback(async (analysisId: string) => {
    const { data } = await supabase
      .from('eaee_feature_evidence')
      .select('*')
      .eq('analysis_id', analysisId)
      .order('skill_type, supported_level');
    setEvidence((data ?? []) as FeatureEvidence[]);
  }, []);

  const loadAuditLog = useCallback(async (analysisId: string) => {
    const { data } = await supabase
      .from('eaee_audit_log')
      .select('*')
      .eq('analysis_id', analysisId)
      .order('created_at', { ascending: false });
    setAuditLog((data ?? []) as AuditEntry[]);
  }, []);

  useEffect(() => { loadAnalyses(); loadQualifications(); }, [loadAnalyses, loadQualifications]);

  const loadLibrary = useCallback(async () => {
    setLibLoading(true);
    const { data } = await supabase
      .from('uoc_acsf_library')
      .select('uoc_code, uoc_title, training_package, reading_level, writing_level, oral_comm_level, numeracy_level, learning_level, task_tags, complexity_indicators')
      .order('training_package, uoc_code');
    setLibEntries((data ?? []) as UoCEntry[]);
    setLibLoading(false);
  }, []);

  useEffect(() => { if (view === 'library') loadLibrary(); }, [view, loadLibrary]);

  async function runExtraction() {
    if (!extractForm.unit_code || !extractForm.foundation_skills_text) return;
    setExtracting(true);
    setExtractError('');
    setExtracted(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-tga-unit`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            unit_code: extractForm.unit_code.trim().toUpperCase(),
            unit_title: extractForm.unit_title.trim() || undefined,
            foundation_skills_text: extractForm.foundation_skills_text,
          }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Extraction failed');
      setExtracted(json);
    } catch (e) {
      setExtractError(e instanceof Error ? e.message : 'Extraction failed');
    } finally {
      setExtracting(false);
    }
  }

  async function saveUnit() {
    const entry = extracted ?? (editingEntry as typeof extracted);
    if (!entry) return;
    setSavingUnit(true);
    const row = {
      uoc_code: entry.uoc_code,
      uoc_title: entry.uoc_title,
      training_package: entry.training_package,
      reading_level: entry.reading_level,
      writing_level: entry.writing_level,
      oral_comm_level: entry.oral_comm_level,
      numeracy_level: entry.numeracy_level,
      learning_level: entry.learning_level,
      task_tags: entry.task_tags,
      complexity_indicators: entry.complexity_indicators,
      ...(entry.evidence_basis ? { evidence_basis: entry.evidence_basis } : {}),
      ...(entry.source_type ? { source_type: entry.source_type } : {}),
      ...(entry.confidence ? { confidence: entry.confidence } : {}),
      last_updated: new Date().toISOString(),
    };
    await supabase.from('uoc_acsf_library').upsert(row, { onConflict: 'uoc_code' });
    setSavingUnit(false);
    setShowAIDrawer(false);
    setEditingEntry(null);
    setExtracted(null);
    setExtractForm({ unit_code: '', unit_title: '', foundation_skills_text: '' });
    await loadLibrary();
  }

  async function deleteUnit(code: string) {
    if (!confirm(`Delete ${code} from the library?`)) return;
    await supabase.from('uoc_acsf_library').delete().eq('uoc_code', code);
    await loadLibrary();
  }

  useEffect(() => {
    if (selected) { loadEvidence(selected.id); loadAuditLog(selected.id); }
  }, [selected, loadEvidence, loadAuditLog]);

  // ── Run Analysis Engine ─────────────────────────────────────────────────────

  async function runAnalysis() {
    if (!selectedQualId || !profile) return;
    setRunning(true);
    try {
      const qual = qualifications.find((q) => q.id === selectedQualId);
      if (!qual) return;

      const tpMatch = qual.code.match(/^([A-Z]+)/i);
      const trainingPackage = tpMatch ? tpMatch[1].toUpperCase() : '';

      const [{ data: uocs }, { data: indicators }] = await Promise.all([
        trainingPackage
          ? supabase.from('uoc_acsf_library').select('*').eq('training_package', trainingPackage)
          : supabase.from('uoc_acsf_library').select('*').limit(0),
        supabase.from('acsf_indicator_library').select('*'),
      ]);

      const units = (uocs ?? []) as UoCEntry[];
      const allIndicators = (indicators ?? []) as ACSFIndicator[];

      const skillResults: Record<string, SkillAnalysis> = {};
      const allEvidenceItems: Omit<FeatureEvidence, 'id'>[] = [];

      for (const skill of SKILLS) {
        const result = runEngine(units, allIndicators, skill.key);
        skillResults[skill.key] = result;

        // Build evidence items for matched indicators
        const skillLevelKey = ({
          reading: 'reading_level', writing: 'writing_level',
          oral_communication: 'oral_comm_level', numeracy: 'numeracy_level', learning: 'learning_level',
        } as Record<SkillType, string>)[skill.key];

        const relevantUnits = units.filter(
          (u) => (u as unknown as Record<string, number>)[skillLevelKey] > 0
        );
        const skillIndicators = allIndicators.filter((i) => i.skill_type === skill.key);

        for (const unit of relevantUnits) {
          const allTags = [...(unit.task_tags ?? []), ...(unit.complexity_indicators ?? [])].join(' ').toLowerCase();
          for (const ind of skillIndicators) {
            if (ind.level > result.recommended_level) continue;
            const hit = ind.trigger_verbs.find((v) => allTags.includes(v.toLowerCase()));
            if (hit) {
              const matchingTag = [...(unit.task_tags ?? []), ...(unit.complexity_indicators ?? [])].find(
                (t) => t.toLowerCase().includes(hit.toLowerCase())
              ) ?? hit;
              allEvidenceItems.push({
                skill_type: skill.key,
                supported_level: ind.level,
                unit_code: unit.uoc_code,
                unit_title: unit.uoc_title ?? unit.uoc_code,
                section_ref: 'Unit Descriptor / Foundation Skills',
                excerpt: `"${matchingTag}" — ${unit.uoc_code}`,
                matched_indicator_code: ind.indicator_code,
                matched_indicator_descriptor: ind.descriptor_text,
                feature_type: 'task_pattern',
                trigger_word: hit,
                reasoning_note: `${ind.indicator_code}: ${ind.descriptor_text}`,
              });
            }
          }
        }
      }

      const totalIndicatorsMatched = new Set(allEvidenceItems.map((e) => e.matched_indicator_code)).size;

      // Upsert analysis record
      const { data: saved, error: saveErr } = await supabase
        .from('eaee_analyses')
        .insert({
          org_id: profile.id,
          qualification_id: qual.id,
          qualification_code: qual.code,
          qualification_name: qual.name,
          training_package: trainingPackage,
          status: 'draft',
          version: 1,
          reading_level: skillResults.reading.recommended_level || null,
          writing_level: skillResults.writing.recommended_level || null,
          oral_level: skillResults.oral_communication.recommended_level || null,
          numeracy_level: skillResults.numeracy.recommended_level || null,
          learning_level: skillResults.learning.recommended_level || null,
          reading_confidence: skillResults.reading.confidence || null,
          writing_confidence: skillResults.writing.confidence || null,
          oral_confidence: skillResults.oral_communication.confidence || null,
          numeracy_confidence: skillResults.numeracy.confidence || null,
          learning_confidence: skillResults.learning.confidence || null,
          analysis_data: skillResults,
          units_analysed: units.length,
          indicators_matched: totalIndicatorsMatched,
          created_by: profile.id,
        })
        .select()
        .single();

      if (saveErr || !saved) throw saveErr;

      // Save evidence
      if (allEvidenceItems.length > 0) {
        await supabase.from('eaee_feature_evidence').insert(
          allEvidenceItems.map((e) => ({ ...e, analysis_id: saved.id }))
        );
      }

      // Audit log
      await supabase.from('eaee_audit_log').insert({
        analysis_id: saved.id,
        actor_id: profile.id,
        actor_name: profile.full_name,
        action: 'analysis_created',
        new_value: { units_analysed: units.length, indicators_matched: totalIndicatorsMatched },
      });

      await loadAnalyses();
      setSelected(saved as EEAEAnalysis);
      setActiveTab('summary');
      setView('detail');
    } finally {
      setRunning(false);
    }
  }

  // ── Review actions ──────────────────────────────────────────────────────────

  async function submitReview(action: 'in_review' | 'approved' | 'rejected') {
    if (!selected || !profile) return;
    setReviewLoading(true);
    const prev = selected.status;
    const { data: updated } = await supabase
      .from('eaee_analyses')
      .update({
        status: action,
        reviewed_by: profile.id,
        reviewed_at: new Date().toISOString(),
        review_notes: reviewComment || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', selected.id)
      .select()
      .single();

    await supabase.from('eaee_audit_log').insert({
      analysis_id: selected.id,
      actor_id: profile.id,
      actor_name: profile.full_name,
      action: `status_changed_to_${action}`,
      previous_value: { status: prev },
      new_value: { status: action, notes: reviewComment || null },
    });

    if (updated) setSelected(updated as EEAEAnalysis);
    setReviewComment('');
    setReviewLoading(false);
    await loadAuditLog(selected.id);
    await loadAnalyses();
  }

  // ── Manual level save ───────────────────────────────────────────────────────

  async function saveManualLevels() {
    if (!selected || !profile) return;
    setSavingManual(true);
    const levelMap: Record<SkillType, keyof EEAEAnalysis> = {
      reading: 'reading_level', writing: 'writing_level',
      oral_communication: 'oral_level', numeracy: 'numeracy_level', learning: 'learning_level',
    };
    const updates: Record<string, number | null> = {};
    for (const [sk, field] of Object.entries(levelMap) as [SkillType, keyof EEAEAnalysis][]) {
      if (manualLevels[sk] !== undefined) updates[field as string] = manualLevels[sk] as number;
    }
    const prevLevels: Record<string, unknown> = {};
    for (const [sk, field] of Object.entries(levelMap) as [SkillType, keyof EEAEAnalysis][]) {
      prevLevels[field as string] = selected[field];
    }
    const { data: updated } = await supabase
      .from('eaee_analyses')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', selected.id)
      .select()
      .single();

    await supabase.from('eaee_audit_log').insert({
      analysis_id: selected.id,
      actor_id: profile.id,
      actor_name: profile.full_name,
      action: 'levels_set_manually',
      previous_value: prevLevels,
      new_value: updates,
    });

    if (updated) setSelected(updated as EEAEAnalysis);
    setManualLevels({});
    setEditingLevels(false);
    setSavingManual(false);
    await loadAuditLog(selected.id);
  }

  // ── PDF Export ──────────────────────────────────────────────────────────────

  function exportPDF() { window.print(); }

  // ── Filtered list ───────────────────────────────────────────────────────────

  const filteredAnalyses = analyses.filter((a) => {
    const matchesSearch = !searchTerm || a.qualification_code.toLowerCase().includes(searchTerm.toLowerCase()) || a.qualification_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = !filterStatus || a.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  // ── Render ──────────────────────────────────────────────────────────────────

  if (view === 'list') {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <Brain className="w-4.5 h-4.5 text-white" />
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 truncate">Explainable ACSF Evidence Engine</h1>
            </div>
            <p className="text-slate-500 text-sm ml-10">Evidence-first ACSF mapping with full reasoning chains.</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => { setSelectedQualId(''); setView('run'); }}
              className="inline-flex items-center gap-2 px-3 sm:px-4 py-2.5 bg-primary-600 text-white text-sm font-bold rounded-xl hover:bg-primary-700 transition-all shadow-sm"
            >
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">New Analysis</span><span className="sm:hidden">New</span>
            </button>
            <button
              onClick={() => setView('library')}
              className="inline-flex items-center gap-2 px-3 sm:px-4 py-2.5 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-50 transition-all shadow-sm"
            >
              <BookOpen className="w-4 h-4" /> <span className="hidden sm:inline">UoC Library</span><span className="sm:hidden">Library</span>
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Analyses', value: analyses.length, color: 'text-slate-900' },
            { label: 'Approved', value: analyses.filter((a) => a.status === 'approved').length, color: 'text-emerald-600' },
            { label: 'In Review', value: analyses.filter((a) => a.status === 'in_review').length, color: 'text-amber-600' },
            { label: 'Draft', value: analyses.filter((a) => a.status === 'draft').length, color: 'text-slate-500' },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3 shadow-sm">
              <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by qualification code or name…"
              className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-300"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="border border-slate-200 rounded-xl text-sm px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary-300 text-slate-700"
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="in_review">In Review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        {/* Analyses table */}
        {loading ? (
          <div className="flex items-center justify-center h-48 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading analyses…
          </div>
        ) : filteredAnalyses.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center shadow-sm">
            <div className="w-14 h-14 bg-primary-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Brain className="w-7 h-7 text-primary-400" />
            </div>
            <p className="text-slate-700 font-semibold mb-1">No analyses yet</p>
            <p className="text-slate-400 text-sm mb-5">Select a qualification and run your first ACSF evidence analysis.</p>
            <button onClick={() => setView('run')} className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white text-sm font-bold rounded-xl hover:bg-primary-700">
              <Plus className="w-4 h-4" /> Run First Analysis
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="hidden sm:grid grid-cols-12 px-5 py-3 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <div className="col-span-4">Qualification</div>
              <div className="col-span-4">ACSF Levels</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2">Updated</div>
            </div>
            {filteredAnalyses.map((a) => (
              <div
                key={a.id}
                onClick={() => { setSelected(a); setActiveTab('summary'); setView('detail'); }}
                className="border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer transition-colors"
              >
                {/* Mobile card */}
                <div className="sm:hidden px-4 py-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{a.qualification_code}</p>
                      <p className="text-xs text-slate-500">{a.qualification_name}</p>
                    </div>
                    <StatusBadge status={a.status} />
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {SKILLS.map((s) => {
                      const lvl = a[LEVEL_FIELD[s.key]] as number | null;
                      const conf = a[CONF_FIELD[s.key]] as number | null;
                      return lvl ? (
                        <div key={s.key} className={`text-[10px] font-bold px-2 py-0.5 rounded border ${s.bg} ${s.color}`}>
                          {s.short} L{lvl}
                          {conf && <span className="ml-1 font-normal opacity-70">{Math.round(conf * 100)}%</span>}
                        </div>
                      ) : null;
                    })}
                  </div>
                  <p className="text-[10px] text-slate-400">{a.units_analysed} units · {a.indicators_matched} indicators · {new Date(a.updated_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</p>
                </div>
                {/* Desktop row */}
                <div className="hidden sm:grid grid-cols-12 px-5 py-4 items-center">
                  <div className="col-span-4">
                    <p className="text-sm font-bold text-slate-900">{a.qualification_code}</p>
                    <p className="text-xs text-slate-500 truncate">{a.qualification_name}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{a.units_analysed} units · {a.indicators_matched} indicators</p>
                  </div>
                  <div className="col-span-4 flex gap-1.5 flex-wrap">
                    {SKILLS.map((s) => {
                      const lvl = a[LEVEL_FIELD[s.key]] as number | null;
                      const conf = a[CONF_FIELD[s.key]] as number | null;
                      return lvl ? (
                        <div key={s.key} className={`text-[10px] font-bold px-2 py-0.5 rounded border ${s.bg} ${s.color}`}>
                          {s.short} L{lvl}
                          {conf && <span className="ml-1 font-normal opacity-70">{Math.round(conf * 100)}%</span>}
                        </div>
                      ) : null;
                    })}
                  </div>
                  <div className="col-span-2"><StatusBadge status={a.status} /></div>
                  <div className="col-span-2 text-xs text-slate-400">
                    {new Date(a.updated_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Run view ────────────────────────────────────────────────────────────────

  if (view === 'run') {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <button onClick={() => setView('list')} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ChevronLeft className="w-4 h-4" /> Back to analyses
        </button>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-primary-700 to-primary-800 px-8 py-7">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
                <Brain className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-xl font-extrabold text-white">Run New Analysis</h2>
            </div>
            <p className="text-primary-200 text-sm ml-12">The engine will extract features from your unit library, match them against ACSF indicators, and produce an explainable evidence chain.</p>
          </div>
          <div className="p-8 space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Select Qualification</label>
              <select
                value={selectedQualId}
                onChange={(e) => setSelectedQualId(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-300 text-slate-800"
              >
                <option value="">— Choose a qualification —</option>
                {qualifications.map((q) => (
                  <option key={q.id} value={q.id}>{q.code} — {q.name}</option>
                ))}
              </select>
            </div>

            {selectedQualId && (
              <div className="bg-primary-50 border border-primary-100 rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-primary-700 uppercase tracking-wide">What the engine will do</p>
                {[
                  'Load all units from the UoC ACSF library matching this qualification\'s training package',
                  'Match unit task tags and complexity indicators against the ACSF indicator library',
                  'Score matched indicators per skill across all units',
                  'Determine the highest supported ACSF level per skill with evidence',
                  'Generate a transparent reasoning chain — no black-box scoring',
                  'Store the full evidence trail for audit and review',
                ].map((step, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <span className="w-5 h-5 rounded-full bg-primary-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                    <p className="text-xs text-primary-800">{step}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex gap-2 items-start">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800"><strong>Human review required.</strong> All outputs are drafts. A qualified trainer or compliance officer must review and approve before any ACSF mapping is used for compliance purposes.</p>
              </div>
            </div>

            <button
              onClick={runAnalysis}
              disabled={!selectedQualId || running}
              className="w-full py-4 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base shadow-md"
            >
              {running ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Running analysis…</>
              ) : (
                <><Zap className="w-5 h-5" /> Run ACSF Evidence Analysis</>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Detail view ─────────────────────────────────────────────────────────────

  if (view === 'detail' && selected) {
    const tabs = [
      { id: 'summary',   label: 'Summary',      icon: TrendingUp },
      { id: 'reasoning', label: 'Reasoning',     icon: Brain },
      { id: 'evidence',  label: 'Evidence',      icon: FileText },
      { id: 'review',    label: 'Review',        icon: CheckCircle2 },
      { id: 'audit',     label: 'Audit Log',     icon: History },
    ] as const;

    const filteredEvidence = evidence.filter((e) =>
      !evidenceSkillFilter || e.skill_type === evidenceSkillFilter
    );

    return (
      <div className="max-w-6xl mx-auto space-y-5 print:space-y-6">
        {/* Back nav */}
        <div className="flex items-center justify-between print:hidden">
          <button onClick={() => setView('list')} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
            <ChevronLeft className="w-4 h-4" /> All analyses
          </button>
          <div className="flex gap-2">
            <button onClick={() => runAnalysis()} className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-sm text-slate-600 font-semibold rounded-xl hover:bg-slate-50">
              <RefreshCw className="w-3.5 h-3.5" /> Re-run
            </button>
            <button onClick={exportPDF} className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-sm text-slate-600 font-semibold rounded-xl hover:bg-slate-50">
              <Download className="w-3.5 h-3.5" /> Export PDF
            </button>
            {selected.status === 'draft' && (
              <button onClick={() => submitReview('in_review')} className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white text-sm font-bold rounded-xl hover:bg-amber-600">
                <Eye className="w-3.5 h-3.5" /> Submit for Review
              </button>
            )}
            {selected.status === 'in_review' && (
              <button onClick={() => submitReview('approved')} className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5" /> Approve
              </button>
            )}
          </div>
        </div>

        {/* Analysis header */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden print:border-0 print:shadow-none">
          <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-7 py-6 print:bg-white print:text-slate-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Brain className="w-5 h-5 text-primary-400 print:text-primary-600" />
                  <span className="text-xs font-semibold text-slate-400 print:text-slate-500 uppercase tracking-widest">ACSF Evidence Report</span>
                </div>
                <h2 className="text-xl font-extrabold text-white print:text-slate-900">{selected.qualification_code}</h2>
                <p className="text-slate-300 print:text-slate-600">{selected.qualification_name}</p>
                {selected.training_package && (
                  <p className="text-xs text-slate-400 mt-0.5">Training Package: {selected.training_package} · {selected.units_analysed} units analysed · {selected.indicators_matched} indicators matched</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                <StatusBadge status={selected.status} />
                <span className="text-xs text-slate-400">v{selected.version} · {new Date(selected.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white rounded-xl border border-slate-200 p-1 shadow-sm print:hidden">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === tab.id ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon className="w-4 h-4" /> <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── Summary tab ── */}
        {(activeTab === 'summary') && (
          <div className="space-y-4">
            {/* Empty state warning */}
            {selected.units_analysed === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-800 mb-1">No units found in the UoC library</p>
                  <p className="text-xs text-amber-700 leading-relaxed mb-3">
                    The ACSF evidence engine searches the UoC ACSF library by training package prefix (e.g. BSB, CHC, CPC).
                    {selected.training_package
                      ? ` No units were found for training package "${selected.training_package}".`
                      : ` No training package could be extracted from qualification code "${selected.qualification_code}".`}
                    {' '}The library currently includes BSB, CHC, CPC, SIT, ICT, TAE, FNS, HLT and SIS units.
                  </p>
                  <p className="text-xs text-amber-700">You can set ACSF levels manually below and add evidence in the Evidence tab.</p>
                </div>
                {!editingLevels && (
                  <button
                    onClick={() => setEditingLevels(true)}
                    className="flex-shrink-0 px-3 py-2 bg-amber-600 text-white text-xs font-bold rounded-lg hover:bg-amber-700 transition-all self-start"
                  >
                    Set Manually
                  </button>
                )}
              </div>
            )}

            {/* Edit toggle for non-empty analyses */}
            {selected.units_analysed > 0 && !editingLevels && (
              <div className="flex justify-end">
                <button
                  onClick={() => setEditingLevels(true)}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-500 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 font-semibold"
                >
                  Override Levels
                </button>
              </div>
            )}

            {/* Skill cards */}
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
              {SKILLS.map((s) => {
                const currentLvl = selected[LEVEL_FIELD[s.key]] as number | null;
                const conf = selected[CONF_FIELD[s.key]] as number | null;
                const pct = conf ? Math.round(conf * 100) : 0;
                const confClass = pct >= 75 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : pct > 0 ? 'text-rose-500' : 'text-slate-400';
                const displayLvl = manualLevels[s.key] ?? currentLvl;
                const isManual = manualLevels[s.key] !== undefined;

                return (
                  <div key={s.key} className={`bg-white rounded-2xl border-2 ${s.bg} p-5 text-center shadow-sm`}>
                    <p className={`text-xs font-bold uppercase tracking-wide ${s.color} mb-3`}>{s.label}</p>

                    {editingLevels ? (
                      <div className="mb-3">
                        <select
                          value={manualLevels[s.key] ?? currentLvl ?? ''}
                          onChange={(e) => setManualLevels((prev) => ({
                            ...prev,
                            [s.key]: e.target.value ? Number(e.target.value) : undefined,
                          }))}
                          className={`w-full border rounded-lg px-2 py-1.5 text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-primary-300 ${isManual ? 'border-primary-400 bg-primary-50' : 'border-slate-200 bg-white'}`}
                        >
                          <option value="">— Not set —</option>
                          {[1, 2, 3, 4, 5].map((l) => <option key={l} value={l}>Level {l}</option>)}
                        </select>
                        {isManual && <p className="text-[10px] text-primary-600 font-semibold mt-1">Modified</p>}
                      </div>
                    ) : (
                      <>
                        <p className="text-4xl font-extrabold text-slate-900 leading-none">{displayLvl ?? '—'}</p>
                        <p className="text-xs text-slate-400 mt-1 mb-2">ACSF Level</p>
                        <div className="flex justify-center gap-0.5 mb-2">
                          {Array.from({ length: 5 }, (_, i) => (
                            <div key={i} className={`w-3 h-1.5 rounded-full ${displayLvl && i < displayLvl ? 'bg-primary-500' : 'bg-slate-200'}`} />
                          ))}
                        </div>
                        {conf != null && conf > 0 && (
                          <p className={`text-sm font-bold ${confClass}`}>{pct}% confidence</p>
                        )}
                        {(!displayLvl) && <p className="text-xs text-slate-400">Not set</p>}
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Manual save / cancel */}
            {editingLevels && (
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setEditingLevels(false); setManualLevels({}); }}
                  className="px-4 py-2.5 border border-slate-200 text-slate-600 text-sm font-semibold rounded-xl hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={saveManualLevels}
                  disabled={savingManual || Object.keys(manualLevels).length === 0}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white text-sm font-bold rounded-xl hover:bg-primary-700 disabled:opacity-50 transition-all"
                >
                  {savingManual ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><CheckCircle2 className="w-4 h-4" /> Save Levels</>}
                </button>
              </div>
            )}

            {/* Methodology disclaimer */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex gap-3">
              <Shield className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-1">Methodology</p>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {selected.units_analysed > 0
                    ? `This report was generated using a rules-based explainable evidence engine. ACSF levels are determined by matching unit task patterns and complexity indicators from ${selected.units_analysed} unit(s) against the ACSF indicator library. Confidence scores reflect the proportion of level indicators matched.`
                    : 'ACSF levels for this qualification were set manually by a reviewer. No automated unit matching was performed. Evidence should be added manually in the Evidence tab to support these levels.'}
                  {' '}All outputs are draft and require human review and approval before use for compliance purposes.
                </p>
              </div>
            </div>

            {/* Print footer */}
            <div className="hidden print:block border-t border-slate-300 pt-4 mt-6">
              <p className="text-xs text-slate-500 text-center italic">
                This report is generated using an explainable ACSF evidence engine. Final responsibility for ACSF mapping remains with the RTO.
                Generated: {new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>
        )}

        {/* ── Reasoning tab ── */}
        {activeTab === 'reasoning' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-400 font-medium">Click a skill to expand the full reasoning chain, matched indicators, and trigger patterns.</p>
            {SKILLS.map((s) => {
              const lvl = selected[LEVEL_FIELD[s.key]] as number | null;
              const conf = selected[CONF_FIELD[s.key]] as number | null;
              const analysis = selected.analysis_data[s.key] as SkillAnalysis | undefined;
              const isOpen = expandedSkill === s.key;

              return (
                <div key={s.key} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <button
                    onClick={() => setExpandedSkill(isOpen ? null : s.key)}
                    className="w-full flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors text-left"
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.bg} ${s.color} flex-shrink-0`}>
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900">{s.label}</span>
                        {lvl && <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.bg} ${s.color}`}>Level {lvl}</span>}
                        <ConfidenceBadge value={conf} />
                        {analysis && <span className="text-xs text-slate-400">{analysis.matched_indicators.length} indicators matched · {analysis.unit_count} unit(s)</span>}
                      </div>
                      {analysis && analysis.reasoning_steps[0] && (
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{analysis.reasoning_steps[0]}</p>
                      )}
                    </div>
                    {isOpen ? <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" /> : <ChevronRight className="w-5 h-5 text-slate-400 flex-shrink-0" />}
                  </button>

                  {isOpen && analysis && (
                    <div className="border-t border-slate-100 px-6 py-5 space-y-5 bg-slate-50/50">
                      {/* Reasoning steps */}
                      <div>
                        <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-3">Reasoning Chain</p>
                        <div className="space-y-2">
                          {analysis.reasoning_steps.map((step, i) => (
                            <div key={i} className="flex gap-3 items-start">
                              <span className="w-5 h-5 rounded-full bg-primary-100 text-primary-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                              <p className="text-sm text-slate-700">{step}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Matched indicators */}
                      {analysis.matched_indicators.length > 0 && (
                        <div>
                          <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-3">Matched ACSF Indicators</p>
                          <div className="flex flex-wrap gap-2">
                            {analysis.matched_indicators.map((code) => (
                              <span key={code} className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${s.bg} ${s.color}`}>{code}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Trigger patterns */}
                      {analysis.trigger_patterns.length > 0 && (
                        <div>
                          <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-3">Trigger Patterns Detected</p>
                          <div className="flex flex-wrap gap-2">
                            {analysis.trigger_patterns.map((p) => (
                              <span key={p} className="text-xs bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-1 rounded-lg font-mono">{p}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Supporting evidence preview */}
                      {evidence.filter((e) => e.skill_type === s.key).slice(0, 4).map((ev, i) => (
                        <div key={i} className="bg-white rounded-xl border border-slate-200 p-4">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-xs font-bold text-primary-700 bg-primary-50 px-2 py-0.5 rounded">{ev.unit_code}</span>
                            <span className="text-xs text-slate-500">{ev.section_ref}</span>
                            <span className={`text-[10px] font-bold ml-auto px-2 py-0.5 rounded-full ${s.bg} ${s.color}`}>{ev.matched_indicator_code}</span>
                          </div>
                          <p className="text-sm text-slate-700 italic mb-1">{ev.excerpt}</p>
                          <p className="text-xs text-slate-400">{ev.reasoning_note}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Evidence tab ── */}
        {activeTab === 'evidence' && (
          <div className="space-y-4">
            <div className="flex gap-2 flex-wrap items-center">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={evidenceSkillFilter}
                onChange={(e) => setEvidenceSkillFilter(e.target.value)}
                className="border border-slate-200 rounded-xl text-sm px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary-300 text-slate-700"
              >
                <option value="">All skills</option>
                {SKILLS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              <span className="text-xs text-slate-400">{filteredEvidence.length} evidence items</span>
            </div>

            {filteredEvidence.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400 text-sm">No evidence items found.</div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="grid grid-cols-12 px-5 py-3 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  <div className="col-span-2">Unit</div>
                  <div className="col-span-2">Skill / Level</div>
                  <div className="col-span-2">Indicator</div>
                  <div className="col-span-3">Excerpt</div>
                  <div className="col-span-3">Reasoning</div>
                </div>
                {filteredEvidence.map((ev, i) => {
                  const sk = SKILLS.find((s) => s.key === ev.skill_type);
                  return (
                    <div key={ev.id ?? i} className="grid grid-cols-12 px-5 py-3 border-b border-slate-100 last:border-0 items-start text-xs">
                      <div className="col-span-2">
                        <span className="font-bold text-primary-700">{ev.unit_code}</span>
                        <p className="text-slate-400 text-[10px] truncate mt-0.5">{ev.section_ref}</p>
                      </div>
                      <div className="col-span-2">
                        {sk && <span className={`font-semibold px-1.5 py-0.5 rounded text-[10px] ${sk.bg} ${sk.color}`}>{sk.short}</span>}
                        <span className="ml-1 text-slate-600 font-semibold">L{ev.supported_level}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="font-mono font-semibold text-slate-700">{ev.matched_indicator_code}</span>
                        <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{ev.matched_indicator_descriptor}</p>
                      </div>
                      <div className="col-span-3 italic text-slate-600 text-[11px] leading-relaxed">{ev.excerpt}</div>
                      <div className="col-span-3 text-slate-500 text-[11px] leading-relaxed">{ev.reasoning_note}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Review tab ── */}
        {activeTab === 'review' && (
          <div className="space-y-4 max-w-2xl">
            {/* Status workflow */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-1">Current Status</p>
                <StatusBadge status={selected.status} />
                {selected.reviewed_at && (
                  <p className="text-xs text-slate-400 mt-1.5">
                    Last reviewed {new Date(selected.reviewed_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Review Comment</label>
                <textarea
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  rows={3}
                  placeholder="Add a review note (optional)…"
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-300 resize-none"
                />
              </div>

              {selected.review_notes && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Previous Notes</p>
                  <p className="text-sm text-slate-700">{selected.review_notes}</p>
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                {selected.status === 'draft' && (
                  <button
                    disabled={reviewLoading}
                    onClick={() => submitReview('in_review')}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-amber-500 text-white font-bold rounded-xl hover:bg-amber-600 text-sm disabled:opacity-50"
                  >
                    <Eye className="w-4 h-4" /> Submit for Review
                  </button>
                )}
                {(selected.status === 'in_review' || selected.status === 'draft') && (
                  <button
                    disabled={reviewLoading}
                    onClick={() => submitReview('approved')}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 text-sm disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Approve
                  </button>
                )}
                {selected.status !== 'rejected' && selected.status !== 'draft' && (
                  <button
                    disabled={reviewLoading}
                    onClick={() => submitReview('rejected')}
                    className="px-4 py-3 bg-rose-50 border border-rose-200 text-rose-700 font-bold rounded-xl hover:bg-rose-100 text-sm disabled:opacity-50"
                  >
                    Reject
                  </button>
                )}
                {selected.status === 'approved' && (
                  <button
                    disabled={reviewLoading}
                    onClick={() => submitReview('in_review')}
                    className="px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 text-sm"
                  >
                    Request Changes
                  </button>
                )}
              </div>
            </div>

            {/* Review checklist */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <p className="text-sm font-semibold text-slate-700 mb-4">Review Checklist</p>
              <div className="space-y-3">
                {[
                  'ACSF levels are appropriate for the qualification\'s AQF level',
                  'Supporting unit evidence is accurate and unit codes are correct',
                  'Reasoning chain clearly justifies each level recommendation',
                  'Confidence scores are consistent with the evidence provided',
                  'No known gaps in the unit set that would affect ACSF levels',
                  'Evidence chain would satisfy an ASQA audit or standards review',
                ].map((item, i) => (
                  <label key={i} className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" className="mt-0.5 accent-primary-600 w-4 h-4" />
                    <span className="text-sm text-slate-700">{item}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Audit log tab ── */}
        {activeTab === 'audit' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
              <History className="w-4 h-4 text-slate-400" />
              <p className="text-sm font-semibold text-slate-700">Audit Log</p>
              <span className="text-xs text-slate-400 ml-auto">{auditLog.length} events</span>
            </div>
            {auditLog.length === 0 ? (
              <div className="p-10 text-center text-slate-400 text-sm">No audit events yet.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {auditLog.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-4 px-5 py-3.5">
                    <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <ClipboardList className="w-4 h-4 text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-800">{entry.actor_name || 'System'}</span>
                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">{entry.action.replace(/_/g, ' ')}</span>
                      </div>
                      {entry.new_value && (
                        <p className="text-xs text-slate-500 mt-0.5 font-mono">{JSON.stringify(entry.new_value)}</p>
                      )}
                      <p className="text-xs text-slate-400 mt-0.5">{new Date(entry.created_at).toLocaleString('en-AU')}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Library view ─────────────────────────────────────────────────────────────

  if (view === 'library') {
    const filtered = libEntries.filter((e) =>
      !libSearch ||
      e.uoc_code.toLowerCase().includes(libSearch.toLowerCase()) ||
      (e.uoc_title ?? '').toLowerCase().includes(libSearch.toLowerCase()) ||
      (e.training_package ?? '').toLowerCase().includes(libSearch.toLowerCase()),
    );

    const pkgGroups = Array.from(new Set(libEntries.map((e) => e.training_package))).sort();

    function LvlChip({ n }: { n: number }) {
      if (!n) return <span className="text-slate-300 text-xs">—</span>;
      const c = n >= 4 ? 'bg-primary-100 text-primary-700' : n === 3 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600';
      return <span className={`inline-block text-xs font-bold px-1.5 py-0.5 rounded ${c}`}>{n}</span>;
    }

    const activeEntry = extracted ?? (editingEntry as typeof extracted);

    return (
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <button onClick={() => setView('list')} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary-600" /> UoC ACSF Library
              </h1>
              <p className="text-slate-500 text-sm">{libEntries.length} units mapped across {pkgGroups.length} training packages</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setEditingEntry(null); setExtracted(null); setExtractForm({ unit_code: '', unit_title: '', foundation_skills_text: '' }); setExtractError(''); setShowAIDrawer(true); }}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white text-sm font-bold rounded-xl hover:bg-primary-700 transition-all shadow-sm"
            >
              <Sparkles className="w-4 h-4" /> Add Unit with AI
            </button>
            <button onClick={loadLibrary} className="p-2.5 hover:bg-slate-100 rounded-xl text-slate-500 transition-colors border border-slate-200">
              <RefreshCw className={`w-4 h-4 ${libLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={libSearch}
            onChange={(e) => setLibSearch(e.target.value)}
            placeholder="Search by code, title or training package..."
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
          />
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 hidden sm:grid grid-cols-[2fr_3fr_1fr_1fr_1fr_1fr_1fr_80px] gap-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            <span>Code</span>
            <span>Title</span>
            <span className="text-center">Read</span>
            <span className="text-center">Write</span>
            <span className="text-center">Oral</span>
            <span className="text-center">Num</span>
            <span className="text-center">Learn</span>
            <span />
          </div>
          {libLoading ? (
            <div className="flex items-center justify-center py-12 text-slate-400 gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading library…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              {libSearch ? 'No units match your search.' : 'No units in library yet. Add one with AI to get started.'}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map((e) => (
                <div key={e.uoc_code} className="hover:bg-slate-50 transition-colors">
                  {/* Mobile card */}
                  <div className="sm:hidden px-4 py-3.5 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-primary-700">{e.uoc_code}</span>
                        <span className="text-xs text-slate-500 truncate">{e.training_package}</span>
                      </div>
                      <p className="text-sm text-slate-700 mt-0.5 line-clamp-2">{e.uoc_title ?? '—'}</p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {[
                          { label: 'R', n: e.reading_level },
                          { label: 'W', n: e.writing_level },
                          { label: 'O', n: e.oral_comm_level },
                          { label: 'N', n: e.numeracy_level },
                          { label: 'L', n: e.learning_level },
                        ].map(({ label, n }) => (
                          <span key={label} className="flex items-center gap-1 text-[11px] text-slate-500">
                            <span className="font-semibold">{label}</span> <LvlChip n={n} />
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button
                        onClick={() => { setEditingEntry(e); setExtracted({ ...e, evidence_basis: '', source_type: 'validated', confidence: 'medium' }); setExtractForm({ unit_code: e.uoc_code, unit_title: e.uoc_title ?? '', foundation_skills_text: '' }); setExtractError(''); setShowAIDrawer(true); }}
                        className="p-2 hover:bg-primary-50 text-slate-400 hover:text-primary-600 rounded-lg transition-colors"
                      ><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => deleteUnit(e.uoc_code)} className="p-2 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {/* Desktop row */}
                  <div className="hidden sm:grid grid-cols-[2fr_3fr_1fr_1fr_1fr_1fr_1fr_80px] gap-3 px-5 py-3 items-center">
                    <span className="font-mono text-xs font-bold text-primary-700 truncate">{e.uoc_code}</span>
                    <span className="text-sm text-slate-700 truncate">{e.uoc_title ?? '—'}</span>
                    <span className="flex justify-center"><LvlChip n={e.reading_level} /></span>
                    <span className="flex justify-center"><LvlChip n={e.writing_level} /></span>
                    <span className="flex justify-center"><LvlChip n={e.oral_comm_level} /></span>
                    <span className="flex justify-center"><LvlChip n={e.numeracy_level} /></span>
                    <span className="flex justify-center"><LvlChip n={e.learning_level} /></span>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => { setEditingEntry(e); setExtracted({ ...e, evidence_basis: '', source_type: 'validated', confidence: 'medium' }); setExtractForm({ unit_code: e.uoc_code, unit_title: e.uoc_title ?? '', foundation_skills_text: '' }); setExtractError(''); setShowAIDrawer(true); }}
                        className="p-1.5 hover:bg-primary-50 text-slate-400 hover:text-primary-600 rounded-lg transition-colors"
                      ><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => deleteUnit(e.uoc_code)} className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── AI Extraction Drawer ── */}
        {showAIDrawer && (
          <div className="fixed inset-0 z-50 flex">
            <div className="hidden sm:block flex-1 bg-slate-900/40 backdrop-blur-sm" onClick={() => { setShowAIDrawer(false); setExtracted(null); setEditingEntry(null); }} />
            <div className="w-full sm:max-w-xl bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
              {/* Drawer header */}
              <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold text-slate-900">
                      {editingEntry ? `Edit ${editingEntry.uoc_code}` : 'Add Unit with AI'}
                    </h2>
                    <p className="text-xs text-slate-500">Paste foundation skills → AI extracts ACSF levels</p>
                  </div>
                </div>
                <button onClick={() => { setShowAIDrawer(false); setExtracted(null); setEditingEntry(null); }} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 px-6 py-5 space-y-5">
                {/* Unit code + title */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Unit Code *</label>
                    <input
                      value={extractForm.unit_code}
                      onChange={(e) => setExtractForm((f) => ({ ...f, unit_code: e.target.value.toUpperCase() }))}
                      placeholder="e.g. BSBWHS311"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Unit Title</label>
                    <input
                      value={extractForm.unit_title}
                      onChange={(e) => setExtractForm((f) => ({ ...f, unit_title: e.target.value }))}
                      placeholder="Optional — AI will infer"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                    />
                  </div>
                </div>

                {/* Foundation skills text */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Foundation Skills Text *
                    <span className="ml-2 font-normal text-slate-400">Paste from the TGA unit descriptor</span>
                  </label>
                  <textarea
                    value={extractForm.foundation_skills_text}
                    onChange={(e) => setExtractForm((f) => ({ ...f, foundation_skills_text: e.target.value }))}
                    rows={8}
                    placeholder={`Paste the Foundation Skills section from the TGA unit descriptor here.\n\nE.g.:\n  Reading – Interprets complex workplace documents and technical specifications...\n  Writing – Prepares detailed incident reports and safety records...\n  Numeracy – Performs calculations to determine load limits...`}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/30 resize-none"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Find this on <span className="font-medium">training.gov.au → search unit → Foundation Skills tab</span>
                  </p>
                </div>

                {/* Extract button */}
                <button
                  disabled={extracting || !extractForm.unit_code || !extractForm.foundation_skills_text}
                  onClick={runExtraction}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm"
                >
                  {extracting ? <><Loader2 className="w-4 h-4 animate-spin" /> Extracting…</> : <><Sparkles className="w-4 h-4" /> Extract with AI</>}
                </button>

                {extractError && (
                  <div className="flex items-start gap-2.5 p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{extractError}</span>
                  </div>
                )}

                {/* Extracted preview */}
                {activeEntry && (
                  <div className="space-y-4 pt-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <p className="text-sm font-bold text-slate-800">Extraction complete — review and edit before saving</p>
                    </div>

                    {/* ACSF Levels */}
                    <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">ACSF Levels</p>
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                        {[
                          { key: 'reading_level' as keyof UoCEntry, label: 'Reading' },
                          { key: 'writing_level' as keyof UoCEntry, label: 'Writing' },
                          { key: 'oral_comm_level' as keyof UoCEntry, label: 'Oral' },
                          { key: 'numeracy_level' as keyof UoCEntry, label: 'Numeracy' },
                          { key: 'learning_level' as keyof UoCEntry, label: 'Learning' },
                        ].map(({ key, label }) => (
                          <div key={key} className="flex flex-col items-center gap-1.5">
                            <label className="text-[10px] font-semibold text-slate-500 uppercase">{label}</label>
                            <select
                              value={(activeEntry as Record<string, unknown>)[key] as number ?? 0}
                              onChange={(e) => {
                                const val = parseInt(e.target.value);
                                if (extracted) setExtracted((prev) => prev ? { ...prev, [key]: val } : prev);
                                else if (editingEntry) setEditingEntry((prev) => prev ? { ...prev, [key]: val } : prev);
                              }}
                              className="w-full border border-slate-200 rounded-lg px-1 py-1.5 text-sm text-center font-bold focus:outline-none focus:ring-2 focus:ring-primary-500/30 bg-white"
                            >
                              {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n || '—'}</option>)}
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Task tags */}
                    <div>
                      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Tag className="w-3.5 h-3.5" /> Task Tags</p>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {(activeEntry.task_tags ?? []).map((tag, i) => (
                          <span key={i} className="inline-flex items-center gap-1 text-xs bg-primary-50 text-primary-700 border border-primary-200 px-2.5 py-1 rounded-full">
                            {tag}
                            <button
                              onClick={() => {
                                const next = (activeEntry.task_tags ?? []).filter((_, j) => j !== i);
                                if (extracted) setExtracted((p) => p ? { ...p, task_tags: next } : p);
                                else if (editingEntry) setEditingEntry((p) => p ? { ...p, task_tags: next } : p);
                              }}
                              className="text-primary-400 hover:text-primary-700"
                            >×</button>
                          </span>
                        ))}
                      </div>
                      <input
                        placeholder="Add tag and press Enter"
                        className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
                            const val = (e.target as HTMLInputElement).value.trim();
                            const next = [...(activeEntry.task_tags ?? []), val];
                            if (extracted) setExtracted((p) => p ? { ...p, task_tags: next } : p);
                            else if (editingEntry) setEditingEntry((p) => p ? { ...p, task_tags: next } : p);
                            (e.target as HTMLInputElement).value = '';
                          }
                        }}
                      />
                    </div>

                    {/* Complexity indicators */}
                    <div>
                      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" /> Complexity Indicators</p>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {(activeEntry.complexity_indicators ?? []).map((ci, i) => (
                          <span key={i} className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full">
                            {ci}
                            <button
                              onClick={() => {
                                const next = (activeEntry.complexity_indicators ?? []).filter((_, j) => j !== i);
                                if (extracted) setExtracted((p) => p ? { ...p, complexity_indicators: next } : p);
                                else if (editingEntry) setEditingEntry((p) => p ? { ...p, complexity_indicators: next } : p);
                              }}
                              className="text-amber-400 hover:text-amber-700"
                            >×</button>
                          </span>
                        ))}
                      </div>
                      <input
                        placeholder="Add indicator and press Enter"
                        className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
                            const val = (e.target as HTMLInputElement).value.trim();
                            const next = [...(activeEntry.complexity_indicators ?? []), val];
                            if (extracted) setExtracted((p) => p ? { ...p, complexity_indicators: next } : p);
                            else if (editingEntry) setEditingEntry((p) => p ? { ...p, complexity_indicators: next } : p);
                            (e.target as HTMLInputElement).value = '';
                          }
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Drawer footer */}
              {activeEntry && (
                <div className="px-6 py-4 border-t border-slate-200 sticky bottom-0 bg-white">
                  <button
                    disabled={savingUnit}
                    onClick={saveUnit}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-all text-sm"
                  >
                    {savingUnit ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><CheckCircle2 className="w-4 h-4" /> Save to Library</>}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
