import { useState, useEffect } from 'react';
import {
  Users, ClipboardList, AlertTriangle, CheckCircle2,
  Clock, TrendingUp, UserCheck, BookOpen, Activity,
  ChevronRight, Circle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';

interface Stats {
  totalStudents: number;
  awaitingReview: number;
  activeSupportPlans: number;
  openInterventions: number;
}

interface RecentStudent {
  id: string;
  full_name: string;
  course_name: string | null;
  current_status: string;
  updated_at: string;
}

function statusLabel(s: string) {
  const map: Record<string, string> = {
    lln_complete: 'LLN Complete',
    digital_complete: 'Digital Complete',
    support_generated: 'Support Generated',
    lln_opened: 'LLN In Progress',
    digital_opened: 'Digital In Progress',
    awaiting_submission: 'Awaiting Submission',
    invitation_sent: 'Invited',
    closed: 'Closed',
  };
  return map[s] ?? s;
}

function statusColor(s: string) {
  if (s === 'support_generated' || s === 'closed') return 'text-emerald-600 bg-emerald-50';
  if (s.includes('complete')) return 'text-blue-600 bg-blue-50';
  if (s.includes('progress') || s.includes('opened')) return 'text-amber-600 bg-amber-50';
  return 'text-slate-500 bg-slate-100';
}

function fmtRelative(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

export function TrainerDashboardPage() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<Stats>({ totalStudents: 0, awaitingReview: 0, activeSupportPlans: 0, openInterventions: 0 });
  const [recent, setRecent] = useState<RecentStudent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [studentsRes, supportRes, interventionsRes] = await Promise.all([
      supabase.from('students').select('id, full_name, course_name, current_status, updated_at').order('updated_at', { ascending: false }).limit(50),
      supabase.from('support_plans').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('intervention_cases').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    ]);

    const students = studentsRes.data ?? [];
    const awaitingReview = students.filter(s =>
      ['lln_complete', 'digital_complete'].includes(s.current_status)
    ).length;

    setStats({
      totalStudents: students.length,
      awaitingReview,
      activeSupportPlans: supportRes.count ?? 0,
      openInterventions: interventionsRes.count ?? 0,
    });
    setRecent(students.slice(0, 8));
    setLoading(false);
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = profile?.full_name?.split(' ')[0] ?? 'Trainer';

  const METRICS = [
    {
      label: 'My Students',
      value: stats.totalStudents,
      icon: Users,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      border: 'border-blue-100',
    },
    {
      label: 'Awaiting Review',
      value: stats.awaitingReview,
      icon: UserCheck,
      color: stats.awaitingReview > 0 ? 'text-amber-600' : 'text-emerald-600',
      bg: stats.awaitingReview > 0 ? 'bg-amber-50' : 'bg-emerald-50',
      border: stats.awaitingReview > 0 ? 'border-amber-100' : 'border-emerald-100',
    },
    {
      label: 'Active Support Plans',
      value: stats.activeSupportPlans,
      icon: ClipboardList,
      color: 'text-teal-600',
      bg: 'bg-teal-50',
      border: 'border-teal-100',
    },
    {
      label: 'Open Interventions',
      value: stats.openInterventions,
      icon: AlertTriangle,
      color: stats.openInterventions > 0 ? 'text-red-600' : 'text-emerald-600',
      bg: stats.openInterventions > 0 ? 'bg-red-50' : 'bg-emerald-50',
      border: stats.openInterventions > 0 ? 'border-red-100' : 'border-emerald-100',
    },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{greeting}, {firstName}.</h1>
        <p className="text-slate-500 mt-1 text-sm">
          {stats.awaitingReview > 0
            ? `You have ${stats.awaitingReview} student${stats.awaitingReview > 1 ? 's' : ''} awaiting review.`
            : 'All caught up — no students awaiting review.'}
        </p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {METRICS.map(m => {
          const Icon = m.icon;
          return (
            <div key={m.label} className={`bg-white rounded-2xl border ${m.border} p-5 flex items-start gap-4`}>
              <div className={`w-10 h-10 rounded-xl ${m.bg} flex items-center justify-center shrink-0`}>
                <Icon className={`w-5 h-5 ${m.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 leading-none">
                  {loading ? '—' : m.value}
                </p>
                <p className="text-xs text-slate-500 mt-1 leading-snug">{m.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Students needing attention */}
      {stats.awaitingReview > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <UserCheck className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-amber-900">Students Awaiting Review</h2>
              <p className="text-xs text-amber-600">{stats.awaitingReview} student{stats.awaitingReview !== 1 ? 's' : ''} have completed assessments</p>
            </div>
          </div>
          <div className="space-y-2">
            {recent
              .filter(s => ['lln_complete', 'digital_complete'].includes(s.current_status))
              .slice(0, 5)
              .map(s => (
                <div key={s.id} className="flex items-center justify-between bg-white rounded-xl px-3 py-2.5 border border-amber-100">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold shrink-0">
                      {s.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{s.full_name}</p>
                      {s.course_name && <p className="text-[10px] text-slate-400 truncate">{s.course_name}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColor(s.current_status)}`}>
                      {statusLabel(s.current_status)}
                    </span>
                    <span className="text-[10px] text-slate-400">{fmtRelative(s.updated_at)}</span>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* Recent activity */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">Recent Student Activity</h2>
          <span className="text-xs text-slate-400">{recent.length} students</span>
        </div>
        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 text-sm">Loading...</div>
        ) : recent.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-8 text-center">
            <Users className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No students yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            {recent.map((s, i) => (
              <div
                key={s.id}
                className={`flex items-center justify-between px-4 py-3 ${i < recent.length - 1 ? 'border-b border-slate-100' : ''}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold shrink-0">
                    {s.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{s.full_name}</p>
                    {s.course_name && <p className="text-[10px] text-slate-400 truncate">{s.course_name}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColor(s.current_status)}`}>
                    {statusLabel(s.current_status)}
                  </span>
                  <span className="text-[10px] text-slate-400 hidden sm:inline">{fmtRelative(s.updated_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
