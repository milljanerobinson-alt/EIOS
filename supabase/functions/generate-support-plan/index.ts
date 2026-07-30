import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function verifyAuth(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.replace("Bearer ", "");

  // Allow service role calls (from on-assessment-complete auto-generation)
  if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    return { user: { id: "system" }, role: "admin" };
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!
  );

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !["admin", "trainer"].includes(profile.role)) return null;

  return { user, role: profile.role };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const auth = await verifyAuth(req);
    if (!auth) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { invitation_id } = await req.json();

    if (!invitation_id || !UUID_REGEX.test(invitation_id)) {
      return new Response(JSON.stringify({ error: "Invalid invitation ID format" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: invitation } = await supabase
      .from("assessment_invitations")
      .select("*, qualification:qualifications(*)")
      .eq("id", invitation_id)
      .maybeSingle();

    if (!invitation) {
      return new Response(JSON.stringify({ error: "Invitation not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: invAssessments } = await supabase
      .from("invitation_assessments")
      .select("*, assessment:assessments(*)")
      .eq("invitation_id", invitation_id);

    const { data: requirements } = await supabase
      .from("qualification_lln_requirements")
      .select("*")
      .eq("qualification_id", invitation.qualification_id);

    const domainFindings: { domain: string; acsf_level: number; finding: string }[] = [];
    const readingSupport: string[] = [];
    const numeracySupport: string[] = [];
    const extraResources: string[] = [];
    const referralRecommendations: string[] = [];
    const reasonableAdjustments: string[] = [];
    const trainerActionItems: string[] = [];

    for (const invAss of invAssessments || []) {
      const outcomes = invAss.acsf_outcomes || {};
      for (const [domain, level] of Object.entries(outcomes)) {
        const req = requirements?.find((r) => r.domain === domain);
        const minLevel = req?.minimum_acsf_level || 2;
        const acsfLevel = level as number;
        const meets = acsfLevel >= minLevel;

        let finding = `${domain.charAt(0).toUpperCase() + domain.slice(1)}: ACSF Level ${acsfLevel} achieved`;
        if (req) {
          finding += ` (minimum required: ${minLevel}). ${meets ? "Meets" : "Does not meet"} qualification requirements.`;
        }
        domainFindings.push({ domain, acsf_level: acsfLevel, finding });

        if (!meets) {
          if (domain === "literacy" || domain === "language") {
            readingSupport.push(`Provide additional reading practice materials at ACSF Level ${acsfLevel}.`);
            readingSupport.push(`Offer guided reading sessions with simplified texts.`);
            reasonableAdjustments.push(`Allow extra time for reading-based assessment tasks.`);
          }
          if (domain === "numeracy") {
            numeracySupport.push(`Provide numeracy support resources at ACSF Level ${acsfLevel}.`);
            numeracySupport.push(`Offer calculator-permitted practice exercises.`);
            reasonableAdjustments.push(`Allow use of a calculator for numeracy tasks.`);
          }
          if (domain === "digital") {
            extraResources.push(`Provide basic digital literacy tutorials and practice exercises.`);
            extraResources.push(`Offer one-on-one support sessions for digital tool usage.`);
            reasonableAdjustments.push(`Allow extended time for digital assessment components.`);
          }
          referralRecommendations.push(`Consider referral to learning support services for ${domain} development.`);
          trainerActionItems.push(`Schedule follow-up session to address ${domain} gaps within 2 weeks.`);
        }
      }
    }

    if (readingSupport.length === 0) readingSupport.push("No additional reading support required at this time.");
    if (numeracySupport.length === 0) numeracySupport.push("No additional numeracy support required at this time.");
    if (extraResources.length === 0) extraResources.push("Standard learning resources are sufficient.");
    if (referralRecommendations.length === 0) referralRecommendations.push("No external referrals needed at this time.");
    if (reasonableAdjustments.length === 0) reasonableAdjustments.push("No reasonable adjustments required.");
    if (trainerActionItems.length === 0) trainerActionItems.push("Continue with standard training program.");

    const content = {
      domain_findings: domainFindings,
      reading_support: readingSupport,
      numeracy_support: numeracySupport,
      extra_resources: extraResources,
      referral_recommendations: referralRecommendations,
      reasonable_adjustments: reasonableAdjustments,
      trainer_action_items: trainerActionItems,
    };

    const { data: existingPlan } = await supabase
      .from("support_plans")
      .select("id")
      .eq("invitation_id", invitation_id)
      .maybeSingle();

    let planId;
    if (existingPlan) {
      const { data: updated } = await supabase
        .from("support_plans")
        .update({ content, updated_at: new Date().toISOString() })
        .eq("id", existingPlan.id)
        .select("id")
        .maybeSingle();
      planId = updated?.id;
    } else {
      const { data: newPlan } = await supabase
        .from("support_plans")
        .insert({
          invitation_id,
          generated_by: "ai",
          content,
          status: "draft",
        })
        .select("id")
        .maybeSingle();
      planId = newPlan?.id;
    }

    await supabase.from("audit_trail").insert({
      invitation_id,
      event_type: "support_plan_generated",
      event_data: { plan_id: planId, generated_by: "ai" },
      actor: "system",
    });

    return new Response(JSON.stringify({ plan_id: planId, content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (_err) {
    return new Response(JSON.stringify({ error: "An internal error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
