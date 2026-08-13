import { describe, expect, it } from 'vitest';
import { actColumns, generateMap } from './map';
import { mulberry32 } from './rng';
import type { RngFn } from './rng';
import {
  describeRequirement,
  drawEvent,
  eventStage,
  EVENTS,
  meetsRequirement,
  NAVAL_YARD_BERTH_PRICE,
  nextUnrevealedIndex,
  reqTextFor,
  resolveEventChoice,
} from './events';
import type { EventId } from './events';
import { ANCIENT_ARTIFACT_PART_ID, getPart } from './parts';
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

  it('inventoryAtLeast', () => {
    expect(meetsRequirement({ kind: 'inventoryAtLeast', value: 1 }, baseState({ inventory: [] }))).toBe(false);
    expect(meetsRequirement({ kind: 'inventoryAtLeast', value: 1 }, baseState({ inventory: ['ion'] }))).toBe(true);
  });

  it('creditsAtLeast', () => {
    expect(meetsRequirement({ kind: 'creditsAtLeast', value: 6 }, baseState({ credits: 5 }))).toBe(false);
    expect(meetsRequirement({ kind: 'creditsAtLeast', value: 6 }, baseState({ credits: 6 }))).toBe(true);
  });

  // Iteration 56.2: the bonus berth's per-run cap (BONUS_BERTH_CAP, 1).
  it('noBonusBerth: met when absent, unmet once the run holds a bonus berth', () => {
    const req = { kind: 'noBonusBerth' } as const;
    expect(meetsRequirement(req, baseState())).toBe(true);
    expect(meetsRequirement(req, baseState({ bonusFleetBerths: 0 }))).toBe(true);
    expect(meetsRequirement(req, baseState({ bonusFleetBerths: 1 }))).toBe(false);
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

  // 2026-08-07: choiceIndex 2 draws from a different (rare-capped) pool
  // than choiceIndex 1's elite-fight path now — no fight, no risk, so no
  // epic/legendary reward either. Still grants a part and sets no ambush.
  it('option 2 (Cloaking field): a rare-tier part, no ambush', () => {
    const { state, ambushEnemy } = resolveEventChoice('ancient-cache', 2, baseState(), fixedRng([0.1]));
    expect(state.inventory).toHaveLength(1);
    expect(ambushEnemy).toBeUndefined();
  });

  it('option 1 draws an elite-strength ambush and an epic/legendary reward; option 2 stays a regular rare drop', () => {
    const s1 = baseState({ position: { col: 1, row: 0 } });
    const { state: state1, ambushEnemy } = resolveEventChoice('ancient-cache', 1, s1, fixedRng([0.1]));
    expect(ambushEnemy?.id.endsWith('-elite')).toBe(true);
    const part1 = getPart(state1.inventory[0]);
    expect(['epic', 'legendary']).toContain(part1.rarity);

    const { state: state2 } = resolveEventChoice('ancient-cache', 2, s1, fixedRng([0.1]));
    const part2 = getPart(state2.inventory[0]);
    expect(part2.rarity).toBe('rare');
  });
});

describe('resolveEventChoice — abandoned-arsenal', () => {
  it('option 0: sells the scrap for 3 credits', () => {
    const { state } = resolveEventChoice('abandoned-arsenal', 0, baseState({ credits: 0 }), fixedRng([]));
    expect(state.credits).toBe(3);
  });

  it('option 1: grants a random part into inventory', () => {
    const { state } = resolveEventChoice('abandoned-arsenal', 1, baseState({ inventory: [] }), fixedRng([0.1]));
    expect(state.inventory).toHaveLength(1);
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

  it('option 1: driving the raiders off sets an easy-pool ambush and a 2-credit-plus-part win bonus', () => {
    // 2026-08-08: was 6cr — retuned down (see the event def's own comment)
    // after a playtest report flagged an easy-pool fight paying near
    // elite-tier once the bonus part's value was counted.
    const { ambushEnemy, ambushBonus } = resolveEventChoice('distress-beacon', 1, baseState(), fixedRng([0.1, 0.1]));
    expect(ambushEnemy).toBeDefined();
    expect(ambushBonus?.credits).toBe(2);
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

  // Iteration 20 (fleet triage): option 3, every ship at once instead of
  // the tender's usual pick-one.
  it('option 3: full-fleet overhaul pays 8 credits and repairs 2 on every ship, no picker needed', () => {
    const s0 = baseState({
      credits: 8,
      fleet: [
        { frameId: 'cruiser', equipped: [], damage: 3, upgrades: [] },
        { frameId: 'cruiser', equipped: ['hull2'], damage: 1, upgrades: [] },
        { frameId: 'cruiser', equipped: [], damage: 0, upgrades: [] },
      ],
    });
    const { state } = resolveEventChoice('repair-tender', 3, s0, fixedRng([]));
    expect(state.credits).toBe(0);
    expect(state.fleet[0].damage).toBe(1); // 3 - 2
    expect(state.fleet[1].damage).toBe(0); // 1 - 2, clamped
    expect(state.fleet[2].damage).toBe(0); // already 0, stays 0
  });

  it('option 3 clamps credits at 0 rather than going negative', () => {
    const s0 = baseState({ credits: 8, fleet: [{ frameId: 'cruiser', equipped: [], damage: 2, upgrades: [] }] });
    const { state } = resolveEventChoice('repair-tender', 3, s0, fixedRng([]));
    expect(state.credits).toBe(0);
  });
});

// Iteration 20 (the economy floor): heat-priced income, making the heat
// track's design literal — safe credits exist, priced in pursuit.
describe('resolveEventChoice — salvage-claim', () => {
  it('option 0: leaving it changes nothing', () => {
    const s0 = baseState({ heat: 1 });
    const { state } = resolveEventChoice('salvage-claim', 0, s0, fixedRng([]));
    expect(state).toEqual(s0);
  });

  it('option 1: strip the field pays 8 credits for 1 heat', () => {
    const s0 = baseState({ credits: 5, heat: 0 });
    const { state } = resolveEventChoice('salvage-claim', 1, s0, fixedRng([]));
    expect(state.credits).toBe(13);
    expect(state.heat).toBe(1);
  });

  it('option 2: a thorough sweep pays more for more heat', () => {
    const s0 = baseState({ credits: 5, heat: 0 });
    const { state } = resolveEventChoice('salvage-claim', 2, s0, fixedRng([]));
    expect(state.credits).toBe(17);
    expect(state.heat).toBe(2);
  });

  it('heat from a salvage claim is clamped at MAX_HEAT (4), same as any other heat gain', () => {
    const s0 = baseState({ heat: 3 });
    const { state } = resolveEventChoice('salvage-claim', 2, s0, fixedRng([])); // would be 3+2=5
    expect(state.heat).toBe(4);
  });

  // Iteration 21: the Spymaster's one hook on this event — no heat at all,
  // on either option, while everyone else still pays.
  it('costs the Spymaster no heat on the strip option', () => {
    const s0 = baseState({ credits: 5, heat: 1, commanderId: 'spymaster' });
    const { state } = resolveEventChoice('salvage-claim', 1, s0, fixedRng([]));
    expect(state.credits).toBe(13);
    expect(state.heat).toBe(1); // unchanged
  });

  it('costs the Spymaster no heat on the thorough-sweep option either', () => {
    const s0 = baseState({ credits: 5, heat: 1, commanderId: 'spymaster' });
    const { state } = resolveEventChoice('salvage-claim', 2, s0, fixedRng([]));
    expect(state.credits).toBe(17);
    expect(state.heat).toBe(1); // unchanged
  });

  it('every other commander still pays the normal heat cost', () => {
    for (const commanderId of ['merchant', 'engineer', 'warlord', 'admiral', undefined] as const) {
      const s0 = baseState({ heat: 0, commanderId });
      const { state } = resolveEventChoice('salvage-claim', 1, s0, fixedRng([]));
      expect(state.heat).toBe(1);
    }
  });
});

describe('resolveEventChoice — militia-requisition', () => {
  it('option 0: refusing changes nothing', () => {
    const s0 = baseState();
    const { state } = resolveEventChoice('militia-requisition', 0, s0, fixedRng([]));
    expect(state).toEqual(s0);
  });

  it('option 1: the chosen part leaves the inventory and grants 7 credits', () => {
    const s0 = baseState({ inventory: ['ion', 'comp1'] });
    const { state } = resolveEventChoice('militia-requisition', 1, s0, fixedRng([]), { partId: 'ion' });
    expect(state.inventory).toEqual(['comp1']);
    expect(state.credits).toBe(17);
  });
});

// --- The relic chain (iteration 34) ------------------------------------

describe('resolveEventChoice — relic-signal (stage 1)', () => {
  it('option 0: walking away sells the coordinates, no fragment gained', () => {
    const s0 = baseState();
    const { state } = resolveEventChoice('relic-signal', 0, s0, fixedRng([]));
    expect(state.credits).toBe(14);
    expect(state.relicFragments ?? 0).toBe(0);
  });

  it('option 1: taking the fragment sets relicFragments to 1 and costs 1 heat', () => {
    const s0 = baseState({ heat: 0 });
    const { state } = resolveEventChoice('relic-signal', 1, s0, fixedRng([]));
    expect(state.relicFragments).toBe(1);
    expect(state.heat).toBe(1);
    expect(state.credits).toBe(10); // unchanged
  });
});

describe('resolveEventChoice — relic-vault (stage 2)', () => {
  const midChain = { relicFragments: 1 as const };

  it('option 0: stripping the fittings pays 5 credits, fragment count unchanged', () => {
    const s0 = baseState(midChain);
    const { state } = resolveEventChoice('relic-vault', 0, s0, fixedRng([]));
    expect(state.credits).toBe(15);
    expect(state.relicFragments).toBe(1);
  });

  it('option 1: forcing the lock advances to 2 fragments and costs the chosen ship 2 capped damage', () => {
    const s0 = baseState(midChain);
    const { state } = resolveEventChoice('relic-vault', 1, s0, fixedRng([]), { shipIndex: 0 });
    expect(state.relicFragments).toBe(2);
    expect(state.fleet[0].damage).toBe(2);
  });

  it('option 2: the cloaked entry advances to 2 fragments with no damage', () => {
    const s0 = baseState({
      ...midChain,
      fleet: [{ frameId: 'cruiser', equipped: ['cloak'], damage: 0, upgrades: [] }],
    });
    const { state } = resolveEventChoice('relic-vault', 2, s0, fixedRng([]));
    expect(state.relicFragments).toBe(2);
    expect(state.fleet[0].damage).toBe(0);
  });

  it('the cloaked option is locked without the part', () => {
    const s0 = baseState(midChain);
    const req = { kind: 'partEquipped', partId: 'cloak' } as const;
    expect(meetsRequirement(req, s0)).toBe(false);
  });
});

describe('resolveEventChoice — relic-core (stage 3)', () => {
  const twoFragments = { relicFragments: 2 as const };

  it('option 0: selling both fragments pays 10 credits and zeroes the count', () => {
    const s0 = baseState(twoFragments);
    const { state } = resolveEventChoice('relic-core', 0, s0, fixedRng([]));
    expect(state.credits).toBe(20);
    expect(state.relicFragments).toBe(0);
  });

  it('option 1: buying the final fragment costs 8 credits, completes the chain, and grants the artifact', () => {
    const s0 = baseState({ ...twoFragments, credits: 10 });
    const { state } = resolveEventChoice('relic-core', 1, s0, fixedRng([]));
    expect(state.credits).toBe(2);
    expect(state.relicFragments).toBe(3);
    expect(state.inventory).toContain(ANCIENT_ARTIFACT_PART_ID);
  });

  it('option 2: taking it by force costs 2 heat, completes the chain, and grants the artifact — no credit cost', () => {
    const s0 = baseState({ ...twoFragments, credits: 0, heat: 0 });
    const { state } = resolveEventChoice('relic-core', 2, s0, fixedRng([]));
    expect(state.credits).toBe(0);
    expect(state.heat).toBe(2);
    expect(state.relicFragments).toBe(3);
    expect(state.inventory).toContain(ANCIENT_ARTIFACT_PART_ID);
  });

  it('the artifact is granted exactly once — a single stage-3 resolution adds exactly one copy', () => {
    const s0 = baseState({ ...twoFragments, credits: 10 });
    const { state } = resolveEventChoice('relic-core', 1, s0, fixedRng([]));
    expect(state.inventory.filter((id) => id === ANCIENT_ARTIFACT_PART_ID)).toHaveLength(1);
  });
});

describe('drawEvent — the relic chain continuation check (iteration 34.2)', () => {
  it('stage 1 sits in the base pool: with relicFragments 0, a normal draw can return relic-signal', () => {
    const s0 = baseState({ relicFragments: 0 });
    // Force the draw toward the end of the pool array by feeding rng()
    // close to 1 — deterministic enough to just confirm relic-signal is a
    // reachable outcome at all, not a specific index (pool order is an
    // implementation detail this test shouldn't pin).
    let sawSignal = false;
    for (let i = 0; i < 50 && !sawSignal; i++) {
      const rng = fixedRng([i / 50]);
      if (drawEvent(rng, s0, 1) === 'relic-signal') sawSignal = true;
    }
    expect(sawSignal).toBe(true);
  });

  it('with relicFragments 1, a continuation roll < 0.5 always returns relic-vault, never a normal pool event', () => {
    const s0 = baseState({ relicFragments: 1 });
    for (const roll of [0, 0.1, 0.49]) {
      expect(drawEvent(fixedRng([roll]), s0, 1)).toBe('relic-vault');
    }
  });

  it('with relicFragments 2, a continuation roll < 0.5 always returns relic-core', () => {
    const s0 = baseState({ relicFragments: 2 });
    for (const roll of [0, 0.1, 0.49]) {
      expect(drawEvent(fixedRng([roll]), s0, 1)).toBe('relic-core');
    }
  });

  it('a continuation roll >= 0.5 falls through to the normal pool draw instead, excluding relic-signal once the chain has started', () => {
    const s0 = baseState({ relicFragments: 1, lastEventId: undefined });
    const result = drawEvent(fixedRng([0.5, 0]), s0, 1); // fails continuation, then draws index 0 of the filtered pool
    expect(result).not.toBe('relic-signal');
    expect(result).not.toBe('relic-vault');
    expect(result).not.toBe('relic-core');
  });

  it('never rolls the continuation check once the chain is complete (relicFragments 3)', () => {
    const s0 = baseState({ relicFragments: 3 });
    // A single rng value proves no continuation check consumed a draw
    // first — if it had, this would throw (fixedRng exhausted).
    const result = drawEvent(fixedRng([0]), s0, 1);
    expect(result).not.toBe('relic-vault');
    expect(result).not.toBe('relic-core');
  });

  it('relic-signal never redraws once the chain has started (fragments > 0)', () => {
    const s0 = baseState({ relicFragments: 1 });
    for (let i = 0; i < 30; i++) {
      // roll >= 0.5 to skip the continuation check and hit the normal pool
      const result = drawEvent(fixedRng([0.9, i / 30]), s0, 1);
      expect(result).not.toBe('relic-signal');
    }
  });

  it("a pending defector-pursuit still outranks the continuation check — drawEvent is never even called for it", () => {
    // PICK_NODE's event branch is `state.pendingEventId ?? drawEvent(rng, state)`
    // — the ?? short-circuit is the actual guarantee here, exercised at the
    // reducer level (reducer.test.ts). This test documents the contract at
    // the events.ts level: drawEvent itself has no knowledge of
    // pendingEventId and never needs to, since its caller never invokes it
    // when a pending event is queued.
    const s0 = baseState({ relicFragments: 1, pendingEventId: 'defector-pursuit' });
    expect(s0.pendingEventId).toBe('defector-pursuit');
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

// 47.5q: describeRequirement replaced ~15 hand-synced requirement/reqText
// pairs with a derivation — these lock in the exact prose every one of
// those sites used to hardcode.
describe('describeRequirement', () => {
  it('names the required part', () => {
    expect(describeRequirement({ kind: 'partEquipped', partId: 'dcbay' })).toBe('requires Damage control bay');
    expect(describeRequirement({ kind: 'partEquipped', partId: 'cloak' })).toBe('requires Cloaking field');
    expect(describeRequirement({ kind: 'partEquipped', partId: 'lure' })).toBe('requires Lure beacon');
  });

  it('names the required frame with the correct indefinite article', () => {
    expect(describeRequirement({ kind: 'framePresent', frameId: 'interceptor' })).toBe(
      'requires an Interceptor in the fleet',
    );
    expect(describeRequirement({ kind: 'framePresent', frameId: 'bastion' })).toBe('requires a Bastion in the fleet');
  });

  it('states the numeric thresholds', () => {
    expect(describeRequirement({ kind: 'everyShipInitiativeAtLeast', value: 2 })).toBe(
      'requires every ship at initiative 2+',
    );
    expect(describeRequirement({ kind: 'anyShipComputerAtLeast', value: 3 })).toBe(
      'requires a ship with computer 3+',
    );
    expect(describeRequirement({ kind: 'creditsAtLeast', value: 6 })).toBe('requires 6+ credits');
  });

  it('names the bonus-berth cap requirement (56.2)', () => {
    expect(describeRequirement({ kind: 'noBonusBerth' })).toBe('requires the bonus berth slot to still be open');
  });
});

describe('reqTextFor', () => {
  it('prefers a bespoke reqText override over the generic derivation', () => {
    const option = { label: 'x', requirement: { kind: 'inventoryAtLeast' as const, value: 1 }, reqText: 'requires a spare part to donate' };
    expect(reqTextFor(option)).toBe('requires a spare part to donate');
  });

  it('derives from the requirement when no override is set', () => {
    const option = { label: 'x', requirement: { kind: 'creditsAtLeast' as const, value: 6 } };
    expect(reqTextFor(option)).toBe('requires 6+ credits');
  });

  it('is undefined for an option with no requirement', () => {
    expect(reqTextFor({ label: 'x' })).toBeUndefined();
  });

  it('every gated option across the whole EVENTS table resolves to real text (the pairing this replaces can no longer drift silently)', () => {
    for (const event of EVENTS) {
      for (const option of event.options) {
        if (option.requirement) {
          expect(reqTextFor(option)).toBeTruthy();
        }
      }
    }
  });
});

// 47.5r (cheap version): `choiceIndex` positionally couples EVENTS'
// options list to resolveEventChoice's switch, 400 lines apart, with
// nothing checking the two stay aligned — reordering an option's label
// would silently swap its outcome. This doesn't fix that (the proper fix,
// keyed outcomes instead of indices, is parked — see parking-lot.md); it
// catches the resulting class of bug: every declared option, for every
// event in the table, must resolve through the real switch to actual
// outcome text. `resolveEventChoice` itself doesn't bounds-check
// `choiceIndex` (its own docstring: it trusts the caller, which is
// reducer.ts's EVENT_CHOOSE, already validated by then) — this test's
// scope is the in-range correspondence, which is the actual risk the
// comment above describes.
describe('resolveEventChoice — every EVENTS entry resolves (47.5r)', () => {
  it('every event, every declared choiceIndex, produces real outcome text', () => {
    const state = baseState({
      credits: 20,
      inventory: ['ion', 'comp1'],
      fleet: [
        { frameId: 'cruiser', equipped: ['ion', 'comp1', 'hull1'], damage: 0, upgrades: [] },
        { frameId: 'interceptor', equipped: ['ion'], damage: 0, upgrades: [] },
      ],
    });
    for (const event of EVENTS) {
      event.options.forEach((option, choiceIndex) => {
        const selection = {
          shipIndex: option.chooseShip ? 0 : undefined,
          partId: option.choosePart ? state.inventory[0] : undefined,
        };
        const result = resolveEventChoice(event.id, choiceIndex, state, mulberry32(choiceIndex + 1), selection);
        expect(result.outcomeText, `${event.id}[${choiceIndex}]`).toBeTruthy();
      });
    }
  });
});

// =========================================================================
// Iteration 49: stage-gated event pool + inventoryAtMost + 3 new events +
// 2 quest chains (debt broker, colony ship).
// =========================================================================

describe('eventStage — boundary cases (49.1/49.7.1)', () => {
  it('act 1: global column 3 is early, 4 is mid (the early/mid boundary)', () => {
    expect(eventStage(1, 3)).toBe('early');
    expect(eventStage(1, 4)).toBe('mid');
  });

  it('act 1: global column 10 is mid, 11 is late (the mid/late boundary)', () => {
    expect(eventStage(1, 10)).toBe('mid');
    expect(eventStage(1, 11)).toBe('late');
  });

  it('act 2 column 0 is already global 11 — late from the very first node', () => {
    expect(eventStage(2, 0)).toBe('late');
  });
});

describe('inventoryAtMost (49.2)', () => {
  it('met at 0 spares, unmet with 1', () => {
    const req = { kind: 'inventoryAtMost', value: 0 } as const;
    expect(meetsRequirement(req, baseState({ inventory: [] }))).toBe(true);
    expect(meetsRequirement(req, baseState({ inventory: ['ion'] }))).toBe(false);
  });

  it('describeRequirement text', () => {
    expect(describeRequirement({ kind: 'inventoryAtMost', value: 0 })).toBe('requires 0 or fewer spare parts');
    expect(describeRequirement({ kind: 'inventoryAtMost', value: 2 })).toBe('requires 2 or fewer spare parts');
  });
});

describe('drawEvent — stage filtering (49.1/49.7.2)', () => {
  const midOrLateOnly: EventId[] = [
    'intercepted-signal',
    'sabotage-raid',
    'defector',
    'repair-tender',
    'salvage-claim',
    'militia-requisition',
    'ancient-cache',
  ];
  const earlyOnly: EventId[] = ['customs-checkpoint', 'war-surplus-peddler', 'nav-buoy', 'debt-broker', 'colony-ship'];

  it('an early column never yields a mid/late-only event, across many seeds', () => {
    const s0 = baseState({ relicFragments: 0 });
    for (let seed = 1; seed <= 200; seed++) {
      const drawn = drawEvent(mulberry32(seed), s0, 1); // act-1 col 1 -> global 1 -> early
      expect(midOrLateOnly).not.toContain(drawn);
    }
  });

  it('a late column never yields an early-only event, across many seeds', () => {
    const s0 = baseState({ act: 2, position: { col: 0, row: 0 }, relicFragments: 0 });
    for (let seed = 1; seed <= 200; seed++) {
      const drawn = drawEvent(mulberry32(seed), s0, 0); // act-2 col 0 -> global 11 -> late
      expect(earlyOnly).not.toContain(drawn);
    }
  });

  it('the three new early events and debt-broker/colony-ship are all reachable from an early draw', () => {
    const s0 = baseState({ relicFragments: 0 });
    const seen = new Set<EventId>();
    for (let seed = 1; seed <= 500; seed++) {
      seen.add(drawEvent(mulberry32(seed), s0, 1));
    }
    for (const id of earlyOnly) expect(seen.has(id)).toBe(true);
  });
});

describe('drawEvent — the five iteration-56 late-only events (56.3)', () => {
  const lateOnly: EventId[] = ['naval-yard', 'derelict-flotilla', 'counter-relay-breach', 'blackout-run', 'black-site-vault'];

  it('an early column never yields one, across many seeds', () => {
    const s0 = baseState({ relicFragments: 0 });
    for (let seed = 1; seed <= 300; seed++) {
      const drawn = drawEvent(mulberry32(seed), s0, 1); // act-1 col 1 -> global 1 -> early
      expect(lateOnly).not.toContain(drawn);
    }
  });

  it('a mid column never yields one, across many seeds', () => {
    const s0 = baseState({ relicFragments: 0 });
    for (let seed = 1; seed <= 300; seed++) {
      const drawn = drawEvent(mulberry32(seed), s0, 5); // act-1 col 5 -> global 5 -> mid
      expect(lateOnly).not.toContain(drawn);
    }
  });

  it('a late column reaches all five, across many seeds', () => {
    const s0 = baseState({ act: 2, position: { col: 0, row: 0 }, relicFragments: 0 });
    const seen = new Set<EventId>();
    for (let seed = 1; seed <= 2000; seed++) {
      seen.add(drawEvent(mulberry32(seed), s0, 0)); // act-2 col 0 -> global 11 -> late
    }
    for (const id of lateOnly) expect(seen.has(id)).toBe(true);
  });

  it('once a bonus berth is held, neither berth event is ever drawn — they truly never appear, not just show locked', () => {
    const s0 = baseState({ act: 2, position: { col: 0, row: 0 }, relicFragments: 0, bonusFleetBerths: 1 });
    for (let seed = 1; seed <= 500; seed++) {
      const drawn = drawEvent(mulberry32(seed), s0, 0);
      expect(drawn).not.toBe('naval-yard');
      expect(drawn).not.toBe('derelict-flotilla');
    }
  });
});

describe('resolveEventChoice — customs-checkpoint (49.3/49.7.5)', () => {
  it('option 0: pay the toll costs 1 credit', () => {
    const { state } = resolveEventChoice('customs-checkpoint', 0, baseState({ credits: 5 }), fixedRng([]));
    expect(state.credits).toBe(4);
  });

  it('option 1: slip past costs 1 heat, no credit change', () => {
    const s0 = baseState({ heat: 0 });
    const { state } = resolveEventChoice('customs-checkpoint', 1, s0, fixedRng([]));
    expect(state.heat).toBe(1);
    expect(state.credits).toBe(s0.credits);
  });

  it('option 2: nothing to declare changes nothing', () => {
    const s0 = baseState({ inventory: [] });
    const { state } = resolveEventChoice('customs-checkpoint', 2, s0, fixedRng([]));
    expect(state).toEqual(s0);
  });
});

describe('resolveEventChoice — war-surplus-peddler (49.3/49.7.5)', () => {
  it('option 0: move on changes nothing', () => {
    const s0 = baseState();
    const { state } = resolveEventChoice('war-surplus-peddler', 0, s0, fixedRng([]));
    expect(state).toEqual(s0);
  });

  it('option 1: buying a crate costs 2 credits and grants a common-tier part', () => {
    const s0 = baseState({ credits: 5, inventory: [] });
    const { state } = resolveEventChoice('war-surplus-peddler', 1, s0, fixedRng([0.1]));
    expect(state.credits).toBe(3);
    expect(state.inventory).toHaveLength(1);
    expect(getPart(state.inventory[0]).rarity).toBe('common');
  });

  it('option 2: selling scrap grants 2 credits', () => {
    const { state } = resolveEventChoice('war-surplus-peddler', 2, baseState({ credits: 0 }), fixedRng([]));
    expect(state.credits).toBe(2);
  });
});

describe('resolveEventChoice — nav-buoy (49.3/49.7.5)', () => {
  it('option 0: scrapping it grants 2 credits', () => {
    const { state } = resolveEventChoice('nav-buoy', 0, baseState({ credits: 0 }), fixedRng([]));
    expect(state.credits).toBe(2);
  });

  it("option 1: pulling its charts reveals every node in the next column", () => {
    const s0 = baseState({ position: { col: 1, row: 0 } });
    const { state, outcomeText } = resolveEventChoice('nav-buoy', 1, s0, fixedRng([]));
    const expectedPositions = actColumns(s0.map, s0.act)[2];
    for (const node of expectedPositions) {
      expect(state.revealedNodes).toContainEqual({ col: node.col, row: node.row });
    }
    expect(outcomeText.length).toBeGreaterThan(0);
  });
});

// --- Iteration 49.4: the debt broker chain ------------------------------

describe('resolveEventChoice — debt-broker (49.4/49.7.6)', () => {
  it('option 0: declining changes nothing', () => {
    const s0 = baseState();
    const { state } = resolveEventChoice('debt-broker', 0, s0, fixedRng([]));
    expect(state).toEqual(s0);
  });

  it('option 1: taking the loan grants 8 credits and sets loanOutstanding', () => {
    const s0 = baseState({ credits: 0 });
    const { state } = resolveEventChoice('debt-broker', 1, s0, fixedRng([]));
    expect(state.credits).toBe(8);
    expect(state.loanOutstanding).toBe(true);
  });
});

describe('resolveEventChoice — debt-collectors (49.4/49.7.6)', () => {
  it('option 0: settling pays 12 credits (clamped) and clears the loan', () => {
    const s0 = baseState({ credits: 12, loanOutstanding: true });
    const { state } = resolveEventChoice('debt-collectors', 0, s0, fixedRng([]));
    expect(state.credits).toBe(0);
    expect(state.loanOutstanding).toBeUndefined();
  });

  it('option 1: fighting sets a hard-pool ambush with the debt-cleared chainEffect; loanOutstanding stays set at choice time', () => {
    const s0 = baseState({ loanOutstanding: true });
    const { state, ambushEnemy, ambushBonus } = resolveEventChoice('debt-collectors', 1, s0, fixedRng([0.1]));
    expect(ambushEnemy).toBeDefined();
    expect(ambushBonus).toEqual({ chainEffect: 'debt-cleared' });
    expect(state.loanOutstanding).toBe(true); // unchanged at choice time — see 49.4's note
  });

  it('option 2 (Cloaking field): slips away, debt stays outstanding', () => {
    const s0 = baseState({
      loanOutstanding: true,
      fleet: [{ frameId: 'cruiser', equipped: ['cloak'], damage: 0, upgrades: [] }],
    });
    const { state, ambushEnemy } = resolveEventChoice('debt-collectors', 2, s0, fixedRng([]));
    expect(ambushEnemy).toBeUndefined();
    expect(state.loanOutstanding).toBe(true);
  });
});

describe('drawEvent — the debt chain continuation check (49.4/49.7.6)', () => {
  it('never fires debt-collectors at an early column even with loanOutstanding', () => {
    const s0 = baseState({ loanOutstanding: true });
    for (let seed = 1; seed <= 100; seed++) {
      expect(drawEvent(mulberry32(seed), s0, 1)).not.toBe('debt-collectors');
    }
  });

  it('sometimes fires debt-collectors mid+, across seeds', () => {
    const s0 = baseState({ loanOutstanding: true });
    let saw = false;
    for (let seed = 1; seed <= 100 && !saw; seed++) {
      if (drawEvent(mulberry32(seed), s0, 4) === 'debt-collectors') saw = true;
    }
    expect(saw).toBe(true);
  });

  it('never rolls the debt continuation check without loanOutstanding', () => {
    const s0 = baseState({ loanOutstanding: undefined });
    for (let seed = 1; seed <= 60; seed++) {
      expect(drawEvent(mulberry32(seed), s0, 4)).not.toBe('debt-collectors');
    }
  });

  it('the relic chain shadows the debt chain when both are live (priority: relic -> debt -> colony)', () => {
    const s0 = baseState({ loanOutstanding: true, relicFragments: 1 });
    for (const roll of [0, 0.1, 0.49]) {
      expect(drawEvent(fixedRng([roll]), s0, 4)).toBe('relic-vault');
    }
  });
});

// --- Iteration 49.5: the colony ship chain ------------------------------

describe('resolveEventChoice — colony-ship (49.5/49.7.7)', () => {
  it('option 0: selling charts grants 3 credits; no chain started', () => {
    const { state } = resolveEventChoice('colony-ship', 0, baseState({ credits: 0 }), fixedRng([]));
    expect(state.credits).toBe(3);
    expect(state.colonyStage).toBeUndefined();
  });

  it('option 1: escorting sets colonyStage to 1, no credit change', () => {
    const s0 = baseState();
    const { state } = resolveEventChoice('colony-ship', 1, s0, fixedRng([]));
    expect(state.colonyStage).toBe(1);
    expect(state.credits).toBe(s0.credits);
  });
});

describe('resolveEventChoice — colony-raiders (49.5/49.7.7)', () => {
  it("option 0: letting it happen clears colonyStage, chain ends, no ambush", () => {
    const s0 = baseState({ colonyStage: 1 });
    const { state, ambushEnemy } = resolveEventChoice('colony-raiders', 0, s0, fixedRng([]));
    expect(state.colonyStage).toBeUndefined();
    expect(ambushEnemy).toBeUndefined();
  });

  it('option 1: driving raiders off clears colonyStage at choice time and sets an easy-pool ambush with the colony-defended chainEffect', () => {
    const s0 = baseState({ colonyStage: 1 });
    const { state, ambushEnemy, ambushBonus } = resolveEventChoice('colony-raiders', 1, s0, fixedRng([0.1]));
    expect(state.colonyStage).toBeUndefined(); // cleared at choice time — restored only on a win
    expect(ambushEnemy).toBeDefined();
    expect(ambushBonus).toEqual({ chainEffect: 'colony-defended' });
  });
});

describe('resolveEventChoice — colony-arrival (49.5/49.7.7)', () => {
  it("option 0: the founders' gift grants 10 credits and a rare-tier-capped part, clears colonyStage", () => {
    const s0 = baseState({ credits: 0, colonyStage: 2 });
    const { state } = resolveEventChoice('colony-arrival', 0, s0, fixedRng([0.1]));
    expect(state.credits).toBe(10);
    expect(state.inventory).toHaveLength(1);
    expect(getPart(state.inventory[0]).rarity).toBe('rare');
    expect(state.colonyStage).toBeUndefined();
  });

  it('option 1: cash settlement grants 14 credits, clears colonyStage', () => {
    const s0 = baseState({ credits: 0, colonyStage: 2 });
    const { state } = resolveEventChoice('colony-arrival', 1, s0, fixedRng([]));
    expect(state.credits).toBe(14);
    expect(state.colonyStage).toBeUndefined();
  });
});

describe('drawEvent — the colony chain continuation check (49.5/49.7.7)', () => {
  it('never fires colony-raiders at an early column even with colonyStage 1', () => {
    const s0 = baseState({ colonyStage: 1 });
    for (let seed = 1; seed <= 100; seed++) {
      expect(drawEvent(mulberry32(seed), s0, 1)).not.toBe('colony-raiders');
    }
  });

  it('sometimes fires colony-raiders mid+, across seeds', () => {
    const s0 = baseState({ colonyStage: 1 });
    let saw = false;
    for (let seed = 1; seed <= 100 && !saw; seed++) {
      if (drawEvent(mulberry32(seed), s0, 4) === 'colony-raiders') saw = true;
    }
    expect(saw).toBe(true);
  });

  it('colony-arrival never fires mid, even with colonyStage 2 (late-only)', () => {
    const s0 = baseState({ colonyStage: 2 });
    for (let seed = 1; seed <= 100; seed++) {
      expect(drawEvent(mulberry32(seed), s0, 4)).not.toBe('colony-arrival');
    }
  });

  it('sometimes fires colony-arrival late, across seeds', () => {
    const s0 = baseState({ act: 2, position: { col: 0, row: 0 }, colonyStage: 2 });
    let saw = false;
    for (let seed = 1; seed <= 100 && !saw; seed++) {
      if (drawEvent(mulberry32(seed), s0, 0) === 'colony-arrival') saw = true;
    }
    expect(saw).toBe(true);
  });

  it('the debt chain shadows the colony chain when both are live (priority: relic -> debt -> colony)', () => {
    const s0 = baseState({ loanOutstanding: true, colonyStage: 1 });
    for (const roll of [0, 0.1, 0.49]) {
      expect(drawEvent(fixedRng([roll]), s0, 4)).toBe('debt-collectors');
    }
  });
});

// =========================================================================
// Iteration 56: act-2-exclusive events + the bonus fleet berth.
// =========================================================================

describe('resolveEventChoice — naval-yard (56.2)', () => {
  it('option 0: move on changes nothing', () => {
    const s0 = baseState({ credits: 10 });
    const { state } = resolveEventChoice('naval-yard', 0, s0, fixedRng([]));
    expect(state).toEqual(s0);
  });

  it('option 1: buying pays NAVAL_YARD_BERTH_PRICE and grants the berth', () => {
    const s0 = baseState({ credits: NAVAL_YARD_BERTH_PRICE });
    const { state } = resolveEventChoice('naval-yard', 1, s0, fixedRng([]));
    expect(state.credits).toBe(0);
    expect(state.bonusFleetBerths).toBe(1);
  });
});

describe('resolveEventChoice — derelict-flotilla (56.2)', () => {
  it('option 0: leave it changes nothing', () => {
    const s0 = baseState();
    const { state } = resolveEventChoice('derelict-flotilla', 0, s0, fixedRng([]));
    expect(state).toEqual(s0);
  });

  it('option 1: cutting a hull free costs 1 heat and sets an easy-pool ambush with the berth-unlocked chainEffect', () => {
    const s0 = baseState({ act: 2, heat: 1 });
    const { state, ambushEnemy, ambushBonus } = resolveEventChoice('derelict-flotilla', 1, s0, fixedRng([0.1]));
    expect(state.heat).toBe(2);
    expect(ambushEnemy).toBeDefined();
    expect(ambushBonus).toEqual({ chainEffect: 'berth-unlocked' });
    // No berth yet at choice time — win-conditional, applied only on a real
    // CONTINUE win (see reducer.test.ts's iteration-56 chainEffect tests).
    expect(state.bonusFleetBerths).toBeUndefined();
  });

  it('option 2: stripping for parts grants a part, no berth', () => {
    const s0 = baseState();
    const { state } = resolveEventChoice('derelict-flotilla', 2, s0, fixedRng([0.1]));
    expect(state.inventory).toHaveLength(1);
    expect(state.bonusFleetBerths).toBeUndefined();
  });
});
