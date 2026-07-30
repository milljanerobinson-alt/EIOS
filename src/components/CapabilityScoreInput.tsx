/**
 * CapabilityScoreInput — reusable precise numeric scoring component.
 *
 * Supports decimal values (0.00–10.00, step 0.05), keyboard entry,
 * tab navigation, and arrow-key increment/decrement.
 *
 * Suitable for: Benchmark Reviews, Engineering Reviews, Investment Reviews,
 * Architecture Reviews, Audit Reviews, Release Reviews, Test Reviews,
 * and Maturity Assessments.
 */

import { useState, useRef, useCallback } from 'react';
import { Zap } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScoreDimension {
  key: string;
  label: string;
  description?: string;
  weight?: number;
}

export type ScoreMap = Record<string, number>;

// ─── Colour helpers ───────────────────────────────────────────────────────────

function trackColor(v: number) {
  if (v >= 8) return 'bg-emerald-500';
  if (v >= 6) return 'bg-blue-500';
  if (v >= 4) return 'bg-amber-500';
  return 'bg-red-400';
}

function valueColor(v: number) {
  if (v >= 8) return 'text-emerald-700';
  if (v >= 6) return 'text-blue-700';
  if (v >= 4) return 'text-amber-700';
  return 'text-red-600';
}

function valueBg(v: number) {
  if (v >= 8) return 'bg-emerald-50 border-emerald-200 ring-emerald-300';
  if (v >= 6) return 'bg-blue-50 border-blue-200 ring-blue-300';
  if (v >= 4) return 'bg-amber-50 border-amber-200 ring-amber-300';
  return 'bg-red-50 border-red-200 ring-red-300';
}

// ─── EIS / weighted mean ──────────────────────────────────────────────────────

export function computeWeightedScore(scores: ScoreMap, dimensions: ScoreDimension[]): number {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const dim of dimensions) {
    const w = dim.weight ?? 1;
    weightedSum += (scores[dim.key] ?? 0) * w;
    totalWeight += w;
  }
  if (totalWeight === 0) return 0;
  return Math.round((weightedSum / totalWeight) * 10 * 10) / 10;
}

// ─── Single score field ───────────────────────────────────────────────────────

interface ScoreFieldProps {
  label: string;
  description?: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}

function ScoreField({ label, description, value, onChange, disabled }: ScoreFieldProps) {
  const [rawInput, setRawInput] = useState('');
  const [editing, setEditing] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const clamp = (n: number) => Math.min(10, Math.max(0, Math.round(n * 100) / 100));
  const fmt = (n: number) => n % 1 === 0 ? n.toFixed(1) : String(n);

  const commit = useCallback((raw: string) => {
    const parsed = parseFloat(raw);
    if (isNaN(parsed) || parsed < 0 || parsed > 10) {
      setInvalid(true);
      setTimeout(() => setInvalid(false), 1200);
      setEditing(false);
      return;
    }
    onChange(clamp(parsed));
    setInvalid(false);
    setEditing(false);
  }, [onChange]);

  const handleWheel = (e: React.WheelEvent<HTMLInputElement>) => {
    if (!editing && !disabled) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.5 : -0.5;
      onChange(clamp(value + delta));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); onChange(clamp(value + 0.5)); }
    if (e.key === 'ArrowDown') { e.preventDefault(); onChange(clamp(value - 0.5)); }
    if (e.key === 'Enter') { commit(editing ? rawInput : fmt(value)); inputRef.current?.blur(); }
    if (e.key === 'Escape') { setEditing(false); inputRef.current?.blur(); }
  };

  const display = editing ? rawInput : fmt(value);
  const pct = (value / 10) * 100;

  return (
    <div className={`grid grid-cols-[1fr_auto] gap-4 items-center py-2.5 px-3 rounded-xl transition-colors ${invalid ? 'bg-red-50' : 'hover:bg-slate-50'}`}>
      {/* Left: label + track */}
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-700 leading-tight">{label}</p>
        {description && <p className="text-xs text-slate-400 mt-0.5 truncate">{description}</p>}
        <div className="mt-2 h-1 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-200 ${trackColor(value)}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Right: numeric input */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <div className={`relative flex items-center ${invalid ? 'ring-2 ring-red-400 rounded-lg' : ''}`}>
          <input
            ref={inputRef}
            type="number"
            min={0}
            max={10}
            step={0.5}
            disabled={disabled}
            value={display}
            onFocus={() => { setEditing(true); setRawInput(fmt(value)); }}
            onBlur={e => { commit(e.target.value); }}
            onChange={e => setRawInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onWheel={handleWheel}
            aria-label={`${label} score`}
            className={`w-16 text-center text-sm font-black rounded-lg border py-1 focus:outline-none focus:ring-2 transition-all
              ${valueBg(value)} ${valueColor(value)} disabled:cursor-default disabled:opacity-75
              [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
          />
        </div>
        <span className="text-xs text-slate-400 font-medium w-7">/ 10</span>
      </div>
    </div>
  );
}

// ─── Score summary bar ────────────────────────────────────────────────────────

export function EISDisplay({ score, label = 'EIS', size = 'md' }: { score: number; label?: string; size?: 'sm' | 'md' | 'lg' }) {
  const color = score >= 80 ? 'text-emerald-700' : score >= 60 ? 'text-blue-700' : score >= 40 ? 'text-amber-700' : 'text-red-600';
  const bg    = score >= 80 ? 'bg-emerald-50 ring-emerald-200'    : score >= 60 ? 'bg-blue-50 ring-blue-200'    : score >= 40 ? 'bg-amber-50 ring-amber-200'    : 'bg-red-50 ring-red-200';
  const tier  = score >= 80 ? 'Exceptional' : score >= 65 ? 'Strong' : score >= 50 ? 'Adequate' : score >= 35 ? 'Developing' : 'Insufficient';

  if (size === 'sm') {
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${bg} ${color} ring-1`}>
        <Zap className="w-3 h-3" />{label} {score.toFixed(1)}
      </span>
    );
  }

  if (size === 'lg') {
    return (
      <div className={`inline-flex flex-col items-center justify-center w-20 h-20 rounded-full ring-4 ${bg} ${color}`}>
        <span className="text-xl font-black leading-none">{score.toFixed(1)}</span>
        <span className="text-xs font-semibold opacity-70 mt-0.5">{tier}</span>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl ring-1 ${bg}`}>
      <Zap className={`w-4 h-4 ${color}`} />
      <span className={`text-lg font-black ${color}`}>{score.toFixed(1)}</span>
      <span className={`text-xs ${color} opacity-60`}>/ 100</span>
      <span className={`text-xs font-semibold ${color} border-l border-current/20 pl-2`}>{tier}</span>
    </div>
  );
}

// ─── Full scoring panel ───────────────────────────────────────────────────────

interface CapabilityScoreInputProps {
  /** All dimensions with optional weights */
  dimensions: ScoreDimension[];
  scores: ScoreMap;
  onChange?: (scores: ScoreMap) => void;
  disabled?: boolean;
  /** Label shown in the EIS summary row. Defaults to "Engineering Intelligence Score (EIS)" */
  summaryLabel?: string;
  /** If false, hides the EIS summary row */
  showSummary?: boolean;
}

export function CapabilityScoreInput({
  dimensions,
  scores,
  onChange,
  disabled = false,
  summaryLabel = 'Engineering Intelligence Score (EIS)',
  showSummary = true,
}: CapabilityScoreInputProps) {
  const eis = computeWeightedScore(scores, dimensions);
  const hasAnyScore = dimensions.some(d => (scores[d.key] ?? 0) > 0);

  const handleChange = (key: string, v: number) => {
    if (onChange) onChange({ ...scores, [key]: v });
  };

  return (
    <div className="space-y-1">
      {dimensions.map(dim => (
        <ScoreField
          key={dim.key}
          label={dim.label}
          description={dim.description}
          value={scores[dim.key] ?? 0}
          onChange={v => handleChange(dim.key, v)}
          disabled={disabled}
        />
      ))}
      {showSummary && (
        <div className="flex items-center justify-between pt-3 mt-2 border-t border-slate-100 px-3">
          <span className="text-xs font-semibold text-slate-500">{summaryLabel}</span>
          <EISDisplay score={hasAnyScore ? eis : 0} />
        </div>
      )}
    </div>
  );
}
