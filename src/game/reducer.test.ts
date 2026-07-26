import { describe, expect, it } from 'vitest';
import { initCombat, runToEnd } from './combatEngine';
import { GAUNTLET, OPENER } from './enemies';
import { BOSS_COLUMN } from './map';
import type { GameMap, NodeType } from './map';
import { getPart } from './parts';
import { globalColumn, hasLineOfRetreat, initialRunState, runReducer, SHOP_OFFER_COUNT, winReward } from './reducer';
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

function forceNodeType(map: GameMap, col: number, row: number, type: NodeType, act: 1 | 2 = 1): GameMap {
  const key = act === 1 ? 'act1Columns' : 'act2Columns';
  return {
    ...map,
    [key]: map[key].map((c, i) => (i === col ? c.map((n) => (n.row === row ? { ...n, type } : n)) : c)),
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

  it('the Warlord starts with a free, ion-fitted Interceptor — fleet begins at 2', () => {
    let state = initialRunState();
    state = { ...state, commanderChoices: ['warlord', 'merchant', 'engineer'] };
    const result = runReducer(state, { type: 'CHOOSE_COMMANDER', commanderId: 'warlord' });
    expect(result.fleet).toHaveLength(2);
    expect(result.fleet[1].frameId).toBe('interceptor');
    expect(result.fleet[1].equipped).toEqual(['ion']);
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

  it('map -> repair applies a full heal immediately, and LEAVE_REPAIR returns to map', () => {
    const damaged: PlayerShipState[] = [{ frameId: 'cruiser', equipped: [], damage: 2, upgrades: [] }];
    let state = runReducer(stateWithMap('repair', { fleet: damaged }), { type: 'PICK_NODE', row: 0 });
    expect(state.phase).toBe('repair');
    expect(state.fleet[0].damage).toBe(0);
    expect(state.repairSummary).toContain('Repaired');

    state = runReducer(state, { type: 'LEAVE_REPAIR' });
    expect(state.phase).toBe('map');
  });

  it('map -> event, and EVENT_CONTINUE returns to map', () => {
    let state = runReducer(stateWithMap('event'), { type: 'PICK_NODE', row: 0 });
    expect(state.phase).toBe('event');
    expect(state.currentEvent).toBeDefined();

    state = runReducer(state, { type: 'EVENT_CHOOSE', choiceIndex: 1 });
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
    expect(result.credits).toBe(18); // eliteReward(globalColumn(1, 10)) = 8 + 10
    expect(result.intel).toBe(3); // WIN_INTEL + ELITE_BONUS_INTEL, no upgrade pick
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
    // base reward (winReward(0) = 4) + 2x salvage (3 each) = 10
    expect(result.credits - before).toBe(4 + 6);
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
    state = runReducer(state, { type: 'EVENT_CHOOSE', choiceIndex: 0 });
    expect(state.currentEvent?.ambushEnemy).toBeDefined();

    const result = runReducer(state, { type: 'EVENT_CONTINUE' });
    expect(result.phase).toBe('prep');
    expect(result.currentEnemy).toEqual(state.currentEvent!.ambushEnemy);
    expect(result.currentEvent).toBeUndefined();
  });

  it('declining sets no ambush and EVENT_CONTINUE goes straight to the map', () => {
    let state = stateWithMap('event', { phase: 'event', currentEvent: { eventId: 'ancient-cache' } });
    state = runReducer(state, { type: 'EVENT_CHOOSE', choiceIndex: 1 });
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
    const state: RunState = {
      ...stateWithMap('event'),
      phase: 'combat',
      position: { col: 1, row: 0 }, // the event node's own column
      fleet: [{ frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] }],
      currentEnemy: enemy, // not elite/boss
      combat: wonCombat,
    };
    const result = runReducer(state, { type: 'CONTINUE' });
    expect(result.phase).toBe('reward');
    expect(result.pendingReward?.credits).toBe(4 + 1); // winReward(1)
    expect(result.pendingReward?.upgradeOptions).toBeUndefined();
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

  it('BUY_DOSSIER flips bossRevealed and charges intel (iteration 7: priced in intel, not credits); refuses if already revealed or unaffordable', () => {
    let state: RunState = { ...initialRunState(), phase: 'shop', intel: 3, bossRevealed: false };
    expect(runReducer({ ...state, intel: 2 }, { type: 'BUY_DOSSIER' }).bossRevealed).toBe(false); // too poor

    state = runReducer(state, { type: 'BUY_DOSSIER' });
    expect(state.bossRevealed).toBe(true);
    expect(state.intel).toBe(0);

    const again = runReducer({ ...state, intel: 3 }, { type: 'BUY_DOSSIER' });
    expect(again.intel).toBe(3); // refused — already revealed, intel untouched
  });

  it('BUY_DOSSIER is not affected by REROLL (it is not part of shopOffers)', () => {
    let state: RunState = { ...initialRunState(), phase: 'shop', credits: 20, intel: 3, shopOffers: ['ion'] };
    state = runReducer(state, { type: 'REROLL' });
    expect(state.bossRevealed).toBe(false);
    state = runReducer(state, { type: 'BUY_DOSSIER' });
    expect(state.bossRevealed).toBe(true);
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

  it('BUY_SECTOR_SCAN extends visionCol by 2, costs intel (iteration 7), and is refused a second time this visit', () => {
    let state: RunState = { ...initialRunState(), phase: 'shop', intel: 5, shopIntel: { sectorScan: false, deepScan: false, escalationIntercept: false }, visionCol: 1 };
    state = runReducer(state, { type: 'BUY_SECTOR_SCAN' });
    expect(state.visionCol).toBe(3);
    expect(state.intel).toBe(4); // base cost 1
    expect(state.shopIntel?.sectorScan).toBe(true);

    const again = runReducer(state, { type: 'BUY_SECTOR_SCAN' });
    expect(again.visionCol).toBe(3); // refused — already used this visit
    expect(again.intel).toBe(4);
  });

  it('BUY_DEEP_SCAN reveals every node in the chosen lane through column 9, once per visit', () => {
    let state: RunState = { ...initialRunState(), phase: 'shop', intel: 5, shopIntel: { sectorScan: false, deepScan: false, escalationIntercept: false } };
    state = runReducer(state, { type: 'BUY_DEEP_SCAN', row: 1 });
    expect(state.intel).toBe(3); // base cost 2
    // Columns 1-9 (9 nodes) — act-1 column 0 is the single-node opener, so
    // it has no row-1 node to reveal.
    expect(state.revealedNodes).toHaveLength(9);
    expect(state.revealedNodes.every((n) => n.row === 1)).toBe(true);
    expect(state.shopIntel?.deepScan).toBe(true);

    const again = runReducer(state, { type: 'BUY_DEEP_SCAN', row: 0 });
    expect(again.intel).toBe(3); // refused — already used this visit
    expect(again.revealedNodes).toHaveLength(9);
  });

  it('BUY_ESCALATION_INTERCEPT reveals the soonest-landing unrevealed escalation, once per visit', () => {
    let state: RunState = {
      ...initialRunState(),
      phase: 'shop',
      intel: 5,
      shopIntel: { sectorScan: false, deepScan: false, escalationIntercept: false },
      escalations: [
        { id: 'hardened', act: 1, landsAfterColumn: 4, revealed: false },
        { id: 'deflectors', act: 1, landsAfterColumn: 2, revealed: false },
      ],
    };
    state = runReducer(state, { type: 'BUY_ESCALATION_INTERCEPT' });
    expect(state.intel).toBe(3); // base cost 2
    expect(state.escalations.find((e) => e.id === 'deflectors')!.revealed).toBe(true); // soonest first
    expect(state.escalations.find((e) => e.id === 'hardened')!.revealed).toBe(false);

    const again = runReducer(state, { type: 'BUY_ESCALATION_INTERCEPT' });
    expect(again.intel).toBe(3); // refused — already used this visit
  });

  it('LEAVE_SHOP resets shopIntel so a new visit can buy each item again', () => {
    let state: RunState = { ...initialRunState(), phase: 'shop', credits: 20, shopIntel: { sectorScan: true, deepScan: true, escalationIntercept: true } };
    state = runReducer(state, { type: 'LEAVE_SHOP' });
    expect(state.shopIntel).toBeUndefined();
  });

  it('the boss dossier stays disabled across visits even though the other Intel items reset (5.5 behavior preserved)', () => {
    let state: RunState = { ...initialRunState(), phase: 'shop', intel: 5, bossRevealed: true, shopIntel: { sectorScan: false, deepScan: false, escalationIntercept: false } };
    state = runReducer(state, { type: 'BUY_DOSSIER' });
    expect(state.intel).toBe(5); // refused — already revealed
    expect(state.bossRevealed).toBe(true);
  });

  it('REROLL does not touch shopIntel or visionCol/revealedNodes', () => {
    let state: RunState = { ...initialRunState(), phase: 'shop', credits: 20, shopOffers: ['ion'], shopIntel: { sectorScan: false, deepScan: false, escalationIntercept: false } };
    state = runReducer(state, { type: 'REROLL' });
    expect(state.shopIntel).toEqual({ sectorScan: false, deepScan: false, escalationIntercept: false });
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

  it('recon completion grants +2 vision, the soonest unrevealed escalation, and +3 intel, then clears the quest', () => {
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
    const visionAfterCol1 = state.visionCol;
    state = runReducer(state, { type: 'PICK_NODE', row: 1 }); // -> col2, the target
    expect(state.activeQuest).toBeUndefined();
    expect(state.visionCol).toBe(visionAfterCol1 + 1 + 2); // normal +1 arrival, plus the +2 quest bundle
    expect(state.intel).toBe(3);
    expect(state.escalations.find((e) => e.id === 'deflectors')!.revealed).toBe(true);
    expect(state.escalations.find((e) => e.id === 'hardened')!.revealed).toBe(false);
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

  it('the Spymaster gains 2 columns of vision per pick instead of 1', () => {
    let state = runReducer({ ...stateWithMap('combat'), commanderId: 'spymaster' }, { type: 'PICK_NODE', row: 0 });
    expect(state.visionCol).toBe(2); // col 0 + 2, not col 0 + 1
  });

  it('the Spymaster earns double intel income per combat win (iteration 7 rework — no longer a price discount)', () => {
    const plain = runReducer(winningCombatState(), { type: 'CONTINUE' });
    const spymaster = runReducer(winningCombatState({ commanderId: 'spymaster' }), { type: 'CONTINUE' });
    expect(spymaster.pendingReward!.intelGained).toBe(plain.pendingReward!.intelGained * 2);
  });

  it('the Spymaster still pays the normal (non-discounted) intel price for broker items', () => {
    let state: RunState = {
      ...initialRunState(),
      phase: 'shop',
      intel: 5,
      commanderId: 'spymaster',
      shopIntel: { sectorScan: false, deepScan: false, escalationIntercept: false },
    };
    state = runReducer(state, { type: 'BUY_SECTOR_SCAN' }); // base cost 1, unchanged for Spymaster
    expect(state.intel).toBe(4);
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

  it('a normal combat win earns +1 intel ("flight recorders salvaged")', () => {
    const result = runReducer(winningCombatState({ intel: 0 }), { type: 'CONTINUE' });
    expect(result.pendingReward!.intelGained).toBe(1);
    expect(result.intel).toBe(1);
  });

  it('an elite win earns +3 intel total (base 1 + 2 elite bonus)', () => {
    const eliteEnemy = { ...GAUNTLET[0], id: `${GAUNTLET[0].id}-elite` };
    const result = runReducer(winningCombatState({ intel: 0, currentEnemy: eliteEnemy }), { type: 'CONTINUE' });
    expect(result.pendingReward!.intelGained).toBe(3);
    expect(result.intel).toBe(3);
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

  it('pays 4 credits and 1 intel, like any other column-0 combat win, with no upgrade pick', () => {
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
    expect(result.pendingReward?.credits).toBe(4);
    expect(result.pendingReward?.intelGained).toBe(1);
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

  it('an act-2 column-0 combat win pays 15 credits (winReward(11))', () => {
    const fleet: PlayerShipState[] = [{ frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] }];
    const combat = initCombat(
      [{ stats: { initiative: 0, hp: 5, computer: 0, shield: 0, cannons: [], missiles: [] }, initialDamage: 0 }],
      GAUNTLET[0],
      1,
    );
    const state: RunState = {
      ...initialRunState(),
      phase: 'combat',
      act: 2,
      position: { col: 0, row: 0 },
      fleet,
      currentEnemy: GAUNTLET[0],
      combat: { ...combat, winner: 'player' as const },
    };
    const result = runReducer(state, { type: 'CONTINUE' });
    expect(result.pendingReward?.credits).toBe(15);
    expect(winReward(globalColumn(2, 0))).toBe(15);
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
