import { describe, expect, it } from 'vitest';
import { sectorName } from './sectorName';

describe('sectorName (iteration 10.4)', () => {
  it('is deterministic for the same seed', () => {
    expect(sectorName(12345)).toBe(sectorName(12345));
  });

  it('is a two-word name', () => {
    expect(sectorName(42).split(' ')).toHaveLength(2);
  });

  it('varies across a range of seeds (not a constant)', () => {
    const names = new Set(Array.from({ length: 50 }, (_, i) => sectorName(i * 7919)));
    expect(names.size).toBeGreaterThan(1);
  });

  it('handles seed 0 and negative/fractional input without throwing', () => {
    expect(() => sectorName(0)).not.toThrow();
    expect(() => sectorName(-17)).not.toThrow();
    expect(() => sectorName(3.7)).not.toThrow();
  });
});
