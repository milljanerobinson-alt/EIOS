// EWO-037R.1 (updated for R.2) — Conversation-to-Execution Routing Bridge Tests
// Intent classification tests (pure, no DB) — these remain valid because
// intent classification is still client-side (for UX).
// The live routing tests are now in ewo037r2_server_enforce_routing.test.ts.

import { describe, it, expect } from 'vitest';
import {
  classifyCanonicalExecutionIntent,
} from '../lib/conversationExecutionRoutingBridge';

describe('EWO-037R.1: Intent Classification (preserved from R.1)', () => {
  it('explicit execution authorisation is not classified as general', () => {
    const intent = classifyCanonicalExecutionIntent(
      'Authorise EWO-037 for governed execution validation',
    );
    expect(intent).not.toBe('not_execution');
    expect(intent).not.toBe('general');
  });

  it('prepare-execution intent is recognised', () => {
    const intent = classifyCanonicalExecutionIntent(
      'Prepare EWO-037 for governed execution. Prepare the execution request and stop before provider execution.',
    );
    expect(intent).toBe('engineering_execution_prepare');
  });

  it('authorise-execution intent is recognised', () => {
    const intent = classifyCanonicalExecutionIntent(
      'Authorise EWO-037 for governed execution',
    );
    expect(intent).toBe('engineering_execution_authorisation');
  });

  it('resume-execution intent is recognised', () => {
    const intent = classifyCanonicalExecutionIntent(
      'Resume the governed execution for EWO-037',
    );
    expect(intent).toBe('engineering_execution_resume');
  });

  it('status intent is recognised', () => {
    const intent = classifyCanonicalExecutionIntent(
      'Show me the execution status of EWO-037',
    );
    expect(intent).toBe('engineering_execution_status');
  });

  it('cancel/stop-before-merge intent is recognised', () => {
    const intent = classifyCanonicalExecutionIntent(
      'Stop before merge for EWO-037',
    );
    expect(intent).toBe('engineering_execution_cancel');
  });

  it('advisory message is not classified as execution', () => {
    const intent = classifyCanonicalExecutionIntent(
      'What are the options for implementing the new assessment feature?',
    );
    expect(intent).toBe('not_execution');
  });

  it('idea capture is not classified as execution', () => {
    const intent = classifyCanonicalExecutionIntent(
      'I have an idea for a new billing dashboard',
    );
    expect(intent).toBe('not_execution');
  });

  it('"Begin governed execution" is recognised', () => {
    const intent = classifyCanonicalExecutionIntent(
      'Begin governed execution for EWO-037',
    );
    expect(intent).not.toBe('not_execution');
  });

  it('"Use Codex" is recognised as execution intent', () => {
    const intent = classifyCanonicalExecutionIntent(
      'Use Codex to execute EWO-037 through the governed GitHub pipeline',
    );
    expect(intent).not.toBe('not_execution');
  });

  it('"Run through the governed GitHub pipeline" is recognised', () => {
    const intent = classifyCanonicalExecutionIntent(
      'Run EWO-037 through the governed GitHub pipeline',
    );
    expect(intent).not.toBe('not_execution');
  });

  it('"Create the Execution Request" is recognised as prepare', () => {
    const intent = classifyCanonicalExecutionIntent(
      'Create the Execution Request for EWO-037',
    );
    expect(intent).toBe('engineering_execution_prepare');
  });

  it('negated execution (do not deploy) is still recognised as execution intent', () => {
    const intent = classifyCanonicalExecutionIntent(
      'Authorise EWO-037 for governed execution validation. Do not deploy.',
    );
    expect(intent).not.toBe('not_execution');
  });

  it('multi-step message with "stop before" is recognised as prepare', () => {
    const intent = classifyCanonicalExecutionIntent(
      'Authorise EWO-037 for governed execution validation. Prepare the execution request and stop before provider execution or GitHub mutation.',
    );
    expect(intent).toBe('engineering_execution_prepare');
  });

  it('general conversation is not_execution', () => {
    const intent = classifyCanonicalExecutionIntent(
      'Hello, how are you today?',
    );
    expect(intent).toBe('not_execution');
  });

  it('architecture question is not_execution', () => {
    const intent = classifyCanonicalExecutionIntent(
      'Explain how the authentication system works',
    );
    expect(intent).toBe('not_execution');
  });
});
