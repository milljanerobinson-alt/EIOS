// ─── EWO-011: Engineering Idea Domain Types ───────────────────────────────────

export type IdeaCategory =
  | 'general' | 'feature' | 'improvement' | 'technical_debt'
  | 'architecture' | 'security' | 'performance' | 'ux'
  | 'integration' | 'infrastructure' | 'research';

export type IdeaPriority = 'critical' | 'high' | 'medium' | 'low';

export type IdeaStatus =
  | 'draft' | 'active' | 'queued_for_promotion'
  | 'promoted' | 'archived' | 'superseded';

export type ObjectiveStatus = 'draft' | 'active' | 'met' | 'missed' | 'cancelled';

// ─── Domain Objects ───────────────────────────────────────────────────────────

export interface EngineeringObjective {
  id: string;
  objective_ref: string;
  intent_id: string | null;
  title: string;
  description: string | null;
  success_metrics: Array<{ metric: string; target?: string }>;
  target_date: string | null;
  status: ObjectiveStatus;
  priority: IdeaPriority;
  created_at: string;
}

export interface EngineeringIdea {
  id: string;
  idea_ref: string;
  title: string;
  description: string | null;
  category: IdeaCategory;
  priority: IdeaPriority;
  status: IdeaStatus;
  products: string[];
  applications: string[];
  tags: string[];
  session_id: string | null;
  intent_id: string | null;
  objective_id: string | null;
  related_ewo_refs: string[];
  related_feature_ids: string[];
  related_record_ids: string[];
  memory_search_performed: boolean;
  duplicates_checked: boolean;
  guardian_validated: boolean;
  guardian_session_id: string | null;
  // EWO-011.1: Similarity Review fields
  similarity_matches_count: number;
  similarity_decision: SimilarityDecision | null;
  similarity_top_match_ref: string | null;
  similarity_top_match_score: number | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ─── EWO-011.1: Similarity Engine ────────────────────────────────────────────

export type SimilarityObjectType =
  | 'engineering_idea'
  | 'engineering_feature'
  | 'work_order'
  | 'engineering_record'
  | 'engineering_standard'
  | 'engineering_memory'
  | 'constitutional_decision';

export type SimilarityDecision =
  | 'continue_anyway'
  | 'link_existing'
  | 'merge'
  | 'cancel';

export interface SimilarityResult {
  id: string;
  object_type: SimilarityObjectType;
  ref: string;
  title: string;
  reason: string;
  relationship: 'duplicate' | 'related' | 'supersedes' | 'extends' | 'complements';
  status: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export const SIMILARITY_OBJECT_TYPE_CFG: Record<SimilarityObjectType, { label: string; colour: string }> = {
  engineering_idea:      { label: 'Engineering Idea',     colour: 'amber'   },
  engineering_feature:   { label: 'Engineering Feature',  colour: 'blue'    },
  work_order:            { label: 'Work Order',           colour: 'violet'  },
  engineering_record:    { label: 'Engineering Record',   colour: 'teal'    },
  engineering_standard:  { label: 'Engineering Standard', colour: 'indigo'  },
  engineering_memory:    { label: 'Engineering Memory',   colour: 'cyan'    },
  constitutional_decision:{ label: 'Constitutional Decision', colour: 'red' },
};

export const SIMILARITY_DECISION_CFG: Record<SimilarityDecision, { label: string; description: string; colour: string }> = {
  continue_anyway: {
    label: 'Continue Anyway',
    description: 'Proceed with this idea — differences justify a separate record.',
    colour: 'blue',
  },
  link_existing: {
    label: 'Link Existing',
    description: 'Create this idea and link it to the similar object for traceability.',
    colour: 'teal',
  },
  merge: {
    label: 'Merge',
    description: 'Update the existing object with this idea\'s content. Do not create a duplicate.',
    colour: 'amber',
  },
  cancel: {
    label: 'Cancel Execution',
    description: 'Abort — the existing object already covers this intent.',
    colour: 'red',
  },
};

export const RELATIONSHIP_CFG: Record<SimilarityResult['relationship'], { label: string; colour: string }> = {
  duplicate:    { label: 'Duplicate',   colour: 'red'    },
  related:      { label: 'Related',     colour: 'blue'   },
  supersedes:   { label: 'Supersedes',  colour: 'orange' },
  extends:      { label: 'Extends',     colour: 'cyan'   },
  complements:  { label: 'Complements', colour: 'teal'   },
};

// ─── Wizard State ─────────────────────────────────────────────────────────────

export type WizardStep =
  | 'intent'
  | 'objective'
  | 'strategy'
  | 'context'
  | 'agent'
  | 'review'
  | 'similarity'
  | 'executing'
  | 'complete';

export interface WizardIntentForm {
  title: string;
  description: string;
  business_driver: string;
  priority: IdeaPriority;
  programme: string;
}

export interface WizardObjectiveForm {
  title: string;
  description: string;
  success_metrics: string[];
}

export interface WizardStrategyForm {
  strategy_type: 'incremental' | 'parallel' | 'phased' | 'spike' | 'iterative' | 'experimental';
  approach: string;
  success_criteria: string[];
}

export interface WizardIdeaForm {
  title: string;
  description: string;
  category: IdeaCategory;
  priority: IdeaPriority;
  tags: string[];
  products: string[];
  applications: string[];
}

export interface WizardState {
  step: WizardStep;
  intent: WizardIntentForm;
  objective: WizardObjectiveForm;
  strategy: WizardStrategyForm;
  idea: WizardIdeaForm;
  contextRef: string;
  agentRef: string;
  // results after execution
  createdIntentId?: string;
  createdObjectiveId?: string;
  createdSessionId?: string;
  createdIdeaId?: string;
  createdIdeaRef?: string;
  // EWO-011.2: Engineering Record created as part of bridge
  createdRecordId?: string;
  createdRecordRef?: string;
  // EWO-032R.8: Governed EWO created by the wizard
  createdEwoId?: string;
  createdEwoRef?: string;
  ewoPromotionStatus?: 'pending' | 'complete' | 'skipped' | 'failed';
  ewoPromotionError?: string;
  executionError?: string;
  // EWO-011.1: Similarity Review
  similarityResults?: SimilarityResult[];
  similarityDecision?: SimilarityDecision;
  similarityLinkedRefs?: string[];
  similaritySearchDone?: boolean;
}

// ─── Config maps ──────────────────────────────────────────────────────────────

export const IDEA_STATUS_CFG: Record<IdeaStatus, { label: string; bg: string; text: string; dot: string }> = {
  draft:                 { label: 'Draft',             bg: 'bg-slate-50',    text: 'text-slate-600',   dot: 'bg-slate-400'    },
  active:                { label: 'Active',            bg: 'bg-blue-50',     text: 'text-blue-700',    dot: 'bg-blue-500'     },
  queued_for_promotion:  { label: 'Queued — Promote',  bg: 'bg-amber-50',    text: 'text-amber-700',   dot: 'bg-amber-500'    },
  promoted:              { label: 'Promoted to EWO',   bg: 'bg-emerald-50',  text: 'text-emerald-700', dot: 'bg-emerald-500'  },
  archived:              { label: 'Archived',          bg: 'bg-slate-100',   text: 'text-slate-500',   dot: 'bg-slate-300'    },
  superseded:            { label: 'Superseded',        bg: 'bg-slate-50',    text: 'text-slate-400',   dot: 'bg-slate-300'    },
};

export const IDEA_PRIORITY_CFG: Record<IdeaPriority, { label: string; dot: string; text: string }> = {
  critical: { label: 'Critical', dot: 'bg-red-500',    text: 'text-red-700'    },
  high:     { label: 'High',     dot: 'bg-orange-500', text: 'text-orange-700' },
  medium:   { label: 'Medium',   dot: 'bg-amber-500',  text: 'text-amber-700'  },
  low:      { label: 'Low',      dot: 'bg-slate-400',  text: 'text-slate-500'  },
};

export const IDEA_CATEGORY_CFG: Record<IdeaCategory, { label: string; colour: string }> = {
  general:        { label: 'General',        colour: 'slate'  },
  feature:        { label: 'Feature',        colour: 'blue'   },
  improvement:    { label: 'Improvement',    colour: 'cyan'   },
  technical_debt: { label: 'Technical Debt', colour: 'amber'  },
  architecture:   { label: 'Architecture',   colour: 'indigo' },
  security:       { label: 'Security',       colour: 'red'    },
  performance:    { label: 'Performance',    colour: 'orange' },
  ux:             { label: 'UX',             colour: 'violet' },
  integration:    { label: 'Integration',    colour: 'teal'   },
  infrastructure: { label: 'Infrastructure', colour: 'slate'  },
  research:       { label: 'Research',       colour: 'purple' },
};

export const WIZARD_STEPS: { key: WizardStep; label: string; description: string }[] = [
  { key: 'intent',     label: 'Engineering Intent',    description: 'Define the why and business driver'  },
  { key: 'objective',  label: 'Engineering Objective', description: 'Define measurable success criteria'  },
  { key: 'strategy',   label: 'Execution Strategy',    description: 'Select approach and constraints'    },
  { key: 'context',    label: 'Execution Context',     description: 'Confirm environment and context'    },
  { key: 'agent',      label: 'Engineering Agent',     description: 'Select the execution agent'         },
  { key: 'review',     label: 'Review',                description: 'Review all fields and confirm idea' },
  { key: 'similarity', label: 'Similarity Review',     description: 'Check for similar engineering objects' },
];

// ─── Execution pipeline display (Phase 8) ────────────────────────────────────

export interface ExecutionPipelineStage {
  key: string;
  label: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  record_ref?: string;
}

export const DEFAULT_PIPELINE: ExecutionPipelineStage[] = [
  { key: 'intent',      label: 'Engineering Intent',       status: 'pending' },
  { key: 'objective',   label: 'Engineering Objective',    status: 'pending' },
  { key: 'strategy',    label: 'Execution Strategy',       status: 'pending' },
  { key: 'session',     label: 'Execution Session',        status: 'pending' },
  { key: 'memory_pre',  label: 'Memory Snapshot (Pre)',    status: 'pending' },
  { key: 'idea',        label: 'Engineering Idea',         status: 'pending' },
  { key: 'evidence',    label: 'Execution Evidence',       status: 'pending' },
  { key: 'record',      label: 'Engineering Record',       status: 'pending' },
  { key: 'memory_post', label: 'Memory Update (Post)',    status: 'pending' },
  { key: 'ewo_promote', label: 'Governed Work Order',      status: 'pending' },
  { key: 'complete',    label: 'Session Complete',         status: 'pending' },
];

// Default values for wizard forms
export const INITIAL_WIZARD_STATE: WizardState = {
  step: 'intent',
  intent: {
    title: '',
    description: '',
    business_driver: '',
    priority: 'medium',
    programme: 'EIOS',
  },
  objective: {
    title: '',
    description: '',
    success_metrics: [''],
  },
  strategy: {
    strategy_type: 'incremental',
    approach: '',
    success_criteria: [''],
  },
  idea: {
    title: '',
    description: '',
    category: 'general',
    priority: 'medium',
    tags: [],
    products: ['EIOS Platform'],
    applications: ['EIOS Engineering Control Centre'],
  },
  contextRef: 'CTX-EIOS-001',
  agentRef: 'EIOS-AGENT-001',
  ewoPromotionStatus: 'pending',
};
