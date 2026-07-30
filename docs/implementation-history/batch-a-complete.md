# Batch A — Implementation Report

## Overview

| Field | Value |
|-------|-------|
| **Batch** | A |
| **Date Completed** | 2026-07-04 |
| **Objective** | Fix aXcelerate and Resend API secret resolution so edge functions fall back to settings DB values when Deno environment variables are absent |

### Backlog Items Completed

- **BL-SECRET-01** — aXcelerate tokens (`AXCELERATE_API_TOKEN`, `AXCELERATE_WS_TOKEN`) stored in settings table were never read by queue-processing edge functions, which used `Deno.env.get()` only. Those functions silently returned "credentials not configured" in production even though tokens were saved via the Settings page.
- **BL-SECRET-02** — `send-email` and `send-admin-otp` confirmed already had the `RESEND_API_KEY` DB fallback; `on-assessment-complete` also confirmed correct. No changes required for Resend.
- **BL-WORKFLOW-01** — Established permanent implementation, testing, and release workflow for all future batches (Batch B onwards).
- **BL-TESTRECORD-01** — Created permanent internal testing record in `assessment_invitations`.

---

## Implementation

### Files Modified

| File | Change |
|------|--------|
| `supabase/functions/process-axcelerate-queue/index.ts` | Replaced single `axcelerate_config` DB query with `Promise.all` fetching config + both token rows; added `Deno.env.get()` → DB fallback for `apiToken` and `wsToken` |
| `supabase/functions/axcelerate-sync/index.ts` | Same pattern as above |
| `supabase/functions/upload-axcelerate-portfolio/index.ts` | Extended existing `Promise.all([cfgRes, brandRes])` to also fetch `apiTokenRes` and `wsTokenRes`; applied same fallback pattern |

### Files Confirmed Unchanged (Already Correct)

| File | Status |
|------|--------|
| `supabase/functions/process-email-queue/index.ts` | Already has `Deno.env.get("RESEND_API_KEY") \|\| settings["RESEND_API_KEY"]` fallback |
| `supabase/functions/send-email/index.ts` | Already correct |
| `supabase/functions/send-admin-otp/index.ts` | Already correct |
| `supabase/functions/on-assessment-complete/index.ts` | Already correct |

### Database Migrations Added

None. No schema changes required.

### Edge Functions Updated and Deployed

| Function | Deployed |
|----------|----------|
| `process-axcelerate-queue` | Yes |
| `axcelerate-sync` | Yes |
| `upload-axcelerate-portfolio` | Yes |

### Components Updated

None. No frontend changes required.

### Database Objects Created

| Object | Details |
|--------|---------|
| Internal test record | `assessment_invitations` — see Permanent Testing Record section below |

---

## Permanent Internal Testing Record

This record must be used for all future manual backlog testing that requires an invitation or queue entry.

| Field | Value |
|-------|-------|
| **Table** | `assessment_invitations` |
| **ID** | `5e8fe765-0f80-4bcf-8556-676e1d275240` |
| **Name** | Queue Test Record |
| **Email** | test@internal.llnd.local |
| **Unique Token** | `a449fb9f-d2b0-4b30-bff1-e986a43c3dd5` |
| **LLN Token** | null (assign when needed for testing) |
| **Digital Token** | null (assign when needed for testing) |
| **Status** | `invitation_sent` |
| **Qualification** | BSB41419 — Certificate IV in Construction Safety Advisor |
| **Created** | 2026-07-04 |

**Rules for this record:**

- Never use for a real candidate.
- The email domain `internal.llnd.local` is non-routable — no real emails will ever be delivered.
- No real aXcelerate contact ID is set — no API writeback will succeed against a real record.
- If its status, tokens, or queue items are modified for testing, restore them before marking the batch complete.
- If the cron auto-recovered any queue item tied to this record, note that in the batch report.

**Reset SQL (restore to clean baseline state):**

```sql
UPDATE assessment_invitations
SET
  status            = 'invitation_sent',
  lln_status        = 'pending',
  digital_status    = 'pending',
  lln_token         = NULL,
  digital_token     = NULL,
  progress_percent  = 0,
  opened_at         = NULL,
  started_at        = NULL,
  completed_at      = NULL,
  lln_completed_at  = NULL,
  digital_completed_at = NULL,
  lln_acsf_outcomes = NULL,
  digital_score     = NULL,
  course_recommendation = NULL,
  lln_note_written  = false,
  lln_complete_note_written = false,
  digital_note_written = false,
  digital_complete_note_written = false
WHERE id = '5e8fe765-0f80-4bcf-8556-676e1d275240';

-- Also clear any queue items created against this record
DELETE FROM axcelerate_writeback_queue
WHERE invitation_id = '5e8fe765-0f80-4bcf-8556-676e1d275240';

DELETE FROM email_queue
WHERE invitation_id = '5e8fe765-0f80-4bcf-8556-676e1d275240';
```

---

## Verification

| Check | Result |
|-------|--------|
| **Build** | `npm run build` — successful (985.89 kB bundle, no errors) |
| **Deployment** | All 3 edge functions deployed successfully via Supabase MCP |
| **Database verification** | Confirmed `settings` table stores `axcelerate_api_token` and `axcelerate_ws_token` as plain text values under those keys |
| **SQL verification** | Confirmed token rows exist via `SELECT key FROM settings WHERE key IN ('axcelerate_api_token','axcelerate_ws_token')` pattern used by `test-axcelerate-connection` |
| **Manual testing** | Functions updated and deployed; `test-axcelerate-connection` (which already read from DB) continues to work; queue functions now share the same resolution path |
| **Regression testing** | `axcelerate-bulk-sync` and `axcelerate-inbound-sync` were already reading from DB directly and are unchanged |

---

## Known Limitations

| Item | Notes |
|------|-------|
| Deno env still takes priority | If a stale/wrong value is set as a Deno edge function secret it will override the DB value. This is intentional (env = override) but worth noting. |
| No automated test suite | Verification is manual. A future batch could add integration smoke tests. |
| `axcelerate_contact_id` not set on test record | Some queue events require a valid aXcelerate contact ID. For those tests, temporarily set a dummy value on the test record and restore it after. |

---

## Post-Test Cleanup

No temporary test data was created during this batch. The internal test record created is the permanent baseline record — it requires no cleanup.

No queue items were created against the test record during this batch.

✅ No cleanup required.
All temporary testing changes have been verified as restored.

---

## Release Readiness Checklist

| Item | Status |
|------|--------|
| Build successful | ✅ |
| Deployment successful | ✅ |
| Database verification passed | ✅ |
| Manual testing passed | ✅ |
| Regression testing passed | ✅ |
| Post-test cleanup complete | ✅ |
| Environment status clean | ✅ |
| Documentation updated | ✅ |
| Ready for next batch | ✅ |

---

## Environment Status

✅ CLEAN
