/*
# Engineering Standards v1.0 — Seed Data

Populates Engineering Standards v1.0 with 71 standards across 12 categories.
Runs only if version 1.0 has not already been seeded (idempotent).

## Categories and counts
- Architecture (6)
- Database (8)
- Backend (6)
- Frontend (7)
- Security (6)
- Performance (6)
- Testing (4)
- Documentation (6)
- AI Collaboration (6)
- Code Quality (6)
- Release Management (6)
- Operations (4)

## Also seeds
- ecc_standards_versions: v1.0 record
- ecc_standards_changelog: initial release entry
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ecc_standards_versions WHERE version_number = '1.0') THEN

    INSERT INTO ecc_standards_versions (version_number, status, author, release_notes, released_at)
    VALUES (
      '1.0', 'current', 'Engineering',
      'Initial Engineering Standards — establishes the baseline development rules for all EOC and LLN+D work.',
      now()
    );

    INSERT INTO ecc_engineering_standards
      (category, title, body, sort_order, tags, version_introduced)
    VALUES
      -- Architecture
      ('Architecture', 'Preserve Backwards Compatibility',
       'All changes must preserve backwards compatibility with existing data, APIs, and workflows. Breaking changes require an approved Architecture Decision Record (ADR).',
       1, '{architecture,compatibility,breaking-change}', '1.0'),

      ('Architecture', 'Favour Simplicity Over Complexity',
       'Prefer the simplest solution that meets requirements. Avoid over-engineered patterns and unnecessary abstractions that add maintenance burden without adding value.',
       2, '{architecture,simplicity,design}', '1.0'),

      ('Architecture', 'Extend Before Creating',
       'Before building a new component, utility, or module, check whether an existing one can be extended or reused. Duplication creates drift and hidden bugs.',
       3, '{architecture,reuse,duplication}', '1.0'),

      ('Architecture', 'Eliminate Duplication',
       'Shared logic belongs in shared utilities or components. When the same logic appears in two places, one change will eventually be missed.',
       4, '{architecture,quality,duplication}', '1.0'),

      ('Architecture', 'Separate Responsibilities',
       'Each module, component, and function should have one clear purpose. Code that changes for multiple unrelated reasons is harder to maintain and test.',
       5, '{architecture,design,responsibility}', '1.0'),

      ('Architecture', 'Document Architectural Decisions as ADRs',
       'Significant architectural decisions must be recorded as Architecture Decision Records in the EOC, including the context, options considered, decision made, and consequences.',
       6, '{architecture,documentation,adr}', '1.0'),

      -- Database
      ('Database', 'Use Migrations for All Schema Changes',
       'Every database change must be delivered as a versioned SQL migration file. Never modify the database schema manually in production.',
       1, '{database,migrations,schema}', '1.0'),

      ('Database', 'Preserve Existing Data in Migrations',
       'Migrations must not delete or overwrite existing user data unless explicitly approved. New columns must be nullable or have safe defaults.',
       2, '{database,data-safety,migrations}', '1.0'),

      ('Database', 'Ensure Migrations Are Safe to Deploy',
       'Each migration must be idempotent where possible. Use IF NOT EXISTS or IF EXISTS guards. Test migrations before applying to production.',
       3, '{database,migrations,safety}', '1.0'),

      ('Database', 'Avoid Destructive Operations Without Approval',
       'DROP TABLE, DROP COLUMN, and bulk DELETE operations require explicit approval. When in doubt, archive rather than delete.',
       4, '{database,safety,destructive}', '1.0'),

      ('Database', 'Use Indexes Where Appropriate',
       'Add database indexes on columns used in WHERE clauses, JOIN conditions, and ORDER BY expressions. Index foreign keys used in regular queries.',
       5, '{database,performance,indexes}', '1.0'),

      ('Database', 'Avoid Unnecessary Full-Table Scans',
       'Ensure queries targeting large tables use indexed columns. Full-table scans on tables with significant data will degrade performance as the dataset grows.',
       6, '{database,performance,queries}', '1.0'),

      ('Database', 'Use Transactions Where Appropriate',
       'Operations that must succeed or fail as a unit should be wrapped in transactions to prevent partial state.',
       7, '{database,transactions,consistency}', '1.0'),

      ('Database', 'Plan Rollback for Every Migration',
       'Consider how each migration can be reversed if it causes issues. Document rollback steps for non-trivial changes.',
       8, '{database,migrations,rollback}', '1.0'),

      -- Backend
      ('Backend', 'Handle Errors Gracefully',
       'All edge functions must handle errors and return meaningful HTTP status codes. Unhandled exceptions must not leak internal details to clients.',
       1, '{backend,errors,edge-functions}', '1.0'),

      ('Backend', 'Use Explicit Timeout Handling',
       'Functions that call external APIs or perform long operations must implement timeout handling. Never allow a function to hang indefinitely.',
       2, '{backend,timeouts,edge-functions}', '1.0'),

      ('Backend', 'Avoid Silent Failures',
       'Functions must not return success responses when work has silently failed. If an operation fails, the response must reflect that failure clearly.',
       3, '{backend,errors,reliability}', '1.0'),

      ('Backend', 'Log Meaningful Errors',
       'Log errors with sufficient context to diagnose the issue: the operation attempted, relevant inputs (redacted if sensitive), and the error message.',
       4, '{backend,logging,observability}', '1.0'),

      ('Backend', 'Return Consistent Response Formats',
       'All edge functions must return JSON responses with a consistent structure, including a success indicator and error message fields.',
       5, '{backend,api,consistency}', '1.0'),

      ('Backend', 'Avoid Duplicated Logic Across Functions',
       'Shared behaviour such as secret resolution, auth checks, or queue writes must be centralised. Do not copy the same logic into multiple functions.',
       6, '{backend,duplication,edge-functions}', '1.0'),

      -- Frontend
      ('Frontend', 'Maintain Consistent Design Language',
       'All UI components must follow the established visual system: spacing, typography, colour palette, and component patterns. Deviations require justification.',
       1, '{frontend,design,consistency}', '1.0'),

      ('Frontend', 'Use Shared Components',
       'Build new interfaces using existing shared components. Do not duplicate UI patterns. If a new pattern is needed, build a shared component.',
       2, '{frontend,components,reuse}', '1.0'),

      ('Frontend', 'Provide Loading States for All Async Operations',
       'Every operation that fetches data or performs async work must show a loading indicator. Users must never see a blank or stale screen without context.',
       3, '{frontend,ux,loading}', '1.0'),

      ('Frontend', 'Provide Meaningful Error Messages',
       'Error states must describe what went wrong and, where possible, what the user can do next. Do not show raw error codes or stack traces.',
       4, '{frontend,ux,errors}', '1.0'),

      ('Frontend', 'Ensure Responsive Design',
       'All interfaces must be usable at common screen widths from mobile to desktop. Test at multiple breakpoints before marking work complete.',
       5, '{frontend,responsive,design}', '1.0'),

      ('Frontend', 'Support Empty States',
       'Every list, table, or data view must handle the empty state with a clear message and, where appropriate, a call to action.',
       6, '{frontend,ux,empty-states}', '1.0'),

      ('Frontend', 'Minimise Unnecessary User Actions',
       'Design flows that require the minimum number of steps to complete a task. Avoid redundant confirmations, unnecessary navigations, and multi-step actions that could be single-step.',
       7, '{frontend,ux,efficiency}', '1.0'),

      -- Security
      ('Security', 'Apply Least Privilege',
       'Grant only the minimum permissions required for each task. RLS policies must be scoped to the owner or role. Service role keys must never be exposed to the client.',
       1, '{security,rls,permissions}', '1.0'),

      ('Security', 'Never Trust Client-Side Validation',
       'All input validation must be enforced server-side. Client-side validation is for user experience only. Assume any value from the client could be malicious.',
       2, '{security,validation,input}', '1.0'),

      ('Security', 'Validate All Permissions Server-Side',
       'Authorisation checks must occur on the server. RLS policies enforce this at the database layer. Edge functions accessing sensitive data must verify the caller identity.',
       3, '{security,authorisation,rls}', '1.0'),

      ('Security', 'Avoid Unnecessary Storage of Sensitive Data',
       'Do not store sensitive values such as tokens, passwords, or PII in columns that are not required. Use Supabase secrets for API keys where possible.',
       4, '{security,data,secrets}', '1.0'),

      ('Security', 'Log Security-Sensitive Events',
       'Authentication failures, permission denials, and significant data access events should be recorded in the audit log where appropriate.',
       5, '{security,audit,logging}', '1.0'),

      ('Security', 'Security Test Authentication and Permission Changes',
       'Any change affecting authentication, RLS policies, or role-based access must be explicitly tested for privilege escalation and access control gaps.',
       6, '{security,testing,authentication}', '1.0'),

      -- Performance
      ('Performance', 'Avoid Unnecessary Database Queries',
       'Each page load or user action should perform only the queries required to serve the response. Audit query counts during implementation.',
       1, '{performance,database,queries}', '1.0'),

      ('Performance', 'Paginate Large Datasets',
       'Any query that can return more than a few dozen rows must implement pagination or limits. Unbounded queries will degrade performance as data grows.',
       2, '{performance,pagination,queries}', '1.0'),

      ('Performance', 'Avoid N+1 Queries',
       'Do not issue queries inside loops. Fetch related data in bulk using JOINs, IN clauses, or parallel Promise.all batches.',
       3, '{performance,queries,database}', '1.0'),

      ('Performance', 'Optimise Indexes for Common Access Patterns',
       'Identify the most frequent queries and ensure appropriate indexes exist. Review query plans for commonly executed queries.',
       4, '{performance,indexes,database}', '1.0'),

      ('Performance', 'Avoid Loading Unnecessary Data',
       'Select only the columns needed for the operation. Avoid SELECT * in production queries. Use projections to minimise data transfer.',
       5, '{performance,queries,data}', '1.0'),

      ('Performance', 'Favour Server-Side Aggregation',
       'Compute aggregations, counts, and summaries in the database rather than in application code where possible. The database is optimised for this work.',
       6, '{performance,aggregation,database}', '1.0'),

      -- Testing
      ('Testing', 'Define Acceptance Criteria Before Implementation',
       'Every backlog item must have documented acceptance criteria before implementation begins. The criteria define what done looks like and guide testing.',
       1, '{testing,acceptance-criteria,planning}', '1.0'),

      ('Testing', 'Document and Execute Manual Testing Steps',
       'Manual testing must be documented in a QA Testing Report. Record the steps taken, the inputs used, and the observed results. A report is required for every release.',
       2, '{testing,manual-testing,qa}', '1.0'),

      ('Testing', 'Execute Regression Tests on Every Change',
       'Before marking work complete, verify that existing functionality has not regressed. Test the golden path and common user journeys.',
       3, '{testing,regression,quality}', '1.0'),

      ('Testing', 'Test Edge Cases Explicitly',
       'Identify and test boundary conditions, empty inputs, maximum values, and unexpected user behaviour. Document findings in the QA Testing Report.',
       4, '{testing,edge-cases,qa}', '1.0'),

      -- Documentation
      ('Documentation', 'Produce a Completion Report for Every Implementation',
       'Every batch or phase of work must produce a Completion Report documenting what was built, tested, and deployed.',
       1, '{documentation,completion-report,releases}', '1.0'),

      ('Documentation', 'Link Completion Report to Release Candidate',
       'The Completion Report must be linked to its Release Candidate in the EOC Release Centre before the RC is closed.',
       2, '{documentation,release-candidate,linking}', '1.0'),

      ('Documentation', 'Link Testing Report to Release Candidate',
       'The QA Testing Report must be linked to its Release Candidate before the RC can be marked as Verified.',
       3, '{documentation,testing,release-candidate}', '1.0'),

      ('Documentation', 'Link AI Journal Session to Release Candidate',
       'AI Collaboration sessions must be linked to the active Release Candidate at the time of the session.',
       4, '{documentation,ai-journal,release-candidate}', '1.0'),

      ('Documentation', 'Create ADRs for Architectural Decisions',
       'Significant architectural decisions must be recorded as Architecture Decision Records and linked to the relevant Release Candidate.',
       5, '{documentation,adr,architecture}', '1.0'),

      ('Documentation', 'Create Documentation Records for Significant Changes',
       'New features, integrations, or system changes must have a Documentation record in the EOC Documentation library.',
       6, '{documentation,records,library}', '1.0'),

      -- AI Collaboration
      ('AI Collaboration', 'Record Session Objectives',
       'Every AI session must record its objective: what problem was being solved and what outcome was expected.',
       1, '{ai-collaboration,journal,objectives}', '1.0'),

      ('AI Collaboration', 'Record Important Decisions',
       'Decisions made during an AI session — architectural choices, implementation approaches, trade-offs accepted — must be documented in the session record.',
       2, '{ai-collaboration,journal,decisions}', '1.0'),

      ('AI Collaboration', 'Record Implementation Approach',
       'Document the approach taken: which files were modified, what patterns were followed, and why that approach was chosen over alternatives.',
       3, '{ai-collaboration,journal,implementation}', '1.0'),

      ('AI Collaboration', 'Record Assumptions',
       'Document assumptions made during the session. Assumptions that prove incorrect are a frequent source of defects.',
       4, '{ai-collaboration,journal,assumptions}', '1.0'),

      ('AI Collaboration', 'Record Lessons Learned',
       'After each session, record what worked well, what did not, and what should be done differently next time.',
       5, '{ai-collaboration,journal,retrospective}', '1.0'),

      ('AI Collaboration', 'Link Sessions to the Active Release Candidate',
       'Every significant AI session must be linked to the active Release Candidate in the EOC.',
       6, '{ai-collaboration,release-candidate,linking}', '1.0'),

      -- Code Quality
      ('Code Quality', 'Compile With Zero TypeScript Errors',
       'The production build must complete with zero TypeScript errors. Type safety is not optional. Type suppressions require justification.',
       1, '{code-quality,typescript,build}', '1.0'),

      ('Code Quality', 'Avoid Duplicate Utilities and Helpers',
       'Before creating a new helper function or utility, search for an existing one. Duplicate utilities diverge over time and create inconsistency.',
       2, '{code-quality,duplication,utilities}', '1.0'),

      ('Code Quality', 'Remove Dead Code',
       'Unused functions, components, imports, and variables must be removed. Dead code creates confusion and clutters the codebase.',
       3, '{code-quality,cleanup,maintenance}', '1.0'),

      ('Code Quality', 'No TODO Placeholders in Production',
       'TODO comments must not be committed to production code. Open tasks belong in the backlog, not in source files.',
       4, '{code-quality,todos,maintenance}', '1.0'),

      ('Code Quality', 'Use Consistent Naming Conventions',
       'Follow the established naming conventions for files, functions, variables, and database objects. Consistency reduces cognitive load across the codebase.',
       5, '{code-quality,naming,consistency}', '1.0'),

      ('Code Quality', 'Build Reusable Components',
       'Where a UI pattern or utility will be used in more than one place, build it as a shared component or utility from the start.',
       6, '{code-quality,components,reuse}', '1.0'),

      -- Release Management
      ('Release Management', 'Link All Backlog Items to the Release Candidate',
       'Every backlog item included in a release must be linked to the Release Candidate before the RC is marked as Verified.',
       1, '{release-management,backlog,linking}', '1.0'),

      ('Release Management', 'Link All Testing Reports to the Release Candidate',
       'All QA Testing Reports for the release must be linked to the Release Candidate.',
       2, '{release-management,testing,linking}', '1.0'),

      ('Release Management', 'Link All Documentation to the Release Candidate',
       'All Completion Reports and Documentation records must be linked to the Release Candidate.',
       3, '{release-management,documentation,linking}', '1.0'),

      ('Release Management', 'Generate a Completion Report Before Closing the RC',
       'A Completion Report must be generated and linked before an RC can be marked as Verified.',
       4, '{release-management,completion-report,verification}', '1.0'),

      ('Release Management', 'Link AI Journal Sessions to the Release Candidate',
       'All AI Journal sessions for the release must be linked to the Release Candidate before it is closed.',
       5, '{release-management,ai-journal,linking}', '1.0'),

      ('Release Management', 'Verify All Required DoD Items Before Marking RC as Verified',
       'All required Definition of Done items on the RC checklist must be checked before the RC status is changed to Verified.',
       6, '{release-management,dod,verification}', '1.0'),

      -- Operations
      ('Operations', 'Write Audit Entries for Important System Events',
       'Significant system events — user actions, state transitions, configuration changes — must be recorded in the audit trail.',
       1, '{operations,audit,observability}', '1.0'),

      ('Operations', 'Preserve Engineering History',
       'Completion Reports, Testing Reports, and AI Journal sessions must be retained. Do not delete historical engineering records.',
       2, '{operations,history,documentation}', '1.0'),

      ('Operations', 'Retain Implementation Reports',
       'All implementation reports must be preserved in the EOC Documentation library. They form the permanent record of how the system was built.',
       3, '{operations,documentation,records}', '1.0'),

      ('Operations', 'Link All Related Records',
       'Backlog items, testing reports, AI journal sessions, documentation, and ADRs must be linked to their Release Candidates to maintain a complete audit trail.',
       4, '{operations,linking,audit}', '1.0');

    INSERT INTO ecc_standards_changelog
      (version_number, author, change_reason, change_summary, affected_standards)
    VALUES (
      '1.0',
      'Engineering',
      'Initial release',
      'Engineering Standards v1.0 established with 71 standards across 12 categories: Architecture, Database, Backend, Frontend, Security, Performance, Testing, Documentation, AI Collaboration, Code Quality, Release Management, and Operations.',
      ARRAY['All standards']
    );

  END IF;
END $$;
