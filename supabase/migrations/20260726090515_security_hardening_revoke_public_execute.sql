/*
# Security Hardening: Revoke PUBLIC EXECUTE on Internal Functions

PostgreSQL grants EXECUTE on functions to PUBLIC by default. The previous migration
revoked EXECUTE from anon and authenticated, but both roles inherit from PUBLIC,
so the default grant still allowed execution. This migration revokes EXECUTE from
PUBLIC on all internal/trigger-only SECURITY DEFINER functions, then re-grants
EXECUTE to the service_role (postgres) so triggers and internal calls still work.

## Functions Affected (15 internal-only functions)
These are only called by triggers, cron jobs, or internal database logic — never
from the frontend or edge functions via anon/authenticated roles.
*/

REVOKE EXECUTE ON FUNCTION public.check_ewo_historical_collision(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_profile_role_unchanged() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_ewo_lifecycle_transition() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ewo_lifecycle_automation_trigger() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_canonical_report_body(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_or_create_billing_period(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.invoke_queue_processor(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.invoke_scheduled_briefings() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.migrate_historical_ewo_closure() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_po_acceptance_fields() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_billable_completion(uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reset_stale_queue_items() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trigger_billing_on_assessment_complete() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_ewo_lifecycle_transition(uuid, text) FROM PUBLIC;
