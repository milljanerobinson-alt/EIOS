# Engineering Review — Audit Module UI Consistency
**Reference:** ERC-002
**Date:** 2026-07-07
**Type:** Read-only investigation — no implementation changes made

---

## Executive Summary

The Audit module has a confirmed architectural split between the Audit Engine's authoritative output and independent UI-side computation. The Markdown report correctly states "No prior audit in this domain for comparison" because the edge function correctly sets `previous_audit_id = null`. The UI shows "Previous Audit / Previous Score / Regression" because a fallback scan in `ECCAuditDetail.tsx` ignores that null and independently queries the database for any prior audit of the same type — including Legacy AUD-001.

---

## Findings

### Finding 1 — CRITICAL: Unauthorized fallback scan in `HistoricalComparisonSection`

**File:** `src/pages/ecc/ECCAuditDetail.tsx`, lines 396–404

The `HistoricalComparisonSection` component has two-path logic:

- **Path A:** If `previous_audit_id` is set, use it (correct — follows the engine).
- **Path B:** If `previous_audit_id` is null, independently queries `ecc_audits` for any earlier record with the same `audit_type`, ordered by date descending, limit 1.

Path B is the root cause of the specific discrepancy reported. The engine deliberately wrote `previous_audit_id = null` (no production comparison exists). The UI overrides that decision and finds Legacy AUD-001 via date scan. This produces "Previous Audit", "Previous Score", and "Regression" from a Legacy audit that is explicitly excluded from governance.

```typescript
// Path B — should not exist
const { data } = await supabase
  .from('ecc_audits')
  .select('*')
  .eq('audit_type', audit.audit_type)
  .neq('id', audit.id)
  .lt('created_at', audit.created_at)
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle();
if (data) setPrev(data);
```

No workspace filter is applied. Legacy and Sandbox audits can be returned.

---

### Finding 2 — HIGH: `trendMap` independently re-derives score deltas for the Audit List

**File:** `src/pages/ecc/ECCAuditPage.tsx`, lines 446–464

A `useMemo` hook scans all production audits, groups them by `audit_type`, sorts by date, and manually computes `currentScore - previousScore` for every audit. This delta is passed to each `AuditCard` as `trendDelta`. The edge function already computes this and stores it; the list is re-deriving it from raw records.

---

### Finding 3 — HIGH: `healthTrend` independently computes platform-level health movement

**File:** `src/pages/ecc/ECCAuditPage.tsx`, lines 478–484

A second `useMemo` hook computes the overall platform health trend by taking the first and last production audits by date and subtracting their scores. This is a display-layer derived metric with no authoritative source in the database.

---

### Finding 4 — MEDIUM: `ExecutiveKPIsSection` fallback derivation

**File:** `src/pages/ecc/ECCAuditDetail.tsx`, lines 340–345

If `executive_kpis` JSONB is empty or null (which happens on older audits), the component derives KPI values by mapping raw audit scores into a KPI dict. This should be guaranteed by the edge function on every generation.

---

### Finding 5 — MEDIUM: Delta and regression labels computed in component

**File:** `src/pages/ecc/ECCAuditDetail.tsx`, lines 412–417 and 422–436

Once a `prev` audit is resolved (via either path), `delta`, `deltaCrit`, and the `Improvement / Regression / No Change` labels are all computed in the component. If Finding 1 is fixed (Path B removed), these become moot for the null-comparison case. However, even in the valid case where a true `previous_audit_id` exists, these values are being re-derived rather than read from stored columns such as `score_deltas`.

---

### Finding 6 — POSITIVE: Category score deltas correctly read from stored column

**File:** `src/pages/ecc/ECCAuditDetail.tsx`, lines 1763–1775

The per-category score delta display correctly reads from `audit.score_deltas` (a JSONB column populated by the engine). This is the correct pattern and demonstrates the architecture is understood in at least one part of the component.

---

## Root Cause Analysis

The module was built incrementally. Early iterations computed comparisons in the UI before the edge function stored those results as columns. As the engine matured and added `previous_audit_id`, `score_deltas`, `executive_kpis`, etc., some UI computations were updated to read those columns (e.g. `score_deltas`) while others were left in place as fallbacks. The fallback scan in `HistoricalComparisonSection` was never removed, creating a permanent bypass of the engine's governance decisions.

---

## Affected Components

| Component | File | Severity |
|---|---|---|
| `HistoricalComparisonSection` fallback scan | `ECCAuditDetail.tsx:396–404` | Critical |
| `trendMap` useMemo | `ECCAuditPage.tsx:446–464` | High |
| `healthTrend` useMemo | `ECCAuditPage.tsx:478–484` | High |
| Delta / regression labels | `ECCAuditDetail.tsx:412–436` | High |
| `ExecutiveKPIsSection` derivation fallback | `ECCAuditDetail.tsx:340–345` | Medium |

**Clean components (no duplication):** `ECCMissionControlPage.tsx`, `ECCDashboard.tsx`, `ECCDirectorDashboard.tsx`, `ECCProductAuditPage.tsx`, `ECCAuditCreateModal.tsx`.

---

## Risk Assessment

| Risk | Impact |
|---|---|
| Legacy audits appear as governance baselines | High — produces misleading regression/improvement data against archived records |
| Trend data inconsistent between list view and detail view | Medium — list reads re-derived delta, detail reads engine delta |
| Every new domain's first production audit shows phantom "Previous Audit" from Legacy until Path B is removed | High — all future baseline audits are affected |
| Sandbox audits promoted incorrectly could also appear as comparison targets via Path B | Medium |

---

## Architectural Assessment

The correct architecture is already partially implemented:
- The engine stores `previous_audit_id`, `score_deltas`, `executive_kpis` on every audit record.
- `ECCAuditDetail.tsx` already reads `score_deltas` correctly in the category section.
- The principle is sound — the UI should be a pure consumer of engine output.

The violations are localized. This is not a systemic architectural problem; it is two legacy fallback paths that were never cleaned up.

---

## Recommended Changes

**RC-1 (Critical — required before AUD-003 regeneration):**
Remove the Path B fallback in `HistoricalComparisonSection`. When `previous_audit_id` is null, render "No prior audit in this domain for comparison" directly. Do not query for alternatives.

**RC-2 (High):**
Remove `trendMap` useMemo in `ECCAuditPage.tsx`. Instead, read a stored `score_delta` or `previous_audit_score` column from the engine output for each audit card. If the column does not yet exist, add it to the edge function.

**RC-3 (High):**
Remove `healthTrend` useMemo in `ECCAuditPage.tsx`. If this metric is needed, compute it in a dedicated view or function that the engine can populate.

**RC-4 (Medium):**
Remove the `ExecutiveKPIsSection` derivation fallback. Ensure the edge function always writes `executive_kpis`. Older audits that lack it can show a "KPIs unavailable — audit predates engine v1.0" message.

**RC-5 (High — follows from RC-1):**
Once Path B is removed, verify the delta/regression label computation in lines 412–436 correctly handles `prev === null` (renders nothing, not a zero delta).

---

## Recommended Implementation Order

1. **RC-1** — Remove Path B fallback. Single block removal. Lowest risk, highest impact. Must be done before AUD-003 is regenerated as the permanent Reference Audit.
2. **RC-5** — Verify null-safe handling of delta labels. Defensive, should follow RC-1 immediately.
3. **RC-4** — Remove KPI derivation fallback and add guard message for legacy audits.
4. **RC-2 / RC-3** — Migrate trend/health calculations to stored engine columns. Requires a migration to add columns, edge function update, and UI update. Coordinate as a single phase.

---

## Additional Governance Improvements Identified

- **Workspace guard missing from Path B query:** Even if a fallback scan were intentional, it must apply `.eq('workspace', 'production')` to exclude Legacy and Sandbox records. No such guard exists today.
- **`trendMap` does apply `workspace === 'production'` filter** (correct isolation) but still re-derives rather than reads stored values.
- **AUD-002** (Engineering domain) is the only production audit in its domain and has no comparison — this should be confirmed to render correctly after RC-1 is implemented.
