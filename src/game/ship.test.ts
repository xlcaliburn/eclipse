import { describe, expect, it } from 'vitest';
import { qualifiesForOutspeed } from './combatEngine';
import { applyRepairBanking, deriveFleetForCombat, deriveFleetStats } from './ship';
import type { PlayerShipState } from './types';

function ship(overrides: Partial<PlayerShipState> = {}): PlayerShipState {
  return { frameId: 'cruiser', equipped: [], damage: 0, upgrades: [], ...overrides };
}

// Iteration 21 (the Admiral, ace pilots): a ship with 3+ kills gains +1
// initiative. Folded into derived stats (not a separate combat-engine
// hook), so these tests exercise deriveFleetStats/deriveFleetForCombat
// directly — the same functions the UI and ENGAGE both call.
describe('ace pilots (the Admiral)', () => {
  it('grants +1 initiative at exactly 3 kills, not before', () => {
    const twoKills = deriveFleetStats([ship({ kills: 2 })], 'admiral')[0];
    const threeKills = deriveFleetStats([ship({ kills: 3 })], 'admiral')[0];
    const fourKills = deriveFleetStats([ship({ kills: 4 })], 'admiral')[0];
    const base = deriveFleetStats([ship({ kills: 0 })], 'admiral')[0].initiative;
    expect(twoKills.initiative).toBe(base);
    expect(threeKills.initiative).toBe(base + 1);
    expect(fourKills.initiative).toBe(base + 1); // no further bonus past 3
  });

  it('only applies for the Admiral — a 3-kill veteran under any other commander gets nothing', () => {
    const base = deriveFleetStats([ship({ kills: 3 })], undefined)[0].initiative;
    for (const commanderId of ['merchant', 'engineer', 'warlord', 'spymaster', undefined] as const) {
      expect(deriveFleetStats([ship({ kills: 3 })], commanderId)[0].initiative).toBe(base);
    }
  });

  it('reaches combat input too, via deriveFleetForCombat — not just display stats', () => {
    const { stats } = deriveFleetForCombat([ship({ kills: 3 })], 'admiral')[0];
    const plain = deriveFleetForCombat([ship({ kills: 3 })], undefined)[0].stats;
    expect(stats.initiative).toBe(plain.initiative + 1);
  });

  it('can be the deciding point for Outspeed qualification', () => {
    // OUTSPEED_GAP is 4. 3x init1 (+1 each) on a base-0 Flagship reaches
    // exactly gap-1 (3) against an enemy at initiative 0 — one point short.
    // The ace bonus should be what tips it over to qualifying.
    const enemyFastest = 0;
    const nearMiss = deriveFleetStats([ship({ kills: 2, equipped: ['init1', 'init1', 'init1'] })], 'admiral')[0];
    const aced = deriveFleetStats([ship({ kills: 3, equipped: ['init1', 'init1', 'init1'] })], 'admiral')[0];
    expect(nearMiss.initiative).toBe(3);
    expect(aced.initiative).toBe(4);
    expect(qualifiesForOutspeed(nearMiss.initiative, enemyFastest)).toBe(false);
    expect(qualifiesForOutspeed(aced.initiative, enemyFastest)).toBe(true);
  });
});

// Iteration 21 (the Engineer, over-repair): repairs that heal past actual
// damage bank the excess (cap 2) instead of wasting it.
describe('applyRepairBanking', () => {
  it('repairs normally and banks nothing when there is no excess', () => {
    const result = applyRepairBanking(ship({ damage: 5 }), 3);
    expect(result.damage).toBe(2);
    expect(result.overRepairBank).toBeUndefined();
  });

  it('banks exactly the excess when the heal outruns the damage', () => {
    const result = applyRepairBanking(ship({ damage: 1 }), 3);
    expect(result.damage).toBe(0);
    expect(result.overRepairBank).toBe(2); // 3 healed, only 1 was damage
  });

  it('caps the bank at 2, even across repeated over-repairs', () => {
    let s = ship({ damage: 0, overRepairBank: 1 });
    s = applyRepairBanking(s, 5); // would add 5 more — clamped to the cap
    expect(s.overRepairBank).toBe(2);
  });

  it('the flat-bank mode (repair yards) always grants +1, regardless of amount', () => {
    const result = applyRepairBanking(ship({ damage: 0 }), 0, true);
    expect(result.damage).toBe(0);
    expect(result.overRepairBank).toBe(1);
  });

  it('never leaves damage negative', () => {
    const result = applyRepairBanking(ship({ damage: 2 }), 99);
    expect(result.damage).toBe(0);
  });
});

describe('deriveFleetForCombat: over-repair bank becomes ablative HP', () => {
  it('folds a banked over-repair into ablativeRemaining for the next fight', () => {
    const { stats } = deriveFleetForCombat([ship({ overRepairBank: 2 })])[0];
    expect(stats.ablative).toBe(2);
  });

  it('adds to (does not replace) any ablative HP a part already grants', () => {
    // 'ablative' part-derived stats are additive with the bank — a ship
    // carrying an ablative-granting part AND a bank should see both.
    const { stats } = deriveFleetForCombat([ship({ overRepairBank: 1, equipped: ['ablative'] })])[0];
    expect(stats.ablative).toBeGreaterThanOrEqual(1);
  });

  it('does nothing when there is no bank', () => {
    const { stats } = deriveFleetForCombat([ship()])[0];
    expect(stats.ablative ?? 0).toBe(0);
  });
});
