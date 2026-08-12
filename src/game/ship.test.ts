import { describe, expect, it } from 'vitest';
import { qualifiesForOutspeed } from './combatEngine';
import { FRAMES, getFrame } from './frames';
import type { FrameId } from './frames';
import { PARTS, STARTING_LOADOUT } from './parts';
import { canRefit, STARTING_FIT } from './reducer/shop';
import {
  applyRepairBanking,
  canEquip,
  deriveFleetForCombat,
  deriveFleetStats,
  deriveStats,
  effectiveSlotLayout,
  effectiveSlots,
  equipBlockReason,
  equippedPower,
} from './ship';
import type { PartId, PlayerShipState } from './types';
import { RARITY_POWER } from './types';

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

  it('the Warlord gives the Flagship (cruiser frame) +1 slot, no other frame', () => {
    const cruiserBase = effectiveSlots('cruiser', [], undefined, undefined);
    const cruiserWithWarlord = effectiveSlots('cruiser', [], undefined, 'warlord');
    expect(cruiserWithWarlord).toBe(cruiserBase + 1);
    const interceptorBase = effectiveSlots('interceptor', [], undefined, undefined);
    const interceptorWithWarlord = effectiveSlots('interceptor', [], undefined, 'warlord');
    expect(interceptorWithWarlord).toBe(interceptorBase); // untouched — not the Flagship frame
  });

  it('protocols with no relevant hook leave stats untouched', () => {
    const base = deriveStats('cruiser', ['ion']);
    const withUnrelated = deriveStats('cruiser', ['ion'], [], ['salvage-rigs', 'overspeed-protocols']);
    expect(withUnrelated).toEqual(base);
  });
});

// --- Iteration 42: eight new weapons — data-layer checks only; the
// per-die mechanics (chipOnMiss, executeAtHp, cleaveDamage, bypassTaunt)
// are exercised in combatEngine.test.ts instead. ---
describe('iteration 42 weapons — deriveStats threading', () => {
  it('Railgun: -2 shield flows through as a plain negative stat, same mechanism +N parts already use', () => {
    const stats = deriveStats('interceptor', ['railgun']);
    expect(stats.shield).toBe(0 - 2); // interceptor base shield is 0
    expect(stats.cannons).toHaveLength(1);
    expect(stats.cannons[0].damage).toBe(5);
  });

  it('Prototype overcharge cannon: overcharge is baked in without the Overcharged rounds protocol', () => {
    const stats = deriveStats('interceptor', ['protoovercharge']);
    expect(stats.cannons[0].overcharge).toBe(true);
  });

  it("'twinauto' (Ion battery, 3 dice) and Cluster missile carry their multi-die counts through", () => {
    const stats = deriveStats('interceptor', ['twinauto', 'clustermissile']);
    expect(stats.cannons[0].diceCount).toBe(3);
    expect(stats.missiles[0].diceCount).toBe(3);
  });

  it('Graviton beam, Executioner cannon, Flechette cannon, and Homing missile carry their new fields through', () => {
    const stats = deriveStats('interceptor', ['gravitonbeam', 'executioner', 'flechette', 'homing']);
    expect(stats.cannons.find((c) => c.chipOnMiss)?.chipOnMiss).toBe(1);
    expect(stats.cannons.find((c) => c.executeAtHp !== undefined)?.executeAtHp).toBe(2);
    expect(stats.cannons.find((c) => c.cleaveDamage)?.cleaveDamage).toBe(1);
    expect(stats.missiles.find((m) => m.bypassTaunt)?.bypassTaunt).toBe(true);
  });
});

// --- Iteration 52.6 (the fixture audit) — the guard test the spec asks
// for: every hand-built starting loadout must be legal against its own
// frame's typed slotLayout, so a future part/frame change can't silently
// strand a fresh ship in an illegal state without a test catching it. ---
describe('iteration 52.6 — starting-loadout legality guard', () => {
  it('every FRAMES entry keeps at least one universal slot, so it can always carry a commodity lot — Bastion is the one deliberate exception', () => {
    // Bastion (`weapon, defense, defense` — frames.ts) trades away its
    // universal slot on purpose, to keep its 1-weapon cap STRUCTURAL (zero
    // overflow budget for a 2nd weapon) rather than diluting a 3-slot
    // tank's identity for a cargo-carrying edge case it was never the hull
    // for. See frames.ts's own comment on this exception and the
    // reducer.test.ts/EQUIP coverage the exception preserves.
    for (const frame of Object.values(FRAMES)) {
      const hasUniversal = frame.slotLayout.includes('universal');
      if (frame.id === 'bastion') {
        expect(hasUniversal).toBe(false);
      } else {
        expect(hasUniversal).toBe(true);
      }
    }
  });

  it('every STARTING_FIT entry is legal against its own frame\'s slotLayout', () => {
    const entries = Object.entries(STARTING_FIT) as [Exclude<FrameId, 'cruiser'>, PartId[]][];
    for (const [frameId, fit] of entries) {
      let equipped: PartId[] = [];
      for (const partId of fit) {
        expect(canEquip(frameId, equipped, partId, [])).toBe(true);
        equipped = [...equipped, partId];
      }
    }
  });

  it("STARTING_LOADOUT is legal against the Flagship's own slotLayout", () => {
    let equipped: PartId[] = [];
    for (const partId of STARTING_LOADOUT) {
      expect(canEquip('cruiser', equipped, partId, [])).toBe(true);
      equipped = [...equipped, partId];
    }
  });
});

// --- Iteration 57 (ship power budgets, the "minimal" version) ------------
describe('iteration 57.1 — part power is rarity-derived', () => {
  it('every PARTS entry has a power value matching RARITY_POWER[rarity] — table-driven, so a new part cannot be added without one', () => {
    for (const part of PARTS) {
      expect(part.power).toBe(RARITY_POWER[part.rarity]);
    }
  });
});

describe('iteration 57.2 — canEquip/canRefit fold in the power budget', () => {
  it('rejects an over-budget part and accepts an at-budget one', () => {
    // Derelict: 2 universal slots, power budget 2 (frames.ts). Plasma
    // (rare, power 2) lands exactly on budget; Siege cannon (epic, power 3)
    // has plenty of slot room but blows the budget by 1.
    expect(canEquip('derelict', [], 'plasma', [])).toBe(true);
    expect(canEquip('derelict', [], 'siege', [])).toBe(false);
  });

  it('composes with the slot-layout rule: a part can fail slots only, power only, or both — equipBlockReason names the right one', () => {
    // Sloop: 3 universal slots, power budget 4. Filling all 3 with power-1
    // commons leaves 1 power of headroom but 0 slots.
    const full: PartId[] = ['ion', 'light-missile', 'comp1'];
    expect(equippedPower(full)).toBe(3);

    // Slot-only failure: 'hull1' (common, power 1) fits the remaining power
    // headroom exactly but there is no slot left for it.
    expect(canEquip('tender', full, 'hull1', [])).toBe(false);
    expect(equipBlockReason('tender', full, 'hull1', [])).toBe('Ship is full — no empty slots.');

    // Both fail: 'plasma' (rare, power 2) has neither a free slot nor
    // enough power headroom (3 + 2 = 5 > 4). The slot reason still wins —
    // documented priority, not an accident.
    expect(canEquip('tender', full, 'plasma', [])).toBe(false);
    expect(equipBlockReason('tender', full, 'plasma', [])).toBe('Ship is full — no empty slots.');

    // Power-only failure: an Interceptor (weapon/systems/universal, power
    // budget 3) with ion + comp1 equipped (power 2, 1 slot free) has room
    // for one more part slot-wise, but not enough power for a rare one.
    const twoUp: PartId[] = ['ion', 'comp1'];
    expect(canEquip('interceptor', twoUp, 'plasma', [])).toBe(false);
    expect(equipBlockReason('interceptor', twoUp, 'plasma', [])).toBe('Not enough power for this part.');
    // The same slot, filled with a common instead, fits both rules.
    expect(canEquip('interceptor', twoUp, 'hull1', [])).toBe(true);
  });

  it('bonus slots (bay/Lone flagship/Warlord) grant slots but not power', () => {
    // Interceptor, power budget 3, ion + comp1 + shield1 (power 1 each) is
    // already AT budget with all 3 base slots full.
    const atBudget: PartId[] = ['ion', 'comp1', 'shield1'];
    expect(equippedPower(atBudget)).toBe(3);
    expect(canEquip('interceptor', atBudget, 'hull1', [])).toBe(false); // no slot, no power either

    // A bay upgrade grants a 4th (universal) slot — the slot-only reason
    // goes away, but the ship is still budget-full, so a 4th part is still
    // refused, now for the power reason specifically.
    const withBay = effectiveSlotLayout('interceptor', ['bay']);
    expect(withBay.length).toBe(4); // the bonus slot is real...
    expect(getFrame('interceptor').power).toBe(3); // ...but the frame's own power budget never moves
    expect(canEquip('interceptor', atBudget, 'hull1', ['bay'])).toBe(false);
    expect(equipBlockReason('interceptor', atBudget, 'hull1', ['bay'])).toBe('Not enough power for this part.');
  });

  it('canRefit rejects a target whose power budget cannot run the current loadout, even when the target has room in its slots', () => {
    // A hand-built ship carrying 2 Antimatter cannons (legendary, power 4
    // each = 8) — illegal on its own current frame, but canRefit only cares
    // about the TARGET, so this is a clean way to isolate the power gate.
    const ship: PlayerShipState = { frameId: 'derelict', equipped: ['antimatter', 'antimatter'], damage: 0, upgrades: [] };
    const stateBase = { shopKind: 'shipyard' as const, act: 1 as const, protocols: undefined, commanderId: undefined };

    // Corvette (rare... no, common, cost 8, power 4): plenty of SLOT room
    // (2 weapon-type items overflow into its 2 universal slots cleanly),
    // but its power budget (4) can't cover the loadout's 8.
    expect(canRefit({ ...stateBase, shopFrameOffers: ['corvette'] }, ship, 'corvette')).toBe(false);

    // Dreadnought (epic, cost 30, power 12): both slots (4 dedicated weapon
    // slots) and power (12 >= 8) cover the same loadout — the only
    // difference from the corvette case above is the power budget, so this
    // proves the corvette refusal was the power gate, not the slot one.
    expect(canRefit({ ...stateBase, shopFrameOffers: ['dreadnought'] }, ship, 'dreadnought')).toBe(true);
  });
});

describe('iteration 57.5 — starting-loadout power-budget guard (extends 52.6)', () => {
  // 52.6's own guard test above already re-runs on every canEquip call —
  // canEquip now checks power too (57.2), so that test doubles as this
  // one. These two are a direct, explicit statement of the same fact per
  // 57.5's own ask, independent of canEquip's internals ever changing.
  it('every STARTING_FIT entry is within its own frame\'s power budget', () => {
    const entries = Object.entries(STARTING_FIT) as [Exclude<FrameId, 'cruiser'>, PartId[]][];
    for (const [frameId, fit] of entries) {
      expect(equippedPower(fit)).toBeLessThanOrEqual(getFrame(frameId).power);
    }
  });

  it("STARTING_LOADOUT is within the Flagship's power budget", () => {
    expect(equippedPower(STARTING_LOADOUT)).toBeLessThanOrEqual(getFrame('cruiser').power);
  });
});
