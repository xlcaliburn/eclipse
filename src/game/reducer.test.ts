import { describe, expect, it, vi } from 'vitest';
import { initCombat, runToEnd } from './combatEngine';
import { shipName } from './shipNames';
import { getCounterProtocol } from './counterProtocols';
import type { CounterProtocolId } from './counterProtocols';
import { GAUNTLET, OPENER } from './enemies';
import { FRAMES, getFrame, PURCHASABLE_FRAME_IDS } from './frames';
import type { FrameId } from './frames';
import { MAX_HEAT } from './heat';
import { bossColumn, globalColumn, laneColumns } from './map';
import { getProtocol } from './protocols';
import type { CargoTag, GameMap, MapPosition, NodeType } from './map';
import type { EventId } from './events';
import { CAPTURED_SCHEMATIC_PART_ID, getPart } from './parts';
import { deriveStats } from './ship';
import { getUpgrade } from './upgrades';
import {
  applyCargoReward,
  canRefit,
  drawShopOffers,
  eliteReward,
  fleetCap,
  frameCost,
  initialRunState,
  partCost,
  refitCost,
  rollRarity,
  runReducer,
  SHOP_OFFER_COUNT,
  winReward,
} from './reducer';
import { mulberry32 } from './rng';
import type { PartId, PlayerShipState, RunState } from './types';
import type { UpgradeId } from './upgrades';

// Act-1 column 0 is normally the single-node opener (iteration 8) — these
// fixtures test generic node-type behavior (combat/shop/repair/event), not
// the opener itself, so they override it to a normal 3-node column. Act
// stays 1, so column numbers still equal the global column reward math
// unchanged from before iteration 8.
function mapWithFirstColumn(type: 'combat' | 'elite' | 'shop' | 'shipyard' | 'repair' | 'event'): GameMap {
  const base = initialRunState().map;
  const overriddenCol0 = [0, 1, 2].map((row) => ({ col: 0, row, type }));
  const act1Columns = base.act1Columns.map((col, i) => (i === 0 ? overriddenCol0 : col));
  return { ...base, act1Columns };
}

function stateWithMap(
  type: 'combat' | 'elite' | 'shop' | 'shipyard' | 'repair' | 'event',
  overrides: Partial<RunState> = {},
): RunState {
  return { ...initialRunState(), phase: 'map', map: mapWithFirstColumn(type), ...overrides };
}

// `cargo` defaults to (and always explicitly sets) undefined — without that,
// a node forced to 'combat' at a position the real random map already had
// as 'combat' would silently keep whatever cargo tag that map happened to
// roll, making reward-math tests seed-dependent (iteration 15.1).
function forceNodeType(
  map: GameMap,
  col: number,
  row: number,
  type: NodeType,
  act: 1 | 2 = 1,
  cargo?: CargoTag,
): GameMap {
  const key = act === 1 ? 'act1Columns' : 'act2Columns';
  return {
    ...map,
    [key]: map[key].map((c, i) => (i === col ? c.map((n) => (n.row === row ? { ...n, type, cargo } : n)) : c)),
  };
}

describe('CHOOSE_COMMANDER — commander phase gate', () => {
  it('a new run starts in the commander phase with 3 seeded choices', () => {
    const state = initialRunState();
    expect(state.phase).toBe('commander');
    expect(state.commanderChoices).toHaveLength(3);
  });

  it('CHOOSE_COMMANDER refuses an id not among this run\'s choices', () => {
    const state = initialRunState();
    const notOffered = (['merchant', 'engineer', 'warlord', 'spymaster'] as const).find(
      (id) => !state.commanderChoices.includes(id),
    )!;
    const result = runReducer(state, { type: 'CHOOSE_COMMANDER', commanderId: notOffered });
    expect(result.phase).toBe('commander');
    expect(result.commanderId).toBeUndefined();
  });

  it('CHOOSE_COMMANDER moves straight to the map and records the pick', () => {
    const state = initialRunState();
    const result = runReducer(state, { type: 'CHOOSE_COMMANDER', commanderId: state.commanderChoices[0] });
    expect(result.phase).toBe('map');
    expect(result.commanderId).toBe(state.commanderChoices[0]);
  });

  // Iteration 21: the free starting Interceptor moved from the Warlord to
  // the new Admiral (wide) when the Warlord was reworked to a tall,
  // one-capital-ship doctrine. Iteration 51.2: a second free Interceptor
  // added — the fleet now begins at 3.
  it('the Admiral starts with two free, ion-fitted Interceptors — fleet begins at 3', () => {
    let state = initialRunState();
    state = { ...state, commanderChoices: ['admiral', 'merchant', 'engineer'] };
    const result = runReducer(state, { type: 'CHOOSE_COMMANDER', commanderId: 'admiral' });
    expect(result.fleet).toHaveLength(3);
    expect(result.fleet[1].frameId).toBe('interceptor');
    expect(result.fleet[1].equipped).toEqual(['ion']);
    expect(result.fleet[2].frameId).toBe('interceptor');
    expect(result.fleet[2].equipped).toEqual(['ion']);
    expect(result.fleet[1].name).not.toBe(result.fleet[2].name);
    expect(result.shipsCommissioned).toBe(3);
  });

  it('the Warlord starts with one random upgrade already fitted to the Flagship instead', () => {
    let state = initialRunState();
    state = { ...state, commanderChoices: ['warlord', 'merchant', 'engineer'] };
    const result = runReducer(state, { type: 'CHOOSE_COMMANDER', commanderId: 'warlord' });
    expect(result.fleet).toHaveLength(1); // no second ship — the Warlord's bonus is on the Flagship
    expect(result.fleet[0].upgrades).toHaveLength(1);
  });

  it('other commanders do not add a second ship', () => {
    let state = initialRunState();
    state = { ...state, commanderChoices: ['merchant', 'engineer', 'spymaster'] };
    const result = runReducer(state, { type: 'CHOOSE_COMMANDER', commanderId: 'merchant' });
    expect(result.fleet).toHaveLength(1);
  });
});

describe('PICK_NODE — map flow', () => {
  it('map -> prep for a combat node', () => {
    const state = runReducer(stateWithMap('combat'), { type: 'PICK_NODE', row: 0 });
    expect(state.phase).toBe('prep');
    expect(state.currentEnemy).toBeDefined();
    expect(state.position).toEqual({ col: 0, row: 0 });
  });

  it('map -> shop for a shop node, and LEAVE_SHOP returns to map', () => {
    let state = runReducer(stateWithMap('shop'), { type: 'PICK_NODE', row: 0 });
    expect(state.phase).toBe('shop');
    expect(state.shopOffers).toHaveLength(SHOP_OFFER_COUNT);

    state = runReducer(state, { type: 'LEAVE_SHOP' });
    expect(state.phase).toBe('map');
    expect(state.shopOffers).toBeUndefined();
  });

  it('map -> repair arrives in the choosing sub-state — no auto-heal, no repairSummary yet (15.3)', () => {
    const damaged: PlayerShipState[] = [{ frameId: 'cruiser', equipped: [], damage: 2, upgrades: [] }];
    const state = runReducer(stateWithMap('repair', { fleet: damaged }), { type: 'PICK_NODE', row: 0 });
    expect(state.phase).toBe('repair');
    expect(state.fleet[0].damage).toBe(2); // unchanged — no heal until a choice is made
    expect(state.repairSummary).toBeUndefined();
    expect(state.repairUpgradeOptions).toHaveLength(3); // drawn on arrival either way

    // LEAVE_REPAIR refuses to fire before the choice is resolved.
    expect(runReducer(state, { type: 'LEAVE_REPAIR' }).phase).toBe('repair');
  });

  it('REPAIR_CHOOSE full heals the fleet and resolves the choice; LEAVE_REPAIR then returns to map', () => {
    const damaged: PlayerShipState[] = [{ frameId: 'cruiser', equipped: [], damage: 2, upgrades: [] }];
    let state = runReducer(stateWithMap('repair', { fleet: damaged }), { type: 'PICK_NODE', row: 0 });
    state = runReducer(state, { type: 'REPAIR_CHOOSE', choice: 'full' });
    expect(state.fleet[0].damage).toBe(0);
    expect(state.repairSummary).toContain('Repaired');

    state = runReducer(state, { type: 'LEAVE_REPAIR' });
    expect(state.phase).toBe('map');
    expect(state.repairSummary).toBeUndefined();
    expect(state.repairUpgradeOptions).toBeUndefined();
  });

  it('REPAIR_CHOOSE overhaul attaches the chosen upgrade and leaves the fleet undamaged', () => {
    const damaged: PlayerShipState[] = [{ frameId: 'cruiser', equipped: [], damage: 2, upgrades: [] }];
    let state = runReducer(stateWithMap('repair', { fleet: damaged }), { type: 'PICK_NODE', row: 0 });
    const upgradeId = state.repairUpgradeOptions![0];
    state = runReducer(state, { type: 'REPAIR_CHOOSE', choice: 'overhaul', shipIndex: 0, upgradeId });
    expect(state.fleet[0].damage).toBe(2); // no healing on this branch
    expect(state.fleet[0].upgrades).toEqual([upgradeId]);
    expect(state.repairSummary).toContain(getUpgrade(upgradeId).name);

    state = runReducer(state, { type: 'LEAVE_REPAIR' });
    expect(state.phase).toBe('map');
  });

  it('REPAIR_CHOOSE overhaul is refused (locked) once every ship already carries an upgrade', () => {
    const fleet: PlayerShipState[] = [{ frameId: 'cruiser', equipped: [], damage: 0, upgrades: ['spine'] }];
    let state = runReducer(stateWithMap('repair', { fleet }), { type: 'PICK_NODE', row: 0 });
    const upgradeId = state.repairUpgradeOptions![0];
    const result = runReducer(state, { type: 'REPAIR_CHOOSE', choice: 'overhaul', shipIndex: 0, upgradeId });
    expect(result.repairSummary).toBeUndefined(); // no-op — still choosing
    expect(result.fleet[0].upgrades).toEqual(['spine']); // unchanged
  });

  it('REPAIR_CHOOSE overhaul refuses an upgradeId not among the drawn options', () => {
    const state = runReducer(stateWithMap('repair'), { type: 'PICK_NODE', row: 0 });
    const notOffered = (['spine', 'reactor', 'lattice', 'drives', 'autoloader', 'regen', 'bay'] as const).find(
      (id) => !state.repairUpgradeOptions!.includes(id),
    )!;
    const result = runReducer(state, { type: 'REPAIR_CHOOSE', choice: 'overhaul', shipIndex: 0, upgradeId: notOffered });
    expect(result.repairSummary).toBeUndefined();
  });

  it('REPAIR_CHOOSE refuses a second dispatch once already resolved', () => {
    let state = runReducer(stateWithMap('repair'), { type: 'PICK_NODE', row: 0 });
    state = runReducer(state, { type: 'REPAIR_CHOOSE', choice: 'full' });
    const summary = state.repairSummary;
    const result = runReducer(state, { type: 'REPAIR_CHOOSE', choice: 'full' });
    expect(result.repairSummary).toBe(summary); // unchanged, not double-applied
  });

  it('map -> event, and EVENT_CONTINUE returns to map', () => {
    // credits: 20 — option 0 is the safe, non-ambush choice across the
    // whole table (Salvage/Detour/Leave it/Sell.../Move on/...), but
    // 2026-08-07's bug fix gates the Detour option on 2+ credits (it used
    // to be pickable for free), so this needs enough credits to stay
    // valid no matter which event the map's rng happens to draw — the
    // default stateWithMap credits (0) isn't enough for that one any more.
    let state = runReducer(stateWithMap('event', { credits: 20 }), { type: 'PICK_NODE', row: 0 });
    expect(state.phase).toBe('event');
    expect(state.currentEvent).toBeDefined();

    state = runReducer(state, { type: 'EVENT_CHOOSE', choiceIndex: 0 });
    expect(state.currentEvent?.outcomeText).toBeDefined();

    state = runReducer(state, { type: 'EVENT_CONTINUE' });
    expect(state.phase).toBe('map');
    expect(state.currentEvent).toBeUndefined();
  });

  it('ignores a PICK_NODE for an unreachable row', () => {
    const state = runReducer(stateWithMap('combat'), { type: 'PICK_NODE', row: 99 });
    expect(state.phase).toBe('map');
    expect(state.position).toBeNull();
  });
});

describe('EQUIP/UNEQUIP — works in both prep and shop phases', () => {
  it('equips in prep phase', () => {
    let state = stateWithMap('combat');
    state = { ...state, phase: 'prep', inventory: ['plasma'] };
    state = runReducer(state, { type: 'EQUIP', shipIndex: 0, partId: 'plasma' });
    expect(state.fleet[0].equipped).toContain('plasma');
    expect(state.inventory).not.toContain('plasma');
  });

  it('equips in shop phase', () => {
    let state = stateWithMap('shop');
    state = { ...state, phase: 'shop', inventory: ['plasma'] };
    state = runReducer(state, { type: 'EQUIP', shipIndex: 0, partId: 'plasma' });
    expect(state.fleet[0].equipped).toContain('plasma');
  });

  it('refuses to equip during combat', () => {
    let state = stateWithMap('combat');
    state = { ...state, phase: 'combat', inventory: ['plasma'] };
    state = runReducer(state, { type: 'EQUIP', shipIndex: 0, partId: 'plasma' });
    expect(state.fleet[0].equipped).not.toContain('plasma');
  });

  it('a Bastion (max 1 weapon) refuses a second weapon but accepts a second non-weapon part', () => {
    let state = stateWithMap('combat', {
      phase: 'prep',
      fleet: [{ frameId: 'bastion', equipped: ['lure'], damage: 0, upgrades: [] }],
      inventory: ['ion', 'plasma', 'hull1'],
    });
    state = runReducer(state, { type: 'EQUIP', shipIndex: 0, partId: 'ion' });
    expect(state.fleet[0].equipped).toContain('ion');

    const blocked = runReducer(state, { type: 'EQUIP', shipIndex: 0, partId: 'plasma' });
    expect(blocked.fleet[0].equipped).not.toContain('plasma'); // 2nd weapon refused

    const withHull = runReducer(state, { type: 'EQUIP', shipIndex: 0, partId: 'hull1' });
    expect(withHull.fleet[0].equipped).toContain('hull1'); // non-weapon still fits
  });

  // 2026-08-07 bug fix: EQUIP's own room check omitted `state.protocols`,
  // so Lone flagship's +2 bonus slots (real everywhere else — deriveStats,
  // FleetPanel/FleetOverlay's "has room" checks) were invisible to the one
  // gate that actually allows an equip. The UI showed room and let the
  // player click; the reducer silently refused it anyway.
  it('Lone flagship: the Flagship can actually use its +2 bonus slots, not just display them', () => {
    const fleet: PlayerShipState[] = [
      {
        frameId: 'cruiser', // 6 base slots (2 weapon, 4 universal — iteration 52.1)
        equipped: ['ion', 'ion', 'comp1', 'comp1', 'comp1', 'comp1'], // full at base capacity
        damage: 0,
        upgrades: [],
      },
    ];
    let state: RunState = {
      ...initialRunState(),
      phase: 'prep',
      fleet,
      protocols: ['lone-flagship'],
      inventory: ['hull1', 'hull1'],
    };
    state = runReducer(state, { type: 'EQUIP', shipIndex: 0, partId: 'hull1' });
    expect(state.fleet[0].equipped).toHaveLength(7); // bonus slot 1 — used to silently refuse here
    state = runReducer(state, { type: 'EQUIP', shipIndex: 0, partId: 'hull1' });
    expect(state.fleet[0].equipped).toHaveLength(8); // bonus slot 2

    // A 9th part still refuses — the bonus is +2, not unlimited.
    const overCap = runReducer({ ...state, inventory: ['hull1'] }, { type: 'EQUIP', shipIndex: 0, partId: 'hull1' });
    expect(overCap.fleet[0].equipped).toHaveLength(8);
  });

  // 2026-08-08 (Warlord rework): +1 item slot on the Flagship specifically —
  // same "the gate that actually allows an EQUIP must see the bonus, not
  // just the display" discipline as Lone flagship's +2 above.
  it("the Warlord's Flagship can use its +1 bonus item slot, no other frame", () => {
    const fleet: PlayerShipState[] = [
      {
        frameId: 'cruiser', // 6 base slots (2 weapon, 4 universal — iteration 52.1)
        equipped: ['ion', 'ion', 'comp1', 'comp1', 'comp1', 'comp1'], // full at base capacity
        damage: 0,
        upgrades: [],
      },
    ];
    let state: RunState = { ...initialRunState(), phase: 'prep', fleet, commanderId: 'warlord', inventory: ['hull1'] };
    state = runReducer(state, { type: 'EQUIP', shipIndex: 0, partId: 'hull1' });
    expect(state.fleet[0].equipped).toHaveLength(7); // bonus slot — used to silently refuse here

    const overCap = runReducer({ ...state, inventory: ['hull1'] }, { type: 'EQUIP', shipIndex: 0, partId: 'hull1' });
    expect(overCap.fleet[0].equipped).toHaveLength(7); // still +1, not unlimited

    // An Interceptor (not the Flagship) gets no such bonus even under the Warlord.
    const escortFleet: PlayerShipState[] = [
      { frameId: 'interceptor', equipped: ['ion', 'ion', 'ion'], damage: 0, upgrades: [] }, // 3 base slots, full
    ];
    const escortState: RunState = {
      ...initialRunState(),
      phase: 'prep',
      fleet: escortFleet,
      commanderId: 'warlord',
      inventory: ['ion'],
    };
    const escortResult = runReducer(escortState, { type: 'EQUIP', shipIndex: 0, partId: 'ion' });
    expect(escortResult.fleet[0].equipped).toHaveLength(3); // refused — no bonus off the Flagship
  });

  it('unequipping a hull part never drops a ship below 1 HP remaining (bug: used to "destroy" it)', () => {
    // interceptor: base HP 2, +1 from hull1 = 3 max HP, sitting at 2 damage (1 HP left).
    const fleet: PlayerShipState[] = [{ frameId: 'interceptor', equipped: ['ion', 'hull1'], damage: 2, upgrades: [] }];
    let state: RunState = { ...initialRunState(), phase: 'prep', fleet };
    state = runReducer(state, { type: 'UNEQUIP', shipIndex: 0, partId: 'hull1' });
    // Max HP drops back to 2 (base), but damage is clamped so the ship still has >= 1 HP left.
    expect(state.fleet[0].equipped).not.toContain('hull1');
    expect(state.fleet[0].damage).toBe(1);
  });

  it('unequipping a hull part leaves damage untouched when the ship was not near its new max HP', () => {
    const fleet: PlayerShipState[] = [{ frameId: 'interceptor', equipped: ['ion', 'hull1'], damage: 0, upgrades: [] }];
    let state: RunState = { ...initialRunState(), phase: 'prep', fleet };
    state = runReducer(state, { type: 'UNEQUIP', shipIndex: 0, partId: 'hull1' });
    expect(state.fleet[0].damage).toBe(0);
  });

  // Re-tuned 2026-08-04: unequipping a hull part costs max HP, not current
  // HP — a ship with damage headroom absorbs the reduction there first, and
  // only a fully-healed ship drops current HP in lockstep with max.
  it('a hull-1 part carries 1 point of damage headroom: 3/4 unequips to 3/3, not 2/3', () => {
    // cruiser (Flagship): base HP 3, +1 from hull1 = 4 max, 1 damage -> 3/4.
    const fleet: PlayerShipState[] = [{ frameId: 'cruiser', equipped: ['ion', 'hull1'], damage: 1, upgrades: [] }];
    let state: RunState = { ...initialRunState(), phase: 'prep', fleet };
    state = runReducer(state, { type: 'UNEQUIP', shipIndex: 0, partId: 'hull1' });
    expect(state.fleet[0].equipped).not.toContain('hull1');
    expect(state.fleet[0].damage).toBe(0); // 3/3, not 2/3 — the removed point came out of the existing damage
  });

  it('a fully-healed ship drops current HP in lockstep with max: 4/4 unequips to 3/3', () => {
    const fleet: PlayerShipState[] = [{ frameId: 'cruiser', equipped: ['ion', 'hull1'], damage: 0, upgrades: [] }];
    let state: RunState = { ...initialRunState(), phase: 'prep', fleet };
    state = runReducer(state, { type: 'UNEQUIP', shipIndex: 0, partId: 'hull1' });
    expect(state.fleet[0].damage).toBe(0); // still 0 damage, but max HP (and so current) is now 3 -> 3/3
  });

  it('re-equipping after either case lands back at full max HP: both 3/4 and 4/4 round-trip to 4/4', () => {
    const damaged: PlayerShipState[] = [{ frameId: 'cruiser', equipped: ['ion', 'hull1'], damage: 1, upgrades: [] }];
    let stateA: RunState = { ...initialRunState(), phase: 'prep', fleet: damaged, inventory: [] };
    stateA = runReducer(stateA, { type: 'UNEQUIP', shipIndex: 0, partId: 'hull1' }); // 3/4 -> 3/3
    stateA = runReducer(stateA, { type: 'EQUIP', shipIndex: 0, partId: 'hull1' }); // -> 4/4
    expect(stateA.fleet[0].damage).toBe(0);
    expect(stateA.fleet[0].equipped).toContain('hull1');

    const full: PlayerShipState[] = [{ frameId: 'cruiser', equipped: ['ion', 'hull1'], damage: 0, upgrades: [] }];
    let stateB: RunState = { ...initialRunState(), phase: 'prep', fleet: full, inventory: [] };
    stateB = runReducer(stateB, { type: 'UNEQUIP', shipIndex: 0, partId: 'hull1' }); // 4/4 -> 3/3
    stateB = runReducer(stateB, { type: 'EQUIP', shipIndex: 0, partId: 'hull1' }); // -> 4/4
    expect(stateB.fleet[0].damage).toBe(0);
  });
});

describe('BUY_SHIP — Interceptor and Bastion, the Flagship is never purchasable', () => {
  it('adds an Interceptor to the fleet, pre-fitted with an ion cannon', () => {
    let state = stateWithMap('shop', { phase: 'shop', credits: 20, shopFrameOffers: ['interceptor'] });
    state = runReducer(state, { type: 'BUY_SHIP', frameId: 'interceptor' });
    expect(state.fleet).toHaveLength(2);
    expect(state.fleet[1].frameId).toBe('interceptor');
    expect(state.fleet[1].damage).toBe(0);
    expect(state.fleet[1].equipped).toEqual(['ion']);
    expect(state.credits).toBe(20 - 6); // interceptor cost (6 as of iteration 5)
  });

  // Iteration 36: hulls stopped bundling an identity part — Bastion arrives
  // blank of the lure beacon (any hull can carry one now, it's just a
  // part). Iteration 41: every hull arrives with SOME weapon though — an
  // Ion cannon here — and Bastion's price (12cr) reflects that.
  it('adds a Bastion to the fleet, fitted with an ion cannon (iteration 41)', () => {
    let state = stateWithMap('shop', { phase: 'shop', credits: 20, shopFrameOffers: ['bastion'] });
    state = runReducer(state, { type: 'BUY_SHIP', frameId: 'bastion' });
    expect(state.fleet).toHaveLength(2);
    expect(state.fleet[1].frameId).toBe('bastion');
    expect(state.fleet[1].equipped).toEqual(['ion']);
    expect(state.credits).toBe(20 - 12); // bastion cost (repriced iteration 41)
  });

  it('refuses when the fleet is already at the cap', () => {
    const fullFleet: PlayerShipState[] = Array.from({ length: 4 }, () => ({
      frameId: 'interceptor' as const,
      equipped: [],
      damage: 0,
      upgrades: [],
    }));
    let state = stateWithMap('shop', { phase: 'shop', credits: 100, fleet: fullFleet });
    state = runReducer(state, { type: 'BUY_SHIP', frameId: 'interceptor' });
    expect(state.fleet).toHaveLength(4);
  });

  it('adds a Dreadnought (2026-08-06 repricing): 30cr, arrives fitted with 2 ion cannons + Gauss coils, 8 slots', () => {
    let state = stateWithMap('shop', {
      phase: 'shop',
      act: 2,
      shopKind: 'shipyard',
      credits: 30,
      shopFrameOffers: ['dreadnought'],
    });
    state = runReducer(state, { type: 'BUY_SHIP', frameId: 'dreadnought' });
    expect(state.fleet).toHaveLength(2);
    expect(state.fleet[1].frameId).toBe('dreadnought');
    // Iteration 52 stage (b): Dreadnought is epic now (level 2), not
    // legendary (level 3) — a shipyard purchase arrives with the starting
    // fit PLUS 2 bonus rare-tier items (2026-08-08 rework).
    expect(state.fleet[1].equipped.slice(0, 3)).toEqual(['ion', 'ion', 'shield1']);
    const bonusItems = state.fleet[1].equipped.slice(3);
    expect(bonusItems).toHaveLength(2);
    for (const id of bonusItems) {
      expect(getPart(id).rarity).toBe('rare');
    }
    expect(state.credits).toBe(0); // 30cr cost
  });

  // Iteration 52.1: the old flat `maxWeapons: 4` is gone — the ceiling is
  // now derived (dedicated weapon slots + universal slots, since universal
  // accepts anything). Dreadnought's layout (4 weapon, 2 defense, 2
  // universal) gives a real ceiling of 6, not 4 — this is a genuine,
  // documented behavior change (see plans/iteration-52.md's open question
  // #3), isolated here from BUY_SHIP's randomized bonus items by building
  // the ship directly.
  it("the Dreadnought's real weapon ceiling is 6 (4 dedicated + 2 universal), reached before its 8 total slots are", () => {
    const fleet: PlayerShipState[] = [
      { frameId: 'dreadnought', equipped: ['ion', 'ion', 'ion', 'ion', 'ion', 'ion'], damage: 0, upgrades: [] }, // 6/8 slots, all weapons
    ];
    let state: RunState = { ...initialRunState(), phase: 'prep', fleet, inventory: ['ion', 'hull1'] };
    const overWeaponCap = runReducer(state, { type: 'EQUIP', shipIndex: 0, partId: 'ion' });
    expect(overWeaponCap.fleet[0].equipped).toHaveLength(6); // 7th weapon refused — ceiling reached

    // But the 2 still-empty DEFENSE slots aren't touched by the weapon
    // ceiling at all — a non-weapon part still fits with room to spare.
    state = runReducer(state, { type: 'EQUIP', shipIndex: 0, partId: 'hull1' });
    expect(state.fleet[0].equipped).toHaveLength(7);
  });

  it('adds a Cruiser (2026-08-06 repricing): 22cr, pre-fitted with an ion cannon + Gauss coils, 4 slots, no weapon cap', () => {
    let state = stateWithMap('shop', { phase: 'shop', credits: 22, shopFrameOffers: ['light-cruiser'] });
    state = runReducer(state, { type: 'BUY_SHIP', frameId: 'light-cruiser' });
    expect(state.fleet).toHaveLength(2);
    expect(state.fleet[1].frameId).toBe('light-cruiser');
    expect(state.fleet[1].equipped).toEqual(['ion', 'shield1']);
    expect(state.credits).toBe(0); // 22cr cost

    state = { ...state, inventory: ['plasma', 'plasma'] };
    for (let i = 0; i < 2; i++) {
      state = runReducer(state, { type: 'EQUIP', shipIndex: 1, partId: 'plasma' });
    }
    expect(state.fleet[1].equipped).toHaveLength(4); // ion + shield + 2 plasma fill all 4 slots, no weapon-cap refusal
  });

  // Iteration 36: the five support hulls (iteration 23) are retired from
  // the shop — their bundled signature part is now just an ordinary part
  // any hull can carry. The Corvette replaces them as the one cheap
  // utility carrier. Iteration 41: it arrives with a Light missile (every
  // purchasable hull now has some starting weapon) and repriced accordingly.
  it('the Corvette (iteration 41) arrives fitted with a light missile', () => {
    let state = stateWithMap('shop', { phase: 'shop', credits: 20, shopFrameOffers: ['corvette'] });
    state = runReducer(state, { type: 'BUY_SHIP', frameId: 'corvette' });
    expect(state.fleet).toHaveLength(2);
    expect(state.fleet[1].frameId).toBe('corvette');
    expect(state.fleet[1].equipped).toEqual(['light-missile']);
    expect(state.credits).toBe(20 - 8); // corvette cost (repriced iteration 41)
  });

  // Iteration 36 retired the 5 support hulls from the shop; iteration 52
  // un-retired all 5 (see frames.ts's FrameId comment) with real typed-slot
  // identities — the roster grew 7 -> 17 purchasable rather than staying at
  // 6 + Corvette.
  it('the 5 legacy support hulls are purchasable again (iteration 52), each under its 52.4-roster name', () => {
    const renamed: Record<string, string> = {
      frigate: 'Frigate',
      aegis: 'Aegis',
      tender: 'Sloop',
      'ew-cutter': 'Picket',
      'disruptor-cutter': 'Disruptor',
    };
    for (const [frameId, name] of Object.entries(renamed)) {
      expect(PURCHASABLE_FRAME_IDS).toContain(frameId);
      expect(FRAMES[frameId as keyof typeof FRAMES].name).toBe(name);
    }
  });

  // Iteration 36 retired 'aegis' from the shop; iteration 52 un-retired it
  // (see frames.ts's FrameId comment) as the legendary Aegis — FRAMES has
  // always kept a full entry for it regardless (even mid-retirement, for
  // old-save compatibility), so stats derive correctly either way.
  it('Aegis (un-retired iteration 52) derives stats correctly, innate taunt included', () => {
    const stats = deriveStats('aegis', ['shieldharmonic']);
    expect(stats.hp).toBe(10); // aegis's own baseHp — shieldharmonic is a fleet-wide aura, not a self-buff
    expect(stats.taunt).toBe(true); // innate — see frames.ts
  });

  // Iteration 21 (the Admiral, wide): every purchasable frame 25% off,
  // rounded down (floor(cost * 0.75), not cost - floor(cost * 0.25) — the
  // two differ on an odd cost and rounding toward the player is deliberate).
  it('the Admiral buys every frame 25% cheaper, rounded down in the player\'s favor', () => {
    const cases: ['interceptor' | 'bastion' | 'dreadnought' | 'light-cruiser', number][] = [
      ['interceptor', 4], // 6cr -> floor(4.5) = 4
      ['bastion', 9], // 12cr (iteration 41 repricing) -> floor(9) = 9
      ['dreadnought', 22], // 30cr (2026-08-06 repricing) -> floor(22.5) = 22
      ['light-cruiser', 16], // 22cr (2026-08-06 repricing) -> floor(16.5) = 16
    ];
    for (const [frameId, expectedCost] of cases) {
      // dreadnought is act-2-only AND shipyard-only (2026-08-06/07) — bump
      // act + shopKind for that one case.
      const act = frameId === 'dreadnought' ? 2 : 1;
      const shopKind = frameId === 'dreadnought' ? 'shipyard' : undefined;
      const state = stateWithMap('shop', { phase: 'shop', act, shopKind, credits: 30, commanderId: 'admiral', shopFrameOffers: [frameId] });
      const result = runReducer(state, { type: 'BUY_SHIP', frameId });
      expect(result.credits).toBe(30 - expectedCost);
    }
  });

  // Iteration 21 (the Warlord, tall): only the Dreadnought is discounted,
  // and flatly (5cr) rather than by percentage — everything else is full
  // price, unlike the Admiral's blanket discount.
  it('the Warlord buys only the Dreadnought cheaper (flat -5cr); other frames are full price', () => {
    const dread = stateWithMap('shop', {
      phase: 'shop',
      act: 2,
      shopKind: 'shipyard',
      credits: 30,
      commanderId: 'warlord',
      shopFrameOffers: ['dreadnought'],
    });
    expect(runReducer(dread, { type: 'BUY_SHIP', frameId: 'dreadnought' }).credits).toBe(30 - 25); // 30 - 5 (2026-08-06 repricing)

    const interceptor = stateWithMap('shop', { phase: 'shop', credits: 20, commanderId: 'warlord', shopFrameOffers: ['interceptor'] });
    expect(runReducer(interceptor, { type: 'BUY_SHIP', frameId: 'interceptor' }).credits).toBe(20 - 6); // full price
  });

  // Iteration 21 (the Admiral, wide): fleet cap 5 instead of 4.
  it('the Admiral can field a 5th ship; everyone else is still capped at 4', () => {
    const fullFleet: PlayerShipState[] = Array.from({ length: 4 }, () => ({
      frameId: 'interceptor' as const,
      equipped: [],
      damage: 0,
      upgrades: [],
    }));
    const admiral = stateWithMap('shop', {
      phase: 'shop',
      credits: 100,
      commanderId: 'admiral',
      fleet: fullFleet,
      shopFrameOffers: ['interceptor'],
    });
    expect(runReducer(admiral, { type: 'BUY_SHIP', frameId: 'interceptor' }).fleet).toHaveLength(5);

    const plain = stateWithMap('shop', { phase: 'shop', credits: 100, fleet: fullFleet, shopFrameOffers: ['interceptor'] });
    expect(runReducer(plain, { type: 'BUY_SHIP', frameId: 'interceptor' }).fleet).toHaveLength(4);
  });

  // 2026-08-08: mercenary escorts are hired outside the fleet cap (see
  // BUY_MERCENARY) and shouldn't count against it once aboard either — a
  // fleet BELOW the cap in real, commissioned hulls should still be able
  // to buy one more real ship even if the mercenaries riding along push
  // the raw array length up to (or past) the cap.
  it('mercenary escorts do not count toward the fleet cap for a real ship purchase', () => {
    const commissioned: PlayerShipState[] = Array.from({ length: 3 }, () => ({
      frameId: 'interceptor' as const,
      equipped: [],
      damage: 0,
      upgrades: [],
    }));
    const mercenaries: PlayerShipState[] = Array.from({ length: 2 }, () => ({
      frameId: 'interceptor' as const,
      equipped: [],
      damage: 0,
      upgrades: [],
      mercenary: true,
    }));
    const state = stateWithMap('shop', {
      phase: 'shop',
      credits: 100,
      // 3 real + 2 mercenary = 5 array entries, at/past the cap (4) — the
      // old buggy `fleet.length >= fleetCap` check would have blocked this.
      fleet: [...commissioned, ...mercenaries],
      shopFrameOffers: ['interceptor'],
    });
    const result = runReducer(state, { type: 'BUY_SHIP', frameId: 'interceptor' });
    expect(result.fleet).toHaveLength(6); // the buy went through — mercenaries didn't block it
  });
});

describe('BUY_SHIP — store vs. shipyard (iteration 33; rarity bonus reworked iteration 39, reworked again 2026-08-08 to grant rare-tier items instead of fused HP/upgrades)', () => {
  it('a store hull is 25% cheaper and always common-tier (no bonus); a shipyard hull is full price and arrives with bonus rare-tier item(s)', () => {
    // Bastion is rare — a real contrast case, unlike a common-tier frame
    // (interceptor/corvette/derelict) where store and shipyard would look
    // identical on the bonus dimension.
    const store = stateWithMap('shop', { phase: 'shop', shopKind: 'store', credits: 20, shopFrameOffers: ['bastion'] });
    const storeResult = runReducer(store, { type: 'BUY_SHIP', frameId: 'bastion' });
    expect(storeResult.credits).toBe(20 - Math.floor(12 * 0.75)); // bastion 12cr (iteration 41) -> floor(9) = 9
    expect(storeResult.fleet[1].damage).toBe(0); // no more arrival damage, store or shipyard
    expect(storeResult.fleet[1].upgrades).toEqual([]);
    expect(storeResult.fleet[1].equipped).toEqual(['ion']); // iteration 41 starting fit — no bonus items

    const shipyard = stateWithMap('shop', { phase: 'shop', shopKind: 'shipyard', credits: 20, shopFrameOffers: ['bastion'] });
    const shipyardResult = runReducer(shipyard, { type: 'BUY_SHIP', frameId: 'bastion' });
    expect(shipyardResult.credits).toBe(20 - 12); // full price (iteration 41)
    expect(shipyardResult.fleet[1].damage).toBe(0);
    expect(shipyardResult.fleet[1].upgrades).toEqual([]); // no slotless upgrade grant any more
    expect(shipyardResult.fleet[1].equipped).toHaveLength(2); // starting fit (1) + 1 bonus rare item (rare = level 1)
    expect(shipyardResult.fleet[1].equipped[0]).toBe('ion');
    const bonusItemId = shipyardResult.fleet[1].equipped[1];
    expect(getPart(bonusItemId).rarity).toBe('rare');
  });

  it('every purchasable frame arrives at 0 damage, store or shipyard', () => {
    for (const frameId of PURCHASABLE_FRAME_IDS) {
      if (getFrame(frameId).rarity === 'legendary') continue; // act-2/shipyard-only, not a store item (52.1 generalized off 'dreadnought')
      const state = stateWithMap('shop', { phase: 'shop', shopKind: 'store', credits: 999, shopFrameOffers: [frameId] });
      const result = runReducer(state, { type: 'BUY_SHIP', frameId });
      expect(result.fleet[1].damage).toBe(0);
    }
  });

  it('a shipyard purchase grants a bonus item count that scales with the frame\'s rarity level: common=0, rare=1, epic=2, legendary=3', () => {
    const cases: [Exclude<FrameId, 'cruiser'>, number][] = [
      ['interceptor', 0], // common
      ['bastion', 1], // rare
      ['light-cruiser', 2], // epic
    ];
    for (const [frameId, level] of cases) {
      const state = stateWithMap('shop', { phase: 'shop', shopKind: 'shipyard', credits: 999, shopFrameOffers: [frameId] });
      const result = runReducer(state, { type: 'BUY_SHIP', frameId });
      const ship = result.fleet[1];
      const startingFitLength = ship.equipped.length - level;
      expect(startingFitLength).toBeGreaterThanOrEqual(0);
      const bonusItems = ship.equipped.slice(startingFitLength);
      expect(bonusItems).toHaveLength(level);
      for (const id of bonusItems) {
        expect(getPart(id).rarity).toBe('rare');
      }
    }
  });

  it('the second-hand discount stacks with a commander discount, applied last', () => {
    // Admiral: 25% off -> floor(6*0.75)=4; store: another 25% off that -> floor(4*0.75)=3.
    const state = stateWithMap('shop', {
      phase: 'shop',
      shopKind: 'store',
      commanderId: 'admiral',
      credits: 20,
      shopFrameOffers: ['interceptor'],
    });
    const result = runReducer(state, { type: 'BUY_SHIP', frameId: 'interceptor' });
    expect(result.credits).toBe(20 - 3);
  });
});

describe('REFIT_SHIP (iteration 52.5, the hull refit)', () => {
  it('canRefit rejects a store visit — refit is shipyard-only', () => {
    const ship: PlayerShipState = { frameId: 'interceptor', equipped: ['ion'], damage: 0, upgrades: [] };
    expect(canRefit({ shopKind: 'store', shopFrameOffers: ['bastion'], act: 1 }, ship, 'bastion')).toBe(false);
  });

  it('canRefit rejects the Flagship and a mercenary', () => {
    const flagship: PlayerShipState = { frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] };
    const merc: PlayerShipState = { frameId: 'interceptor', equipped: ['ion'], damage: 0, upgrades: [], mercenary: true };
    const ctx = { shopKind: 'shipyard' as const, shopFrameOffers: ['light-cruiser' as const], act: 1 as const };
    expect(canRefit(ctx, flagship, 'light-cruiser')).toBe(false);
    expect(canRefit(ctx, merc, 'light-cruiser')).toBe(false);
  });

  it('canRefit rejects a target that is not strictly more expensive (sidegrade/downgrade)', () => {
    // Interceptor (6cr) -> Corvette (8cr, an upgrade) is legal; Corvette -> Interceptor is not.
    const corvette: PlayerShipState = { frameId: 'corvette', equipped: [], damage: 0, upgrades: [] };
    const ctx = { shopKind: 'shipyard' as const, shopFrameOffers: ['interceptor' as const], act: 1 as const };
    expect(canRefit(ctx, corvette, 'interceptor')).toBe(false);
  });

  it('canRefit rejects a target whose layout cannot hold the ship\'s current equipped set', () => {
    // Frigate (7cr, `weapon, weapon, universal`) legally carries 3 weapons
    // today; Bastion (12cr, a real upgrade by cost) is `weapon, defense,
    // defense` — 1 dedicated weapon slot, no universal overflow — so the
    // same 3 weapons don't fit it all at once.
    const ship: PlayerShipState = { frameId: 'frigate', equipped: ['ion', 'ion', 'ion'], damage: 0, upgrades: [] };
    const ctx = { shopKind: 'shipyard' as const, shopFrameOffers: ['bastion' as const], act: 1 as const };
    expect(canRefit(ctx, ship, 'bastion')).toBe(false);
  });

  it('canRefit rejects a legendary target outside act 2, accepts a non-legendary target in act 1', () => {
    const ship: PlayerShipState = { frameId: 'interceptor', equipped: ['ion'], damage: 0, upgrades: [] };
    const act1 = { shopKind: 'shipyard' as const, shopFrameOffers: ['titan' as const, 'gunboat' as const], act: 1 as const };
    expect(canRefit(act1, ship, 'titan')).toBe(false);
    expect(canRefit(act1, ship, 'gunboat')).toBe(true);
    const act2 = { ...act1, act: 2 as const };
    expect(canRefit(act2, ship, 'titan')).toBe(true);
  });

  it('canRefit requires the target to actually be in shopFrameOffers, same as BUY_SHIP', () => {
    const ship: PlayerShipState = { frameId: 'interceptor', equipped: ['ion'], damage: 0, upgrades: [] };
    const ctx = { shopKind: 'shipyard' as const, shopFrameOffers: ['gunboat' as const], act: 1 as const };
    expect(canRefit(ctx, ship, 'bastion')).toBe(false); // not offered, even though it would otherwise be legal
  });

  it('refitCost is the target frame cost less a trade-in on the current hull (hullScrapValue)', () => {
    const ship: PlayerShipState = { frameId: 'interceptor', equipped: [], damage: 0, upgrades: [] }; // 6cr, scrap 3
    expect(refitCost(ship, 'corvette')).toBe(8 - 3); // corvette 8cr
  });

  // 2026-08-12: a refit is a hull acquisition, so commander/protocol hull
  // pricing applies to it exactly as it does to BUY_SHIP. Before this, the
  // Admiral paid full list price to refit — making his own commander-screen
  // line ("Every hull costs 25% less") false on that one path.
  it('refitCost honours commander hull discounts; the trade-in stays on raw value', () => {
    const ship: PlayerShipState = { frameId: 'interceptor', equipped: [], damage: 0, upgrades: [] }; // scrap 3 either way
    // Corvette 8cr -> Admiral pays floor(8 * 0.75) = 6, less the 3 trade-in.
    expect(refitCost(ship, 'corvette', 'admiral')).toBe(6 - 3);
    expect(refitCost(ship, 'corvette', 'merchant')).toBe(8 - 3); // no hull discount — unchanged
  });

  it('REFIT_SHIP charges the discounted price for a commander with a hull discount', () => {
    const fleet: PlayerShipState[] = [
      { frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] },
      { frameId: 'interceptor', equipped: ['ion'], damage: 0, upgrades: [] },
    ];
    let state = stateWithMap('shop', {
      phase: 'shop',
      shopKind: 'shipyard',
      credits: 20,
      fleet,
      shopFrameOffers: ['corvette'],
      commanderId: 'admiral',
    });
    state = runReducer(state, { type: 'REFIT_SHIP', shipIndex: 1, frameId: 'corvette' });
    expect(state.fleet[1].frameId).toBe('corvette');
    expect(state.credits).toBe(20 - (6 - 3)); // discounted, matching what the UI shows
  });

  it('REFIT_SHIP applies the refit: new frameId, deducts refitCost, consumes the shipyard offer', () => {
    const fleet: PlayerShipState[] = [
      { frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] },
      { frameId: 'interceptor', equipped: ['ion'], damage: 0, upgrades: [], name: 'ISV Test', kills: 2, fightsSurvived: 1 },
    ];
    let state = stateWithMap('shop', {
      phase: 'shop',
      shopKind: 'shipyard',
      credits: 20,
      fleet,
      shopFrameOffers: ['corvette'],
    });
    state = runReducer(state, { type: 'REFIT_SHIP', shipIndex: 1, frameId: 'corvette' });
    expect(state.fleet[1].frameId).toBe('corvette');
    expect(state.fleet[1].equipped).toEqual(['ion']); // kept
    expect(state.fleet[1].name).toBe('ISV Test'); // kept
    expect(state.fleet[1].kills).toBe(2); // kept
    expect(state.fleet[1].fightsSurvived).toBe(1); // kept
    expect(state.credits).toBe(20 - (8 - 3)); // refitCost
    expect(state.shopFrameOffers).not.toContain('corvette'); // offer consumed, same as BUY_SHIP
  });

  it('REFIT_SHIP refuses when credits are short', () => {
    const fleet: PlayerShipState[] = [
      { frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] },
      { frameId: 'interceptor', equipped: ['ion'], damage: 0, upgrades: [] },
    ];
    const state = stateWithMap('shop', {
      phase: 'shop',
      shopKind: 'shipyard',
      credits: 0,
      fleet,
      shopFrameOffers: ['corvette'],
    });
    const result = runReducer(state, { type: 'REFIT_SHIP', shipIndex: 1, frameId: 'corvette' });
    expect(result.fleet[1].frameId).toBe('interceptor'); // unchanged
    expect(result.credits).toBe(0);
  });

  it('REFIT_SHIP clamps damage so a lower-HP target never kills the ship outright', () => {
    // Bastion (6 HP) carrying 5 damage, refitting into a Freighter (3 HP,
    // an upgrade by cost — 18cr > 12cr — despite the lower HP ceiling).
    const fleet: PlayerShipState[] = [
      { frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] },
      { frameId: 'bastion', equipped: ['ion'], damage: 5, upgrades: [] },
    ];
    const state = stateWithMap('shop', {
      phase: 'shop',
      shopKind: 'shipyard',
      credits: 999,
      fleet,
      shopFrameOffers: ['freighter'],
    });
    const result = runReducer(state, { type: 'REFIT_SHIP', shipIndex: 1, frameId: 'freighter' });
    expect(result.fleet[1].frameId).toBe('freighter');
    expect(result.fleet[1].damage).toBe(2); // clamped to newMaxHp(3) - 1, not the carried-over 5
  });
});

describe('SCUTTLE_SHIP (iteration 8, 8.7)', () => {
  it('decommissions a non-Flagship ship: parts return to inventory, upgrades are destroyed', () => {
    const fleet: PlayerShipState[] = [
      { frameId: 'cruiser', equipped: ['ion'], damage: 0, upgrades: [] },
      { frameId: 'interceptor', equipped: ['ion', 'hull1'], damage: 3, upgrades: ['spine'] },
    ];
    let state: RunState = { ...initialRunState(), phase: 'shop', fleet, inventory: [] };
    state = runReducer(state, { type: 'SCUTTLE_SHIP', shipIndex: 1 });
    expect(state.fleet).toHaveLength(1);
    expect(state.fleet[0].frameId).toBe('cruiser'); // Flagship untouched
    expect(state.inventory).toEqual(expect.arrayContaining(['ion', 'hull1']));
    expect(state.credits).toBe(0); // no refund
  });

  it('refuses to scuttle the Flagship', () => {
    const fleet: PlayerShipState[] = [{ frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] }];
    const state: RunState = { ...initialRunState(), phase: 'shop', fleet };
    const result = runReducer(state, { type: 'SCUTTLE_SHIP', shipIndex: 0 });
    expect(result.fleet).toHaveLength(1); // untouched — the fleet can never be emptied
  });

});

describe('starting hand + missile-phase auto-skip (player feedback)', () => {
  it('a new run starts with the Overdrive injector equipped (iteration 35: cards/hand removed)', () => {
    const state = initialRunState();
    expect(state.fleet[0].equipped).toContain('injector');
  });

  it('ENGAGE skips straight past an empty missile phase (round 0) when neither fleet has missiles', () => {
    let state: RunState = {
      ...stateWithMap('combat'),
      phase: 'prep',
      fleet: [{ frameId: 'cruiser', equipped: ['ion'], damage: 0, upgrades: [] }], // cannon-only
      currentEnemy: GAUNTLET[0], // scout-pack — cannon-only
      currentCombatSeed: 1,
    };
    expect(state.currentEnemy!.groups[0].stats.missiles).toEqual([]);
    state = runReducer(state, { type: 'ENGAGE' });
    expect(state.phase).toBe('combat');
    expect(state.combat?.round).toBe(1); // round 0 already resolved automatically
    expect(state.combat?.log.some((e) => e.kind === 'phase-start' && e.phase === 'missile')).toBe(true);
  });

  it('ENGAGE does NOT skip round 0 when either fleet has a missile weapon', () => {
    let state: RunState = {
      ...stateWithMap('combat'),
      phase: 'prep',
      fleet: [{ frameId: 'cruiser', equipped: ['missile'], damage: 0, upgrades: [] }],
      currentEnemy: GAUNTLET[0],
      currentCombatSeed: 1,
    };
    state = runReducer(state, { type: 'ENGAGE' });
    expect(state.combat?.round).toBe(0); // still waiting on the missile phase
  });
});

describe('CONTINUE — persists damage, salvages destroyed ships, awards credits', () => {
  it('a winning fight persists surviving damage into the fleet', () => {
    // Fleet ship with enough HP to survive the fight but take some damage.
    const fleet: PlayerShipState[] = [
      { frameId: 'cruiser', equipped: ['ion', 'ion', 'comp1', 'hull2'], damage: 0, upgrades: [] },
    ];
    const enemyDef = GAUNTLET[0]; // scout pack — weak, fleet should win

    let state: RunState = {
      ...stateWithMap('combat'),
      phase: 'combat',
      position: { col: 0, row: 0 },
      fleet,
      currentEnemy: enemyDef,
    };

    // Resolve a real fight via the engine directly (deterministic seed) to
    // get a concrete, inspectable outcome.
    const combatFleetInput = [{ stats: { initiative: 0, hp: 5, computer: 1, shield: 0, cannons: [{ diceCount: 2, damage: 1 }], missiles: [] }, initialDamage: 0 }];
    const combat = runToEnd(initCombat(combatFleetInput, enemyDef, 1));
    state = { ...state, combat };

    const before = state.credits;
    const result = runReducer(state, { type: 'CONTINUE' });

    if (combat.winner === 'player') {
      expect(result.phase).toBe('reward');
      expect(result.credits).toBeGreaterThan(before);
      expect(result.pendingReward?.creditsTotal).toBe(result.credits);
      expect(result.fleet).toHaveLength(1);
      // Iteration 46.2: every won fight now also heals 1 flat (POST_WIN_REPAIR),
      // on top of whatever damage the fight itself left behind.
      expect(result.fleet[0].damage).toBe(Math.max(0, combat.playerShips[0].damage - 1));
    } else {
      expect(result.phase).toBe('defeat');
    }
  });

  it('a destroyed ship is removed from the fleet, its parts salvage, its upgrades do not', () => {
    const fleet: PlayerShipState[] = [
      { frameId: 'cruiser', equipped: ['ion', 'comp1'], damage: 0, upgrades: [] }, // will survive
      { frameId: 'interceptor', equipped: ['ion', 'hull1'], damage: 0, upgrades: ['spine'] }, // will be destroyed
    ];

    // Build a combat state directly with one ship already-destroyed and one
    // undamaged, to test the reducer's salvage/removal logic in isolation.
    const combat = initCombat(
      [
        { stats: { initiative: 0, hp: 3, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 0 },
        { stats: { initiative: 0, hp: 1, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 1 }, // already at 0 remaining
      ],
      GAUNTLET[0],
      1,
    );
    const wonCombat = { ...combat, winner: 'player' as const };

    const state: RunState = {
      ...stateWithMap('combat'),
      phase: 'combat',
      position: { col: 0, row: 0 },
      fleet,
      currentEnemy: GAUNTLET[0],
      combat: wonCombat,
    };

    const result = runReducer(state, { type: 'CONTINUE' });
    expect(result.phase).toBe('reward');
    expect(result.fleet).toHaveLength(1);
    expect(result.fleet[0].frameId).toBe('cruiser');
    expect(result.inventory).toEqual(expect.arrayContaining(['ion', 'hull1']));
    expect(result.pendingReward?.salvagedParts).toEqual(expect.arrayContaining(['ion', 'hull1']));
    expect(result.pendingReward?.lostShips).toHaveLength(1);
    // The destroyed ship's 'spine' upgrade is gone — nowhere in the run does
    // it reappear (no upgrade pool to return it to).
    expect(result.fleet.some((s) => s.upgrades.includes('spine'))).toBe(false);
  });

  it('winning the act-1 boss pays elite credits (no pendingReward — the interlude carries the real reward) and moves to the interlude, not victory', () => {
    const fleet: PlayerShipState[] = [{ frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] }];
    const combat = initCombat(
      [{ stats: { initiative: 0, hp: 5, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 0 }],
      GAUNTLET[8],
      1,
    );
    const wonCombat = { ...combat, winner: 'player' as const };

    const state: RunState = {
      ...stateWithMap('combat'),
      phase: 'combat',
      position: { col: 10, row: 0 }, // the act-1 boss column
      fleet,
      combat: wonCombat,
    };

    const result = runReducer(state, { type: 'CONTINUE' });
    expect(result.phase).toBe('interlude');
    expect(result.pendingReward).toBeUndefined();
    expect(result.credits).toBe(21); // eliteReward(globalColumn(1, 10)) = 11 + 10 (2026-08-07: un-halved)
  });

  it('winning the final (act-2) boss ends the run in victory and skips the reward screen', () => {
    const fleet: PlayerShipState[] = [{ frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] }];
    const combat = initCombat(
      [{ stats: { initiative: 0, hp: 5, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 0 }],
      GAUNTLET[8],
      1,
    );
    const wonCombat = { ...combat, winner: 'player' as const };

    const state: RunState = {
      ...stateWithMap('combat'),
      phase: 'combat',
      act: 2,
      position: { col: bossColumn(2), row: 0 }, // the final-boss column
      fleet,
      combat: wonCombat,
    };

    const result = runReducer(state, { type: 'CONTINUE' });
    expect(result.phase).toBe('victory');
    expect(result.pendingReward).toBeUndefined();
  });

  // 2026-08-04: a boss fight — either act's — fully heals every surviving
  // ship, with no shop between here and whatever comes next to otherwise
  // repair that damage.
  it('winning the act-1 boss fully heals every surviving ship', () => {
    const fleet: PlayerShipState[] = [
      { frameId: 'cruiser', equipped: ['hull1'], damage: 3, upgrades: [] },
      { frameId: 'interceptor', equipped: ['ion'], damage: 1, upgrades: [] },
    ];
    const combat = initCombat(
      [
        { stats: { initiative: 0, hp: 5, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 3 },
        { stats: { initiative: 0, hp: 3, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 1 },
      ],
      GAUNTLET[8],
      1,
    );
    const wonCombat = { ...combat, winner: 'player' as const };
    const state: RunState = {
      ...stateWithMap('combat'),
      phase: 'combat',
      position: { col: 10, row: 0 },
      fleet,
      combat: wonCombat,
    };
    const result = runReducer(state, { type: 'CONTINUE' });
    expect(result.phase).toBe('interlude');
    expect(result.fleet.every((s) => s.damage === 0)).toBe(true);
  });

  it('winning the final (act-2) boss fully heals every surviving ship', () => {
    const fleet: PlayerShipState[] = [{ frameId: 'cruiser', equipped: ['hull1'], damage: 3, upgrades: [] }];
    const combat = initCombat(
      [{ stats: { initiative: 0, hp: 5, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 3 }],
      GAUNTLET[8],
      1,
    );
    const wonCombat = { ...combat, winner: 'player' as const };
    const state: RunState = {
      ...stateWithMap('combat'),
      phase: 'combat',
      act: 2,
      position: { col: bossColumn(2), row: 0 },
      fleet,
      combat: wonCombat,
    };
    const result = runReducer(state, { type: 'CONTINUE' });
    expect(result.phase).toBe('victory');
    expect(result.fleet.every((s) => s.damage === 0)).toBe(true);
  });
});

// 2026-08-04: the Flagship ('cruiser') can never be rebought — losing it in
// a fight the fleet otherwise survives used to just mean it was gone for
// good. Now that gates whatever the fight's natural next phase would have
// been behind a one-time salvage offer.
describe('flagship recovery (iteration 24)', () => {
  function fleetWithDestroyedFlagship(): PlayerShipState[] {
    return [
      { frameId: 'cruiser', equipped: ['ion'], damage: 0, upgrades: [], name: 'ISV Dauntless', kills: 2, fightsSurvived: 3 },
      { frameId: 'interceptor', equipped: ['ion'], damage: 0, upgrades: [] },
    ];
  }

  it('CONTINUE gates the win behind a recovery offer when the Flagship dies but the fleet survives', () => {
    const combat = initCombat(
      [
        { stats: { initiative: 0, hp: 1, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 1 }, // Flagship destroyed
        { stats: { initiative: 0, hp: 3, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 0 },
      ],
      GAUNTLET[0],
      1,
    );
    const wonCombat = { ...combat, winner: 'player' as const };
    const state: RunState = {
      ...stateWithMap('combat'),
      phase: 'combat',
      position: { col: 0, row: 0 },
      fleet: fleetWithDestroyedFlagship(),
      combat: wonCombat,
    };
    const result = runReducer(state, { type: 'CONTINUE' });
    expect(result.phase).toBe('flagship-recovery');
    expect(result.flagshipRecoveryResumePhase).toBe('reward'); // the natural outcome of a plain win
    expect(result.pendingFlagshipRecovery).toEqual({
      cost: getFrame('cruiser').cost,
      shipName: 'ISV Dauntless',
      kills: 2,
      fightsSurvived: 3,
    });
    expect(result.fleet).toHaveLength(1); // the escort, alone, until this resolves
    expect(result.fleet[0].frameId).toBe('interceptor');
  });

  it('does not gate a win where the Flagship survives', () => {
    const combat = initCombat(
      [{ stats: { initiative: 0, hp: 5, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 0 }],
      GAUNTLET[0],
      1,
    );
    const wonCombat = { ...combat, winner: 'player' as const };
    const fleet: PlayerShipState[] = [{ frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] }];
    const state: RunState = { ...stateWithMap('combat'), phase: 'combat', fleet, combat: wonCombat };
    const result = runReducer(state, { type: 'CONTINUE' });
    expect(result.phase).not.toBe('flagship-recovery');
  });

  it('RESOLVE_FLAGSHIP_RECOVERY(recover: true) rebuilds the Flagship — fresh loadout, same name and record — and deducts credits', () => {
    const gated: RunState = {
      ...initialRunState(),
      phase: 'flagship-recovery',
      flagshipRecoveryResumePhase: 'reward',
      pendingFlagshipRecovery: { cost: 14, shipName: 'ISV Dauntless', kills: 2, fightsSurvived: 3 },
      fleet: [{ frameId: 'interceptor', equipped: ['ion'], damage: 0, upgrades: [] }],
      credits: 20,
    };
    const result = runReducer(gated, { type: 'RESOLVE_FLAGSHIP_RECOVERY', recover: true });
    expect(result.phase).toBe('reward');
    expect(result.credits).toBe(6);
    expect(result.fleet).toHaveLength(2);
    expect(result.fleet[0]).toMatchObject({
      frameId: 'cruiser',
      equipped: [],
      damage: 0,
      upgrades: [],
      name: 'ISV Dauntless',
      kills: 2,
      fightsSurvived: 3,
    });
    expect(result.pendingFlagshipRecovery).toBeUndefined();
    expect(result.flagshipRecoveryResumePhase).toBeUndefined();
  });

  it('RESOLVE_FLAGSHIP_RECOVERY(recover: true) refuses without enough credits', () => {
    const gated: RunState = {
      ...initialRunState(),
      phase: 'flagship-recovery',
      flagshipRecoveryResumePhase: 'reward',
      pendingFlagshipRecovery: { cost: 14, shipName: 'ISV Dauntless', kills: 0, fightsSurvived: 0 },
      fleet: [{ frameId: 'interceptor', equipped: [], damage: 0, upgrades: [] }],
      credits: 5,
    };
    const result = runReducer(gated, { type: 'RESOLVE_FLAGSHIP_RECOVERY', recover: true });
    expect(result).toBe(gated);
  });

  it('RESOLVE_FLAGSHIP_RECOVERY(recover: false) resumes without the Flagship, spending nothing', () => {
    const gated: RunState = {
      ...initialRunState(),
      phase: 'flagship-recovery',
      flagshipRecoveryResumePhase: 'reward',
      pendingFlagshipRecovery: { cost: 14, shipName: 'ISV Dauntless', kills: 0, fightsSurvived: 0 },
      fleet: [{ frameId: 'interceptor', equipped: [], damage: 0, upgrades: [] }],
      credits: 20,
    };
    const result = runReducer(gated, { type: 'RESOLVE_FLAGSHIP_RECOVERY', recover: false });
    expect(result.phase).toBe('reward');
    expect(result.credits).toBe(20);
    expect(result.fleet).toHaveLength(1);
    expect(result.pendingFlagshipRecovery).toBeUndefined();
    expect(result.flagshipRecoveryResumePhase).toBeUndefined();
  });

  it('refuses RESOLVE_FLAGSHIP_RECOVERY outside the flagship-recovery phase', () => {
    const state = { ...initialRunState(), phase: 'map' as const };
    const result = runReducer(state, { type: 'RESOLVE_FLAGSHIP_RECOVERY', recover: false });
    expect(result).toBe(state);
  });
});

describe('CONTINUE — total defeat', () => {
  it('losing ends the run in defeat regardless of node type', () => {
    const fleet: PlayerShipState[] = [{ frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] }];
    const combat = initCombat(
      [{ stats: { initiative: 0, hp: 1, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 0 }],
      GAUNTLET[0],
      1,
    );
    const lostCombat = { ...combat, winner: 'enemy' as const };
    const state: RunState = { ...stateWithMap('combat'), phase: 'combat', fleet, combat: lostCombat };

    const result = runReducer(state, { type: 'CONTINUE' });
    expect(result.phase).toBe('defeat');
  });
});

function wonNonBossState(overrides: Partial<RunState> = {}, isElite = false): RunState {
  const fleet: PlayerShipState[] = overrides.fleet ?? [
    { frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] },
  ];
  const enemy = { ...GAUNTLET[0], id: isElite ? `${GAUNTLET[0].id}-elite` : GAUNTLET[0].id };
  const combat = initCombat(
    [{ stats: { initiative: 0, hp: 5, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 0 }],
    GAUNTLET[0],
    1,
  );
  const wonCombat = { ...combat, winner: 'player' as const };
  return {
    ...stateWithMap('combat'),
    phase: 'combat',
    position: { col: 0, row: 0 },
    fleet,
    currentEnemy: enemy,
    combat: wonCombat,
    ...overrides,
  };
}

describe('reward phase — upgrade pick and LEAVE_REWARD', () => {
  it('a regular (non-elite) win has no upgrade options and can leave immediately', () => {
    const state = runReducer(wonNonBossState(), { type: 'CONTINUE' });
    expect(state.phase).toBe('reward');
    expect(state.pendingReward?.upgradeOptions).toBeUndefined();

    const left = runReducer(state, { type: 'LEAVE_REWARD' });
    expect(left.phase).toBe('map');
    expect(left.pendingReward).toBeUndefined();
  });

  // 2026-08-07: back to 3 options — the elite-exclusive pool (iteration 39)
  // relied entirely on 'optics'/'salvage', both removed outright, so
  // elites draw 3 from the full remaining list again.
  it('an elite win offers exactly 3 upgrade options and blocks leaving until resolved', () => {
    const state = runReducer(wonNonBossState({}, true), { type: 'CONTINUE' });
    expect(state.phase).toBe('reward');
    expect(state.pendingReward?.upgradeOptions).toHaveLength(3);

    const blocked = runReducer(state, { type: 'LEAVE_REWARD' });
    expect(blocked.phase).toBe('reward'); // still blocked

    const upgradeId = state.pendingReward!.upgradeOptions![0];
    const picked = runReducer(state, { type: 'PICK_UPGRADE', upgradeId, shipIndex: 0 });
    expect(picked.fleet[0].upgrades).toContain(upgradeId);
    expect(picked.pendingReward?.upgradeOptions).toBeUndefined();

    const left = runReducer(picked, { type: 'LEAVE_REWARD' });
    expect(left.phase).toBe('map');
  });

  it('PICK_UPGRADE refuses an id that was not offered', () => {
    const state = runReducer(wonNonBossState({}, true), { type: 'CONTINUE' });
    const result = runReducer(state, { type: 'PICK_UPGRADE', upgradeId: 'zzz-not-real' as never, shipIndex: 0 });
    expect(result.fleet[0].upgrades).toHaveLength(0);
    expect(result.pendingReward?.upgradeOptions).toHaveLength(3);
  });

  it('a second upgrade replaces (destroys) the first — at most 1 permanent upgrade per ship (addendum A.4)', () => {
    const fleet: PlayerShipState[] = [{ frameId: 'cruiser', equipped: [], damage: 0, upgrades: ['spine'] }];
    const state = runReducer(wonNonBossState({ fleet }, true), { type: 'CONTINUE' });
    const upgradeId = state.pendingReward!.upgradeOptions!.find((u) => u !== 'spine') ?? state.pendingReward!.upgradeOptions![0];
    const picked = runReducer(state, { type: 'PICK_UPGRADE', upgradeId, shipIndex: 0 });
    expect(picked.fleet[0].upgrades).toEqual([upgradeId]);
    expect(picked.fleet[0].upgrades).not.toContain('spine');
  });

  // Iteration 21 (the Warlord, tall), cap bumped 2 -> 3 on 2026-08-08 (the
  // Warlord was reading as just a worse Engineer): the Flagship alone may
  // hold 3 upgrades — the second and third picks both stack instead of
  // replacing; a fourth still replaces (the oldest), keeping the cap at 3
  // rather than growing forever.
  it("the Warlord's Flagship holds 3 upgrades; the 2nd/3rd stack, a 4th replaces the oldest", () => {
    // Reward-phase states built directly (not via CONTINUE's random 3-of-7
    // draw) — this test needs 4 SPECIFIC distinct upgrade ids in sequence,
    // which a random offer can't reliably guarantee (a later draw excluding
    // 3 already-used ids can easily miss a 4th new one in only 3 options).
    const fleet: PlayerShipState[] = [{ frameId: 'cruiser', equipped: [], damage: 0, upgrades: ['spine'] }];
    const rewardState = (currentFleet: PlayerShipState[], optionId: UpgradeId): RunState => ({
      ...initialRunState(),
      phase: 'reward',
      fleet: currentFleet,
      commanderId: 'warlord',
      pendingReward: { credits: 0, creditsTotal: 0, salvagedParts: [], lostShips: [], upgradeOptions: [optionId] },
    });

    let picked = runReducer(rewardState(fleet, 'reactor'), { type: 'PICK_UPGRADE', upgradeId: 'reactor', shipIndex: 0 });
    expect(picked.fleet[0].upgrades).toEqual(['spine', 'reactor']); // stacked, not replaced

    picked = runReducer(rewardState(picked.fleet, 'lattice'), { type: 'PICK_UPGRADE', upgradeId: 'lattice', shipIndex: 0 });
    expect(picked.fleet[0].upgrades).toEqual(['spine', 'reactor', 'lattice']); // stacked again — cap is 3 now

    picked = runReducer(rewardState(picked.fleet, 'drives'), { type: 'PICK_UPGRADE', upgradeId: 'drives', shipIndex: 0 });
    expect(picked.fleet[0].upgrades).toHaveLength(3); // cap holds at 3
    expect(picked.fleet[0].upgrades).toEqual(['reactor', 'lattice', 'drives']); // oldest ('spine') fell off
  });

  it('a non-Flagship ship is still capped at 1 upgrade even for the Warlord', () => {
    const fleet: PlayerShipState[] = [
      { frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] },
      { frameId: 'interceptor', equipped: [], damage: 0, upgrades: ['spine'] },
    ];
    const combat = initCombat(
      [
        { stats: { initiative: 0, hp: 5, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 0 },
        { stats: { initiative: 2, hp: 2, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 0 },
      ],
      { ...GAUNTLET[0], id: `${GAUNTLET[0].id}-elite` },
      1,
    );
    const state = runReducer(
      {
        ...stateWithMap('combat'),
        phase: 'combat',
        position: { col: 0, row: 0 },
        fleet,
        currentEnemy: { ...GAUNTLET[0], id: `${GAUNTLET[0].id}-elite` },
        combat: { ...combat, winner: 'player' as const },
        commanderId: 'warlord',
      },
      { type: 'CONTINUE' },
    );
    const upgradeId = state.pendingReward!.upgradeOptions!.find((u) => u !== 'spine')!;
    const picked = runReducer(state, { type: 'PICK_UPGRADE', upgradeId, shipIndex: 1 });
    expect(picked.fleet[1].upgrades).toEqual([upgradeId]); // replaced, not stacked
  });
});

describe('upgrades — regen', () => {
  it('regen heals damage on the surviving ship after a win', () => {
    // Constructed (not simulated) combat state, held at its initial values —
    // no rounds resolved, so the ship's end damage is exactly the 4 it
    // carried in. Deterministic, unlike running the fight to completion.
    const combatFleetInput = [
      { stats: { initiative: 0, hp: 10, computer: 1, shield: 0, cannons: [{ diceCount: 2, damage: 1 }], missiles: [] }, initialDamage: 4 },
    ];
    const combat = initCombat(combatFleetInput, GAUNTLET[0], 1);
    const wonCombat = { ...combat, winner: 'player' as const };
    const state = wonNonBossState({
      fleet: [{ frameId: 'cruiser', equipped: [], damage: 4, upgrades: ['regen'] }],
      combat: wonCombat,
    });
    const result = runReducer(state, { type: 'CONTINUE' });
    // regen (1) + the universal POST_WIN_REPAIR (2, iteration 46.2) = 3.
    expect(result.fleet[0].damage).toBe(1);
  });
});

describe('PICK_NODE — escalations apply to the chosen enemy', () => {
  it('an escalation only affects the enemy once past its column', () => {
    let state = stateWithMap('combat', {
      escalations: [{ id: 'hardened', act: 1, landsAfterColumn: 2, revealed: false }],
    });

    // Column 0: escalation not yet active.
    let result = runReducer(state, { type: 'PICK_NODE', row: 0 });
    const freshHp = result.currentEnemy!.groups[0].stats.hp;

    // Simulate being at column 3 (past landsAfterColumn: 2) picking again.
    state = {
      ...state,
      position: { col: 2, row: 0 },
      map: {
        ...state.map,
        act1Columns: state.map.act1Columns.map((c, i) =>
          i === 3 ? c.map((n) => ({ ...n, type: 'combat' as const })) : c,
        ),
      },
    };
    result = runReducer(state, { type: 'PICK_NODE', row: 0 });
    expect(result.currentEnemy!.groups[0].stats.hp).toBeGreaterThan(freshHp - 1);
    expect(result.currentEnemy!.appliedEscalations).toContain('hardened');
  });
});

describe('ambush events (ancient-cache)', () => {
  it('choosing to force it open sets an ambush; EVENT_CONTINUE routes to prep with that enemy', () => {
    let state = stateWithMap('event', { phase: 'event', currentEvent: { eventId: 'ancient-cache' } });
    state = runReducer(state, { type: 'EVENT_CHOOSE', choiceIndex: 1 }); // "Force it open"
    expect(state.currentEvent?.ambushEnemy).toBeDefined();

    const result = runReducer(state, { type: 'EVENT_CONTINUE' });
    expect(result.phase).toBe('prep');
    expect(result.currentEnemy).toEqual(state.currentEvent!.ambushEnemy);
    expect(result.currentEvent).toBeUndefined();
  });

  it('declining sets no ambush and EVENT_CONTINUE goes straight to the map', () => {
    let state = stateWithMap('event', { phase: 'event', currentEvent: { eventId: 'ancient-cache' } });
    state = runReducer(state, { type: 'EVENT_CHOOSE', choiceIndex: 0 }); // "Leave it sealed"
    expect(state.currentEvent?.ambushEnemy).toBeUndefined();

    const result = runReducer(state, { type: 'EVENT_CONTINUE' });
    expect(result.phase).toBe('map');
  });

  it('winning an ambush pays the normal column reward, not an elite/boss one', () => {
    const enemy = GAUNTLET[0];
    const combat = initCombat(
      [{ stats: { initiative: 0, hp: 5, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 0 }],
      enemy,
      1,
    );
    const wonCombat = { ...combat, winner: 'player' as const };
    const base = stateWithMap('event');
    const state: RunState = {
      ...base,
      // The event node's own column — forced (not just left to the random
      // map) so this reward isn't accidentally cargo-adjusted (15.1: cargo
      // only ever lands on 'combat' nodes anyway, but forcing it keeps this
      // test's expectation seed-independent).
      map: forceNodeType(base.map, 1, 0, 'event', base.act),
      phase: 'combat',
      position: { col: 1, row: 0 }, // the event node's own column
      fleet: [{ frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] }],
      currentEnemy: enemy, // not elite/boss
      combat: wonCombat,
    };
    const result = runReducer(state, { type: 'CONTINUE' });
    expect(result.phase).toBe('reward');
    expect(result.pendingReward?.credits).toBe(4); // winReward(1) = floor((7 + 1) / 2) (2026-08-08: cols 1-3 halved)
    expect(result.pendingReward?.upgradeOptions).toBeUndefined();
  });
});

describe('EVENT_CHOOSE — framework validation (14.1)', () => {
  it('a locked (unmet-requirement) option is a no-op', () => {
    // ancient-cache's option 2 requires a Cloaking field — nobody has one.
    const state = stateWithMap('event', { phase: 'event', currentEvent: { eventId: 'ancient-cache' } });
    const result = runReducer(state, { type: 'EVENT_CHOOSE', choiceIndex: 2 });
    expect(result).toEqual(state);
  });

  it('a chooseShip option without a valid shipIndex is a no-op', () => {
    const state = stateWithMap('event', { phase: 'event', currentEvent: { eventId: 'derelict-cruiser' } });
    const missing = runReducer(state, { type: 'EVENT_CHOOSE', choiceIndex: 1 });
    expect(missing).toEqual(state);
    const outOfRange = runReducer(state, { type: 'EVENT_CHOOSE', choiceIndex: 1, shipIndex: 99 });
    expect(outOfRange).toEqual(state);
  });

  it('a choosePart option without that part actually in inventory is a no-op', () => {
    const state = stateWithMap('event', {
      phase: 'event',
      currentEvent: { eventId: 'militia-requisition' },
      inventory: ['ion'],
    });
    const missing = runReducer(state, { type: 'EVENT_CHOOSE', choiceIndex: 1 });
    expect(missing).toEqual(state);
    const wrongPart = runReducer(state, { type: 'EVENT_CHOOSE', choiceIndex: 1, partId: 'comp1' });
    expect(wrongPart).toEqual(state);
  });

  it('a chosen part actually leaves the inventory once validated', () => {
    const state = stateWithMap('event', {
      phase: 'event',
      currentEvent: { eventId: 'militia-requisition' },
      inventory: ['ion'],
    });
    const result = runReducer(state, { type: 'EVENT_CHOOSE', choiceIndex: 1, partId: 'ion' });
    expect(result.inventory).not.toContain('ion');
    expect(result.credits).toBe(state.credits + 7);
  });

  it('an out-of-range choiceIndex is a no-op', () => {
    const state = stateWithMap('event', { phase: 'event', currentEvent: { eventId: 'militia-requisition' } });
    const result = runReducer(state, { type: 'EVENT_CHOOSE', choiceIndex: 5 });
    expect(result).toEqual(state);
  });

  // 2026-08-07 bug fix: the Detour option ("-2 credits") had no
  // `creditsAtLeast` requirement, unlike every other negative-credit
  // option in events.ts — it was pickable at 0-1cr with no way to pay it.
  // Now it's refused below 2cr, same as its siblings.
  it('the Detour option is refused below its 2-credit cost, not clamped to 0', () => {
    const state = stateWithMap('event', {
      phase: 'event',
      currentEvent: { eventId: 'asteroid-field' },
      credits: 1,
    });
    const result = runReducer(state, { type: 'EVENT_CHOOSE', choiceIndex: 0 }); // detour, -2
    expect(result.credits).toBe(1); // refused — unchanged
    expect(result.currentEvent?.outcomeText).toBeUndefined(); // still undecided
  });

  it('the Detour option succeeds at exactly its cost and clamps at 0', () => {
    const state = stateWithMap('event', {
      phase: 'event',
      currentEvent: { eventId: 'asteroid-field' },
      credits: 2,
    });
    const result = runReducer(state, { type: 'EVENT_CHOOSE', choiceIndex: 0 }); // detour, -2
    expect(result.credits).toBe(0);
    expect(result.currentEvent?.outcomeText).toBeDefined();
  });

  it('a second EVENT_CHOOSE dispatch after the event is already decided is a no-op', () => {
    const state = stateWithMap('event', { phase: 'event', currentEvent: { eventId: 'derelict-cruiser' } });
    const decided = runReducer(state, { type: 'EVENT_CHOOSE', choiceIndex: 0 });
    expect(decided.currentEvent?.outcomeText).toBeDefined();
    const again = runReducer(decided, { type: 'EVENT_CHOOSE', choiceIndex: 0 });
    expect(again).toEqual(decided); // credits not doubled, nothing changed further
  });
});

describe('defector pursuit chain (14.3)', () => {
  it('taking the defector aboard sets pendingEventId; turning them in does not', () => {
    const state = stateWithMap('event', { phase: 'event', currentEvent: { eventId: 'defector' } });

    const turnedIn = runReducer(state, { type: 'EVENT_CHOOSE', choiceIndex: 0 });
    expect(turnedIn.pendingEventId).toBeUndefined();

    const aboard = runReducer(state, { type: 'EVENT_CHOOSE', choiceIndex: 1 });
    expect(aboard.pendingEventId).toBe('defector-pursuit');
    // Escalations are revealed immediately — no takebacks later, whatever
    // happens in the pursuit.
    expect(aboard.escalations.every((e) => e.revealed)).toBe(true);
  });

  it('the next event node draws the pursuit instead of rolling the pool, then clears the field', () => {
    let state = runReducer(stateWithMap('event'), { type: 'PICK_NODE', row: 0 }); // position -> col 0
    state = { ...state, currentEvent: { eventId: 'defector' } };
    state = runReducer(state, { type: 'EVENT_CHOOSE', choiceIndex: 1 }); // take them aboard
    expect(state.pendingEventId).toBe('defector-pursuit');
    state = runReducer(state, { type: 'EVENT_CONTINUE' });
    expect(state.phase).toBe('map');
    expect(state.pendingEventId).toBe('defector-pursuit'); // still queued, not yet consumed

    const nextMap = forceNodeType(state.map, 1, 0, 'event', state.act);
    state = { ...state, map: nextMap };
    state = runReducer(state, { type: 'PICK_NODE', row: 0 });
    expect(state.currentEvent?.eventId).toBe('defector-pursuit');
    expect(state.pendingEventId).toBeUndefined();
  });

  it('pendingEventId survives a non-event node visited in between', () => {
    let state = runReducer(stateWithMap('event'), { type: 'PICK_NODE', row: 0 });
    state = { ...state, currentEvent: { eventId: 'defector' } };
    state = runReducer(state, { type: 'EVENT_CHOOSE', choiceIndex: 1 });
    state = runReducer(state, { type: 'EVENT_CONTINUE' });

    const combatMap = forceNodeType(state.map, 1, 0, 'combat', state.act);
    state = { ...state, map: combatMap };
    state = runReducer(state, { type: 'PICK_NODE', row: 0 });
    expect(state.phase).toBe('prep'); // an ordinary fight, unrelated to the chain
    expect(state.pendingEventId).toBe('defector-pursuit'); // untouched

    // Resolve the fight and move on to a forced event node next.
    state = { ...state, phase: 'map' };
    const eventMap = forceNodeType(state.map, 2, 0, 'event', state.act);
    state = { ...state, map: eventMap };
    state = runReducer(state, { type: 'PICK_NODE', row: 0 });
    expect(state.currentEvent?.eventId).toBe('defector-pursuit');
    expect(state.pendingEventId).toBeUndefined();
  });
});

describe('iteration 34: the relic chain', () => {
  it('a pending defector-pursuit still outranks the relic continuation check at PICK_NODE', () => {
    // Both conditions are live at once: relicFragments 1 (continuation
    // check would normally fire ~half the time) AND a queued
    // pendingEventId — the `??` in PICK_NODE's event branch means
    // drawEvent is never even called, so the pending event always wins
    // regardless of what the continuation roll would have done.
    const state = stateWithMap('event', {
      relicFragments: 1,
      pendingEventId: 'defector-pursuit',
    });
    const result = runReducer(state, { type: 'PICK_NODE', row: 0 });
    expect(result.currentEvent?.eventId).toBe('defector-pursuit');
    expect(result.pendingEventId).toBeUndefined();
  });

  it('a fresh event node with no relic progress can draw relic-signal from the base pool', () => {
    // Seed sweep rather than a single fixed seed — pool order/rng mapping
    // is an implementation detail; this just confirms relic-signal is a
    // real, reachable outcome of a normal draw at relicFragments 0.
    let sawSignal = false;
    for (let seed = 1; seed <= 100 && !sawSignal; seed++) {
      const state = stateWithMap('event', { relicFragments: 0 });
      const result = runReducer({ ...state, rngCounter: 0, map: { ...state.map, seed } }, { type: 'PICK_NODE', row: 0 });
      if (result.currentEvent?.eventId === 'relic-signal') sawSignal = true;
    }
    expect(sawSignal).toBe(true);
  });

  it('relicFragments 1 sometimes draws relic-vault at an event node (continuation check reachable end-to-end)', () => {
    let sawVault = false;
    for (let seed = 1; seed <= 100 && !sawVault; seed++) {
      const state = stateWithMap('event', { relicFragments: 1 });
      const result = runReducer({ ...state, rngCounter: 0, map: { ...state.map, seed } }, { type: 'PICK_NODE', row: 0 });
      if (result.currentEvent?.eventId === 'relic-vault') sawVault = true;
    }
    expect(sawVault).toBe(true);
  });

  it('relicFragments 3 (complete) never draws relic-vault or relic-core again', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const state = stateWithMap('event', { relicFragments: 3 });
      const result = runReducer({ ...state, rngCounter: 0, map: { ...state.map, seed } }, { type: 'PICK_NODE', row: 0 });
      expect(result.currentEvent?.eventId).not.toBe('relic-vault');
      expect(result.currentEvent?.eventId).not.toBe('relic-core');
    }
  });

  it('completing stage 3 grants the artifact via the normal EVENT_CHOOSE path, end to end', () => {
    let state = stateWithMap('event', {
      phase: 'event',
      relicFragments: 2,
      credits: 10,
      currentEvent: { eventId: 'relic-core' },
    });
    state = runReducer(state, { type: 'EVENT_CHOOSE', choiceIndex: 1 }); // buy the final fragment
    expect(state.relicFragments).toBe(3);
    expect(state.inventory).toContain('ancient-artifact');
    expect(state.credits).toBe(2);
  });

  it('equipping the artifact moves a ship\'s computer and piloting readouts by 4 each (derive-time fold)', () => {
    const fleet: PlayerShipState[] = [{ frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] }];
    const before = deriveStats(fleet[0].frameId, fleet[0].equipped);
    const state = stateWithMap('shop', { phase: 'shop', shopKind: 'store', fleet, inventory: ['ancient-artifact'] });
    const equipped = runReducer(state, { type: 'EQUIP', shipIndex: 0, partId: 'ancient-artifact' });
    const after = deriveStats(equipped.fleet[0].frameId, equipped.fleet[0].equipped);
    expect(after.computer).toBe(before.computer + 4);
    expect(after.shield).toBe(before.shield + 4);
  });
});

describe('ambush win bonus (14.2/14.3)', () => {
  it('EVENT_CONTINUE carries the resolved ambush bonus onto RunState.pendingAmbushBonus', () => {
    let state = stateWithMap('event', { phase: 'event', currentEvent: { eventId: 'distress-beacon' } });
    state = runReducer(state, { type: 'EVENT_CHOOSE', choiceIndex: 1 }); // drive the raiders off
    expect(state.currentEvent?.ambushBonus?.credits).toBe(2); // 2026-08-08: retuned down from 6

    const result = runReducer(state, { type: 'EVENT_CONTINUE' });
    expect(result.phase).toBe('prep');
    expect(result.pendingAmbushBonus).toEqual(state.currentEvent!.ambushBonus);
  });

  it('winning the ambush combat pays out the bonus credits and part, then clears the field', () => {
    const enemy = GAUNTLET[0];
    const combat = initCombat(
      [{ stats: { initiative: 0, hp: 5, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 0 }],
      enemy,
      1,
    );
    const wonCombat = { ...combat, winner: 'player' as const };
    const base = stateWithMap('event');
    const state: RunState = {
      ...base,
      map: forceNodeType(base.map, 1, 0, 'event', base.act), // cargo-neutral (15.1) — see the identical fix above
      phase: 'combat',
      position: { col: 1, row: 0 },
      fleet: [{ frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] }],
      currentEnemy: enemy,
      combat: wonCombat,
      pendingAmbushBonus: { credits: 6, partId: 'plasma' },
    };
    const result = runReducer(state, { type: 'CONTINUE' });
    expect(result.phase).toBe('reward');
    expect(result.pendingReward?.credits).toBe(4 + 6); // winReward(1) = floor(8/2) (2026-08-08: halved) + the ambush bonus
    expect(result.inventory).toContain('plasma');
    expect(result.pendingAmbushBonus).toBeUndefined();
  });

});

describe('boss variety + dossier (iteration 5)', () => {
  function stateAtBoss(overrides: Partial<RunState> = {}): RunState {
    const base = initialRunState();
    return {
      ...base,
      phase: 'map',
      position: { col: 9, row: 0 },
      visited: [{ col: 8, row: 0 }, { col: 9, row: 0 }],
      ...overrides,
    };
  }

  it('PICK_NODE at the boss column brings up the enemy matching the map\'s seeded act-1 bossId', () => {
    const state = stateAtBoss();
    const result = runReducer(state, { type: 'PICK_NODE', row: 0 });
    expect(result.phase).toBe('prep');
    expect(result.currentEnemy!.id).toBe(state.map.act1BossId);
  });

  it('the boss starts unrevealed — it is now uncovered by Spymaster intelligence, never bought', () => {
    expect(initialRunState().bossRevealed).toBe(false);
  });
});

describe('expansion bay upgrade (iteration 5)', () => {
  it('a bay upgrade grants a 7th slot on a Flagship (6 base slots)', () => {
    const ship: PlayerShipState = {
      frameId: 'cruiser',
      equipped: ['ion', 'ion', 'comp1', 'hull1', 'shield1', 'ion'], // 6/6 full
      damage: 0,
      upgrades: ['bay'],
    };
    let state: RunState = { ...initialRunState(), phase: 'shop', fleet: [ship], inventory: ['plasma'] };
    state = runReducer(state, { type: 'EQUIP', shipIndex: 0, partId: 'plasma' });
    expect(state.fleet[0].equipped).toContain('plasma'); // 7th slot fits
  });

  it('a bay upgrade grants exactly +1 slot, uncapped (iteration 8, addendum A.4: at most 1 upgrade per ship)', () => {
    const ship: PlayerShipState = {
      frameId: 'cruiser',
      equipped: Array(7).fill('ion') as PlayerShipState['equipped'], // 6 base + 1 from the bay
      damage: 0,
      upgrades: ['bay'],
    };
    let state: RunState = { ...initialRunState(), phase: 'shop', fleet: [ship], inventory: ['plasma'] };
    state = runReducer(state, { type: 'EQUIP', shipIndex: 0, partId: 'plasma' });
    expect(state.fleet[0].equipped).not.toContain('plasma'); // already at the bay-extended 7-slot cap
  });

  it('a bay upgrade is lost along with the ship that dies carrying it, same as any other upgrade', () => {
    const fleet: PlayerShipState[] = [
      { frameId: 'interceptor', equipped: ['ion'], damage: 0, upgrades: ['bay'] }, // destroyed
    ];
    const combat = initCombat(
      [{ stats: { initiative: 0, hp: 1, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 1 }],
      GAUNTLET[0],
      1,
    );
    const wonCombat = { ...combat, winner: 'player' as const };
    const state: RunState = {
      ...stateWithMap('combat'),
      phase: 'combat',
      position: { col: 0, row: 0 },
      fleet,
      currentEnemy: GAUNTLET[0],
      combat: wonCombat,
    };
    const result = runReducer(state, { type: 'CONTINUE' });
    expect(result.fleet).toHaveLength(0); // the ship (and its bay upgrade) is gone
    expect(result.inventory).toContain('ion'); // only the part salvages
  });
});

describe('fog of war + info broker (iteration 6)', () => {
  it('starts at visionCol 0 (column 0 only) and advances by 1 with each PICK_NODE', () => {
    let state = initialRunState();
    expect(state.visionCol).toBe(0);
    state = { ...state, phase: 'map' };
    state = runReducer(state, { type: 'PICK_NODE', row: 0 });
    expect(state.visionCol).toBe(1); // now at col 0, so col 0+1 visible
  });

});

describe('BUY_COMMODITY_LOT / EQUIP / SELL_COMMODITY_LOT (iteration 20, decoupled 2026-08-06)', () => {
  it('buys a lot straight to inventory for 4cr — no ship chosen at purchase time', () => {
    let state = stateWithMap('shop', { phase: 'shop', credits: 10 });
    state = runReducer(state, { type: 'BUY_COMMODITY_LOT' });
    expect(state.inventory).toContain('commodity-lot');
    expect(state.fleet[0].equipped).not.toContain('commodity-lot'); // not auto-equipped
    expect(state.credits).toBe(6);
  });

  it('refuses without 4cr, or if the fleet already owns a lot (equipped or still in inventory)', () => {
    const poor = stateWithMap('shop', { phase: 'shop', credits: 3 });
    const poorResult = runReducer(poor, { type: 'BUY_COMMODITY_LOT' });
    expect(poorResult.inventory).not.toContain('commodity-lot');
    expect(poorResult.credits).toBe(3);

    const alreadyEquipped = stateWithMap('shop', {
      phase: 'shop',
      credits: 10,
      fleet: [{ frameId: 'cruiser', equipped: ['commodity-lot'], damage: 0, upgrades: [] }],
    });
    const equippedResult = runReducer(alreadyEquipped, { type: 'BUY_COMMODITY_LOT' });
    expect(equippedResult.inventory).not.toContain('commodity-lot');
    expect(equippedResult.credits).toBe(10); // unspent — the buy never happened

    const alreadyInInventory = stateWithMap('shop', { phase: 'shop', credits: 10, inventory: ['commodity-lot'] });
    const inventoryResult = runReducer(alreadyInInventory, { type: 'BUY_COMMODITY_LOT' });
    expect(inventoryResult.inventory).toEqual(['commodity-lot']); // still just the one — cap, not stacked
    expect(inventoryResult.credits).toBe(10);
  });

  it('EQUIP loads a bought lot onto a ship and stamps the global column it was equipped at', () => {
    let state = stateWithMap('shop', { phase: 'shop', credits: 10, position: { col: 2, row: 0 }, inventory: ['commodity-lot'] });
    state = runReducer(state, { type: 'EQUIP', shipIndex: 0, partId: 'commodity-lot' as PartId });
    expect(state.fleet[0].equipped).toContain('commodity-lot');
    expect(state.inventory).not.toContain('commodity-lot');
    expect(state.fleet[0].commodityLotBoughtAtGlobalColumn).toBe(globalColumn(1, 2));
  });

  it('EQUIP refuses to load a lot onto a mercenary — it would be lost with the ship after one fight', () => {
    const fleet: PlayerShipState[] = [
      { frameId: 'interceptor', equipped: ['ion'], damage: 0, upgrades: [], mercenary: true },
    ];
    const state = stateWithMap('shop', { phase: 'shop', credits: 10, fleet, inventory: ['commodity-lot'] });
    const result = runReducer(state, { type: 'EQUIP', shipIndex: 0, partId: 'commodity-lot' as PartId });
    expect(result.fleet[0].equipped).not.toContain('commodity-lot');
    expect(result.inventory).toContain('commodity-lot'); // still sitting in inventory, unspent
  });

  it('EQUIP still refuses a full ship — no free slot for the lot either', () => {
    const dreadnoughtFull: PlayerShipState[] = [
      { frameId: 'dreadnought', equipped: Array(8).fill('hull1') as PartId[], damage: 0, upgrades: [] },
    ];
    const state = stateWithMap('shop', { phase: 'shop', credits: 10, fleet: dreadnoughtFull, inventory: ['commodity-lot'] });
    const result = runReducer(state, { type: 'EQUIP', shipIndex: 0, partId: 'commodity-lot' as PartId });
    expect(result.fleet[0].equipped).not.toContain('commodity-lot');
  });

  // 2026-08-06: the Merchant's lot cap was 2 (everyone else 1) — doubling
  // the cap on top of an already-cheaper buy price didn't just widen the
  // margin, it doubled the whole buy-low-sell-high loop every single shop
  // visit, which compounded into "way too much money" over a full run.
  // Both commanders are capped at 1 lot now; only the buy price still
  // differs (3cr Merchant vs 4cr base) — a real but modest edge.
  it('everyone — Merchant included — is capped at 1 owned lot; only the buy price differs (3cr vs 4cr)', () => {
    const plain = stateWithMap('shop', { phase: 'shop', credits: 10 });
    let plainState = runReducer(plain, { type: 'BUY_COMMODITY_LOT' });
    expect(plainState.credits).toBe(6); // 4cr base price
    plainState = runReducer(plainState, { type: 'BUY_COMMODITY_LOT' });
    expect(plainState.credits).toBe(6); // second buy refused — capped at 1
    expect(plainState.inventory).toEqual(['commodity-lot']);

    const merchant = stateWithMap('shop', { phase: 'shop', credits: 10, commanderId: 'merchant' });
    let merchantState = runReducer(merchant, { type: 'BUY_COMMODITY_LOT' });
    expect(merchantState.credits).toBe(7); // 3cr Merchant price
    merchantState = runReducer(merchantState, { type: 'BUY_COMMODITY_LOT' });
    expect(merchantState.credits).toBe(7); // second buy refused — capped at 1, same as everyone else
    expect(merchantState.inventory).toEqual(['commodity-lot']);
  });

  it('UNEQUIP refuses to remove the commodity lot to inventory — SELL_COMMODITY_LOT is the only way out', () => {
    const fleet: PlayerShipState[] = [{ frameId: 'cruiser', equipped: ['commodity-lot'], damage: 0, upgrades: [] }];
    let state: RunState = { ...initialRunState(), phase: 'prep', fleet };
    state = runReducer(state, { type: 'UNEQUIP', shipIndex: 0, partId: 'commodity-lot' as PartId });
    expect(state.fleet[0].equipped).toContain('commodity-lot');
    expect(state.inventory).not.toContain('commodity-lot');
  });

  // 2026-08-06: buying to inventory (rather than straight onto a ship)
  // exposed the lot to the generic per-item Sell button every other
  // inventory part gets — its listed cost is 0, so that button would have
  // quietly destroyed it for no refund. SELL_COMMODITY_LOT is the only
  // sanctioned way to cash one in.
  it('SELL_PART refuses a commodity lot sitting in inventory — no free-destroy via the generic sell button', () => {
    const state = stateWithMap('shop', { phase: 'shop', credits: 0, inventory: ['commodity-lot' as PartId] });
    const result = runReducer(state, { type: 'SELL_PART', partId: 'commodity-lot' as PartId });
    expect(result.inventory).toContain('commodity-lot');
    expect(result.credits).toBe(0);
  });

  it('SELL refuses at the same global column it was bought, and refuses if nothing carries a lot', () => {
    const noLot = stateWithMap('shop', { phase: 'shop', credits: 0, position: { col: 5, row: 0 } });
    expect(runReducer(noLot, { type: 'SELL_COMMODITY_LOT' }).credits).toBe(0);

    const sameColumn = stateWithMap('shop', {
      phase: 'shop',
      credits: 0,
      position: { col: 2, row: 0 },
      fleet: [
        {
          frameId: 'cruiser',
          equipped: ['commodity-lot'],
          damage: 0,
          upgrades: [],
          commodityLotBoughtAtGlobalColumn: globalColumn(1, 2),
        },
      ],
    });
    const result = runReducer(sameColumn, { type: 'SELL_COMMODITY_LOT' });
    expect(result.credits).toBe(0); // still can't flip it at the station it was bought at
    expect(result.fleet[0].equipped).toContain('commodity-lot');
  });

  it('SELL at a later station pays 9cr, removes the lot from whichever ship carries it, and clears the record', () => {
    const state = stateWithMap('shop', {
      phase: 'shop',
      credits: 0,
      position: { col: 5, row: 0 },
      fleet: [
        { frameId: 'cruiser', equipped: ['ion'], damage: 0, upgrades: [] },
        {
          frameId: 'interceptor',
          equipped: ['ion', 'commodity-lot'],
          damage: 0,
          upgrades: [],
          commodityLotBoughtAtGlobalColumn: globalColumn(1, 2),
        },
      ],
    });
    const result = runReducer(state, { type: 'SELL_COMMODITY_LOT' });
    expect(result.credits).toBe(9);
    expect(result.fleet[1].equipped).not.toContain('commodity-lot');
    expect(result.fleet[1].equipped).toContain('ion'); // its real part is untouched
    expect(result.fleet[1].commodityLotBoughtAtGlobalColumn).toBeUndefined();
  });

  it('SELL pays out for every eligible lot at once, not just one', () => {
    const state = stateWithMap('shop', {
      phase: 'shop',
      credits: 0,
      commanderId: 'merchant',
      position: { col: 6, row: 0 },
      fleet: [
        {
          frameId: 'cruiser',
          equipped: ['commodity-lot'],
          damage: 0,
          upgrades: [],
          commodityLotBoughtAtGlobalColumn: globalColumn(1, 2), // eligible
        },
        {
          frameId: 'interceptor',
          equipped: ['commodity-lot'],
          damage: 0,
          upgrades: [],
          commodityLotBoughtAtGlobalColumn: globalColumn(1, 6), // bought THIS visit — not eligible yet
        },
      ],
    });
    const result = runReducer(state, { type: 'SELL_COMMODITY_LOT' });
    expect(result.credits).toBe(9); // only the eligible one sold
    expect(result.fleet[0].equipped).not.toContain('commodity-lot');
    expect(result.fleet[1].equipped).toContain('commodity-lot'); // still riding along
  });

  it('a lot is lost, not salvaged, if the ship carrying it is destroyed', () => {
    const fleet: PlayerShipState[] = [
      { frameId: 'interceptor', equipped: ['ion', 'commodity-lot'], damage: 1, upgrades: [] }, // destroyed
    ];
    const combat = initCombat(
      [{ stats: { initiative: 0, hp: 1, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 1 }],
      GAUNTLET[0],
      1,
    );
    const state: RunState = {
      ...stateWithMap('combat'),
      phase: 'combat',
      position: { col: 0, row: 0 },
      fleet,
      currentEnemy: GAUNTLET[0],
      combat: { ...combat, winner: 'player' as const },
    };
    const result = runReducer(state, { type: 'CONTINUE' });
    expect(result.inventory).not.toContain('commodity-lot');
  });

  it('SCUTTLE_SHIP loses the lot with the ship rather than salvaging it', () => {
    const fleet: PlayerShipState[] = [
      { frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] },
      { frameId: 'interceptor', equipped: ['ion', 'commodity-lot'], damage: 0, upgrades: [] },
    ];
    let state = stateWithMap('shop', { phase: 'shop', fleet });
    state = runReducer(state, { type: 'SCUTTLE_SHIP', shipIndex: 1 });
    expect(state.inventory).toContain('ion'); // the real part still salvages
    expect(state.inventory).not.toContain('commodity-lot');
  });
});

describe('BUY_REPAIR (2026-08-06): pay a shop 2cr/HP to fully heal one ship', () => {
  it('fully heals the ship and charges damage * 2cr', () => {
    const fleet: PlayerShipState[] = [{ frameId: 'cruiser', equipped: [], damage: 3, upgrades: [] }];
    let state = stateWithMap('shop', { phase: 'shop', credits: 10, fleet });
    state = runReducer(state, { type: 'BUY_REPAIR', shipIndex: 0 });
    expect(state.fleet[0].damage).toBe(0);
    expect(state.credits).toBe(4); // 10 - 3*2
  });

  it('refuses if unaffordable — no partial repair, damage and credits untouched', () => {
    const fleet: PlayerShipState[] = [{ frameId: 'cruiser', equipped: [], damage: 3, upgrades: [] }];
    const state = stateWithMap('shop', { phase: 'shop', credits: 5, fleet }); // needs 6cr, has 5
    const result = runReducer(state, { type: 'BUY_REPAIR', shipIndex: 0 });
    expect(result.fleet[0].damage).toBe(3);
    expect(result.credits).toBe(5);
  });

  it('is a no-op on an already-undamaged ship', () => {
    const fleet: PlayerShipState[] = [{ frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] }];
    const state = stateWithMap('shop', { phase: 'shop', credits: 10, fleet });
    const result = runReducer(state, { type: 'BUY_REPAIR', shipIndex: 0 });
    expect(result.credits).toBe(10);
  });

  it('only works in the shop phase', () => {
    const fleet: PlayerShipState[] = [{ frameId: 'cruiser', equipped: [], damage: 3, upgrades: [] }];
    const state: RunState = { ...initialRunState(), phase: 'prep', credits: 10, fleet };
    const result = runReducer(state, { type: 'BUY_REPAIR', shipIndex: 0 });
    expect(result.fleet[0].damage).toBe(3);
    expect(result.credits).toBe(10);
  });

  it('repairs each ship independently, priced off its own damage', () => {
    const fleet: PlayerShipState[] = [
      { frameId: 'cruiser', equipped: [], damage: 1, upgrades: [] },
      { frameId: 'interceptor', equipped: ['ion'], damage: 4, upgrades: [] },
    ];
    let state = stateWithMap('shop', { phase: 'shop', credits: 20, fleet });
    state = runReducer(state, { type: 'BUY_REPAIR', shipIndex: 1 });
    expect(state.fleet[1].damage).toBe(0);
    expect(state.fleet[0].damage).toBe(1); // untouched
    expect(state.credits).toBe(12); // 20 - 4*2
  });
});

describe('BUY_MERCENARY (iteration 20)', () => {
  it('hires an Interceptor flagged mercenary, pre-fitted with an ion cannon, for 5cr', () => {
    let state = stateWithMap('shop', { phase: 'shop', credits: 20 });
    state = runReducer(state, { type: 'BUY_MERCENARY' });
    expect(state.fleet).toHaveLength(2);
    expect(state.fleet[1]).toMatchObject({ frameId: 'interceptor', equipped: ['ion'], mercenary: true });
    expect(state.credits).toBe(15);
  });

  it('does not consume the ship-naming counter — a hire is not a commissioned ship', () => {
    let state = stateWithMap('shop', { phase: 'shop', credits: 20 });
    const before = state.shipsCommissioned;
    state = runReducer(state, { type: 'BUY_MERCENARY' });
    expect(state.shipsCommissioned).toBe(before);
  });

  it('refuses without 5cr', () => {
    const poor = stateWithMap('shop', { phase: 'shop', credits: 4 });
    expect(runReducer(poor, { type: 'BUY_MERCENARY' }).fleet).toHaveLength(1);
  });

  // 2026-08-04: deliberately NOT capped by fleetCap — a mercenary is a
  // one-fight rental (see BUY_MERCENARY's comment in reducer.ts), so it's
  // the one purchase that stays available even at max fleet size, for
  // every commander alike.
  it('hires past the fleet cap — a mercenary is a rental, not a permanent addition', () => {
    const fullFleet: PlayerShipState[] = Array.from({ length: 4 }, () => ({
      frameId: 'interceptor' as const,
      equipped: [],
      damage: 0,
      upgrades: [],
    }));
    const full = stateWithMap('shop', { phase: 'shop', credits: 100, fleet: fullFleet });
    const result = runReducer(full, { type: 'BUY_MERCENARY' });
    expect(result.fleet).toHaveLength(5); // past the standard 4-ship cap
    expect(result.fleet[4]).toMatchObject({ mercenary: true });
  });

  it('the Merchant hires for 3cr instead of 5', () => {
    const merchant = stateWithMap('shop', { phase: 'shop', credits: 3, commanderId: 'merchant' });
    expect(runReducer(merchant, { type: 'BUY_MERCENARY' }).credits).toBe(0);
  });

  // A hired escort is good for exactly the next combat — these three cover
  // every way that combat can end.
  function combatWithMercenary(mercDamage: number, winner: 'player' | undefined): RunState {
    const combat = initCombat(
      [
        { stats: { initiative: 0, hp: 5, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 0 },
        { stats: { initiative: 1, hp: 1, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: mercDamage },
      ],
      GAUNTLET[0],
      1,
    );
    return {
      ...stateWithMap('combat'),
      phase: 'combat',
      position: { col: 0, row: 0 },
      fleet: [
        { frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] },
        { frameId: 'interceptor', equipped: ['ion'], damage: 0, upgrades: [], mercenary: true },
      ],
      currentEnemy: GAUNTLET[0],
      combat: winner ? { ...combat, winner, round: 1 } : { ...combat, round: 1 },
    };
  }

  it('CONTINUE (win): the mercenary leaves the fleet even though it survived unscathed', () => {
    const state = combatWithMercenary(0, 'player');
    const result = runReducer(state, { type: 'CONTINUE' });
    expect(result.fleet).toHaveLength(1);
    expect(result.fleet.some((s) => s.mercenary)).toBe(false);
  });

  it('CONTINUE (win): the mercenary leaves with no salvage even though it was destroyed', () => {
    const state = combatWithMercenary(1, 'player'); // 1 damage >= 1 hp — destroyed
    const result = runReducer(state, { type: 'CONTINUE' });
    expect(result.fleet).toHaveLength(1);
    expect(result.inventory).not.toContain('ion'); // rented, not salvaged
    // The run's ships-lost record is for the permanent fleet, not a hire.
    expect(result.runStats?.shipsLost ?? []).not.toContain('Mercenary escort');
  });

});

describe('commander effects (iteration 6)', () => {
  function winningCombatState(overrides: Partial<RunState> = {}): RunState {
    const combat = initCombat(
      [{ stats: { initiative: 0, hp: 5, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 2 }],
      GAUNTLET[0],
      1,
    );
    return {
      ...stateWithMap('combat'),
      phase: 'combat',
      position: { col: 0, row: 0 },
      fleet: [{ frameId: 'cruiser', equipped: ['ion'], damage: 0, upgrades: [] }],
      currentEnemy: GAUNTLET[0],
      combat: { ...combat, winner: 'player' as const },
      ...overrides,
    };
  }

  it('the Merchant earns +1 credit per combat won on top of the normal reward (2026-08-06: was +2)', () => {
    const plain = runReducer(winningCombatState(), { type: 'CONTINUE' });
    const merchant = runReducer(winningCombatState({ commanderId: 'merchant' }), { type: 'CONTINUE' });
    expect(merchant.pendingReward!.credits).toBe(plain.pendingReward!.credits + 1);
  });

  it('the Engineer repairs 1 extra damage per surviving ship after a win, stacking with regen', () => {
    const combat = initCombat(
      [
        { stats: { initiative: 0, hp: 10, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 5 },
        { stats: { initiative: 0, hp: 10, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 5 },
      ],
      GAUNTLET[0],
      1,
    );
    const state: RunState = {
      ...stateWithMap('combat'),
      phase: 'combat',
      position: { col: 0, row: 0 },
      fleet: [
        { frameId: 'cruiser', equipped: ['ion'], damage: 0, upgrades: [] }, // no regen
        { frameId: 'interceptor', equipped: ['ion'], damage: 0, upgrades: ['regen'] }, // regen stacks with engineer
      ],
      currentEnemy: GAUNTLET[0],
      combat: { ...combat, winner: 'player' as const },
      commanderId: 'engineer',
    };
    const result = runReducer(state, { type: 'CONTINUE' });
    // Iteration 46.2: + the universal POST_WIN_REPAIR (2, swept up from 1
    // — see reducer.ts's constant) on top of both.
    expect(result.fleet[0].damage).toBe(2); // engineer -1, post-win -2
    expect(result.fleet[1].damage).toBe(1); // engineer -1, regen -1, post-win -2
  });

  // Iteration 21 (the Engineer, over-repair): a heal that outruns actual
  // damage banks the excess instead of wasting it.
  it("the Engineer's over-repair banks a heal that outruns actual damage", () => {
    const combat = initCombat(
      [{ stats: { initiative: 0, hp: 10, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 0 }],
      GAUNTLET[0],
      1,
    );
    const state: RunState = {
      ...stateWithMap('combat'),
      phase: 'combat',
      position: { col: 0, row: 0 },
      // 0 damage: the Engineer's +1 heal is entirely excess.
      fleet: [{ frameId: 'cruiser', equipped: ['ion'], damage: 0, upgrades: [] }],
      currentEnemy: GAUNTLET[0],
      combat: { ...combat, winner: 'player' as const },
      commanderId: 'engineer',
    };
    const result = runReducer(state, { type: 'CONTINUE' });
    expect(result.fleet[0].damage).toBe(0);
    // Iteration 46.2: the Engineer's own +1 plus the universal
    // POST_WIN_REPAIR +1 are both entirely excess here (0 damage) — 2
    // banked, capped at OVER_REPAIR_CAP (2).
    expect(result.fleet[0].overRepairBank).toBe(2);
  });

  it("the Engineer's over-repair bank is capped at 2, even stacking with regen", () => {
    const combat = initCombat(
      [{ stats: { initiative: 0, hp: 10, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 0 }],
      GAUNTLET[0],
      1,
    );
    const state: RunState = {
      ...stateWithMap('combat'),
      phase: 'combat',
      position: { col: 0, row: 0 },
      // regen (1) + engineer (1) = 2 heal against 0 damage — all excess,
      // would be 2 already; a second win must not push it past the cap.
      fleet: [{ frameId: 'cruiser', equipped: ['ion'], damage: 0, upgrades: ['regen'] }],
      currentEnemy: GAUNTLET[0],
      combat: { ...combat, winner: 'player' as const },
      commanderId: 'engineer',
    };
    let result = runReducer(state, { type: 'CONTINUE' });
    expect(result.fleet[0].overRepairBank).toBe(2);
    // A second win, same conditions, must not exceed the cap.
    const second = { ...state, fleet: result.fleet, combat: { ...combat, winner: 'player' as const } };
    result = runReducer(second, { type: 'CONTINUE' });
    expect(result.fleet[0].overRepairBank).toBe(2);
  });

  it('a repair-yard full heal banks a flat +1 for the Engineer, even with nothing to repair', () => {
    const undamaged: RunState = {
      ...initialRunState(),
      phase: 'repair',
      commanderId: 'engineer',
      repairUpgradeOptions: ['spine', 'reactor', 'lattice'],
      fleet: [{ frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] }],
    };
    const result = runReducer(undamaged, { type: 'REPAIR_CHOOSE', choice: 'full' });
    expect(result.fleet[0].damage).toBe(0);
    expect(result.fleet[0].overRepairBank).toBe(1);

    // Non-Engineer commanders get the plain full heal, no bank.
    const plain = { ...undamaged, commanderId: undefined };
    const plainResult = runReducer(plain, { type: 'REPAIR_CHOOSE', choice: 'full' });
    expect(plainResult.fleet[0].overRepairBank).toBeUndefined();
  });

  it("the Engineer's banked over-repair becomes ablative HP for the next fight, then clears at ENGAGE", () => {
    let state: RunState = {
      ...initialRunState(),
      phase: 'prep',
      commanderId: 'engineer',
      currentEnemy: GAUNTLET[0],
      currentCombatSeed: 1,
      fleet: [
        { frameId: 'cruiser', equipped: ['ion'], damage: 0, upgrades: [], overRepairBank: 2 },
      ],
    };
    state = runReducer(state, { type: 'ENGAGE' });
    expect(state.phase).toBe('combat');
    expect(state.combat!.playerShips[0].ablativeRemaining).toBe(2);
    // Consumed — cleared on the RunState-level fleet so a second ENGAGE
    // (impossible mid-combat, but the field itself) can't reuse it.
    expect(state.fleet[0].overRepairBank).toBeFalsy();
  });

  it('the Spymaster gains 2 columns of vision per pick instead of 1', () => {
    let state = runReducer({ ...stateWithMap('combat'), commanderId: 'spymaster' }, { type: 'PICK_NODE', row: 0 });
    expect(state.visionCol).toBe(2); // col 0 + 2, not col 0 + 1
  });

  it('only the Spymaster gathers intelligence after a win', () => {
    const plain = runReducer(winningCombatState(), { type: 'CONTINUE' });
    const spymaster = runReducer(winningCombatState({ commanderId: 'spymaster' }), { type: 'CONTINUE' });
    expect(plain.pendingReward!.intelText).toBeUndefined();
    expect(spymaster.pendingReward!.intelText).toBeTruthy();
  });

  it("the Spymaster's win actually changes what the player knows", () => {
    const before = winningCombatState({ commanderId: 'spymaster' });
    const after = runReducer(before, { type: 'CONTINUE' });
    const changed =
      after.bossRevealed !== before.bossRevealed ||
      after.visionCol !== before.visionCol ||
      after.revealedNodes.length !== before.revealedNodes.length ||
      after.escalations.some((e, i) => e.revealed !== before.escalations[i].revealed);
    expect(changed).toBe(true);
  });

  it('never draws a reveal that would do nothing — with everything known, the win is silent', () => {
    const omniscient = winningCombatState({
      commanderId: 'spymaster',
      bossRevealed: true,
      visionCol: 99,
      escalations: initialRunState().escalations.map((e) => ({ ...e, revealed: true })),
    });
    const after = runReducer(omniscient, { type: 'CONTINUE' });
    expect(after.pendingReward!.intelText).toBeUndefined();
  });
});

describe('intel currency income (iteration 7)', () => {
  function winningCombatState(overrides: Partial<RunState> = {}): RunState {
    const combat = initCombat(
      [{ stats: { initiative: 0, hp: 5, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 2 }],
      GAUNTLET[0],
      1,
    );
    return {
      ...stateWithMap('combat'),
      phase: 'combat',
      position: { col: 0, row: 0 },
      fleet: [{ frameId: 'cruiser', equipped: ['ion'], damage: 0, upgrades: [] }],
      currentEnemy: GAUNTLET[0],
      combat: { ...combat, winner: 'player' as const },
      ...overrides,
    };
  }

  it('a win pays credits only — there is no intel currency to earn', () => {
    const result = runReducer(winningCombatState(), { type: 'CONTINUE' });
    expect(result.pendingReward!.credits).toBeGreaterThan(0);
    expect(result.pendingReward!.intelText).toBeUndefined(); // not a Spymaster run
  });

  it('an elite win still pays the elite credit premium', () => {
    const eliteEnemy = { ...GAUNTLET[0], id: `${GAUNTLET[0].id}-elite` };
    const plain = runReducer(winningCombatState(), { type: 'CONTINUE' });
    const elite = runReducer(winningCombatState({ currentEnemy: eliteEnemy }), { type: 'CONTINUE' });
    expect(elite.pendingReward!.credits).toBeGreaterThan(plain.pendingReward!.credits);
  });
});

describe('shop rework (iteration 7): stratified draw + selling', () => {
  // Iteration 41: 6 -> 8 offers (3 weapon / 3 defense / 1 computer-drive /
  // 1 active), keeping pace with the growing weapon/defense pools.
  it('PICK_NODE into a shop draws exactly 8 offers: 3 weapon, 3 defense (shield/hull), 1 computer-or-drive, 1 active', () => {
    const state = runReducer(stateWithMap('shop'), { type: 'PICK_NODE', row: 0 });
    const offers = state.shopOffers!.map((id) => getPart(id));
    expect(offers).toHaveLength(8);
    expect(offers.slice(0, 3).every((p) => p.type === 'weapon')).toBe(true);
    expect(offers.slice(3, 6).every((p) => p.type === 'shield' || p.type === 'hull')).toBe(true);
    expect(offers[6].type === 'computer' || offers[6].type === 'drive').toBe(true);
    expect(offers[7].active).toBe(true);
  });

  it('all eight offers are always unique, across many independently-seeded draws (2026-08-02 fix)', () => {
    // The old draw was with-replacement: the doubled weapon/defense strata
    // could duplicate within themselves, and the actives stratum overlaps
    // the typed ones (every active part also has a type), so the last slot
    // could duplicate the earlier ones too. Draws directly against
    // drawShopOffers across many seeds and asserts uniqueness every time;
    // the strata invariants must survive the fix. 2026-08-08: used to drive
    // this via repeated REROLL actions (now removed) — calling the pure
    // draw function directly is simpler and no longer needs a shop-visit
    // fixture or a credit budget to spend on rerolling.
    for (let seed = 0; seed < 60; seed++) {
      const offers = drawShopOffers(mulberry32(seed));
      expect(new Set(offers).size).toBe(offers.length);
      const parts = offers.map((id) => getPart(id));
      expect(parts.slice(0, 3).every((p) => p.type === 'weapon')).toBe(true);
      expect(parts.slice(3, 6).every((p) => p.type === 'shield' || p.type === 'hull')).toBe(true);
      expect(parts[6].type === 'computer' || parts[6].type === 'drive').toBe(true);
      expect(parts[7].active).toBe(true);
    }
  });

  it('SELL_PART pays floor(cost/2), removes the part from inventory, and refuses a part not owned', () => {
    let state: RunState = { ...initialRunState(), phase: 'shop', credits: 0, inventory: ['plasma'] }; // plasma costs 6cr (iteration 40 repricing)
    state = runReducer(state, { type: 'SELL_PART', partId: 'plasma' });
    expect(state.credits).toBe(3); // floor(6/2)
    expect(state.inventory).not.toContain('plasma');

    const again = runReducer(state, { type: 'SELL_PART', partId: 'plasma' });
    expect(again.credits).toBe(3); // refused — no longer owned
  });

  it('SELL_PART refuses an equipped part (it is never in inventory in the first place)', () => {
    const fleet: PlayerShipState[] = [{ frameId: 'cruiser', equipped: ['plasma'], damage: 0, upgrades: [] }];
    let state: RunState = { ...initialRunState(), phase: 'shop', credits: 0, fleet, inventory: [] };
    state = runReducer(state, { type: 'SELL_PART', partId: 'plasma' });
    expect(state.credits).toBe(0); // refused — not in inventory
    expect(state.fleet[0].equipped).toContain('plasma'); // untouched
  });

  it('SELL_PART only works in the shop phase', () => {
    let state: RunState = { ...initialRunState(), phase: 'prep', credits: 0, inventory: ['plasma'] };
    state = runReducer(state, { type: 'SELL_PART', partId: 'plasma' });
    expect(state.credits).toBe(0);
    expect(state.inventory).toContain('plasma');
  });
});

function fixedRng(...values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

describe('rollRarity — tier-boundary math (iteration 36)', () => {
  // Weights: common 0.73, rare 0.20 (cumulative 0.93), epic 0.05
  // (cumulative 0.98), legendary 0.02 (cumulative 1.00). rollRarity picks
  // the first tier whose cumulative weight exceeds the roll, so the
  // boundary itself belongs to the NEXT tier up.
  it('selects the tier the cumulative-weight boundaries say it should, on both sides of every edge', () => {
    expect(rollRarity(fixedRng(0))).toBe('common');
    expect(rollRarity(fixedRng(0.729))).toBe('common');
    expect(rollRarity(fixedRng(0.731))).toBe('rare');
    expect(rollRarity(fixedRng(0.929))).toBe('rare');
    expect(rollRarity(fixedRng(0.931))).toBe('epic');
    expect(rollRarity(fixedRng(0.979))).toBe('epic');
    expect(rollRarity(fixedRng(0.981))).toBe('legendary');
    expect(rollRarity(fixedRng(0.999))).toBe('legendary');
  });
});

describe('rarity (iteration 36): shop draws are rarity-weighted, every offer slot always fills', () => {
  it('every part and every purchasable frame has a rarity tier assigned', () => {
    for (const id of ['ion', 'plasma', 'antimatter', 'shieldharmonic', 'shield3', 'hull3', 'init2'] as const) {
      expect(['common', 'rare', 'epic', 'legendary']).toContain(getPart(id).rarity);
    }
    for (const id of PURCHASABLE_FRAME_IDS) {
      expect(['common', 'rare', 'epic', 'legendary']).toContain(getFrame(id).rarity);
    }
  });

  it('a shop draw of many visits always fills all 6 part slots and all frame slots — the fallback never leaves a gap', () => {
    for (let i = 0; i < 40; i++) {
      const state = runReducer(stateWithMap('shop'), { type: 'PICK_NODE', row: 0 });
      expect(state.shopOffers).toHaveLength(SHOP_OFFER_COUNT);
      expect(new Set(state.shopOffers).size).toBe(SHOP_OFFER_COUNT); // still unique
      expect(state.shopFrameOffers).toHaveLength(2); // a store, this act/kind
    }
  });

  // The Dreadnought is filtered out of the draw pool entirely in an act-1
  // store (not merely "wrong tier") — proof that a legendary roll there
  // can never leak it, whatever tier actually got rolled. Same invariant
  // the pre-existing "never offers the Dreadnought in act 1" test already
  // covers; restated here under the rarity describe block since it's the
  // fallback behavior 36.2 specifically calls out.
  it('a legendary roll in an act-1 store can never surface the Dreadnought (filtered from the pool, not just mistiered)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const state = runReducer(stateWithMap('shop'), { type: 'PICK_NODE', row: 0 }); // act defaults to 1
      state.shopFrameOffers!.forEach((id) => seen.add(id));
    }
    expect(seen.has('dreadnought')).toBe(false);
  });
});

describe('the stat-item ladder (iteration 36): full +1/+2/+3 coverage, common/rare/epic at 3/5/9cr', () => {
  it('every stat has all three rungs, priced and rarity-gated correctly', () => {
    const ladder: [PartId, PartId, PartId, number][] = [
      ['comp1', 'comp2', 'comp3', 1],
      ['shield1', 'shield2', 'shield3', 1],
      ['hull1', 'hull2', 'hull3', 1],
      ['init1', 'init2', 'init3', 1],
    ];
    for (const [tier1, tier2, tier3] of ladder) {
      const p1 = getPart(tier1);
      const p2 = getPart(tier2);
      const p3 = getPart(tier3);
      expect(p1.rarity).toBe('common');
      expect(p1.cost).toBe(3);
      expect(p2.rarity).toBe('rare');
      expect(p2.cost).toBe(5);
      expect(p3.rarity).toBe('epic');
      expect(p3.cost).toBe(9);
      // The rare -> epic price gap (4) is wider than common -> rare (2).
      expect(p3.cost - p2.cost).toBeGreaterThan(p2.cost - p1.cost);
    }
  });

  it('the two new mid-ladder stat items derive the stat they claim to', () => {
    expect(deriveStats('cruiser', ['shield3']).shield).toBe(3);
    expect(deriveStats('cruiser', ['hull3']).hp - deriveStats('cruiser', []).hp).toBe(3);
    expect(deriveStats('cruiser', ['init2']).initiative).toBe(2);
  });
});

// Iteration 22.x: "Expand your fleet" used to always show every purchasable
// frame — the same four ships on every visit. Ship offers are now a random
// draw, same shape as the part-offer stratified draw above.
describe('shop ship offers are a random draw (iteration 22.x; store/shipyard split 33)', () => {
  it('varies across visits — not the same fixed set every time', () => {
    // stateWithMap seeds its map randomly per call (no fixed seed passed to
    // initialRunState), so repeated fresh shop entries sample the real
    // spread of the draw rather than one deterministic sequence.
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const state = runReducer(stateWithMap('shop'), { type: 'PICK_NODE', row: 0 });
      state.shopFrameOffers!.forEach((id) => seen.add(id));
    }
    // A real spread across many draws should surface more than just 3 —
    // proof the offer isn't a hardcoded fixed set.
    expect(seen.size).toBeGreaterThan(3);
  });

  it('LEAVE_SHOP clears the frame offers, same as the part offers', () => {
    let state = runReducer(stateWithMap('shop'), { type: 'PICK_NODE', row: 0 });
    expect(state.shopFrameOffers).toBeDefined();
    state = runReducer(state, { type: 'LEAVE_SHOP' });
    expect(state.shopFrameOffers).toBeUndefined();
  });

  // 2026-08-06: buying a frame used to leave it sitting in shopFrameOffers,
  // buyable again and again in the same visit up to fleet cap or credits —
  // same bug class as the old with-replacement upgrade draw. A purchase now
  // consumes that offer, same as BUY_PART splicing shopOffers.
  it('BUY_SHIP removes the bought frame from shopFrameOffers — only 1 of each type per visit', () => {
    let state = runReducer(stateWithMap('shop'), { type: 'PICK_NODE', row: 0 });
    const [frameId] = state.shopFrameOffers!;
    const before = state.shopFrameOffers!.length;
    state = runReducer({ ...state, credits: 999 }, { type: 'BUY_SHIP', frameId });
    expect(state.shopFrameOffers).not.toContain(frameId);
    expect(state.shopFrameOffers).toHaveLength(before - 1);
    // Buying it again is a no-op — it's no longer an offer, credits untouched.
    const creditsAfterFirstBuy = state.credits;
    state = runReducer(state, { type: 'BUY_SHIP', frameId });
    expect(state.credits).toBe(creditsAfterFirstBuy);
    expect(state.fleet.filter((s) => s.frameId === frameId)).toHaveLength(1);
  });

  // 2026-08-06, generalized iteration 52: legendary hulls are act-2-and-
  // shipyard-only — a 30cr+ giant showing up (and being affordable to a
  // wealthy player) as early as column 1 undercut the intended progression.
  // Was hardcoded to 'dreadnought' (the roster's one legendary at the
  // time); Dreadnought is epic now (act-1-shipyard-eligible, see below) and
  // Valkyrie/Aegis/Titan are the new legendary giants the gate protects.
  it('never offers a legendary hull in act 1, across many draws', () => {
    const seen = new Set<Exclude<FrameId, 'cruiser'>>();
    for (let i = 0; i < 30; i++) {
      const state = runReducer(stateWithMap('shop'), { type: 'PICK_NODE', row: 0 }); // act defaults to 1
      state.shopFrameOffers!.forEach((id) => seen.add(id));
    }
    for (const id of seen) expect(getFrame(id).rarity).not.toBe('legendary');
  });

  it('can offer a legendary hull in an act-2 shipyard (never in a store, either act)', () => {
    const seen = new Set<Exclude<FrameId, 'cruiser'>>();
    for (let i = 0; i < 40; i++) {
      const act2Map = forceNodeType(initialRunState().map, 0, 0, 'shipyard', 2);
      const act2State: RunState = { ...initialRunState(), phase: 'map', act: 2, map: act2Map };
      const state = runReducer(act2State, { type: 'PICK_NODE', row: 0 });
      expect(state.shopKind).toBe('shipyard');
      state.shopFrameOffers!.forEach((id) => seen.add(id));
    }
    expect([...seen].some((id) => getFrame(id).rarity === 'legendary')).toBe(true);
  });

  // Iteration 52: Dreadnought was demoted rare(legendary) -> epic — unlike
  // before, it's no longer act-2-gated at all; an act-1 shipyard can offer
  // it (a store still can't, same as any epic hull — see the "never offers
  // an epic or legendary hull" store test below).
  it('the Dreadnought (epic since iteration 52) can appear in an act-1 shipyard', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const state = runReducer(stateWithMap('shipyard'), { type: 'PICK_NODE', row: 0 }); // act defaults to 1
      expect(state.shopKind).toBe('shipyard');
      state.shopFrameOffers!.forEach((id) => seen.add(id));
    }
    expect(seen.has('dreadnought')).toBe(true);
  });

  it('a store draws 2 distinct hulls, a shipyard draws 5, neither ever the Flagship', () => {
    const store = runReducer(stateWithMap('shop'), { type: 'PICK_NODE', row: 0 });
    expect(store.shopKind).toBe('store');
    expect(store.shopFrameOffers).toHaveLength(2);
    expect(new Set(store.shopFrameOffers).size).toBe(2);
    for (const id of store.shopFrameOffers!) expect(PURCHASABLE_FRAME_IDS).toContain(id);
    expect(store.shopFrameOffers).not.toContain('cruiser');

    const shipyard = runReducer(stateWithMap('shipyard'), { type: 'PICK_NODE', row: 0 });
    expect(shipyard.shopKind).toBe('shipyard');
    expect(shipyard.shopFrameOffers).toHaveLength(5);
    expect(new Set(shipyard.shopFrameOffers).size).toBe(5);
    for (const id of shipyard.shopFrameOffers!) expect(PURCHASABLE_FRAME_IDS).toContain(id);
  });

  // 2026-08-08: "second-hand" dropped as a framing — the store's actual
  // distinction now is that it never stocks the roster's top rarity tiers
  // at all, full stop, not a discount/no-bonus rule layered on top of
  // showing them.
  it('a store never offers an epic or legendary hull, across many seeds', () => {
    const base = stateWithMap('shop');
    for (let seed = 1; seed <= 30; seed++) {
      const store = runReducer({ ...base, map: { ...base.map, seed } }, { type: 'PICK_NODE', row: 0 });
      for (const id of store.shopFrameOffers!) {
        expect(getFrame(id).rarity === 'epic' || getFrame(id).rarity === 'legendary').toBe(false);
      }
    }
  });

  it('a shipyard sells no parts (shopOffers: []); a store draws a full offer list', () => {
    const shipyard = runReducer(stateWithMap('shipyard'), { type: 'PICK_NODE', row: 0 });
    expect(shipyard.shopOffers).toEqual([]);

    const store = runReducer(stateWithMap('shop'), { type: 'PICK_NODE', row: 0 });
    expect(store.shopOffers!.length).toBeGreaterThan(0);
  });

  // Iteration 52: Dreadnought is epic now (no longer the belt-and-
  // suspenders case) — 'titan' (legendary) is the representative id for
  // this defense-in-depth check instead.
  it('BUY_SHIP refuses a legendary hull in act 1 even if forced into the offers (defense in depth)', () => {
    const state = stateWithMap('shop', { phase: 'shop', credits: 999, shopFrameOffers: ['titan'] });
    const result = runReducer(state, { type: 'BUY_SHIP', frameId: 'titan' });
    expect(result.fleet.some((s) => s.frameId === 'titan')).toBe(false);
    expect(result.credits).toBe(999);
  });

  // Dreadnought itself, meanwhile, is a real act-1-shipyard purchase now.
  it('BUY_SHIP accepts a Dreadnought in an act-1 shipyard (epic since iteration 52)', () => {
    const state = stateWithMap('shipyard', { phase: 'shop', shopKind: 'shipyard', credits: 999, shopFrameOffers: ['dreadnought'] });
    const result = runReducer(state, { type: 'BUY_SHIP', frameId: 'dreadnought' });
    expect(result.fleet.some((s) => s.frameId === 'dreadnought')).toBe(true);
  });
});

// Iteration 21 (signature stock): the Engineer, Warlord, and Admiral each
// always find their doctrine part in the shop, at a discount — the Merchant
// and Spymaster have no signature part (their doctrines aren't part-based).
describe('signature shop stock (iteration 21)', () => {
  const SIGNATURE: Record<'engineer' | 'spymaster' | 'warlord' | 'admiral', PartId> = {
    engineer: 'dcbay',
    spymaster: 'cloak',
    warlord: 'siege',
    admiral: 'uplink2',
  };

  it.each(Object.entries(SIGNATURE) as [keyof typeof SIGNATURE, PartId][])(
    "the %s's signature part is present in every shop draw, across many seeds",
    (commanderId, partId) => {
      // 2026-08-08: sampled via repeated REROLL actions before reroll was
      // removed — drawShopOffers is the pure draw function underneath, so
      // seeding it directly covers the same "many independent draws"
      // invariant with no shop-visit/credits fixture needed.
      for (let seed = 0; seed < 30; seed++) {
        expect(drawShopOffers(mulberry32(seed), commanderId)).toContain(partId);
      }
    },
  );

  it('a signature part is discounted by 2cr for its own commander, full price for anyone else', () => {
    for (const [commanderId, partId] of Object.entries(SIGNATURE) as [keyof typeof SIGNATURE, PartId][]) {
      const base = getPart(partId).cost;
      const owner = runReducer(stateWithMap('shop', { commanderId, credits: 1000 }), { type: 'PICK_NODE', row: 0 });
      const ownerOfferIndex = owner.shopOffers!.indexOf(partId);
      const ownerBought = runReducer(owner, { type: 'BUY_PART', offerIndex: ownerOfferIndex });
      expect(owner.credits - ownerBought.credits).toBe(Math.max(0, base - 2));

      // Force the same part into another commander's offers directly (bypassing
      // the draw) to confirm partCost — not the draw itself — is what withholds
      // the discount from a non-owning commander. The Merchant owns no
      // signature part at all, so it's a safe "outsider" for every case.
      const other = { ...stateWithMap('shop', { commanderId: 'merchant', credits: 1000 }) };
      const otherWithOffers = runReducer(other, { type: 'PICK_NODE', row: 0 });
      const forced = { ...otherWithOffers, shopOffers: [partId, ...otherWithOffers.shopOffers!.slice(1)] };
      const otherBought = runReducer(forced, { type: 'BUY_PART', offerIndex: 0 });
      expect(forced.credits - otherBought.credits).toBe(base);
    }
  });

  it('the Merchant has no signature part forced into their offers (their doctrine is priced, not stocked)', () => {
    // Across many independent draws, a signature part may still appear by
    // ordinary chance — but it is never *guaranteed* the way it is for its
    // owner.
    let everMissing = false;
    for (let seed = 0; seed < 20; seed++) {
      const offers = drawShopOffers(mulberry32(seed), 'merchant');
      if (Object.values(SIGNATURE).every((partId) => !offers.includes(partId))) everMissing = true;
    }
    expect(everMissing).toBe(true);
  });
});

describe('iteration 8: the opener (act-1 column 0)', () => {
  it('is missile-only — zero cannon dice on the enemy side (pinned so a future edit cannot silently break it)', () => {
    expect(OPENER.groups[0].stats.cannons).toHaveLength(0);
  });

  it('the fight\'s maximum total damage is less than the minimum starting Flagship HP', () => {
    const { count, stats } = OPENER.groups[0];
    const maxTotalDamage = count * stats.missiles.reduce((sum, m) => sum + m.diceCount * m.damage, 0);
    expect(maxTotalDamage).toBe(2);
    expect(maxTotalDamage).toBeLessThan(3); // base frame HP, even with zero hull parts
  });

  it('PICK_NODE at act-1 column 0 always brings up the opener untouched by escalations', () => {
    const state = { ...initialRunState(), phase: 'map' as const };
    const result = runReducer(state, { type: 'PICK_NODE', row: 0 });
    expect(result.phase).toBe('prep');
    expect(result.currentEnemy).toEqual(OPENER);
  });

  it('pays winReward(0) credits and 1 intel, like any other column-0 combat win, with no upgrade pick', () => {
    const fleet: PlayerShipState[] = [{ frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] }];
    const combat = initCombat(
      [{ stats: { initiative: 0, hp: 5, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 0 }],
      OPENER,
      1,
    );
    const state: RunState = {
      ...initialRunState(),
      phase: 'combat',
      position: { col: 0, row: 0 },
      fleet,
      currentEnemy: OPENER,
      combat: { ...combat, winner: 'player' as const },
    };
    const result = runReducer(state, { type: 'CONTINUE' });
    expect(result.pendingReward?.credits).toBe(7); // winReward(0) = 7 + 0 (2026-08-07: un-halved)
    expect(result.pendingReward?.upgradeOptions).toBeUndefined();
  });

});

// 2026-08-04: the interlude used to offer a 3-way choice (Refit / War
// chest / Field promotion) — CONTINUE now heals the fleet and pays credits
// automatically before this phase is even reached (see the boss-fight
// auto-heal tests below), so the only thing INTERLUDE_CHOOSE still does is
// attach a guaranteed upgrade to whichever ship the player picks.
describe('iteration 8/24: the interlude (guaranteed field promotion)', () => {
  function stateAtInterlude(overrides: Partial<RunState> = {}): RunState {
    return { ...initialRunState(), phase: 'interlude', ...overrides };
  }

  it('attaches exactly one upgrade to the chosen ship, moves into act 2, and opens the protocol draft', () => {
    const fleet: PlayerShipState[] = [{ frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] }];
    const result = runReducer(stateAtInterlude({ fleet }), { type: 'INTERLUDE_CHOOSE', shipIndex: 0 });
    expect(result.fleet[0].upgrades).toHaveLength(1);
    // Iteration 28: INTERLUDE_CHOOSE no longer lands straight on the map —
    // the boss's second reward (the protocol draft) comes first.
    expect(result.phase).toBe('protocol-draft');
    expect(result.act).toBe(2);
  });

  it('replaces an existing upgrade rather than stacking (addendum A.4)', () => {
    // The drawn upgrade is real (uncontrolled) randomness at this call site,
    // so the only assertable invariant here is "never more than 1" — the
    // exact-replacement case is covered deterministically by the PICK_UPGRADE
    // test above, which can force a different draw.
    const fleet: PlayerShipState[] = [{ frameId: 'cruiser', equipped: [], damage: 0, upgrades: ['spine'] }];
    const result = runReducer(stateAtInterlude({ fleet }), { type: 'INTERLUDE_CHOOSE', shipIndex: 0 });
    expect(result.fleet[0].upgrades).toHaveLength(1);
  });

  it('refuses without a valid shipIndex', () => {
    const state = stateAtInterlude();
    const result = runReducer(state, { type: 'INTERLUDE_CHOOSE', shipIndex: 5 });
    expect(result).toBe(state);
  });

  it('refuses INTERLUDE_CHOOSE outside the interlude phase', () => {
    const state = { ...initialRunState(), phase: 'map' as const };
    const result = runReducer(state, { type: 'INTERLUDE_CHOOSE', shipIndex: 0 });
    expect(result).toBe(state);
  });

  it('resets position/visited/fled/fog/dossier and lands in act 2 at any act-2 column-0 node', () => {
    const state = stateAtInterlude({
      position: { col: bossColumn(1), row: 0 },
      visited: [{ col: 9, row: 0 }, { col: bossColumn(1), row: 0 }],
      fled: [{ col: 3, row: 1 }],
      visionCol: 9,
      revealedNodes: [{ col: 5, row: 0 }],
      bossRevealed: true,
      // Iteration 28: normally drawn by CONTINUE at the moment the boss
      // falls — set by hand here since this fixture starts mid-interlude.
      protocolOffers: ['reinforced-bulkheads', 'ace-pipeline', 'ghost-fleet-protocol'],
    });
    const result = runReducer(state, { type: 'INTERLUDE_CHOOSE', shipIndex: 0 });
    expect(result.act).toBe(2);
    expect(result.position).toBeNull();
    expect(result.visited).toEqual([]);
    expect(result.fled).toEqual([]);
    expect(result.visionCol).toBe(0);
    expect(result.revealedNodes).toEqual([]);
    expect(result.bossRevealed).toBe(false);

    // The protocol draft (iteration 28) sits between the interlude and the
    // map now — resolve it before the map/PICK_NODE flow can proceed.
    const drafted = runReducer(result, { type: 'PROTOCOL_CHOOSE', index: 0 });
    expect(drafted.phase).toBe('map');
    expect(drafted.protocols).toEqual(['reinforced-bulkheads']);

    // Act 2 column 0 (iteration 32: combat/combat/combat/event, shuffled) —
    // every row is pickable regardless of which type landed there; only the
    // position is what this test actually verifies (the reset above is the
    // real assertion). The resulting phase is whatever that node resolves
    // to (prep for combat, event for an event node).
    const picked = runReducer(drafted, { type: 'PICK_NODE', row: 1 });
    expect(['prep', 'event']).toContain(picked.phase);
    expect(picked.position).toEqual({ col: 0, row: 1 });
  });
});

describe('iteration 8: global column economy across the act boundary', () => {
  it('globalColumn is unchanged in act 1 and offset by 11 in act 2', () => {
    expect(globalColumn(1, 0)).toBe(0);
    expect(globalColumn(1, 10)).toBe(10);
    expect(globalColumn(2, 0)).toBe(11);
    expect(globalColumn(2, 10)).toBe(21);
  });

  it('an act-2 column-0 combat win pays 21 credits (winReward(11, 2), incl. the 2026-08-08 act-2 bonus)', () => {
    const fleet: PlayerShipState[] = [{ frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] }];
    const combat = initCombat(
      [{ stats: { initiative: 0, hp: 5, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 0 }],
      GAUNTLET[0],
      1,
    );
    const base = initialRunState();
    const state: RunState = {
      ...base,
      // Forced cargo-neutral (15.1) — this test is about the column-offset
      // math, not the cargo table.
      map: forceNodeType(base.map, 0, 0, 'combat', 2),
      phase: 'combat',
      act: 2,
      position: { col: 0, row: 0 },
      fleet,
      currentEnemy: GAUNTLET[0],
      combat: { ...combat, winner: 'player' as const },
    };
    const result = runReducer(state, { type: 'CONTINUE' });
    expect(result.pendingReward?.credits).toBe(21);
    // act 2 — unaffected by the act-1 early-column halving, but DOES get
    // the 2026-08-08 +3cr act-2 bonus: 7 + 11 + 3 = 21.
    expect(winReward(globalColumn(2, 0), 2)).toBe(21);
  });
});

describe('iteration 46.3: act-1 escalations retire at the act boundary (reverses 8.4)', () => {
  // 8.4 originally made an act-1 escalation permanent for the rest of the
  // run, stacking with act 2's own — measured (the iteration-46 difficulty
  // ledger) to cost ~30pp at act-2 entry on its own, before act 2's own
  // escalations or its counter-protocol stack on top. Reversed: only the
  // CURRENT act's own two escalations are ever live.
  it('an act-1 escalation does NOT carry into act 2, even long after it landed', () => {
    // landsAfterColumn 3 (act 1) — well past by any point in act 2.
    const escalations = [{ id: 'hardened' as const, act: 1 as const, landsAfterColumn: 3, revealed: false }];
    let state: RunState = {
      ...initialRunState(),
      phase: 'map',
      act: 2,
      escalations,
      map: forceNodeType(initialRunState().map, 0, 1, 'combat', 2),
    };
    const result = runReducer(state, { type: 'PICK_NODE', row: 1 });
    expect(result.currentEnemy!.appliedEscalations ?? []).not.toContain('hardened');
  });

  it('an act-2 escalation does not apply before its own local column, even though act 1 is long past', () => {
    const escalations = [{ id: 'hardened' as const, act: 2 as const, landsAfterColumn: 3, revealed: false }];
    let state: RunState = {
      ...initialRunState(),
      phase: 'map',
      act: 2,
      escalations,
      map: forceNodeType(initialRunState().map, 0, 1, 'combat', 2),
    };
    const result = runReducer(state, { type: 'PICK_NODE', row: 1 });
    expect(result.currentEnemy!.appliedEscalations ?? []).not.toContain('hardened');
  });

  it('act 2 only ever applies its own escalation, never a landed act-1 one', () => {
    const escalations = [
      { id: 'hardened' as const, act: 1 as const, landsAfterColumn: 3, revealed: false },
      { id: 'deflectors' as const, act: 2 as const, landsAfterColumn: 3, revealed: false },
    ];
    let state: RunState = {
      ...initialRunState(),
      phase: 'map',
      act: 2,
      escalations,
      map: forceNodeType(initialRunState().map, 4, 1, 'combat', 2),
      position: { col: 3, row: 1 },
      visited: [{ col: 3, row: 1 }],
    };
    const result = runReducer(state, { type: 'PICK_NODE', row: 1 });
    expect(result.currentEnemy!.appliedEscalations).toEqual(['deflectors']);
    expect(result.currentEnemy!.appliedEscalations).not.toContain('hardened');
  });

  it('act 1 is completely untouched by the retirement — its own escalations still apply normally', () => {
    const escalations = [{ id: 'hardened' as const, act: 1 as const, landsAfterColumn: 3, revealed: false }];
    let state: RunState = {
      ...initialRunState(),
      phase: 'map',
      act: 1,
      escalations,
      map: forceNodeType(initialRunState().map, 4, 1, 'combat', 1),
      position: { col: 3, row: 1 },
      visited: [{ col: 3, row: 1 }],
    };
    const result = runReducer(state, { type: 'PICK_NODE', row: 1 });
    expect(result.currentEnemy!.appliedEscalations).toContain('hardened');
  });
});

describe('iteration 9.4: targeting doctrine', () => {
  it('a new run defaults to the "weakest" stance', () => {
    expect(initialRunState().targetingStance).toBe('weakest');
  });

  it('SET_TARGETING_STANCE only works in the prep phase', () => {
    const state: RunState = { ...initialRunState(), phase: 'map' };
    const result = runReducer(state, { type: 'SET_TARGETING_STANCE', stance: 'strongest' });
    expect(result.targetingStance).toBe('weakest'); // refused — unchanged
  });

  it('SET_TARGETING_STANCE persists on the run state and threads into ENGAGE\'s combat', () => {
    const state: RunState = {
      ...initialRunState(),
      phase: 'prep',
      fleet: [{ frameId: 'cruiser', equipped: ['ion'], damage: 0, upgrades: [] }],
      currentEnemy: GAUNTLET[0],
      currentCombatSeed: 1,
    };
    const withStance = runReducer(state, { type: 'SET_TARGETING_STANCE', stance: 'strongest' });
    expect(withStance.targetingStance).toBe('strongest');

    const engaged = runReducer(withStance, { type: 'ENGAGE' });
    expect(engaged.combat?.targetingStance).toBe('strongest');
  });
});

describe('ISSUE_ORDER (iteration 48, fleet orders)', () => {
  function engagedState(overrides: Partial<RunState> = {}): RunState {
    const prepped: RunState = {
      ...initialRunState(),
      phase: 'prep',
      fleet: [{ frameId: 'cruiser', equipped: ['ion'], damage: 0, upgrades: [] }],
      currentEnemy: GAUNTLET[0],
      currentCombatSeed: 1,
      ...overrides,
    };
    return runReducer(prepped, { type: 'ENGAGE' });
  }

  it('ENGAGE seeds 2 command points and no Exploit access for a non-Spymaster commander', () => {
    const state = engagedState({ commanderId: 'merchant' });
    expect(state.combat?.commandPoints).toBe(2);
    expect(state.combat?.exploitEnabled).toBe(false);
  });

  it('ENGAGE seeds 3 command points and Exploit access for the Spymaster', () => {
    const state = engagedState({ commanderId: 'spymaster' });
    expect(state.combat?.commandPoints).toBe(3);
    expect(state.combat?.exploitEnabled).toBe(true);
  });

  it('spends a command point and arms the round modifier, delegating to the engine', () => {
    const state = engagedState({ commanderId: 'merchant' });
    const result = runReducer(state, { type: 'ISSUE_ORDER', order: 'attack-run' });
    expect(result.combat?.commandPoints).toBe(1);
    expect(result.combat?.orderThisRound).toBe('attack-run');
    expect(result.combat?.roundModifiers.computerBonus).toBe(1);
  });

  it('a targeted order threads its targetIndex through to the engine', () => {
    const state = engagedState({ commanderId: 'spymaster' });
    const result = runReducer(state, { type: 'ISSUE_ORDER', order: 'exploit-weakness', targetIndex: 0 });
    expect(result.combat?.roundModifiers.markedEnemyIndex).toBe(0);
  });

  it('is refused outside the combat phase', () => {
    const state: RunState = { ...initialRunState(), phase: 'map' };
    const result = runReducer(state, { type: 'ISSUE_ORDER', order: 'attack-run' });
    expect(result).toBe(state); // untouched — same reference back, phase guard fired first
  });

  it('is refused once command points are exhausted (delegated, but reachable through the reducer)', () => {
    let state = engagedState({ commanderId: 'merchant' });
    state = runReducer(state, { type: 'ISSUE_ORDER', order: 'attack-run' });
    state = { ...state, combat: { ...state.combat!, orderThisRound: null } }; // simulate a fresh round
    state = runReducer(state, { type: 'ISSUE_ORDER', order: 'evasive-pattern' });
    expect(state.combat?.commandPoints).toBe(0);
    const refused = runReducer(state, { type: 'ISSUE_ORDER', order: 'attack-run' });
    expect(refused.combat).toBe(state.combat); // engine-level refusal — same combat object back
  });
});

describe('Forewarned (iteration 51.1): ENGAGE wires openingComputerBonus', () => {
  function engagedState(overrides: Partial<RunState> = {}): RunState {
    const prepped: RunState = {
      ...initialRunState(),
      phase: 'prep',
      fleet: [{ frameId: 'cruiser', equipped: ['ion'], damage: 0, upgrades: [] }],
      currentEnemy: GAUNTLET[0],
      currentCombatSeed: 1,
      ...overrides,
    };
    return runReducer(prepped, { type: 'ENGAGE' });
  }

  it('ENGAGE seeds +1 opening computer for the Spymaster', () => {
    const state = engagedState({ commanderId: 'spymaster' });
    expect(state.combat?.openingComputerBonus).toBe(1);
  });

  it('ENGAGE seeds 0 opening computer for every other commander', () => {
    for (const commanderId of ['merchant', 'engineer', 'warlord', 'admiral'] as const) {
      const state = engagedState({ commanderId });
      expect(state.combat?.openingComputerBonus).toBe(0);
    }
  });
});

// --- Cargo rewards (iteration 15.1) -------------------------------------
describe('cargo reward payouts', () => {
  // A won combat at act-1 col 1 (winReward(1) = 4, 2026-08-08: cols 1-3
  // halved), with the node's cargo tag forced explicitly rather than left
  // to the random map.
  function wonCargoState(cargo: CargoTag | undefined, overrides: Partial<RunState> = {}): RunState {
    const enemy = GAUNTLET[0];
    const combat = initCombat(
      [{ stats: { initiative: 0, hp: 5, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 0 }],
      enemy,
      1,
    );
    const base = initialRunState();
    return {
      ...base,
      map: forceNodeType(base.map, 1, 0, 'combat', 1, cargo),
      phase: 'combat',
      position: { col: 1, row: 0 },
      fleet: [{ frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] }],
      currentEnemy: enemy,
      combat: { ...combat, winner: 'player' as const },
      ...overrides,
    };
  }

  it('patrol pays exactly winReward(col), unchanged from today', () => {
    const result = runReducer(wonCargoState('patrol'), { type: 'CONTINUE' });
    expect(result.pendingReward?.credits).toBe(winReward(1));
  });

  it('an untagged node (cargo undefined) also pays the plain winReward — same as patrol', () => {
    const result = runReducer(wonCargoState(undefined), { type: 'CONTINUE' });
    expect(result.pendingReward?.credits).toBe(winReward(1));
  });

  it('convoy pays winReward(col) + 4', () => {
    const result = runReducer(wonCargoState('convoy'), { type: 'CONTINUE' });
    expect(result.pendingReward?.credits).toBe(winReward(1) + 4);
  });

  it('wreck field pays winReward(col) - 2 and drops a part into inventory, surfaced on the reward screen (iteration 41)', () => {
    const result = runReducer(wonCargoState('wreck'), { type: 'CONTINUE' });
    expect(result.pendingReward?.credits).toBe(winReward(1) - 2);
    expect(result.inventory).toHaveLength(1);
    expect(result.pendingReward?.foundParts).toEqual(result.inventory);
  });

  it('wreck field floors at 1 credit (unit-level — winReward(col) itself never gets this low)', () => {
    expect(applyCargoReward('wreck', 2)).toBe(1); // 2 - 2 = 0, floored
    expect(applyCargoReward('wreck', 1)).toBe(1); // 1 - 2 = -1, floored
    expect(applyCargoReward('wreck', 10)).toBe(8); // above the floor, unaffected
  });

  it('command ship pays winReward(col) + 8 flat (iteration 35: cards removed, above convoy\'s +4 to stay distinct)', () => {
    const result = runReducer(wonCargoState('command'), { type: 'CONTINUE' });
    expect(result.pendingReward?.credits).toBe(winReward(1) + 8);
  });

  it('an elite kill is never cargo-adjusted (base reward), even if its node happens to carry a tag', () => {
    // eliteReward(1) as the base, +4 flat for the elite kill itself
    // (iteration 35: what used to be a reaction card, now always credits) —
    // NOT the convoy tag's own +4, which is suppressed for elites.
    const eliteEnemy = { ...GAUNTLET[0], id: `${GAUNTLET[0].id}-elite` };
    const state = wonCargoState('convoy', { currentEnemy: eliteEnemy });
    const result = runReducer(state, { type: 'CONTINUE' });
    expect(result.pendingReward?.credits).toBe(eliteReward(1) + 4);
  });

  // Iteration 40/41: every elite kill also drops a Captured schematic
  // straight to inventory — surfaced on the reward screen the same way a
  // wreck-field drop is.
  it('an elite kill drops a Captured schematic, surfaced on the reward screen (iteration 41)', () => {
    const eliteEnemy = { ...GAUNTLET[0], id: `${GAUNTLET[0].id}-elite` };
    const state = wonCargoState('patrol', { currentEnemy: eliteEnemy });
    const result = runReducer(state, { type: 'CONTINUE' });
    expect(result.inventory).toContain(CAPTURED_SCHEMATIC_PART_ID);
    expect(result.pendingReward?.foundParts).toContain(CAPTURED_SCHEMATIC_PART_ID);
  });
});

// --- Heat track (iteration 15.2) ----------------------------------------
describe('heat track', () => {
  it('a new run starts at 0 heat (Cold)', () => {
    expect(initialRunState().heat).toBe(0);
  });

  it('entering a shop costs +1 heat', () => {
    const state = runReducer(stateWithMap('shop'), { type: 'PICK_NODE', row: 0 });
    expect(state.heat).toBe(1);
  });

  it('entering a repair yard costs +1 heat', () => {
    const state = runReducer(stateWithMap('repair'), { type: 'PICK_NODE', row: 0 });
    expect(state.heat).toBe(1);
  });

  it('entering an event costs +1 heat', () => {
    const state = runReducer(stateWithMap('event'), { type: 'PICK_NODE', row: 0 });
    expect(state.heat).toBe(1);
  });

  it('entering a combat/elite/opener/boss node does not cost heat', () => {
    const state = runReducer(stateWithMap('combat'), { type: 'PICK_NODE', row: 0 });
    expect(state.heat).toBe(0);
  });

  it('winning a combat vents 1 heat (floored at 0)', () => {
    const enemy = GAUNTLET[0];
    const combat = initCombat(
      [{ stats: { initiative: 0, hp: 5, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 0 }],
      enemy,
      1,
    );
    const base = initialRunState();
    const state: RunState = {
      ...base,
      map: forceNodeType(base.map, 1, 0, 'combat', 1),
      phase: 'combat',
      position: { col: 1, row: 0 },
      fleet: [{ frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] }],
      currentEnemy: enemy,
      combat: { ...combat, winner: 'player' as const },
      heat: 2,
    };
    const result = runReducer(state, { type: 'CONTINUE' });
    expect(result.heat).toBe(1);

    const alreadyCold = { ...state, heat: 0 };
    expect(runReducer(alreadyCold, { type: 'CONTINUE' }).heat).toBe(0); // floor 0
  });

  it('heat caps at 4 — repeated dock entries never exceed it', () => {
    let state = stateWithMap('shop', { heat: 3 });
    state = runReducer(state, { type: 'PICK_NODE', row: 0 });
    expect(state.heat).toBe(4);
  });

  it('the interlude resets heat to 0', () => {
    const state: RunState = { ...initialRunState(), phase: 'interlude', heat: 3 };
    const result = runReducer(state, { type: 'INTERLUDE_CHOOSE', shipIndex: 0 });
    expect(result.heat).toBe(0);
  });
});

// --- Heat-4 interception (iteration 15.2) -------------------------------
describe('interception at heat 4 ("Hunted")', () => {
  it('arriving at a shop/repair/event node while armed replaces its content with a hunter-killer prep fight', () => {
    let state = stateWithMap('shop', { heat: MAX_HEAT });
    state = runReducer(state, { type: 'PICK_NODE', row: 0 });
    expect(state.phase).toBe('prep');
    expect(state.interceptionActive).toBe(true);
    expect(state.currentEnemy).toBeDefined();
    expect(state.shopOffers).toBeUndefined(); // the shop's own content never fired
  });

  it('an event node while armed is intercepted the same way — repairUpgradeOptions/currentEvent never populate', () => {
    let state = stateWithMap('event', { heat: MAX_HEAT });
    state = runReducer(state, { type: 'PICK_NODE', row: 0 });
    expect(state.phase).toBe('prep');
    expect(state.interceptionActive).toBe(true);
    expect(state.currentEvent).toBeUndefined();
  });

  it('a repair node while armed is intercepted — repairUpgradeOptions never drawn', () => {
    let state = stateWithMap('repair', { heat: MAX_HEAT });
    state = runReducer(state, { type: 'PICK_NODE', row: 0 });
    expect(state.phase).toBe('prep');
    expect(state.interceptionActive).toBe(true);
    expect(state.repairUpgradeOptions).toBeUndefined();
  });

  it('combat/elite/boss/opener entries are never intercepted even at heat 4', () => {
    const state = runReducer(stateWithMap('combat', { heat: MAX_HEAT }), { type: 'PICK_NODE', row: 0 });
    expect(state.interceptionActive).toBeUndefined();
    expect(state.phase).toBe('prep');
  });

  it('winning the interception resets heat to 0 (not just -1) and pays a normal winReward', () => {
    let state = stateWithMap('shop', { heat: MAX_HEAT });
    state = runReducer(state, { type: 'PICK_NODE', row: 0 });
    const col = state.position!.col;
    const combat = initCombat(
      [{ stats: { initiative: 0, hp: 5, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 0 }],
      state.currentEnemy!,
      1,
    );
    state = { ...state, phase: 'combat', combat: { ...combat, winner: 'player' as const } };
    const result = runReducer(state, { type: 'CONTINUE' });
    expect(result.phase).toBe('reward');
    expect(result.heat).toBe(0);
    expect(result.interceptionActive).toBeUndefined();
    expect(result.pendingReward?.credits).toBe(winReward(globalColumn(1, col)));
  });
});

describe('the fleet remembers (iteration 18)', () => {
  // Play a fresh seeded run through the opener and return the post-CONTINUE
  // state — the opener (Picket drones: 2 hulls, missiles only) is the one
  // guaranteed-winnable, always-first fight, which makes it the natural
  // fixture for stat attribution.
  function playThroughOpener(): RunState {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.42);
    let state = initialRunState();
    spy.mockRestore();
    state = runReducer(state, { type: 'CHOOSE_COMMANDER', commanderId: state.commanderChoices[0] });
    state = runReducer(state, { type: 'PICK_NODE', row: 0 });
    state = runReducer(state, { type: 'ENGAGE' });
    state = runReducer(state, { type: 'AUTO_RESOLVE' });
    expect(state.combat?.winner).toBe('player'); // the opener mathematically can't kill the starting ship
    return runReducer(state, { type: 'CONTINUE' });
  }

  it('names the starting Flagship deterministically from the run seed', () => {
    const state = initialRunState({ seed: 7 });
    expect(state.fleet[0].name).toBe(shipName(7, 0, 'cruiser'));
    expect(state.fleet[0].name!.startsWith('ISV ')).toBe(true);
  });

  it("names the Admiral's two free Interceptors and advances the commission counter by 2", () => {
    let state = initialRunState({ seed: 7 });
    // Force admiral into the choices for a deterministic test.
    state = { ...state, commanderChoices: ['admiral', ...state.commanderChoices.slice(1)] };
    const after = runReducer(state, { type: 'CHOOSE_COMMANDER', commanderId: 'admiral' });
    expect(after.fleet).toHaveLength(3);
    expect(after.fleet[1].name).toBe(shipName(7, 1, 'interceptor'));
    expect(after.fleet[2].name).toBe(shipName(7, 2, 'interceptor'));
    expect(after.shipsCommissioned).toBe(3);
  });

  it('a won fight increments fightsWon, credits kills to ships, and bumps fightsSurvived for survivors', () => {
    const after = playThroughOpener();
    const stats = after.runStats!;
    expect(stats.fightsWon).toBe(1);
    expect(stats.shipsLost).toEqual([]); // the opener can't destroy the starting ship
    // Two picket drones died; every kill is attributable to a plain player
    // hit-roll here (no prow/arc in the starting loadout).
    const totalKills = after.fleet.reduce((n, s) => n + (s.kills ?? 0), 0);
    expect(totalKills).toBe(2);
    for (const ship of after.fleet) {
      expect(ship.fightsSurvived).toBe(1);
    }
    // The drones' missiles are the only enemy dice — at most 2 damage taken.
    expect(stats.damageTaken).toBeLessThanOrEqual(2);
    expect(stats.damageDealt).toBeGreaterThanOrEqual(2); // at least the two killing blows
  });

  it('LOAD_STATE replaces the state wholesale', () => {
    const a = initialRunState({ seed: 1 });
    const b = initialRunState({ seed: 2, mode: 'daily', dailyDate: '2026-08-03' });
    const loaded = runReducer(a, { type: 'LOAD_STATE', state: b });
    expect(loaded).toBe(b);
  });

  it('NEW_RUN with daily options produces a daily-mode state with that exact seed', () => {
    const fresh = runReducer(initialRunState({ seed: 1 }), {
      type: 'NEW_RUN',
      seed: 99,
      mode: 'daily',
      dailyDate: '2026-08-03',
    });
    expect(fresh.mode).toBe('daily');
    expect(fresh.dailyDate).toBe('2026-08-03');
    expect(fresh.map.seed).toBe(99);
    expect(fresh).toEqual(initialRunState({ seed: 99, mode: 'daily', dailyDate: '2026-08-03' }));
  });
});

describe('iteration 28: Protocols', () => {
  function actWonState(overrides: Partial<RunState> = {}): RunState {
    const fleet: PlayerShipState[] = overrides.fleet ?? [{ frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] }];
    const combat = initCombat(
      fleet.map((s) => ({
        stats: { initiative: 0, hp: 5, computer: 0, shield: 0, cannons: [], missiles: [] },
        initialDamage: s.damage,
      })),
      GAUNTLET[8],
      1,
    );
    return {
      ...stateWithMap('combat'),
      phase: 'combat',
      position: { col: bossColumn(1), row: 0 },
      fleet,
      combat: { ...combat, winner: 'player' as const },
      ...overrides,
    };
  }

  it('winning the act-1 boss draws exactly one silver, one gold, and one prismatic offer', () => {
    const result = runReducer(actWonState(), { type: 'CONTINUE' });
    expect(result.protocolOffers).toHaveLength(3);
    const tiers = result.protocolOffers!.map((id) => getProtocol(id).tier);
    expect(tiers).toEqual(['silver', 'gold', 'prismatic']);
  });

  it('PROTOCOL_CHOOSE is refused outside the protocol-draft phase', () => {
    const state: RunState = { ...initialRunState(), phase: 'map' };
    const result = runReducer(state, { type: 'PROTOCOL_CHOOSE', index: 0 });
    expect(result).toBe(state);
  });

  it('PROTOCOL_CHOOSE records the pick, clears the offers, and returns to the map', () => {
    const state: RunState = {
      ...initialRunState(),
      phase: 'protocol-draft',
      act: 2,
      protocolOffers: ['reinforced-bulkheads', 'ace-pipeline', 'ghost-fleet-protocol'],
    };
    const result = runReducer(state, { type: 'PROTOCOL_CHOOSE', index: 1 });
    expect(result.protocols).toEqual(['ace-pipeline']);
    expect(result.protocolOffers).toBeUndefined();
    expect(result.phase).toBe('map');
  });

  it('PROTOCOL_CHOOSE appends to any protocols already held', () => {
    const state: RunState = {
      ...initialRunState(),
      phase: 'protocol-draft',
      act: 2,
      protocols: ['salvage-rigs'],
      protocolOffers: ['reinforced-bulkheads', 'ace-pipeline', 'ghost-fleet-protocol'],
    };
    const result = runReducer(state, { type: 'PROTOCOL_CHOOSE', index: 0 });
    expect(result.protocols).toEqual(['salvage-rigs', 'reinforced-bulkheads']);
  });

  it('Lone flagship scraps every escort for half its frame value and leaves only the Flagship', () => {
    const fleet: PlayerShipState[] = [
      { frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] },
      { frameId: 'interceptor', equipped: [], damage: 0, upgrades: [] }, // cost 6 -> 3cr
      { frameId: 'light-cruiser', equipped: [], damage: 0, upgrades: [] }, // cost 22 -> 11cr (2026-08-06 repricing)
    ];
    const state: RunState = {
      ...initialRunState(),
      phase: 'protocol-draft',
      act: 2,
      credits: 0,
      fleet,
      protocolOffers: ['reinforced-bulkheads', 'ace-pipeline', 'lone-flagship'],
    };
    const result = runReducer(state, { type: 'PROTOCOL_CHOOSE', index: 2 });
    expect(result.fleet).toHaveLength(1);
    expect(result.fleet[0].frameId).toBe('cruiser');
    expect(result.credits).toBe(Math.floor(getFrame('interceptor').cost / 2) + Math.floor(getFrame('light-cruiser').cost / 2));
    expect(result.protocols).toEqual(['lone-flagship']);
  });

  it('Deep-space relays sets visionCol to the far end of the act immediately', () => {
    const state: RunState = {
      ...initialRunState(),
      phase: 'protocol-draft',
      act: 2,
      visionCol: 0,
      protocolOffers: ['reinforced-bulkheads', 'deep-space-relays', 'ghost-fleet-protocol'],
    };
    const result = runReducer(state, { type: 'PROTOCOL_CHOOSE', index: 1 });
    expect(result.visionCol).toBe(laneColumns(2));
  });

  it('Salvage rigs adds +2cr to a normal combat win and to the act-1 boss payout', () => {
    const fleet: PlayerShipState[] = [{ frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] }];
    const combat = initCombat(
      [{ stats: { initiative: 0, hp: 5, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 0 }],
      GAUNTLET[0],
      1,
    );
    const plainState: RunState = {
      ...stateWithMap('combat'),
      phase: 'combat',
      position: { col: 0, row: 0 },
      fleet,
      combat: { ...combat, winner: 'player' as const },
    };
    const plainResult = runReducer(plainState, { type: 'CONTINUE' });
    const bonusState: RunState = { ...plainState, protocols: ['salvage-rigs'] };
    const bonusResult = runReducer(bonusState, { type: 'CONTINUE' });
    expect(bonusResult.pendingReward!.credits).toBe(plainResult.pendingReward!.credits + 2);

    const bossResult = runReducer({ ...actWonState(), protocols: ['salvage-rigs'] }, { type: 'CONTINUE' });
    const bossPlain = runReducer(actWonState(), { type: 'CONTINUE' });
    expect(bossResult.credits).toBe(bossPlain.credits + 2);
  });

  it('Ghost fleet protocol converts a destroyed ship into a survivor at 1 HP instead of losing it', () => {
    const fleet: PlayerShipState[] = [{ frameId: 'cruiser', equipped: ['ion'], damage: 0, upgrades: [] }];
    const combat = initCombat(
      [{ stats: { initiative: 0, hp: 5, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 5 }], // fatal
      GAUNTLET[0],
      1,
    );
    const state: RunState = {
      ...stateWithMap('combat'),
      phase: 'combat',
      position: { col: 0, row: 0 },
      fleet,
      protocols: ['ghost-fleet-protocol'],
      combat: { ...combat, winner: 'player' as const },
    };
    const result = runReducer(state, { type: 'CONTINUE' });
    expect(result.fleet).toHaveLength(1);
    expect(result.fleet[0].frameId).toBe('cruiser');
    expect(result.fleet[0].damage).toBeGreaterThan(0); // critically damaged, not full
    expect(result.pendingReward?.lostShips).toEqual([]);

    // Without the protocol, the same fight really does lose the ship.
    const plainResult = runReducer({ ...state, protocols: undefined }, { type: 'CONTINUE' });
    expect(plainResult.fleet).toHaveLength(0);
    expect(plainResult.pendingReward?.lostShips).toHaveLength(1);
  });

  it('Ghost fleet protocol doubles the heat cost of a repair-yard visit', () => {
    const plain = runReducer(
      { ...stateWithMap('repair'), phase: 'map', position: null, heat: 0 },
      { type: 'PICK_NODE', row: 0 },
    );
    const ghost = runReducer(
      { ...stateWithMap('repair'), phase: 'map', position: null, heat: 0, protocols: ['ghost-fleet-protocol'] },
      { type: 'PICK_NODE', row: 0 },
    );
    expect(ghost.heat).toBe(plain.heat + 1);
  });

  it('Rapid drydocks banks +1 over-repair on a full heal, for any commander', () => {
    const state: RunState = {
      ...initialRunState(),
      phase: 'repair',
      protocols: ['rapid-drydocks'],
      repairUpgradeOptions: ['spine', 'reactor', 'lattice'],
      fleet: [{ frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] }],
    };
    const result = runReducer(state, { type: 'REPAIR_CHOOSE', choice: 'full' });
    expect(result.fleet[0].overRepairBank).toBe(1);
  });

  it('fleetCap: Armada mandate adds +2 on top of the base or Admiral cap; Lone flagship hard-caps at 1', () => {
    expect(fleetCap(undefined)).toBe(4);
    expect(fleetCap(undefined, ['armada-mandate'])).toBe(6);
    expect(fleetCap('admiral')).toBe(5);
    expect(fleetCap('admiral', ['armada-mandate'])).toBe(7);
    expect(fleetCap(undefined, ['lone-flagship'])).toBe(1);
    expect(fleetCap('admiral', ['lone-flagship'])).toBe(1);
  });

  it('partCost: Munitions contracts subtracts 2cr, floored at 1cr, and stacks with a signature discount', () => {
    const base = partCost('plasma', undefined);
    expect(partCost('plasma', undefined, ['munitions-contracts'])).toBe(base - 2);
    // A cheap part never goes below 1cr even after the discount.
    const cheapBase = partCost('ion', undefined);
    expect(partCost('ion', undefined, ['munitions-contracts'])).toBe(Math.max(1, cheapBase - 2));
  });

  it('frameCost: Armada mandate is 50% off, applied after any commander discount', () => {
    const base = getFrame('light-cruiser').cost;
    expect(frameCost(base, 'light-cruiser', undefined, ['armada-mandate'])).toBe(Math.floor(base * 0.5));
    const admiralCost = frameCost(base, 'light-cruiser', 'admiral');
    expect(frameCost(base, 'light-cruiser', 'admiral', ['armada-mandate'])).toBe(Math.floor(admiralCost * 0.5));
  });
});

describe('iteration 30: counter-protocols', () => {
  function actWonState(overrides: Partial<RunState> = {}): RunState {
    const fleet: PlayerShipState[] = overrides.fleet ?? [{ frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] }];
    const combat = initCombat(
      fleet.map((s) => ({
        stats: { initiative: 0, hp: 5, computer: 0, shield: 0, cannons: [], missiles: [] },
        initialDamage: s.damage,
      })),
      GAUNTLET[8],
      1,
    );
    return {
      ...stateWithMap('combat'),
      phase: 'combat',
      position: { col: bossColumn(1), row: 0 },
      fleet,
      combat: { ...combat, winner: 'player' as const },
      ...overrides,
    };
  }

  // Same forceNodeType helper the Dreadnought act-2-shipyard tests use
  // above — builds a minimal, reachable act-2 lane-0 node of the given type.
  function act2StateAt(type: NodeType, overrides: Partial<RunState> = {}): RunState {
    const map = forceNodeType(initialRunState().map, 0, 0, type, 2);
    return { ...initialRunState(), phase: 'map', act: 2, map, ...overrides };
  }

  it('winning the act-1 boss also draws exactly one silver, one gold, one prismatic COUNTER offer, index-paired with the protocol offers', () => {
    const result = runReducer(actWonState(), { type: 'CONTINUE' });
    expect(result.protocolCounterOffers).toHaveLength(3);
    const tiers = result.protocolCounterOffers!.map((id) => getCounterProtocol(id).tier);
    expect(tiers).toEqual(['silver', 'gold', 'prismatic']);
  });

  it('PROTOCOL_CHOOSE records the matching counterProtocol from the same index and clears protocolCounterOffers', () => {
    const state: RunState = {
      ...initialRunState(),
      phase: 'protocol-draft',
      act: 2,
      protocolOffers: ['reinforced-bulkheads', 'ace-pipeline', 'ghost-fleet-protocol'],
      protocolCounterOffers: ['hardened-veterans', 'flak-screens', 'attack-wings'],
    };
    const result = runReducer(state, { type: 'PROTOCOL_CHOOSE', index: 1 });
    expect(result.counterProtocol).toBe('flak-screens');
    expect(result.protocolCounterOffers).toBeUndefined();
  });

  it('the lone-flagship and deep-space-relays special-effect branches also record the matching counter', () => {
    const loneState: RunState = {
      ...initialRunState(),
      phase: 'protocol-draft',
      act: 2,
      fleet: [{ frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] }],
      protocolOffers: ['reinforced-bulkheads', 'ace-pipeline', 'lone-flagship'],
      protocolCounterOffers: ['hardened-veterans', 'flak-screens', 'attack-wings'],
    };
    const loneResult = runReducer(loneState, { type: 'PROTOCOL_CHOOSE', index: 2 });
    expect(loneResult.counterProtocol).toBe('attack-wings');
    expect(loneResult.protocolCounterOffers).toBeUndefined();

    const relayState: RunState = {
      ...initialRunState(),
      phase: 'protocol-draft',
      act: 2,
      protocolOffers: ['reinforced-bulkheads', 'deep-space-relays', 'ghost-fleet-protocol'],
      protocolCounterOffers: ['hardened-veterans', 'flak-screens', 'attack-wings'],
    };
    const relayResult = runReducer(relayState, { type: 'PROTOCOL_CHOOSE', index: 1 });
    expect(relayResult.counterProtocol).toBe('flak-screens');
  });

  it('a legacy save with no protocolCounterOffers still resolves the protocol pick cleanly, with no counter', () => {
    const state: RunState = {
      ...initialRunState(),
      phase: 'protocol-draft',
      act: 2,
      protocolOffers: ['reinforced-bulkheads', 'ace-pipeline', 'ghost-fleet-protocol'],
      // protocolCounterOffers intentionally absent
    };
    const result = runReducer(state, { type: 'PROTOCOL_CHOOSE', index: 0 });
    expect(result.protocols).toEqual(['reinforced-bulkheads']);
    expect(result.counterProtocol).toBeUndefined();
  });

  it('a drafted counter-protocol applies to a combat enemy in act 2, never in act 1 regardless', () => {
    const act2 = runReducer(
      { ...act2StateAt('combat'), counterProtocol: 'hardened-veterans' as CounterProtocolId },
      { type: 'PICK_NODE', row: 0 },
    );
    expect(act2.currentEnemy?.appliedCounter).toBe('hardened-veterans');

    const act1 = runReducer(
      { ...stateWithMap('combat'), counterProtocol: 'hardened-veterans' as CounterProtocolId },
      { type: 'PICK_NODE', row: 0 },
    );
    expect(act1.currentEnemy?.appliedCounter).toBeUndefined();
  });

  it('no counter applies in act 2 when nothing was drafted', () => {
    const result = runReducer(act2StateAt('combat'), { type: 'PICK_NODE', row: 0 });
    expect(result.currentEnemy?.appliedCounter).toBeUndefined();
  });

  it('applies to elite nodes too', () => {
    const result = runReducer(
      { ...act2StateAt('elite'), counterProtocol: 'targeting-arrays' as CounterProtocolId },
      { type: 'PICK_NODE', row: 0 },
    );
    expect(result.currentEnemy?.appliedCounter).toBe('targeting-arrays');
  });

  it('applies on top of veterancy/escalations rather than replacing them', () => {
    // col 0 has no veterancy/escalations in play, so this just confirms the
    // counter doesn't clobber the enemy's base stats — a fuller escalation
    // interaction is exercised structurally by applyCounterProtocol's own
    // unit tests (counterProtocols.test.ts), which operate on the same
    // clone-and-mutate shape applyEscalations uses.
    const result = runReducer(
      { ...act2StateAt('combat'), counterProtocol: 'hardened-veterans' as CounterProtocolId },
      { type: 'PICK_NODE', row: 0 },
    );
    expect(result.currentEnemy).toBeDefined();
    expect(result.currentEnemy!.groups[0].stats.hp).toBeGreaterThan(0);
  });
});

describe('iteration 32.2: warp lanes (PICK_NODE via a shortcut)', () => {
  // A hand-built act-2 state with one known shortcut (col 3 -> col 5,
  // skipping col 4 entirely) so the test doesn't depend on which columns a
  // real generated map happened to place its 2 shortcuts on. Both
  // endpoints are forced to 'combat' — real placement rules already
  // guarantee non-repair endpoints (see map.test.ts); this fixture just
  // needs *some* known, connectable type at each end.
  function stateWithShortcut(overrides: Partial<RunState> = {}): RunState {
    let map = initialRunState().map;
    map = forceNodeType(map, 3, 0, 'combat', 2);
    map = forceNodeType(map, 5, 0, 'combat', 2);
    map = { ...map, act2Shortcuts: [{ from: { col: 3, row: 0 }, to: { col: 5, row: 0 } }] };
    return {
      ...initialRunState(),
      phase: 'map',
      act: 2,
      map,
      position: { col: 3, row: 0 },
      visited: [{ col: 3, row: 0 }],
      ...overrides,
    };
  }

  it('PICK_NODE with col set to the shortcut target moves 2 columns at once', () => {
    const result = runReducer(stateWithShortcut(), { type: 'PICK_NODE', row: 0, col: 5 });
    expect(result.position).toEqual({ col: 5, row: 0 });
    expect(result.visited).toContainEqual({ col: 5, row: 0 });
  });

  it('skips the middle column — every one of its nodes is marked fled', () => {
    const state = stateWithShortcut();
    const skippedColumn = state.map.act2Columns[4];
    const result = runReducer(state, { type: 'PICK_NODE', row: 0, col: 5 });
    for (const node of skippedColumn) {
      expect(result.fled).toContainEqual({ col: node.col, row: node.row });
    }
  });

  it('PICK_NODE without col still means the normal next column (pre-32 call shape keeps working)', () => {
    const result = runReducer(stateWithShortcut(), { type: 'PICK_NODE', row: 0 });
    // col 3's normal next column is 4, not the shortcut's target (5).
    expect(result.position).toEqual({ col: 4, row: result.position!.row });
  });

  it('refuses a col that matches neither the normal next column nor a real shortcut target', () => {
    const state = stateWithShortcut();
    const result = runReducer(state, { type: 'PICK_NODE', row: 0, col: 9 });
    expect(result).toBe(state);
  });
});

describe('iteration 32.3: the pursuit clock', () => {
  // laneColumns(2) - 2 = 10 — the shortest possible route's length; the
  // 11th and 12th act-2 lane-node arrivals each tick the clock. `visited`
  // is faked to already hold 10 act-2-local positions so the NEXT PICK_NODE
  // is exactly the 11th arrival, without needing 10 real dispatches.
  function stateNearThreshold(act: 1 | 2, overrides: Partial<RunState> = {}): RunState {
    const fakedVisited: MapPosition[] = Array.from({ length: 10 }, (_, i) => ({ col: i, row: 0 }));
    let map = initialRunState().map;
    map = forceNodeType(map, 10, 0, 'combat', 2);
    return {
      ...initialRunState(),
      phase: 'map',
      act,
      map,
      heat: 0,
      position: { col: 9, row: 0 },
      visited: [...fakedVisited],
      ...overrides,
    };
  }

  it('adds +1 heat on the 11th act-2 lane-node arrival, on top of whatever the node itself does', () => {
    const result = runReducer(stateNearThreshold(2), { type: 'PICK_NODE', row: 0 });
    // col 10 is 'combat' — combat never adds heat on its own, so the whole
    // +1 here is the pursuit tax, isolating it from the dock system.
    expect(result.heat).toBe(1);
  });

  it('does not tax the 10th arrival — the shortest possible route pays no tax', () => {
    const state = stateNearThreshold(2, { visited: Array.from({ length: 9 }, (_, i) => ({ col: i, row: 0 })) });
    const result = runReducer(state, { type: 'PICK_NODE', row: 0 });
    expect(result.heat).toBe(0);
  });

  it('never applies in act 1, no matter how many nodes have been visited', () => {
    let map = initialRunState().map;
    map = forceNodeType(map, 9, 0, 'combat', 1);
    const state = stateNearThreshold(1, { map, position: { col: 8, row: 0 } });
    const result = runReducer(state, { type: 'PICK_NODE', row: 0 });
    expect(result.heat).toBe(0);
  });

  it('never applies on the boss node, even past the threshold', () => {
    const state = stateNearThreshold(2, { position: { col: 11, row: 0 } });
    const result = runReducer(state, { type: 'PICK_NODE', row: 0 });
    expect(result.currentEnemy).toBeDefined(); // reached the boss fight
    expect(result.heat).toBe(0); // no pursuit tax on the boss arrival itself
  });

  it('stacks with a dock\'s own +1-to-enter heat (a shop past the threshold costs 2 total)', () => {
    let map = initialRunState().map;
    map = forceNodeType(map, 10, 0, 'shop', 2);
    const state = stateNearThreshold(2, { map });
    const result = runReducer(state, { type: 'PICK_NODE', row: 0 });
    expect(result.heat).toBe(2); // 1 pursuit tax + 1 dock-entry
  });

  it('a pursuit tax that pushes heat to MAX intercepts a dock arrival exactly like any other Hunted arrival', () => {
    let map = initialRunState().map;
    map = forceNodeType(map, 10, 0, 'shop', 2);
    const state = stateNearThreshold(2, { map, heat: MAX_HEAT - 1 });
    const result = runReducer(state, { type: 'PICK_NODE', row: 0 });
    expect(result.interceptionActive).toBe(true);
    expect(result.phase).toBe('prep');
  });
});

// =========================================================================
// Iteration 49: stage-gated event pool + two quest chains (debt broker,
// colony ship). Exhaustive drawEvent-level stage-filtering/priority sweeps
// live in events.test.ts; these are reducer-level integration checks —
// the PICK_NODE call-site regression, and each chain's EVENT_CHOOSE/
// CONTINUE wiring end to end.
// =========================================================================

describe('PICK_NODE — 49.1 regression: drawEvent uses the ENTERED node column', () => {
  it('an event node at column 4 draws from the mid pool even though pre-move state.position.col is 3', () => {
    const base = stateWithMap('combat');
    const map = forceNodeType(base.map, 4, 0, 'event', base.act);
    // Events that only ever appear in the 'early' stage — if the reducer
    // mistakenly drew from pre-move state.position (col 3, still early),
    // one of these could show up at this column-4 node.
    const earlyOnly: EventId[] = ['customs-checkpoint', 'war-surplus-peddler', 'nav-buoy', 'debt-broker', 'colony-ship'];
    for (let seed = 1; seed <= 100; seed++) {
      const state: RunState = { ...base, map: { ...map, seed }, position: { col: 3, row: 0 }, rngCounter: 0 };
      const result = runReducer(state, { type: 'PICK_NODE', row: 0 }); // defaults targetCol to position.col + 1 = 4
      expect(result.currentEvent).toBeDefined();
      expect(earlyOnly).not.toContain(result.currentEvent!.eventId);
    }
  });
});

describe('iteration 49.4: the debt broker chain', () => {
  it('taking the loan sets loanOutstanding and grants 8 credits (EVENT_CHOOSE, end to end)', () => {
    const state = stateWithMap('event', { phase: 'event', currentEvent: { eventId: 'debt-broker' }, credits: 0 });
    const result = runReducer(state, { type: 'EVENT_CHOOSE', choiceIndex: 1 });
    expect(result.loanOutstanding).toBe(true);
    expect(result.credits).toBe(8);
  });

  it('settling the debt clears loanOutstanding', () => {
    const state = stateWithMap('event', {
      phase: 'event',
      currentEvent: { eventId: 'debt-collectors' },
      loanOutstanding: true,
      credits: 12,
    });
    const result = runReducer(state, { type: 'EVENT_CHOOSE', choiceIndex: 0 });
    expect(result.loanOutstanding).toBeUndefined();
    expect(result.credits).toBe(0);
  });

  it('cloaking away keeps the debt outstanding', () => {
    const fleet: PlayerShipState[] = [{ frameId: 'cruiser', equipped: ['cloak'], damage: 0, upgrades: [] }];
    const state = stateWithMap('event', {
      phase: 'event',
      currentEvent: { eventId: 'debt-collectors' },
      loanOutstanding: true,
      fleet,
    });
    const result = runReducer(state, { type: 'EVENT_CHOOSE', choiceIndex: 2 });
    expect(result.loanOutstanding).toBe(true);
  });

  it('EVENT_CONTINUE carries the debt-cleared chainEffect onto RunState.pendingAmbushBonus', () => {
    let state = stateWithMap('event', { phase: 'event', currentEvent: { eventId: 'debt-collectors' }, loanOutstanding: true });
    state = runReducer(state, { type: 'EVENT_CHOOSE', choiceIndex: 1 }); // fight the enforcers
    expect(state.currentEvent?.ambushBonus).toEqual({ chainEffect: 'debt-cleared' });

    const result = runReducer(state, { type: 'EVENT_CONTINUE' });
    expect(result.phase).toBe('prep');
    expect(result.pendingAmbushBonus).toEqual({ chainEffect: 'debt-cleared' });
  });

  it('winning the enforcer fight clears the debt via chainEffect (a real ambush -> CONTINUE win, the ambush-bonus precedent)', () => {
    const enemy = GAUNTLET[0];
    const combat = initCombat(
      [{ stats: { initiative: 0, hp: 5, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 0 }],
      enemy,
      1,
    );
    const wonCombat = { ...combat, winner: 'player' as const };
    const base = stateWithMap('event');
    const state: RunState = {
      ...base,
      map: forceNodeType(base.map, 1, 0, 'event', base.act),
      phase: 'combat',
      position: { col: 1, row: 0 },
      fleet: [{ frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] }],
      currentEnemy: enemy,
      combat: wonCombat,
      loanOutstanding: true,
      pendingAmbushBonus: { chainEffect: 'debt-cleared' },
    };
    const result = runReducer(state, { type: 'CONTINUE' });
    expect(result.phase).toBe('reward');
    expect(result.loanOutstanding).toBeUndefined();
    expect(result.pendingAmbushBonus).toBeUndefined();
  });

  it('losing the enforcer fight leaves the debt outstanding — no chainEffect applies on a loss', () => {
    const enemy = GAUNTLET[0];
    const combat = initCombat(
      [{ stats: { initiative: 0, hp: 5, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 0 }],
      enemy,
      1,
    );
    const lostCombat = { ...combat, winner: 'enemy' as const };
    const base = stateWithMap('event');
    const state: RunState = {
      ...base,
      map: forceNodeType(base.map, 1, 0, 'event', base.act),
      phase: 'combat',
      position: { col: 1, row: 0 },
      fleet: [{ frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] }],
      currentEnemy: enemy,
      combat: lostCombat,
      loanOutstanding: true,
      pendingAmbushBonus: { chainEffect: 'debt-cleared' },
    };
    const result = runReducer(state, { type: 'CONTINUE' });
    expect(result.phase).toBe('defeat');
    expect(result.loanOutstanding).toBe(true);
  });
});

describe('iteration 49.5: the colony ship chain', () => {
  it('escorting the convoy sets colonyStage to 1 (EVENT_CHOOSE, end to end)', () => {
    const state = stateWithMap('event', { phase: 'event', currentEvent: { eventId: 'colony-ship' } });
    const result = runReducer(state, { type: 'EVENT_CHOOSE', choiceIndex: 1 });
    expect(result.colonyStage).toBe(1);
  });

  it("letting the raiders happen clears colonyStage — the chain ends", () => {
    const state = stateWithMap('event', {
      phase: 'event',
      currentEvent: { eventId: 'colony-raiders' },
      colonyStage: 1,
    });
    const result = runReducer(state, { type: 'EVENT_CHOOSE', choiceIndex: 0 });
    expect(result.colonyStage).toBeUndefined();
  });

  it('choosing to drive the raiders off clears colonyStage immediately, at choice time', () => {
    const state = stateWithMap('event', {
      phase: 'event',
      currentEvent: { eventId: 'colony-raiders' },
      colonyStage: 1,
    });
    const result = runReducer(state, { type: 'EVENT_CHOOSE', choiceIndex: 1 });
    expect(result.colonyStage).toBeUndefined();
    expect(result.currentEvent?.ambushBonus).toEqual({ chainEffect: 'colony-defended' });
  });

  it('winning the raider fight restores colonyStage to 2 via chainEffect (a real ambush -> CONTINUE win)', () => {
    const enemy = GAUNTLET[0];
    const combat = initCombat(
      [{ stats: { initiative: 0, hp: 5, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 0 }],
      enemy,
      1,
    );
    const wonCombat = { ...combat, winner: 'player' as const };
    const base = stateWithMap('event');
    const state: RunState = {
      ...base,
      map: forceNodeType(base.map, 1, 0, 'event', base.act),
      phase: 'combat',
      position: { col: 1, row: 0 },
      fleet: [{ frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] }],
      currentEnemy: enemy,
      combat: wonCombat,
      colonyStage: undefined, // cleared at EVENT_CHOOSE time, per the fiction
      pendingAmbushBonus: { chainEffect: 'colony-defended' },
    };
    const result = runReducer(state, { type: 'CONTINUE' });
    expect(result.phase).toBe('reward');
    expect(result.colonyStage).toBe(2);
  });

  it('the founders\' gift and the cash settlement both clear colonyStage, only late-stage arrival reachable', () => {
    const founders = runReducer(
      stateWithMap('event', { phase: 'event', currentEvent: { eventId: 'colony-arrival' }, colonyStage: 2, credits: 0 }),
      { type: 'EVENT_CHOOSE', choiceIndex: 0 },
    );
    expect(founders.colonyStage).toBeUndefined();
    expect(founders.credits).toBe(10);

    const cash = runReducer(
      stateWithMap('event', { phase: 'event', currentEvent: { eventId: 'colony-arrival' }, colonyStage: 2, credits: 0 }),
      { type: 'EVENT_CHOOSE', choiceIndex: 1 },
    );
    expect(cash.colonyStage).toBeUndefined();
    expect(cash.credits).toBe(14);
  });
});
