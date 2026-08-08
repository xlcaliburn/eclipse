import { describe, expect, it } from 'vitest';
import { bandGate, floorGate, regressionGate, wilsonInterval } from './stats';

describe('wilsonInterval', () => {
  it('centers near the raw proportion for a large sample', () => {
    const iv = wilsonInterval(500, 1000);
    expect(iv.point).toBeCloseTo(0.5, 5);
    expect(iv.low).toBeGreaterThan(0.46);
    expect(iv.high).toBeLessThan(0.54);
  });

  it('widens as the sample shrinks', () => {
    const wide = wilsonInterval(5, 10);
    const narrow = wilsonInterval(500, 1000);
    expect(wide.high - wide.low).toBeGreaterThan(narrow.high - narrow.low);
  });

  it('never leaves [0, 1] at the extremes', () => {
    const allWins = wilsonInterval(100, 100);
    expect(allWins.high).toBeLessThanOrEqual(1);
    expect(allWins.low).toBeGreaterThanOrEqual(0);
    const noWins = wilsonInterval(0, 100);
    expect(noWins.low).toBeGreaterThanOrEqual(0);
    expect(noWins.high).toBeLessThanOrEqual(1);
  });

  it('handles n=0 without dividing by zero', () => {
    const iv = wilsonInterval(0, 0);
    expect(iv.point).toBe(0);
    expect(iv.low).toBe(0);
    expect(iv.high).toBe(1);
  });
});

describe('bandGate', () => {
  it('PASSes when the whole interval sits inside the band', () => {
    // 1000 sims at 50% has a tight interval, comfortably inside 20-80.
    const iv = wilsonInterval(500, 1000);
    expect(bandGate(iv, 20, 80)).toBe('PASS');
  });

  it('FAILs when the whole interval sits outside the band', () => {
    const iv = wilsonInterval(950, 1000); // ~95%, tight interval
    expect(bandGate(iv, 20, 60)).toBe('FAIL');
  });

  it('WARNs when the interval straddles a boundary but the point estimate is inside', () => {
    // A small sample right at the edge: point estimate just inside 40%,
    // but n is small enough that the interval crosses the boundary.
    const iv = wilsonInterval(4, 10); // point 40%, wide interval at n=10
    const verdict = bandGate(iv, 39, 100);
    expect(verdict).toBe('WARN');
  });
});

describe('floorGate', () => {
  it('is bandGate with no ceiling', () => {
    const iv = wilsonInterval(900, 1000);
    expect(floorGate(iv, 60)).toBe('PASS');
    expect(floorGate(iv, 95)).toBe('FAIL');
  });
});

describe('regressionGate', () => {
  it('PASSes when the rate matches or beats the baseline', () => {
    const iv = wilsonInterval(400, 1000); // 40%
    expect(regressionGate(iv, 40)).toBe('PASS');
    expect(regressionGate(iv, 20)).toBe('PASS'); // improved
  });

  it('FAILs when the whole interval confirms a drop past tolerance', () => {
    // Baseline 40%, tolerance 30% -> floor is 28%. A confidently-measured
    // 5% is a real regression, not noise.
    const iv = wilsonInterval(50, 1000); // 5%, tight interval
    expect(regressionGate(iv, 40, 0.3)).toBe('FAIL');
  });

  it('never FAILs against a zero baseline (nothing to regress from)', () => {
    const iv = wilsonInterval(0, 100);
    expect(regressionGate(iv, 0)).toBe('PASS');
  });
});
