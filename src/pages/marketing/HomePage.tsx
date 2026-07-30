import { useState, useEffect, useCallback } from 'react';
import {
  Brain, Target, Monitor, Package, Clock, AlertTriangle,
  ClipboardList, ShieldCheck, Zap, DollarSign, Users, Building2,
  ArrowRight, Calendar, Check, X, ChevronDown, GraduationCap,
  Star, BarChart3, TrendingUp, ChevronLeft, ChevronRight,
  Activity, FileText, AlertCircle, CheckCircle2, BookOpen,
  Calculator as CalcIcon, MessageCircle,
} from 'lucide-react';
import { TopNav } from '../../components/marketing/TopNav';
import { Footer } from '../../components/marketing/Footer';

function nav(hash: string) { window.location.href = hash; }

// ─── Mobile Phone Mockup ─────────────────────────────────────────────────────

function MobilePreview() {
  return (
    <div className="relative w-[180px] shrink-0">
      {/* Phone shell */}
      <div className="relative bg-slate-900 rounded-[32px] p-[3px] shadow-2xl ring-1 ring-white/10">
        {/* Speaker + camera notch */}
        <div className="absolute top-[14px] left-1/2 -translate-x-1/2 w-16 h-[18px] bg-slate-900 rounded-full z-20 flex items-center justify-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-slate-700" />
          <div className="w-8 h-1.5 rounded-full bg-slate-700" />
        </div>

        {/* Screen */}
        <div className="rounded-[30px] overflow-hidden bg-white" style={{ height: 360 }}>
          {/* Status bar */}
          <div className="flex items-center justify-between px-4 py-2 bg-white">
            <span className="text-[8px] font-bold text-slate-900">9:41</span>
            <div className="flex items-center gap-1">
              <div className="flex gap-0.5 items-end">
                {[3, 5, 7, 9].map((h, i) => (
                  <div key={i} className={`w-1 rounded-sm ${i < 3 ? 'bg-slate-900' : 'bg-slate-300'}`} style={{ height: h }} />
                ))}
              </div>
              <div className="w-5 h-2.5 border border-slate-900 rounded-sm relative ml-0.5">
                <div className="absolute inset-[1.5px] right-[3px] bg-emerald-500 rounded-sm" />
                <div className="absolute right-[-3px] top-[3px] w-1 h-1.5 bg-slate-400 rounded-r-sm" />
              </div>
            </div>
          </div>

          {/* App header */}
          <div className="px-4 py-2.5 bg-primary-600 flex items-center gap-2.5">
            <div className="w-6 h-6 bg-white/20 rounded-lg flex items-center justify-center">
              <GraduationCap className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-white leading-none">Student Assessment Portal</p>
              <p className="text-[8px] text-primary-200 mt-0.5">LLND <span className="shimmer-text">Automate</span></p>
            </div>
          </div>

          {/* Learner greeting */}
          <div className="px-4 pt-3 pb-2">
            <p className="text-[10px] font-bold text-slate-800">Hi, Sarah</p>
            <p className="text-[8px] text-slate-500">You have 2 assessments ready</p>
          </div>

          {/* Assessment card 1 — LLN */}
          <div className="mx-3 mb-2 bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="w-7 h-7 rounded-lg bg-primary-50 flex items-center justify-center shrink-0">
                <BookOpen className="w-3.5 h-3.5 text-primary-600" />
              </div>
              <span className="text-[8px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded-full">Not Started</span>
            </div>
            <p className="text-[10px] font-bold text-slate-800 mb-0.5">LLN Assessment</p>
            <p className="text-[8px] text-slate-500 mb-2">Reading, writing &amp; numeracy</p>
            <div className="flex items-center gap-1 mb-2">
              <Clock className="w-2.5 h-2.5 text-slate-400" />
              <span className="text-[8px] text-slate-500">~18 minutes</span>
            </div>
            <div className="w-full bg-primary-600 rounded-lg py-1.5 flex items-center justify-center gap-1">
              <span className="text-[9px] font-bold text-white">Start Assessment</span>
              <ArrowRight className="w-2.5 h-2.5 text-white" />
            </div>
          </div>

          {/* Assessment card 2 — Digital */}
          <div className="mx-3 bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="w-7 h-7 rounded-lg bg-teal-50 flex items-center justify-center shrink-0">
                <Monitor className="w-3.5 h-3.5 text-teal-600" />
              </div>
              <span className="text-[8px] font-bold px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">Completed</span>
            </div>
            <p className="text-[10px] font-bold text-slate-800 mb-0.5">Digital Literacy</p>
            <p className="text-[8px] text-slate-500 mb-2">Digital capability assessment</p>
            <div className="flex items-center gap-1">
              <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" />
              <span className="text-[8px] text-emerald-600 font-semibold">Score: 88% — Passed</span>
            </div>
          </div>
        </div>

        {/* Home bar */}
        <div className="flex justify-center py-2">
          <div className="w-24 h-1 bg-slate-600 rounded-full" />
        </div>
      </div>

      {/* Side button hints */}
      <div className="absolute right-[-4px] top-20 w-1 h-8 bg-slate-700 rounded-l-sm" />
      <div className="absolute left-[-4px] top-16 w-1 h-6 bg-slate-700 rounded-r-sm" />
      <div className="absolute left-[-4px] top-24 w-1 h-6 bg-slate-700 rounded-r-sm" />
    </div>
  );
}

// ─── Dashboard mockup ────────────────────────────────────────────────────────

function DashboardMockup() {
  const rows = [
    { name: 'Sarah Johnson', type: 'LLN', score: 84, pass: true },
    { name: 'Michael Chen', type: 'LLN', score: 91, pass: true },
    { name: 'Emma Wilson', type: 'Digital', score: 43, pass: false },
    { name: 'James Taylor', type: 'LLN', score: 76, pass: true },
    { name: 'Priya Sharma', type: 'Digital', score: 88, pass: true },
  ];

  return (
    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden select-none">
      {/* Browser chrome */}
      <div className="bg-slate-100 px-4 py-3 flex items-center gap-3 border-b border-slate-200">
        <div className="flex gap-1.5 flex-shrink-0">
          <div className="w-3 h-3 rounded-full bg-rose-400" />
          <div className="w-3 h-3 rounded-full bg-amber-400" />
          <div className="w-3 h-3 rounded-full bg-emerald-400" />
        </div>
        <div className="flex-1 bg-white rounded-md px-3 py-1.5 text-xs text-slate-400 font-mono truncate">
          app.llnd.com.au/dashboard
        </div>
      </div>

      {/* App window */}
      <div className="flex" style={{ height: 380 }}>
        {/* Sidebar */}
        <div className="w-40 bg-white border-r border-slate-100 py-3 px-2 flex flex-col gap-0.5 flex-shrink-0">
          <div className="flex items-center gap-2 px-2 py-2 mb-2">
            <div className="w-6 h-6 bg-primary-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <GraduationCap className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-xs font-extrabold text-slate-900">LLND Automate</span>
          </div>
          {[
            { label: 'Dashboard', active: true },
            { label: 'Assessments', active: false },
            { label: 'Candidates', active: false },
            { label: 'Results', active: false },
            { label: 'Support Plans', active: false },
            { label: 'Billing', active: false },
            { label: 'Settings', active: false },
          ].map((item) => (
            <div
              key={item.label}
              className={`px-2 py-1.5 rounded-lg text-xs font-medium ${
                item.active ? 'bg-primary-50 text-primary-700' : 'text-slate-500'
              }`}
            >
              {item.label}
            </div>
          ))}
        </div>

        {/* Main */}
        <div className="flex-1 bg-slate-50 p-3 overflow-hidden">
          <p className="text-xs font-bold text-slate-800 mb-2.5">Dashboard</p>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-1.5 mb-3">
            {[
              { label: 'Sent', val: '124', color: 'text-slate-900' },
              { label: 'Completed', val: '98', color: 'text-slate-900' },
              { label: 'Pass Rate', val: '87%', color: 'text-emerald-600' },
              { label: 'ACSF Avg', val: '4.2', color: 'text-primary-600' },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-lg p-2 shadow-sm border border-slate-100">
                <p className={`text-base font-extrabold leading-none ${s.color}`}>{s.val}</p>
                <p className="text-[10px] text-slate-400 mt-1 leading-none">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Chart bar (fake) */}
          <div className="bg-white rounded-lg border border-slate-100 shadow-sm p-2.5 mb-2">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold text-slate-700">Assessment Funnel</p>
              <BarChart3 className="w-3 h-3 text-slate-300" />
            </div>
            <div className="flex items-end gap-1 h-12">
              {[100, 82, 68, 56].map((h, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t-sm"
                    style={{
                      height: `${h}%`,
                      background: i === 0 ? '#3b82f6' : i === 1 ? '#60a3fa' : i === 2 ? '#93c4ff' : '#bfdcff',
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-1">
              {['Sent', 'Open', 'Done', 'Pass'].map((l) => (
                <p key={l} className="text-[8px] text-slate-400 flex-1 text-center">{l}</p>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-lg border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-2.5 py-1.5 border-b border-slate-50 flex items-center justify-between">
              <p className="text-[10px] font-semibold text-slate-700">Recent Assessments</p>
              <TrendingUp className="w-3 h-3 text-slate-300" />
            </div>
            {rows.map((row) => (
              <div key={row.name} className="px-2.5 py-1.5 flex items-center gap-2 border-b border-slate-50 last:border-0">
                <div className="w-5 h-5 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-[9px] font-bold flex-shrink-0">
                  {row.name[0]}
                </div>
                <p className="text-[10px] font-medium text-slate-800 w-20 truncate flex-shrink-0">{row.name}</p>
                <span className={`text-[9px] px-1 py-0.5 rounded font-semibold flex-shrink-0 ${
                  row.type === 'LLN' ? 'bg-primary-50 text-primary-700' : 'bg-accent-50 text-accent-700'
                }`}>
                  {row.type}
                </span>
                <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${row.pass ? 'bg-emerald-500' : 'bg-rose-400'}`}
                    style={{ width: `${row.score}%` }}
                  />
                </div>
                <span className={`text-[10px] font-bold w-6 text-right flex-shrink-0 ${
                  row.pass ? 'text-emerald-600' : 'text-rose-600'
                }`}>
                  {row.score}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Portal Slideshow ─────────────────────────────────────────────────────────

function SlideDashboard() {
  return (
    <div className="flex h-full">
      <div className="w-36 bg-white border-r border-slate-100 py-3 px-2 flex flex-col gap-0.5 flex-shrink-0">
        <div className="flex items-center gap-2 px-2 py-2 mb-2">
          <div className="w-6 h-6 bg-primary-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <GraduationCap className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-xs font-extrabold text-slate-900">LLND Automate</span>
        </div>
        {['Dashboard', 'Assessments', 'Candidates', 'Results', 'Support Plans', 'Settings'].map((item, i) => (
          <div key={item} className={`px-2 py-1.5 rounded-lg text-xs font-medium ${i === 0 ? 'bg-primary-50 text-primary-700' : 'text-slate-500'}`}>{item}</div>
        ))}
      </div>
      <div className="flex-1 bg-slate-50 p-3 overflow-hidden">
        <p className="text-xs font-bold text-slate-800 mb-2.5">Dashboard</p>
        <div className="grid grid-cols-4 gap-1.5 mb-3">
          {[{ l: 'Sent', v: '124', c: 'text-slate-900' }, { l: 'Completed', v: '98', c: 'text-slate-900' }, { l: 'Pass Rate', v: '87%', c: 'text-emerald-600' }, { l: 'ACSF Avg', v: '4.2', c: 'text-primary-600' }].map((s) => (
            <div key={s.l} className="bg-white rounded-lg p-2 shadow-sm border border-slate-100">
              <p className={`text-base font-extrabold leading-none ${s.c}`}>{s.v}</p>
              <p className="text-[10px] text-slate-400 mt-1">{s.l}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1.5 mb-2">
          <div className="bg-white rounded-lg border border-slate-100 shadow-sm p-2.5">
            <p className="text-[10px] font-semibold text-slate-700 mb-2">Assessment Funnel</p>
            <div className="flex items-end gap-1 h-16">
              {[{ h: 100, l: 'Sent', c: '#3b82f6' }, { h: 82, l: 'Opened', c: '#60a3fa' }, { h: 68, l: 'Complete', c: '#93c4ff' }, { h: 56, l: 'Passed', c: '#bfdcff' }].map((b) => (
                <div key={b.l} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full rounded-t-sm" style={{ height: `${b.h}%`, background: b.c }} />
                  <p className="text-[8px] text-slate-400">{b.l}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-lg border border-slate-100 shadow-sm p-2.5">
            <p className="text-[10px] font-semibold text-slate-700 mb-2">This Month</p>
            {[{ l: 'New invitations', v: '31', c: 'text-blue-600' }, { l: 'Completed today', v: '8', c: 'text-emerald-600' }, { l: 'Awaiting action', v: '5', c: 'text-amber-600' }, { l: 'Support plans sent', v: '12', c: 'text-primary-600' }].map((r) => (
              <div key={r.l} className="flex justify-between items-center py-0.5">
                <span className="text-[9px] text-slate-500">{r.l}</span>
                <span className={`text-[10px] font-bold ${r.c}`}>{r.v}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-lg border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-2.5 py-1.5 border-b border-slate-50">
            <p className="text-[10px] font-semibold text-slate-700">Recent Assessments</p>
          </div>
          {[{ n: 'Sarah Johnson', t: 'LLN', s: 84, p: true }, { n: 'Michael Chen', t: 'Digital', s: 91, p: true }, { n: 'Emma Wilson', t: 'LLN', s: 43, p: false }].map((r) => (
            <div key={r.n} className="px-2.5 py-1.5 flex items-center gap-2 border-b border-slate-50 last:border-0">
              <div className="w-5 h-5 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-[9px] font-bold flex-shrink-0">{r.n[0]}</div>
              <p className="text-[10px] font-medium text-slate-800 w-20 truncate flex-shrink-0">{r.n}</p>
              <span className={`text-[9px] px-1 py-0.5 rounded font-semibold flex-shrink-0 ${r.t === 'LLN' ? 'bg-primary-50 text-primary-700' : 'bg-teal-50 text-teal-700'}`}>{r.t}</span>
              <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${r.p ? 'bg-emerald-500' : 'bg-rose-400'}`} style={{ width: `${r.s}%` }} />
              </div>
              <span className={`text-[10px] font-bold w-6 text-right flex-shrink-0 ${r.p ? 'text-emerald-600' : 'text-rose-600'}`}>{r.s}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SlideCandidates() {
  return (
    <div className="flex h-full">
      <div className="w-36 bg-white border-r border-slate-100 py-3 px-2 flex flex-col gap-0.5 flex-shrink-0">
        <div className="flex items-center gap-2 px-2 py-2 mb-2">
          <div className="w-6 h-6 bg-primary-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <GraduationCap className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-xs font-extrabold text-slate-900">LLND Automate</span>
        </div>
        {['Dashboard', 'Assessments', 'Candidates', 'Results', 'Support Plans', 'Settings'].map((item, i) => (
          <div key={item} className={`px-2 py-1.5 rounded-lg text-xs font-medium ${i === 2 ? 'bg-primary-50 text-primary-700' : 'text-slate-500'}`}>{item}</div>
        ))}
      </div>
      <div className="flex-1 bg-slate-50 p-3 overflow-hidden">
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-xs font-bold text-slate-800">Candidates</p>
          <div className="flex gap-1">
            <div className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-[9px] text-slate-500">All statuses</div>
            <div className="bg-primary-600 rounded-lg px-2 py-1 text-[9px] text-white font-semibold">+ Invite</div>
          </div>
        </div>
        <div className="flex gap-1 mb-2">
          {[{ l: 'In Progress', v: 12, c: 'bg-amber-50 text-amber-700 border-amber-200' }, { l: 'Completed', v: 43, c: 'bg-emerald-50 text-emerald-700 border-emerald-200' }, { l: 'Overdue', v: 3, c: 'bg-rose-50 text-rose-700 border-rose-200' }].map((t) => (
            <div key={t.l} className={`rounded-lg px-2 py-1 border text-[9px] font-semibold ${t.c}`}>{t.l} ({t.v})</div>
          ))}
        </div>
        <div className="bg-white rounded-lg border border-slate-100 shadow-sm overflow-hidden">
          <div className="grid grid-cols-12 px-2.5 py-1.5 border-b border-slate-100 bg-slate-50/70">
            {['Candidate', 'Type', 'Status', 'Progress', 'Score', ''].map((h) => (
              <div key={h} className={`text-[8px] font-semibold text-slate-400 uppercase ${h === 'Candidate' ? 'col-span-3' : h === 'Status' ? 'col-span-2' : h === 'Progress' ? 'col-span-2' : 'col-span-1'}`}>{h}</div>
            ))}
          </div>
          {[
            { n: 'Sarah Johnson', t: 'LLN', status: 'Completed', statusC: 'bg-emerald-100 text-emerald-700', progress: 100, score: '84%', scoreC: 'text-emerald-600' },
            { n: 'Michael Chen', t: 'Both', status: 'In Progress', statusC: 'bg-amber-100 text-amber-700', progress: 65, score: '—', scoreC: 'text-slate-400' },
            { n: 'Emma Wilson', t: 'Digital', status: 'Completed', statusC: 'bg-emerald-100 text-emerald-700', progress: 100, score: '91%', scoreC: 'text-emerald-600' },
            { n: 'James Taylor', t: 'LLN', status: 'Overdue', statusC: 'bg-rose-100 text-rose-700', progress: 20, score: '—', scoreC: 'text-slate-400' },
            { n: 'Priya Sharma', t: 'Both', status: 'Sent', statusC: 'bg-slate-100 text-slate-600', progress: 0, score: '—', scoreC: 'text-slate-400' },
          ].map((r) => (
            <div key={r.n} className="grid grid-cols-12 px-2.5 py-2 items-center border-b border-slate-50 last:border-0">
              <div className="col-span-3 flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-[9px] font-bold flex-shrink-0">{r.n[0]}</div>
                <p className="text-[9px] font-medium text-slate-800 truncate">{r.n}</p>
              </div>
              <div className="col-span-1"><span className="text-[8px] font-semibold bg-primary-50 text-primary-700 px-1 py-0.5 rounded">{r.t}</span></div>
              <div className="col-span-2"><span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-full ${r.statusC}`}>{r.status}</span></div>
              <div className="col-span-2 pr-2">
                <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-primary-500 rounded-full" style={{ width: `${r.progress}%` }} />
                </div>
              </div>
              <div className={`col-span-1 text-[10px] font-bold ${r.scoreC}`}>{r.score}</div>
              <div className="col-span-3 flex gap-1 justify-end">
                <div className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center"><Activity className="w-2.5 h-2.5 text-slate-400" /></div>
                <div className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center"><FileText className="w-2.5 h-2.5 text-slate-400" /></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SlideResults() {
  const domains = [
    { label: 'Reading', icon: BookOpen, level: 4, color: 'bg-blue-500', light: 'bg-blue-50 text-blue-700' },
    { label: 'Numeracy', icon: CalcIcon, level: 3, color: 'bg-emerald-500', light: 'bg-emerald-50 text-emerald-700' },
    { label: 'Writing', icon: FileText, level: 4, color: 'bg-violet-500', light: 'bg-violet-50 text-violet-700' },
    { label: 'Oral Comm.', icon: MessageCircle, level: 5, color: 'bg-amber-500', light: 'bg-amber-50 text-amber-700' },
    { label: 'Digital', icon: Monitor, level: 3, color: 'bg-teal-500', light: 'bg-teal-50 text-teal-700' },
  ];
  return (
    <div className="flex h-full">
      <div className="w-36 bg-white border-r border-slate-100 py-3 px-2 flex flex-col gap-0.5 flex-shrink-0">
        <div className="flex items-center gap-2 px-2 py-2 mb-2">
          <div className="w-6 h-6 bg-primary-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <GraduationCap className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-xs font-extrabold text-slate-900">LLND Automate</span>
        </div>
        {['Dashboard', 'Assessments', 'Candidates', 'Results', 'Support Plans', 'Settings'].map((item, i) => (
          <div key={item} className={`px-2 py-1.5 rounded-lg text-xs font-medium ${i === 3 ? 'bg-primary-50 text-primary-700' : 'text-slate-500'}`}>{item}</div>
        ))}
      </div>
      <div className="flex-1 bg-slate-50 p-3 overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-slate-800">Results — Sarah Johnson</p>
          <span className="text-[9px] bg-emerald-100 text-emerald-700 font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
            <CheckCircle2 className="w-2.5 h-2.5" /> Passed
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5 mb-2">
          {[{ l: 'Overall Score', v: '84%', c: 'text-emerald-600' }, { l: 'ACSF Average', v: 'Level 4', c: 'text-primary-600' }, { l: 'Time Taken', v: '18 min', c: 'text-slate-700' }].map((s) => (
            <div key={s.l} className="bg-white rounded-lg p-2 border border-slate-100">
              <p className={`text-sm font-extrabold ${s.c}`}>{s.v}</p>
              <p className="text-[9px] text-slate-400 mt-0.5">{s.l}</p>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-lg border border-slate-100 p-2.5 mb-2">
          <p className="text-[10px] font-semibold text-slate-700 mb-2">ACSF Domain Breakdown</p>
          <div className="space-y-1.5">
            {domains.map((d) => (
              <div key={d.label} className="flex items-center gap-2">
                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${d.light} w-16 text-center flex-shrink-0`}>{d.label}</span>
                <div className="flex-1 flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((lvl) => (
                    <div key={lvl} className={`flex-1 h-3 rounded-sm ${lvl <= d.level ? d.color : 'bg-slate-100'}`} />
                  ))}
                </div>
                <span className="text-[9px] font-bold text-slate-700 w-10 text-right flex-shrink-0">Level {d.level}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-lg border border-slate-100 p-2.5">
          <p className="text-[10px] font-semibold text-slate-700 mb-1.5">Trainer Notes</p>
          <p className="text-[9px] text-slate-500 leading-relaxed">Strong performance across all domains. Minor gap in numeracy Level 4 — recommend targeted support in data analysis tasks. No further LLN intervention required.</p>
          <div className="flex gap-1 mt-2">
            <div className="bg-primary-600 rounded px-2 py-0.5 text-[9px] text-white font-semibold">Generate Support Plan</div>
            <div className="bg-white border border-slate-200 rounded px-2 py-0.5 text-[9px] text-slate-600 font-semibold">Download PDF</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SlideSupportPlan() {
  return (
    <div className="flex h-full">
      <div className="w-36 bg-white border-r border-slate-100 py-3 px-2 flex flex-col gap-0.5 flex-shrink-0">
        <div className="flex items-center gap-2 px-2 py-2 mb-2">
          <div className="w-6 h-6 bg-primary-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <GraduationCap className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-xs font-extrabold text-slate-900">LLND Automate</span>
        </div>
        {['Dashboard', 'Assessments', 'Candidates', 'Results', 'Support Plans', 'Settings'].map((item, i) => (
          <div key={item} className={`px-2 py-1.5 rounded-lg text-xs font-medium ${i === 4 ? 'bg-primary-50 text-primary-700' : 'text-slate-500'}`}>{item}</div>
        ))}
      </div>
      <div className="flex-1 bg-slate-50 p-3 overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-slate-800">Support Plan — James Taylor</p>
          <span className="text-[9px] bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
            <AlertCircle className="w-2.5 h-2.5" /> Draft — Awaiting Review
          </span>
        </div>
        <div className="bg-white rounded-lg border border-slate-100 p-2.5 mb-1.5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="w-4 h-4 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
              <Brain className="w-2.5 h-2.5 text-violet-600" />
            </div>
            <p className="text-[10px] font-semibold text-slate-700">AI-Generated Summary</p>
            <span className="text-[8px] bg-violet-50 text-violet-600 px-1 py-0.5 rounded font-semibold ml-auto">AI Draft</span>
          </div>
          <p className="text-[9px] text-slate-500 leading-relaxed">James demonstrates below-benchmark skills in Reading (Level 2) and Numeracy (Level 1). Immediate support is recommended prior to commencing Certificate III training. A structured literacy program is advised alongside embedded numeracy activities in unit delivery.</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-100 p-2.5 mb-1.5">
          <p className="text-[10px] font-semibold text-slate-700 mb-1.5">Recommended Interventions</p>
          <div className="space-y-1">
            {[
              { label: 'Targeted reading support — ACSF Level 2→3', priority: 'High', c: 'bg-rose-50 text-rose-700' },
              { label: 'Foundation numeracy workshop', priority: 'High', c: 'bg-rose-50 text-rose-700' },
              { label: 'Weekly trainer check-in for 4 weeks', priority: 'Medium', c: 'bg-amber-50 text-amber-700' },
            ].map((item) => (
              <div key={item.label} className="flex items-start gap-2">
                <CheckCircle2 className="w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" />
                <p className="text-[9px] text-slate-600 flex-1">{item.label}</p>
                <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${item.c}`}>{item.priority}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-1.5">
          <div className="flex-1 bg-primary-600 rounded-lg py-1.5 flex items-center justify-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-white" />
            <span className="text-[10px] text-white font-bold">Approve &amp; Send to Learner</span>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[9px] text-slate-600 font-semibold">Edit</div>
        </div>
      </div>
    </div>
  );
}

function SlideTimeline() {
  const events = [
    { label: 'LLN assessment declaration agreed', time: 'Today, 9:14 am', color: 'bg-emerald-500', detail: 'Declaration version 1 accepted' },
    { label: 'LLN quiz sent', time: 'Today, 9:00 am', color: 'bg-blue-500', detail: 'Invitation email delivered' },
    { label: 'Digital quiz abandoned', time: 'Yesterday, 3:22 pm', color: 'bg-orange-400', detail: 'Quiz left at 45% completion', progress: 45 },
    { label: 'Digital quiz sent', time: 'Yesterday, 2:00 pm', color: 'bg-teal-500', detail: 'Invitation email delivered' },
    { label: 'Reminder sent', time: '2 days ago', color: 'bg-amber-500', detail: 'Automated reminder email' },
    { label: 'Invitation created', time: '3 days ago', color: 'bg-slate-400', detail: 'Created by admin' },
    { label: 'Synced from aXcelerate', time: '3 days ago', color: 'bg-teal-500', detail: 'Contact record imported' },
  ];
  return (
    <div className="flex h-full">
      <div className="w-36 bg-white border-r border-slate-100 py-3 px-2 flex flex-col gap-0.5 flex-shrink-0">
        <div className="flex items-center gap-2 px-2 py-2 mb-2">
          <div className="w-6 h-6 bg-primary-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <GraduationCap className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-xs font-extrabold text-slate-900">LLND Automate</span>
        </div>
        {['Dashboard', 'Assessments', 'Candidates', 'Results', 'Support Plans', 'Settings'].map((item, i) => (
          <div key={item} className={`px-2 py-1.5 rounded-lg text-xs font-medium ${i === 2 ? 'bg-primary-50 text-primary-700' : 'text-slate-500'}`}>{item}</div>
        ))}
      </div>
      <div className="flex-1 bg-slate-50 p-3 overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs font-bold text-slate-800">Activity Timeline</p>
            <p className="text-[9px] text-slate-400">Emma Wilson</p>
          </div>
          <div className="w-6 h-6 rounded-lg bg-slate-200 flex items-center justify-center cursor-pointer">
            <X className="w-3 h-3 text-slate-500" />
          </div>
        </div>
        <div className="relative">
          <div className="absolute left-3.5 top-0 bottom-0 w-px bg-slate-200" />
          <div className="space-y-4">
            {events.map((ev, i) => (
              <div key={i} className="relative flex gap-3 pl-9">
                <div className={`absolute left-0 w-7 h-7 rounded-full flex items-center justify-center ${ev.color}`}>
                  <Activity className="w-3 h-3 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-slate-800">{ev.label}</p>
                  <p className="text-[9px] text-slate-500">{ev.detail}</p>
                  {ev.progress !== undefined && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <div className="flex-1 h-1 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-orange-400 rounded-full" style={{ width: `${ev.progress}%` }} />
                      </div>
                      <span className="text-[9px] font-bold text-orange-600">{ev.progress}%</span>
                    </div>
                  )}
                  <p className="text-[8px] text-slate-400 mt-0.5">{ev.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const SLIDES = [
  {
    id: 'dashboard',
    title: 'Real-time Dashboard',
    description: 'See every assessment at a glance — completion rates, ACSF averages, and the full assessment funnel in one view.',
    url: 'app.llnd.com.au/dashboard',
    component: SlideDashboard,
  },
  {
    id: 'candidates',
    title: 'Candidate Management',
    description: 'Track every learner from invitation to completion. Filter by status, send reminders, and access results in one click.',
    url: 'app.llnd.com.au/candidates',
    component: SlideCandidates,
  },
  {
    id: 'results',
    title: 'ACSF Results & Mapping',
    description: 'Automatically map every score to ACSF skill levels. Download audit-ready evidence reports instantly.',
    url: 'app.llnd.com.au/results',
    component: SlideResults,
  },
  {
    id: 'support',
    title: 'AI Support Plans',
    description: 'AI drafts personalised support plans from assessment results. Trainers review, approve, and send in seconds.',
    url: 'app.llnd.com.au/support-plans',
    component: SlideSupportPlan,
  },
  {
    id: 'timeline',
    title: 'Activity Timeline',
    description: 'A full audit trail for every learner — from first contact to completed assessment, with timestamped evidence.',
    url: 'app.llnd.com.au/candidates',
    component: SlideTimeline,
  },
];

function PortalSlideshow() {
  const [current, setCurrent] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');

  const goTo = useCallback((idx: number, dir: 'next' | 'prev' = 'next') => {
    if (animating) return;
    setDirection(dir);
    setAnimating(true);
    setTimeout(() => {
      setCurrent(idx);
      setAnimating(false);
    }, 220);
  }, [animating]);

  const next = useCallback(() => goTo((current + 1) % SLIDES.length, 'next'), [current, goTo]);
  const prev = useCallback(() => goTo((current - 1 + SLIDES.length) % SLIDES.length, 'prev'), [current, goTo]);

  useEffect(() => {
    const t = setInterval(next, 4500);
    return () => clearInterval(t);
  }, [next]);

  const slide = SLIDES[current];
  const SlideComponent = slide.component;

  return (
    <div className="relative">
      {/* Slide label tabs */}
      <div className="flex gap-2 justify-center mb-6 flex-wrap">
        {SLIDES.map((s, i) => (
          <button
            key={s.id}
            onClick={() => goTo(i, i > current ? 'next' : 'prev')}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 ${
              i === current
                ? 'bg-primary-600 text-white shadow-md shadow-primary-200'
                : 'bg-white border border-slate-200 text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            {s.title}
          </button>
        ))}
      </div>

      {/* Browser mockup */}
      <div className="relative mx-auto" style={{ maxWidth: 760 }}>
        {/* Nav arrows */}
        <button
          onClick={prev}
          className="absolute -left-5 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-white border border-slate-200 rounded-full shadow-md flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-all"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          onClick={next}
          className="absolute -right-5 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-white border border-slate-200 rounded-full shadow-md flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-all"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        {/* Browser frame */}
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
          {/* Chrome bar */}
          <div className="bg-slate-100 px-4 py-3 flex items-center gap-3 border-b border-slate-200">
            <div className="flex gap-1.5 flex-shrink-0">
              <div className="w-3 h-3 rounded-full bg-rose-400" />
              <div className="w-3 h-3 rounded-full bg-amber-400" />
              <div className="w-3 h-3 rounded-full bg-emerald-400" />
            </div>
            <div className="flex-1 bg-white rounded-md px-3 py-1.5 text-xs text-slate-400 font-mono truncate">
              {slide.url}
            </div>
            <div className="text-[10px] text-slate-400 font-semibold hidden sm:block">LLND Automate Portal</div>
          </div>

          {/* Slide content */}
          <div
            className="overflow-hidden"
            style={{ height: 380 }}
          >
            <div
              style={{
                opacity: animating ? 0 : 1,
                transform: animating
                  ? `translateX(${direction === 'next' ? '-12px' : '12px'})`
                  : 'translateX(0)',
                transition: 'opacity 220ms ease, transform 220ms ease',
                height: '100%',
              }}
            >
              <SlideComponent />
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-0.5 bg-slate-100">
            <div
              className="h-full bg-primary-500 transition-none"
              style={{
                width: `${((current + 1) / SLIDES.length) * 100}%`,
                transition: 'width 4500ms linear',
              }}
            />
          </div>
        </div>
      </div>

      {/* Caption */}
      <div
        className="mt-6 text-center"
        style={{
          opacity: animating ? 0 : 1,
          transition: 'opacity 220ms ease',
        }}
      >
        <h3 className="text-lg font-bold text-slate-900 mb-1">{slide.title}</h3>
        <p className="text-slate-500 text-sm max-w-xl mx-auto">{slide.description}</p>
      </div>

      {/* Dots */}
      <div className="flex justify-center gap-2 mt-5">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i, i > current ? 'next' : 'prev')}
            className={`rounded-full transition-all duration-200 ${
              i === current ? 'w-6 h-2 bg-primary-600' : 'w-2 h-2 bg-slate-300 hover:bg-slate-400'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Feature data ─────────────────────────────────────────────────────────────

const FEATURES = [
  { icon: Brain, color: 'bg-violet-100 text-violet-600', title: 'AI-Generated Reports', desc: 'Automated ACSF-mapped reports for every learner, drafted by AI and approved by trainers.' },
  { icon: Target, color: 'bg-blue-100 text-blue-600', title: 'ACSF Mapped Assessments', desc: 'Every question mapped to ACSF skills and performance levels for immediate compliance use.' },
  { icon: Monitor, color: 'bg-teal-100 text-teal-600', title: 'Digital Capability', desc: 'Assess digital skills alongside LLN in one unified platform designed for modern RTOs.' },
  { icon: Package, color: 'bg-emerald-100 text-emerald-600', title: 'Combined LLN + Digital', desc: 'Run both assessments together. Same learner counts once — no double billing.' },
  { icon: Clock, color: 'bg-amber-100 text-amber-600', title: 'Fast 20-Minute Assessments', desc: 'Learner-friendly, mobile-optimised assessments completed in under 20 minutes.' },
  { icon: AlertTriangle, color: 'bg-rose-100 text-rose-600', title: 'Intervention Workflows', desc: 'Built-in trainer intervention workflows for at-risk learners with evidence tracking.' },
  { icon: ClipboardList, color: 'bg-sky-100 text-sky-600', title: 'Support Plans', desc: 'AI-drafted support plans with trainer review and approval. Sent to learners in one click.' },
  { icon: ShieldCheck, color: 'bg-green-100 text-green-600', title: 'Audit-Ready Evidence', desc: 'ASQA-compliant evidence trail for every assessment. Always ready for a review visit.' },
  { icon: Zap, color: 'bg-yellow-100 text-yellow-600', title: 'Self-Service Onboarding', desc: 'Create your org, invite trainers, and start assessing in minutes. No sales call needed.' },
  { icon: DollarSign, color: 'bg-lime-100 text-lime-600', title: 'Usage-Based Pricing', desc: 'Only pay for learners who complete assessments. No wasted spend on idle accounts.' },
  { icon: Users, color: 'bg-indigo-100 text-indigo-600', title: 'Unlimited Trainers', desc: 'Add as many trainers as you need across any number of campuses. No per-seat fees.' },
  { icon: Building2, color: 'bg-orange-100 text-orange-600', title: 'Unlimited Campuses', desc: 'Manage multiple campuses, delivery modes, and teams from one central dashboard.' },
];

// ─── Comparison table ─────────────────────────────────────────────────────────

const COMPARISON = [
  { feature: 'Usage-based pricing', us: true, them: '✗ Seat licences' },
  { feature: 'Combined LLN + Digital', us: true, them: '✗ Separate products' },
  { feature: 'AI-generated reports', us: true, them: '✗ Manual only' },
  { feature: 'Modern mobile interface', us: true, them: '✗ Legacy forms' },
  { feature: 'Unlimited trainers', us: true, them: '✗ Per-seat cost' },
  { feature: 'Unlimited campuses', us: true, them: '✗ Per-site cost' },
  { feature: 'Fast 20-min assessments', us: true, them: '✗ 60+ minutes' },
  { feature: 'Transparent billing', us: true, them: '✗ Hidden fees' },
  { feature: 'Self-service sign up', us: true, them: '✗ Sales call required' },
  { feature: 'Audit-ready evidence trail', us: true, them: '~ Varies' },
  { feature: 'ACSF skill mapping', us: true, them: '~ Partial' },
  { feature: 'Learner deduplication', us: true, them: '✗ Charged twice' },
];

// ─── Pricing cards ────────────────────────────────────────────────────────────

const PLANS = [
  {
    id: 'lln_only', name: 'LLN Only', price: 79, badge: null,
    features: ['Unlimited trainers', 'Unlimited campuses', 'ACSF-mapped assessments', 'AI-generated reports', 'Support plans', 'Audit-ready evidence', '50 learner assessments/month'],
    extra: '$1.50 per additional learner',
  },
  {
    id: 'digital_only', name: 'Digital Only', price: 79, badge: null,
    features: ['Unlimited trainers', 'Unlimited campuses', 'Digital capability assessments', 'AI-generated reports', 'Support plans', 'Audit-ready evidence', '50 learner assessments/month'],
    extra: '$1.50 per additional learner',
  },
  {
    id: 'lln_digital', name: 'LLN + Digital', price: 129, badge: 'Most Popular',
    features: ['Everything in LLN Only', 'Everything in Digital Only', 'Same learner = one assessment', '50 learner assessments/month'],
    extra: '$1.50 per additional learner',
    highlight: true,
  },
];

// ─── Testimonials ─────────────────────────────────────────────────────────────

const TESTIMONIALS = [
  {
    quote: 'The AI reports save our trainers hours every intake period. Learners complete assessments on their phones and we have ACSF-mapped reports within minutes. It has completely transformed our pre-enrolment process.',
    name: 'Sarah Mitchell',
    role: 'Training Manager',
    org: 'Gold Coast Training Institute',
    color: 'border-primary-400',
  },
  {
    quote: 'Our learner assessment completion rate went from 40% to 96% after switching to LLND Automate. The assessments are actually engaging and the mobile experience is far better than anything else we\'ve tried.',
    name: 'James Nguyen',
    role: 'RTO Director',
    org: 'Skills First Training',
    color: 'border-accent-400',
  },
  {
    quote: 'ASQA compliance used to be stressful. Now our entire evidence trail is always audit-ready and the ACSF mapping is automatic. I can\'t imagine going back to our old spreadsheet-based approach.',
    name: 'Emma Thompson',
    role: 'Compliance Officer',
    org: 'Pacific Training Institute',
    color: 'border-emerald-400',
  },
];

// ─── FAQ ──────────────────────────────────────────────────────────────────────

const FAQS = [
  {
    q: 'How is billing calculated?',
    a: 'You pay a flat monthly platform fee plus $1.50 for each learner assessment completed beyond your 50-assessment allowance. If a learner completes both LLN and Digital on the LLN + Digital plan, they count as one assessment.',
  },
  {
    q: 'What counts as a completed learner assessment?',
    a: 'A learner assessment is counted when a learner fully submits their assessment responses. Incomplete, abandoned, or in-progress assessments are never billed.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. You can cancel at any time from the Billing page. Your subscription remains active until the end of the current billing period. No lock-in contracts.',
  },
  {
    q: 'Do you charge for inactive learners?',
    a: 'No. You only pay when a learner actually completes an assessment. Sending invitations, drafting assessments, or having inactive trainers on your account costs nothing extra.',
  },
  {
    q: 'Can I import existing learners from aXcelerate?',
    a: 'Yes. LLND Automate integrates directly with aXcelerate. You can search and import existing contacts, and sync assessment outcomes back to their enrolment records automatically.',
  },
  {
    q: 'Is everything ACSF mapped?',
    a: 'Yes. Every assessment question is mapped to an ACSF skill (Reading, Writing, Oral Communication, Numeracy, or Digital Literacy) and performance level. Reports are generated automatically.',
  },
  {
    q: 'Can trainers create and approve reports?',
    a: 'Yes. AI-generated support plans are reviewed and approved by trainers before being sent to learners. Trainers can also add notes, override recommendations, and track interventions.',
  },
  {
    q: 'Can I upgrade or downgrade my subscription?',
    a: 'Yes. You can change your plan at any time from the Billing page. Changes take effect immediately. Usage for the current period is carried over.',
  },
];

// ─── Calculator ───────────────────────────────────────────────────────────────

function Calculator() {
  const [learners, setLearners] = useState(40);

  const calc = (fee: number, extra: number, n: number) => {
    const add = Math.max(0, n - 50);
    return (fee + add * extra) / 100;
  };

  const plans = [
    { name: 'LLN Only', fee: 7900, color: 'text-slate-800' },
    { name: 'Digital Only', fee: 7900, color: 'text-slate-800' },
    { name: 'LLN + Digital', fee: 12900, color: 'text-primary-700', highlight: true },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="bg-gradient-to-r from-primary-700 to-primary-800 px-8 py-7 text-white">
        <h2 className="text-2xl font-extrabold mb-1">Pricing Calculator</h2>
        <p className="text-primary-200 text-sm">Estimate your monthly cost instantly</p>
      </div>
      <div className="p-8">
        <label className="block text-sm font-semibold text-slate-700 mb-4">
          How many learner assessments per month?
        </label>
        <div className="flex items-center gap-4 mb-2">
          <input
            type="range" min={0} max={300} step={5} value={learners}
            onChange={(e) => setLearners(Number(e.target.value))}
            className="flex-1 accent-primary-600 cursor-pointer"
          />
          <input
            type="number" min={0} max={999} value={learners}
            onChange={(e) => setLearners(Math.max(0, Math.min(999, Number(e.target.value))))}
            className="w-20 border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-center text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-300"
          />
        </div>
        <div className="flex justify-between text-xs text-slate-400 mb-7">
          <span>0</span><span>50 (included)</span><span>150</span><span>300</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map((p) => {
            const monthly = calc(p.fee, 150, learners);
            const add = Math.max(0, learners - 50);
            return (
              <div key={p.name} className={`rounded-xl p-4 border-2 ${p.highlight ? 'border-primary-400 bg-primary-50' : 'border-slate-100 bg-slate-50'}`}>
                {p.highlight && <p className="text-xs font-bold text-primary-600 uppercase tracking-wide mb-1">Most Popular</p>}
                <p className="font-bold text-slate-900 text-sm mb-3">{p.name}</p>
                <p className={`text-2xl font-extrabold ${p.color}`}>${monthly.toFixed(2)}</p>
                <p className="text-xs text-slate-500 mb-3">per month</p>
                <div className="text-xs text-slate-500 space-y-1">
                  <div className="flex justify-between">
                    <span>Platform fee</span>
                    <span className="font-medium">${(p.fee / 100).toFixed(0)}</span>
                  </div>
                  {add > 0 && (
                    <div className="flex justify-between text-amber-600">
                      <span>{add}× extra learners</span>
                      <span className="font-medium">${(add * 1.5).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold text-slate-700">
                    <span>Annual est.</span>
                    <span>${(monthly * 12).toFixed(0)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-slate-400 mt-4 text-center">Prices in AUD, excluding GST. First 14 days free — no credit card required.</p>
      </div>
    </div>
  );
}

// ─── FAQ accordion ────────────────────────────────────────────────────────────

function FAQAccordion() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="divide-y divide-slate-100">
      {FAQS.map((item, i) => (
        <div key={i} className="py-4">
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-center justify-between gap-4 text-left"
          >
            <span className="text-base font-semibold text-slate-900">{item.q}</span>
            <ChevronDown className={`w-5 h-5 text-slate-400 flex-shrink-0 transition-transform duration-200 ${open === i ? 'rotate-180' : ''}`} />
          </button>
          {open === i && (
            <p className="mt-3 text-slate-500 text-sm leading-relaxed pr-9">{item.a}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── HomePage ─────────────────────────────────────────────────────────────────

export function HomePage({ currentHash }: { currentHash: string }) {
  return (
    <div className="min-h-screen bg-white">
      <TopNav currentHash={currentHash} />

      {/* ── Hero ── */}
      <section className="relative min-h-screen flex items-center overflow-hidden bg-gradient-to-br from-white via-primary-50/40 to-accent-50/20 pt-16">
        <div className="absolute top-1/4 -left-16 w-96 h-96 bg-primary-200/30 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 right-0 w-80 h-80 bg-accent-200/25 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 right-1/3 w-56 h-56 bg-primary-100/30 rounded-full blur-2xl pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20 grid grid-cols-1 lg:grid-cols-2 gap-14 items-center w-full">
          {/* Left */}
          <div className="animate-fade-in">
            <div className="inline-flex items-center gap-2 bg-white border border-primary-100 text-primary-700 text-sm font-semibold px-4 py-2 rounded-full mb-6 shadow-sm">
              <Zap className="w-4 h-4 text-primary-500" />
              Built specifically for Australian RTOs
            </div>

            <h1 className="text-5xl lg:text-6xl font-extrabold text-slate-900 leading-[1.1] mb-6">
              Modern LLN &amp; Digital
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-accent-500 mt-1">
                Capability Assessments
              </span>
            </h1>

            <p className="text-xl text-slate-500 leading-relaxed mb-8 max-w-xl">
              Assess learner capability in minutes with AI-powered reporting, ACSF mapping, support plans and audit-ready evidence.
            </p>

            <div className="flex flex-wrap gap-4 mb-10">
              <button
                onClick={() => nav('#/signup')}
                className="inline-flex items-center gap-2 px-7 py-4 bg-primary-600 text-white text-base font-bold rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200 active:scale-95"
              >
                Start Free Trial <ArrowRight className="w-5 h-5" />
              </button>
              <button
                onClick={() => nav('#/contact')}
                className="inline-flex items-center gap-2 px-7 py-4 bg-white border-2 border-slate-200 text-slate-700 text-base font-bold rounded-xl hover:bg-slate-50 transition-all"
              >
                <Calendar className="w-5 h-5" /> Book a Demo
              </button>
            </div>

            <div className="flex items-center gap-4 text-sm text-slate-500">
              <div className="flex -space-x-2">
                {['G', 'S', 'M', 'J', 'P'].map((l, i) => (
                  <div
                    key={i}
                    className="w-8 h-8 rounded-full border-2 border-white bg-gradient-to-br from-primary-400 to-accent-500 text-white flex items-center justify-center text-xs font-bold"
                  >
                    {l}
                  </div>
                ))}
              </div>
              <p>
                <span className="font-bold text-slate-900">50+ RTOs</span> across Australia
              </p>
              <div className="flex gap-0.5">
                {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />)}
              </div>
            </div>
          </div>

          {/* Right: desktop + mobile mockup */}
          <div className="hidden lg:block relative">
            <div className="absolute -inset-6 bg-gradient-to-br from-primary-100/50 to-accent-100/50 rounded-3xl blur-2xl" />
            <div className="relative animate-fade-in flex items-end gap-4" style={{ animationDelay: '0.2s' }}>
              {/* Desktop mockup — slightly shrunk to make room for phone */}
              <div className="flex-1 min-w-0">
                <DashboardMockup />
              </div>
              {/* Phone mockup — floats up slightly from bottom */}
              <div className="shrink-0 translate-y-4 drop-shadow-2xl">
                <MobilePreview />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust bar ── */}
      <section className="py-12 border-y border-slate-100 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <p className="text-center text-sm font-semibold text-slate-400 uppercase tracking-widest mb-6">
            Trusted by RTOs across Australia
          </p>
          <div className="flex flex-wrap justify-center items-center gap-8 text-slate-400">
            {[
              'Gold Coast Training', 'Skills First', 'Pacific Institute',
              'Metro RTO Group', 'Southern Training', 'National Skills Hub',
            ].map((name) => (
              <span key={name} className="text-sm font-bold tracking-tight">{name}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Portal Showcase ── */}
      <section className="py-24 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10">
            <p className="text-sm font-bold text-primary-600 uppercase tracking-widest mb-3">See it in action</p>
            <h2 className="text-4xl font-extrabold text-slate-900 mb-4">
              Every view, built for your workflow
            </h2>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto">
              From the dashboard to AI support plans — explore the full portal experience in seconds.
            </p>
          </div>
          <PortalSlideshow />
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-sm font-bold text-primary-600 uppercase tracking-widest mb-3">Everything you need</p>
            <h2 className="text-4xl font-extrabold text-slate-900 mb-4">
              One platform. Every compliance need.
            </h2>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto">
              Built specifically for RTOs that want modern, ASQA-compliant assessment without the complexity or cost of legacy platforms.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {FEATURES.map(({ icon: Icon, color, title, desc }) => (
              <div
                key={title}
                className="group bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-md hover:border-primary-200 transition-all"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color} mb-4`}>
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900 mb-1.5 text-sm">{title}</h3>
                <p className="text-slate-500 text-xs leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-sm font-bold text-primary-600 uppercase tracking-widest mb-3">Simple setup</p>
            <h2 className="text-4xl font-extrabold text-slate-900 mb-4">From sign up to first report in minutes</h2>
            <p className="text-lg text-slate-500 max-w-xl mx-auto">No installation. No IT tickets. No sales calls.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative">
            <div className="hidden md:block absolute top-8 left-[12.5%] right-[12.5%] h-0.5 bg-gradient-to-r from-primary-200 via-accent-200 to-primary-200" />
            {[
              { n: 1, title: 'Create your organisation', desc: 'Sign up and set up your RTO profile in minutes. No contract needed.', icon: Building2 },
              { n: 2, title: 'Invite your trainers', desc: 'Add your training team at no extra cost. Unlimited trainers included.', icon: Users },
              { n: 3, title: 'Assess your learners', desc: 'Send assessment invitations. Learners complete on any device in 20 minutes.', icon: ClipboardList },
              { n: 4, title: 'Download reports instantly', desc: 'AI reports, ACSF mapping, and support plans available immediately.', icon: Brain },
            ].map(({ n, title, desc, icon: Icon }) => (
              <div key={n} className="flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-2xl bg-white border-2 border-primary-200 shadow-sm flex items-center justify-center mb-5 relative z-10">
                  <Icon className="w-6 h-6 text-primary-600" />
                  <span className="absolute -top-2 -right-2 w-5 h-5 bg-primary-600 text-white text-xs font-bold rounded-full flex items-center justify-center">{n}</span>
                </div>
                <h3 className="font-bold text-slate-900 mb-2">{title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <button
              onClick={() => nav('#/signup')}
              className="inline-flex items-center gap-2 px-7 py-3.5 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 transition-all shadow-md"
            >
              Get Started Free <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </section>

      {/* ── Comparison ── */}
      <section className="py-24 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <p className="text-sm font-bold text-primary-600 uppercase tracking-widest mb-3">Why switch</p>
            <h2 className="text-4xl font-extrabold text-slate-900 mb-4">A better way to manage LLN compliance</h2>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="grid grid-cols-3 bg-slate-50 border-b border-slate-200">
              <div className="px-6 py-4 text-sm font-semibold text-slate-500">Feature</div>
              <div className="px-6 py-4 text-sm font-bold text-primary-700 text-center border-x border-slate-200 bg-primary-50">
                <div className="inline-flex items-center gap-2">
                  <GraduationCap className="w-4 h-4" /> LLND Automate Platform
                </div>
              </div>
              <div className="px-6 py-4 text-sm font-semibold text-slate-500 text-center">Traditional Platforms</div>
            </div>
            {COMPARISON.map((row, i) => (
              <div key={i} className={`grid grid-cols-3 border-b border-slate-100 last:border-0 ${i % 2 === 0 ? '' : 'bg-slate-50/50'}`}>
                <div className="px-6 py-3.5 text-sm text-slate-700 font-medium">{row.feature}</div>
                <div className="px-6 py-3.5 text-center border-x border-slate-100 bg-primary-50/30">
                  {row.us && <Check className="w-5 h-5 text-emerald-500 mx-auto" />}
                </div>
                <div className="px-6 py-3.5 text-center">
                  {typeof row.them === 'string' && row.them.startsWith('✗') ? (
                    <div className="flex items-center justify-center gap-1.5">
                      <X className="w-4 h-4 text-rose-400 flex-shrink-0" />
                      <span className="text-xs text-slate-400">{row.them.slice(2)}</span>
                    </div>
                  ) : typeof row.them === 'string' && row.them.startsWith('~') ? (
                    <span className="text-xs text-amber-600 font-medium">{row.them.slice(2)}</span>
                  ) : (
                    <Check className="w-5 h-5 text-emerald-500 mx-auto" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <p className="text-sm font-bold text-primary-600 uppercase tracking-widest mb-3">Pricing</p>
            <h2 className="text-4xl font-extrabold text-slate-900 mb-4">Only pay for the learners you actually assess</h2>
            <p className="text-lg text-slate-500 max-w-xl mx-auto">No seat licences. No wasted spend. First 14 days free.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {PLANS.map((plan) => (
              <div key={plan.id} className={`relative rounded-2xl border-2 bg-white p-6 flex flex-col gap-4 transition-all ${
                plan.highlight ? 'border-primary-500 shadow-xl shadow-primary-100' : 'border-slate-200 hover:border-primary-200'
              }`}>
                {plan.badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="bg-primary-600 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                      <Star className="w-3 h-3 fill-white" /> {plan.badge}
                    </span>
                  </div>
                )}
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">{plan.name}</h3>
                  <div className="flex items-end gap-1 mt-2">
                    <span className="text-3xl font-extrabold text-slate-900">${plan.price}</span>
                    <span className="text-slate-400 text-sm mb-1">/month</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{plan.extra}</p>
                </div>
                <ul className="space-y-2 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-slate-600">
                      <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => nav('#/signup')}
                  className={`w-full py-3 rounded-xl text-sm font-bold transition-all ${
                    plan.highlight ? 'bg-primary-600 text-white hover:bg-primary-700' : 'border-2 border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Start Free Trial
                </button>
              </div>
            ))}
          </div>
          <div className="text-center">
            <button onClick={() => nav('#/pricing')} className="text-primary-600 font-semibold text-sm hover:text-primary-800 flex items-center gap-1 mx-auto">
              View full pricing &amp; calculator <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* ── Calculator ── */}
      <section className="py-24 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <p className="text-sm font-bold text-primary-600 uppercase tracking-widest mb-3">Cost estimator</p>
            <h2 className="text-4xl font-extrabold text-slate-900 mb-4">See exactly what you'd pay</h2>
          </div>
          <Calculator />
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <p className="text-sm font-bold text-primary-600 uppercase tracking-widest mb-3">Customer stories</p>
            <h2 className="text-4xl font-extrabold text-slate-900 mb-4">RTOs love LLND Automate</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className={`bg-white rounded-2xl border-l-4 ${t.color} p-6 shadow-sm`}>
                <div className="flex gap-0.5 mb-4">
                  {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />)}
                </div>
                <p className="text-slate-600 text-sm leading-relaxed mb-5">"{t.quote}"</p>
                <div>
                  <p className="font-bold text-slate-900 text-sm">{t.name}</p>
                  <p className="text-slate-500 text-xs">{t.role}</p>
                  <p className="text-slate-400 text-xs font-medium mt-0.5">{t.org}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-24 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <p className="text-sm font-bold text-primary-600 uppercase tracking-widest mb-3">FAQ</p>
            <h2 className="text-4xl font-extrabold text-slate-900 mb-4">Common questions</h2>
          </div>
          <FAQAccordion />
          <div className="text-center mt-10">
            <p className="text-slate-500 text-sm">
              Still have questions?{' '}
              <button onClick={() => nav('#/contact')} className="text-primary-600 font-semibold hover:text-primary-800">
                Contact our team
              </button>
            </p>
          </div>
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className="py-20 bg-gradient-to-br from-primary-700 via-primary-800 to-primary-950 text-white overflow-hidden relative">
        <div className="absolute top-0 right-0 w-96 h-96 bg-accent-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center relative z-10">
          <h2 className="text-4xl lg:text-5xl font-extrabold mb-4 leading-tight">
            Start your free trial today
          </h2>
          <p className="text-primary-200 text-lg mb-8 max-w-xl mx-auto">
            14 days free. No credit card required. Full access to all features. Setup in minutes.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <button
              onClick={() => nav('#/signup')}
              className="inline-flex items-center gap-2 px-8 py-4 bg-white text-primary-700 font-extrabold rounded-xl hover:bg-primary-50 transition-all shadow-xl"
            >
              Start Free Trial <ArrowRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => nav('#/contact')}
              className="inline-flex items-center gap-2 px-8 py-4 border-2 border-white/30 text-white font-bold rounded-xl hover:bg-white/10 transition-all"
            >
              <Calendar className="w-5 h-5" /> Book a Demo
            </button>
          </div>
          <p className="text-primary-300 text-xs mt-6">All prices in AUD + GST. Cancel anytime.</p>
        </div>
      </section>

      <Footer />
    </div>
  );
}
