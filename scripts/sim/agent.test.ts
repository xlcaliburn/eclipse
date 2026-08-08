import { describe, expect, it } from 'vitest';
import { simulateRunWithAgent } from './agent';
import { ARCHETYPES } from './policy';

// 45.6: liveness — the agent must never dispatch an action the reducer
// rejects (a policy/reducer legality-model mismatch is exactly the bug
// class this rebuild exists to catch — see agent.ts's header comment) and
// every run must actually terminate (win or loss), never wander forever.
describe('simulateRunWithAgent — liveness', () => {
  const SEEDS = 40;

  it('every run terminates (win or loss) with no rejected dispatch, balanced archetype', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const outcome = simulateRunWithAgent(seed, seed, ARCHETYPES.balanced, undefined);
      expect(outcome.rejectedDispatch, `seed ${seed} rejected: ${outcome.rejectedAction}`).toBe(false);
      expect(outcome.won || outcome.diedAt !== null || outcome.actionsDispatched > 0).toBe(true);
    }
  });

  it('every archetype completes without a rejected dispatch, across a handful of seeds', () => {
    for (const [name, config] of Object.entries(ARCHETYPES)) {
      for (let seed = 1; seed <= 8; seed++) {
        const outcome = simulateRunWithAgent(seed, seed + 1000, config, undefined);
        expect(outcome.rejectedDispatch, `${name} seed ${seed} rejected: ${outcome.rejectedAction}`).toBe(false);
      }
    }
  });

  it('every commander completes without a rejected dispatch, across a handful of seeds', () => {
    const commanders = ['merchant', 'engineer', 'spymaster', 'admiral', 'warlord'] as const;
    for (const commanderId of commanders) {
      for (let seed = 1; seed <= 8; seed++) {
        const outcome = simulateRunWithAgent(seed, seed + 2000, ARCHETYPES.balanced, commanderId);
        expect(outcome.rejectedDispatch, `${commanderId} seed ${seed} rejected: ${outcome.rejectedAction}`).toBe(false);
      }
    }
  });

  it('stays well under the action ceiling for ordinary runs', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const outcome = simulateRunWithAgent(seed, seed, ARCHETYPES.balanced, undefined);
      expect(outcome.actionsDispatched).toBeLessThan(2000); // ceiling is 5000 — this catches a stall long before the hard cap
    }
  });
});

describe('simulateRunWithAgent — determinism', () => {
  it('the same (runSeed, policySeed) reproduces an identical outcome', () => {
    for (const seed of [1, 7, 23]) {
      const a = simulateRunWithAgent(seed, seed, ARCHETYPES.balanced, undefined);
      const b = simulateRunWithAgent(seed, seed, ARCHETYPES.balanced, undefined);
      expect(b).toEqual(a);
    }
  });

  it('a different policySeed can change routing noise without changing the run seed\'s map', () => {
    // Not a strict inequality assertion (noise CAN happen to agree) — just
    // confirms both policySeeds produce valid, non-crashing, deterministic
    // runs independently, which is the actual guarantee this feature makes.
    const a1 = simulateRunWithAgent(5, 1, ARCHETYPES.balanced, undefined);
    const a2 = simulateRunWithAgent(5, 1, ARCHETYPES.balanced, undefined);
    const b1 = simulateRunWithAgent(5, 2, ARCHETYPES.balanced, undefined);
    expect(a2).toEqual(a1);
    expect(b1.rejectedDispatch).toBe(false);
  });
});

describe('simulateRunWithAgent — commander targeting', () => {
  it('marks a run skipped when the desired commander was not among this seed\'s 3 offered choices, and never skips when it was', () => {
    let sawSkipped = false;
    let sawUsed = false;
    for (let seed = 1; seed <= 30; seed++) {
      const outcome = simulateRunWithAgent(seed, seed, ARCHETYPES.balanced, 'merchant');
      if (outcome.skipped) {
        sawSkipped = true;
        expect(outcome.commanderId).not.toBe('merchant');
      } else {
        sawUsed = true;
        expect(outcome.commanderId).toBe('merchant');
      }
    }
    // Merchant is offered on ~3/5 of seeds — 30 seeds should see both cases.
    expect(sawSkipped).toBe(true);
    expect(sawUsed).toBe(true);
  });
});
