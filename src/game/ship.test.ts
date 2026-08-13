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
import type { BuildTag, PartId, PlayerShipState } from './types';
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

// Iteration 63.1: Command matrix / Vector sync array — the two new fleet
// auras, on the exact same pattern as the shieldharmonic block above (one
// shared `fleetAuraBonus` summer in ship.ts). The init aura additionally
// has to prove it reaches Outspeed qualification, since that's the whole
// reason it folds in at fleet-derive time rather than a separate hook.
describe('fleet computer/init auras (Command matrix, Vector sync array — iteration 63.1)', () => {
  it('Command matrix adds its aura to every ship, including the carrier, and stacks', () => {
    const fleet = [ship({ equipped: ['commandmatrix'] }), ship()];
    const stats = deriveFleetStats(fleet);
    // The carrier's OWN card computer (2) plus the +1 aura it also grants
    // every ship (including itself) = 3; the other ship gets just the aura.
    expect(stats[0].computer).toBe(3);
    expect(stats[1].computer).toBe(1);

    const stacked = deriveFleetStats([ship({ equipped: ['commandmatrix'] }), ship({ equipped: ['commandmatrix'] })]);
    expect(stacked[0].computer).toBe(2 + 2); // own card + both auras
    expect(stacked[1].computer).toBe(2 + 2);
  });

  it('Vector sync array adds its aura to every ship, including the carrier, and stacks', () => {
    const fleet = [ship({ equipped: ['vectorsync'] }), ship()];
    const stats = deriveFleetStats(fleet);
    expect(stats[0].initiative).toBe(2 + 1); // own card + its own aura
    expect(stats[1].initiative).toBe(1); // just the aura
  });

  it("the init aura reaches Outspeed qualification (it's derived stats, not a separate hook)", () => {
    // OUTSPEED_GAP is 4. A base-0 Flagship with no init aura falls short
    // against an enemy at initiative 0; Vector sync array's fleet-wide +1
    // on a SECOND ship should be exactly what tips a plain escort over.
    const carrier = ship({ equipped: ['vectorsync'] });
    const escort = ship({ equipped: ['init1', 'init1', 'init1'] }); // 3 init, one short
    const stats = deriveFleetStats([carrier, escort]);
    expect(stats[1].initiative).toBe(4); // 3 + the aura's +1
    expect(qualifiesForOutspeed(stats[1].initiative, 0)).toBe(true);
    expect(qualifiesForOutspeed(3, 0)).toBe(false); // without the aura, it wouldn't
  });

  it('does nothing when no ship carries either aura', () => {
    const stats = deriveFleetStats([ship(), ship()]);
    expect(stats[0].computer).toBe(0);
    expect(stats[1].initiative).toBe(0);
  });

  it('both new auras agree with deriveFleetForCombat, same as the shield aura', () => {
    const fleet = [ship({ equipped: ['commandmatrix', 'vectorsync'] }), ship()];
    const combatStats = deriveFleetForCombat(fleet).map((f) => f.stats);
    const displayStats = deriveFleetStats(fleet);
    expect(combatStats[1].computer).toBe(displayStats[1].computer);
    expect(combatStats[1].initiative).toBe(displayStats[1].initiative);
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
        // keeps its full pre-58 5 rather than the formula's value — the one
        // hull that would otherwise have no way to compensate for the cut.
        // 2026-08-13: Bastion went 3 -> 4 slots (rare-tier parity pass),
        // which makes `expected` (4 + TIER_INDEX.rare(1) = 5) numerically
        // equal to the hand-set 5 below — a coincidence of this slot count,
        // NOT evidence the exception is resolved (still 0 universal/
        // systems, still can't host a reactor), so no `.not.toBe(expected)`
        // assertion here anymore — it would just be asserting the
        // coincidence didn't happen.
        expect(frame.power).toBe(5);
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

// Iteration 63.2 ("computers are oddly valued" — Targeting uplink read as
// strictly worse than Gluon computer): every EPIC active now carries +2 of
// its base stat, every RARE active +1 — table-driven over every part with
// `active: true`, so a future active can't be added at the old, under-
// valued +1 without this failing loudly.
describe('iteration 63.2 — active parts carry +2 (epic) / +1 (rare) of their base stat', () => {
  it('every active part\'s base stat matches its rarity', () => {
    const actives = PARTS.filter((p) => p.active);
    expect(actives.length).toBeGreaterThan(0); // sanity: the filter actually found something
    for (const part of actives) {
      const baseStat = part.computer ?? part.shield ?? part.hull ?? part.initiative;
      expect(baseStat, `${part.id} (${part.rarity}) has no scalar base stat to check`).toBeDefined();
      if (part.rarity === 'epic') {
        expect(baseStat, part.id).toBe(2);
      } else if (part.rarity === 'rare') {
        expect(baseStat, part.id).toBe(1);
      }
    }
  });
});

// Iteration 63.1 ("each category should have at least 1 legendary").
describe('iteration 63.1 — a legendary in every non-cargo part category', () => {
  it('every PartType except cargo (the commodity lot, kept out of PARTS anyway) has >= 1 legendary part', () => {
    const types = Array.from(new Set(PARTS.map((p) => p.type))).filter((t) => t !== 'cargo');
    for (const type of types) {
      const legendaries = PARTS.filter((p) => p.type === type && p.rarity === 'legendary');
      expect(legendaries.length, `type ${type}`).toBeGreaterThanOrEqual(1);
    }
  });

  it('the three new legendaries have the right ids, categories, and auras', () => {
    const byId = Object.fromEntries(PARTS.map((p) => [p.id, p]));
    expect(byId['commandmatrix']).toMatchObject({ type: 'computer', rarity: 'legendary', fleetComputerAura: 1 });
    expect(byId['vectorsync']).toMatchObject({ type: 'drive', rarity: 'legendary', fleetInitAura: 1 });
    expect(byId['citadelplating']).toMatchObject({ type: 'hull', rarity: 'legendary', hull: 4, ablative: 2 });
  });

  it("Citadel plating's flat +4 HP AND +2 ablative both actually reach deriveStats, not just the raw part data", () => {
    const base = deriveStats('cruiser', []);
    const fitted = deriveStats('cruiser', ['citadelplating']);
    expect(fitted.hp).toBe(base.hp + 4);
    expect(fitted.ablative).toBe(2);
  });

  it("Ablative mesh's +4 ablative reaches deriveStats and stacks with Ablative coating (+2)", () => {
    expect(deriveStats('cruiser', ['ablativemesh']).ablative).toBe(4);
    expect(deriveStats('cruiser', ['ablativemesh', 'ablative']).ablative).toBe(6);
  });
});

// Iteration 63.3: build tags are purely informational (never read by
// deriveStats/the engine), but the wiki's Builds section renders each
// build's part list FROM these — so a tag that points at nothing, or a
// build with too few members to look like a real kit, would be a silent
// content bug the wiki can't catch on its own.
describe('iteration 63.3 — build tags', () => {
  it('every BuildTag has at least 2 tagged parts', () => {
    const tags: BuildTag[] = ['alpha', 'speed', 'tank', 'swarm', 'pierce', 'attrition'];
    for (const tag of tags) {
      const members = PARTS.filter((p) => p.buildTags?.includes(tag));
      expect(members.length, tag).toBeGreaterThanOrEqual(2);
    }
  });

  it('no part carries more than 2 tags', () => {
    for (const part of PARTS) {
      expect((part.buildTags ?? []).length, part.id).toBeLessThanOrEqual(2);
    }
  });

  it('Reload drones and Ablative mesh are tagged for the builds they were added to fill', () => {
    const byId = Object.fromEntries(PARTS.map((p) => [p.id, p]));
    expect(byId['reloaddrones'].buildTags).toContain('alpha');
    expect(byId['ablativemesh'].buildTags).toContain('tank');
  });
});

// Iteration 63.4 ("hulls especially starting tiers should be much more
// restrictive... universal slots should be treated as premium"). Power
// values are asserted UNCHANGED — only slot KINDS moved, not counts — the
// existing 58.1 formula-guard test above already covers every frame's
// power, so this block only checks what's new: universal-slot counts and
// the resulting weapon ceilings.
describe('iteration 63.4 — restrictive hull layouts', () => {
  // 2026-08-13: 'freighter' dropped from this list — a later pass (rare-
  // tier slot-count parity + weaponless reprice, frames.ts's own comment)
  // changed its TOTAL slot count (5 -> 4) and power (6 -> 5), which breaks
  // this block's own "only kinds moved, not counts" premise for that one
  // frame. Its 63.4-era kind-shuffle is still real history, just no longer
  // checkable via a total-count/power-parity assertion — the frames.ts
  // comment and frame-specific tests below are the regression coverage now.
  const CHANGED: FrameId[] = [
    'cruiser',
    'light-cruiser',
    'derelict',
    'corvette',
    'aegis',
    'destroyer',
    'valkyrie',
    'titan',
  ];

  it('every changed frame kept the same TOTAL slot count (only kinds moved, not counts) — power is therefore untouched', () => {
    const oldSlotCounts: Record<string, number> = {
      cruiser: 6,
      'light-cruiser': 4,
      derelict: 2,
      corvette: 3,
      aegis: 7,
      destroyer: 5,
      valkyrie: 6,
      titan: 9,
    };
    for (const id of CHANGED) {
      expect(getFrame(id).slotLayout.length, id).toBe(oldSlotCounts[id]);
    }
  });

  it('the Flagship has a mandatory defense slot and a mandatory systems slot (user direction: "no exception")', () => {
    const layout = getFrame('cruiser').slotLayout;
    expect(layout.filter((k) => k === 'defense').length).toBeGreaterThanOrEqual(1);
    expect(layout.filter((k) => k === 'systems').length).toBeGreaterThanOrEqual(1);
    expect(layout.filter((k) => k === 'universal').length).toBe(2); // down from 4
  });

  it('universal slots dropped on every changed frame except the deliberate exceptions (Sloop, untouched)', () => {
    const universalCount = (id: FrameId) => getFrame(id).slotLayout.filter((k) => k === 'universal').length;
    // Sloop ('tender') is the ONE frame this pass deliberately left alone —
    // its whole identity is full flexibility (frames.ts's own comment).
    expect(universalCount('tender')).toBe(3);
    // Every other CHANGED frame's universal count strictly decreased from
    // its pre-63.4 value.
    const oldUniversalCounts: Record<string, number> = {
      cruiser: 4,
      'light-cruiser': 2,
      derelict: 2,
      corvette: 2,
      aegis: 2,
      destroyer: 2,
      valkyrie: 2,
      titan: 3,
    };
    for (const id of CHANGED) {
      expect(universalCount(id), id).toBeLessThan(oldUniversalCounts[id]);
    }
  });

  it('every frame still keeps at least one universal slot (Bastion the one pre-existing exception, unchanged by this pass)', () => {
    for (const frame of Object.values(FRAMES)) {
      const hasUniversal = frame.slotLayout.includes('universal');
      expect(hasUniversal, frame.id).toBe(frame.id !== 'bastion');
    }
  });

  it("the Flagship's weapon ceiling drops from 6 to 4 (2 dedicated + 2 universal, not 2 + 4)", () => {
    expect(weaponCeiling(getFrame('cruiser').slotLayout)).toBe(4);
  });

  // 52.6/57.5's existing guard tests (above, unchanged) already assert
  // STARTING_FIT/STARTING_LOADOUT stay legal against these new layouts —
  // deliberately not re-asserted here; a break there means the layout
  // table itself is wrong, and that guard already fails loudly.
});
