import { describe, it, expect } from 'vitest';
import {
  extractPhaseSummary,
  extractVerdict,
  legacyVerifyCheck,
  legacyReviewCheck,
} from './gate-evaluation.js';

describe('extractPhaseSummary', () => {
  it('extracts the [summary] tag when present', () => {
    const input = 'some output\n[summary] fixed the auth bug\nmore text';
    expect(extractPhaseSummary(input)).toBe('fixed the auth bug');
  });

  it('truncates summaries over 200 characters', () => {
    const input = `[summary] ${'a'.repeat(250)}`;
    const result = extractPhaseSummary(input);
    expect(result.length).toBe(200);
    expect(result.endsWith('...')).toBe(true);
  });

  it('falls back to last meaningful line when no summary tag', () => {
    const input = [
      '# Heading',
      '---',
      'Some preamble text',
      'The actual result line',
    ].join('\n');
    expect(extractPhaseSummary(input)).toBe('The actual result line');
  });

  it('strips leading bullet markers and backticks from fallback lines', () => {
    const input = '- `clean output`';
    expect(extractPhaseSummary(input)).toBe('clean output');
  });

  it('skips RULES and IMPORTANT lines in fallback', () => {
    const input = [
      'some real output here',
      'RULES: follow these',
      'IMPORTANT: pay attention',
    ].join('\n');
    expect(extractPhaseSummary(input)).toBe('some real output here');
  });
});

describe('extractVerdict', () => {
  it('parses a fenced JSON verdict block', () => {
    const input = 'Some output\n```json\n{"passed": true, "reason": "all tests pass"}\n```\nEnd';
    const result = extractVerdict(input);
    expect(result).toEqual({ passed: true, reason: 'all tests pass' });
  });

  it('returns the LAST verdict when multiple blocks are present', () => {
    const input = [
      '```json',
      '{"passed": true, "reason": "first"}',
      '```',
      '```json',
      '{"passed": false, "reason": "second"}',
      '```',
    ].join('\n');
    const result = extractVerdict(input);
    expect(result).toEqual({ passed: false, reason: 'second' });
  });

  it('parses an unfenced JSON object on a line of its own', () => {
    const input = 'Some output\n{"passed": false, "reason": "tests failed"}';
    const result = extractVerdict(input);
    expect(result).toEqual({ passed: false, reason: 'tests failed' });
  });

  it('returns null when no verdict is present', () => {
    const input = 'Just some plain output with no JSON.';
    expect(extractVerdict(input)).toBeNull();
  });

  it('returns null when JSON is malformed', () => {
    const input = '```json\n{passed: true}\n```';
    expect(extractVerdict(input)).toBeNull();
  });

  it('defaults reason to empty string when missing', () => {
    const input = '```json\n{"passed": true}\n```';
    const result = extractVerdict(input);
    expect(result).toEqual({ passed: true, reason: '' });
  });
});

describe('legacyVerifyCheck', () => {
  it('returns true when tail contains "tests fail"', () => {
    const output = 'Results:\n3 tests fail';
    expect(legacyVerifyCheck(output)).toBe(true);
  });

  it('returns false when tail says "no failures"', () => {
    const output = 'All checks passed, no failures detected';
    expect(legacyVerifyCheck(output)).toBe(false);
  });

  it('returns false when tail says "0 failed"', () => {
    const output = 'Test suite: 0 failed, 10 passed';
    expect(legacyVerifyCheck(output)).toBe(false);
  });

  it('returns true when tail has "error" and no exclusion', () => {
    const output = 'An error occurred during test execution';
    expect(legacyVerifyCheck(output)).toBe(true);
  });

  it('ignores the "failing tests" phrase earlier in the echoed prompt, only checks last 20 lines', () => {
    // Build output with "failing tests" in the prompt echo (>20 lines back) but clean tail
    const promptEcho = Array.from({ length: 25 }, (_, i) =>
      i === 0 ? 'RULES: check for failing tests' : `line ${i}`,
    ).join('\n');
    const tail = Array.from({ length: 20 }, (_, i) => `result line ${i}`).join('\n');
    const output = promptEcho + '\n' + tail;
    expect(legacyVerifyCheck(output)).toBe(false);
  });
});

describe('legacyReviewCheck', () => {
  it('returns true when output contains "issues found"', () => {
    const output = '3 issues found in the code';
    expect(legacyReviewCheck(output)).toBe(true);
  });

  it('returns false when output says "no issues found"', () => {
    const output = 'Review complete. No issues found.';
    expect(legacyReviewCheck(output)).toBe(false);
  });

  it('returns false when output says "0 issues"', () => {
    const output = 'Inspection returned 0 issues.';
    expect(legacyReviewCheck(output)).toBe(false);
  });

  it('returns true when output mentions fail or reject', () => {
    const output = 'I must reject this change due to quality concerns.';
    expect(legacyReviewCheck(output)).toBe(true);
  });
});
