import { describe, expect, it } from 'vitest';
import { qualifiesForOutspeed } from './combatEngine';
import {
  applyRepairBanking,
  deriveFleetForCombat,
  deriveFleetStats,
  deriveStats,
  effectiveSlots,
  fusionCost,
  fusionSummary,
  totalFusions,
} from './ship';
import type { PlayerShipState } from './types';

function shipWith(fusions: PlayerShipState['fusions']): PlayerShipState {
  return { frameId: 'cruiser', equipped: [], damage: 0, upgrades: [], fusions };
}

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

// Iteration 23 (Aegis Relay): a shieldharmonic anywhere in the fleet adds
// its bonus to EVERY ship's shield, folded in once at fleet-derive time —
// covers both deriveFleetStats (UI display) and deriveFleetForCombat (the
// actual fight), which must agree since that was the whole point.
describe('shield harmonic aura (Aegis Relay)', () => {
  it('adds the aura to every ship in the fleet, including the carrier itself', () => {
    const fleet = [ship({ equipped: ['shieldharmonic'] }), ship()];
    const stats = deriveFleetStats(fleet);
    expect(stats[0].shield).toBe(1);
    expect(stats[1].shield).toBe(1);
  });

  it('stacks additively when carried by more than one ship', () => {
    const fleet = [ship({ equipped: ['shieldharmonic'] }), ship({ equipped: ['shieldharmonic'] })];
    const stats = deriveFleetStats(fleet);
    expect(stats[0].shield).toBe(2);
    expect(stats[1].shield).toBe(2);
  });

  it('does nothing when no ship carries it', () => {
    const stats = deriveFleetStats([ship(), ship()]);
    expect(stats[0].shield).toBe(0);
    expect(stats[1].shield).toBe(0);
  });

  it('agrees with deriveFleetForCombat (UI display and the real fight see the same bonus)', () => {
    const fleet = [ship({ equipped: ['shieldharmonic'] }), ship()];
    const combatStats = deriveFleetForCombat(fleet).map((f) => f.stats);
    const displayStats = deriveFleetStats(fleet);
    expect(combatStats[0].shield).toBe(displayStats[0].shield);
    expect(combatStats[1].shield).toBe(displayStats[1].shield);
  });
});

// Iteration 28 (Protocols) — the stat/build hooks folded into
// deriveStats/effectiveSlots. The draft/reducer flow is covered in
// reducer.test.ts; these exercise the pure stat math directly.
describe('protocols — stat and build hooks', () => {
  it('Reinforced bulkheads adds +1 max HP to every ship, current and future', () => {
    const base = deriveStats('cruiser', []).hp;
    const withProtocol = deriveStats('cruiser', [], [], ['reinforced-bulkheads']).hp;
    expect(withProtocol).toBe(base + 1);
    const interceptorBase = deriveStats('interceptor', []).hp;
    const interceptorWith = deriveStats('interceptor', [], [], ['reinforced-bulkheads']).hp;
    expect(interceptorWith).toBe(interceptorBase + 1);
  });

  it('Twin-linked mounts adds +1 die to the FIRST equipped weapon only', () => {
    const stats = deriveStats('cruiser', ['ion', 'plasma'], [], ['twin-linked-mounts']);
    const plain = deriveStats('cruiser', ['ion', 'plasma']);
    expect(stats.cannons[0].diceCount).toBe(plain.cannons[0].diceCount + 1);
    expect(stats.cannons[1].diceCount).toBe(plain.cannons[1].diceCount); // second weapon untouched
  });

  it('Twin-linked mounts does nothing to a ship with no weapons', () => {
    const stats = deriveStats('cruiser', ['hull1'], [], ['twin-linked-mounts']);
    expect(stats.cannons).toHaveLength(0);
    expect(stats.missiles).toHaveLength(0);
  });

  // Iteration 40 (Overcharged rounds): cannons only — missiles keep their
  // own "fires once" identity untouched.
  it('Overcharged rounds marks every cannon overcharged and leaves missiles alone', () => {
    const stats = deriveStats('cruiser', ['ion', 'plasma', 'missile'], [], ['overcharged-rounds']);
    expect(stats.cannons.every((c) => c.overcharge)).toBe(true);
    expect(stats.missiles.every((m) => !m.overcharge)).toBe(true);
    const plain = deriveStats('cruiser', ['ion']);
    expect(plain.cannons[0].overcharge).toBeFalsy();
  });

  it('Bastion doctrine adds +1 shield to a taunting ship, and nothing to a non-taunting one', () => {
    const taunter = deriveStats('bastion', ['lure'], [], ['bastion-doctrine']);
    const taunterPlain = deriveStats('bastion', ['lure']);
    expect(taunter.shield).toBe(taunterPlain.shield + 1);
    const nonTaunter = deriveStats('cruiser', ['ion'], [], ['bastion-doctrine']);
    const nonTaunterPlain = deriveStats('cruiser', ['ion']);
    expect(nonTaunter.shield).toBe(nonTaunterPlain.shield);
  });

  it('Ace pipeline generalizes the Admiral-only ace bonus to any commander', () => {
    const base = deriveFleetStats([ship({ kills: 3 })], undefined)[0].initiative;
    const withProtocol = deriveFleetStats([ship({ kills: 3 })], undefined, ['ace-pipeline'])[0].initiative;
    const belowThreshold = deriveFleetStats([ship({ kills: 2 })], undefined, ['ace-pipeline'])[0].initiative;
    expect(withProtocol).toBe(base + 1);
    expect(belowThreshold).toBe(base); // still gated on the same 3-kill threshold
  });

  it('Lone flagship gives the Flagship (cruiser frame) +2 max HP and +2 slots, no other frame', () => {
    const cruiserBase = deriveStats('cruiser', []).hp;
    const cruiserWith = deriveStats('cruiser', [], [], ['lone-flagship']).hp;
    expect(cruiserWith).toBe(cruiserBase + 2);
    const interceptorBase = deriveStats('interceptor', []).hp;
    const interceptorWith = deriveStats('interceptor', [], [], ['lone-flagship']).hp;
    expect(interceptorWith).toBe(interceptorBase); // untouched — not the Flagship frame

    const cruiserSlotsBase = effectiveSlots('cruiser', []);
    const cruiserSlotsWith = effectiveSlots('cruiser', [], ['lone-flagship']);
    expect(cruiserSlotsWith).toBe(cruiserSlotsBase + 2);
    const interceptorSlotsBase = effectiveSlots('interceptor', []);
    const interceptorSlotsWith = effectiveSlots('interceptor', [], ['lone-flagship']);
    expect(interceptorSlotsWith).toBe(interceptorSlotsBase);
  });

  it('protocols with no relevant hook leave stats untouched', () => {
    const base = deriveStats('cruiser', ['ion']);
    const withUnrelated = deriveStats('cruiser', ['ion'], [], ['salvage-rigs', 'overspeed-protocols']);
    expect(withUnrelated).toEqual(base);
  });
});

describe('the Foundry — fusions (iteration 31)', () => {
  it('deriveStats folds fusions in on top of everything else, one point per stat per purchase', () => {
    const base = deriveStats('cruiser', ['ion']);
    const fused = deriveStats('cruiser', ['ion'], [], undefined, { hp: 2, computer: 1, shield: 1, initiative: 3 });
    expect(fused.hp).toBe(base.hp + 2);
    expect(fused.computer).toBe(base.computer + 1);
    expect(fused.shield).toBe(base.shield + 1);
    expect(fused.initiative).toBe(base.initiative + 3);
  });

  it('an absent or empty fusions record leaves stats untouched', () => {
    const base = deriveStats('cruiser', ['ion']);
    expect(deriveStats('cruiser', ['ion'], [], undefined, undefined)).toEqual(base);
    expect(deriveStats('cruiser', ['ion'], [], undefined, {})).toEqual(base);
  });

  it('deriveFleetStats/deriveFleetForCombat also fold a ship\'s own fusions in automatically', () => {
    const fleet: PlayerShipState[] = [shipWith({ hp: 4 })];
    const base = deriveFleetStats([{ ...fleet[0], fusions: undefined }])[0];
    const withFusion = deriveFleetStats(fleet)[0];
    expect(withFusion.hp).toBe(base.hp + 4);

    const combatInput = deriveFleetForCombat(fleet)[0];
    expect(combatInput.stats.hp).toBe(base.hp + 4);
  });

  it('totalFusions sums purchases across every stat; absent fusions is 0', () => {
    expect(totalFusions(shipWith(undefined))).toBe(0);
    expect(totalFusions(shipWith({}))).toBe(0);
    expect(totalFusions(shipWith({ hp: 2, computer: 1 }))).toBe(3);
    expect(totalFusions(shipWith({ hp: 1, computer: 1, shield: 1, initiative: 1 }))).toBe(4);
  });

  it('fusionCost escalates per fusion of ANY stat on the ship, not just the stat being bought', () => {
    const fresh = shipWith(undefined);
    // STAT_BASE: hp 6, initiative 7, shield 8, computer 10; FUSION_STEP 4.
    expect(fusionCost('hp', fresh)).toBe(6);
    expect(fusionCost('computer', fresh)).toBe(10);
    expect(fusionCost('shield', fresh)).toBe(8);
    expect(fusionCost('initiative', fresh)).toBe(7);

    // 3 prior fusions on ANY stats — the 4th (of any stat) costs +12 over base.
    const seasoned = shipWith({ hp: 1, computer: 1, shield: 1 });
    expect(fusionCost('hp', seasoned)).toBe(6 + 4 * 3);
    expect(fusionCost('initiative', seasoned)).toBe(7 + 4 * 3); // even a stat never bought before escalates
  });

  it('fusionSummary formats a compact per-stat line, in a fixed order, and is null when nothing is fused', () => {
    expect(fusionSummary(undefined)).toBeNull();
    expect(fusionSummary({})).toBeNull();
    expect(fusionSummary({ computer: 1, hp: 2 })).toBe('+2 HP · +1 COMP'); // fixed hp/computer/shield/initiative order
    expect(fusionSummary({ initiative: 3 })).toBe('+3 INIT');
  });
});
