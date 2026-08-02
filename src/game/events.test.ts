import { describe, expect, it } from 'vitest';
import { actColumns, generateMap } from './map';
import { mulberry32 } from './rng';
import type { RngFn } from './rng';
import { meetsRequirement, nextUnrevealedIndex, resolveEventChoice } from './events';
import type { RunState } from './types';

function fixedRng(values: number[]): RngFn {
  let i = 0;
  return () => {
    if (i >= values.length) throw new Error(`fixedRng exhausted after ${values.length} values`);
    return values[i++];
  };
}

function baseState(overrides: Partial<RunState> = {}): RunState {
  return {
    phase: 'event',
    map: generateMap(1, mulberry32(1)),
    act: 1,
    rngCounter: 0,
    targetingStance: 'weakest',
    position: { col: 1, row: 0 },
    visited: [],
    fled: [],
    credits: 10,
    inventory: [],
    fleet: [{ frameId: 'cruiser', equipped: ['ion', 'comp1', 'hull1'], damage: 0, upgrades: [] }],
    hand: [],
    escalations: [
      { id: 'hardened', act: 1, landsAfterColumn: 2, revealed: false },
      { id: 'deflectors', act: 1, landsAfterColumn: 5, revealed: false },
    ],
    bossRevealed: false,
    visionCol: 0,
    revealedNodes: [],
    commanderChoices: [],
    heat: 0,
    ...overrides,
  };
}

// --- 14.1 framework: the requirement predicate library --------------------

describe('meetsRequirement — predicate library', () => {
  it('partEquipped: true only when some ship carries the part', () => {
    const req = { kind: 'partEquipped', partId: 'cloak' } as const;
    expect(meetsRequirement(req, baseState())).toBe(false);
    const withCloak = baseState({
      fleet: [{ frameId: 'cruiser', equipped: ['cloak'], damage: 0, upgrades: [] }],
    });
    expect(meetsRequirement(req, withCloak)).toBe(true);
  });

  it('everyShipInitiativeAtLeast: false if any ship falls short', () => {
    const req = { kind: 'everyShipInitiativeAtLeast', value: 2 } as const;
    const mixed = baseState({
      fleet: [
        { frameId: 'cruiser', equipped: ['init1'], damage: 0, upgrades: [] }, // initiative 1
        { frameId: 'cruiser', equipped: ['init3'], damage: 0, upgrades: [] }, // initiative 3
      ],
    });
    expect(meetsRequirement(req, mixed)).toBe(false);
    const allMeet = baseState({
      fleet: [
        { frameId: 'cruiser', equipped: ['init1', 'init1'], damage: 0, upgrades: [] }, // initiative 2
        { frameId: 'cruiser', equipped: ['init3'], damage: 0, upgrades: [] },
      ],
    });
    expect(meetsRequirement(req, allMeet)).toBe(true);
  });

  it('anyShipComputerAtLeast: true if at least one ship clears the bar', () => {
    const req = { kind: 'anyShipComputerAtLeast', value: 3 } as const;
    const none = baseState({
      fleet: [{ frameId: 'cruiser', equipped: ['comp1'], damage: 0, upgrades: [] }],
    });
    expect(meetsRequirement(req, none)).toBe(false);
    const oneQualifies = baseState({
      fleet: [
        { frameId: 'cruiser', equipped: ['comp1'], damage: 0, upgrades: [] },
        { frameId: 'cruiser', equipped: ['comp3'], damage: 0, upgrades: [] },
      ],
    });
    expect(meetsRequirement(req, oneQualifies)).toBe(true);
  });

  it('framePresent: checks fleet frame ids', () => {
    const req = { kind: 'framePresent', frameId: 'bastion' } as const;
    expect(meetsRequirement(req, baseState())).toBe(false);
    const withBastion = baseState({
      fleet: [{ frameId: 'bastion', equipped: [], damage: 0, upgrades: [] }],
    });
    expect(meetsRequirement(req, withBastion)).toBe(true);
  });

  it('handAtLeast / handBelowMax', () => {
    expect(meetsRequirement({ kind: 'handAtLeast', value: 1 }, baseState({ hand: [] }))).toBe(false);
    expect(meetsRequirement({ kind: 'handAtLeast', value: 1 }, baseState({ hand: ['bulkheads'] }))).toBe(true);
    const full = ['bulkheads', 'volley', 'bulkheads', 'volley', 'bulkheads'] as const;
    expect(meetsRequirement({ kind: 'handBelowMax' }, baseState({ hand: [...full] }))).toBe(false);
    expect(meetsRequirement({ kind: 'handBelowMax' }, baseState({ hand: [] }))).toBe(true);
  });

  it('creditsAtLeast', () => {
    expect(meetsRequirement({ kind: 'creditsAtLeast', value: 6 }, baseState({ credits: 5 }))).toBe(false);
    expect(meetsRequirement({ kind: 'creditsAtLeast', value: 6 }, baseState({ credits: 6 }))).toBe(true);
  });
});

// --- 14.2 content: one resolution test per option, per event table row ----

describe('resolveEventChoice — derelict-cruiser', () => {
  it('option 0: salvage always grants 4 credits', () => {
    const { state } = resolveEventChoice('derelict-cruiser', 0, baseState(), fixedRng([]));
    expect(state.credits).toBe(14);
  });

  it('option 1: below 0.5 grants a part to the chosen ship\'s owner (fleet-wide reward)', () => {
    const { state } = resolveEventChoice('derelict-cruiser', 1, baseState(), fixedRng([0.1, 0.1]), { shipIndex: 0 });
    expect(state.inventory).toHaveLength(1);
  });

  it('option 1: at/above 0.5 damages only the chosen ship, capped at hp - 1', () => {
    const state0 = baseState({
      fleet: [
        { frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] }, // hp 3
        { frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] },
      ],
    });
    const { state } = resolveEventChoice('derelict-cruiser', 1, state0, fixedRng([0.9]), { shipIndex: 1 });
    expect(state.fleet[0].damage).toBe(0); // untouched — cost is chosen, not random
    expect(state.fleet[1].damage).toBeGreaterThan(0);
    expect(state.fleet[1].damage).toBeLessThanOrEqual(2); // hp - 1
  });

  it('option 2 (Damage control bay): a part and 2 credits, no risk, no rng for the outcome itself', () => {
    const { state } = resolveEventChoice('derelict-cruiser', 2, baseState(), fixedRng([0.1]));
    expect(state.credits).toBe(12);
    expect(state.inventory).toHaveLength(1);
  });
});

describe('resolveEventChoice — asteroid-field', () => {
  it('option 0: detour costs 2 credits and clamps at 0', () => {
    const { state: normal } = resolveEventChoice('asteroid-field', 0, baseState({ credits: 1 }), fixedRng([]));
    expect(normal.credits).toBe(0);
    const { state: fromZero } = resolveEventChoice('asteroid-field', 0, baseState({ credits: 0 }), fixedRng([]));
    expect(fromZero.credits).toBe(0);
  });

  it('option 1: below 0.5 grants 5 credits, at/above damages only the chosen ship', () => {
    const good = resolveEventChoice('asteroid-field', 1, baseState(), fixedRng([0.1]), { shipIndex: 0 });
    expect(good.state.credits).toBe(15);

    const state0 = baseState({
      fleet: [
        { frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] },
        { frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] },
      ],
    });
    const bad = resolveEventChoice('asteroid-field', 1, state0, fixedRng([0.9]), { shipIndex: 1 });
    expect(bad.state.fleet[0].damage).toBe(0);
    expect(bad.state.fleet[1].damage).toBeGreaterThan(0);
  });

  it('option 2 (full burn): +5 credits, deterministic — no rng draw', () => {
    const { state } = resolveEventChoice('asteroid-field', 2, baseState(), fixedRng([]));
    expect(state.credits).toBe(15);
  });
});

describe('resolveEventChoice — ancient-cache', () => {
  it('option 0: leaving it changes nothing and sets no ambush', () => {
    const s0 = baseState();
    const { state, ambushEnemy } = resolveEventChoice('ancient-cache', 0, s0, fixedRng([]));
    expect(state).toEqual(s0);
    expect(ambushEnemy).toBeUndefined();
  });

  it('option 1: force it open grants a part and sets an ambush enemy (no direct damage)', () => {
    const s0 = baseState({ fleet: [{ frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] }] });
    const { state, ambushEnemy } = resolveEventChoice('ancient-cache', 1, s0, fixedRng([0.1]));
    expect(state.inventory).toHaveLength(1);
    expect(state.fleet[0].damage).toBe(0);
    expect(ambushEnemy).toBeDefined();
  });

  it('option 1: the ambush enemy scales with the current column', () => {
    const early = resolveEventChoice('ancient-cache', 1, baseState({ position: { col: 1, row: 0 } }), fixedRng([0]));
    const late = resolveEventChoice('ancient-cache', 1, baseState({ position: { col: 7, row: 0 } }), fixedRng([0]));
    expect(early.ambushEnemy?.id).not.toBe(late.ambushEnemy?.id);
  });

  it('option 2 (Cloaking field): same part, no ambush', () => {
    const { state, ambushEnemy } = resolveEventChoice('ancient-cache', 2, baseState(), fixedRng([0.1]));
    expect(state.inventory).toHaveLength(1);
    expect(ambushEnemy).toBeUndefined();
  });
});

describe('resolveEventChoice — abandoned-arsenal', () => {
  it('option 0: sells the scrap for 3 credits', () => {
    const { state } = resolveEventChoice('abandoned-arsenal', 0, baseState({ credits: 0 }), fixedRng([]));
    expect(state.credits).toBe(3);
  });

  it('option 1: grants a random reaction card', () => {
    const { state } = resolveEventChoice('abandoned-arsenal', 1, baseState({ hand: [] }), fixedRng([0.1]));
    expect(state.hand).toHaveLength(1);
  });

  it('option 2 (Restock): the chosen card leaves the hand, a new one replaces it', () => {
    const s0 = baseState({ hand: ['bulkheads', 'volley'] });
    const { state } = resolveEventChoice('abandoned-arsenal', 2, s0, fixedRng([0.9]), { cardId: 'bulkheads' });
    expect(state.hand).toHaveLength(2);
    expect(state.hand.filter((c) => c === 'bulkheads')).toHaveLength(0);
  });
});

describe('resolveEventChoice — intercepted-signal', () => {
  it('option 0: selling the codes changes nothing about escalations', () => {
    const s0 = baseState();
    const { state } = resolveEventChoice('intercepted-signal', 0, s0, fixedRng([]));
    expect(state.credits).toBe(15);
    expect(state.escalations.every((e) => !e.revealed)).toBe(true);
  });

  it('option 1: reveals the earliest unrevealed escalation', () => {
    const s0 = baseState();
    const { state } = resolveEventChoice('intercepted-signal', 1, s0, fixedRng([]));
    expect(state.escalations[0].revealed).toBe(true);
    expect(state.escalations[1].revealed).toBe(false);
  });

  it('option 1: is a no-op (but does not crash) when everything is already revealed', () => {
    const s0 = baseState({
      escalations: [
        { id: 'hardened', act: 1, landsAfterColumn: 2, revealed: true },
        { id: 'deflectors', act: 1, landsAfterColumn: 5, revealed: true },
      ],
    });
    const { state } = resolveEventChoice('intercepted-signal', 1, s0, fixedRng([]));
    expect(state.escalations.every((e) => e.revealed)).toBe(true);
  });

  it('option 2 (deep-decrypt): reveals both remaining escalations', () => {
    const { state } = resolveEventChoice('intercepted-signal', 2, baseState(), fixedRng([]));
    expect(state.escalations.every((e) => e.revealed)).toBe(true);
  });

  it('option 2: reveals only what remains when one is already known', () => {
    const s0 = baseState({
      escalations: [
        { id: 'hardened', act: 1, landsAfterColumn: 2, revealed: true },
        { id: 'deflectors', act: 1, landsAfterColumn: 5, revealed: false },
      ],
    });
    const { state, outcomeText } = resolveEventChoice('intercepted-signal', 2, s0, fixedRng([]));
    expect(state.escalations.every((e) => e.revealed)).toBe(true);
    expect(outcomeText).toContain('Nothing further remains');
  });
});

describe('resolveEventChoice — recon-probe', () => {
  it('option 0: stripping it for parts grants 4 credits', () => {
    const { state } = resolveEventChoice('recon-probe', 0, baseState(), fixedRng([]));
    expect(state.credits).toBe(14);
  });

  it('option 1: reveals the next column\'s node types and reports its enemy pool', () => {
    const s0 = baseState({ position: { col: 1, row: 0 } });
    const { state, outcomeText } = resolveEventChoice('recon-probe', 1, s0, fixedRng([]));
    const expectedPositions = actColumns(s0.map, s0.act)[2];
    for (const node of expectedPositions) {
      expect(state.revealedNodes).toContainEqual({ col: node.col, row: node.row });
    }
    expect(outcomeText.length).toBeGreaterThan(0);
  });

  it('option 2 (Interceptor): reveals node types for the next two columns', () => {
    const s0 = baseState({ position: { col: 1, row: 0 } });
    const { state } = resolveEventChoice('recon-probe', 2, s0, fixedRng([]));
    const col2Positions = actColumns(s0.map, s0.act)[2];
    const col3Positions = actColumns(s0.map, s0.act)[3];
    for (const node of [...col2Positions, ...col3Positions]) {
      expect(state.revealedNodes).toContainEqual({ col: node.col, row: node.row });
    }
  });
});

describe('resolveEventChoice — sabotage-raid (Shipyard raid)', () => {
  it('option 0: declining grants 3 credits and touches nothing else', () => {
    const s0 = baseState();
    const { state } = resolveEventChoice('sabotage-raid', 0, s0, fixedRng([]));
    expect(state.credits).toBe(13);
    expect(state.escalations).toHaveLength(2);
  });

  it('option 1: cancels the earliest unrevealed escalation and damages only the chosen ship', () => {
    const s0 = baseState({
      fleet: [
        { frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] },
        { frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] },
      ],
    });
    const { state } = resolveEventChoice('sabotage-raid', 1, s0, fixedRng([]), { shipIndex: 1 });
    expect(state.escalations).toHaveLength(1);
    expect(state.escalations[0].id).toBe('deflectors');
    expect(state.fleet[0].damage).toBe(0);
    expect(state.fleet[1].damage).toBeGreaterThan(0);
  });

  it('option 2 (Bastion breaches): cancels the escalation with no damage at all', () => {
    const { state } = resolveEventChoice('sabotage-raid', 2, baseState(), fixedRng([]));
    expect(state.escalations).toHaveLength(1);
    expect(state.fleet.every((s) => s.damage === 0)).toBe(true);
  });
});

describe('resolveEventChoice — defector', () => {
  it('option 0: turning them in grants 6 credits and sets no pending chain', () => {
    const { state } = resolveEventChoice('defector', 0, baseState(), fixedRng([]));
    expect(state.credits).toBe(16);
    expect(state.pendingEventId).toBeUndefined();
  });

  it('option 1: reveals every remaining escalation and schedules the pursuit', () => {
    const { state } = resolveEventChoice('defector', 1, baseState(), fixedRng([]));
    expect(state.escalations.every((e) => e.revealed)).toBe(true);
    expect(state.pendingEventId).toBe('defector-pursuit');
  });
});

describe('resolveEventChoice — defector-pursuit', () => {
  it('option 0: stand and fight sets an ambush and an 8-credit win bonus', () => {
    const { ambushEnemy, ambushBonus } = resolveEventChoice('defector-pursuit', 0, baseState(), fixedRng([0.1]));
    expect(ambushEnemy).toBeDefined();
    expect(ambushBonus).toEqual({ credits: 8 });
  });

  it('option 1 (Cloaking field): slips away clean, no ambush, no cost', () => {
    const s0 = baseState();
    const { state, ambushEnemy } = resolveEventChoice('defector-pursuit', 1, s0, fixedRng([]));
    expect(ambushEnemy).toBeUndefined();
    expect(state.credits).toBe(s0.credits);
  });

  it('option 2: paying them off costs 6 credits, clamped at 0', () => {
    const { state } = resolveEventChoice('defector-pursuit', 2, baseState({ credits: 6 }), fixedRng([]));
    expect(state.credits).toBe(0);
    const { state: clamped } = resolveEventChoice('defector-pursuit', 2, baseState({ credits: 2 }), fixedRng([]));
    expect(clamped.credits).toBe(0);
  });
});

describe('resolveEventChoice — distress-beacon', () => {
  it('option 0: ignoring it changes nothing', () => {
    const s0 = baseState();
    const { state, ambushEnemy } = resolveEventChoice('distress-beacon', 0, s0, fixedRng([]));
    expect(state).toEqual(s0);
    expect(ambushEnemy).toBeUndefined();
  });

  it('option 1: driving the raiders off sets an easy-pool ambush and a 6-credit-plus-part win bonus', () => {
    const { ambushEnemy, ambushBonus } = resolveEventChoice('distress-beacon', 1, baseState(), fixedRng([0.1, 0.1]));
    expect(ambushEnemy).toBeDefined();
    expect(ambushBonus?.credits).toBe(6);
    expect(ambushBonus?.partId).toBeDefined();
  });

  it('option 2 (Lure beacon): no fight, +4 credits gratitude', () => {
    const { state, ambushEnemy } = resolveEventChoice('distress-beacon', 2, baseState(), fixedRng([]));
    expect(ambushEnemy).toBeUndefined();
    expect(state.credits).toBe(14);
  });
});

describe('resolveEventChoice — repair-tender', () => {
  it('option 0: moving on changes nothing', () => {
    const s0 = baseState();
    const { state } = resolveEventChoice('repair-tender', 0, s0, fixedRng([]));
    expect(state).toEqual(s0);
  });

  it('option 1: pays 4 credits (clamped) and repairs 3 damage on only the chosen ship', () => {
    const s0 = baseState({
      credits: 4,
      fleet: [
        { frameId: 'cruiser', equipped: [], damage: 2, upgrades: [] },
        { frameId: 'cruiser', equipped: ['hull2'], damage: 5, upgrades: [] },
      ],
    });
    const { state } = resolveEventChoice('repair-tender', 1, s0, fixedRng([]), { shipIndex: 1 });
    expect(state.credits).toBe(0);
    expect(state.fleet[0].damage).toBe(2); // untouched
    expect(state.fleet[1].damage).toBe(2); // 5 - 3
  });

  it('option 2 (Damage control bay): the same repair, free', () => {
    const s0 = baseState({
      fleet: [{ frameId: 'cruiser', equipped: ['dcbay'], damage: 4, upgrades: [] }],
    });
    const { state } = resolveEventChoice('repair-tender', 2, s0, fixedRng([]), { shipIndex: 0 });
    expect(state.credits).toBe(s0.credits);
    expect(state.fleet[0].damage).toBe(1);
  });

  it('repair never drops damage below 0', () => {
    const s0 = baseState({ fleet: [{ frameId: 'cruiser', equipped: [], damage: 1, upgrades: [] }] });
    const { state } = resolveEventChoice('repair-tender', 2, s0, fixedRng([]), { shipIndex: 0 });
    expect(state.fleet[0].damage).toBe(0);
  });
});

describe('resolveEventChoice — militia-requisition', () => {
  it('option 0: refusing changes nothing', () => {
    const s0 = baseState();
    const { state } = resolveEventChoice('militia-requisition', 0, s0, fixedRng([]));
    expect(state).toEqual(s0);
  });

  it('option 1: the chosen card leaves the hand and grants 7 credits', () => {
    const s0 = baseState({ hand: ['bulkheads', 'volley'] });
    const { state } = resolveEventChoice('militia-requisition', 1, s0, fixedRng([]), { cardId: 'bulkheads' });
    expect(state.hand).toEqual(['volley']);
    expect(state.credits).toBe(17);
  });
});

// --- shared helper sanity ---------------------------------------------

describe('nextUnrevealedIndex', () => {
  it('picks the escalation landing soonest by global column', () => {
    const s0 = baseState();
    expect(nextUnrevealedIndex(s0)).toBe(0); // 'hardened' lands after column 2, before 'deflectors' at 5
  });

  it('returns -1 once everything is revealed', () => {
    const s0 = baseState({
      escalations: [
        { id: 'hardened', act: 1, landsAfterColumn: 2, revealed: true },
        { id: 'deflectors', act: 1, landsAfterColumn: 5, revealed: true },
      ],
    });
    expect(nextUnrevealedIndex(s0)).toBe(-1);
  });
});
