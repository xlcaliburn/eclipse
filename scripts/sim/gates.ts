import type { GateVerdict } from './stats';

export interface CheckResult {
  label: string;
  verdict: GateVerdict;
  detail?: string;
}

// Prints every check and returns whether the run should exit non-zero.
// WARN prints but never fails the run — only a FAIL does, per 45.1's
// interval-aware gate semantics (see stats.ts).
export function runChecks(label: string, checks: CheckResult[]): boolean {
  console.log(`\n${label}:`);
  for (const c of checks) {
    console.log(`  [${c.verdict}] ${c.label}${c.detail ? ` — ${c.detail}` : ''}`);
  }
  return checks.some((c) => c.verdict === 'FAIL');
}
