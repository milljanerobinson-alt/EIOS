// ES-002 — Canonical Engineering Governance Bootstrap
//
// Enforces the constitutional requirement that a canonical Engineering Work
// Order must exist before implementation begins. Implementation engines may
// never silently create orphan engineering.
//
// This service provides the programmatic enforcement of ES-002's 5-step
// mandatory implementation bootstrap:
//   Step 1: Verify the referenced EWO exists
//   Step 2: If missing, create the canonical EWO
//   Step 3: Attach implementation prompt, engineering package, initial lifecycle
//   Step 4: Verify all governance artefacts are attached
//   Step 5: If governance cannot be established, STOP implementation

import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GovernanceBootstrapResult {
  governance_established: boolean;
  ewo_ref: string;
  ewo_id: string | null;
  ewo_created: boolean;
  package_attached: boolean;
  completion_report_created: boolean;
  lifecycle_initialised: boolean;
  verification: GovernanceVerification;
  error: string | null;
}

export interface GovernanceVerification {
  parent_relationships: 'pass' | 'fail' | 'n/a';
  prompt_attached: 'pass' | 'fail';
  package_attached: 'pass' | 'fail';
  completion_report: 'pass' | 'fail';
  lifecycle_initialised: 'pass' | 'fail';
  overall: 'PASS' | 'FAIL';
}

export interface BootstrapConfig {
  ewo_ref: string;
  title: string;
  parent_ref?: string | null;
  executive_summary?: string;
  bootstrap_reason?: string;
  implementation_prompt?: string;
  relevant_standards?: string[];
  constitutional_references?: string[];
}

// ─── Step 1: Verify EWO Exists ────────────────────────────────────────────────

export async function verifyEwoExists(ewoRef: string): Promise<{ exists: boolean; ewo_id: string | null }> {
  const { data, error } = await supabase
    .from('engineering_work_orders')
    .select('id')
    .eq('ewo_ref', ewoRef)
    .maybeSingle();

  if (error || !data) return { exists: false, ewo_id: null };
  return { exists: true, ewo_id: data.id as string };
}

// ─── Step 2: Create Canonical EWO ─────────────────────────────────────────────

export async function createCanonicalEwo(config: BootstrapConfig): Promise<{ ewo_id: string | null; error: string | null }> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('engineering_work_orders')
    .insert({
      ewo_ref: config.ewo_ref,
      title: config.title,
      status: 'draft',
      parent_ref: config.parent_ref ?? null,
      executive_summary: config.executive_summary ?? `Canonical EWO created per ES-002 governance bootstrap.`,
      implementation_status: 'not_started',
      engineering_package_status: 'not_started',
      verification_status: 'not_started',
      closure_eligible: false,
      po_testing_status: 'pending',
      bootstrap_origin: 'Implementation Bootstrap',
      bootstrap_date: now,
      bootstrap_reason: config.bootstrap_reason ?? 'Created per ES-002 Canonical Engineering Governance Bootstrap.',
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .maybeSingle();

  if (error) return { ewo_id: null, error: error.message };
  return { ewo_id: (data?.id as string) ?? null, error: null };
}

// ─── Step 3: Attach Governance Artefacts ──────────────────────────────────────

export async function attachGovernanceArtefacts(
  ewoId: string,
  ewoRef: string,
  config: BootstrapConfig
): Promise<{ package_attached: boolean; completion_report_created: boolean; lifecycle_initialised: boolean }> {
  const now = new Date().toISOString();

  // 3a. Create engineering package
  const { error: pkgError } = await supabase
    .from('ewo_engineering_packages')
    .insert({
      ewo_id: ewoId,
      package_hash: `${config.ewo_ref.toLowerCase()}-bootstrap-v1`,
      package_status: 'draft',
      summary: `Engineering package for ${config.ewo_ref}.`,
      implementation_notes: config.implementation_prompt ?? 'Implementation prompt attached per ES-002 Step 3.',
      relevant_standards: config.relevant_standards?.join(', ') ?? 'ES-002',
      constitutional_references: config.constitutional_references ?? ['ES-002'],
      created_at: now,
    });

  const packageAttached = !pkgError;

  // 3b. Create completion report placeholder
  const { error: reportError } = await supabase
    .from('ewo_completion_reports')
    .insert({
      ewo_ref: ewoRef,
      ewo_id: ewoId,
      title: config.title,
      executive_summary: 'Pending implementation. Governance bootstrap established per ES-002.',
      build_result: 'pending',
      created_at: now,
    });

  const completionReportCreated = !reportError;

  // 3c. Record lifecycle initialisation event
  const { error: eventError } = await supabase
    .from('ewo_lifecycle_events')
    .insert({
      ewo_id: ewoId,
      from_status: null,
      to_status: 'draft',
      actor: 'governance_bootstrap',
      notes: `Canonical EWO created per ES-002 Step 2. Initial lifecycle state: draft. Bootstrap origin: Implementation Bootstrap.`,
      metadata: {
        standard: 'ES-002',
        step: '2',
        bootstrap_origin: 'Implementation Bootstrap',
        action: 'canonical_ewo_created',
      },
      created_at: now,
    });

  const lifecycleInitialised = !eventError;

  return {
    package_attached: packageAttached,
    completion_report_created: completionReportCreated,
    lifecycle_initialised: lifecycleInitialised,
  };
}

// ─── Step 4: Verify Governance ─────────────────────────────────────────────────

export async function verifyGovernance(ewoRef: string, parentRef?: string | null): Promise<GovernanceVerification> {
  const { data: ewo, error } = await supabase
    .from('engineering_work_orders')
    .select('id, parent_ref')
    .eq('ewo_ref', ewoRef)
    .maybeSingle();

  if (error || !ewo) {
    return {
      parent_relationships: 'fail',
      prompt_attached: 'fail',
      package_attached: 'fail',
      completion_report: 'fail',
      lifecycle_initialised: 'fail',
      overall: 'FAIL',
    };
  }

  const ewoId = ewo.id as string;

  // Verify parent relationship
  let parentCheck: 'pass' | 'fail' | 'n/a' = 'n/a';
  if (parentRef) {
    const { data: parent } = await supabase
      .from('engineering_work_orders')
      .select('id')
      .eq('ewo_ref', parentRef)
      .maybeSingle();
    parentCheck = parent ? 'pass' : 'fail';
  }

  // Verify package attached
  const { count: packageCount } = await supabase
    .from('ewo_engineering_packages')
    .select('*', { count: 'exact', head: true })
    .eq('ewo_id', ewoId);
  const packageCheck = (packageCount ?? 0) > 0 ? 'pass' : 'fail';

  // Verify completion report
  const { count: reportCount } = await supabase
    .from('ewo_completion_reports')
    .select('*', { count: 'exact', head: true })
    .eq('ewo_ref', ewoRef);
  const reportCheck = (reportCount ?? 0) > 0 ? 'pass' : 'fail';

  // Verify lifecycle initialised
  const { count: eventCount } = await supabase
    .from('ewo_lifecycle_events')
    .select('*', { count: 'exact', head: true })
    .eq('ewo_id', ewoId);
  const lifecycleCheck = (eventCount ?? 0) > 0 ? 'pass' : 'fail';

  // Prompt is attached if the engineering package has implementation notes
  const { data: pkg } = await supabase
    .from('ewo_engineering_packages')
    .select('implementation_notes')
    .eq('ewo_id', ewoId)
    .maybeSingle();
  const promptCheck = pkg?.implementation_notes ? 'pass' : 'fail';

  const allPass =
    (parentCheck === 'n/a' || parentCheck === 'pass') &&
    promptCheck === 'pass' &&
    packageCheck === 'pass' &&
    reportCheck === 'pass' &&
    lifecycleCheck === 'pass';

  return {
    parent_relationships: parentCheck,
    prompt_attached: promptCheck,
    package_attached: packageCheck,
    completion_report: reportCheck,
    lifecycle_initialised: lifecycleCheck,
    overall: allPass ? 'PASS' : 'FAIL',
  };
}

// ─── Full Bootstrap (Steps 1-5) ────────────────────────────────────────────────

export async function bootstrapGovernance(config: BootstrapConfig): Promise<GovernanceBootstrapResult> {
  // Step 1: Verify EWO exists
  const { exists, ewo_id: existingId } = await verifyEwoExists(config.ewo_ref);

  let ewoId = existingId;
  let ewoCreated = false;
  let packageAttached = false;
  let completionReportCreated = false;
  let lifecycleInitialised = false;

  // Step 2: If missing, create the canonical EWO
  if (!exists) {
    const createResult = await createCanonicalEwo(config);
    if (createResult.error || !createResult.ewo_id) {
      // Step 5: If governance cannot be established, STOP
      return {
        governance_established: false,
        ewo_ref: config.ewo_ref,
        ewo_id: null,
        ewo_created: false,
        package_attached: false,
        completion_report_created: false,
        lifecycle_initialised: false,
        verification: {
          parent_relationships: 'fail',
          prompt_attached: 'fail',
          package_attached: 'fail',
          completion_report: 'fail',
          lifecycle_initialised: 'fail',
          overall: 'FAIL',
        },
        error: createResult.error ?? 'Failed to create canonical EWO',
      };
    }
    ewoId = createResult.ewo_id;
    ewoCreated = true;

    // Step 3: Attach governance artefacts
    const artefacts = await attachGovernanceArtefacts(ewoId, config.ewo_ref, config);
    packageAttached = artefacts.package_attached;
    completionReportCreated = artefacts.completion_report_created;
    lifecycleInitialised = artefacts.lifecycle_initialised;
  } else {
    // EWO already exists — verify it has governance artefacts
    const { count: pkgCount } = await supabase
      .from('ewo_engineering_packages')
      .select('*', { count: 'exact', head: true })
      .eq('ewo_id', ewoId!);
    packageAttached = (pkgCount ?? 0) > 0;

    const { count: reportCount } = await supabase
      .from('ewo_completion_reports')
      .select('*', { count: 'exact', head: true })
      .eq('ewo_ref', config.ewo_ref);
    completionReportCreated = (reportCount ?? 0) > 0;

    const { count: eventCount } = await supabase
      .from('ewo_lifecycle_events')
      .select('*', { count: 'exact', head: true })
      .eq('ewo_id', ewoId!);
    lifecycleInitialised = (eventCount ?? 0) > 0;
  }

  // Step 4: Verify governance
  const verification = await verifyGovernance(config.ewo_ref, config.parent_ref);

  // Step 5: Return result — if verification failed, governance is NOT established
  return {
    governance_established: verification.overall === 'PASS',
    ewo_ref: config.ewo_ref,
    ewo_id: ewoId,
    ewo_created: ewoCreated,
    package_attached: packageAttached,
    completion_report_created: completionReportCreated,
    lifecycle_initialised: lifecycleInitialised,
    verification,
    error: verification.overall === 'FAIL' ? 'Governance verification failed — see verification details' : null,
  };
}

// ─── Governance Gate (for implementation engines) ─────────────────────────────
//
// Implementation engines call this before modifying application code.
// If governance_established is false, the engine MUST NOT proceed.

export async function governanceGate(config: BootstrapConfig): Promise<{ may_proceed: boolean; result: GovernanceBootstrapResult }> {
  const result = await bootstrapGovernance(config);
  return {
    may_proceed: result.governance_established,
    result,
  };
}

// ─── Orphan Detection (Principle 5) ────────────────────────────────────────────
//
// Detects engineering work that exists without a canonical EWO.

export async function detectOrphanEngineering(): Promise<Array<{ type: string; identifier: string; ewo_ref: string | null }>> {
  const orphans: Array<{ type: string; identifier: string; ewo_ref: string | null }> = [];

  // Check for completion reports without EWOs
  const { data: orphanReports } = await supabase
    .from('ewo_completion_reports')
    .select('ewo_ref')
    .is('ewo_id', null);

  for (const report of orphanReports ?? []) {
    orphans.push({
      type: 'completion_report',
      identifier: report.ewo_ref as string,
      ewo_ref: (report.ewo_ref as string) ?? null,
    });
  }

  // Check for engineering packages without EWOs
  const { data: orphanPackages } = await supabase
    .from('ewo_engineering_packages')
    .select('id, package_hash')
    .is('ewo_id', null);

  for (const pkg of orphanPackages ?? []) {
    orphans.push({
      type: 'engineering_package',
      identifier: (pkg.package_hash as string) ?? (pkg.id as string),
      ewo_ref: null,
    });
  }

  return orphans;
}

// ─── Standard Retrieval ─────────────────────────────────────────────────────────

export async function getStandard(standardCode: string): Promise<{ version_introduced: string; title: string; body: string; status: string } | null> {
  const { data } = await supabase
    .from('ecc_engineering_standards')
    .select('version_introduced, title, body, status')
    .eq('version_introduced', standardCode)
    .maybeSingle();

  return data as { version_introduced: string; title: string; body: string; status: string } | null;
}
