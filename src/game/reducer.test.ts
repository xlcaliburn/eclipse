import { describe, expect, it, vi } from 'vitest';
import { initCombat, runToEnd } from './combatEngine';
import { shipName } from './shipNames';
import { GAUNTLET, OPENER } from './enemies';
import { MAX_HEAT } from './heat';
import { BOSS_COLUMN } from './map';
import type { CargoTag, GameMap, NodeType } from './map';
import { getPart } from './parts';
import { getUpgrade } from './upgrades';
import {
  applyCargoReward,
  eliteReward,
  globalColumn,
  hasLineOfRetreat,
  initialRunState,
  runReducer,
  SHOP_OFFER_COUNT,
  winReward,
} from './reducer';
import type { PartId, PlayerShipState, RunState } from './types';

function freshCombat(seed = 1, enemy = GAUNTLET[0]) {
  return initCombat(
    [{ stats: { initiative: 0, hp: 5, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 0 }],
    enemy,
    seed,
  );
}

// Act-1 column 0 is normally the single-node opener (iteration 8) — these
// fixtures test generic node-type behavior (combat/shop/repair/event), not
// the opener itself, so they override it to a normal 3-node column. Act
// stays 1, so column numbers still equal the global column reward math
// unchanged from before iteration 8.
function mapWithFirstColumn(type: 'combat' | 'elite' | 'shop' | 'repair' | 'event'): GameMap {
  const base = initialRunState().map;
  const overriddenCol0 = [0, 1, 2].map((row) => ({ col: 0, row, type }));
  const act1Columns = base.act1Columns.map((col, i) => (i === 0 ? overriddenCol0 : col));
  return { ...base, act1Columns };
}

function stateWithMap(type: 'combat' | 'elite' | 'shop' | 'repair' | 'event', overrides: Partial<RunState> = {}): RunState {
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

describe('CHOOSE_COMMANDER — setup phase gate', () => {
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

  it('CHOOSE_COMMANDER moves to setup and records the pick', () => {
    const state = initialRunState();
    const result = runReducer(state, { type: 'CHOOSE_COMMANDER', commanderId: state.commanderChoices[0] });
    expect(result.phase).toBe('setup');
    expect(result.commanderId).toBe(state.commanderChoices[0]);
  });

  // Iteration 21: the free starting Interceptor moved from the Warlord to
  // the new Admiral (wide) when the Warlord was reworked to a tall,
  // one-capital-ship doctrine.
  it('the Admiral starts with a free, ion-fitted Interceptor — fleet begins at 2', () => {
    let state = initialRunState();
    state = { ...state, commanderChoices: ['admiral', 'merchant', 'engineer'] };
    const result = runReducer(state, { type: 'CHOOSE_COMMANDER', commanderId: 'admiral' });
    expect(result.fleet).toHaveLength(2);
    expect(result.fleet[1].frameId).toBe('interceptor');
    expect(result.fleet[1].equipped).toEqual(['ion']);
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

describe('setup — building the starting cruiser', () => {
  it('starts in the setup phase with the default loadout pre-filled', () => {
    const state: RunState = { ...initialRunState(), phase: 'setup' };
    expect(state.phase).toBe('setup');
    expect(state.fleet).toHaveLength(1);
    expect(state.fleet[0].equipped.length).toBeGreaterThan(0);
  });

  it('SETUP_ADD_PART / SETUP_REMOVE_PART edit the starting loadout, capped at the 12-credit budget', () => {
    let state: RunState = {
      ...initialRunState(),
      phase: 'setup',
      fleet: [{ frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] }],
    };
    state = runReducer(state, { type: 'SETUP_ADD_PART', partId: 'ion' });
    state = runReducer(state, { type: 'SETUP_ADD_PART', partId: 'ion' });
    state = runReducer(state, { type: 'SETUP_ADD_PART', partId: 'comp1' });
    state = runReducer(state, { type: 'SETUP_ADD_PART', partId: 'hull1' });
    expect(state.fleet[0].equipped).toEqual(['ion', 'ion', 'comp1', 'hull1']);

    // Budget fully spent (4 x 3cr = 12cr) — a 5th add would exceed it.
    state = runReducer(state, { type: 'SETUP_ADD_PART', partId: 'shield1' });
    expect(state.fleet[0].equipped).toHaveLength(4);

    state = runReducer(state, { type: 'SETUP_REMOVE_PART', partId: 'hull1' });
    expect(state.fleet[0].equipped).toEqual(['ion', 'ion', 'comp1']);

    // Room again after the removal.
    state = runReducer(state, { type: 'SETUP_ADD_PART', partId: 'shield1' });
    expect(state.fleet[0].equipped).toEqual(['ion', 'ion', 'comp1', 'shield1']);
  });

  it('rejects a part that is not in the allowed tier-1 set, regardless of budget', () => {
    let state: RunState = {
      ...initialRunState(),
      phase: 'setup',
      fleet: [{ frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] }],
    };
    state = runReducer(state, { type: 'SETUP_ADD_PART', partId: 'plasma' });
    expect(state.fleet[0].equipped).toEqual([]);
  });

  it('the player can swap the default 2-gun+computer+hull build for 4 guns instead', () => {
    let state: RunState = {
      ...initialRunState(),
      phase: 'setup',
      fleet: [{ frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] }],
    };
    for (const partId of ['ion', 'ion', 'ion', 'ion'] as const) {
      state = runReducer(state, { type: 'SETUP_ADD_PART', partId });
    }
    const result = runReducer(state, { type: 'SETUP_CONFIRM' });
    expect(result.phase).toBe('map');
    expect(result.fleet[0].equipped).toEqual(['ion', 'ion', 'ion', 'ion']);
  });

  it('SETUP_CONFIRM refuses a weaponless build', () => {
    let state: RunState = {
      ...initialRunState(),
      phase: 'setup',
      fleet: [{ frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] }],
    };
    state = runReducer(state, { type: 'SETUP_ADD_PART', partId: 'hull1' });
    state = runReducer(state, { type: 'SETUP_ADD_PART', partId: 'comp1' });
    const result = runReducer(state, { type: 'SETUP_CONFIRM' });
    expect(result.phase).toBe('setup');
  });

  it('SETUP_CONFIRM accepts the pre-filled default build unmodified', () => {
    const result = runReducer({ ...initialRunState(), phase: 'setup' }, { type: 'SETUP_CONFIRM' });
    expect(result.phase).toBe('map');
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
    const notOffered = (['spine', 'reactor', 'lattice', 'drives', 'optics', 'autoloader', 'regen', 'salvage', 'bay'] as const).find(
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
    let state = runReducer(stateWithMap('event'), { type: 'PICK_NODE', row: 0 });
    expect(state.phase).toBe('event');
    expect(state.currentEvent).toBeDefined();

    // Option 0 is always the safe, unrequired, non-ambush choice across the
    // whole table (Salvage/Detour/Leave it/Sell.../Move on/...), so this
    // stays valid no matter which event the map's rng happens to draw.
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
});

describe('BUY_SHIP — Interceptor and Bastion, the Flagship is never purchasable', () => {
  it('adds an Interceptor to the fleet, pre-fitted with an ion cannon', () => {
    let state = stateWithMap('shop', { phase: 'shop', credits: 20 });
    state = runReducer(state, { type: 'BUY_SHIP', frameId: 'interceptor' });
    expect(state.fleet).toHaveLength(2);
    expect(state.fleet[1].frameId).toBe('interceptor');
    expect(state.fleet[1].damage).toBe(0);
    expect(state.fleet[1].equipped).toEqual(['ion']);
    expect(state.credits).toBe(20 - 6); // interceptor cost (6 as of iteration 5)
  });

  it('adds a Bastion to the fleet, pre-fitted with a lure beacon', () => {
    let state = stateWithMap('shop', { phase: 'shop', credits: 20 });
    state = runReducer(state, { type: 'BUY_SHIP', frameId: 'bastion' });
    expect(state.fleet).toHaveLength(2);
    expect(state.fleet[1].frameId).toBe('bastion');
    expect(state.fleet[1].equipped).toEqual(['lure']);
    expect(state.credits).toBe(20 - 12); // bastion cost
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

  it('adds a Dreadnought (iteration 8): 20cr, no starting fit, 8 slots and a 4-weapon cap enforced', () => {
    let state = stateWithMap('shop', { phase: 'shop', credits: 20 });
    state = runReducer(state, { type: 'BUY_SHIP', frameId: 'dreadnought' });
    expect(state.fleet).toHaveLength(2);
    expect(state.fleet[1].frameId).toBe('dreadnought');
    expect(state.fleet[1].equipped).toEqual([]);
    expect(state.credits).toBe(0); // 20cr cost

    state = { ...state, inventory: ['plasma', 'plasma', 'plasma', 'plasma', 'plasma'] };
    for (let i = 0; i < 4; i++) {
      state = runReducer(state, { type: 'EQUIP', shipIndex: 1, partId: 'plasma' });
    }
    expect(state.fleet[1].equipped).toHaveLength(4); // 4 weapons fit (well under 8 slots)
    const overCap = runReducer(state, { type: 'EQUIP', shipIndex: 1, partId: 'plasma' });
    expect(overCap.fleet[1].equipped).toHaveLength(4); // 5th weapon refused — max 4
  });

  it('adds a Cruiser (iteration 9): 10cr, pre-fitted with an ion cannon, 4 slots, no weapon cap', () => {
    let state = stateWithMap('shop', { phase: 'shop', credits: 10 });
    state = runReducer(state, { type: 'BUY_SHIP', frameId: 'light-cruiser' });
    expect(state.fleet).toHaveLength(2);
    expect(state.fleet[1].frameId).toBe('light-cruiser');
    expect(state.fleet[1].equipped).toEqual(['ion']);
    expect(state.credits).toBe(0); // 10cr cost

    state = { ...state, inventory: ['plasma', 'plasma', 'plasma'] };
    for (let i = 0; i < 3; i++) {
      state = runReducer(state, { type: 'EQUIP', shipIndex: 1, partId: 'plasma' });
    }
    expect(state.fleet[1].equipped).toHaveLength(4); // ion + 3 plasma fill all 4 slots, no weapon-cap refusal
  });

  // Iteration 21 (the Admiral, wide): every purchasable frame 25% off,
  // rounded down (floor(cost * 0.75), not cost - floor(cost * 0.25) — the
  // two differ on an odd cost and rounding toward the player is deliberate).
  it('the Admiral buys every frame 25% cheaper, rounded down in the player\'s favor', () => {
    const cases: ['interceptor' | 'bastion' | 'dreadnought' | 'light-cruiser', number][] = [
      ['interceptor', 4], // 6cr -> floor(4.5) = 4
      ['bastion', 9], // 12cr -> floor(9) = 9
      ['dreadnought', 15], // 20cr -> floor(15) = 15
      ['light-cruiser', 7], // 10cr -> floor(7.5) = 7
    ];
    for (const [frameId, expectedCost] of cases) {
      const state = stateWithMap('shop', { phase: 'shop', credits: 20, commanderId: 'admiral' });
      const result = runReducer(state, { type: 'BUY_SHIP', frameId });
      expect(result.credits).toBe(20 - expectedCost);
    }
  });

  // Iteration 21 (the Warlord, tall): only the Dreadnought is discounted,
  // and flatly (5cr) rather than by percentage — everything else is full
  // price, unlike the Admiral's blanket discount.
  it('the Warlord buys only the Dreadnought cheaper (flat -5cr); other frames are full price', () => {
    const dread = stateWithMap('shop', { phase: 'shop', credits: 20, commanderId: 'warlord' });
    expect(runReducer(dread, { type: 'BUY_SHIP', frameId: 'dreadnought' }).credits).toBe(20 - 15); // 20 - 5

    const interceptor = stateWithMap('shop', { phase: 'shop', credits: 20, commanderId: 'warlord' });
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
    const admiral = stateWithMap('shop', { phase: 'shop', credits: 100, commanderId: 'admiral', fleet: fullFleet });
    expect(runReducer(admiral, { type: 'BUY_SHIP', frameId: 'interceptor' }).fleet).toHaveLength(5);

    const plain = stateWithMap('shop', { phase: 'shop', credits: 100, fleet: fullFleet });
    expect(runReducer(plain, { type: 'BUY_SHIP', frameId: 'interceptor' }).fleet).toHaveLength(4);
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

  it('scuttling the delivery carrier fails the quest; scuttling a ship before the carrier re-indexes it', () => {
    const fleet: PlayerShipState[] = [
      { frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] },
      { frameId: 'interceptor', equipped: [], damage: 0, upgrades: [] },
      { frameId: 'bastion', equipped: ['cargo-pod'], damage: 0, upgrades: [] },
    ];
    const state: RunState = {
      ...initialRunState(),
      phase: 'shop',
      fleet,
      activeQuest: { archetype: 'delivery', target: { col: 4, row: 0 }, carrierShipIndex: 2 },
    };
    // Scuttle ship #1 (before the carrier) — the carrier is still alive but shifts to index 1.
    const afterMidScuttle = runReducer(state, { type: 'SCUTTLE_SHIP', shipIndex: 1 });
    expect(afterMidScuttle.activeQuest).toEqual({
      archetype: 'delivery',
      target: { col: 4, row: 0 },
      carrierShipIndex: 1,
    });

    // Scuttling the carrier itself fails the quest.
    const afterCarrierScuttle = runReducer(state, { type: 'SCUTTLE_SHIP', shipIndex: 2 });
    expect(afterCarrierScuttle.activeQuest).toBeUndefined();
  });
});

describe('cards — hand cap and PLAY_CARD (iteration 7: pool trimmed to {bulkheads, volley})', () => {
  it('PLAY_CARD removes the card from hand and applies its effect', () => {
    const combat = initCombat(
      [{ stats: { initiative: 0, hp: 5, computer: 0, shield: 0, cannons: [{ diceCount: 1, damage: 1 }], missiles: [] }, initialDamage: 0 }],
      GAUNTLET[0],
      1,
    );
    let state: RunState = { ...stateWithMap('combat'), phase: 'combat', combat, hand: ['volley'] };
    state = runReducer(state, { type: 'PLAY_CARD', cardId: 'volley' });
    expect(state.hand).toHaveLength(0);
    expect(state.combat?.roundModifiers.volleyActive).toBe(true);
  });

  it('PLAY_CARD refuses once the fight already has a winner', () => {
    const combat = initCombat(
      [{ stats: { initiative: 0, hp: 5, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 0 }],
      GAUNTLET[0],
      1,
    );
    const won = { ...combat, winner: 'player' as const };
    let state: RunState = { ...stateWithMap('combat'), phase: 'combat', combat: won, hand: ['bulkheads'] };
    state = runReducer(state, { type: 'PLAY_CARD', cardId: 'bulkheads' });
    expect(state.hand).toEqual(['bulkheads']); // rejected, still in hand
  });
});

describe('starting hand + missile-phase auto-skip (player feedback)', () => {
  it('a new run starts with bulkheads and volley in hand', () => {
    const state = initialRunState();
    expect(state.hand).toEqual(['bulkheads', 'volley']);
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
      expect(result.fleet[0].damage).toBe(combat.playerShips[0].damage);
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

  it('winning the act-1 boss pays like an elite (no upgrade pick) and moves to the interlude, not victory', () => {
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
    expect(result.credits).toBe(21); // eliteReward(globalColumn(1, 10)) = 11 + 10
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
      position: { col: 10, row: 0 }, // the final-boss column
      fleet,
      combat: wonCombat,
    };

    const result = runReducer(state, { type: 'CONTINUE' });
    expect(result.phase).toBe('victory');
    expect(result.pendingReward).toBeUndefined();
  });

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

  // Iteration 21 (the Warlord, tall): the Flagship alone may hold 2
  // upgrades — a second pick stacks instead of replacing; a third still
  // replaces (the oldest), keeping the cap at 2 rather than growing forever.
  it("the Warlord's Flagship holds 2 upgrades; a second stacks, a third replaces the oldest", () => {
    const fleet: PlayerShipState[] = [{ frameId: 'cruiser', equipped: [], damage: 0, upgrades: ['spine'] }];
    const state = runReducer(wonNonBossState({ fleet, commanderId: 'warlord' }, true), { type: 'CONTINUE' });
    const second = state.pendingReward!.upgradeOptions!.find((u) => u !== 'spine')!;
    let picked = runReducer(state, { type: 'PICK_UPGRADE', upgradeId: second, shipIndex: 0 });
    expect(picked.fleet[0].upgrades).toEqual(['spine', second]); // stacked, not replaced

    const state2 = runReducer(wonNonBossState({ fleet: picked.fleet, commanderId: 'warlord' }, true), {
      type: 'CONTINUE',
    });
    const third = state2.pendingReward!.upgradeOptions!.find((u) => u !== 'spine' && u !== second)!;
    picked = runReducer(state2, { type: 'PICK_UPGRADE', upgradeId: third, shipIndex: 0 });
    expect(picked.fleet[0].upgrades).toHaveLength(2); // cap holds at 2
    expect(picked.fleet[0].upgrades).toEqual([second, third]); // oldest ('spine') fell off
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

describe('upgrades — regen and salvage', () => {
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
    expect(result.fleet[0].damage).toBe(3); // healed by exactly 1
  });

  it('salvage adds 3 credits per instance on a win', () => {
    const state = wonNonBossState({
      fleet: [{ frameId: 'cruiser', equipped: [], damage: 0, upgrades: ['salvage', 'salvage'] }],
    });
    const before = state.credits;
    const result = runReducer(state, { type: 'CONTINUE' });
    // base reward (winReward(0) = 7) + 2x salvage (3 each) = 13
    expect(result.credits - before).toBe(7 + 6);
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
    expect(result.pendingReward?.credits).toBe(7 + 1); // winReward(1)
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

  it('a chooseCard option without that card actually in hand is a no-op', () => {
    const state = stateWithMap('event', {
      phase: 'event',
      currentEvent: { eventId: 'militia-requisition' },
      hand: ['bulkheads'],
    });
    const missing = runReducer(state, { type: 'EVENT_CHOOSE', choiceIndex: 1 });
    expect(missing).toEqual(state);
    const wrongCard = runReducer(state, { type: 'EVENT_CHOOSE', choiceIndex: 1, cardId: 'volley' });
    expect(wrongCard).toEqual(state);
  });

  it('a chosen card actually leaves the hand once validated', () => {
    const state = stateWithMap('event', {
      phase: 'event',
      currentEvent: { eventId: 'militia-requisition' },
      hand: ['bulkheads'],
    });
    const result = runReducer(state, { type: 'EVENT_CHOOSE', choiceIndex: 1, cardId: 'bulkheads' });
    expect(result.hand).not.toContain('bulkheads');
    expect(result.credits).toBe(state.credits + 7);
  });

  it('an out-of-range choiceIndex is a no-op', () => {
    const state = stateWithMap('event', { phase: 'event', currentEvent: { eventId: 'militia-requisition' } });
    const result = runReducer(state, { type: 'EVENT_CHOOSE', choiceIndex: 5 });
    expect(result).toEqual(state);
  });

  it('credits never go negative through the reducer either', () => {
    const state = stateWithMap('event', {
      phase: 'event',
      currentEvent: { eventId: 'asteroid-field' },
      credits: 1,
    });
    const result = runReducer(state, { type: 'EVENT_CHOOSE', choiceIndex: 0 }); // detour, -2
    expect(result.credits).toBe(0);
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

describe('ambush win bonus (14.2/14.3)', () => {
  it('EVENT_CONTINUE carries the resolved ambush bonus onto RunState.pendingAmbushBonus', () => {
    let state = stateWithMap('event', { phase: 'event', currentEvent: { eventId: 'distress-beacon' } });
    state = runReducer(state, { type: 'EVENT_CHOOSE', choiceIndex: 1 }); // drive the raiders off
    expect(state.currentEvent?.ambushBonus?.credits).toBe(6);

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
    expect(result.pendingReward?.credits).toBe(7 + 1 + 6); // winReward(1) + the ambush bonus
    expect(result.inventory).toContain('plasma');
    expect(result.pendingAmbushBonus).toBeUndefined();
  });

  it('withdrawing from an event ambush forfeits the pending bonus', () => {
    let state = runReducer(stateWithMap('combat'), { type: 'PICK_NODE', row: 0 });
    state = {
      ...state,
      phase: 'combat',
      combat: { ...freshCombat(), round: 1 },
      pendingAmbushBonus: { credits: 6 },
    };
    const result = runReducer(state, { type: 'WITHDRAW' });
    expect(result.pendingAmbushBonus).toBeUndefined();
  });
});

describe('WITHDRAW — retreat from a losing fight', () => {
  it('is rejected before round 1 (missile phase must resolve first)', () => {
    let state = runReducer(stateWithMap('combat'), { type: 'PICK_NODE', row: 0 });
    state = { ...state, phase: 'combat', combat: freshCombat() }; // round is still 0
    const result = runReducer(state, { type: 'WITHDRAW' });
    expect(result.phase).toBe('combat'); // rejected, unchanged
  });

  it('is rejected once the fight already has a winner', () => {
    let state = runReducer(stateWithMap('combat'), { type: 'PICK_NODE', row: 0 });
    const combat = { ...freshCombat(), round: 1, winner: 'player' as const };
    state = { ...state, phase: 'combat', combat };
    const result = runReducer(state, { type: 'WITHDRAW' });
    expect(result.phase).toBe('combat');
  });

  it('persists damage, salvages a destroyed ship (upgrades do not survive), marks the node fled, reverts position, pays nothing', () => {
    let state = runReducer(stateWithMap('combat'), { type: 'PICK_NODE', row: 0 });
    const firstPosition = state.position!;
    const fleet: PlayerShipState[] = [
      { frameId: 'cruiser', equipped: ['ion', 'comp1'], damage: 0, upgrades: [] }, // survives
      { frameId: 'interceptor', equipped: ['ion'], damage: 0, upgrades: ['spine'] }, // destroyed
    ];
    const combat = initCombat(
      [
        { stats: { initiative: 0, hp: 5, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 2 },
        { stats: { initiative: 0, hp: 1, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 1 }, // 0 remaining
      ],
      GAUNTLET[0],
      1,
    );
    state = { ...state, phase: 'combat', fleet, combat: { ...combat, round: 1 } };
    const creditsBefore = state.credits;

    const result = runReducer(state, { type: 'WITHDRAW' });
    expect(result.phase).toBe('map');
    expect(result.fleet).toHaveLength(1);
    expect(result.fleet[0].frameId).toBe('cruiser');
    expect(result.fleet[0].damage).toBe(2);
    expect(result.inventory).toContain('ion');
    expect(result.credits).toBe(creditsBefore); // no reward
    expect(result.pendingReward).toBeUndefined();
    expect(result.fled).toContainEqual(firstPosition);
    expect(result.position).toBeNull(); // reverted to before column 0
    expect(result.visited).toHaveLength(0);
  });

  it('a fled node can never be picked again', () => {
    let state = runReducer(stateWithMap('combat'), { type: 'PICK_NODE', row: 0 });
    state = { ...state, phase: 'combat', combat: { ...freshCombat(), round: 1 } };
    state = runReducer(state, { type: 'WITHDRAW' });
    expect(state.phase).toBe('map');

    const retry = runReducer(state, { type: 'PICK_NODE', row: 0 });
    expect(retry.phase).toBe('map'); // refused — still on the map
    expect(retry.position).toBeNull();
  });

  it('has no line of retreat at the boss node (only 1 node in that column)', () => {
    const state = stateWithMap('combat', {
      position: { col: 8, row: 0 },
      visited: [
        { col: 7, row: 0 },
        { col: 8, row: 0 },
      ],
    });
    const atBoss: RunState = {
      ...state,
      position: { col: 10, row: 0 },
      visited: [...state.visited, { col: 9, row: 0 }, { col: 10, row: 0 }],
    };
    expect(hasLineOfRetreat(atBoss)).toBe(false);

    const combat = { ...freshCombat(1, GAUNTLET[8]), round: 1 };
    const result = runReducer({ ...atBoss, phase: 'combat', combat }, { type: 'WITHDRAW' });
    expect(result.phase).toBe('combat'); // rejected
  });

  it('has no line of retreat during an ambush fight (position is still the event node)', () => {
    let state = runReducer(stateWithMap('event'), { type: 'PICK_NODE', row: 0 });
    state = { ...state, currentEvent: { eventId: 'ancient-cache', ambushEnemy: GAUNTLET[0] } };
    state = runReducer(state, { type: 'EVENT_CONTINUE' }); // -> 'prep', position still the event node
    expect(hasLineOfRetreat(state)).toBe(false);

    state = runReducer(state, { type: 'ENGAGE' });
    if (state.combat) state = { ...state, combat: { ...state.combat, round: 1 } };
    const result = runReducer(state, { type: 'WITHDRAW' });
    expect(result.phase).toBe('combat'); // rejected
  });

  it('has no line of retreat once every sibling node in the column is also fled', () => {
    let state = runReducer(stateWithMap('combat'), { type: 'PICK_NODE', row: 0 });
    const col0 = state.map.act1Columns[0];
    const siblings = col0.filter((n) => n.row !== state.position!.row).map((n) => ({ col: n.col, row: n.row }));
    state = { ...state, fled: siblings };
    expect(hasLineOfRetreat(state)).toBe(false);
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

  it('visionCol never decreases when WITHDRAW reverts position (monotonic reveal)', () => {
    let state = runReducer(stateWithMap('combat'), { type: 'PICK_NODE', row: 0 });
    state = { ...state, phase: 'combat', combat: { ...freshCombat(), round: 1 } };
    const visionBefore = state.visionCol;
    state = runReducer(state, { type: 'WITHDRAW' });
    expect(state.phase).toBe('map');
    expect(state.position).toBeNull(); // reverted to before column 0
    expect(state.visionCol).toBe(visionBefore); // still revealed
  });

  it('REROLL does not touch visionCol/revealedNodes', () => {
    let state: RunState = { ...initialRunState(), phase: 'shop', credits: 20, shopOffers: ['ion'] };
    state = runReducer(state, { type: 'REROLL' });
    expect(state.visionCol).toBe(0);
    expect(state.revealedNodes).toEqual([]);
  });
});

describe('quests (iteration 6)', () => {
  function stateForQuestTest(overrides: Partial<RunState> = {}): RunState {
    return {
      ...initialRunState(),
      phase: 'map',
      position: { col: 0, row: 1 },
      visited: [{ col: 0, row: 1 }],
      visionCol: 1,
      ...overrides,
    };
  }

  it('ACCEPT_QUEST (recon/bounty) deducts the stake, reveals the target node, and sets activeQuest; refuses once cap reached', () => {
    let state: RunState = {
      ...initialRunState(),
      phase: 'shop',
      credits: 20,
      shopQuestOffer: { archetype: 'recon', target: { col: 4, row: 0 } },
    };
    state = runReducer(state, { type: 'ACCEPT_QUEST' });
    expect(state.activeQuest).toEqual({ archetype: 'recon', target: { col: 4, row: 0 } });
    expect(state.credits).toBe(17); // 20 - recon's 3cr stake
    expect(state.revealedNodes).toContainEqual({ col: 4, row: 0 });
    expect(state.shopQuestOffer).toBeUndefined();

    const again = runReducer(
      { ...state, phase: 'shop', shopQuestOffer: { archetype: 'bounty', target: { col: 5, row: 0 } } },
      { type: 'ACCEPT_QUEST' },
    );
    expect(again.activeQuest?.archetype).toBe('recon'); // refused — cap 1, unchanged
    expect(again.credits).toBe(17); // refused — no stake taken
  });

  it('ACCEPT_QUEST refuses when the stake is unaffordable', () => {
    const state: RunState = {
      ...initialRunState(),
      phase: 'shop',
      credits: 2, // less than recon's 3cr stake
      shopQuestOffer: { archetype: 'recon', target: { col: 4, row: 0 } },
    };
    const result = runReducer(state, { type: 'ACCEPT_QUEST' });
    expect(result.activeQuest).toBeUndefined();
    expect(result.credits).toBe(2);
    expect(result.shopQuestOffer).toBeDefined(); // offer still stands
  });

  it('ACCEPT_QUEST (delivery) requires a carrier ship with room and fits the cargo pod', () => {
    const fleet: PlayerShipState[] = [{ frameId: 'cruiser', equipped: ['ion'], damage: 0, upgrades: [] }];
    const state: RunState = {
      ...initialRunState(),
      phase: 'shop',
      credits: 20,
      fleet,
      shopQuestOffer: { archetype: 'delivery', target: { col: 4, row: 0 } },
    };
    const withoutCarrier = runReducer(state, { type: 'ACCEPT_QUEST' });
    expect(withoutCarrier.activeQuest).toBeUndefined(); // no carrierShipIndex given — refused

    const withCarrier = runReducer(state, { type: 'ACCEPT_QUEST', carrierShipIndex: 0 });
    expect(withCarrier.activeQuest).toEqual({ archetype: 'delivery', target: { col: 4, row: 0 }, carrierShipIndex: 0 });
    expect(withCarrier.fleet[0].equipped).toContain('cargo-pod');
    expect(withCarrier.credits).toBe(15); // 20 - delivery's 5cr stake
  });

  it('recon completion grants +2 vision plus two reveals, then clears the quest', () => {
    let state = stateForQuestTest({
      activeQuest: { archetype: 'recon', target: { col: 2, row: 1 } },
      escalations: [
        { id: 'hardened', act: 1, landsAfterColumn: 4, revealed: false },
        { id: 'deflectors', act: 1, landsAfterColumn: 1, revealed: false },
      ],
      visionCol: 1,
    });
    state = { ...state, map: forceNodeType(state.map, 1, 1, 'shop') };
    state = runReducer(state, { type: 'PICK_NODE', row: 1 }); // -> col1 (shop, so it resolves back to 'map')
    expect(state.phase).toBe('shop');
    state = runReducer(state, { type: 'LEAVE_SHOP' });
    const before = state;
    state = runReducer(state, { type: 'PICK_NODE', row: 1 }); // -> col2, the target

    expect(state.activeQuest).toBeUndefined();
    expect(state.visionCol).toBeGreaterThanOrEqual(before.visionCol + 1 + 2); // +1 arrival, +2 quest bundle

    // Which two reveals land is a seeded draw over whatever is still unknown,
    // so assert the payout in general terms: strictly more is known after.
    const knowledge = (s: typeof state) =>
      (s.bossRevealed ? 1 : 0) +
      s.visionCol +
      s.revealedNodes.length +
      s.escalations.filter((e) => e.revealed).length;
    expect(knowledge(state)).toBeGreaterThan(knowledge(before) + 2);
  });

  it('delivery completion pays credits + removes the pod, and clears the quest', () => {
    const fleet: PlayerShipState[] = [{ frameId: 'cruiser', equipped: ['ion', 'cargo-pod'], damage: 0, upgrades: [] }];
    let state = stateForQuestTest({
      fleet,
      credits: 0,
      activeQuest: { archetype: 'delivery', target: { col: 2, row: 1 }, carrierShipIndex: 0 },
    });
    state = { ...state, map: forceNodeType(state.map, 1, 1, 'shop') };
    state = runReducer(state, { type: 'PICK_NODE', row: 1 });
    state = runReducer(state, { type: 'LEAVE_SHOP' });
    state = runReducer(state, { type: 'PICK_NODE', row: 1 });
    expect(state.activeQuest).toBeUndefined();
    expect(state.credits).toBe(15); // delivery's reward, stake already excluded from this fixture
    expect(state.fleet[0].equipped).not.toContain('cargo-pod');
  });

  it('passive failure: advancing past the target column (or missing the row) ends the quest with no reward', () => {
    const fleet: PlayerShipState[] = [{ frameId: 'cruiser', equipped: ['ion', 'cargo-pod'], damage: 0, upgrades: [] }];
    let state = stateForQuestTest({
      fleet,
      credits: 0,
      activeQuest: { archetype: 'delivery', target: { col: 1, row: 2 }, carrierShipIndex: 0 }, // we'll go to row 1 instead
    });
    state = runReducer(state, { type: 'PICK_NODE', row: 1 }); // col1 row1 — misses the row-2 target in the same column
    expect(state.activeQuest).toBeUndefined();
    expect(state.credits).toBe(0); // no reward
    expect(state.fleet[0].equipped).not.toContain('cargo-pod');
  });

  it('bounty: the target combat node hosts a named elite variant, and winning pays +18cr and an upgrade pick on top of the normal reward', () => {
    let state = stateForQuestTest({ activeQuest: { archetype: 'bounty', target: { col: 1, row: 1 } } });
    state = { ...state, map: forceNodeType(state.map, 1, 1, 'combat') };
    state = runReducer(state, { type: 'PICK_NODE', row: 1 });
    expect(state.phase).toBe('prep');
    expect(state.currentEnemy!.id).toContain('-bounty');

    const combat = initCombat(
      [{ stats: { initiative: 0, hp: 5, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 0 }],
      state.currentEnemy!,
      1,
    );
    state = { ...state, phase: 'combat', combat: { ...combat, winner: 'player' as const } };
    const result = runReducer(state, { type: 'CONTINUE' });
    expect(result.phase).toBe('reward');
    expect(result.pendingReward?.credits).toBe(winReward(1) + 18);
    expect(result.pendingReward?.upgradeOptions).toHaveLength(3);
    expect(result.activeQuest).toBeUndefined();
  });

  it('withdrawing from a bounty fight fails the quest (the node is fled — the target is gone)', () => {
    let state = stateForQuestTest({ activeQuest: { archetype: 'bounty', target: { col: 1, row: 1 } } });
    state = { ...state, map: forceNodeType(state.map, 1, 1, 'combat') };
    state = runReducer(state, { type: 'PICK_NODE', row: 1 });
    state = runReducer(state, { type: 'ENGAGE' });
    if (state.combat) state = { ...state, combat: { ...state.combat, round: 1 } };
    state = runReducer(state, { type: 'WITHDRAW' });
    expect(state.phase).toBe('map');
    expect(state.activeQuest).toBeUndefined();
  });

  it('a delivery quest fails if its carrier ship is destroyed in any fight, not just at the target', () => {
    const fleet: PlayerShipState[] = [
      { frameId: 'interceptor', equipped: ['ion', 'cargo-pod'], damage: 0, upgrades: [] }, // destroyed
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
      activeQuest: { archetype: 'delivery', target: { col: 5, row: 0 }, carrierShipIndex: 0 },
    };
    const result = runReducer(state, { type: 'CONTINUE' });
    expect(result.activeQuest).toBeUndefined();
    expect(result.inventory).not.toContain('cargo-pod'); // lost with the ship, not salvaged
  });

  it('MOVE_CARGO_POD relocates the pod to another ship and updates the carrier index', () => {
    const fleet: PlayerShipState[] = [
      { frameId: 'cruiser', equipped: ['ion', 'cargo-pod'], damage: 0, upgrades: [] },
      { frameId: 'interceptor', equipped: ['ion'], damage: 0, upgrades: [] },
    ];
    let state: RunState = {
      ...initialRunState(),
      phase: 'prep',
      fleet,
      activeQuest: { archetype: 'delivery', target: { col: 4, row: 0 }, carrierShipIndex: 0 },
    };
    state = runReducer(state, { type: 'MOVE_CARGO_POD', toShipIndex: 1 });
    expect(state.fleet[0].equipped).not.toContain('cargo-pod');
    expect(state.fleet[1].equipped).toContain('cargo-pod');
    expect(state.activeQuest?.carrierShipIndex).toBe(1);
  });

  it('UNEQUIP refuses to remove the cargo pod to inventory', () => {
    const fleet: PlayerShipState[] = [{ frameId: 'cruiser', equipped: ['cargo-pod'], damage: 0, upgrades: [] }];
    let state: RunState = { ...initialRunState(), phase: 'prep', fleet };
    state = runReducer(state, { type: 'UNEQUIP', shipIndex: 0, partId: 'cargo-pod' as PartId });
    expect(state.fleet[0].equipped).toContain('cargo-pod');
    expect(state.inventory).not.toContain('cargo-pod');
  });
});

describe('BUY_COMMODITY_LOT / SELL_COMMODITY_LOT (iteration 20)', () => {
  it('loads the lot onto the chosen ship, charges 4cr, and records the global column bought at on that ship', () => {
    let state = stateWithMap('shop', { phase: 'shop', credits: 10, position: { col: 2, row: 0 } });
    state = runReducer(state, { type: 'BUY_COMMODITY_LOT', shipIndex: 0 });
    expect(state.fleet[0].equipped).toContain('commodity-lot');
    expect(state.credits).toBe(6);
    expect(state.fleet[0].commodityLotBoughtAtGlobalColumn).toBe(globalColumn(1, 2));
  });

  it('refuses without 4cr, without a free hardpoint, or if the fleet already carries a lot', () => {
    const poor = stateWithMap('shop', { phase: 'shop', credits: 3 });
    expect(runReducer(poor, { type: 'BUY_COMMODITY_LOT', shipIndex: 0 }).fleet[0].equipped).not.toContain(
      'commodity-lot',
    );

    const dreadnoughtFull: PlayerShipState[] = [
      { frameId: 'dreadnought', equipped: Array(8).fill('hull1') as PartId[], damage: 0, upgrades: [] },
    ];
    const full = stateWithMap('shop', { phase: 'shop', credits: 10, fleet: dreadnoughtFull });
    expect(runReducer(full, { type: 'BUY_COMMODITY_LOT', shipIndex: 0 }).fleet[0].equipped).not.toContain(
      'commodity-lot',
    );

    const alreadyCarrying = stateWithMap('shop', {
      phase: 'shop',
      credits: 10,
      fleet: [
        { frameId: 'cruiser', equipped: ['commodity-lot'], damage: 0, upgrades: [] },
        { frameId: 'interceptor', equipped: [], damage: 0, upgrades: [] },
      ],
    });
    const result = runReducer(alreadyCarrying, { type: 'BUY_COMMODITY_LOT', shipIndex: 1 });
    expect(result.fleet[1].equipped).not.toContain('commodity-lot'); // fleet-wide cap of 1
    expect(result.credits).toBe(10); // unspent — the buy never happened
  });

  it('refuses to load a lot onto a mercenary — it would be lost with the ship after one fight', () => {
    const fleet: PlayerShipState[] = [
      { frameId: 'interceptor', equipped: ['ion'], damage: 0, upgrades: [], mercenary: true },
    ];
    const state = stateWithMap('shop', { phase: 'shop', credits: 10, fleet });
    const result = runReducer(state, { type: 'BUY_COMMODITY_LOT', shipIndex: 0 });
    expect(result.fleet[0].equipped).not.toContain('commodity-lot');
    expect(result.credits).toBe(10);
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

  it("the Merchant carries 2 lots at 3cr each; everyone else is capped at 1 lot at 4cr", () => {
    const plain = stateWithMap('shop', {
      phase: 'shop',
      credits: 10,
      fleet: [
        { frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] },
        { frameId: 'interceptor', equipped: [], damage: 0, upgrades: [] },
      ],
    });
    let plainState = runReducer(plain, { type: 'BUY_COMMODITY_LOT', shipIndex: 0 });
    expect(plainState.credits).toBe(6); // 4cr base price
    plainState = runReducer(plainState, { type: 'BUY_COMMODITY_LOT', shipIndex: 1 });
    expect(plainState.fleet[1].equipped).not.toContain('commodity-lot'); // capped at 1

    const merchant = stateWithMap('shop', {
      phase: 'shop',
      credits: 10,
      commanderId: 'merchant',
      fleet: [
        { frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] },
        { frameId: 'interceptor', equipped: [], damage: 0, upgrades: [] },
      ],
    });
    let merchantState = runReducer(merchant, { type: 'BUY_COMMODITY_LOT', shipIndex: 0 });
    expect(merchantState.credits).toBe(7); // 3cr Merchant price
    merchantState = runReducer(merchantState, { type: 'BUY_COMMODITY_LOT', shipIndex: 1 });
    expect(merchantState.credits).toBe(4); // second lot, also 3cr
    expect(merchantState.fleet[1].equipped).toContain('commodity-lot');
    // A third is still refused even for the Merchant.
    const thirdShip = runReducer(
      { ...merchantState, fleet: [...merchantState.fleet, { frameId: 'bastion', equipped: [], damage: 0, upgrades: [] }] },
      { type: 'BUY_COMMODITY_LOT', shipIndex: 2 },
    );
    expect(thirdShip.fleet[2].equipped).not.toContain('commodity-lot');
  });

  it('UNEQUIP refuses to remove the commodity lot to inventory — SELL_COMMODITY_LOT is the only way out', () => {
    const fleet: PlayerShipState[] = [{ frameId: 'cruiser', equipped: ['commodity-lot'], damage: 0, upgrades: [] }];
    let state: RunState = { ...initialRunState(), phase: 'prep', fleet };
    state = runReducer(state, { type: 'UNEQUIP', shipIndex: 0, partId: 'commodity-lot' as PartId });
    expect(state.fleet[0].equipped).toContain('commodity-lot');
    expect(state.inventory).not.toContain('commodity-lot');
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

describe('BUY_MERCENARY (iteration 20)', () => {
  it('hires an Interceptor flagged mercenary, pre-fitted with an ion cannon, for 12cr', () => {
    let state = stateWithMap('shop', { phase: 'shop', credits: 20 });
    state = runReducer(state, { type: 'BUY_MERCENARY' });
    expect(state.fleet).toHaveLength(2);
    expect(state.fleet[1]).toMatchObject({ frameId: 'interceptor', equipped: ['ion'], mercenary: true });
    expect(state.credits).toBe(8);
  });

  it('does not consume the ship-naming counter — a hire is not a commissioned ship', () => {
    let state = stateWithMap('shop', { phase: 'shop', credits: 20 });
    const before = state.shipsCommissioned;
    state = runReducer(state, { type: 'BUY_MERCENARY' });
    expect(state.shipsCommissioned).toBe(before);
  });

  it('refuses without 12cr or at the fleet cap', () => {
    const poor = stateWithMap('shop', { phase: 'shop', credits: 11 });
    expect(runReducer(poor, { type: 'BUY_MERCENARY' }).fleet).toHaveLength(1);

    const fullFleet: PlayerShipState[] = Array.from({ length: 4 }, () => ({
      frameId: 'interceptor' as const,
      equipped: [],
      damage: 0,
      upgrades: [],
    }));
    const full = stateWithMap('shop', { phase: 'shop', credits: 100, fleet: fullFleet });
    expect(runReducer(full, { type: 'BUY_MERCENARY' }).fleet).toHaveLength(4);
  });

  it('the Merchant hires for 8cr instead of 12, and the fleet cap raise is Admiral-only', () => {
    const merchant = stateWithMap('shop', { phase: 'shop', credits: 8, commanderId: 'merchant' });
    expect(runReducer(merchant, { type: 'BUY_MERCENARY' }).credits).toBe(0);

    const fullFleet: PlayerShipState[] = Array.from({ length: 4 }, () => ({
      frameId: 'interceptor' as const,
      equipped: [],
      damage: 0,
      upgrades: [],
    }));
    // A full-4 fleet still refuses a hire for the Merchant (cap unchanged)...
    const merchantFull = stateWithMap('shop', {
      phase: 'shop',
      credits: 100,
      commanderId: 'merchant',
      fleet: fullFleet,
    });
    expect(runReducer(merchantFull, { type: 'BUY_MERCENARY' }).fleet).toHaveLength(4);
    // ...but the Admiral's raised cap (5) allows a 5th ship, hired or bought.
    const admiralFull = stateWithMap('shop', {
      phase: 'shop',
      credits: 100,
      commanderId: 'admiral',
      fleet: fullFleet,
    });
    expect(runReducer(admiralFull, { type: 'BUY_MERCENARY' }).fleet).toHaveLength(5);
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

  it('WITHDRAW: a mercenary that survived to the retreat still leaves the fleet, not just a destroyed one', () => {
    const state = combatWithMercenary(0, undefined);
    const result = runReducer(state, { type: 'WITHDRAW' });
    expect(result.fleet).toHaveLength(1);
    expect(result.fleet.some((s) => s.mercenary)).toBe(false);
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

  it('the Merchant earns +2 credits per combat won on top of the normal reward', () => {
    const plain = runReducer(winningCombatState(), { type: 'CONTINUE' });
    const merchant = runReducer(winningCombatState({ commanderId: 'merchant' }), { type: 'CONTINUE' });
    expect(merchant.pendingReward!.credits).toBe(plain.pendingReward!.credits + 2);
  });

  it('the Merchant reroll costs 1 credit instead of 2', () => {
    let state: RunState = { ...initialRunState(), phase: 'shop', credits: 1, shopOffers: ['ion'], commanderId: 'merchant' };
    state = runReducer(state, { type: 'REROLL' });
    expect(state.credits).toBe(0); // 1cr reroll affordable at exactly 1 credit
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
    expect(result.fleet[0].damage).toBe(4); // engineer: -1
    expect(result.fleet[1].damage).toBe(3); // engineer -1 + regen -1
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
    expect(result.fleet[0].overRepairBank).toBe(1);
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
  it('PICK_NODE into a shop draws exactly 6 offers: 2 weapon, 2 defense (shield/hull), 1 computer-or-drive, 1 active', () => {
    const state = runReducer(stateWithMap('shop'), { type: 'PICK_NODE', row: 0 });
    const offers = state.shopOffers!.map((id) => getPart(id));
    expect(offers).toHaveLength(6);
    expect(offers.slice(0, 2).every((p) => p.type === 'weapon')).toBe(true);
    expect(offers.slice(2, 4).every((p) => p.type === 'shield' || p.type === 'hull')).toBe(true);
    expect(offers[4].type === 'computer' || offers[4].type === 'drive').toBe(true);
    expect(offers[5].active).toBe(true);
  });

  it('all six offers are always unique, across many redraws (2026-08-02 fix)', () => {
    // The old draw was with-replacement: the doubled weapon/defense strata
    // could duplicate within themselves, and the actives stratum overlaps
    // the typed ones (every active part also has a type), so slot 6 could
    // duplicate slots 1-5 too. Redraw many times via REROLL and assert
    // uniqueness every time; the strata invariants must survive the fix.
    let state = runReducer(stateWithMap('shop', { credits: 1000 }), { type: 'PICK_NODE', row: 0 });
    for (let i = 0; i < 60; i++) {
      const offers = state.shopOffers!;
      expect(new Set(offers).size).toBe(offers.length);
      const parts = offers.map((id) => getPart(id));
      expect(parts.slice(0, 2).every((p) => p.type === 'weapon')).toBe(true);
      expect(parts.slice(2, 4).every((p) => p.type === 'shield' || p.type === 'hull')).toBe(true);
      expect(parts[4].type === 'computer' || parts[4].type === 'drive').toBe(true);
      expect(parts[5].active).toBe(true);
      state = runReducer(state, { type: 'REROLL' });
    }
  });

  it('SELL_PART pays floor(cost/2), removes the part from inventory, and refuses a part not owned', () => {
    let state: RunState = { ...initialRunState(), phase: 'shop', credits: 0, inventory: ['plasma'] }; // plasma costs 5cr
    state = runReducer(state, { type: 'SELL_PART', partId: 'plasma' });
    expect(state.credits).toBe(2); // floor(5/2)
    expect(state.inventory).not.toContain('plasma');

    const again = runReducer(state, { type: 'SELL_PART', partId: 'plasma' });
    expect(again.credits).toBe(2); // refused — no longer owned
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
    "the %s's signature part is present in every shop draw, across many rerolls",
    (commanderId, partId) => {
      let state = runReducer(stateWithMap('shop', { commanderId, credits: 1000 }), { type: 'PICK_NODE', row: 0 });
      for (let i = 0; i < 30; i++) {
        expect(state.shopOffers).toContain(partId);
        state = runReducer(state, { type: 'REROLL' });
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
    let state = runReducer(stateWithMap('shop', { commanderId: 'merchant', credits: 1000 }), {
      type: 'PICK_NODE',
      row: 0,
    });
    // Across many rerolls, a signature part may still appear by ordinary
    // chance — but it is never *guaranteed* the way it is for its owner.
    let everMissing = false;
    for (let i = 0; i < 20; i++) {
      if (Object.values(SIGNATURE).every((partId) => !state.shopOffers!.includes(partId))) everMissing = true;
      state = runReducer(state, { type: 'REROLL' });
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
    expect(result.pendingReward?.credits).toBe(7);
    expect(result.pendingReward?.upgradeOptions).toBeUndefined();
  });

  it('Withdraw is unavailable at the opener (a single node — no line of retreat)', () => {
    const state: RunState = {
      ...initialRunState(),
      phase: 'map',
      position: { col: 0, row: 0 },
      visited: [{ col: 0, row: 0 }],
    };
    expect(hasLineOfRetreat(state)).toBe(false);
  });
});

describe('iteration 8: the interlude', () => {
  function stateAtInterlude(overrides: Partial<RunState> = {}): RunState {
    return { ...initialRunState(), phase: 'interlude', ...overrides };
  }

  it('Refit fully repairs every ship, then moves into act 2', () => {
    const fleet: PlayerShipState[] = [
      { frameId: 'cruiser', equipped: ['hull1'], damage: 3, upgrades: [] },
      { frameId: 'interceptor', equipped: ['ion'], damage: 1, upgrades: [] },
    ];
    const result = runReducer(stateAtInterlude({ fleet }), { type: 'INTERLUDE_CHOOSE', index: 0 });
    expect(result.fleet.every((s) => s.damage === 0)).toBe(true);
    expect(result.phase).toBe('map');
    expect(result.act).toBe(2);
  });

  it('War chest grants +15 credits and nothing else', () => {
    const before = stateAtInterlude({ credits: 10 });
    const result = runReducer(before, { type: 'INTERLUDE_CHOOSE', index: 1 });
    expect(result.credits).toBe(25);
    expect(result.fleet).toEqual(before.fleet);
  });

  it('Field promotion attaches exactly one upgrade to the chosen ship', () => {
    const fleet: PlayerShipState[] = [{ frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] }];
    const result = runReducer(stateAtInterlude({ fleet }), { type: 'INTERLUDE_CHOOSE', index: 2, shipIndex: 0 });
    expect(result.fleet[0].upgrades).toHaveLength(1);
  });

  it('Field promotion replaces an existing upgrade rather than stacking (addendum A.4)', () => {
    // The drawn upgrade is real (uncontrolled) randomness at this call site,
    // so the only assertable invariant here is "never more than 1" — the
    // exact-replacement case is covered deterministically by the PICK_UPGRADE
    // test above, which can force a different draw.
    const fleet: PlayerShipState[] = [{ frameId: 'cruiser', equipped: [], damage: 0, upgrades: ['spine'] }];
    const result = runReducer(stateAtInterlude({ fleet }), { type: 'INTERLUDE_CHOOSE', index: 2, shipIndex: 0 });
    expect(result.fleet[0].upgrades).toHaveLength(1);
  });

  it('refuses INTERLUDE_CHOOSE outside the interlude phase', () => {
    const state = { ...initialRunState(), phase: 'map' as const };
    const result = runReducer(state, { type: 'INTERLUDE_CHOOSE', index: 1 });
    expect(result).toBe(state);
  });

  it('resets position/visited/fled/fog/dossier and lands in act 2 at any act-2 column-0 node', () => {
    const state = stateAtInterlude({
      position: { col: BOSS_COLUMN, row: 0 },
      visited: [{ col: 9, row: 0 }, { col: BOSS_COLUMN, row: 0 }],
      fled: [{ col: 3, row: 1 }],
      visionCol: 9,
      revealedNodes: [{ col: 5, row: 0 }],
      bossRevealed: true,
    });
    const result = runReducer(state, { type: 'INTERLUDE_CHOOSE', index: 1 });
    expect(result.act).toBe(2);
    expect(result.position).toBeNull();
    expect(result.visited).toEqual([]);
    expect(result.fled).toEqual([]);
    expect(result.visionCol).toBe(0);
    expect(result.revealedNodes).toEqual([]);
    expect(result.bossRevealed).toBe(false);

    // Act 2 column 0 is 3 uniform combat nodes — any row is pickable.
    const picked = runReducer(result, { type: 'PICK_NODE', row: 1 });
    expect(picked.phase).toBe('prep');
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

  it('an act-2 column-0 combat win pays 18 credits (winReward(11))', () => {
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
    expect(result.pendingReward?.credits).toBe(18);
    expect(winReward(globalColumn(2, 0))).toBe(18);
  });
});

describe('iteration 8: escalations stack across the act boundary (8.4)', () => {
  it('an act-1 escalation, once landed, stays active anywhere in act 2 (permanent, not act-scoped)', () => {
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
    expect(result.currentEnemy!.appliedEscalations).toContain('hardened');
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

  it('act 2 stacks both: a landed act-1 escalation plus its own, once past its own column', () => {
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
    expect(result.currentEnemy!.appliedEscalations).toEqual(expect.arrayContaining(['hardened', 'deflectors']));
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

// --- Cargo rewards (iteration 15.1) -------------------------------------
describe('cargo reward payouts', () => {
  // A won combat at act-1 col 1 (winReward(1) = 5), with the node's cargo
  // tag forced explicitly rather than left to the random map.
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

  it('wreck field pays winReward(col) - 2 and drops a part into inventory', () => {
    const result = runReducer(wonCargoState('wreck'), { type: 'CONTINUE' });
    expect(result.pendingReward?.credits).toBe(winReward(1) - 2);
    expect(result.inventory).toHaveLength(1);
  });

  it('wreck field floors at 1 credit (unit-level — winReward(col) itself never gets this low)', () => {
    expect(applyCargoReward('wreck', 2)).toBe(1); // 2 - 2 = 0, floored
    expect(applyCargoReward('wreck', 1)).toBe(1); // 1 - 2 = -1, floored
    expect(applyCargoReward('wreck', 10)).toBe(8); // above the floor, unaffected
  });

  it('command ship grants a reaction card on top of the normal reward', () => {
    const result = runReducer(wonCargoState('command', { hand: [] }), { type: 'CONTINUE' });
    expect(result.pendingReward?.credits).toBe(winReward(1));
    expect(result.pendingReward?.cardGained).toBeDefined();
    expect(result.pendingReward?.cardInsteadCredits).toBeUndefined();
    expect(result.hand).toHaveLength(1);
  });

  it('command ship pays +4cr instead of a card when the hand is already full (mirrors the elite fallback)', () => {
    const fullHand = new Array(5).fill('bulkheads') as RunState['hand'];
    const result = runReducer(wonCargoState('command', { hand: fullHand }), { type: 'CONTINUE' });
    expect(result.pendingReward?.credits).toBe(winReward(1) + 4);
    expect(result.pendingReward?.cardGained).toBeUndefined();
    expect(result.pendingReward?.cardInsteadCredits).toBe(4);
  });

  it('an elite kill is never cargo-adjusted, even if its node happens to carry a tag', () => {
    const eliteEnemy = { ...GAUNTLET[0], id: `${GAUNTLET[0].id}-elite` };
    const state = wonCargoState('convoy', { currentEnemy: eliteEnemy });
    const result = runReducer(state, { type: 'CONTINUE' });
    expect(result.pendingReward?.credits).toBe(eliteReward(1)); // not +4
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

  it('withdrawing costs +1 heat', () => {
    // Column 0 forced to 3 combat nodes (stateWithMap) — picking row 0 from
    // the start (position null) leaves rows 1/2 as a line of retreat.
    let state = runReducer(stateWithMap('combat', { heat: 1 }), { type: 'PICK_NODE', row: 0 });
    const combat = initCombat(
      [{ stats: { initiative: 0, hp: 20, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 0 }],
      state.currentEnemy!,
      1,
    );
    state = { ...state, phase: 'combat', combat: { ...combat, round: 1 } };
    expect(hasLineOfRetreat(state)).toBe(true);
    const result = runReducer(state, { type: 'WITHDRAW' });
    expect(result.heat).toBe(2);
  });

  it('the interlude resets heat to 0', () => {
    const state: RunState = { ...initialRunState(), phase: 'interlude', heat: 3 };
    const result = runReducer(state, { type: 'INTERLUDE_CHOOSE', index: 1 });
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

  it('withdrawing from the interception also resets heat to 0', () => {
    // Column 0 forced to 3 shop nodes (stateWithMap) — picking row 0 from
    // the start (position null, heat armed) triggers interception there,
    // and rows 1/2 remain as a line of retreat.
    let state = runReducer(stateWithMap('shop', { heat: MAX_HEAT }), { type: 'PICK_NODE', row: 0 });
    expect(state.interceptionActive).toBe(true);
    const combat = initCombat(
      [{ stats: { initiative: 0, hp: 20, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 0 }],
      state.currentEnemy!,
      1,
    );
    state = { ...state, phase: 'combat', combat: { ...combat, round: 1 } };
    expect(hasLineOfRetreat(state)).toBe(true); // "follows normal retreat rules" even though the node is shop-typed
    const result = runReducer(state, { type: 'WITHDRAW' });
    expect(result.heat).toBe(0);
    expect(result.interceptionActive).toBeUndefined();
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
    state = runReducer(state, { type: 'SETUP_CONFIRM' });
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

  it("names the Admiral's free Interceptor and advances the commission counter", () => {
    let state = initialRunState({ seed: 7 });
    // Force admiral into the choices for a deterministic test.
    state = { ...state, commanderChoices: ['admiral', ...state.commanderChoices.slice(1)] };
    const after = runReducer(state, { type: 'CHOOSE_COMMANDER', commanderId: 'admiral' });
    expect(after.fleet).toHaveLength(2);
    expect(after.fleet[1].name).toBe(shipName(7, 1, 'interceptor'));
    expect(after.shipsCommissioned).toBe(2);
  });

  it('a won fight increments fightsWon, credits kills to ships, and bumps fightsSurvived for survivors', () => {
    const after = playThroughOpener();
    const stats = after.runStats!;
    expect(stats.fightsWon).toBe(1);
    expect(stats.fightsWithdrawn).toBe(0);
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
