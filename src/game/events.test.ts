import { describe, expect, it } from 'vitest';
import { generateMap } from './map';
import { mulberry32 } from './rng';
import type { RngFn } from './rng';
import { resolveEventChoice } from './events';
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
    intel: 0,
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
    ...overrides,
  };
}

describe('resolveEventChoice — derelict-cruiser', () => {
  it('choice A always grants 4 credits', () => {
    const { state } = resolveEventChoice('derelict-cruiser', 0, baseState(), fixedRng([]));
    expect(state.credits).toBe(14);
  });

  it('choice B: below 0.5 grants a part', () => {
    const { state } = resolveEventChoice('derelict-cruiser', 1, baseState(), fixedRng([0.1, 0.1]));
    expect(state.inventory).toHaveLength(1);
  });

  it('choice B: at/above 0.5 damages a random ship, capped at hp - 1', () => {
    const state0 = baseState({
      fleet: [{ frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] }], // hp 3 (cruiser base)
    });
    const { state } = resolveEventChoice('derelict-cruiser', 1, state0, fixedRng([0.9, 0]));
    expect(state.fleet[0].damage).toBeLessThanOrEqual(2); // hp - 1
    expect(state.fleet[0].damage).toBeGreaterThan(0);
  });
});

describe('resolveEventChoice — asteroid-field', () => {
  it('detour costs 2 credits and clamps at 0', () => {
    const { state } = resolveEventChoice('asteroid-field', 1, baseState({ credits: 1 }), fixedRng([]));
    expect(state.credits).toBe(0);
  });

  it('detour from 0 credits stays at 0 (never negative)', () => {
    const { state } = resolveEventChoice('asteroid-field', 1, baseState({ credits: 0 }), fixedRng([]));
    expect(state.credits).toBe(0);
  });
});

describe('resolveEventChoice — ancient-cache', () => {
  it('force it open grants a part and sets an ambush enemy (no direct damage)', () => {
    const s0 = baseState({ fleet: [{ frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] }] });
    const { state, ambushEnemy } = resolveEventChoice('ancient-cache', 0, s0, fixedRng([0.1]));
    expect(state.inventory).toHaveLength(1);
    expect(state.fleet[0].damage).toBe(0); // the item itself carries no damage
    expect(ambushEnemy).toBeDefined();
  });

  it('the ambush enemy scales with the current column', () => {
    const early = resolveEventChoice('ancient-cache', 0, baseState({ position: { col: 1, row: 0 } }), fixedRng([0]));
    const late = resolveEventChoice('ancient-cache', 0, baseState({ position: { col: 7, row: 0 } }), fixedRng([0]));
    expect(early.ambushEnemy?.id).not.toBe(late.ambushEnemy?.id);
  });

  it('leaving it changes nothing and sets no ambush', () => {
    const s0 = baseState();
    const { state, ambushEnemy } = resolveEventChoice('ancient-cache', 1, s0, fixedRng([]));
    expect(state).toEqual(s0);
    expect(ambushEnemy).toBeUndefined();
  });
});

describe('resolveEventChoice — abandoned-arsenal', () => {
  it('grants a reaction card when the hand has room', () => {
    const { state } = resolveEventChoice('abandoned-arsenal', 0, baseState({ hand: [] }), fixedRng([0.1]));
    expect(state.hand).toHaveLength(1);
  });

  it('refuses when the hand is already full', () => {
    const fullHand = ['bulkheads', 'volley', 'bulkheads', 'volley', 'bulkheads'] as const;
    const s0 = baseState({ hand: [...fullHand] });
    const { state } = resolveEventChoice('abandoned-arsenal', 0, s0, fixedRng([]));
    expect(state.hand).toHaveLength(5);
  });

  it('selling the scrap grants 3 credits', () => {
    const { state } = resolveEventChoice('abandoned-arsenal', 1, baseState({ credits: 0 }), fixedRng([]));
    expect(state.credits).toBe(3);
  });
});

describe('resolveEventChoice — intercepted-signal', () => {
  it('reveals the earliest unrevealed escalation', () => {
    const s0 = baseState();
    const { state } = resolveEventChoice('intercepted-signal', 0, s0, fixedRng([]));
    expect(state.escalations[0].revealed).toBe(true);
    expect(state.escalations[1].revealed).toBe(false);
  });

  it('selling the codes changes nothing about escalations', () => {
    const s0 = baseState();
    const { state } = resolveEventChoice('intercepted-signal', 1, s0, fixedRng([]));
    expect(state.credits).toBe(15);
    expect(state.escalations.every((e) => !e.revealed)).toBe(true);
  });

  it('is a no-op (but does not crash) when everything is already revealed', () => {
    const s0 = baseState({
      escalations: [
        { id: 'hardened', act: 1, landsAfterColumn: 2, revealed: true },
        { id: 'deflectors', act: 1, landsAfterColumn: 5, revealed: true },
      ],
    });
    const { state } = resolveEventChoice('intercepted-signal', 0, s0, fixedRng([]));
    expect(state.escalations.every((e) => e.revealed)).toBe(true);
  });
});

describe('resolveEventChoice — recon-probe', () => {
  it('reports the next column enemy pool without mutating state', () => {
    const s0 = baseState({ position: { col: 1, row: 0 } });
    const { state, outcomeText } = resolveEventChoice('recon-probe', 0, s0, fixedRng([]));
    expect(state).toEqual(s0);
    expect(outcomeText.length).toBeGreaterThan(0);
  });

  it('stripping it for parts grants 4 credits', () => {
    const { state } = resolveEventChoice('recon-probe', 1, baseState(), fixedRng([]));
    expect(state.credits).toBe(14);
  });
});

describe('resolveEventChoice — sabotage-raid', () => {
  it('cancels the earliest unrevealed escalation and damages a random ship', () => {
    const s0 = baseState();
    const { state } = resolveEventChoice('sabotage-raid', 0, s0, fixedRng([0]));
    expect(state.escalations).toHaveLength(1);
    expect(state.escalations[0].id).toBe('deflectors');
    expect(state.fleet[0].damage).toBeGreaterThan(0);
  });

  it('declining grants 3 credits and touches nothing else', () => {
    const s0 = baseState();
    const { state } = resolveEventChoice('sabotage-raid', 1, s0, fixedRng([]));
    expect(state.credits).toBe(13);
    expect(state.escalations).toHaveLength(2);
  });
});

describe('resolveEventChoice — defector', () => {
  it('reveals every remaining escalation', () => {
    const { state } = resolveEventChoice('defector', 0, baseState(), fixedRng([]));
    expect(state.escalations.every((e) => e.revealed)).toBe(true);
  });

  it('turning them in grants 6 credits', () => {
    const { state } = resolveEventChoice('defector', 1, baseState(), fixedRng([]));
    expect(state.credits).toBe(16);
  });
});
