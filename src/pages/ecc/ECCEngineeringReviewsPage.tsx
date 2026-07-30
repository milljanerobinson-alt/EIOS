import { useState, useEffect, useCallback } from 'react';
import {
  BookOpen, Search, Plus, ChevronRight, Star, Filter,
  Calendar, User, Tag, FileText, Shield, Clock, CheckCircle2,
  AlertCircle, XCircle, RotateCcw, ChevronDown,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ECCEngineeringReviewDetail } from './ECCEngineeringReviewDetail';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EngineeringReview {
  id: string;
  erc_number: string;
  title: string;
  type: string;
  status: string;
  engineering_area: string | null;
  author: string | null;
  review_date: string | null;
  is_reference: boolean;
  executive_summary: string | null;
  problem_statement: string | null;
  engineering_analysis: string | null;
  root_cause: string | null;
  engineering_decision: string | null;
  changes_implemented: string | null;
  files_modified: string[] | null;
  validation_performed: string | null;
  regression_testing: string | null;
  lessons_learned: string | null;
  future_recommendations: string | null;
  engineering_assessment: string | null;
  full_review: string | null;
  related_audits: string[];
  related_features: string[];
  related_releases: string[];
  related_test_plans: string[];
  related_decisions: string[];
  related_phases: string[];
  related_recommendations: string[];
  related_ercs: string[];
  reference_reason: string | null;
  reference_date: string | null;
  reference_approved_by: string | null;
  metadata: Record<string, unknown> | null;
  // Intelligence Engine fields (nullable — populated by ERIE)
  eig_analysis: Record<string, unknown> | null;
  dependency_analysis: Record<string, unknown> | null;
  impact_analysis: Record<string, unknown> | null;
  risk_register: Record<string, unknown>[] | null;
  traceability: Record<string, unknown> | null;
  implementation_plan: Record<string, unknown> | null;
  release_readiness: Record<string, unknown> | null;
  testing_assessment: Record<string, unknown> | null;
  documentation_assessment: Record<string, unknown> | null;
  ai_reasoning: Record<string, unknown> | null;
  intelligence_quality_score: number | null;
  intelligence_quality_breakdown: Record<string, unknown> | null;
  executive_brief: Record<string, unknown> | null;
  intelligence_generated_at: string | null;
  intelligence_engine_version: string | null;
  // ELPM fields (nullable — populated by ELPM engine)
  elpm_similar_reviews: Record<string, unknown>[] | null;
  elpm_learning_summary: Record<string, unknown> | null;
  elpm_evolution_summary: Record<string, unknown> | null;
  elpm_historical_comparison: Record<string, unknown> | null;
  elpm_memory_summary: Record<string, unknown> | null;
  elpm_historical_confidence: number | null;
  elpm_generated_at: string | null;
  elpm_engine_version: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const TYPE_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  root_cause_analysis:       { label: 'Root Cause Analysis',    color: 'text-red-700',     bg: 'bg-red-50',      border: 'border-red-200'    },
  architecture_review:       { label: 'Architecture Review',    color: 'text-violet-700',  bg: 'bg-violet-50',   border: 'border-violet-200' },
  engineering_investigation: { label: 'Engineering Investigation', color: 'text-blue-700', bg: 'bg-blue-50',     border: 'border-blue-200'   },
  defect_resolution:         { label: 'Defect Resolution',       color: 'text-orange-700', bg: 'bg-orange-50',   border: 'border-orange-200' },
  performance_review:        { label: 'Performance Review',      color: 'text-amber-700',  bg: 'bg-amber-50',    border: 'border-amber-200'  },
  security_review:           { label: 'Security Review',         color: 'text-rose-700',   bg: 'bg-rose-50',     border: 'border-rose-200'   },
  ai_platform_review:        { label: 'AI Platform Review',      color: 'text-sky-700',    bg: 'bg-sky-50',      border: 'border-sky-200'    },
  governance_review:         { label: 'Governance Review',       color: 'text-emerald-700',bg: 'bg-emerald-50',  border: 'border-emerald-200'},
  engineering_acceptance:    { label: 'Engineering Acceptance',  color: 'text-teal-700',   bg: 'bg-teal-50',     border: 'border-teal-200'   },
  release_review:            { label: 'Release Review',          color: 'text-cyan-700',   bg: 'bg-cyan-50',     border: 'border-cyan-200'   },
  other:                     { label: 'Other',                   color: 'text-slate-600',  bg: 'bg-slate-100',   border: 'border-slate-200'  },
};

const STATUS_CFG: Record<string, { label: string; color: string; Icon: typeof Clock }> = {
  open:        { label: 'Open',        color: 'text-amber-600',   Icon: AlertCircle  },
  in_progress: { label: 'In Progress', color: 'text-blue-600',    Icon: RotateCcw    },
  closed:      { label: 'Closed',      color: 'text-emerald-600', Icon: CheckCircle2 },
  superseded:  { label: 'Superseded',  color: 'text-slate-400',   Icon: XCircle      },
};

function typeCfg(type: string) {
  return TYPE_CFG[type] ?? TYPE_CFG.other;
}

function statusCfg(status: string) {
  return STATUS_CFG[status] ?? STATUS_CFG.open;
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── ERC Card ─────────────────────────────────────────────────────────────────

function ERCCard({ review, onClick }: { review: EngineeringReview; onClick: () => void }) {
  const tc = typeCfg(review.type);
  const sc = statusCfg(review.status);
  const StatusIcon = sc.Icon;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-white rounded-xl border transition-all duration-150 hover:shadow-md hover:-translate-y-px group ${
        review.is_reference
          ? 'border-amber-300 ring-1 ring-amber-200 hover:border-amber-400'
          : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-500 font-mono">{review.erc_number}</span>
            {review.is_reference && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />
                Reference Review
              </span>
            )}
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${tc.bg} ${tc.color} ${tc.border}`}>
              <Tag className="w-2.5 h-2.5" />
              {tc.label}
            </span>
          </div>
          <div className={`flex items-center gap-1 shrink-0 ${sc.color}`}>
            <StatusIcon className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">{sc.label}</span>
          </div>
        </div>

        {/* Title */}
        <h3 className="text-sm font-semibold text-slate-900 mb-2 group-hover:text-blue-700 transition-colors leading-snug">
          {review.title}
        </h3>

        {/* Summary */}
        {review.executive_summary && (
          <p className="text-xs text-slate-500 leading-relaxed line-clamp-2 mb-3">
            {review.executive_summary}
          </p>
        )}

        {/* Meta row */}
        <div className="flex items-center gap-4 flex-wrap text-[11px] text-slate-400">
          {review.engineering_area && (
            <span className="flex items-center gap-1">
              <Shield className="w-3 h-3" />
              {review.engineering_area}
            </span>
          )}
          {review.author && (
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" />
              {review.author}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {fmtDate(review.review_date)}
          </span>
          {review.related_audits?.length > 0 && (
            <span className="flex items-center gap-1">
              <FileText className="w-3 h-3" />
              {review.related_audits.join(', ')}
            </span>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-2.5 bg-slate-50 rounded-b-xl border-t border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          {review.files_modified && review.files_modified.length > 0 && (
            <span className="text-[10px] text-slate-400">{review.files_modified.length} file{review.files_modified.length !== 1 ? 's' : ''} modified</span>
          )}
          {review.related_audits?.length > 0 && (
            <span className="text-[10px] text-slate-400">· {review.related_audits.length} audit{review.related_audits.length !== 1 ? 's' : ''} linked</span>
          )}
        </div>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
      </div>
    </button>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
        <BookOpen className="w-7 h-7 text-slate-300" />
      </div>
      <h3 className="text-sm font-semibold text-slate-700 mb-1">
        {filtered ? 'No reviews match your filters' : 'No Engineering Reviews yet'}
      </h3>
      <p className="text-xs text-slate-400 max-w-xs">
        {filtered
          ? 'Try adjusting your search or filters.'
          : 'Engineering Reviews document significant investigations, architectural changes, and root cause analyses.'}
      </p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ECCEngineeringReviewsPage() {
  const [reviews, setReviews] = useState<EngineeringReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('ecc_engineering_reviews')
      .select('*')
      .order('review_date', { ascending: false });
    setReviews(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = reviews.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      r.erc_number.toLowerCase().includes(q) ||
      r.title.toLowerCase().includes(q) ||
      (r.engineering_area ?? '').toLowerCase().includes(q) ||
      (r.executive_summary ?? '').toLowerCase().includes(q) ||
      r.related_audits.some(a => a.toLowerCase().includes(q));
    const matchType = typeFilter === 'all' || r.type === typeFilter;
    const matchStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchSearch && matchType && matchStatus;
  });

  const selectedReview = reviews.find(r => r.id === selectedId) ?? null;

  const stats = {
    total:     reviews.length,
    closed:    reviews.filter(r => r.status === 'closed').length,
    reference: reviews.filter(r => r.is_reference).length,
    rca:       reviews.filter(r => r.type === 'root_cause_analysis').length,
  };

  const isFiltered = search !== '' || typeFilter !== 'all' || statusFilter !== 'all';

  return (
    <div className="h-full flex overflow-hidden">
      {/* Register panel */}
      <div className={`flex flex-col bg-slate-50 border-r border-slate-200 transition-all ${selectedReview ? 'w-96 shrink-0' : 'flex-1'}`}>

        {/* Header */}
        <div className="shrink-0 bg-white border-b border-slate-200 px-5 pt-5 pb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-base font-bold text-slate-900">Engineering Reviews</h1>
                <p className="text-[11px] text-slate-500">Permanent engineering governance record</p>
              </div>
            </div>
            <button
              onClick={load}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              title="Refresh"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            {[
              { label: 'Total',     value: stats.total,     color: 'text-slate-700' },
              { label: 'Closed',    value: stats.closed,    color: 'text-emerald-600' },
              { label: 'Reference', value: stats.reference, color: 'text-amber-600' },
              { label: 'RCA',       value: stats.rca,       color: 'text-red-600' },
            ].map(s => (
              <div key={s.label} className="bg-slate-50 rounded-lg border border-slate-100 px-2.5 py-2 text-center">
                <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Search */}
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by number, title, area, audit..."
              className="w-full pl-8 pr-3 py-2 text-xs bg-slate-100 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 placeholder-slate-400 text-slate-700"
            />
          </div>

          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters(s => !s)}
            className={`flex items-center gap-1.5 text-[11px] font-medium transition-colors ${showFilters || typeFilter !== 'all' || statusFilter !== 'all' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Filter className="w-3 h-3" />
            Filters
            {(typeFilter !== 'all' || statusFilter !== 'all') && (
              <span className="bg-blue-600 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {[typeFilter !== 'all', statusFilter !== 'all'].filter(Boolean).length}
              </span>
            )}
            <ChevronDown className={`w-3 h-3 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>

          {showFilters && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="all">All Types</option>
                {Object.entries(TYPE_CFG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="all">All Statuses</option>
                {Object.entries(STATUS_CFG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState filtered={isFiltered} />
          ) : (
            filtered.map(r => (
              <ERCCard
                key={r.id}
                review={r}
                onClick={() => setSelectedId(r.id === selectedId ? null : r.id)}
              />
            ))
          )}
        </div>

        {/* Footer note */}
        {!loading && filtered.length > 0 && (
          <div className="shrink-0 px-4 py-2.5 border-t border-slate-200 bg-white">
            <p className="text-[10px] text-slate-400 text-center">
              {filtered.length} of {reviews.length} review{reviews.length !== 1 ? 's' : ''}
              {isFiltered ? ' — filters active' : ''}
            </p>
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selectedReview && (
        <div className="flex-1 overflow-hidden">
          <ECCEngineeringReviewDetail
            review={selectedReview}
            onClose={() => setSelectedId(null)}
            onRefresh={load}
          />
        </div>
      )}

      {/* Empty detail state */}
      {!selectedReview && !loading && reviews.length > 0 && (
        <div className="flex-1 flex items-center justify-center bg-slate-50 border-l border-slate-200">
          <div className="text-center">
            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
              <BookOpen className="w-6 h-6 text-slate-300" />
            </div>
            <p className="text-sm font-medium text-slate-500">Select a review to read</p>
            <p className="text-xs text-slate-400 mt-1">Click any Engineering Review in the register</p>
          </div>
        </div>
      )}
    </div>
  );
}
