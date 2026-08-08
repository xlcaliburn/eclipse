// Iteration 45.1: statistical honesty for the balancing engine. Every
// simulated percentage in this project used to be a bare point estimate —
// "within 5pp" gates running at 1000 sims where ±3pp of pure sampling noise
// can flip a PASS to FAIL. This module makes the noise visible instead of
// silent.

// A 95% Wilson score interval for a binomial proportion — better-behaved
// than the naive normal approximation at the extremes (near 0% or 100%,
// where most of this project's win rates actually sit), and doesn't need a
// continuity correction to stay inside [0, 1].
export interface WilsonInterval {
  successes: number;
  n: number;
  point: number; // observed proportion, 0-1
  low: number;
  high: number;
}

const Z_95 = 1.959963985;

export function wilsonInterval(successes: number, n: number, z = Z_95): WilsonInterval {
  if (n <= 0) return { successes, n, point: 0, low: 0, high: 1 };
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return {
    successes,
    n,
    point: p,
    low: Math.max(0, (center - margin) / denom),
    high: Math.min(1, (center + margin) / denom),
  };
}

export type GateVerdict = 'PASS' | 'WARN' | 'FAIL';

// Interval-aware band check, in PERCENT units (0-100) to match every
// existing gate's band notation ("20-60%"). FAIL only when the whole
// interval sits outside [min, max] — the gate genuinely moved, not the
// dice; WARN when the interval straddles a boundary but the point estimate
// itself is inside the band; PASS when the whole interval fits.
export function bandGate(interval: WilsonInterval, minPct: number, maxPct: number): GateVerdict {
  const lowPct = interval.low * 100;
  const highPct = interval.high * 100;
  const pointPct = interval.point * 100;
  const pointInside = pointPct >= minPct && pointPct <= maxPct;
  const wholeIntervalInside = lowPct >= minPct && highPct <= maxPct;
  if (wholeIntervalInside) return 'PASS';
  const wholeIntervalOutside = highPct < minPct || lowPct > maxPct;
  if (wholeIntervalOutside && !pointInside) return 'FAIL';
  return 'WARN';
}

// A one-sided floor check ("beats X >= 60%") — bandGate with no ceiling.
export function floorGate(interval: WilsonInterval, minPct: number): GateVerdict {
  return bandGate(interval, minPct, 100);
}

// Regression-vs-baseline gate (45.3/44.4): FAIL only when the observed
// rate has dropped by more than `toleranceRelative` from `baselinePct`
// AND the whole interval confirms the drop (not just sampling noise);
// WARN when the interval straddles the tolerance line; PASS otherwise —
// including when the rate improved.
export function regressionGate(interval: WilsonInterval, baselinePct: number, toleranceRelative = 0.3): GateVerdict {
  if (baselinePct <= 0) return 'PASS'; // nothing to regress from
  const floor = baselinePct * (1 - toleranceRelative);
  return floorGate(interval, floor);
}

export function fmtPct(interval: WilsonInterval): string {
  const pct = (interval.point * 100).toFixed(1);
  const halfWidth = ((interval.high - interval.low) / 2) * 100;
  return `${pct}%±${halfWidth.toFixed(1)}`;
}
