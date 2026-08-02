import { describe, expect, it } from 'vitest';
import { addHeat, heatTier, MAX_HEAT } from './heat';

describe('heat tier boundaries (iteration 15.2)', () => {
  it('0 is Cold', () => {
    expect(heatTier(0)).toBe('Cold');
  });

  it('1-2 is Watched', () => {
    expect(heatTier(1)).toBe('Watched');
    expect(heatTier(2)).toBe('Watched');
  });

  it('3 is Tracked', () => {
    expect(heatTier(3)).toBe('Tracked');
  });

  it('4 (and MAX_HEAT) is Hunted', () => {
    expect(heatTier(4)).toBe('Hunted');
    expect(heatTier(MAX_HEAT)).toBe('Hunted');
  });
});

describe('addHeat arithmetic', () => {
  it('adds and subtracts plainly within range', () => {
    expect(addHeat(1, 1)).toBe(2);
    expect(addHeat(2, -1)).toBe(1);
  });

  it('floors at 0', () => {
    expect(addHeat(0, -1)).toBe(0);
    expect(addHeat(1, -5)).toBe(0);
  });

  it('caps at MAX_HEAT (4)', () => {
    expect(addHeat(4, 1)).toBe(4);
    expect(addHeat(3, 5)).toBe(4);
  });
});
