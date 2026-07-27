import { describe, expect, it } from 'vitest';
import { effectiveShieldAgainst, hitProbability, weaponHitChance } from './hitMath';
import type { ShipStats, WeaponStats } from './types';

function stats(overrides: Partial<ShipStats>): ShipStats {
  return {
    initiative: 0,
    hp: 1,
    computer: 0,
    shield: 0,
    cannons: [],
    missiles: [],
    ...overrides,
  };
}

const ion: WeaponStats = { diceCount: 1, damage: 1 };

describe('hitProbability', () => {
  it('computer 0 vs shield 0 hits only on a natural 6', () => {
    expect(hitProbability(0, 0)).toBeCloseTo(1 / 6);
  });

  it('computer 2 vs shield 0 hits on 4+', () => {
    expect(hitProbability(2, 0)).toBeCloseTo(3 / 6);
  });

  it('never exceeds 5/6 — a natural 1 always misses', () => {
    expect(hitProbability(99, 0)).toBeCloseTo(5 / 6);
  });

  it('never drops below 1/6 — a natural 6 always hits', () => {
    expect(hitProbability(0, 99)).toBeCloseTo(1 / 6);
  });
});

describe('effectiveShieldAgainst', () => {
  it('subtracts ship-level and per-die pierce, floored at 0', () => {
    const attacker = stats({ shieldPierce: 1 });
    const lance: WeaponStats = { diceCount: 1, damage: 2, shieldPierce: 2 };
    const defender = stats({ shield: 2 });
    expect(effectiveShieldAgainst(attacker, lance, defender, 'cannon')).toBe(0);
  });

  it('counts capacitor shield in the missile phase only', () => {
    const defender = stats({ shield: 1, capacitorShield: 2 });
    expect(effectiveShieldAgainst(stats({}), ion, defender, 'missile')).toBe(3);
    expect(effectiveShieldAgainst(stats({}), ion, defender, 'cannon')).toBe(1);
  });
});

describe('weaponHitChance', () => {
  it('matches the resolver: comp 3 vs shield 3 is natural-6 only', () => {
    expect(weaponHitChance(stats({ computer: 3 }), ion, stats({ shield: 3 }), 'cannon')).toBeCloseTo(1 / 6);
  });
});
