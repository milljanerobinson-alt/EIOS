import { useEffect, useState, useCallback } from 'react';
import {
  Plus, FileText, Monitor, BookOpen, Pencil, Trash2, X,
  ArrowUp, ArrowDown, ChevronRight, Settings2, Save, Loader2,
  AlertCircle, Lock, Layers,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type {
  Assessment, AssessmentQuestion, Domain, QuestionType,
  AssessmentType, AssessmentStatus,
} from '../lib/types';
import { DOMAIN_LABELS, ACSF_SKILLS } from '../lib/types';
import { LLN_SECTION_LABELS } from '../lib/questions/llnQuestions';
import { DIGITAL_DOMAIN_LABELS } from '../lib/questions/digitalQuestions';

const ASSESSMENT_TYPE_LABELS: Record<AssessmentType, string> = {
  lln: 'LLN',
  digital: 'Digital',
};

const STATUS_LABELS: Record<AssessmentStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  archived: 'Archived',
};

const STATUS_BADGE_CLASSES: Record<AssessmentStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  active: 'bg-emerald-100 text-emerald-700',
  archived: 'bg-amber-100 text-amber-700',
};

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: 'Multiple Choice',
  short_answer: 'Short Answer',
  scale: 'Scale',
};

const ACSF_LEVEL_DESCRIPTIONS: Record<number, string> = {
  1: 'Foundation',
  2: 'Developing',
  3: 'Competent',
  4: 'Proficient',
  5: 'Advanced',
};

interface NewAssessmentForm {
  type: AssessmentType;
  title: string;
  description: string;
  pass_threshold: number;
}

interface QuestionFormState {
  id: string | null;
  question_text: string;
  domain: Domain;
  acsf_skill: string;
  acsf_level_target: number;
  question_type: QuestionType;
  options: string[];
  correct_answer: string;
  points: number;
  mapping_rationale: string;
}

const EMPTY_QUESTION: QuestionFormState = {
  id: null,
  question_text: '',
  domain: 'literacy',
  acsf_skill: 'Reading',
  acsf_level_target: 3,
  question_type: 'multiple_choice',
  options: ['', '', '', ''],
  correct_answer: '',
  points: 1,
  mapping_rationale: '',
};

const EMPTY_FORM: NewAssessmentForm = {
  type: 'lln',
  title: '',
  description: '',
  pass_threshold: 50,
};

export function AssessmentsPage() {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<NewAssessmentForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<QuestionFormState | null>(null);
  const [showAcsfConfig, setShowAcsfConfig] = useState(false);
  const [acsfConfigAssessment, setAcsfConfigAssessment] = useState<Assessment | null>(null);
  const [acsfMapping, setAcsfMapping] = useState<Record<string, number>>({});
  const [savingAcsf, setSavingAcsf] = useState(false);
  const [savingQuestion, setSavingQuestion] = useState(false);

  const loadAssessments = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('assessments')
      .select('*')
      .order('created_at', { ascending: false });
    if (fetchError) {
      setError(fetchError.message);
    } else {
      setAssessments((data as Assessment[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAssessments();
  }, [loadAssessments]);

  const loadQuestions = useCallback(async (assessmentId: string) => {
    setQuestionsLoading(true);
    const { data, error: fetchError } = await supabase
      .from('assessment_questions')
      .select('*')
      .eq('assessment_id', assessmentId)
      .order('order_index', { ascending: true });
    if (fetchError) {
      setError(fetchError.message);
    } else {
      setQuestions((data as AssessmentQuestion[]) || []);
    }
    setQuestionsLoading(false);
  }, []);

  const toggleExpand = (assessmentId: string) => {
    if (expandedId === assessmentId) {
      setExpandedId(null);
      setQuestions([]);
    } else {
      setExpandedId(assessmentId);
      loadQuestions(assessmentId);
    }
  };

  async function handleCreateAssessment() {
    if (!createForm.title.trim()) {
      setError('Title is required');
      return;
    }
    setCreating(true);
    setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error: insertError } = await supabase
      .from('assessments')
      .insert({
        type: createForm.type,
        title: createForm.title.trim(),
        description: createForm.description.trim() || null,
        pass_threshold: createForm.pass_threshold,
        total_questions: 0,
        acsf_level_mapping: {},
        version: '1.0.0',
        status: 'draft',
        created_by: user?.id || null,
      })
      .select()
      .single();
    if (insertError) {
      setError(insertError.message);
      setCreating(false);
      return;
    }
    setAssessments((prev) => [data as Assessment, ...prev]);
    setCreateForm(EMPTY_FORM);
    setShowCreate(false);
    setCreating(false);
  }

  async function handleStatusChange(assessment: Assessment, newStatus: AssessmentStatus) {
    if (assessment.status === newStatus) return;
    const { error: updateError } = await supabase
      .from('assessments')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', assessment.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setAssessments((prev) =>
      prev.map((a) => (a.id === assessment.id ? { ...a, status: newStatus } : a))
    );
  }

  async function handleDeleteAssessment(assessment: Assessment) {
    if (!confirm(`Delete "${assessment.title}"? This will also remove all its questions.`)) return;
    const { error: deleteError } = await supabase
      .from('assessments')
      .delete()
      .eq('id', assessment.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setAssessments((prev) => prev.filter((a) => a.id !== assessment.id));
    if (expandedId === assessment.id) {
      setExpandedId(null);
      setQuestions([]);
    }
  }

  function openNewQuestion() {
    setEditingQuestion({
      ...EMPTY_QUESTION,
      acsf_skill: ACSF_SKILLS[EMPTY_QUESTION.domain][0],
    });
  }

  function openEditQuestion(q: AssessmentQuestion) {
    setEditingQuestion({
      id: q.id,
      question_text: q.question_text,
      domain: q.domain,
      acsf_skill: q.acsf_skill,
      acsf_level_target: q.acsf_level_target ?? 3,
      question_type: q.question_type,
      options: q.options && q.options.length > 0 ? [...q.options] : ['', ''],
      correct_answer: q.correct_answer ?? '',
      points: q.points,
      mapping_rationale: q.mapping_rationale ?? '',
    });
  }

  async function handleSaveQuestion() {
    if (!editingQuestion || !expandedId) return;
    if (!editingQuestion.question_text.trim()) {
      setError('Question text is required');
      return;
    }
    setSavingQuestion(true);
    setError(null);

    const needsOptions =
      editingQuestion.question_type === 'multiple_choice' || editingQuestion.question_type === 'scale';
    const cleanedOptions = needsOptions
      ? editingQuestion.options.map((o) => o.trim()).filter((o) => o.length > 0)
      : [];

    if (needsOptions && cleanedOptions.length < 2) {
      setError('Multiple choice and scale questions need at least 2 options');
      setSavingQuestion(false);
      return;
    }

    const payload = {
      assessment_id: expandedId,
      question_text: editingQuestion.question_text.trim(),
      domain: editingQuestion.domain,
      acsf_skill: editingQuestion.acsf_skill,
      acsf_level_target: editingQuestion.acsf_level_target,
      question_type: editingQuestion.question_type,
      options: cleanedOptions,
      correct_answer: editingQuestion.correct_answer.trim() || null,
      points: editingQuestion.points,
      mapping_rationale: editingQuestion.mapping_rationale.trim() || null,
      version: '1.0.0',
    };

    if (editingQuestion.id) {
      const { error: updateError } = await supabase
        .from('assessment_questions')
        .update(payload)
        .eq('id', editingQuestion.id);
      if (updateError) {
        setError(updateError.message);
        setSavingQuestion(false);
        return;
      }
      setQuestions((prev) =>
        prev.map((q) =>
          q.id === editingQuestion.id
            ? { ...q, ...payload, options: cleanedOptions } as AssessmentQuestion
            : q
        )
      );
    } else {
      const orderIndex = questions.length;
      const { data, error: insertError } = await supabase
        .from('assessment_questions')
        .insert({ ...payload, order_index: orderIndex })
        .select()
        .single();
      if (insertError) {
        setError(insertError.message);
        setSavingQuestion(false);
        return;
      }
      setQuestions((prev) => [...prev, data as AssessmentQuestion]);
    }

    const newTotal = editingQuestion.id ? questions.length : questions.length + 1;
    await supabase
      .from('assessments')
      .update({ total_questions: newTotal, updated_at: new Date().toISOString() })
      .eq('id', expandedId);
    setAssessments((prev) =>
      prev.map((a) => (a.id === expandedId ? { ...a, total_questions: newTotal } : a))
    );

    setEditingQuestion(null);
    setSavingQuestion(false);
  }

  async function handleDeleteQuestion(questionId: string) {
    if (!confirm('Delete this question?')) return;
    const { error: deleteError } = await supabase
      .from('assessment_questions')
      .delete()
      .eq('id', questionId);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    const remaining = questions.filter((q) => q.id !== questionId);
    for (let i = 0; i < remaining.length; i++) {
      await supabase
        .from('assessment_questions')
        .update({ order_index: i })
        .eq('id', remaining[i].id);
    }
    setQuestions(remaining.map((q, i) => ({ ...q, order_index: i })));
    if (expandedId) {
      await supabase
        .from('assessments')
        .update({ total_questions: remaining.length, updated_at: new Date().toISOString() })
        .eq('id', expandedId);
      setAssessments((prev) =>
        prev.map((a) => (a.id === expandedId ? { ...a, total_questions: remaining.length } : a))
      );
    }
  }

  async function handleReorderQuestion(questionId: string, direction: 'up' | 'down') {
    const index = questions.findIndex((q) => q.id === questionId);
    if (index === -1) return;
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= questions.length) return;

    const reordered = [...questions];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(swapIndex, 0, moved);
    const reindexed = reordered.map((q, i) => ({ ...q, order_index: i }));
    setQuestions(reindexed);

    await Promise.all(
      reindexed.map((q, i) =>
        supabase.from('assessment_questions').update({ order_index: i }).eq('id', q.id)
      )
    );
  }

  function openAcsfConfig(assessment: Assessment) {
    setAcsfConfigAssessment(assessment);
    setAcsfMapping(assessment.acsf_level_mapping || {});
    setShowAcsfConfig(true);
  }

  async function handleSaveAcsfMapping() {
    if (!acsfConfigAssessment) return;
    setSavingAcsf(true);
    setError(null);
    const { error: updateError } = await supabase
      .from('assessments')
      .update({
        acsf_level_mapping: acsfMapping,
        updated_at: new Date().toISOString(),
      })
      .eq('id', acsfConfigAssessment.id);
    if (updateError) {
      setError(updateError.message);
      setSavingAcsf(false);
      return;
    }
    setAssessments((prev) =>
      prev.map((a) =>
        a.id === acsfConfigAssessment.id ? { ...a, acsf_level_mapping: acsfMapping } : a
      )
    );
    setShowAcsfConfig(false);
    setAcsfConfigAssessment(null);
    setSavingAcsf(false);
  }

  function updateAcsfMappingEntry(key: string, value: number) {
    setAcsfMapping((prev) => ({ ...prev, [key]: value }));
  }

  function removeAcsfMappingEntry(key: string) {
    setAcsfMapping((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  const allAcsfKeys = Array.from(
    new Set([
      ...Object.keys(acsfMapping),
      ...(Object.keys(DOMAIN_LABELS) as Domain[]).flatMap((d) =>
        ACSF_SKILLS[d].map((s) => `${d}:${s}`)
      ),
    ])
  ).sort();

  return (
    <div className="space-y-6">
      {error && (
        <div className="card p-4 bg-error-50 border-error-200 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-error-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm text-error-700">{error}</div>
          <button onClick={() => setError(null)} className="text-error-400 hover:text-error-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Assessments</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage LLN and Digital literacy assessments, questions, and ACSF mappings
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> New Assessment
        </button>
      </div>

      {/* Built-in Assessments */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Built-in Assessments</h3>
          <span className="text-xs text-slate-400">— included with your plan, sent via invitation links</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* LLN Built-in */}
          <div className="card p-5 border-primary-100 bg-primary-50/30">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center shrink-0">
                  <BookOpen className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-slate-900">LLN Assessment</h4>
                    <span className="badge bg-primary-100 text-primary-700">Built-in</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">Adaptive · ACSF Levels 1–5</p>
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs text-slate-400 bg-slate-100 rounded-full px-2.5 py-1">
                <Lock className="w-3 h-3" /> Read-only
              </div>
            </div>
            <p className="text-xs text-slate-600 mb-4">
              Adaptive Language, Literacy and Numeracy assessment covering 5 ACSF domains. Questions adjust to the student's level in real time, producing an estimated ACSF level per domain.
            </p>
            <div className="space-y-1.5">
              {(Object.keys(LLN_SECTION_LABELS) as (keyof typeof LLN_SECTION_LABELS)[]).map((section) => (
                <div key={section} className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-white border border-primary-100">
                  <span className="font-medium text-slate-700">{LLN_SECTION_LABELS[section]}</span>
                  <span className="text-slate-400">5 levels (1–5)</span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-primary-100 flex items-center justify-between text-xs text-slate-500">
              <span>5 sections · Adaptive engine</span>
              <span>DB-driven</span>
            </div>
          </div>

          {/* Digital Built-in */}
          <div className="card p-5 border-accent-100 bg-accent-50/30">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent-100 flex items-center justify-center shrink-0">
                  <Monitor className="w-5 h-5 text-accent-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-slate-900">Digital Capability Assessment</h4>
                    <span className="badge bg-accent-100 text-accent-700">Built-in</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">Linear · 5 domains</p>
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs text-slate-400 bg-slate-100 rounded-full px-2.5 py-1">
                <Lock className="w-3 h-3" /> Read-only
              </div>
            </div>
            <p className="text-xs text-slate-600 mb-4">
              Comprehensive digital literacy assessment across 5 domains. Students answer all questions in a linear flow, receiving a score and domain breakdown on completion.
            </p>
            <div className="space-y-1.5">
              {(Object.keys(DIGITAL_DOMAIN_LABELS) as (keyof typeof DIGITAL_DOMAIN_LABELS)[]).map((domain) => (
                <div key={domain} className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-white border border-accent-100">
                  <span className="font-medium text-slate-700">{DIGITAL_DOMAIN_LABELS[domain]}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-accent-100 flex items-center justify-between text-xs text-slate-500">
              <span>5 domains · Scored assessment</span>
              <span>DB-driven</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-1">
        <Layers className="w-4 h-4 text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Custom Assessments</h3>
        <span className="text-xs text-slate-400">— your own assessments with custom questions</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading assessments...
        </div>
      ) : assessments.length === 0 ? (
        <div className="card p-12 text-center">
          <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-900 mb-1">No assessments yet</h3>
          <p className="text-sm text-slate-500 mb-4">
            Create your first LLN or Digital assessment to get started.
          </p>
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> New Assessment
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {assessments.map((assessment) => {
            const isExpanded = expandedId === assessment.id;
            const Icon = assessment.type === 'lln' ? BookOpen : Monitor;
            return (
              <div key={assessment.id} className="card overflow-hidden">
                <div
                  className="p-5 flex items-start justify-between gap-4 cursor-pointer hover:bg-slate-50/50 transition-colors"
                  onClick={() => toggleExpand(assessment.id)}
                >
                  <div className="flex items-start gap-4 min-w-0">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                        assessment.type === 'lln' ? 'bg-primary-50' : 'bg-accent-50'
                      }`}
                    >
                      <Icon
                        className={`w-5.5 h-5.5 ${
                          assessment.type === 'lln' ? 'text-primary-600' : 'text-accent-600'
                        }`}
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-slate-900 truncate">
                          {assessment.title}
                        </h3>
                        <span className="badge bg-slate-100 text-slate-600">
                          {ASSESSMENT_TYPE_LABELS[assessment.type]}
                        </span>
                        <span className={`badge ${STATUS_BADGE_CLASSES[assessment.status]}`}>
                          {STATUS_LABELS[assessment.status]}
                        </span>
                      </div>
                      {assessment.description && (
                        <p className="text-sm text-slate-500 mt-1 line-clamp-2">
                          {assessment.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                        <span>{assessment.total_questions} questions</span>
                        <span>Pass: {assessment.pass_threshold}%</span>
                        <span>v{assessment.version}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={assessment.status}
                      onChange={(e) =>
                        handleStatusChange(assessment, e.target.value as AssessmentStatus)
                      }
                      className="input !w-auto !py-1.5 !text-xs"
                    >
                      <option value="draft">Draft</option>
                      <option value="active">Active</option>
                      <option value="archived">Archived</option>
                    </select>
                    <button
                      onClick={() => openAcsfConfig(assessment)}
                      className="btn-ghost !p-2"
                      title="ACSF level mapping"
                    >
                      <Settings2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteAssessment(assessment)}
                      className="btn-ghost !p-2 text-error-600 hover:bg-error-50"
                      title="Delete assessment"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <ChevronRight
                      className={`w-5 h-5 text-slate-400 transition-transform ${
                        isExpanded ? 'rotate-90' : ''
                      }`}
                    />
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/50 p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-semibold text-slate-900">
                        Questions ({questions.length})
                      </h4>
                      <button onClick={openNewQuestion} className="btn-primary !py-1.5 !text-xs">
                        <Plus className="w-3.5 h-3.5" /> Add Question
                      </button>
                    </div>

                    {questionsLoading ? (
                      <div className="flex items-center justify-center py-8 text-slate-400 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading questions...
                      </div>
                    ) : questions.length === 0 ? (
                      <div className="text-center py-8 text-sm text-slate-400">
                        No questions yet. Click "Add Question" to build the assessment.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {questions.map((q, idx) => (
                          <div
                            key={q.id}
                            className="card p-4 flex items-start gap-3 bg-white"
                          >
                            <div className="flex flex-col gap-0.5 pt-0.5">
                              <button
                                onClick={() => handleReorderQuestion(q.id, 'up')}
                                disabled={idx === 0}
                                className="text-slate-300 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleReorderQuestion(q.id, 'down')}
                                disabled={idx === questions.length - 1}
                                className="text-slate-300 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <div className="w-6 h-6 rounded-md bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-semibold shrink-0">
                              {idx + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-900 line-clamp-2">
                                {q.question_text}
                              </p>
                              <div className="flex items-center gap-2 flex-wrap mt-1.5">
                                <span className="badge bg-primary-50 text-primary-700">
                                  {DOMAIN_LABELS[q.domain]}
                                </span>
                                <span className="badge bg-slate-100 text-slate-600">
                                  {q.acsf_skill}
                                </span>
                                <span className="badge bg-slate-100 text-slate-600">
                                  ACSF {q.acsf_level_target ?? '-'}
                                </span>
                                <span className="badge bg-slate-100 text-slate-600">
                                  {QUESTION_TYPE_LABELS[q.question_type]}
                                </span>
                                <span className="badge bg-slate-100 text-slate-600">
                                  {q.points} pt
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => openEditQuestion(q)}
                                className="btn-ghost !p-1.5"
                                title="Edit question"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteQuestion(q.id)}
                                className="btn-ghost !p-1.5 text-error-600 hover:bg-error-50"
                                title="Delete question"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 animate-fade-in">
          <div className="card p-6 w-full max-w-lg animate-slide-up">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-900">New Assessment</h3>
              <button
                onClick={() => {
                  setShowCreate(false);
                  setCreateForm(EMPTY_FORM);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="label">Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['lln', 'digital'] as AssessmentType[]).map((t) => {
                    const Icon = t === 'lln' ? BookOpen : Monitor;
                    return (
                      <button
                        key={t}
                        onClick={() => setCreateForm({ ...createForm, type: t })}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                          createForm.type === t
                            ? 'border-primary-500 bg-primary-50 text-primary-700'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {ASSESSMENT_TYPE_LABELS[t]}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="label">Title</label>
                <input
                  className="input"
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  placeholder="e.g. Core LLN Assessment"
                />
              </div>
              <div>
                <label className="label">Description</label>
                <textarea
                  className="input min-h-[80px]"
                  value={createForm.description}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, description: e.target.value })
                  }
                  placeholder="Brief description of the assessment purpose"
                />
              </div>
              <div>
                <label className="label">Pass Threshold (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className="input"
                  value={createForm.pass_threshold}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      pass_threshold: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                    })
                  }
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setShowCreate(false);
                  setCreateForm(EMPTY_FORM);
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button onClick={handleCreateAssessment} disabled={creating} className="btn-primary">
                {creating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" /> Create
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 animate-fade-in">
          <div className="card p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
            <div className="flex items-center justify-between mb-5 sticky -top-6 -mx-6 px-6 py-3 bg-white border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">
                {editingQuestion.id ? 'Edit Question' : 'New Question'}
              </h3>
              <button
                onClick={() => setEditingQuestion(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="label">Question Text</label>
                <textarea
                  className="input min-h-[80px]"
                  value={editingQuestion.question_text}
                  onChange={(e) =>
                    setEditingQuestion({ ...editingQuestion, question_text: e.target.value })
                  }
                  placeholder="Enter the question prompt"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Domain</label>
                  <select
                    className="input"
                    value={editingQuestion.domain}
                    onChange={(e) => {
                      const domain = e.target.value as Domain;
                      setEditingQuestion({
                        ...editingQuestion,
                        domain,
                        acsf_skill: ACSF_SKILLS[domain][0],
                      });
                    }}
                  >
                    {(Object.keys(DOMAIN_LABELS) as Domain[]).map((d) => (
                      <option key={d} value={d}>
                        {DOMAIN_LABELS[d]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">ACSF Skill</label>
                  <select
                    className="input"
                    value={editingQuestion.acsf_skill}
                    onChange={(e) =>
                      setEditingQuestion({ ...editingQuestion, acsf_skill: e.target.value })
                    }
                  >
                    {ACSF_SKILLS[editingQuestion.domain].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="label">ACSF Level Target</label>
                  <select
                    className="input"
                    value={editingQuestion.acsf_level_target}
                    onChange={(e) =>
                      setEditingQuestion({
                        ...editingQuestion,
                        acsf_level_target: Number(e.target.value),
                      })
                    }
                  >
                    {[1, 2, 3, 4, 5].map((lvl) => (
                      <option key={lvl} value={lvl}>
                        Level {lvl} - {ACSF_LEVEL_DESCRIPTIONS[lvl]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Question Type</label>
                  <select
                    className="input"
                    value={editingQuestion.question_type}
                    onChange={(e) =>
                      setEditingQuestion({
                        ...editingQuestion,
                        question_type: e.target.value as QuestionType,
                      })
                    }
                  >
                    {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((t) => (
                      <option key={t} value={t}>
                        {QUESTION_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Points</label>
                  <input
                    type="number"
                    min={1}
                    className="input"
                    value={editingQuestion.points}
                    onChange={(e) =>
                      setEditingQuestion({
                        ...editingQuestion,
                        points: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                  />
                </div>
              </div>

              {(editingQuestion.question_type === 'multiple_choice' ||
                editingQuestion.question_type === 'scale') && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="label !mb-0">Options</label>
                    <button
                      onClick={() =>
                        setEditingQuestion({
                          ...editingQuestion,
                          options: [...editingQuestion.options, ''],
                        })
                      }
                      className="text-xs font-medium text-primary-600 hover:text-primary-700"
                    >
                      + Add option
                    </button>
                  </div>
                  <div className="space-y-2">
                    {editingQuestion.options.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          className="input"
                          value={opt}
                          onChange={(e) => {
                            const next = [...editingQuestion.options];
                            next[i] = e.target.value;
                            setEditingQuestion({ ...editingQuestion, options: next });
                          }}
                          placeholder={`Option ${i + 1}`}
                        />
                        {editingQuestion.options.length > 2 && (
                          <button
                            onClick={() =>
                              setEditingQuestion({
                                ...editingQuestion,
                                options: editingQuestion.options.filter((_, idx) => idx !== i),
                              })
                            }
                            className="btn-ghost !p-2 text-error-600 hover:bg-error-50 shrink-0"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="label">
                  Correct Answer
                  {editingQuestion.question_type === 'multiple_choice' &&
                    ' (must match an option exactly)'}
                </label>
                <input
                  className="input"
                  value={editingQuestion.correct_answer}
                  onChange={(e) =>
                    setEditingQuestion({ ...editingQuestion, correct_answer: e.target.value })
                  }
                  placeholder={
                    editingQuestion.question_type === 'multiple_choice'
                      ? 'Exact option text'
                      : 'Expected answer'
                  }
                />
              </div>

              <div>
                <label className="label">Mapping Rationale</label>
                <textarea
                  className="input min-h-[60px]"
                  value={editingQuestion.mapping_rationale}
                  onChange={(e) =>
                    setEditingQuestion({ ...editingQuestion, mapping_rationale: e.target.value })
                  }
                  placeholder="Why this question maps to the selected ACSF skill and level"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
              <button onClick={() => setEditingQuestion(null)} className="btn-secondary">
                Cancel
              </button>
              <button onClick={handleSaveQuestion} disabled={savingQuestion} className="btn-primary">
                {savingQuestion ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" /> Save Question
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAcsfConfig && acsfConfigAssessment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 animate-fade-in">
          <div className="card p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto animate-slide-up">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold text-slate-900">ACSF Level Mapping</h3>
              <button
                onClick={() => {
                  setShowAcsfConfig(false);
                  setAcsfConfigAssessment(null);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              Configure target ACSF levels for {acsfConfigAssessment.title}. Map each domain/skill
              to a target level (1-5).
            </p>

            <div className="space-y-2 mb-4">
              {allAcsfKeys.map((key) => {
                const [domain, skill] = key.split(':');
                const value = acsfMapping[key];
                const isConfigured = value !== undefined;
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900">
                        {DOMAIN_LABELS[domain as Domain] || domain}
                      </div>
                      <div className="text-xs text-slate-500">{skill}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isConfigured ? (
                        <>
                          <select
                            className="input !w-auto !py-1 !text-xs"
                            value={value}
                            onChange={(e) => updateAcsfMappingEntry(key, Number(e.target.value))}
                          >
                            {[1, 2, 3, 4, 5].map((lvl) => (
                              <option key={lvl} value={lvl}>
                                Level {lvl}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => removeAcsfMappingEntry(key)}
                            className="btn-ghost !p-1.5 text-error-600 hover:bg-error-50"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => updateAcsfMappingEntry(key, 3)}
                          className="btn-secondary !py-1 !text-xs"
                        >
                          <Plus className="w-3 h-3" /> Add mapping
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                onClick={() => {
                  setShowAcsfConfig(false);
                  setAcsfConfigAssessment(null);
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAcsfMapping}
                disabled={savingAcsf}
                className="btn-primary"
              >
                {savingAcsf ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" /> Save Mapping
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
