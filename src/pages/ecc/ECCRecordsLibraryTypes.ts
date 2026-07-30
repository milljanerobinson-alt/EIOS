// ─── Shared types for Engineering Records Library ─────────────────────────────

export interface EngineeringObjective {
  original_objective?: string;
  business_outcome?: string;
  scope?: string;
}

export interface ImplementationSummary {
  executive_summary?: string;
  files_created?: string[];
  files_modified?: string[];
  files_removed?: string[];
  database_changes?: string[];
  dependencies?: string[];
  configuration_changes?: string[];
}

export interface ValidationSummary {
  build_result?: string;
  test_result?: string;
  guardian_result?: string;
  constitutional_validation?: string;
  known_limitations?: string[];
}

export interface POAcceptanceDetail {
  accepted_by?: string;
  acceptance_date?: string;
  acceptance_statement?: string;
  acceptance_conditions?: string;
}

export interface EngineeringKnowledge {
  lessons_learned?: string[];
  architectural_decisions?: string[];
  engineering_patterns?: string[];
  reusable_components?: string[];
  risks_identified?: string[];
  future_recommendations?: string[];
}

export interface RecordRelationships {
  related_features?: string[];
  related_releases?: string[];
  related_standards?: string[];
  related_constitutional_decisions?: string[];
  related_engineering_records?: string[];
  related_ewos?: string[];
}

export interface SemanticMetadata {
  keywords?: string[];
  engineering_domains?: string[];
  subsystems?: string[];
  components?: string[];
  products?: string[];
  applications?: string[];
  platform_services?: string[];
  engineering_disciplines?: string[];
}

export interface EngineeringRecord {
  id: string;
  record_ref: string;
  record_type: string;
  title: string;
  programme: string;
  ewo_id: string | null;
  ewo_ref: string | null;
  release_ref: string | null;
  status: string;
  authority_state: string | null;
  supersedes_record_id: string | null;
  correction_reason: string | null;
  correcting_authority: string | null;
  correction_timestamp: string | null;
  source_evidence: string | null;
  completion_date: string | null;
  content: Record<string, unknown>;
  pdf_filename: string | null;
  linked_releases: string[] | null;
  linked_standards: string[] | null;
  version_number: number;
  record_version: number;
  generated_by: string | null;
  archived_at: string | null;
  created_at: string;
  po_accepted_at: string | null;
  po_accepted_by: string | null;
  po_acceptance_statement: string | null;
  // Structured sections
  engineering_objective: EngineeringObjective | null;
  implementation_summary: ImplementationSummary | null;
  validation_summary: ValidationSummary | null;
  po_acceptance_detail: POAcceptanceDetail | null;
  engineering_knowledge: EngineeringKnowledge | null;
  relationships: RecordRelationships | null;
  attachments: Record<string, unknown> | null;
  semantic_metadata: SemanticMetadata | null;
  atd_handoff: Record<string, unknown> | null;
  atd_handoff_received_at: string | null;
  engineering_memory_extracted: boolean;
  change_log_entry_id: string | null;
  // Governance (EWO-011.3)
  governance_status: string | null;
  knowledge_extracted: boolean;
  lineage_established: boolean;
  exports_generated: boolean;
  is_backfill: boolean;
  completion_report_ref: string | null;
  engineering_object_refs: string[] | null;
  export_urls: Record<string, string> | null;
  // Enrichment
  complexity: string | null;
  estimated_effort: string | null;
  risk_rating: string | null;
  confidence: string | null;
  platform_services_affected: string[] | null;
  applications_affected: string[] | null;
  subsystems_affected: string[] | null;
  technologies: string[] | null;
  engineering_disciplines: string[] | null;
  primary_engineer: string | null;
  product_owner: string | null;
}

export interface MemoryEntry {
  id: string;
  record_id: string;
  record_ref: string;
  knowledge_category: string;
  knowledge_domain: string | null;
  title: string;
  content: string;
  source_section: string | null;
  tags: string[];
  authority_state: string;
  created_at: string;
}

export interface LineageEntry {
  id: string;
  from_record_id: string;
  from_record_ref: string;
  to_ref: string;
  relationship_type: string;
  notes: string | null;
  created_at: string;
}

export type SortKey = 'completion_date' | 'record_ref' | 'title' | 'record_type';
export type SortDir = 'asc' | 'desc';
export type ActiveTab = 'overview' | 'records' | 'memory' | 'lineage' | 'timeline';

// ─── Config maps ──────────────────────────────────────────────────────────────

export const TYPE_CFG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  completion_report:       { label: 'Completion Report',       bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  constitutional_document: { label: 'Constitutional Document',  bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200'    },
  release_note:            { label: 'Release Note',             bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200'    },
  decision_record:         { label: 'Decision Record',          bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200'   },
};

export const AUTHORITY_CFG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  authoritative:     { label: 'Authoritative',    bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-300' },
  provisional:       { label: 'Provisional',       bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-300'   },
  non_authoritative: { label: 'Non-Authoritative', bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200'     },
  superseded:        { label: 'Superseded',        bg: 'bg-slate-100',  text: 'text-slate-500',   border: 'border-slate-200'   },
};

export const MEMORY_CATEGORY_CFG: Record<string, { label: string; colour: string }> = {
  architecture:             { label: 'Architecture',            colour: 'blue'   },
  pattern:                  { label: 'Pattern',                 colour: 'violet' },
  lesson_learned:           { label: 'Lesson Learned',          colour: 'amber'  },
  anti_pattern:             { label: 'Anti-Pattern',            colour: 'red'    },
  reusable_component:       { label: 'Reusable Component',      colour: 'teal'   },
  known_risk:               { label: 'Known Risk',              colour: 'orange' },
  implementation_strategy:  { label: 'Implementation Strategy', colour: 'green'  },
  validation_outcome:       { label: 'Validation Outcome',      colour: 'emerald'},
  engineering_decision:     { label: 'Engineering Decision',    colour: 'slate'  },
};

export const KNOWLEDGE_DOMAINS = [
  'architecture', 'security', 'performance', 'testing',
  'compliance', 'operations', 'ux', 'ai', 'data',
  'platform', 'infrastructure', 'quality-assurance',
  'frontend', 'platform-governance', 'constitutional-engineering',
  'integration', 'engineering-records', 'engineering-review',
];

export const LINEAGE_TYPE_CFG: Record<string, { label: string; colour: string }> = {
  supersedes:                       { label: 'Supersedes',                colour: 'rose'   },
  superseded_by:                    { label: 'Superseded By',             colour: 'slate'  },
  related_record:                   { label: 'Related Record',            colour: 'blue'   },
  related_ewo:                      { label: 'Related EWO',               colour: 'indigo' },
  related_feature:                  { label: 'Related Feature',           colour: 'violet' },
  related_release:                  { label: 'Related Release',           colour: 'cyan'   },
  related_standard:                 { label: 'Related Standard',          colour: 'teal'   },
  related_constitutional_amendment: { label: 'Constitutional Amendment',  colour: 'rose'   },
  related_decision:                 { label: 'Related Decision',          colour: 'amber'  },
  related_test_plan:                { label: 'Related Test Plan',         colour: 'green'  },
  related_risk:                     { label: 'Related Risk',              colour: 'orange' },
  related_architecture_decision:    { label: 'Architecture Decision',     colour: 'blue'   },
  related_roadmap_item:             { label: 'Related Roadmap Item',      colour: 'purple' },
  parent:                           { label: 'Parent Record',             colour: 'sky'    },
  child:                            { label: 'Child Record',              colour: 'cyan'   },
  sibling:                          { label: 'Sibling Record',            colour: 'teal'   },
  depends_on:                       { label: 'Depends On',                colour: 'violet' },
  introduced_by:                    { label: 'Introduced By',             colour: 'amber'  },
  resolved_by:                      { label: 'Resolved By',               colour: 'green'  },
};
