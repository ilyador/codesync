// --- Structured verdict parsing for verify/review phases ---

export interface PhaseVerdict {
  passed: boolean;
  reason: string;
}

/** Extract a one-sentence summary from a phase's raw output. */
export function extractPhaseSummary(rawOutput: string): string {
  // Prefer the explicit [summary] tag the LLM was asked to produce
  const match = rawOutput.match(/\[summary]\s*(.+)/i);
  if (match) {
    const summary = match[1].trim();
    return summary.length > 200 ? summary.substring(0, 197) + '...' : summary;
  }

  // Fallback: last meaningful line, with markdown stripped
  const lines = rawOutput.split('\n').filter(l => {
    const t = l.trim();
    if (!t) return false;
    if (/^\[/.test(t)) return false;
    if (t.startsWith('---') || t.startsWith('```') || t.startsWith('#')) return false;
    if (/^[*=]{3,}$/.test(t)) return false;
    if (t.startsWith('RULES:') || t.startsWith('IMPORTANT:')) return false;
    return true;
  });
  let last = lines[lines.length - 1]?.trim() || '';
  last = last.replace(/^[-*]\s+/, '').replace(/^`+|`+$/g, '');
  return last.length > 200 ? last.substring(0, 197) + '...' : last;
}

/** Extract the last JSON verdict block from Claude's output. */
export function extractVerdict(output: string): PhaseVerdict | null {
  const fenced = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/g;
  let last: PhaseVerdict | null = null;
  let m;
  while ((m = fenced.exec(output)) !== null) {
    try {
      const parsed = JSON.parse(m[1]);
      if (typeof parsed.passed === 'boolean') {
        last = { passed: parsed.passed, reason: parsed.reason || '' };
      }
    } catch { /* skip */ }
  }
  if (last) return last;
  const lines = output.trim().split('\n');
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 5); i--) {
    const line = lines[i].trim();
    if (line.startsWith('{') && line.endsWith('}')) {
      try {
        const parsed = JSON.parse(line);
        if (typeof parsed.passed === 'boolean') {
          return { passed: parsed.passed, reason: parsed.reason || '' };
        }
      } catch { /* skip */ }
    }
  }
  return null;
}

export function legacyVerifyCheck(output: string): boolean {
  // Only check the last 20 lines (actual test results), not the full output
  // which includes the echoed prompt/RULES that contain words like "failing tests".
  const tail = output.trim().split('\n').slice(-20).join('\n');
  const lower = tail.toLowerCase();
  const hasFail = /\bfail\b|tests?\s+fail/.test(lower);
  const hasError = lower.includes('error') || lower.includes('not passing');
  const excluded = lower.includes('no failures') || lower.includes('0 failed') || lower.includes('fixed');
  return (hasFail || hasError) && !excluded;
}

export function legacyReviewCheck(output: string): boolean {
  const lower = output.toLowerCase();
  const hasIssues = /issues?\s+found/.test(lower);
  const hasFail = lower.includes('fail') || lower.includes('problem') || lower.includes('reject');
  const excluded = lower.includes('no issues found') || lower.includes('no issues') || lower.includes('0 issues');
  return (hasIssues || hasFail) && !excluded;
}
