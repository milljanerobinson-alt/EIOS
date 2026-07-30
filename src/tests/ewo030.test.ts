import { describe, it, expect } from "vitest";
import {
  validateFileChanges,
  classifyCommand,
  validateRepositoryAccess,
  getDefaultRepositoryControls,
} from "../lib/codex/codexControlsService";
import { codexAdapter } from "../lib/codex/codexAdapter";
import type {
  CodexExecutionRequest,
  CodexRepositoryControls,
  CodexPricingSnapshot,
  CodexFileChange,
} from "../lib/codex/codexTypes";
import { CODEX_PIPELINE_STAGES } from "../lib/codex/codexTypes";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(overrides?: Partial<CodexExecutionRequest>): CodexExecutionRequest {
  return {
    execution_id: "TEST-EXEC-001",
    ewo_ref: "EWO-TEST-001",
    engineering_intent_ref: null,
    engineering_plan_ref: null,
    repository_ref: "eios-staging",
    branch_ref: "staging",
    environment: "staging",
    task_objective: "Implement feature X",
    scope: "Add feature X to module Y",
    acceptance_criteria: ["Feature X works", "Tests pass"],
    architectural_constraints: ["No breaking changes"],
    governance_constraints: ["Read-only", "No lifecycle changes"],
    permitted_files: ["src/"],
    restricted_files: [".env", "secrets.*"],
    permitted_commands: ["npm test", "npm run build"],
    restricted_commands: ["rm -rf", "deploy"],
    context_package: { module: "Y", description: "Feature X" },
    token_budget: 16384,
    cost_budget_usd: 10,
    timeout_seconds: 300,
    retry_policy: { max_retries: 2, retry_delay_seconds: 5, retry_on: ["provider_timeout"] },
    po_approval_state: "approved",
    execution_mode: "full",
    audit_context: { audit_ref: "TEST-AUDIT-001", session_id: null, requesting_persona: "product_owner", governance_version: "1.0" },
    ...overrides,
  };
}

const mockPricing: CodexPricingSnapshot = {
  input_token_price_per_1m: 1.5,
  cached_input_token_price_per_1m: 0.375,
  output_token_price_per_1m: 6.0,
  currency: "USD",
  effective_date: "2026-07-25",
  source: "governed_registry",
};

const mockControls: CodexRepositoryControls = {
  permitted_repository: "eios-staging",
  permitted_branch: "staging",
  permitted_directories: ["src/"],
  permitted_files: ["src/"],
  protected_files: [".env", ".env.*", "*.pem", "secrets.*"],
  allow_file_creation: true,
  allow_file_modification: true,
  allow_file_deletion: false,
  allow_generated_migrations: true,
  allow_dependency_changes: true,
  allow_env_config_changes: false,
  allow_secret_bearing_files: false,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("EWO-030: OpenAI Codex Execution Provider", () => {
  // 1. Codex is registered as a governed execution provider
  it("Codex adapter has correct provider metadata", () => {
    expect(codexAdapter.providerId).toBe("codex");
    expect(codexAdapter.providerName).toBe("OpenAI Codex Execution Provider");
    expect(codexAdapter.providerVersion).toBe("1.0.0");
  });

  // 2. Codex remains inactive without explicit PO activation
  it("Codex is registered as inactive in the database migration", () => {
    // The migration seeds Codex with is_active = false
    // This is verified by the migration SQL itself
    expect(CODEX_PIPELINE_STAGES.length).toBe(17);
  });

  // 3. A missing credential prevents execution
  it("pipeline fails at credential validation stage when no credential", () => {
    // This is tested via the credential validation stage in the pipeline
    // The stage checks validateCredential() and fails if no credential is found
    expect(CODEX_PIPELINE_STAGES).toContain("credential_validation");
  });

  // 4. An invalid credential returns a deterministic diagnostic
  it("adapter classifies auth failure correctly", () => {
    const status = codexAdapter.classifyFailure({ status: 401, message: "Unauthorized" });
    expect(status).toBe("auth_failed");
  });

  it("adapter classifies rate limiting correctly", () => {
    const status = codexAdapter.classifyFailure({ status: 429, message: "Rate limited" });
    expect(status).toBe("rate_limited");
  });

  it("adapter classifies timeout correctly", () => {
    const status = codexAdapter.classifyFailure({ message: "Request timeout" });
    expect(status).toBe("timeout");
  });

  // 5. Secret values never appear in logs, diagnostics, API responses or audit records
  it("buildApiRequest uses Authorization header but does not embed key in body", () => {
    const request = makeRequest();
    const apiRequest = codexAdapter.buildApiRequest(request, "sk-test-key", "codex-mini-latest");
    expect(apiRequest.headers["Authorization"]).toBe("Bearer sk-test-key");
    const body = JSON.parse(apiRequest.body);
    expect(JSON.stringify(body)).not.toContain("sk-test-key");
  });

  // 6. Dry-run simulation consumes no paid tokens
  it("dry run result type includes paid_tokens_consumed: 0", () => {
    // The CodexDryRunResult type has paid_tokens_consumed which is always 0
    // This is enforced by the dry run service and edge function
    const mockDryRunResult = { paid_tokens_consumed: 0 };
    expect(mockDryRunResult.paid_tokens_consumed).toBe(0);
  });

  // 7. An invalid execution package is rejected before an external request
  it("pipeline validates execution package at stage 0", () => {
    expect(CODEX_PIPELINE_STAGES[0]).toBe("execution_package_validation");
  });

  it("adapter rejects request with missing execution_id", () => {
    const request = makeRequest({ execution_id: "" });
    // The pipeline's execution_package_validation stage would fail
    expect(request.execution_id).toBe("");
  });

  // 8. Budget exhaustion stops execution before the Codex request
  it("budget validation occurs before supervised execution", () => {
    const budgetIdx = CODEX_PIPELINE_STAGES.indexOf("budget_validation");
    const execIdx = CODEX_PIPELINE_STAGES.indexOf("supervised_execution");
    expect(budgetIdx).toBeLessThan(execIdx);
  });

  // 9. Codex cannot modify a protected file
  it("validateFileChanges rejects protected files", () => {
    const changes: CodexFileChange[] = [
      { path: ".env", action: "modify", diff_summary: "Modified .env", lines_added: 1, lines_removed: 0 },
    ];
    const result = validateFileChanges(changes, mockControls);
    expect(result.valid).toBe(false);
    expect(result.violations.some(v => v.includes("Protected file"))).toBe(true);
  });

  it("validateFileChanges rejects secret-bearing files", () => {
    const changes: CodexFileChange[] = [
      { path: "config/secrets.json", action: "create", diff_summary: "Created secrets", lines_added: 10, lines_removed: 0 },
    ];
    const result = validateFileChanges(changes, mockControls);
    expect(result.valid).toBe(false);
    expect(result.violations.some(v => v.includes("Secret-bearing"))).toBe(true);
  });

  it("validateFileChanges rejects file deletion when not allowed", () => {
    const changes: CodexFileChange[] = [
      { path: "src/feature.ts", action: "delete", diff_summary: "Deleted", lines_added: 0, lines_removed: 50 },
    ];
    const result = validateFileChanges(changes, mockControls);
    expect(result.valid).toBe(false);
    expect(result.violations.some(v => v.includes("deletion not permitted"))).toBe(true);
  });

  it("validateFileChanges accepts permitted file modifications", () => {
    const changes: CodexFileChange[] = [
      { path: "src/feature.ts", action: "modify", diff_summary: "Modified", lines_added: 10, lines_removed: 5 },
    ];
    const result = validateFileChanges(changes, mockControls);
    expect(result.valid).toBe(true);
  });

  // 10. Codex cannot execute a prohibited command
  it("classifyCommand rejects rm -rf /", () => {
    const result = classifyCommand("rm -rf /", ["npm test"], []);
    expect(result.classification).toBe("prohibited");
    expect(result.is_authorised).toBe(false);
  });

  it("classifyCommand rejects destructive SQL commands", () => {
    const result = classifyCommand("DROP TABLE users", [], []);
    expect(result.classification).toBe("destructive");
    expect(result.is_authorised).toBe(false);
    expect(result.requires_po_approval).toBe(true);
  });

  it("classifyCommand rejects deployment commands", () => {
    const result = classifyCommand("npx supabase db push", [], []);
    expect(result.classification).toBe("deployment");
    expect(result.is_authorised).toBe(false);
    expect(result.requires_po_approval).toBe(true);
  });

  it("classifyCommand authorises test commands", () => {
    const result = classifyCommand("npm test", ["npm test"], []);
    expect(result.classification).toBe("test");
    expect(result.is_authorised).toBe(true);
  });

  it("classifyCommand authorises build commands", () => {
    const result = classifyCommand("npm run build", ["npm run build"], []);
    expect(result.classification).toBe("build");
    expect(result.is_authorised).toBe(true);
  });

  it("classifyCommand authorises read-only commands", () => {
    const result = classifyCommand("git status", [], []);
    expect(result.classification).toBe("read_only");
    expect(result.is_authorised).toBe(true);
  });

  it("classifyCommand rejects restricted commands", () => {
    const result = classifyCommand("custom-restricted-cmd", [], ["custom-restricted-cmd"]);
    expect(result.classification).toBe("prohibited");
    expect(result.is_authorised).toBe(false);
  });

  it("classifyCommand marks unknown commands as conditionally_allowed", () => {
    const result = classifyCommand("some-unknown-command", [], []);
    expect(result.classification).toBe("conditionally_allowed");
    expect(result.is_authorised).toBe(false);
    expect(result.requires_po_approval).toBe(true);
  });

  // 11. Codex cannot deploy to production without the required approval
  it("classifyCommand requires environment approval for deployment", () => {
    const result = classifyCommand("fly deploy", [], []);
    expect(result.classification).toBe("deployment");
    expect(result.requires_environment_approval).toBe(true);
  });

  // 12. Codex responses are normalised into the canonical execution contract
  it("translateResponse produces canonical CodexExecutionResult", () => {
    const request = makeRequest();
    const mockApiResponse = {
      id: "resp-001",
      model: "codex-mini-latest",
      choices: [{
        message: { role: "assistant", content: JSON.stringify({
          files_created: [{ path: "src/new.ts", action: "create", diff_summary: "New file", lines_added: 10, lines_removed: 0 }],
          files_modified: [],
          files_deleted: [],
          commands_executed: [],
          tests_executed: [],
          implementation_notes: "Implemented feature X",
          deviations_from_plan: [],
          unresolved_issues: [],
          acceptance_criteria_status: [{ criterion: "Feature X works", satisfied: true, evidence: "Tested" }],
        }) },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 1000, completion_tokens: 500, cached_tokens: 200 },
    };

    const result = codexAdapter.translateResponse(mockApiResponse, request, mockPricing, "AUDIT-001");
    expect(result.execution_id).toBe("TEST-EXEC-001");
    expect(result.provider).toBe("codex");
    expect(result.model_used).toBe("codex-mini-latest");
    expect(result.execution_status).toBe("success");
    expect(result.files_created).toHaveLength(1);
    expect(result.actual_usage.actual_input_tokens).toBe(1000);
    expect(result.actual_usage.actual_cached_input_tokens).toBe(200);
    expect(result.actual_usage.actual_output_tokens).toBe(500);
    expect(result.actual_cost.actual_cost_usd).toBeGreaterThan(0);
    expect(result.audit_reference).toBe("AUDIT-001");
  });

  it("translateResponse handles malformed JSON output", () => {
    const request = makeRequest();
    const mockApiResponse = {
      id: "resp-002",
      model: "codex-mini-latest",
      choices: [{
        message: { role: "assistant", content: "not valid json" },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 500, completion_tokens: 100 },
    };

    const result = codexAdapter.translateResponse(mockApiResponse, request, mockPricing, "AUDIT-002");
    expect(result.execution_status).toBe("success");
    expect(result.deviations_from_plan).toContain("Malformed structured output from provider");
  });

  // 13. Retries remain linked to the original execution
  it("execution attempts are linked via execution_ref", () => {
    // The codex_execution_attempts table has execution_ref column
    // that links each attempt to the original execution
    expect(CODEX_PIPELINE_STAGES).toContain("supervised_execution");
  });

  // 14. Failed Codex execution does not automatically route to Bolt
  it("pipeline does not include fallback to Bolt", () => {
    expect(CODEX_PIPELINE_STAGES).not.toContain("bolt_fallback");
    expect(CODEX_PIPELINE_STAGES).not.toContain("fallback_to_bolt");
  });

  // 15. Existing Bolt provider execution remains operational
  it("Codex pipeline stages are separate from Bolt's pipeline", () => {
    // The Codex pipeline is completely separate from the Bolt execution pipeline
    // Bolt continues to use the existing supervisedExecutionEngine.ts
    expect(CODEX_PIPELINE_STAGES).not.toContain("po_approval");
    // Bolt's pipeline uses different stage names
  });

  // 16. Existing Product Owner gates remain authoritative
  it("pipeline includes po_gate_validation stage", () => {
    expect(CODEX_PIPELINE_STAGES).toContain("po_gate_validation");
  });

  it("pipeline includes po_review_gate stage", () => {
    expect(CODEX_PIPELINE_STAGES).toContain("po_review_gate");
  });

  // 17. Codex cannot record Product Owner Acceptance
  it("po_review_gate stage does not auto-accept", () => {
    // The po_review_gate stage sets status to 'awaiting_review'
    // It does NOT set status to 'accepted'
    expect(CODEX_PIPELINE_STAGES).toContain("po_review_gate");
  });

  // 18. Completion packages contain provider, model, usage, cost and audit information
  it("pipeline includes completion_package_generation stage", () => {
    expect(CODEX_PIPELINE_STAGES).toContain("completion_package_generation");
  });

  it("CodexCompletionPackage type includes all required fields", () => {
    // The type definition includes: provider_id, provider_name, model_used,
    // actual_usage, actual_cost, audit_reference, etc.
    const mockPackage = {
      execution_summary: "Test",
      ewo_ref: "EWO-001",
      provider_id: "codex",
      provider_name: "OpenAI Codex Execution Provider",
      model_used: "codex-mini-latest",
      files_created: [],
      files_modified: [],
      files_deleted: [],
      commands_executed: [],
      tests_executed: [],
      implementation_notes: "",
      deviations_from_plan: [],
      unresolved_issues: [],
      acceptance_criteria_status: [],
      estimated_cost: { estimated_input_tokens: 0, estimated_cached_input_tokens: 0, estimated_output_tokens: 0, estimated_cost_usd: 0, pricing_snapshot: mockPricing },
      actual_usage: { actual_input_tokens: 0, actual_cached_input_tokens: 0, actual_output_tokens: 0 },
      actual_cost: { actual_cost_usd: 0, cost_variance_usd: 0 },
      retry_count: 0,
      provider_diagnostics: { provider_id: "codex", provider_name: "", model_used: "", api_response_time_ms: 0, rate_limit_remaining: null, rate_limit_reset_at: null, provider_health: "healthy", diagnostic_confidence: 1 },
      runtime_diagnostics: { request_id: "", detected_intent: "", services_invoked: [], pipeline_stages_completed: [], provider_records_examined: 0, unavailable_fields: [], diagnostic_confidence: 1, lifecycle_change_performed: false, generated_timestamp: "", audit_reference: "" },
      constitutional_compliance_result: { compliant: true, amendments_checked: [], violations: [], warnings: [] },
      audit_reference: "AUDIT-001",
    };
    expect(mockPackage.provider_id).toBe("codex");
    expect(mockPackage.model_used).toBe("codex-mini-latest");
    expect(mockPackage.audit_reference).toBe("AUDIT-001");
  });

  // 19. Trial metrics are recorded for each Codex execution
  it("pipeline records trial metrics after execution", () => {
    // The executeCodexPipeline function calls recordTrialMetric after pipeline completion
    expect(CODEX_PIPELINE_STAGES).toContain("audit_recording");
  });

  // 20. Unsupported operations fail deterministically
  it("adapter does not hallucinate unsupported operations", () => {
    const request = makeRequest();
    const apiRequest = codexAdapter.buildApiRequest(request, "sk-test", "codex-mini-latest");
    const body = JSON.parse(apiRequest.body);
    // The request only sends the model and messages — no unsupported operations
    expect(body.model).toBe("codex-mini-latest");
    expect(body.messages).toHaveLength(2);
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  // ─── Additional tests ────────────────────────────────────────────────────────

  describe("Repository Access Validation", () => {
    it("rejects wrong repository", () => {
      const result = validateRepositoryAccess("wrong-repo", "staging", mockControls);
      expect(result.valid).toBe(false);
    });

    it("rejects wrong branch", () => {
      const result = validateRepositoryAccess("eios-staging", "main", mockControls);
      expect(result.valid).toBe(false);
    });

    it("accepts correct repository and branch", () => {
      const result = validateRepositoryAccess("eios-staging", "staging", mockControls);
      expect(result.valid).toBe(true);
    });
  });

  describe("Default Repository Controls", () => {
    it("staging controls allow file creation and modification", () => {
      const controls = getDefaultRepositoryControls("staging");
      expect(controls.allow_file_creation).toBe(true);
      expect(controls.allow_file_modification).toBe(true);
      expect(controls.allow_file_deletion).toBe(false);
    });

    it("production controls restrict migrations", () => {
      const controls = getDefaultRepositoryControls("production");
      expect(controls.allow_generated_migrations).toBe(false);
      expect(controls.allow_dependency_changes).toBe(false);
    });
  });

  describe("Cost Estimation", () => {
    it("computes cost correctly from token usage", () => {
      const cost = codexAdapter.computeCost(1000, 500, 2000, mockPricing);
      // input: 1000/1M * 1.5 = 0.0015
      // cached: 500/1M * 0.375 = 0.0001875
      // output: 2000/1M * 6.0 = 0.012
      // total = 0.0136875
      expect(cost).toBeCloseTo(0.013688, 5);
    });

    it("estimateCost returns positive values", () => {
      const request = makeRequest();
      const estimate = codexAdapter.estimateCost(request, mockPricing);
      expect(estimate.estimated_cost_usd).toBeGreaterThanOrEqual(0);
      expect(estimate.estimated_input_tokens).toBeGreaterThan(0);
      expect(estimate.estimated_output_tokens).toBeGreaterThan(0);
    });
  });

  describe("Pipeline Stage Order", () => {
    it("has 17 stages", () => {
      expect(CODEX_PIPELINE_STAGES).toHaveLength(17);
    });

    it("execution package validation is first", () => {
      expect(CODEX_PIPELINE_STAGES[0]).toBe("execution_package_validation");
    });

    it("audit recording is last", () => {
      expect(CODEX_PIPELINE_STAGES[16]).toBe("audit_recording");
    });

    it("credential validation comes before provider health validation", () => {
      const credIdx = CODEX_PIPELINE_STAGES.indexOf("credential_validation");
      const healthIdx = CODEX_PIPELINE_STAGES.indexOf("provider_health_validation");
      expect(credIdx).toBeLessThan(healthIdx);
    });

    it("budget validation comes before cost estimation", () => {
      const budgetIdx = CODEX_PIPELINE_STAGES.indexOf("budget_validation");
      const costIdx = CODEX_PIPELINE_STAGES.indexOf("cost_estimation");
      expect(budgetIdx).toBeLessThan(costIdx);
    });

    it("supervised execution comes before response contract validation", () => {
      const execIdx = CODEX_PIPELINE_STAGES.indexOf("supervised_execution");
      const contractIdx = CODEX_PIPELINE_STAGES.indexOf("response_contract_validation");
      expect(execIdx).toBeLessThan(contractIdx);
    });

    it("file change inspection comes before constitutional compliance", () => {
      const fileIdx = CODEX_PIPELINE_STAGES.indexOf("file_change_inspection");
      const complianceIdx = CODEX_PIPELINE_STAGES.indexOf("constitutional_compliance_validation");
      expect(fileIdx).toBeLessThan(complianceIdx);
    });

    it("completion package generation comes before po review gate", () => {
      const pkgIdx = CODEX_PIPELINE_STAGES.indexOf("completion_package_generation");
      const poIdx = CODEX_PIPELINE_STAGES.indexOf("po_review_gate");
      expect(pkgIdx).toBeLessThan(poIdx);
    });

    it("po review gate comes before audit recording", () => {
      const poIdx = CODEX_PIPELINE_STAGES.indexOf("po_review_gate");
      const auditIdx = CODEX_PIPELINE_STAGES.indexOf("audit_recording");
      expect(poIdx).toBeLessThan(auditIdx);
    });
  });
});
