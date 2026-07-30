/**
 * Conversation Intelligence Service (CIS)
 * Phase 17.3 — Conversation Intelligence Indexing
 *
 * Indexes ATD conversations into structured engineering intelligence
 * so ELPM can ask "Have we discussed this before?" before generating
 * any new Engineering Review.
 */

import { supabase } from './supabase';
import {
  detectPlatformLayer, detectAffectedModules, assessFuturePlatformValue,
  type PlatformLayer,
} from './architectureService';

export const CIS_VERSION = '1.0';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConversationType =
  | 'engineering_decision'
  | 'architecture_discussion'
  | 'root_cause_analysis'
  | 'feature_planning'
  | 'release_planning'
  | 'testing_strategy'
  | 'defect_investigation'
  | 'governance_review'
  | 'po_feedback'
  | 'performance_investigation'
  | 'security_review'
  | 'technical_debt'
  | 'general_engineering';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ExtractedDecision {
  decision: string;
  rationale: string;
  confidence: number;
}

export interface ExtractedRisk {
  risk: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  mitigation: string | null;
}

export interface ExtractedLesson {
  lesson: string;
  applies_to: string[];
}

export interface ExtractedRecommendation {
  recommendation: string;
  priority: 'low' | 'medium' | 'high';
  area: string | null;
}

export interface ExtractedPOFeedback {
  feedback: string;
  direction: 'approved' | 'rejected' | 'deferred' | 'noted';
}

export interface ConversationIntelligence {
  id: string;
  conversation_id: string;
  conversation_title: string;
  conversation_type: ConversationType;
  engineering_area: string | null;
  summary: string | null;
  extracted_decisions: ExtractedDecision[];
  extracted_risks: ExtractedRisk[];
  extracted_lessons: ExtractedLesson[];
  extracted_recommendations: ExtractedRecommendation[];
  extracted_po_feedback: ExtractedPOFeedback[];
  related_ercs: string[];
  related_ewos: string[];
  related_test_plans: string[];
  related_audits: string[];
  related_benchmarks: string[];
  related_releases: string[];
  related_modules: string[];
  lineage_status: 'active' | 'superseded' | 'archived';
  superseded_by: string | null;
  confidence_score: number;
  platform_layer: PlatformLayer | null;
  affected_modules: string[];
  reusable_knowledge: boolean;
  domain_knowledge: boolean;
  future_platform_value: 'low' | 'medium' | 'high';
  indexed_at: string;
  index_version: string;
  created_at: string;
  updated_at: string;
}

// Lightweight version used by ELPM
export interface ConversationIntelligenceSummary {
  id: string;
  conversation_id: string;
  conversation_title: string;
  conversation_type: ConversationType;
  engineering_area: string | null;
  summary: string | null;
  extracted_decisions: ExtractedDecision[];
  extracted_lessons: ExtractedLesson[];
  extracted_recommendations: ExtractedRecommendation[];
  extracted_po_feedback: ExtractedPOFeedback[];
  related_ercs: string[];
  lineage_status: 'active' | 'superseded' | 'archived';
  confidence_score: number;
  indexed_at: string;
}

// ─── 13-Type Classifier ───────────────────────────────────────────────────────

const CLASSIFICATION_SIGNALS: Record<ConversationType, string[]> = {
  engineering_decision:     ['decision', 'decided', 'approach', 'implement', 'chosen', 'will use', 'going with'],
  architecture_discussion:  ['architecture', 'design', 'structure', 'pattern', 'component', 'module', 'system design'],
  root_cause_analysis:      ['root cause', 'rca', 'why did', 'caused by', 'investigation', 'post-mortem', 'incident'],
  feature_planning:         ['feature', 'build', 'develop', 'plan', 'scope', 'requirement', 'user story'],
  release_planning:         ['release', 'deploy', 'ship', 'rc', 'version', 'rollout', 'go-live'],
  testing_strategy:         ['test', 'testing', 'qa', 'coverage', 'regression', 'test plan', 'automated'],
  defect_investigation:     ['defect', 'bug', 'issue', 'broken', 'error', 'fail', 'not working', 'fix'],
  governance_review:        ['governance', 'compliance', 'audit', 'standard', 'policy', 'regulation', 'review'],
  po_feedback:              ['po feedback', 'product owner', 'stakeholder', 'client', 'approved', 'rejected', 'feedback'],
  performance_investigation: ['performance', 'slow', 'latency', 'speed', 'benchmark', 'load', 'optimise'],
  security_review:          ['security', 'vulnerability', 'auth', 'permission', 'exploit', 'cve', 'rls'],
  technical_debt:           ['technical debt', 'debt', 'refactor', 'legacy', 'cleanup', 'improve', 'modernise'],
  general_engineering:      [],
};

export function classifyConversation(title: string, messages: ConversationMessage[]): ConversationType {
  const text = `${title} ${messages.map(m => m.content).join(' ')}`.toLowerCase();

  const scores: Partial<Record<ConversationType, number>> = {};
  for (const [type, signals] of Object.entries(CLASSIFICATION_SIGNALS) as [ConversationType, string[]][]) {
    if (signals.length === 0) continue;
    scores[type] = signals.filter(s => text.includes(s)).length;
  }

  const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a);
  if (sorted.length > 0 && sorted[0][1] > 0) {
    return sorted[0][0] as ConversationType;
  }
  return 'general_engineering';
}

// ─── Engineering Area Extractor ───────────────────────────────────────────────

const AREA_SIGNALS: Array<{ area: string; signals: string[] }> = [
  { area: 'AI Platform',       signals: ['ai', 'openai', 'anthropic', 'llm', 'model', 'token', 'prompt'] },
  { area: 'Authentication',    signals: ['auth', 'login', 'session', 'jwt', 'supabase auth', 'password'] },
  { area: 'Database',          signals: ['database', 'postgres', 'migration', 'table', 'rls', 'sql', 'supabase'] },
  { area: 'Assessment Engine', signals: ['assessment', 'lln', 'digital literacy', 'test item', 'scoring'] },
  { area: 'Frontend',          signals: ['react', 'component', 'ui', 'page', 'tailwind', 'frontend'] },
  { area: 'Integrations',      signals: ['axcelerate', 'stripe', 'webhook', 'api', 'integration'] },
  { area: 'Infrastructure',    signals: ['edge function', 'deploy', 'infrastructure', 'ci', 'pipeline'] },
  { area: 'ECC',               signals: ['ecc', 'engineering command', 'director dashboard', 'briefing'] },
  { area: 'Reporting',         signals: ['report', 'analytics', 'dashboard', 'metrics', 'stats'] },
  { area: 'Security',          signals: ['security', 'vulnerability', 'permission', 'compliance'] },
];

export function extractEngineeringArea(title: string, messages: ConversationMessage[]): string | null {
  const text = `${title} ${messages.map(m => m.content).join(' ')}`.toLowerCase();
  const scores = AREA_SIGNALS.map(({ area, signals }) => ({
    area,
    score: signals.filter(s => text.includes(s)).length,
  })).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
  return scores[0]?.area ?? null;
}

// ─── Intelligence Extraction ──────────────────────────────────────────────────

export function extractDecisions(messages: ConversationMessage[]): ExtractedDecision[] {
  const decisions: ExtractedDecision[] = [];
  const decisionPatterns = [
    /(?:we(?:'ve)? decided|decision:|going with|will use|chosen to|agreed to|approach is)\s+(.{20,200})/gi,
    /(?:the decision is|final approach|implementation approach)\s*[:\-]?\s*(.{20,200})/gi,
  ];

  const fullText = messages.filter(m => m.role === 'assistant').map(m => m.content).join('\n');

  for (const pattern of decisionPatterns) {
    let match;
    while ((match = pattern.exec(fullText)) !== null && decisions.length < 5) {
      const decision = match[1].replace(/\n.*/gs, '').trim().slice(0, 200);
      if (decision.length > 20 && !decisions.some(d => d.decision.includes(decision.slice(0, 40)))) {
        decisions.push({
          decision,
          rationale: 'Extracted from AI Technical Director conversation',
          confidence: 0.7,
        });
      }
    }
  }

  return decisions;
}

export function extractRisks(messages: ConversationMessage[]): ExtractedRisk[] {
  const risks: ExtractedRisk[] = [];
  const riskPatterns = [
    /(?:risk[:\s]+|potential risk|concern[:\s]+|warning[:\s]+|be aware|caution)\s*[:\-]?\s*(.{20,200})/gi,
  ];

  const fullText = messages.filter(m => m.role === 'assistant').map(m => m.content).join('\n');

  for (const pattern of riskPatterns) {
    let match;
    while ((match = pattern.exec(fullText)) !== null && risks.length < 5) {
      const risk = match[1].replace(/\n.*/gs, '').trim().slice(0, 200);
      if (risk.length > 20 && !risks.some(r => r.risk.includes(risk.slice(0, 40)))) {
        const severity: ExtractedRisk['severity'] =
          /critical|severe|breaking/i.test(risk) ? 'critical' :
          /high|significant|major/i.test(risk) ? 'high' :
          /medium|moderate/i.test(risk) ? 'medium' : 'low';
        risks.push({ risk, severity, mitigation: null });
      }
    }
  }

  return risks;
}

export function extractLessons(messages: ConversationMessage[]): ExtractedLesson[] {
  const lessons: ExtractedLesson[] = [];
  const lessonPatterns = [
    /(?:lesson(?:s learned)?[:\s]+|key takeaway|note that|important to|should always|best practice)\s*[:\-]?\s*(.{20,200})/gi,
    /(?:in future|going forward|remember to|ensure that)\s+(.{20,200})/gi,
  ];

  const fullText = messages.filter(m => m.role === 'assistant').map(m => m.content).join('\n');

  for (const pattern of lessonPatterns) {
    let match;
    while ((match = pattern.exec(fullText)) !== null && lessons.length < 5) {
      const lesson = match[1].replace(/\n.*/gs, '').trim().slice(0, 200);
      if (lesson.length > 20 && !lessons.some(l => l.lesson.includes(lesson.slice(0, 40)))) {
        lessons.push({ lesson, applies_to: [] });
      }
    }
  }

  return lessons;
}

export function extractRecommendations(messages: ConversationMessage[]): ExtractedRecommendation[] {
  const recs: ExtractedRecommendation[] = [];
  const recPatterns = [
    /(?:recommend(?:ation)?[:\s]+|I recommend|suggest(?:ion)?[:\s]+|advise|next step)\s*[:\-]?\s*(.{20,200})/gi,
    /(?:you should|we should|consider)\s+(.{20,200})/gi,
  ];

  const fullText = messages.filter(m => m.role === 'assistant').map(m => m.content).join('\n');

  for (const pattern of recPatterns) {
    let match;
    while ((match = pattern.exec(fullText)) !== null && recs.length < 5) {
      const recommendation = match[1].replace(/\n.*/gs, '').trim().slice(0, 200);
      if (recommendation.length > 20 && !recs.some(r => r.recommendation.includes(recommendation.slice(0, 40)))) {
        const priority: ExtractedRecommendation['priority'] =
          /critical|urgent|immediately/i.test(recommendation) ? 'high' :
          /important|should|consider/i.test(recommendation) ? 'medium' : 'low';
        recs.push({ recommendation, priority, area: null });
      }
    }
  }

  return recs;
}

export function extractPOFeedback(messages: ConversationMessage[]): ExtractedPOFeedback[] {
  const feedback: ExtractedPOFeedback[] = [];
  const poPatterns = [
    /(?:po feedback|product owner|stakeholder|client)[:\s]+(.{20,200})/gi,
    /(?:approved|rejected|deferred|signed off|not approved|hold off)[:\s]+(.{20,200})/gi,
  ];

  const fullText = messages.map(m => m.content).join('\n');

  for (const pattern of poPatterns) {
    let match;
    while ((match = pattern.exec(fullText)) !== null && feedback.length < 3) {
      const fb = match[1].replace(/\n.*/gs, '').trim().slice(0, 200);
      if (fb.length > 20 && !feedback.some(f => f.feedback.includes(fb.slice(0, 40)))) {
        const direction: ExtractedPOFeedback['direction'] =
          /approved|sign.?off|green light/i.test(fb) ? 'approved' :
          /rejected|not approved|declined/i.test(fb) ? 'rejected' :
          /deferred|hold|later/i.test(fb) ? 'deferred' : 'noted';
        feedback.push({ feedback: fb, direction });
      }
    }
  }

  return feedback;
}

// ─── Artefact Reference Extractor ────────────────────────────────────────────

export function extractArtefactRefs(messages: ConversationMessage[]): {
  ercs: string[]; ewos: string[]; testPlans: string[];
  audits: string[]; benchmarks: string[]; releases: string[]; modules: string[];
} {
  const text = messages.map(m => m.content).join('\n');

  return {
    ercs:       [...new Set((text.match(/ERC-\d+/gi) ?? []).map(s => s.toUpperCase()))].slice(0, 10),
    ewos:       [...new Set((text.match(/EWO-\d+/gi) ?? []).map(s => s.toUpperCase()))].slice(0, 10),
    testPlans:  [...new Set((text.match(/(?:test plan|TP-\d+|test-plan)[^\s,\.\)]{0,30}/gi) ?? []).map(s => s.trim()))].slice(0, 5),
    audits:     [...new Set((text.match(/(?:audit)[^\s,\.\)]{0,30}/gi) ?? []).map(s => s.trim()))].slice(0, 5),
    benchmarks: [...new Set((text.match(/(?:benchmark|BM-\d+)[^\s,\.\)]{0,30}/gi) ?? []).map(s => s.trim()))].slice(0, 5),
    releases:   [...new Set((text.match(/(?:v\d+\.\d+|RC-\d+|release \d+)[^\s,\.\)]{0,20}/gi) ?? []).map(s => s.trim()))].slice(0, 5),
    modules:    [...new Set((text.match(/(?:module|component)[:\s]+([A-Z][a-zA-Z]+)/g) ?? []).map(s => s.replace(/module:|component:/i, '').trim()))].slice(0, 5),
  };
}

// ─── Summary Generator ────────────────────────────────────────────────────────

export function generateConversationSummary(
  title: string,
  type: ConversationType,
  messages: ConversationMessage[],
): string {
  const assistantMessages = messages.filter(m => m.role === 'assistant');
  if (assistantMessages.length === 0) return `Conversation: ${title}`;

  const lastAssistant = assistantMessages[assistantMessages.length - 1].content;
  const summaryChunk = lastAssistant.slice(0, 300).replace(/\n+/g, ' ').trim();

  return `[${type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}] ${title}. ${summaryChunk}${summaryChunk.length >= 300 ? '…' : ''}`;
}

// ─── Confidence Scorer ────────────────────────────────────────────────────────

export function scoreConversationConfidence(
  messages: ConversationMessage[],
  decisions: ExtractedDecision[],
  risks: ExtractedRisk[],
  lessons: ExtractedLesson[],
): number {
  let score = 0.2; // base
  if (messages.length >= 4) score += 0.1;
  if (messages.length >= 8) score += 0.1;
  if (decisions.length > 0) score += 0.2;
  if (decisions.length >= 3) score += 0.1;
  if (risks.length > 0) score += 0.1;
  if (lessons.length > 0) score += 0.1;
  return Math.min(1, score);
}

// ─── Main Indexing Function ───────────────────────────────────────────────────

export async function indexConversation(
  conversationId: string,
  title: string,
  messages: ConversationMessage[],
): Promise<ConversationIntelligence> {
  const type = classifyConversation(title, messages);
  const area = extractEngineeringArea(title, messages);
  const decisions = extractDecisions(messages);
  const risks = extractRisks(messages);
  const lessons = extractLessons(messages);
  const recommendations = extractRecommendations(messages);
  const poFeedback = extractPOFeedback(messages);
  const refs = extractArtefactRefs(messages);
  const summary = generateConversationSummary(title, type, messages);
  const confidence = scoreConversationConfidence(messages, decisions, risks, lessons);
  const now = new Date().toISOString();

  // Platform layer classification (TP-018)
  const fullContent = messages.map(m => m.content).join('\n');
  const KNOWN_SLUGS = ['atd-core','exec-dashboard','review-engine','elpm','eig','memory-engine',
    'conversation-intelligence','benchmark-engine','governance','workflow-engine','decision-engine',
    'audit-engine','testing-engine','roadmap-release','briefings','error-intelligence',
    'module-registry','plugin-manager','lln-d','customer-workspace',
    'database','auth','api-layer','ai-providers','integrations'];
  const platformLayer = detectPlatformLayer(title, fullContent);
  const affectedModules = detectAffectedModules(`${title} ${fullContent}`, KNOWN_SLUGS);
  const reusableKnowledge = platformLayer === 'core_platform' || platformLayer === 'infrastructure';
  const domainKnowledge = platformLayer === 'domain_module';
  const futurePlatformValue = assessFuturePlatformValue(title, fullContent, platformLayer);

  // Upsert by conversation_id (re-index on demand)
  const { data: existing } = await supabase
    .from('ecc_conversation_intelligence')
    .select('id')
    .eq('conversation_id', conversationId)
    .maybeSingle();

  const record = {
    conversation_id:           conversationId,
    conversation_title:        title,
    conversation_type:         type,
    engineering_area:          area,
    summary,
    extracted_decisions:       decisions,
    extracted_risks:           risks,
    extracted_lessons:         lessons,
    extracted_recommendations: recommendations,
    extracted_po_feedback:     poFeedback,
    related_ercs:              refs.ercs,
    related_ewos:              refs.ewos,
    related_test_plans:        refs.testPlans,
    related_audits:            refs.audits,
    related_benchmarks:        refs.benchmarks,
    related_releases:          refs.releases,
    related_modules:           refs.modules,
    lineage_status:            'active',
    superseded_by:             null,
    confidence_score:          confidence,
    platform_layer:            platformLayer,
    affected_modules:          affectedModules,
    reusable_knowledge:        reusableKnowledge,
    domain_knowledge:          domainKnowledge,
    future_platform_value:     futurePlatformValue,
    indexed_at:                now,
    index_version:             CIS_VERSION,
    updated_at:                now,
  };

  if (existing?.id) {
    const { data } = await supabase
      .from('ecc_conversation_intelligence')
      .update(record)
      .eq('id', existing.id)
      .select()
      .single();
    return data as ConversationIntelligence;
  } else {
    const { data } = await supabase
      .from('ecc_conversation_intelligence')
      .insert(record)
      .select()
      .single();
    return data as ConversationIntelligence;
  }
}

// ─── Load Intelligence for a Conversation ────────────────────────────────────

export async function loadConversationIntelligence(
  conversationId: string,
): Promise<ConversationIntelligence | null> {
  const { data } = await supabase
    .from('ecc_conversation_intelligence')
    .select('*')
    .eq('conversation_id', conversationId)
    .maybeSingle();
  return data as ConversationIntelligence | null;
}

// ─── ELPM Context Loader: Load relevant conversation intelligence ─────────────

export async function loadConversationIntelligenceForELPM(context: {
  type: string;
  engineering_area: string | null;
  related_ercs: string[];
  title: string;
}): Promise<ConversationIntelligenceSummary[]> {
  const { data } = await supabase
    .from('ecc_conversation_intelligence')
    .select('id,conversation_id,conversation_title,conversation_type,engineering_area,summary,extracted_decisions,extracted_lessons,extracted_recommendations,extracted_po_feedback,related_ercs,lineage_status,confidence_score,indexed_at')
    .neq('lineage_status', 'archived')
    .order('indexed_at', { ascending: false })
    .limit(30);

  if (!data) return [];

  const items = data as ConversationIntelligenceSummary[];

  // Score relevance
  const scored = items.map(ci => {
    let score = 0;
    // Type match
    if (ci.conversation_type.replace(/_/g, ' ').includes(context.type.replace(/_/g, ' '))) score += 20;
    // Area match
    if (context.engineering_area && ci.engineering_area?.toLowerCase() === context.engineering_area.toLowerCase()) score += 15;
    // ERC overlap
    const ercOverlap = context.related_ercs.filter(e => ci.related_ercs.includes(e)).length;
    score += Math.min(15, ercOverlap * 5);
    // Title keyword
    const titleWords = new Set(context.title.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const convWords = ci.conversation_title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    score += Math.min(10, convWords.filter(w => titleWords.has(w)).length * 3);
    // Has decisions
    if (ci.extracted_decisions.length > 0) score += 10;
    // High confidence
    if (ci.confidence_score >= 0.6) score += 10;
    return { ci, score };
  });

  return scored
    .filter(s => s.score >= 10)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(s => s.ci);
}

// ─── List All Indexed Conversations ──────────────────────────────────────────

export async function listIndexedConversations(): Promise<ConversationIntelligence[]> {
  const { data } = await supabase
    .from('ecc_conversation_intelligence')
    .select('*')
    .order('indexed_at', { ascending: false });
  return (data ?? []) as ConversationIntelligence[];
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export interface ConversationIntelligenceStats {
  total_indexed: number;
  decisions_extracted: number;
  lessons_extracted: number;
  superseded: number;
  current_baselines: number;
  by_type: Record<string, number>;
}

export async function loadConversationIntelligenceStats(): Promise<ConversationIntelligenceStats> {
  const { data } = await supabase
    .from('ecc_conversation_intelligence')
    .select('conversation_type,extracted_decisions,extracted_lessons,lineage_status');

  const items = data ?? [];
  const byType: Record<string, number> = {};
  let decisions = 0;
  let lessons = 0;
  let superseded = 0;
  let baselines = 0;

  for (const item of items) {
    byType[item.conversation_type as string] = (byType[item.conversation_type as string] ?? 0) + 1;
    decisions += (item.extracted_decisions as unknown[]).length;
    lessons += (item.extracted_lessons as unknown[]).length;
    if (item.lineage_status === 'superseded') superseded++;
    if (item.lineage_status === 'active') baselines++;
  }

  return {
    total_indexed: items.length,
    decisions_extracted: decisions,
    lessons_extracted: lessons,
    superseded,
    current_baselines: baselines,
    by_type: byType,
  };
}
