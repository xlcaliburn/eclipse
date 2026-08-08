import { describe, expect, it } from 'vitest';
import type { CombatEvent } from '../game/types';
import { countRevealSteps, revealStepEnd, rollbackToRevealed, shotKeyOf } from './replaySteps';

function roll(side: 'player' | 'enemy', shooterIndex: number, extra: Partial<CombatEvent> = {}): CombatEvent {
  return {
    kind: 'roll',
    phase: 'cannon',
    round: 1,
    side,
    shooterIndex,
    targetIndex: 0,
    raw: 4,
    computer: 1,
    shield: 0,
    hit: true,
    damage: 1,
    ...extra,
  } as CombatEvent;
}

const phaseStart = { kind: 'phase-start', phase: 'cannon', round: 1 } as unknown as CombatEvent;
const jink = { kind: 'part-effect', text: 'ISV Resolute jinks' } as unknown as CombatEvent;
const destroyed = { kind: 'destroyed', side: 'enemy', shipIndex: 0 } as unknown as CombatEvent;

describe('shotKeyOf', () => {
  it('is null for non-roll events, so they never group', () => {
    expect(shotKeyOf(phaseStart)).toBeNull();
    expect(shotKeyOf(destroyed)).toBeNull();
    expect(shotKeyOf(undefined)).toBeNull();
  });

  it('separates ships, sides, rounds, and phases', () => {
    const base = shotKeyOf(roll('player', 0));
    expect(shotKeyOf(roll('player', 0))).toBe(base);
    expect(shotKeyOf(roll('player', 1))).not.toBe(base);
    expect(shotKeyOf(roll('enemy', 0))).not.toBe(base);
    expect(shotKeyOf(roll('player', 0, { round: 2 }))).not.toBe(base);
    expect(shotKeyOf(roll('player', 0, { phase: 'missile' }))).not.toBe(base);
  });
});

describe('revealStepEnd', () => {
  it('reveals one ship\'s dice as a single step', () => {
    // A two-cannon flagship: both dice belong to one activation.
    const log = [roll('player', 0), roll('player', 0), roll('enemy', 0)];
    expect(revealStepEnd(log, 0)).toBe(2);
  });

  it('does not group dice from different ships', () => {
    // The regression the in-game check kept hitting: two separate drones
    // firing one die each must stay two steps.
    const log = [roll('enemy', 0), roll('enemy', 1)];
    expect(revealStepEnd(log, 0)).toBe(1);
    expect(revealStepEnd(log, 1)).toBe(2);
  });

  it('steps non-roll events one at a time', () => {
    const log = [phaseStart, roll('player', 0)];
    expect(revealStepEnd(log, 0)).toBe(1);
  });

  it('keeps a volley together across an interleaved jink', () => {
    // A jink logs immediately before the roll it negates. Splitting there
    // would break one ship's volley into two steps.
    const log = [roll('player', 0), jink, roll('player', 0), roll('enemy', 0)];
    expect(revealStepEnd(log, 0)).toBe(3);
  });

  it('stops at a trailing non-roll rather than swallowing it', () => {
    // Nothing of this shooter's follows, so the destroyed event gets its own
    // step and keeps its own beat.
    const log = [roll('player', 0), destroyed];
    expect(revealStepEnd(log, 0)).toBe(1);
  });

  it('does not run past the end of the log', () => {
    const log = [roll('player', 0), roll('player', 0)];
    expect(revealStepEnd(log, 0)).toBe(2);
    expect(revealStepEnd(log, 1)).toBe(2);
  });
});

describe('countRevealSteps', () => {
  it('counts activations, not dice — this is what paces the replay', () => {
    const log = [
      phaseStart, // 1
      roll('player', 0), // 2 — three dice, one step
      roll('player', 0),
      roll('player', 0),
      roll('enemy', 0), // 3
      roll('enemy', 1), // 4
      destroyed, // 5
    ];
    expect(countRevealSteps(log, 0, log.length)).toBe(5);
  });

  it('always terminates and covers the whole range', () => {
    const log = [roll('player', 0), roll('player', 0), phaseStart, roll('enemy', 2)];
    let i = 0;
    const visited: number[] = [];
    while (i < log.length) {
      visited.push(i);
      const next = revealStepEnd(log, i);
      expect(next).toBeGreaterThan(i); // no infinite loop
      i = next;
    }
    expect(i).toBe(log.length); // never overshoots
    expect(visited).toEqual([0, 2, 3]);
  });
});

describe('rollbackToRevealed', () => {
  it('at full reveal, nothing is pending and there is no active attacker/target', () => {
    const log = [roll('player', 0), destroyed];
    const result = rollbackToRevealed(log, log.length);
    expect(result.visibleLog).toEqual(log);
    expect(result.pendingDamage.size).toBe(0);
    expect(result.pendingDestroyed.size).toBe(0);
    expect(result.activeAttacker).toBeNull();
    expect(result.activeTarget).toBeNull();
  });

  it('sums pending damage from not-yet-revealed rolls, keyed by the defender', () => {
    // Two player rolls both hitting enemy ship 0, still pending — the
    // defender's key is built from the OPPOSITE side of the shooter.
    const log = [roll('player', 0, { targetIndex: 0, damage: 2 }), roll('player', 0, { targetIndex: 0, damage: 3 })];
    const result = rollbackToRevealed(log, 0);
    expect(result.pendingDamage.get('enemy:0')).toBe(5);
  });

  it('does not count a pending roll that missed (damage 0)', () => {
    const log = [roll('player', 0, { targetIndex: 0, hit: false, damage: 0 })];
    const result = rollbackToRevealed(log, 0);
    expect(result.pendingDamage.size).toBe(0);
  });

  it('marks a not-yet-revealed destroyed ship as pending, not yet destroyed', () => {
    const log = [destroyed]; // enemy:0
    const result = rollbackToRevealed(log, 0);
    expect(result.pendingDestroyed.has('enemy:0')).toBe(true);
  });

  it('reports the active attacker/target while mid-replay on a roll', () => {
    // log.length > revealedCount — still mid-replay (isReplaying) when the
    // just-revealed entry is checked.
    const log = [roll('player', 0, { targetIndex: 1, hit: true }), destroyed];
    const result = rollbackToRevealed(log, 1); // the roll just got revealed, destroyed still pending
    expect(result.activeAttacker).toEqual({ side: 'player', index: 0 });
    expect(result.activeTarget).toEqual({ side: 'enemy', index: 1, hit: true });
  });

  it('reports only an active target (no attacker) on a destroyed event', () => {
    const log = [roll('player', 0), destroyed, phaseStart];
    const result = rollbackToRevealed(log, 2); // destroyed just revealed, phaseStart still pending
    expect(result.activeAttacker).toBeNull();
    expect(result.activeTarget).toEqual({ side: 'enemy', index: 0, hit: true });
  });

  it('has no active attacker/target once fully revealed, even ending on a roll', () => {
    const log = [roll('player', 0)];
    const result = rollbackToRevealed(log, log.length);
    expect(result.activeAttacker).toBeNull();
    expect(result.activeTarget).toBeNull();
  });
});
