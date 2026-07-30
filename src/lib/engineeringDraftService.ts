/**
 * Engineering Draft Service — EWO-011.8
 *
 * Client-side service that calls the atd-engineering-draft edge function to
 * generate AI-assisted drafts for Engineering Analysis and Engineering Planning.
 * Keeps all AI orchestration logic outside React components.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DraftEvidenceItem {
  type: 'constitution' | 'related_intent' | 'knowledge_record' | 'engineering_decision';
  ref: string;
  title: string;
  relevance: string;
}

export type DraftConfidenceScore = 'high' | 'medium' | 'low';

export type DraftComplexity = 'low' | 'medium' | 'high' | 'critical';

export interface AnalysisDraft {
  summary: string;
  constitution_review: string;
  architecture_notes: string;
  product_intelligence_notes: string;
  complexity_assessment: DraftComplexity;
  confidence_score: DraftConfidenceScore;
  confidence_explanation: string;
  evidence: DraftEvidenceItem[];
  generated_at: string;
}

export interface PlanDraft {
  executive_summary: string;
  engineering_strategy: string;
  recommended_approach: string;
  estimated_effort: string;
  confidence_score: DraftConfidenceScore;
  confidence_explanation: string;
  evidence: DraftEvidenceItem[];
  generated_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function edgeFnUrl(slug: string): string {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${slug}`;
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };
}

// ─── EngineeringDraftService ──────────────────────────────────────────────────

export const EngineeringDraftService = {

  /**
   * Generates an AI-assisted Engineering Analysis draft for the given intent.
   * Returns structured draft content ready to pre-populate the analysis form.
   */
  async generateAnalysisDraft(intentId: string): Promise<AnalysisDraft> {
    const resp = await fetch(edgeFnUrl('atd-engineering-draft'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        draft_type: 'analysis',
        intent_id: intentId,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Analysis draft generation failed (${resp.status}): ${text.slice(0, 200)}`);
    }

    const data = await resp.json() as Record<string, unknown>;
    if (data.error) throw new Error(String(data.error));

    return {
      summary: String(data.summary ?? ''),
      constitution_review: String(data.constitution_review ?? ''),
      architecture_notes: String(data.architecture_notes ?? ''),
      product_intelligence_notes: String(data.product_intelligence_notes ?? ''),
      complexity_assessment: (data.complexity_assessment as DraftComplexity) ?? 'medium',
      confidence_score: (data.confidence_score as DraftConfidenceScore) ?? 'medium',
      confidence_explanation: String(data.confidence_explanation ?? ''),
      evidence: Array.isArray(data.evidence) ? data.evidence as DraftEvidenceItem[] : [],
      generated_at: new Date().toISOString(),
    };
  },

  /**
   * Generates an AI-assisted Engineering Plan draft from a completed analysis.
   * Returns structured draft content ready to pre-populate the planning form.
   */
  async generatePlanDraft(intentId: string, analysisId: string): Promise<PlanDraft> {
    const resp = await fetch(edgeFnUrl('atd-engineering-draft'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        draft_type: 'plan',
        intent_id: intentId,
        analysis_id: analysisId,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Plan draft generation failed (${resp.status}): ${text.slice(0, 200)}`);
    }

    const data = await resp.json() as Record<string, unknown>;
    if (data.error) throw new Error(String(data.error));

    return {
      executive_summary: String(data.executive_summary ?? ''),
      engineering_strategy: String(data.engineering_strategy ?? ''),
      recommended_approach: String(data.recommended_approach ?? ''),
      estimated_effort: String(data.estimated_effort ?? ''),
      confidence_score: (data.confidence_score as DraftConfidenceScore) ?? 'medium',
      confidence_explanation: String(data.confidence_explanation ?? ''),
      evidence: Array.isArray(data.evidence) ? data.evidence as DraftEvidenceItem[] : [],
      generated_at: new Date().toISOString(),
    };
  },

  /**
   * Determines whether the approved field values differ from the original AI draft.
   * Used to set po_edits_made on the persisted record.
   */
  detectEdits(
    draft: Pick<AnalysisDraft, 'summary' | 'constitution_review' | 'architecture_notes' | 'product_intelligence_notes'> & { complexity_assessment: string },
    approved: { summary: string; constitution_review: string; architecture_notes: string; product_intelligence_notes: string; complexity_assessment: string },
  ): boolean {
    return (
      draft.summary.trim() !== approved.summary.trim() ||
      draft.constitution_review.trim() !== approved.constitution_review.trim() ||
      draft.architecture_notes.trim() !== approved.architecture_notes.trim() ||
      draft.product_intelligence_notes.trim() !== approved.product_intelligence_notes.trim() ||
      draft.complexity_assessment !== approved.complexity_assessment
    );
  },

  /**
   * Determines whether plan fields differ from the original AI draft.
   */
  detectPlanEdits(
    draft: Pick<PlanDraft, 'executive_summary' | 'engineering_strategy' | 'recommended_approach' | 'estimated_effort'>,
    approved: { executive_summary: string; engineering_strategy: string; recommended_approach: string; estimated_effort: string },
  ): boolean {
    return (
      draft.executive_summary.trim() !== approved.executive_summary.trim() ||
      draft.engineering_strategy.trim() !== approved.engineering_strategy.trim() ||
      draft.recommended_approach.trim() !== approved.recommended_approach.trim() ||
      draft.estimated_effort.trim() !== approved.estimated_effort.trim()
    );
  },

  /**
   * Returns a human-readable label and colour class for a confidence score.
   */
  confidenceDisplay(score: DraftConfidenceScore): { label: string; colour: string; bg: string } {
    switch (score) {
      case 'high':   return { label: 'High Confidence',   colour: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' };
      case 'medium': return { label: 'Medium Confidence', colour: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200' };
      case 'low':    return { label: 'Low Confidence',    colour: 'text-red-700',     bg: 'bg-red-50 border-red-100' };
    }
  },

  /**
   * Returns a human-readable label and colour class for an evidence item type.
   */
  evidenceTypeDisplay(type: DraftEvidenceItem['type']): { label: string; colour: string } {
    switch (type) {
      case 'constitution':        return { label: 'Constitution',       colour: 'text-blue-600' };
      case 'related_intent':      return { label: 'Related Intent',     colour: 'text-purple-600' };
      case 'knowledge_record':    return { label: 'Knowledge',          colour: 'text-teal-600' };
      case 'engineering_decision': return { label: 'Decision',          colour: 'text-slate-600' };
    }
  },
};
