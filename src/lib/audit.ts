import { supabase, createQuizClient } from './supabase';

interface AuditPayload {
  event_type: string;
  category: string;
  description: string;
  severity?: string;
  source: string;
  actor_id?: string | null;
  invitation_id?: string;
  qualification_id?: string | null;
  assessment_id?: string;
  event_data?: Record<string, unknown>;
  previous_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
}

function actorFromSource(source: string): string {
  if (source === 'admin') return 'admin';
  if (source === 'trainer') return 'trainer';
  if (source === 'student') return 'candidate';
  return 'system';
}

export async function logAudit(payload: AuditPayload): Promise<void> {
  try {
    await supabase.from('audit_trail').insert({
      event_type: payload.event_type,
      invitation_id: payload.invitation_id ?? null,
      qualification_id: payload.qualification_id ?? null,
      assessment_id: payload.assessment_id ?? null,
      category: payload.category,
      severity: payload.severity ?? 'info',
      description: payload.description,
      source: payload.source,
      actor: actorFromSource(payload.source),
      actor_id: payload.actor_id ?? null,
      event_data: payload.event_data ?? {},
      previous_values: payload.previous_values ?? null,
      new_values: payload.new_values ?? null,
    });
  } catch (_) {}
}

export async function logAuditAnon(payload: AuditPayload, token: string): Promise<void> {
  try {
    const client = createQuizClient(token);
    await client.from('audit_trail').insert({
      event_type: payload.event_type,
      invitation_id: payload.invitation_id ?? null,
      assessment_id: payload.assessment_id ?? null,
      category: payload.category,
      severity: 'info',
      description: payload.description,
      source: payload.source,
      actor: actorFromSource(payload.source),
      event_data: payload.event_data ?? {},
      new_values: payload.new_values ?? null,
    });
  } catch (_) {}
}

export async function enqueueAxcelerateWriteback(
  invitationId: string,
  eventType: string,
  extraData?: Record<string, unknown>,
  assessmentId?: string,
): Promise<void> {
  const key = assessmentId
    ? `${invitationId}:${assessmentId}:${eventType}`
    : `${invitationId}:${eventType}`;
  try {
    await supabase.from('axcelerate_writeback_queue').upsert(
      {
        invitation_id: invitationId,
        event_type: eventType,
        status: 'pending',
        attempts: 0,
        idempotency_key: key,
        extra_data: extraData ?? {},
        ...(assessmentId ? { assessment_id: assessmentId } : {}),
      },
      { onConflict: 'idempotency_key', ignoreDuplicates: true },
    );
  } catch (_) {}
}
