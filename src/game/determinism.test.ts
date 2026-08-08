import { describe, expect, it, vi } from 'vitest';
import { initialRunState, runReducer } from './reducer';
import type { RunAction } from './reducer';
import type { PlayerShipState, RunState } from './types';

// Two "fresh runs" built while Math.random is pinned to a fixed value —
// NEW_RUN's seed is the run's one legitimate nondeterministic draw (rng.ts),
// so pinning it here is the only way to get two independently-constructed
// but identical starting states to diverge-test against.
function freshIdenticalPair(): [RunState, RunState] {
  const spy = vi.spyOn(Math, 'random').mockReturnValue(0.42);
  const a = initialRunState();
  const b = initialRunState();
  spy.mockRestore();
  return [a, b];
}

describe('full-run determinism (iteration 9.1)', () => {
  it('the same seed produces byte-identical initial state', () => {
    const [a, b] = freshIdenticalPair();
    expect(a).toEqual(b);
  });

  it('the same action sequence from the same seed produces deep-equal states at every step', () => {
    let [a, b] = freshIdenticalPair();
    const actions: RunAction[] = [
      { type: 'CHOOSE_COMMANDER', commanderId: a.commanderChoices[0] },
      { type: 'PICK_NODE', row: 0 }, // the act-1 opener — always row 0, no map-shape assumptions needed
    ];
    for (const action of actions) {
      a = runReducer(a, action);
      b = runReducer(b, action);
      expect(a).toEqual(b);
    }
    // Continues to diverge-test through the fight itself and its aftermath.
    expect(a.currentCombatSeed).toBeDefined();
    a = runReducer(a, { type: 'ENGAGE' });
    b = runReducer(b, { type: 'ENGAGE' });
    expect(a).toEqual(b);
    a = runReducer(a, { type: 'AUTO_RESOLVE' });
    b = runReducer(b, { type: 'AUTO_RESOLVE' });
    expect(a).toEqual(b);
    expect(a.combat?.winner).toBeDefined(); // sanity: the fight actually finished
    a = runReducer(a, { type: 'CONTINUE' });
    b = runReducer(b, { type: 'CONTINUE' });
    expect(a).toEqual(b);
  });

  it('reloading before ENGAGE cannot reroll the fight — the combat seed is fixed at PICK_NODE, not ENGAGE', () => {
    let [a] = freshIdenticalPair();
    a = runReducer(a, { type: 'CHOOSE_COMMANDER', commanderId: a.commanderChoices[0] });
    a = runReducer(a, { type: 'PICK_NODE', row: 0 });
    expect(a.currentCombatSeed).toBeDefined();

    // "Reload" = rehydrate the exact same saved snapshot and Engage from
    // it, twice — ENGAGE itself draws nothing random, so both must produce
    // the identical fight.
    const reloaded: RunState = JSON.parse(JSON.stringify(a));
    const engagedOnce = runReducer(reloaded, { type: 'ENGAGE' });
    const engagedAgain = runReducer(reloaded, { type: 'ENGAGE' });
    expect(engagedOnce.combat).toEqual(engagedAgain.combat);
  });

  it('event resolution (including its own randomness) is identical after reload', () => {
    const fleet: PlayerShipState[] = [{ frameId: 'cruiser', equipped: ['ion', 'comp1', 'hull1'], damage: 0, upgrades: [] }];
    const [a, b] = freshIdenticalPair();
    const eventState = (base: RunState): RunState => ({
      ...base,
      phase: 'event' as const,
      fleet,
      position: { col: 3, row: 0 },
      currentEvent: { eventId: 'derelict-cruiser' as const },
    });
    // Choice 1 ("crack the reactor") is chooseShip — exercises the same
    // 50/50 rng draw the reactor risk used to make unconditionally.
    const resolvedA = runReducer(eventState(a), { type: 'EVENT_CHOOSE', choiceIndex: 1, shipIndex: 0 });
    const resolvedB = runReducer(eventState(b), { type: 'EVENT_CHOOSE', choiceIndex: 1, shipIndex: 0 });
    expect(resolvedA).toEqual(resolvedB);
  });
});
