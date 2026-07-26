import { describe, expect, it } from 'vitest';
import { mulberry32 } from './rng';
import type { RngFn } from './rng';
import { resolveCombat, resolveHit } from './resolver';
import type { EnemyDef, ShipStats } from './types';
import { deriveStats } from './ship';
import { GAUNTLET } from './enemies';

// Maps a desired d6 face (1-6) to an RNG float that rollD6 will turn into
// exactly that face: floor(x * 6) + 1 === face.
function valueFor(face: number): number {
  return (face - 0.5) / 6;
}

// Returns a queue-backed RngFn for tests that need exact, ordered rolls.
// Throws if more values are consumed than provided, so tests fail loudly
// if a scenario accidentally rolls more (or fewer) dice than expected.
function fixedRng(values: number[]): RngFn {
  let i = 0;
  return () => {
    if (i >= values.length) {
      throw new Error(`fixedRng exhausted after ${values.length} values`);
    }
    return values[i++];
  };
}

function blankStats(overrides: Partial<ShipStats> = {}): ShipStats {
  return {
    initiative: 0,
    hp: 1,
    computer: 0,
    shield: 0,
    cannons: [],
    missiles: [],
    ...overrides,
  };
}

describe('resolveHit', () => {
  it('a natural 6 always hits, even against a strong shield', () => {
    expect(resolveHit(6, 0, 5)).toBe(true);
  });

  it('a natural 1 always misses, even with a strong computer', () => {
    expect(resolveHit(1, 5, 0)).toBe(false);
  });

  it('computer 0 vs shield 0 hits only on a natural 6', () => {
    expect(resolveHit(5, 0, 0)).toBe(false);
    expect(resolveHit(6, 0, 0)).toBe(true);
  });

  it('computer 2 vs shield 0 hits on 4+', () => {
    expect(resolveHit(3, 2, 0)).toBe(false);
    expect(resolveHit(4, 2, 0)).toBe(true);
  });

  it('computer 3 vs shield 3 hits only on a natural 6', () => {
    expect(resolveHit(5, 3, 3)).toBe(false);
    expect(resolveHit(6, 3, 3)).toBe(true);
  });
});

describe('resolveCombat — HP boundary', () => {
  it('destroys a ship exactly when accumulated damage reaches its HP, not before', () => {
    // hp fixed at 2 directly rather than derived from a frame, so this test
    // stays valid regardless of frame HP tuning.
    const playerStats = blankStats({ hp: 2 });
    const enemyDef: EnemyDef = {
      id: 'test-poker',
      name: 'Test poker',
      blurb: '',
      groups: [{ label: 'enemy', count: 1, stats: blankStats({ cannons: [{ diceCount: 1, damage: 1 }] }) }],
    };

    // Round 1: enemy's single die hits for 1 (damage 1 < hp 2 — survives).
    // Round 2: enemy's single die hits for 1 again (damage 2 == hp 2 — destroyed).
    const rng = fixedRng([valueFor(6), valueFor(6)]);
    const result = resolveCombat([playerStats], enemyDef, rng);

    const round1Start = result.log.findIndex((e) => e.kind === 'phase-start' && e.phase === 'cannon' && e.round === 1);
    const round2Start = result.log.findIndex((e) => e.kind === 'phase-start' && e.phase === 'cannon' && e.round === 2);
    expect(round1Start).toBeGreaterThanOrEqual(0);
    expect(round2Start).toBeGreaterThan(round1Start);

    const destroyedBetween = result.log
      .slice(round1Start, round2Start)
      .some((e) => e.kind === 'destroyed' && e.side === 'player');
    expect(destroyedBetween).toBe(false);

    const destroyedAfterRound2 = result.log
      .slice(round2Start)
      .some((e) => e.kind === 'destroyed' && e.side === 'player');
    expect(destroyedAfterRound2).toBe(true);
    expect(result.winner).toBe('enemy');
  });
});

describe('resolveCombat — missile phase ordering', () => {
  it('fires missiles exactly once, before any cannon round', () => {
    const playerStats = blankStats({
      hp: 10,
      missiles: [{ diceCount: 1, damage: 1 }],
      cannons: [{ diceCount: 1, damage: 1 }],
    });
    const enemyDef: EnemyDef = {
      id: 'test-target',
      name: 'Test target',
      blurb: '',
      groups: [{ label: 'enemy', count: 1, stats: blankStats({ hp: 10 }) }],
    };
    // Enemy has no weapons, so only the player's missile (1 roll) and cannon
    // (1 roll/round) dice ever fire; forcing misses runs it to the 30-round
    // stalemate: 1 missile roll + 30 cannon rolls = 31 total.
    const rng = fixedRng(Array(31).fill(valueFor(1)));
    const result = resolveCombat([playerStats], enemyDef, rng);

    const missileStarts = result.log.filter((e) => e.kind === 'phase-start' && e.phase === 'missile');
    expect(missileStarts).toHaveLength(1);

    const missileStartIndex = result.log.findIndex((e) => e.kind === 'phase-start' && e.phase === 'missile');
    const firstCannonStartIndex = result.log.findIndex((e) => e.kind === 'phase-start' && e.phase === 'cannon');
    expect(missileStartIndex).toBe(0);
    expect(firstCannonStartIndex).toBeGreaterThan(missileStartIndex);

    const missileRollIndices = result.log
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.kind === 'roll' && e.phase === 'missile')
      .map(({ i }) => i);
    for (const i of missileRollIndices) {
      expect(i).toBeLessThan(firstCannonStartIndex);
    }
  });
});

describe('resolveCombat — initiative', () => {
  it('destroys the lower-initiative side before it can fire', () => {
    const playerStats = blankStats({
      initiative: 5,
      hp: 10,
      missiles: [{ diceCount: 1, damage: 100 }],
    });
    const enemyDef: EnemyDef = {
      id: 'slow-swarm',
      name: 'Slow swarm',
      blurb: '',
      groups: [{ label: 'enemy', count: 1, stats: blankStats({ initiative: 0, hp: 1, missiles: [{ diceCount: 5, damage: 1 }] }) }],
    };
    // Only one roll should ever happen: the player's one-shot missile kill.
    const rng = fixedRng([valueFor(6)]);
    const result = resolveCombat([playerStats], enemyDef, rng);

    expect(result.winner).toBe('player');
    const enemyRolls = result.log.filter((e) => e.kind === 'roll' && e.side === 'enemy');
    expect(enemyRolls).toHaveLength(0);
  });

  it('player wins initiative ties and fires first', () => {
    const playerStats = blankStats({
      initiative: 0,
      hp: 10,
      missiles: [{ diceCount: 1, damage: 100 }],
    });
    const enemyDef: EnemyDef = {
      id: 'tied-target',
      name: 'Tied target',
      blurb: '',
      groups: [{ label: 'enemy', count: 1, stats: blankStats({ initiative: 0, hp: 1, missiles: [{ diceCount: 5, damage: 1 }] }) }],
    };
    const rng = fixedRng([valueFor(6)]);
    const result = resolveCombat([playerStats], enemyDef, rng);

    expect(result.winner).toBe('player');
    const enemyRolls = result.log.filter((e) => e.kind === 'roll' && e.side === 'enemy');
    expect(enemyRolls).toHaveLength(0);
  });

  it('interleaves a mixed fleet by per-ship initiative: fast player ship, enemy, slow player ship', () => {
    const fastShip = blankStats({ initiative: 4, hp: 5, cannons: [{ diceCount: 1, damage: 1 }] });
    const slowShip = blankStats({ initiative: 0, hp: 5, cannons: [{ diceCount: 1, damage: 1 }] });
    const enemyDef: EnemyDef = {
      id: 'mid-speed',
      name: 'Mid speed',
      blurb: '',
      groups: [{ label: 'enemy', count: 1, stats: blankStats({ initiative: 2, hp: 5, cannons: [{ diceCount: 1, damage: 1 }] }) }],
    };
    // Force all misses in cannon round 1 (raw 1 always misses), then look at
    // the order of the three rolls in that round.
    const rng = fixedRng(Array(3 * 31).fill(valueFor(1)));
    const result = resolveCombat([fastShip, slowShip], enemyDef, rng);

    const round1Rolls = result.log.filter((e) => e.kind === 'roll' && e.phase === 'cannon' && e.round === 1);
    expect(round1Rolls).toHaveLength(3);
    expect((round1Rolls[0] as { side: string; shooterIndex: number }).side).toBe('player');
    expect((round1Rolls[0] as { side: string; shooterIndex: number }).shooterIndex).toBe(0);
    expect((round1Rolls[1] as { side: string }).side).toBe('enemy');
    expect((round1Rolls[2] as { side: string; shooterIndex: number }).side).toBe('player');
    expect((round1Rolls[2] as { side: string; shooterIndex: number }).shooterIndex).toBe(1);
  });

  it('uses the targeted ship\'s own shield, not a side-wide value', () => {
    // Two player ships: the shielded one has lower HP, so the enemy's greedy
    // targeting will shoot at it — the roll must record shield 3.
    const shielded = blankStats({ hp: 1, shield: 3 });
    const unshielded = blankStats({ hp: 5, shield: 0 });
    const enemyDef: EnemyDef = {
      id: 'shooter',
      name: 'Shooter',
      blurb: '',
      groups: [{ label: 'enemy', count: 1, stats: blankStats({ initiative: 5, hp: 10, cannons: [{ diceCount: 1, damage: 1 }] }) }],
    };
    // Enemy fires first every round; player has no weapons. Rolls of 4:
    // 4 + 0 - 3 = 1 < 6 → miss against the shielded ship, forever, until
    // stalemate. Every roll should show shield 3.
    const rng = fixedRng(Array(30).fill(valueFor(4)));
    const result = resolveCombat([shielded, unshielded], enemyDef, rng);

    const rolls = result.log.filter((e) => e.kind === 'roll');
    expect(rolls.length).toBeGreaterThan(0);
    for (const roll of rolls) {
      expect((roll as { shield: number }).shield).toBe(3);
      expect((roll as { targetIndex: number }).targetIndex).toBe(0);
      expect((roll as { hit: boolean }).hit).toBe(false);
    }
  });
});

describe('resolveCombat — greedy targeting', () => {
  it('targets the lowest-remaining-HP ship first; overkill does not spill to the next target', () => {
    const playerStats = blankStats({
      initiative: 5,
      hp: 10,
      missiles: [{ diceCount: 1, damage: 2 }], // softens one enemy ship pre-round
      cannons: [{ diceCount: 2, damage: 2 }],
    });
    const enemyDef: EnemyDef = {
      id: 'pair',
      name: 'Pair',
      blurb: '',
      groups: [{ label: 'enemy', count: 2, stats: blankStats({ initiative: 0, hp: 3 }) }], // both start at 3 HP
    };
    // missile: 1 forced hit (softens ship0 to 1 remaining HP)
    // cannon round1 die1: forced hit (kills ship0, 1 dmg wasted)
    // cannon round1 die2: forced hit (hits ship1 for 2, remaining 1)
    // cannon round2 die1: forced hit (kills ship1)
    const rng = fixedRng([valueFor(6), valueFor(6), valueFor(6), valueFor(6)]);
    const result = resolveCombat([playerStats], enemyDef, rng);

    const round1Rolls = result.log.filter(
      (e) => e.kind === 'roll' && e.phase === 'cannon' && e.round === 1 && e.side === 'player',
    );
    expect(round1Rolls).toHaveLength(2);
    expect((round1Rolls[0] as { targetIndex: number }).targetIndex).toBe(0);
    expect((round1Rolls[1] as { targetIndex: number }).targetIndex).toBe(1);

    expect(result.winner).toBe('player');
  });
});

describe('resolveCombat — stalemate', () => {
  it('declares the enemy the winner after 30 cannon rounds with no weapons on either side', () => {
    const playerStats = blankStats({ hp: 10 });
    const enemyDef: EnemyDef = {
      id: 'unarmed',
      name: 'Unarmed',
      blurb: '',
      groups: [{ label: 'enemy', count: 1, stats: blankStats({ hp: 10 }) }],
    };
    // Neither side has any weapons, so zero dice are ever rolled.
    const rng = fixedRng([]);
    const result = resolveCombat([playerStats], enemyDef, rng);

    expect(result.winner).toBe('enemy');
    expect(result.log.some((e) => e.kind === 'stalemate')).toBe(true);
    const cannonStarts = result.log.filter((e) => e.kind === 'phase-start' && e.phase === 'cannon');
    expect(cannonStarts).toHaveLength(30);
  });
});

describe('resolveCombat — determinism', () => {
  it('produces an identical log for the same seed', () => {
    const fleet = [
      deriveStats('cruiser', ['ion', 'plasma', 'comp2', 'hull1', 'init1']),
      deriveStats('interceptor', ['ion', 'comp1']),
    ];
    const enemyDef = GAUNTLET[4]; // plasma tank

    const result1 = resolveCombat(fleet, enemyDef, mulberry32(12345));
    const result2 = resolveCombat(fleet, enemyDef, mulberry32(12345));

    expect(result1.winner).toBe(result2.winner);
    expect(JSON.stringify(result1.log)).toBe(JSON.stringify(result2.log));
  });
});
