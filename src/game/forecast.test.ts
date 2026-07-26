import { describe, expect, it } from 'vitest';
import { forecastWinRate } from './forecast';
import { GAUNTLET, HARD_POOL } from './enemies';
import type { PlayerShipState } from './types';

function cruiser(equipped: string[], damage = 0): PlayerShipState {
  return { frameId: 'cruiser', equipped, damage, upgrades: [] };
}

describe('forecastWinRate', () => {
  it('is deterministic for the same fleet and enemy', () => {
    const fleet = [cruiser(['ion', 'comp1', 'hull1'])];
    const rate1 = forecastWinRate(fleet, GAUNTLET[0]);
    const rate2 = forecastWinRate(fleet, GAUNTLET[0]);
    expect(rate1).toBe(rate2);
  });

  it('is near 0% for a weaponless fleet against any real enemy', () => {
    const rate = forecastWinRate([cruiser(['hull2'])], GAUNTLET[7]); // ancient guardian
    expect(rate).toBeLessThan(5);
  });

  it('is near 100% for a wildly overwhelming fleet against the weakest enemy', () => {
    const fleet = [
      cruiser(['plasma', 'plasma', 'comp3', 'shield2', 'hull2', 'init3']),
      { frameId: 'interceptor' as const, equipped: ['plasma', 'comp2', 'hull1'], damage: 0, upgrades: [] },
    ];
    const rate = forecastWinRate(fleet, GAUNTLET[0]); // scout pack
    expect(rate).toBeGreaterThan(95);
  });

  it('drops when a fleet carries damage into the fight', () => {
    const fresh = forecastWinRate([cruiser(['ion', 'ion', 'comp1', 'hull1'])], GAUNTLET[2]); // shield cruiser
    const damaged = forecastWinRate([cruiser(['ion', 'ion', 'comp1', 'hull1'], 3)], GAUNTLET[2]);
    expect(damaged).toBeLessThan(fresh);
  });

  it('targeting stance changes the win rate against a screened formation (9.4 — the legibility payoff)', () => {
    const escortedSniper = HARD_POOL.find((e) => e.groups.length > 1)!;
    const fleet = [cruiser(['ion', 'comp1', 'hull1'])];
    const weakest = forecastWinRate(fleet, escortedSniper, 200, 'weakest');
    const strongest = forecastWinRate(fleet, escortedSniper, 200, 'strongest');
    expect(weakest).not.toBe(strongest);
  });
});
