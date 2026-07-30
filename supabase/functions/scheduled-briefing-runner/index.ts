import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Cron-Secret",
};

// ─── Timezone helpers ─────────────────────────────────────────────────────────

function getNowInTimezone(tz: string): Date {
  const formatter = new Intl.DateTimeFormat("en-AU", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map(p => [p.type, p.value]));
  return new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00`);
}

function getTodayDateInTimezone(tz: string): string {
  const formatter = new Intl.DateTimeFormat("en-AU", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getDayOfWeekInTimezone(tz: string): number {
  // Returns 0=Sun..6=Sat in the given timezone
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-AU", { timeZone: tz, weekday: "short" });
  const day = formatter.format(now);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[day] ?? new Date().getDay();
}

function parseTimeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Verify cron secret
    const cronHeader = req.headers.get("X-Cron-Secret");
    const authHeader = req.headers.get("Authorization");
    const { data: setting } = await svc.from("settings").select("value").eq("key", "cron_secret").maybeSingle();
    const storedSecret = setting?.value ? String(setting.value).replace(/^"|"$/g, "") : null;

    const isValidCron = storedSecret && (
      (cronHeader && cronHeader === storedSecret) ||
      (authHeader && authHeader === `Bearer ${storedSecret}`)
    );

    if (!isValidCron) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({})) as {
      startup_catchup?: boolean;
    };
    const isStartupCatchup = body.startup_catchup === true;

    // Load all enabled schedule configs
    const { data: schedules } = await svc
      .from("ecc_briefing_schedule_config")
      .select("*")
      .eq("enabled", true);

    if (!schedules || schedules.length === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: "No enabled schedules" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Array<{ schedule_id: string; status: string; reason?: string; briefing_id?: string }> = [];

    for (const schedule of schedules) {
      const tz = (schedule.timezone as string) || "Australia/Sydney";
      const today = getTodayDateInTimezone(tz);
      const dayOfWeek = getDayOfWeekInTimezone(tz);

      // Check if today is an enabled day
      let dayAllowed = true;
      if (schedule.days_of_week && Array.isArray(schedule.days_of_week) && schedule.days_of_week.length > 0) {
        dayAllowed = (schedule.days_of_week as number[]).includes(dayOfWeek);
      } else if (schedule.weekdays_only) {
        dayAllowed = dayOfWeek >= 1 && dayOfWeek <= 5; // Mon-Fri
      }

      if (!dayAllowed && !isStartupCatchup) {
        results.push({ schedule_id: schedule.id as string, status: "skipped", reason: "Not an enabled day" });
        continue;
      }

      // Check if a briefing was already generated for today with this schedule
      const { data: todayBriefing } = await svc
        .from("ecc_ai_briefings")
        .select("id, created_at")
        .eq("scheduled_for", today)
        .eq("schedule_id", schedule.id)
        .maybeSingle();

      if (todayBriefing && !isStartupCatchup) {
        results.push({ schedule_id: schedule.id as string, status: "skipped", reason: "Already generated today", briefing_id: todayBriefing.id as string });
        continue;
      }

      // For non-startup calls: check if we are within the scheduled time window (±30 min)
      if (!isStartupCatchup) {
        const nowLocal = getNowInTimezone(tz);
        const nowMinutes = nowLocal.getHours() * 60 + nowLocal.getMinutes();
        const scheduledMinutes = parseTimeToMinutes((schedule.time_of_day as string) || "08:00");
        const diff = Math.abs(nowMinutes - scheduledMinutes);
        if (diff > 30) {
          results.push({ schedule_id: schedule.id as string, status: "skipped", reason: `Outside time window (now=${nowMinutes}m, scheduled=${scheduledMinutes}m, diff=${diff}m)` });
          continue;
        }
      }

      // For startup catchup: only run if catch_up_on_startup is enabled
      if (isStartupCatchup && !schedule.catch_up_on_startup) {
        results.push({ schedule_id: schedule.id as string, status: "skipped", reason: "catch_up_on_startup disabled" });
        continue;
      }

      // All checks passed — trigger generation
      const generateUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-engineering-briefing`;
      const triggerType = isStartupCatchup ? "startup_catchup" : "scheduled";

      const genRes = await fetch(generateUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Cron-Secret": storedSecret!,
        },
        body: JSON.stringify({
          generate_new: true,
          trigger_type: triggerType,
          template_id: schedule.template_id ?? null,
          schedule_id: schedule.id,
          scheduled_for: today,
        }),
      });

      if (genRes.ok) {
        const genData = await genRes.json().catch(() => ({}));
        results.push({ schedule_id: schedule.id as string, status: "generated", briefing_id: genData.briefing_id });
      } else {
        const errBody = await genRes.text().catch(() => "");
        results.push({ schedule_id: schedule.id as string, status: "error", reason: `${genRes.status}: ${errBody.slice(0, 200)}` });
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("scheduled-briefing-runner error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
