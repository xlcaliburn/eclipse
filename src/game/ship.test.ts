import { describe, expect, it } from 'vitest';
import { qualifiesForOutspeed } from './combatEngine';
import { FRAMES, frameDisplayName, getFrame } from './frames';
import type { FrameId } from './frames';
import { PARTS, STARTING_LOADOUT } from './parts';
import { STARTING_FIT } from './reducer/shop';
import {
  applyRepairBanking,
  canEquip,
  canUnequip,
  deriveFleetForCombat,
  deriveFleetStats,
  deriveStats,
  effectiveSlotLayout,
  effectiveSlots,
  equipBlockReason,
  equippedPower,
  equippedPowerGen,
  flagshipMissingRequiredParts,
  powerBudget,
  unequipBlockReason,
  upgradeRedundantOn,
  weaponCeiling,
  withUpgrade,
} from './ship';
import type { PartId, PlayerShipState } from './types';
import { RARITY_POWER, TIER_INDEX } from './types';

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
  it('every non-reactor PARTS entry has a power value matching RARITY_POWER[rarity] — table-driven, so a new part cannot be added without one', () => {
    // Iteration 58.2: reactors are the one deliberate exception (their own
    // `power` is an explicit 0 override, not rarity-derived) — see the
    // dedicated table-driven check below for their own invariant.
    for (const part of PARTS) {
      if (part.type === 'reactor') continue;
      expect(part.power).toBe(RARITY_POWER[part.rarity]);
    }
  });
});

// --- Iteration 58.2 (the reactor ladder) — table-driven, so a future
// reactor addition or accidental powerGen on a non-reactor part fails loud
// rather than silently. ---
describe('iteration 58.2 — reactors: power: 0 draw, powerGen set; every other part the reverse', () => {
  it('every reactor has power: 0 and a positive powerGen', () => {
    const reactors = PARTS.filter((p) => p.type === 'reactor');
    expect(reactors).toHaveLength(4);
    for (const reactor of reactors) {
      expect(reactor.power).toBe(0);
      expect(reactor.powerGen).toBeGreaterThan(0);
    }
  });

  it('every non-reactor part has powerGen undefined', () => {
    for (const part of PARTS) {
      if (part.type === 'reactor') continue;
      expect(part.powerGen).toBeUndefined();
    }
  });

  it('the four reactor ids/rarities/gen values match the spec ladder', () => {
    const byId = Object.fromEntries(PARTS.filter((p) => p.type === 'reactor').map((p) => [p.id, p]));
    expect(byId['reactor1']).toMatchObject({ rarity: 'common', powerGen: 3 });
    expect(byId['reactor2']).toMatchObject({ rarity: 'rare', powerGen: 5 });
    expect(byId['reactor3']).toMatchObject({ rarity: 'epic', powerGen: 7 });
    expect(byId['reactor4']).toMatchObject({ rarity: 'legendary', powerGen: 9 });
  });
});

// --- Iteration 58.1 (the innate-power formula) ----------------------------
describe('iteration 58.1 — innate power is slots + TIER_INDEX[rarity], except Bastion and the Flagship', () => {
  it('every frame matches the formula except the two documented exceptions', () => {
    for (const frame of Object.values(FRAMES)) {
      const expected = frame.slotLayout.length + TIER_INDEX[frame.rarity];
      if (frame.id === 'bastion') {
        // Reason: zero systems/universal slots (see frames.ts's own
        // comment) means Bastion can never host a reactor (58.2), so it
        // keeps its full pre-58 5 rather than the formula's 4 — the one
        // hull that would otherwise have no way to compensate for the cut.
        expect(frame.power).toBe(5);
        expect(frame.power).not.toBe(expected);
      } else if (frame.id === 'cruiser') {
        // Reason: the Flagship's `rarity` field is a placeholder ("never
        // sold... unused but required"), so the formula can't even resolve
        // a tier for it — it keeps a flat, hand-set 8, same "not really a
        // tier" exception 57.1 already carved out for this one frame.
        expect(frame.power).toBe(8);
      } else {
        expect(frame.power).toBe(expected);
      }
    }
  });
});

describe('iteration 57.2 — canEquip folds in the power budget', () => {
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

// --- Iteration 58.3 (reactors: the power budget helper + the new UNEQUIP
// guard) ---------------------------------------------------------------
describe('iteration 58.3 — powerBudget: innate + equipped reactor generation', () => {
  it('innate only, no reactors equipped', () => {
    expect(powerBudget('interceptor', [])).toBe(getFrame('interceptor').power);
    expect(powerBudget('interceptor', ['ion', 'comp1'])).toBe(getFrame('interceptor').power);
  });

  it('one reactor adds its own powerGen on top of innate', () => {
    expect(powerBudget('interceptor', ['reactor1'])).toBe(getFrame('interceptor').power + 3);
    expect(equippedPowerGen(['reactor1'])).toBe(3);
  });

  it('stacked reactors add cumulatively (pure arithmetic — slot legality is a separate question)', () => {
    expect(powerBudget('interceptor', ['reactor1', 'reactor2'])).toBe(getFrame('interceptor').power + 3 + 5);
    expect(equippedPowerGen(['reactor1', 'reactor2'])).toBe(8);
  });

  it('bonus slots (bay/Lone flagship/Warlord) still grant slots, not power — re-asserted under the 58 budgets', () => {
    // Same interceptor-at-budget setup as the 57.2 test above, restated
    // directly against powerBudget rather than getFrame(...).power, so this
    // holds independently of that test's internals.
    const atBudget: PartId[] = ['ion', 'comp1', 'shield1'];
    expect(powerBudget('interceptor', atBudget)).toBe(getFrame('interceptor').power);
    expect(canEquip('interceptor', atBudget, 'hull1', ['bay'])).toBe(false);
  });
});

describe('iteration 58.2/58.3 — canEquip: a part illegal on innate alone becomes legal once a reactor is equipped', () => {
  it('Antimatter cannon (legendary, draw 4) fails on a bare Interceptor (innate budget 3) but fits once a Fission reactor is equipped', () => {
    expect(canEquip('interceptor', [], 'antimatter', [])).toBe(false);
    expect(canEquip('interceptor', ['reactor1'], 'antimatter', [])).toBe(true);
  });

  it('reactors are accepted in systems and universal slots', () => {
    expect(canEquip('interceptor', [], 'reactor1', [])).toBe(true); // systems slot
    expect(canEquip('derelict', [], 'reactor1', [])).toBe(true); // universal-only layout
  });

  it('reactors are rejected on a W/D-only layout — Bastion (no systems or universal slot) cannot host one', () => {
    expect(canEquip('bastion', [], 'reactor1', [])).toBe(false);
    expect(equipBlockReason('bastion', [], 'reactor1', [])).toBe('No free systems slot for this part.');
  });
});

describe('iteration 58.3 — the UNEQUIP guard (canUnequip / unequipBlockReason)', () => {
  it('refuses to remove a reactor whose generation the remaining loadout is relying on', () => {
    // light-cruiser (Cruiser): innate 6, layout W W U U. Two Antimatter
    // cannons (draw 4 each = 8) plus a Fusion reactor (+5) in a universal
    // slot is legal (draw 8 <= budget 11) — but the loadout alone needs
    // more than the frame's own innate 6, so pulling the reactor back out
    // would strand it.
    const equipped: PartId[] = ['reactor2', 'antimatter', 'antimatter'];
    expect(equippedPower(equipped)).toBe(8);
    expect(powerBudget('light-cruiser', equipped)).toBe(11);
    expect(canUnequip('light-cruiser', equipped, 'reactor2')).toBe(false);
    expect(unequipBlockReason('light-cruiser', equipped, 'reactor2')).toBe(
      'Shut down equipment first — removing this reactor would leave the ship over budget.',
    );
  });

  it('allows removing a reactor when the remaining draw still fits the frame\'s own innate budget', () => {
    const equipped: PartId[] = ['reactor2', 'ion'];
    expect(canUnequip('light-cruiser', equipped, 'reactor2')).toBe(true);
    expect(unequipBlockReason('light-cruiser', equipped, 'reactor2')).toBeNull();
  });

  it('never blocks removing a NON-reactor part on power grounds — only a reactor\'s own removal can shrink the budget', () => {
    const equipped: PartId[] = ['reactor2', 'antimatter', 'antimatter'];
    expect(canUnequip('light-cruiser', equipped, 'antimatter')).toBe(true);
  });
});

// --- Iteration 59.3 (hull marks, replacing 52.5's refit) ------------------
describe('iteration 59.3 — hull marks: +1 universal slot per mark, stacking, no power', () => {
  it('effectiveSlotLayout grows by one universal slot per mark, cumulative (II = +1, III = +2)', () => {
    const markI = effectiveSlotLayout('interceptor', []);
    const markII = effectiveSlotLayout('interceptor', [], undefined, undefined, 2);
    const markIII = effectiveSlotLayout('interceptor', [], undefined, undefined, 3);
    expect(markII.length).toBe(markI.length + 1);
    expect(markIII.length).toBe(markI.length + 2);
    expect(markII.filter((k) => k === 'universal').length).toBe(
      markI.filter((k) => k === 'universal').length + 1,
    );
  });

  it('stacks with bay/Lone-flagship/Warlord bonus slots', () => {
    const withoutMark = effectiveSlotLayout('cruiser', ['bay'], ['lone-flagship'], 'warlord');
    const withMark = effectiveSlotLayout('cruiser', ['bay'], ['lone-flagship'], 'warlord', 2);
    expect(withMark.length).toBe(withoutMark.length + 1);
  });

  it('raises the weapon ceiling by 1 per mark, same mechanism a bay does — no special-casing', () => {
    const base = weaponCeiling(effectiveSlotLayout('interceptor', []));
    const marked = weaponCeiling(effectiveSlotLayout('interceptor', [], undefined, undefined, 2));
    expect(marked).toBe(base + 1);
  });

  it('a mark slot carries no power (58\'s granted-slot rule): the block reason shifts from "no slots" to "no power" once marked, never to a legal equip', () => {
    // Interceptor (power budget 3): ion + comp1 + shield1 fills all 3 base
    // slots AND the power budget at once.
    const atBudget: PartId[] = ['ion', 'comp1', 'shield1'];
    expect(equipBlockReason('interceptor', atBudget, 'hull1', [])).toBe('Ship is full — no empty slots.');
    // Marked: the 4th (universal) slot is real — the reason shifts to power,
    // proving the slot itself is usable — but the mark grants no power of
    // its own, so a 4th part (even a cheap common) is still refused.
    expect(equipBlockReason('interceptor', atBudget, 'hull1', [], undefined, undefined, 2)).toBe(
      'Not enough power for this part.',
    );
    expect(powerBudget('interceptor', atBudget)).toBe(getFrame('interceptor').power); // unmoved by the mark
  });

  it('the Flagship can be marked — a mark never changes frameId, so none of the old refit\'s Flagship invariants apply', () => {
    const base = effectiveSlots('cruiser', []);
    const marked = effectiveSlots('cruiser', [], undefined, undefined, 2);
    expect(marked).toBe(base + 1);
  });
});

describe('iteration 59.3 — frameDisplayName', () => {
  it('mark I (absent) is the plain frame name; II/III append the roman numeral', () => {
    expect(frameDisplayName('interceptor')).toBe('Interceptor');
    expect(frameDisplayName('interceptor', 2)).toBe('Interceptor II');
    expect(frameDisplayName('interceptor', 3)).toBe('Interceptor III');
    expect(frameDisplayName('cruiser', 3)).toBe('Flagship III'); // the Flagship's display name is "Flagship", not "Cruiser"
  });
});

// 61.2: Emergency Vectoring — the augment that grants `jink` to a hull
// that doesn't already have it innately.
describe('iteration 61.2 — Emergency Vectoring (the "vectoring" augment)', () => {
  it("deriveStats grants jink from the 'vectoring' upgrade", () => {
    expect(deriveStats('cruiser', [], []).jink).toBeFalsy();
    expect(deriveStats('cruiser', [], ['vectoring']).jink).toBe(true);
    // A non-jink hull with an unrelated upgrade stays without jink.
    expect(deriveStats('frigate', [], ['spine']).jink).toBeFalsy();
  });

  it('upgradeRedundantOn flags vectoring on an innate-jink hull (Interceptor, Valkyrie) and only vectoring', () => {
    expect(upgradeRedundantOn(ship({ frameId: 'interceptor' }), 'vectoring')).toBe(true);
    expect(upgradeRedundantOn(ship({ frameId: 'valkyrie' }), 'vectoring')).toBe(true);
    // Bastion has an innate (reactive plating), but not jink specifically —
    // not redundant.
    expect(upgradeRedundantOn(ship({ frameId: 'bastion' }), 'vectoring')).toBe(false);
    expect(upgradeRedundantOn(ship({ frameId: 'frigate' }), 'vectoring')).toBe(false);
    // Any OTHER upgrade is never flagged redundant, even on a jink hull.
    expect(upgradeRedundantOn(ship({ frameId: 'interceptor' }), 'spine')).toBe(false);
  });

  it('withUpgrade no-ops (does not add the upgrade) when the target is redundant; applies normally otherwise', () => {
    const interceptor = ship({ frameId: 'interceptor' });
    expect(withUpgrade(interceptor, 'vectoring').upgrades).toEqual([]);
    const frigate = ship({ frameId: 'frigate' });
    expect(withUpgrade(frigate, 'vectoring').upgrades).toEqual(['vectoring']);
  });
});

// 2026-08-12: the Flagship's mandatory loadout — see flagshipMissingRequiredParts's
// own comment. `ship()` defaults to frameId: 'cruiser', so most cases below
// don't need to state it explicitly.
describe('flagshipMissingRequiredParts (mandatory Flagship computer + hull)', () => {
  it('is null (compliant) with both a computer part and a hull part equipped, in any order', () => {
    expect(flagshipMissingRequiredParts([ship({ equipped: ['comp1', 'injector'] })])).toBeNull();
    expect(flagshipMissingRequiredParts([ship({ equipped: ['injector', 'comp1'] })])).toBeNull();
  });

  it("names which is missing when only one of the two is equipped", () => {
    expect(flagshipMissingRequiredParts([ship({ equipped: ['comp1'] })])).toBe('hull');
    expect(flagshipMissingRequiredParts([ship({ equipped: ['injector'] })])).toBe('computer');
  });

  it("reports 'both' when neither is equipped, even with other parts fitted", () => {
    expect(flagshipMissingRequiredParts([ship({ equipped: [] })])).toBe('both');
    expect(flagshipMissingRequiredParts([ship({ equipped: ['ion', 'shield1'] })])).toBe('both');
  });

  it('is null (nothing to enforce) when the fleet has no Flagship at all', () => {
    expect(flagshipMissingRequiredParts([ship({ frameId: 'interceptor', equipped: [] })])).toBeNull();
    expect(flagshipMissingRequiredParts([])).toBeNull();
  });

  it('only ever looks at the Flagship — other ships missing either part are irrelevant', () => {
    const fleet = [
      ship({ equipped: ['comp1', 'injector'] }),
      ship({ frameId: 'interceptor', equipped: [] }),
    ];
    expect(flagshipMissingRequiredParts(fleet)).toBeNull();
  });
});
