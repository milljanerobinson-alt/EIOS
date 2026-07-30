/*
# EWO-023R.1R.2: Progressive Execution Visibility Standard (ES-004)
#
# Seeds Engineering Standard ES-004 governing how all long-running
# engineering operations expose execution progress.
*/

INSERT INTO ecc_engineering_standards (version_introduced, category, title, body, status, sort_order, tags)
VALUES (
  'ES-004',
  'Engineering Governance',
  'ES-004: Progressive Execution Visibility',
  $BODY$
# Progressive Execution Visibility Standard

## Purpose

All governed operations within EIOS shall expose authoritative execution
progress in a transparent, sequential and consistent manner.

Long-running operations must never present an indeterminate loading state
when meaningful execution information exists.

## Scope

This standard applies to all governed engineering operations including but
not limited to:
- Historical Bootstrap
- Historical Recovery
- Knowledge Extraction
- ATD Connect
- Engineering Execution
- Guardian Reviews
- Platform Migrations
- Engineering Rebuilds
- AI Analysis Pipelines

## Principles

1. **Canonical execution phases** — All operations define their phases upfront
2. **Sequential phase ordering** — Phases execute in declared order
3. **Visible future phases** — Pending phases remain visible before execution
4. **Completed phase history** — Finished phases retain their results
5. **Current phase highlighting** — Active phase is visually distinct
6. **Pending phase visibility** — Not-yet-started phases are clearly pending
7. **Governed failure visibility** — Failures show phase, reason, diagnostics
8. **Live execution statistics** — Runtime, heartbeat, counts update live
9. **Estimated remaining time** — Based on historical data, never invented
10. **Execution diagnostics** — Structured diagnostic data available

## Phase Display Requirements

All phases must be displayed in canonical order with status indicators:
- Completed: checkmark, green
- Running: spinner, blue, highlighted
- Pending: clock icon, grey
- Failed: X icon, red, with failure reason

## Live Summary Requirements

Summary cards must synchronise with authoritative execution state.
Display live values for: Runtime, Completion %, Discovered, Imported,
Skipped, Lineage Links, Memory Entries, Health Issues.

Header and summary cards must never disagree.

## Estimated Remaining Time

Calculate from governed data sources:
- Historical successful run durations
- Current execution rate
- Records remaining
- Completed phase durations

Display confidence: High, Medium, Low, Calculating, Unavailable.
Never invent estimates.

## Heartbeat Requirements

Heartbeat must update continuously during long-running phases.
Do not wait until phase completion.
Long-running phases must provide evidence that work is continuing.

## Stall Detection

If heartbeat exceeds governed thresholds (default: 60 seconds):
- Display "Execution appears stalled"
- Show last heartbeat, current phase, elapsed phase duration
- Provide recovery guidance
- Do not immediately classify as failed

## Phase Performance Metrics

Capture per-phase execution metrics:
- Average phase duration
- Longest phase
- Slowest/fastest operation
- Historical averages

These metrics inform future optimisation.

## Reusable Component

Execution visibility must be provided by a reusable platform component
(ProgressiveExecutionTracker) that future operations inherit.
Operations define their phases; the component renders the standard UI.

## Reference Implementation

Historical Bootstrap (EWO-023R.1R.2) is the reference implementation
of this standard.
$BODY$,
  'active',
  100,
  ARRAY['execution', 'visibility', 'governance', 'progressive', 'standard']
)
ON CONFLICT DO NOTHING;
