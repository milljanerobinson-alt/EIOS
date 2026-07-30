import { supabase } from './supabase';
import { generateEngineeringPackage, assignProvider, type EngineeringPackage, type ImplementationProvider } from './engineeringPackageService';
import { createEntity, createRelationship } from './eigService';
import type { EngineeringPlan, EngineeringIntent } from './atdCognitiveEngine';
import { guardImplementationEntry } from './ensureEngineeringWorkOrder';
import { allocateCanonicalEwoRef } from './ewoAllocator';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BeginEngineeringResult {
  success: boolean;
  ewoId: string | null;
  ewoRef: string | null;
  packageVersion: number | null;
  provider: ImplementationProvider | null;
  error: string | null;
  duplicate: boolean;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_PROVIDER: ImplementationProvider = 'ATD';

// ─── Duplicate Detection ──────────────────────────────────────────────────────

/**
 * Find an existing EWO that was created from a given Engineering Plan.
 * Checks lifecycle events metadata for the plan_ref.
 */
export async function findEwoForPlan(planRef: string): Promise<{ ewoId: string; ewoRef: string } | null> {
  const { data } = await supabase
    .from('ewo_lifecycle_events')
    .select('ewo_id, metadata')
    .eq('actor', 'ATD')
    .order('created_at', { ascending: false })
    .limit(200);

  if (!data) return null;

  for (const evt of data) {
    const meta = evt.metadata as Record<string, unknown> | null;
    if (meta?.plan_ref === planRef && meta?.source === 'begin_engineering') {
      const { data: ewo } = await supabase
        .from('engineering_work_orders')
        .select('id, ewo_ref')
        .eq('id', evt.ewo_id)
        .maybeSingle();
      if (ewo) return { ewoId: ewo.id, ewoRef: ewo.ewo_ref };
    }
  }

  return null;
}

// ─── Service ───────────────────────────────────────────────────────────────────

/**
 * Constitutional workflow: Approved Engineering Plan → Engineering Work Order →
 * Engineering Package v1 → Implementation Provider Assigned → Ready
 *
 * This is the governed registration layer. It does NOT start implementation.
 * Duplicate protection: if an EWO already exists for this plan, returns it
 * without creating a new one.
 */
export async function beginEngineering(
  plan: EngineeringPlan,
  intent: EngineeringIntent
): Promise<BeginEngineeringResult> {
  try {
    // ── 0. Duplicate protection ───────────────────────────────────────────────
    if (plan.status === 'implementing') {
      const existing = await findEwoForPlan(plan.plan_ref);
      if (existing) {
        return {
          success: true,
          ewoId: existing.ewoId,
          ewoRef: existing.ewoRef,
          packageVersion: 1,
          provider: DEFAULT_PROVIDER,
          error: null,
          duplicate: true,
        };
      }
    }

    // ── 1. Allocate next canonical EWO ref (atomic, concurrency-safe) ─────────
    const allocation = await allocateCanonicalEwoRef();
    if (!allocation.success || !allocation.ewoRef) {
      return { success: false, ewoId: null, ewoRef: null, packageVersion: null, provider: null, error: `Engineering implementation cannot begin because the EWO reference could not be allocated. ${allocation.error}`, duplicate: false };
    }
    const nextRef = allocation.ewoRef;

    // ── 1b. Guard: ensure canonical EWO registration before implementation ────
    const ewoTitle = intent.title || (plan.executive_summary
      ? plan.executive_summary.split('\n')[0].slice(0, 120)
      : 'Engineering Work Order');

    const guard = await guardImplementationEntry(nextRef, 'beginEngineering', {
      title: ewoTitle,
      executiveSummary: plan.executive_summary ?? intent.raw_input,
    });
    if (!guard.success) {
      return { success: false, ewoId: null, ewoRef: null, packageVersion: null, provider: null, error: `Engineering implementation cannot begin because the canonical Engineering Work Order could not be registered. ${guard.error}`, duplicate: false };
    }

    // ── 2. Create the Engineering Work Order from the approved plan ────────────
    const { data: ewo, error: ewoErr } = await supabase
      .from('engineering_work_orders')
      .insert({
        ewo_ref: nextRef,
        title: ewoTitle,
        executive_summary: plan.executive_summary ?? intent.raw_input,
        business_objective: intent.business_objective,
        engineering_objective: plan.engineering_strategy ?? intent.engineering_objective,
        priority: 'medium',
        risk_level: 'medium',
        scope: intent.scope ?? plan.recommended_approach,
        out_of_scope: intent.constraints,
        status: 'ready',
        engineering_notes: plan.recommended_approach,
        validation_requirements: plan.recommended_approach,
        related_standards: [],
        related_decisions: [],
        related_features: [],
        related_releases: [],
        dependencies: plan.required_ewos ?? [],
        implementation_provider: DEFAULT_PROVIDER,
        implementation_status: 'Assigned',
        engineering_package_status: 'Generated',
        implementation_started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (ewoErr || !ewo) {
      return { success: false, ewoId: null, ewoRef: null, packageVersion: null, provider: null, error: `Failed to create work order: ${ewoErr?.message ?? 'unknown'}` };
    }

    // ── 3. Audit: Engineering Work Order Created ──────────────────────────────
    await supabase.from('ewo_lifecycle_events').insert({
      ewo_id: ewo.id,
      from_status: null,
      to_status: 'ready',
      actor: 'ATD',
      notes: `Engineering Work Order automatically created from approved Engineering Plan ${plan.plan_ref}.`,
      metadata: { plan_ref: plan.plan_ref, intent_ref: intent.intent_ref, source: 'begin_engineering' },
    });

    // ── 4. Generate Engineering Package v1 ────────────────────────────────────
    const pkg: EngineeringPackage = await generateEngineeringPackage(ewo.id);

    await supabase.from('ewo_lifecycle_events').insert({
      ewo_id: ewo.id,
      from_status: 'ready',
      to_status: 'ready',
      actor: 'ATD',
      notes: `Engineering Package v${pkg.version} generated automatically.`,
      metadata: { package_id: pkg.id, package_version: pkg.version, source: 'begin_engineering' },
    });

    // ── 5. Assign implementation provider ──────────────────────────────────────
    await assignProvider(ewo.id, DEFAULT_PROVIDER);

    await supabase.from('ewo_lifecycle_events').insert({
      ewo_id: ewo.id,
      from_status: 'ready',
      to_status: 'ready',
      actor: 'ATD',
      notes: `Implementation provider "${DEFAULT_PROVIDER}" assigned automatically.`,
      metadata: { provider: DEFAULT_PROVIDER, source: 'begin_engineering' },
    });

    // ── 6. Audit: Ready for Implementation ─────────────────────────────────────
    await supabase.from('ewo_lifecycle_events').insert({
      ewo_id: ewo.id,
      from_status: 'ready',
      to_status: 'ready',
      actor: 'ATD',
      notes: 'Work Order is Ready for Implementation.',
      metadata: { source: 'begin_engineering' },
    });

    // ── 7. Create engineering relationships (EIG) ──────────────────────────────
    await createEngineeringRelationships(plan, intent, ewo.id, nextRef);

    // ── 8. Update plan status to 'implementing' ─────────────────────────────────
    await supabase
      .from('atd_engineering_plans')
      .update({ status: 'implementing', updated_at: new Date().toISOString() })
      .eq('id', plan.id);

    return {
      success: true,
      ewoId: ewo.id,
      ewoRef: nextRef,
      packageVersion: pkg.version,
      provider: DEFAULT_PROVIDER,
      error: null,
      duplicate: false,
    };
  } catch (e) {
    return { success: false, ewoId: null, ewoRef: null, packageVersion: null, provider: null, error: e instanceof Error ? e.message : 'Unknown error', duplicate: false };
  }
}

// ─── Relationship Creation ────────────────────────────────────────────────────

async function createEngineeringRelationships(
  plan: EngineeringPlan,
  intent: EngineeringIntent,
  ewoId: string,
  ewoRef: string
): Promise<void> {
  try {
    // Create or find EIG entity for the EWO
    const ewoEntity = await createEntity({
      entity_type: 'ewo',
      name: ewoRef,
      entity_ref: ewoRef,
      description: `Engineering Work Order created from plan ${plan.plan_ref}`,
      status: 'active',
      tags: ['auto-created', 'begin-engineering'],
    });

    // Find the plan entity
    const { data: planEntity } = await supabase
      .from('eig_entities')
      .select('id')
      .eq('entity_ref', plan.plan_ref)
      .maybeSingle();

    if (planEntity && ewoEntity) {
      await createRelationship({
        from_entity_id: planEntity.id,
        to_entity_id: ewoEntity.id,
        relationship_type: 'produces',
        description: `Engineering Plan ${plan.plan_ref} produced Engineering Work Order ${ewoRef}`,
        is_automatic: true,
      });
    }

    // Find the intent entity
    const { data: intentEntity } = await supabase
      .from('eig_entities')
      .select('id')
      .eq('entity_ref', intent.intent_ref)
      .maybeSingle();

    if (intentEntity && ewoEntity) {
      await createRelationship({
        from_entity_id: intentEntity.id,
        to_entity_id: ewoEntity.id,
        relationship_type: 'implements',
        description: `Engineering Intent ${intent.intent_ref} implemented by ${ewoRef}`,
        is_automatic: true,
      });
    }

    // Link EWO entity to the actual record
    if (ewoEntity) {
      await supabase
        .from('eig_entities')
        .update({ linked_record_id: ewoId, linked_record_type: 'engineering_work_orders' })
        .eq('id', ewoEntity.id);
    }
  } catch {
    // Relationships are best-effort — don't fail the whole workflow
  }
}
