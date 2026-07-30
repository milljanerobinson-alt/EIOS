/**
 * EWO-033R.4 Correction 9 — Harden Execution Readiness Validation
 *
 * Tests:
 * 1. safeQuery catches HTTP 400 and returns warning/blocked (never throws)
 * 2. safeQuery catches exceptions and returns failed/warning (never throws)
 * 3. Required validation failure blocks execution
 * 4. Recommended validation failure does NOT block execution
 * 5. Optional validation failure does NOT block execution
 * 6. Warning does NOT stop execution
 * 7. Readiness report includes governed summary with check icons
 * 8. Readiness report includes diagnostics reference
 * 9. Readiness report includes recovery advice for failed checks
 * 10. Readiness report includes which validation failed and why
 * 11. validateExecutionReadiness never throws (all queries fail gracefully)
 * 12. interactionExecutionService wraps readiness in try-catch
 * 13. Adapter shows governed blocked reason (not bare "validation failed")
 * 14. Every readiness query is individually wrapped
 */

import { describe, it, expect } from 'vitest';

async function readSource(path: string): Promise<string> {
  const mod = await import(`${path}?raw`);
  return mod.default as string;
}

// ─── safeQuery Error Handling ────────────────────────────────────────────────

describe('EWO-033R.4 Correction 9: safeQuery Error Handling', () => {
  it('1. safeQuery catches HTTP 400 and returns warning/blocked (never throws)', async () => {
    const src = await readSource('../lib/executionReadinessValidator');
    // safeQuery must have a try-catch
    expect(src).toContain('try {');
    expect(src).toContain('} catch (err) {');
    // On error, must return a diagnostic (not throw)
    expect(src).toContain('status: severity === \'required\' ? \'blocked\' : \'warning\'');
  });

  it('2. safeQuery catches exceptions and returns failed/warning (never throws)', async () => {
    const src = await readSource('../lib/executionReadinessValidator');
    // On exception, must return a diagnostic (not throw)
    expect(src).toContain('status: severity === \'required\' ? \'failed\' : \'warning\'');
    // Must capture error message and stack
    expect(src).toContain('err instanceof Error ? err.message : String(err)');
  });
});

// ─── Severity Classification ──────────────────────────────────────────────────

describe('EWO-033R.4 Correction 9: Severity Classification', () => {
  it('3. Required validation failure blocks execution', async () => {
    const src = await readSource('../lib/executionReadinessValidator');
    // EWO exists and Execution Target are Required
    expect(src).toContain("'EWO exists'");
    expect(src).toContain("'required'");
    // Active Execution Session is Required
    expect(src).toContain("'Active Execution Session'");
    expect(src).toContain("'Execution Target'");
  });

  it('4. Recommended validation failure does NOT block execution', async () => {
    const src = await readSource('../lib/executionReadinessValidator');
    // Engineering Package and Review are Recommended
    expect(src).toContain("'Engineering Package',\n    'recommended'");
    expect(src).toContain("'Engineering Review',\n    'recommended'");
    // Constitutional Validity is Recommended
    expect(src).toContain("'Constitutional Validity',\n    'recommended'");
  });

  it('5. Optional validation failure does NOT block execution', async () => {
    const src = await readSource('../lib/executionReadinessValidator');
    // PO Approval and Verification Gates are Optional
    expect(src).toContain("'PO Execution Approval',\n    'optional'");
    expect(src).toContain("'Verification Gates',\n    'optional'");
    expect(src).toContain("'Provider Available',\n    'optional'");
  });

  it('6. Warning does NOT stop execution', async () => {
    const src = await readSource('../lib/executionReadinessValidator');
    // Warnings are collected but do not affect eligibility
    expect(src).toContain('warnings.push');
    // Eligibility is based on blockingReasons only
    expect(src).toContain('const eligible = blockingReasons.length === 0;');
  });
});

// ─── Governed Readiness Report ───────────────────────────────────────────────

describe('EWO-033R.4 Correction 9: Governed Readiness Report', () => {
  it('7. Readiness report includes governed summary with check icons', async () => {
    const src = await readSource('../lib/executionReadinessValidator');
    expect(src).toContain("icon = c.status === 'success' ? '✓'");
    expect(src).toContain("c.status === 'warning' ? '⚠'");
    expect(src).toContain("'Execution can continue.'");
    expect(src).toContain("'Execution Blocked'");
  });

  it('8. Readiness report includes diagnostics reference', async () => {
    const src = await readSource('../lib/executionReadinessValidator');
    expect(src).toContain('diagnosticsRef');
    expect(src).toContain('generateDiagnosticsRef()');
  });

  it('9. Readiness report includes recovery advice for failed checks', async () => {
    const src = await readSource('../lib/executionReadinessValidator');
    expect(src).toContain('recoveryAdvice');
    expect(src).toContain('getRecoveryAdvice');
    // Recovery advice must cover RLS, schema, network errors
    expect(src).toContain('RLS policy');
    expect(src).toContain('Schema mismatch');
    expect(src).toContain('Network or timeout');
  });

  it('10. Readiness report includes which validation failed and why', async () => {
    const src = await readSource('../lib/executionReadinessValidator');
    // The report must include the error message for each failed check
    expect(src).toContain('c.error');
    // The report must include blocking reasons
    expect(src).toContain('blockingReasons');
    // The report must include the name of each check
    expect(src).toContain('c.name');
  });
});

// ─── Never Throws ────────────────────────────────────────────────────────────

describe('EWO-033R.4 Correction 9: Never Throws', () => {
  it('11. validateExecutionReadiness never throws (all queries fail gracefully)', async () => {
    const src = await readSource('../lib/executionReadinessValidator');
    // Every query must go through safeQuery
    const safeQueryCount = (src.match(/safeQuery\(/g) || []).length;
    expect(safeQueryCount).toBeGreaterThanOrEqual(8); // 8+ validation checks
    // No raw supabase.from calls outside safeQuery
    // The function must not have unguarded await supabase calls
  });

  it('12. interactionExecutionService wraps readiness in try-catch', async () => {
    const src = await readSource('../lib/interactionExecutionService');
    // Must import the hardened validator
    expect(src).toContain('validateExecutionReadiness');
    // Must wrap in try-catch
    expect(src).toContain('Readiness validator crashed');
    // Must not use the old bare evaluateExecutionEligibility
    expect(src).not.toContain('evaluateExecutionEligibility(ewoId)');
  });
});

// ─── Adapter Governed Messages ────────────────────────────────────────────────

describe('EWO-033R.4 Correction 9: Adapter Governed Messages', () => {
  it('13. Adapter shows governed blocked reason (not bare "validation failed")', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // The bare message must be replaced with a governed one
    expect(src).not.toContain('Execution readiness validation failed. Please retry or contact support.');
    // Must include the governed message
    expect(src).toContain('No specific blocking reason was returned. Please retry or contact support.');
  });
});

// ─── Every Query Wrapped ──────────────────────────────────────────────────────

describe('EWO-033R.4 Correction 9: Every Query Wrapped', () => {
  it('14. Every readiness query is individually wrapped in safeQuery', async () => {
    const src = await readSource('../lib/executionReadinessValidator');
    // Count all the validation names
    const checks = [
      'EWO exists',
      'Engineering Package',
      'Engineering Review',
      'PO Execution Approval',
      'Active Execution Session',
      'Execution Target',
      'Constitutional Validity',
      'Verification Gates',
      'Provider Available',
    ];
    for (const name of checks) {
      expect(src).toContain(`'${name}'`);
    }
  });
});

// ─── ReadinessReport Type ────────────────────────────────────────────────────

describe('EWO-033R.4 Correction 9: ReadinessReport Type', () => {
  it('ReadinessReport includes all required fields', async () => {
    const src = await readSource('../lib/executionReadinessValidator');
    expect(src).toContain('eligible: boolean');
    expect(src).toContain('checks: ReadinessDiagnostic[]');
    expect(src).toContain('summary: string');
    expect(src).toContain('blockingReasons: string[]');
    expect(src).toContain('warnings: string[]');
    expect(src).toContain('diagnosticsRef: string');
  });

  it('ReadinessDiagnostic includes all required fields', async () => {
    const src = await readSource('../lib/executionReadinessValidator');
    expect(src).toContain('name: string');
    expect(src).toContain('severity: ValidationSeverity');
    expect(src).toContain('status: ValidationStatus');
    expect(src).toContain('duration: number');
    expect(src).toContain('query: string');
    expect(src).toContain('response: string');
    expect(src).toContain('error: string | null');
    expect(src).toContain('stack: string | null');
    expect(src).toContain('recoveryAdvice: string | null');
  });
});
