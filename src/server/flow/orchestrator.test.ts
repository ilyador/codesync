import { describe, it, expect, vi } from 'vitest';

vi.mock('../supabase.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: vi.fn().mockResolvedValue({ data: null, error: null }),
      order: vi.fn().mockReturnThis(),
    })),
  },
}));

vi.mock('../git-utils.js', () => ({
  stagedDiffStat: vi.fn().mockReturnValue({ filesChanged: 0, linesAdded: 0, linesRemoved: 0, changedFiles: [] }),
}));

vi.mock('../runtimes/index.js', () => ({
  executeFlowStep: vi.fn(),
  summarize: vi.fn(),
}));

vi.mock('./prompt-builder.js', () => ({
  buildStepPrompt: vi.fn().mockResolvedValue('prompt'),
}));

import { __test__ } from './orchestrator.js';
const { detectPauseQuestion, checkGate } = __test__;

function baseStep(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 's1',
    name: 'Code',
    runtime_kind: 'coding',
    runtime_id: 'claude_code',
    runtime_variant: null,
    tools: [],
    context_sources: [],
    pipeline: null,
    max_retries: 0,
    is_gate: false,
    on_fail_jump_to: null,
    on_max_retries: 'fail',
    position: 0,
    instructions: 'Do it',
    ...overrides,
  } as unknown as import('../flow-config.js').FlowStepConfig;
}

describe('detectPauseQuestion', () => {
  it('returns the pause question when the tail contains "Should I"', () => {
    const output = 'I did work.\nShould I also run the migrations?';
    expect(detectPauseQuestion(output)).toContain('Should I');
  });

  it('returns the pause question when the tail contains "Could you"', () => {
    const output = 'Analysis done.\nCould you confirm the approach?';
    expect(detectPauseQuestion(output)).toContain('Could you');
  });

  it('returns the pause question when the tail contains "Which"', () => {
    const output = 'Done.\nWhich option should I use?';
    expect(detectPauseQuestion(output)).toContain('Which');
  });

  it('returns null when there is no question mark', () => {
    expect(detectPauseQuestion('work done.\nAll tests pass.')).toBeNull();
  });

  it('returns null when question keywords are absent even with a question mark', () => {
    expect(detectPauseQuestion('Really?')).toBeNull();
  });

  it('skips bullet-list and RULES lines when computing the tail', () => {
    const output = 'work done, ran tests\n- do this\n- do that\nRULES: follow them\nIMPORTANT: test first';
    expect(detectPauseQuestion(output)).toBeNull();
  });

  it('only looks at the last 5 lines', () => {
    const output = 'Should I do this?\n' + 'line\n'.repeat(10) + 'work complete';
    expect(detectPauseQuestion(output)).toBeNull();
  });
});

describe('checkGate', () => {
  it('uses the parsed verdict when present (failing case)', () => {
    const output = '```json\n{"passed": false, "reason": "tests fail"}\n```';
    const step = baseStep({ name: 'verify' });
    expect(checkGate(step, output)).toEqual({ failed: true, reason: 'tests fail' });
  });

  it('uses the parsed verdict when present (passing case)', () => {
    const output = '```json\n{"passed": true, "reason": "all good"}\n```';
    const step = baseStep({ name: 'verify' });
    expect(checkGate(step, output)).toEqual({ failed: false, reason: 'all good' });
  });

  it('falls back to legacyVerifyCheck when no verdict and step name is verify', () => {
    const step = baseStep({ name: 'verify' });
    expect(checkGate(step, '3 tests fail').failed).toBe(true);
    expect(checkGate(step, 'all tests passed').failed).toBe(false);
  });

  it('falls back to legacyReviewCheck when no verdict and step name is review', () => {
    const step = baseStep({ name: 'review' });
    expect(checkGate(step, 'issues found').failed).toBe(true);
    expect(checkGate(step, 'no issues found').failed).toBe(false);
  });

  it('uses legacyReviewCheck when context_sources includes review_criteria', () => {
    const step = baseStep({ name: 'custom_gate', context_sources: ['review_criteria'] });
    expect(checkGate(step, 'issues found').failed).toBe(true);
  });

  it('returns a synthesized reason containing the step name when no verdict reason is present', () => {
    const step = baseStep({ name: 'verify' });
    const result = checkGate(step, '3 tests fail');
    expect(result.failed).toBe(true);
    expect(result.reason).toContain('verify');
  });
});
