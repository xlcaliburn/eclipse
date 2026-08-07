import { describe, expect, it } from 'vitest';
import {
  advanceRound,
  canUseActive,
  combatOutcome,
  hasMissilePhase,
  incomingFirePreview,
  initCombat,
  openingTargetIndex,
  OUTSPEED_GAP,
  outspeedingShipIndices,
  qualifiesForOutspeed,
  runToEnd,
  setPriorityTarget,
  useActive,
} from './combatEngine';
import type { EnemyDef, ShipStats } from './types';

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

// `count` is a shorthand for the common single-group case; pass `groups`
// directly in overrides for a real multi-group composition.
function enemy(
  overrides: Partial<EnemyDef> & { count?: number } = {},
  statsOverrides: Partial<ShipStats> = {},
): EnemyDef {
  const { count = 1, groups, ...rest } = overrides;
  return {
    id: 'test-enemy',
    name: 'Test enemy',
    blurb: '',
    groups: groups ?? [{ label: 'enemy', count, stats: blankStats(statsOverrides) }],
    ...rest,
  };
}

describe('initCombat — initial damage', () => {
  it('applies carried-in damage before the fight starts', () => {
    // A 4-HP ship entering with 3 damage dies to a single 1-damage hit.
    const fleet = [{ stats: blankStats({ hp: 4 }), initialDamage: 3 }];
    const foe = enemy({}, { initiative: 5, cannons: [{ diceCount: 1, damage: 1 }] });
    const state = runToEnd(initCombat(fleet, foe, 1));
    const outcome = combatOutcome(state);
    expect(outcome.playerShips[0].destroyed).toBe(true);
  });

  it('reports endDamage/destroyed matching the final log', () => {
    const fleet = [{ stats: blankStats({ hp: 10 }), initialDamage: 0 }];
    const foe = enemy({}, { initiative: 5, hp: 1, cannons: [{ diceCount: 1, damage: 3 }] });
    const state = runToEnd(initCombat(fleet, foe, 2));
    const outcome = combatOutcome(state);
    // Player has no weapons, so this either stalemates (player survives,
    // damage reflects hits taken) or the single enemy ship never dies.
    expect(outcome.playerShips).toHaveLength(1);
    expect(outcome.playerShips[0].endDamage).toBeGreaterThanOrEqual(0);
    expect(outcome.playerShips[0].destroyed).toBe(outcome.playerShips[0].endDamage >= 10);
  });
});

describe('stepping vs one-shot equivalence', () => {
  it('produces a bit-identical result whether stepped round-by-round or run to end', () => {
    const fleet = [
      { stats: blankStats({ hp: 6, computer: 1, cannons: [{ diceCount: 1, damage: 1 }] }), initialDamage: 0 },
      { stats: blankStats({ hp: 3, initiative: 2, cannons: [{ diceCount: 1, damage: 2 }] }), initialDamage: 1 },
    ];
    const foe = enemy(
      { count: 2 },
      { initiative: 1, hp: 3, computer: 1, cannons: [{ diceCount: 1, damage: 1 }] },
    );

    const seed = 42;
    const oneShot = runToEnd(initCombat(fleet, foe, seed));

    let stepped = initCombat(fleet, foe, seed);
    let guard = 0;
    while (!stepped.winner && guard < 100) {
      stepped = advanceRound(stepped);
      guard++;
    }

    expect(stepped.winner).toBe(oneShot.winner);
    expect(JSON.stringify(stepped.log)).toBe(JSON.stringify(oneShot.log));
  });
});

describe('active parts (iteration 7)', () => {
  // Iteration 41: redesigned from a round-modifier ("fire first this
  // round") to an immediate self-heal, same shape as dcbay at half the
  // repair.
  it('injector: repairs 1 damage on this ship, immediately', () => {
    const fleet = [
      { stats: blankStats({ hp: 5, actives: ['injector'] }), initialDamage: 2 },
    ];
    const foe = enemy({}, { hp: 5 });
    let state = initCombat(fleet, foe, 3);
    expect(state.playerShips[0].damage).toBe(2);
    state = useActive(state, 0, 0);
    expect(state.playerShips[0].damage).toBe(1);
  });

  it('uplink2: +2 computer for exactly one round', () => {
    const fleet = [{ stats: blankStats({ hp: 5, actives: ['uplink2'] }), initialDamage: 0 }];
    const foe = enemy({}, { hp: 5 });
    let state = initCombat(fleet, foe, 3);
    state = useActive(state, 0, 0);
    expect(state.roundModifiers.computerBonus).toBe(2);
    state = advanceRound(state);
    expect(state.roundModifiers.computerBonus).toBe(0);
  });

  it('modulator: +2 shield to all player ships for exactly one round', () => {
    const fleet = [{ stats: blankStats({ hp: 10, shield: 1, actives: ['modulator'] }), initialDamage: 0 }];
    const foe = enemy({}, { initiative: 5, computer: 0, hp: 5, cannons: [{ diceCount: 1, damage: 1 }] });
    let state = initCombat(fleet, foe, 1);
    state = advanceRound(state); // missile (no-op) — round modifiers reset here, so trigger the active AFTER
    state = useActive(state, 0, 0);
    state = advanceRound(state); // cannon round 1
    const roll = state.log.find((e) => e.kind === 'roll' && e.side === 'enemy') as { shield: number };
    expect(roll.shield).toBe(3); // 1 base + 2 modulator

    state = advanceRound(state); // cannon round 2 — modulator gone
    const roll2 = state.log.find(
      (e) => e.kind === 'roll' && e.phase === 'cannon' && e.round === 2 && e.side === 'enemy',
    ) as { shield: number } | undefined;
    expect(roll2?.shield).toBe(1);
  });

  it('dcbay: repairs 2 damage on this ship only, immediately', () => {
    const fleet = [
      { stats: blankStats({ hp: 10, actives: ['dcbay'] }), initialDamage: 5 },
      { stats: blankStats({ hp: 10 }), initialDamage: 5 },
    ];
    const foe = enemy({}, { hp: 5 });
    let state = initCombat(fleet, foe, 1);
    state = useActive(state, 0, 0);
    expect(state.playerShips[0].damage).toBe(3);
    expect(state.playerShips[1].damage).toBe(5); // untouched
  });

  it('override: rerolls each missed die once for the ship that used it', () => {
    const fleet = [
      {
        stats: blankStats({
          initiative: 5,
          computer: 0,
          hp: 20,
          cannons: [{ diceCount: 1, damage: 1 }],
          actives: ['override'],
        }),
        initialDamage: 0,
      },
    ];
    const foe = enemy({}, { hp: 20, shield: 6 }); // 6+0-6=0 < 6 — every unmodified roll misses
    let state = initCombat(fleet, foe, 1);
    state = advanceRound(state); // missile (no-op) — round modifiers reset here, so trigger the active AFTER
    state = useActive(state, 0, 0);
    state = advanceRound(state); // cannon round 1
    const rerollLines = state.log.filter((e) => e.kind === 'part-effect' && e.text.includes('Fire-control override'));
    expect(rerollLines.length).toBeGreaterThan(0);
  });

  it('thrusters: the evading ship cannot be targeted and does not fire; the barrage finds nothing', () => {
    const fleet = [
      {
        stats: blankStats({
          initiative: 5,
          hp: 5,
          cannons: [{ diceCount: 1, damage: 5 }],
          actives: ['thrusters'],
        }),
        initialDamage: 0,
      },
    ];
    const foe = enemy({}, { initiative: 10, hp: 5, cannons: [{ diceCount: 1, damage: 1 }] });
    let state = initCombat(fleet, foe, 1);
    state = advanceRound(state); // missile (no-op) — round modifiers reset here, so trigger the active AFTER
    state = useActive(state, 0, 0);
    state = advanceRound(state); // cannon round 1 — the evader's only foe is evading too
    const anyRolls = state.log.filter((e) => e.kind === 'roll');
    expect(anyRolls).toHaveLength(0);
    expect(state.playerShips[0].damage).toBe(0);
  });

  it('actives are once-per-combat, and the spent state resets in a fresh combat', () => {
    const fleet = [{ stats: blankStats({ hp: 10, actives: ['dcbay'] }), initialDamage: 4 }];
    const foe = enemy({}, { hp: 5 });
    let state = initCombat(fleet, foe, 1);
    expect(canUseActive(state, 0, 0)).toBe(true);
    state = useActive(state, 0, 0);
    expect(state.playerShips[0].damage).toBe(2);
    expect(canUseActive(state, 0, 0)).toBe(false);

    const again = useActive(state, 0, 0); // no-op — already used
    expect(again.playerShips[0].damage).toBe(2);

    const fresh = initCombat(fleet, foe, 1);
    expect(canUseActive(fresh, 0, 0)).toBe(true); // doesn't persist between fights
  });
});

describe('support hulls (iteration 23)', () => {
  it('tacrelay: +1 computer and +1 initiative for the whole fleet, for exactly one round', () => {
    const fleet = [{ stats: blankStats({ hp: 5, actives: ['tacrelay'] }), initialDamage: 0 }];
    const foe = enemy({}, { hp: 5 });
    let state = initCombat(fleet, foe, 3);
    state = useActive(state, 0, 0);
    expect(state.roundModifiers.computerBonus).toBe(1);
    expect(state.roundModifiers.initiativeBonus).toBe(1);
    state = advanceRound(state);
    expect(state.roundModifiers.computerBonus).toBe(0);
    expect(state.roundModifiers.initiativeBonus).toBe(0);
  });

  it('repairbay: repairs 3 damage on the fleet\'s most-damaged ship BY PERCENTAGE, not this ship', () => {
    const fleet = [
      { stats: blankStats({ hp: 10, actives: ['repairbay'] }), initialDamage: 2 }, // 80% remaining
      { stats: blankStats({ hp: 10 }), initialDamage: 8 }, // 20% remaining — worse off
    ];
    const foe = enemy({}, { hp: 5 });
    let state = initCombat(fleet, foe, 1);
    state = useActive(state, 0, 0);
    expect(state.playerShips[0].damage).toBe(2); // untouched — it wasn't the worst off
    expect(state.playerShips[1].damage).toBe(5); // 8 - 3
  });

  it('repairbay: heals itself when it IS the most-damaged ship', () => {
    const fleet = [
      { stats: blankStats({ hp: 10, actives: ['repairbay'] }), initialDamage: 9 }, // 10% remaining — worst
      { stats: blankStats({ hp: 10 }), initialDamage: 1 }, // 90% remaining
    ];
    const foe = enemy({}, { hp: 5 });
    let state = initCombat(fleet, foe, 1);
    state = useActive(state, 0, 0);
    expect(state.playerShips[0].damage).toBe(6); // 9 - 3
    expect(state.playerShips[1].damage).toBe(1); // untouched
  });

  it('ecm: enemy computer -2 for exactly one round, player computer untouched', () => {
    const fleet = [{ stats: blankStats({ hp: 5, computer: 3, actives: ['ecm'] }), initialDamage: 0 }];
    const foe = enemy({}, { initiative: 5, computer: 3, hp: 5, cannons: [{ diceCount: 1, damage: 1 }] });
    let state = initCombat(fleet, foe, 1);
    state = advanceRound(state); // missile (no-op) — round modifiers reset here, so trigger the active AFTER
    state = useActive(state, 0, 0);
    expect(state.roundModifiers.enemyComputerPenalty).toBe(2);
    state = advanceRound(state); // cannon round 1
    const enemyRoll = state.log.find((e) => e.kind === 'roll' && e.side === 'enemy') as { computer: number };
    expect(enemyRoll.computer).toBe(1); // 3 - 2

    state = advanceRound(state); // cannon round 2 — ecm gone
    const enemyRoll2 = state.log.find(
      (e) => e.kind === 'roll' && e.phase === 'cannon' && e.round === 2 && e.side === 'enemy',
    ) as { computer: number } | undefined;
    expect(enemyRoll2?.computer).toBe(3);
  });

  // 2026-08-07: reworked from an enemy-piloting-debuff round modifier into
  // Evasion suite, a permanent self-buff — no longer touches
  // roundModifiers at all, and (unlike every other active) does NOT reset
  // at the next round.
  it('disruptor (Evasion suite): +3 piloting on this ship, permanently for the fight — not a round modifier', () => {
    const fleet = [
      { stats: blankStats({ hp: 10, cannons: [{ diceCount: 1, damage: 1 }], actives: ['disruptor'] }), initialDamage: 0 },
    ];
    const foe = enemy({}, { hp: 10 });
    let state = initCombat(fleet, foe, 1);
    expect(state.playerShips[0].stats.shield).toBe(0);
    state = useActive(state, 0, 0);
    expect(state.playerShips[0].stats.shield).toBe(3);

    // Persists across rounds — unlike a round modifier, nothing resets it.
    state = advanceRound(state); // missile
    state = advanceRound(state); // cannon round 1
    expect(state.playerShips[0].stats.shield).toBe(3);
  });
});

describe('hasMissilePhase', () => {
  it('is false when neither fleet has a missile weapon', () => {
    const fleet = [{ stats: blankStats({ cannons: [{ diceCount: 1, damage: 1 }] }), initialDamage: 0 }];
    const foe = enemy({}, { cannons: [{ diceCount: 1, damage: 1 }] });
    expect(hasMissilePhase(initCombat(fleet, foe, 1))).toBe(false);
  });

  it('is true when either fleet has a missile weapon', () => {
    const fleet = [{ stats: blankStats({ missiles: [{ diceCount: 1, damage: 1 }] }), initialDamage: 0 }];
    const foe = enemy({}, {});
    expect(hasMissilePhase(initCombat(fleet, foe, 1))).toBe(true);
  });
});

describe('exotic weapons (iteration 5)', () => {
  it('antimatter (a 4-damage die): kills a 1-HP ship with overkill wasted, no carryover', () => {
    const fleet = [
      {
        stats: blankStats({ initiative: 5, computer: 10, hp: 10, cannons: [{ diceCount: 1, damage: 4 }] }),
        initialDamage: 0,
      },
    ];
    const foe = enemy({ count: 2 }, { hp: 1 });
    const state = runToEnd(initCombat(fleet, foe, 21));
    expect(state.winner).toBe('player');
    // Both 1-HP ships die to a single 4-damage hit each; neither ever needed
    // a second die's damage to carry over.
    expect(state.enemyShips.every((s) => s.damage <= 4)).toBe(true);
  });

  it('rift: a natural 1 backfires on the shooter, ignores shields, does not touch the target', () => {
    // High computer vs a heavily shielded target makes every non-1 roll a
    // near-certain miss too (raw + 10 - 20 is always < 6 unless raw==6,
    // which auto-hits) — but we only care about isolating what happens on
    // raw===1, so loop until a backfire fires and inspect that round.
    const fleet = [
      {
        stats: blankStats({ initiative: 5, hp: 20, cannons: [{ diceCount: 1, damage: 3, selfDamageOnNatOne: 1 }] }),
        initialDamage: 0,
      },
    ];
    const foe = enemy({}, { hp: 20, shield: 20 });

    let state = initCombat(fleet, foe, 1);
    let backfired = false;
    let guard = 0;
    let damageBefore = 0;
    while (!backfired && guard < 60) {
      damageBefore = state.playerShips[0].damage;
      state = advanceRound(state);
      backfired = state.log.some((e) => e.kind === 'part-effect' && e.text.includes('backfires'));
      guard++;
    }

    expect(backfired).toBe(true);
    expect(state.playerShips[0].damage).toBe(damageBefore + 1);
    expect(state.enemyShips[0].damage).toBe(0); // shields (20) would block a real hit anyway, but confirms no damage landed
  });

  it('rift: a self-destroying shot loses its remaining dice this activation', () => {
    // hp 1 means ANY backfire destroys the shooter; 2 dice per activation
    // means the 2nd die must never fire once the 1st kills it.
    const fleet = [
      {
        stats: blankStats({
          initiative: 5,
          hp: 1,
          cannons: [{ diceCount: 2, damage: 3, selfDamageOnNatOne: 1 }],
        }),
        initialDamage: 0,
      },
    ];
    const foe = enemy({}, { hp: 20, shield: 20 });

    let state = initCombat(fleet, foe, 1);
    let guard = 0;
    while (!state.winner && guard < 60) {
      state = advanceRound(state);
      guard++;
    }

    expect(state.winner).toBe('enemy'); // the player's only ship suicided
    const destroyedEvent = state.log.find((e) => e.kind === 'destroyed' && e.side === 'player');
    expect(destroyedEvent).toBeDefined();
    // Find the round where it died. The fatal die could be either die 1 or
    // die 2 of that activation (whichever rolls the nat 1 first) — either
    // way, the backfire roll must be the LAST player roll logged before
    // death, proving no die after it ever fired.
    const destroyIndex = state.log.indexOf(destroyedEvent!);
    const roundStartIndex = [...state.log.slice(0, destroyIndex)]
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.kind === 'phase-start')
      .pop()!.i;
    const rollsThisRound = state.log
      .slice(roundStartIndex, destroyIndex)
      .filter((e) => e.kind === 'roll' && e.side === 'player');
    expect(rollsThisRound.length).toBeGreaterThan(0);
    expect(rollsThisRound.length).toBeLessThanOrEqual(2); // never more than the ship's 2 dice
    expect((rollsThisRound[rollsThisRound.length - 1] as { raw: number }).raw).toBe(1); // backfire is always last
  });

  it('flak: N batteries cancel exactly N enemy missile dice before they are rolled', () => {
    const fleet = [{ stats: blankStats({ hp: 10, flak: 2 }), initialDamage: 0 }];
    const foe = enemy({}, { initiative: 5, hp: 5, missiles: [{ diceCount: 5, damage: 1 }] });
    let state = initCombat(fleet, foe, 1);
    state = advanceRound(state); // missile phase

    const cancellations = state.log.filter((e) => e.kind === 'part-effect' && e.text.includes('Flak'));
    const enemyMissileRolls = state.log.filter((e) => e.kind === 'roll' && e.phase === 'missile' && e.side === 'enemy');
    expect(cancellations).toHaveLength(2);
    expect(enemyMissileRolls).toHaveLength(3); // 5 dice - 2 cancelled
  });

  it("flak: a dead ship's batteries count for nothing", () => {
    // initialDamage >= hp means this ship starts destroyed; its flak: 2
    // must not cancel anything.
    const fleet = [{ stats: blankStats({ hp: 2, flak: 2 }), initialDamage: 2 }];
    const foe = enemy({}, { initiative: 5, hp: 5, missiles: [{ diceCount: 3, damage: 1 }] });
    let state = initCombat(fleet, foe, 1);
    state = advanceRound(state);

    const cancellations = state.log.filter((e) => e.kind === 'part-effect' && e.text.includes('Flak'));
    expect(cancellations).toHaveLength(0);
  });
});

describe('taunt (iteration 5)', () => {
  it('all enemy dice target the taunter while it is alive, ignoring lower-HP non-taunters', () => {
    const fleet = [
      { stats: blankStats({ hp: 20, taunt: true }), initialDamage: 0 }, // taunter, tough
      { stats: blankStats({ hp: 1 }), initialDamage: 0 }, // fragile, would normally be hit first
    ];
    const foe = enemy({}, { initiative: 5, hp: 5, cannons: [{ diceCount: 3, damage: 1 }] });
    let state = initCombat(fleet, foe, 1);
    state = advanceRound(state); // missile phase (no-op)
    state = advanceRound(state); // cannon round 1

    const enemyRolls = state.log.filter((e) => e.kind === 'roll' && e.side === 'enemy');
    expect(enemyRolls.length).toBeGreaterThan(0);
    expect(enemyRolls.every((e) => (e as { targetIndex: number }).targetIndex === 0)).toBe(true);
    expect(state.playerShips[1].damage).toBe(0); // never touched
  });

  it('when the taunter dies mid-activation, remaining dice revert to greedy targeting', () => {
    const fleet = [
      { stats: blankStats({ hp: 1, taunt: true }), initialDamage: 0 }, // taunter, dies to first hit
      { stats: blankStats({ hp: 5 }), initialDamage: 0 },
    ];
    // initiative 3, not more: under the iteration-17 Outspeed gap (4), so
    // this stays a plain "enemy acts first" setup rather than also granting
    // a same-round bonus activation that would add extra roll events.
    const foe = enemy({}, { initiative: 3, hp: 5, computer: 10, cannons: [{ diceCount: 2, damage: 1 }] });
    let state = initCombat(fleet, foe, 1);
    state = advanceRound(state); // missile
    state = advanceRound(state); // cannon round 1

    const enemyRolls = state.log.filter((e) => e.kind === 'roll' && e.side === 'enemy' && e.phase === 'cannon');
    expect(enemyRolls).toHaveLength(2);
    expect((enemyRolls[0] as { targetIndex: number }).targetIndex).toBe(0); // taunter, dies
    expect((enemyRolls[1] as { targetIndex: number }).targetIndex).toBe(1); // reverted to the only ship left
  });
});

describe('reactive armor (iteration 5)', () => {
  it('negates the first hit per round; a second hit in the same round lands normally', () => {
    const fleet = [{ stats: blankStats({ hp: 10, reactiveArmor: 1 }), initialDamage: 0 }];
    // Two enemy ships, each with 1 die — both activate within the same
    // cannon round, giving exactly 2 hit attempts in round 1. initiative 3
    // (under the iteration-17 Outspeed gap of 4) so the enemy doesn't also
    // earn a same-round bonus activation on top of its two normal dice.
    const foe = enemy({ count: 2 }, { initiative: 3, computer: 10, hp: 5, cannons: [{ diceCount: 1, damage: 2 }] });
    let state = initCombat(fleet, foe, 2); // seed chosen so both enemy dice land (comp 10 can still miss on a nat 1)
    state = advanceRound(state); // missile
    state = advanceRound(state); // cannon round 1

    const negations = state.log.filter((e) => e.kind === 'part-effect' && e.text.includes('Reactive armor'));
    expect(negations).toHaveLength(1);
    expect(state.playerShips[0].damage).toBe(2); // only the second hit landed
  });

  it('stacks: N armors negate the first N hits per round', () => {
    const fleet = [{ stats: blankStats({ hp: 10, reactiveArmor: 2 }), initialDamage: 0 }];
    // initiative 3 — see the note in the test above.
    const foe = enemy({ count: 3 }, { initiative: 3, computer: 10, hp: 5, cannons: [{ diceCount: 1, damage: 2 }] });
    let state = initCombat(fleet, foe, 2);
    state = advanceRound(state);
    state = advanceRound(state);

    const negations = state.log.filter((e) => e.kind === 'part-effect' && e.text.includes('Reactive armor'));
    expect(negations).toHaveLength(2);
    expect(state.playerShips[0].damage).toBe(2); // only the 3rd hit landed
  });

  it('does NOT replenish each round — it is a one-time pool for the whole combat', () => {
    const fleet = [{ stats: blankStats({ hp: 10, reactiveArmor: 1 }), initialDamage: 0 }];
    const foe = enemy({}, { initiative: 5, computer: 10, hp: 5, cannons: [{ diceCount: 1, damage: 2 }] });
    let state = initCombat(fleet, foe, 2);
    state = advanceRound(state); // missile
    state = advanceRound(state); // cannon round 1 — negated (pool spent)
    state = advanceRound(state); // cannon round 2 — no charge left, this hit lands

    expect(state.playerShips[0].damage).toBeGreaterThan(0);
    const negations = state.log.filter((e) => e.kind === 'part-effect' && e.text.includes('Reactive armor'));
    expect(negations).toHaveLength(1);
  });

  it('does not trigger on rift self-damage', () => {
    const fleet = [
      {
        stats: blankStats({
          initiative: 5,
          hp: 20,
          reactiveArmor: 5,
          cannons: [{ diceCount: 1, damage: 3, selfDamageOnNatOne: 1 }],
        }),
        initialDamage: 0,
      },
    ];
    const foe = enemy({}, { hp: 20, shield: 20 });
    let state = initCombat(fleet, foe, 1);
    let backfired = false;
    let guard = 0;
    while (!backfired && guard < 60) {
      state = advanceRound(state);
      backfired = state.log.some((e) => e.kind === 'part-effect' && e.text.includes('backfires'));
      guard++;
    }
    expect(backfired).toBe(true);
    expect(state.playerShips[0].damage).toBeGreaterThan(0); // reactive armor did NOT block it
  });
});

describe('passive arsenal (iteration 7)', () => {
  it('lance: per-die shield pierce reduces effective shield, stacks with ship-level pierce, floors at 0', () => {
    const fleet = [
      {
        stats: blankStats({
          initiative: 5,
          computer: 0,
          hp: 10,
          shieldPierce: 1,
          cannons: [{ diceCount: 1, damage: 2, shieldPierce: 2 }],
        }),
        initialDamage: 0,
      },
    ];
    const foe = enemy({}, { hp: 10, shield: 1 }); // 1 - 1(ship pierce) - 2(weapon pierce) would go negative -> floors at 0
    let state = initCombat(fleet, foe, 5);
    state = advanceRound(state); // missile (no-op)
    state = advanceRound(state); // cannon round 1
    const roll = state.log.find((e) => e.kind === 'roll' && e.side === 'player') as { shield: number };
    expect(roll.shield).toBe(0);
  });

  it('arc projector: one hit blasts every alive enemy ship for the AoE amount', () => {
    const fleet = [
      {
        stats: blankStats({ initiative: 5, computer: 10, hp: 10, cannons: [{ diceCount: 1, damage: 0, aoeDamage: 1 }] }),
        initialDamage: 0,
      },
    ];
    const foe = enemy({ count: 3 }, { hp: 1 });
    const state = runToEnd(initCombat(fleet, foe, 1));
    expect(state.winner).toBe('player'); // all three 1-HP enemies die together off one AoE hit
    expect(state.log.some((e) => e.kind === 'part-effect' && e.text.includes('Arc projector'))).toBe(true);
  });

  it('arc projector: on a miss, nothing takes damage', () => {
    const fleet = [
      {
        stats: blankStats({ initiative: 5, computer: 0, hp: 10, cannons: [{ diceCount: 1, damage: 0, aoeDamage: 5 }] }),
        initialDamage: 0,
      },
    ];
    // computer 0 vs shield 5: raw + 0 - 5 >= 6 requires raw >= 11 — impossible, always misses.
    const foe = enemy({ count: 2 }, { hp: 100, shield: 5 });
    let state = initCombat(fleet, foe, 1);
    state = advanceRound(state); // missile (no-op)
    state = advanceRound(state); // cannon round 1
    expect(state.enemyShips.every((e) => e.damage === 0)).toBe(true);
  });

  it('siege cannon: its die targets the highest-remaining-HP enemy, opposite of greedy', () => {
    const fleet = [
      {
        stats: blankStats({
          initiative: 5,
          computer: 10,
          hp: 10,
          cannons: [{ diceCount: 1, damage: 3, targetHighest: true }],
        }),
        initialDamage: 0,
      },
    ];
    const foe = enemy({ count: 2 }, { hp: 10 });
    let state = initCombat(fleet, foe, 1);
    state = advanceRound(state); // missile (no-op)
    // Force an HP asymmetry: enemy #0 nearly dead, enemy #1 at full HP.
    state = { ...state, enemyShips: state.enemyShips.map((s, i) => (i === 0 ? { ...s, damage: 8 } : s)) };

    let found = false;
    let guard = 0;
    while (!found && guard < 30 && !state.winner) {
      const logLengthBefore = state.log.length;
      state = advanceRound(state);
      const newHits = state.log
        .slice(logLengthBefore)
        .filter((e) => e.kind === 'roll' && e.side === 'player' && e.hit) as { targetIndex: number }[];
      if (newHits.length > 0) {
        expect(newHits[0].targetIndex).toBe(1); // the full-HP enemy, not the greedy-lowest
        found = true;
      }
      guard++;
    }
    expect(found).toBe(true);
  });

  it('ramming prow: triggers when the ship is destroyed by enemy fire, dealing damage to the enemy', () => {
    const fleet = [{ stats: blankStats({ hp: 1, onDestroyDamage: 3 }), initialDamage: 0 }];
    const foe = enemy({}, { initiative: 5, computer: 10, hp: 20, cannons: [{ diceCount: 1, damage: 5 }] });
    let state = initCombat(fleet, foe, 1);
    let destroyed = false;
    let guard = 0;
    while (!destroyed && guard < 30) {
      state = advanceRound(state);
      destroyed = state.log.some((e) => e.kind === 'destroyed' && e.side === 'player');
      guard++;
    }
    expect(destroyed).toBe(true);
    expect(state.enemyShips[0].damage).toBeGreaterThanOrEqual(3);
    expect(state.log.some((e) => e.kind === 'part-effect' && e.text.includes('Ramming prow'))).toBe(true);
  });

  it('ramming prow: also triggers when the ship destroys itself via a rift-cannon backfire', () => {
    const fleet = [
      {
        stats: blankStats({
          initiative: 5,
          hp: 1,
          onDestroyDamage: 3,
          cannons: [{ diceCount: 1, damage: 3, selfDamageOnNatOne: 5 }],
        }),
        initialDamage: 0,
      },
    ];
    const foe = enemy({}, { hp: 20, shield: 20 });
    let state = initCombat(fleet, foe, 1);
    let playerDestroyed = false;
    let guard = 0;
    while (!playerDestroyed && guard < 60) {
      state = advanceRound(state);
      playerDestroyed = state.log.some((e) => e.kind === 'destroyed' && e.side === 'player');
      guard++;
    }
    expect(playerDestroyed).toBe(true);
    expect(state.enemyShips[0].damage).toBeGreaterThanOrEqual(3);
  });

  it('ablative coating: absorbs damage before real HP and does not persist between fights', () => {
    const fleet = [{ stats: blankStats({ hp: 10, ablative: 2 }), initialDamage: 0 }];
    const foe = enemy({}, { initiative: 5, computer: 10, hp: 20, cannons: [{ diceCount: 1, damage: 2 }] });
    let state = initCombat(fleet, foe, 1);
    let hit = false;
    let guard = 0;
    while (!hit && guard < 30) {
      state = advanceRound(state);
      hit = state.log.some((e) => e.kind === 'roll' && e.side === 'enemy' && e.hit);
      guard++;
    }
    expect(hit).toBe(true);
    expect(state.playerShips[0].damage).toBe(0); // the 2-dmg hit was fully absorbed by the 2-point pool
    expect(state.playerShips[0].ablativeRemaining).toBe(0);
    expect(state.log.some((e) => e.kind === 'part-effect' && e.text.includes('Ablative coating absorbs'))).toBe(true);

    const fresh = initCombat(fleet, foe, 1);
    expect(fresh.playerShips[0].ablativeRemaining).toBe(2); // refreshed, not carried over
  });

  it('ablative coating stacks — two parts sum to 4 temporary HP', () => {
    const fleet = [{ stats: blankStats({ hp: 10, ablative: 4 }), initialDamage: 0 }];
    const state = initCombat(fleet, enemy(), 1);
    expect(state.playerShips[0].ablativeRemaining).toBe(4);
  });

  it('shield capacitor: bonus shield applies in the missile phase and cannon round 1, gone by round 2', () => {
    const fleet = [{ stats: blankStats({ hp: 10, shield: 1, capacitorShield: 2 }), initialDamage: 0 }];
    const foe = enemy(
      {},
      { initiative: 5, computer: 0, hp: 5, missiles: [{ diceCount: 1, damage: 1 }], cannons: [{ diceCount: 1, damage: 1 }] },
    );
    let state = initCombat(fleet, foe, 1);
    state = advanceRound(state); // missile phase
    const missileRoll = state.log.find((e) => e.kind === 'roll' && e.phase === 'missile' && e.side === 'enemy') as {
      shield: number;
    };
    expect(missileRoll.shield).toBe(3); // 1 base + 2 capacitor

    state = advanceRound(state); // cannon round 1
    const round1Roll = state.log.find(
      (e) => e.kind === 'roll' && e.phase === 'cannon' && e.round === 1 && e.side === 'enemy',
    ) as { shield: number };
    expect(round1Roll.shield).toBe(3); // still active

    state = advanceRound(state); // cannon round 2
    const round2Roll = state.log.find(
      (e) => e.kind === 'roll' && e.phase === 'cannon' && e.round === 2 && e.side === 'enemy',
    ) as { shield: number } | undefined;
    expect(round2Roll?.shield).toBe(1); // capacitor gone
  });

  it('cloak: a cloaked ship is never targeted while a non-cloaked ally is alive', () => {
    const fleet = [
      { stats: blankStats({ hp: 5, cloak: true }), initialDamage: 0 },
      { stats: blankStats({ hp: 20 }), initialDamage: 0 }, // high HP: must survive the whole test window
    ];
    const foe = enemy({}, { initiative: 5, computer: 10, hp: 20, cannons: [{ diceCount: 1, damage: 1 }] });
    let state = initCombat(fleet, foe, 1);
    for (let i = 0; i < 10 && !state.winner; i++) state = advanceRound(state);
    const enemyHits = state.log.filter((e) => e.kind === 'roll' && e.side === 'enemy') as { targetIndex: number }[];
    expect(enemyHits.length).toBeGreaterThan(0);
    expect(enemyHits.every((e) => e.targetIndex === 1)).toBe(true);
  });

  it('cloak: the all-cloaked exception makes cloaked ships targetable when no one else is left', () => {
    const fleet = [
      { stats: blankStats({ hp: 5, cloak: true }), initialDamage: 0 },
      { stats: blankStats({ hp: 1, cloak: true }), initialDamage: 0 },
    ];
    const foe = enemy({}, { initiative: 5, computer: 10, hp: 20, cannons: [{ diceCount: 1, damage: 5 }] });
    const state = runToEnd(initCombat(fleet, foe, 1));
    expect(state.winner).toBe('enemy'); // both cloaked ships still die — cloak never stalls the fight
  });

  it('cloak: taunt overrides cloak on the same ship — a cloaked taunter is still targeted', () => {
    const fleet = [
      { stats: blankStats({ hp: 20, cloak: true, taunt: true }), initialDamage: 0 }, // high HP: must survive the taunter role
      { stats: blankStats({ hp: 5 }), initialDamage: 0 },
    ];
    const foe = enemy({}, { initiative: 5, computer: 10, hp: 20, cannons: [{ diceCount: 1, damage: 1 }] });
    let state = initCombat(fleet, foe, 1);
    for (let i = 0; i < 10 && !state.winner; i++) state = advanceRound(state);
    const enemyHits = state.log.filter((e) => e.kind === 'roll' && e.side === 'enemy') as { targetIndex: number }[];
    expect(enemyHits.length).toBeGreaterThan(0);
    expect(enemyHits.every((e) => e.targetIndex === 0)).toBe(true);
  });
});

describe('enemy-side flak, lance, and rift (iteration 8: act-2 roster tech, symmetric with the player kit)', () => {
  it('enemy flak cancels player missile dice, symmetric with the player\'s own flak', () => {
    const fleet = [{ stats: blankStats({ hp: 10, missiles: [{ diceCount: 5, damage: 1 }] }), initialDamage: 0 }];
    const foe = enemy({}, { initiative: 5, hp: 10, flak: 2 });
    let state = initCombat(fleet, foe, 1);
    state = advanceRound(state); // missile phase

    const cancellations = state.log.filter((e) => e.kind === 'part-effect' && e.text.includes('Enemy flak'));
    const playerMissileRolls = state.log.filter((e) => e.kind === 'roll' && e.phase === 'missile' && e.side === 'player');
    expect(cancellations).toHaveLength(2);
    expect(playerMissileRolls).toHaveLength(3); // 5 dice - 2 cancelled
  });

  it('enemy lance pierce reduces the player\'s effective shield', () => {
    const fleet = [{ stats: blankStats({ hp: 20, shield: 3 }), initialDamage: 0 }];
    const foe = enemy({}, { initiative: 5, computer: 0, hp: 5, cannons: [{ diceCount: 1, damage: 2, shieldPierce: 2 }] });
    let state = initCombat(fleet, foe, 1);
    state = advanceRound(state); // missile (no-op)
    state = advanceRound(state); // cannon round 1

    const roll = state.log.find((e) => e.kind === 'roll' && e.side === 'enemy') as { shield: number };
    expect(roll.shield).toBe(1); // 3 base shield - 2 pierce
  });

  it('an enemy rift cannon self-hit on a natural 1 can destroy its own ship', () => {
    const fleet = [{ stats: blankStats({ hp: 20, shield: 20 }), initialDamage: 0 }]; // unhittable — isolates the self-hit
    const foe = enemy(
      {},
      { initiative: 5, hp: 1, cannons: [{ diceCount: 1, damage: 3, selfDamageOnNatOne: 1 }] },
    );
    let state = initCombat(fleet, foe, 1);
    let guard = 0;
    while (!state.winner && guard < 60) {
      state = advanceRound(state);
      guard++;
    }
    const backfires = state.log.filter((e) => e.kind === 'part-effect' && e.text.includes('backfires'));
    expect(backfires.length).toBeGreaterThan(0);
    expect(state.winner).toBe('player'); // the enemy's only ship killed itself
  });
});

describe('Jink (iteration 8, addendum A.1: innate to the Interceptor frame)', () => {
  it('the first hit against a jink-enabled ship misses instead, once per combat', () => {
    const fleet = [{ stats: blankStats({ hp: 20, jink: true }), initialDamage: 0 }];
    // initiative 3 (under the iteration-17 Outspeed gap of 4) — the enemy
    // just needs to act before the player, not also earn a bonus activation.
    const foe = enemy({ count: 2 }, { initiative: 3, computer: 10, hp: 5, cannons: [{ diceCount: 1, damage: 5 }] });
    let state = initCombat(fleet, foe, 2); // seed chosen so both enemy dice land
    state = advanceRound(state); // missile
    state = advanceRound(state); // cannon round 1 — 2 hit attempts this round

    const jinks = state.log.filter((e) => e.kind === 'part-effect' && e.text.includes('jinks'));
    expect(jinks).toHaveLength(1);
    expect(state.playerShips[0].damage).toBe(5); // only the second hit landed
  });

  it('is consumed before reactive armor gets a chance', () => {
    const fleet = [{ stats: blankStats({ hp: 20, jink: true, reactiveArmor: 1 }), initialDamage: 0 }];
    // initiative 3 — see the note in the test above.
    const foe = enemy({ count: 2 }, { initiative: 3, computer: 10, hp: 5, cannons: [{ diceCount: 1, damage: 5 }] });
    let state = initCombat(fleet, foe, 2);
    state = advanceRound(state); // missile
    state = advanceRound(state); // cannon round 1 — 2 hit attempts: jink eats #1, reactive armor eats #2

    expect(state.log.some((e) => e.kind === 'part-effect' && e.text.includes('jinks'))).toBe(true);
    expect(state.log.some((e) => e.kind === 'part-effect' && e.text.includes('Reactive armor'))).toBe(true);
    expect(state.playerShips[0].damage).toBe(0); // both hits negated, by two different defenses
  });

  it('is not spent by shots that were going to miss anyway', () => {
    // Against shield 6 with computer 0, only a natural 6 can land. So the
    // dodge must fire if and only if a natural 6 was rolled — never on the
    // ordinary misses in between. (A jinked shot logs as a miss, so the raw
    // die is what distinguishes "would have hit" from "missed".)
    const fleet = [{ stats: blankStats({ hp: 20, jink: true, shield: 6 }), initialDamage: 0 }];
    const foe = enemy({ count: 3 }, { initiative: 5, computer: 0, hp: 5, cannons: [{ diceCount: 2, damage: 5 }] });
    let state = initCombat(fleet, foe, 11);
    state = advanceRound(state); // missile
    state = advanceRound(state); // cannon round 1
    state = advanceRound(state); // cannon round 2

    const enemyRolls = state.log.filter((e) => e.kind === 'roll' && e.side === 'enemy');
    expect(enemyRolls.length).toBeGreaterThan(4); // they really did shoot, a lot
    const anyWouldHaveLanded = enemyRolls.some((e) => e.kind === 'roll' && e.raw === 6);
    const jinked = state.log.some((e) => e.kind === 'part-effect' && e.text.includes('jinks'));

    expect(jinked).toBe(anyWouldHaveLanded);
    expect(state.playerShips[0].jinkAvailable).toBe(!anyWouldHaveLanded);
  });

  it('survives a shield-blocked shot and still fires on the first shot that beats the shield', () => {
    // Shields are applied before the dodge is considered, so a shot stopped
    // by armor is a miss for jink's purposes, not a trigger.
    const fleet = [{ stats: blankStats({ hp: 20, jink: true, shield: 2 }), initialDamage: 0 }];
    const foe = enemy({ count: 2 }, { initiative: 5, computer: 10, hp: 5, cannons: [{ diceCount: 1, damage: 5 }] });
    let state = initCombat(fleet, foe, 2);
    state = advanceRound(state);
    state = advanceRound(state);

    const jinks = state.log.filter((e) => e.kind === 'part-effect' && e.text.includes('jinks'));
    expect(jinks).toHaveLength(1); // spent exactly once, on a shot that would have landed
  });

  it('does not replenish between fights it was not consumed in, but does reset in a fresh combat', () => {
    const fleet = [{ stats: blankStats({ hp: 20, jink: true }), initialDamage: 0 }];
    const foe = enemy({}, { initiative: 5, computer: 10, hp: 5, cannons: [{ diceCount: 1, damage: 5 }] });
    let state = initCombat(fleet, foe, 2);
    expect(state.playerShips[0].jinkAvailable).toBe(true);
    state = advanceRound(state);
    state = advanceRound(state);
    expect(state.playerShips[0].jinkAvailable).toBe(false); // spent this combat

    const fresh = initCombat(fleet, foe, 2);
    expect(fresh.playerShips[0].jinkAvailable).toBe(true); // fresh fight, fresh charge
  });
});

describe('Chaff launcher active (iteration 8, addendum A.3)', () => {
  it('while armed, a natural 6 against this ship is no longer an automatic hit', () => {
    // Shield 6 vs. computer 0 means only a natural 6 could ever hit under
    // normal rules; with chaff active, 6 + 0 - 6 = 0 < 6, so it now misses.
    const fleet = [{ stats: blankStats({ hp: 10, shield: 6, actives: ['chaff'] }), initialDamage: 0 }];
    const foe = enemy({}, { initiative: 5, computer: 0, hp: 5, cannons: [{ diceCount: 6, damage: 1 }] });
    let state = initCombat(fleet, foe, 1);
    state = advanceRound(state); // missile (no-op) — round modifiers reset here, so trigger the active AFTER
    state = useActive(state, 0, 0);
    state = advanceRound(state); // cannon round 1

    expect(state.playerShips[0].damage).toBe(0); // every die misses, chaff or no natural 6
  });

  it('is scoped to exactly one round', () => {
    const fleet = [{ stats: blankStats({ hp: 10, shield: 6, actives: ['chaff'] }), initialDamage: 0 }];
    const foe = enemy({}, { initiative: 5, computer: 0, hp: 5, cannons: [{ diceCount: 6, damage: 1 }] });
    let state = initCombat(fleet, foe, 1);
    state = advanceRound(state); // missile
    state = useActive(state, 0, 0);
    state = advanceRound(state); // cannon round 1 — chaff active
    expect(state.playerShips[0].damage).toBe(0);

    state = advanceRound(state); // cannon round 2 — chaff gone, natural 6s auto-hit again
    expect(state.roundModifiers.chaffShipIndices).toHaveLength(0);
  });
});

// Backs the prep screen's "your fire opens here" highlight — if this and
// pickTarget ever disagree, the highlight lies about the coming fight.
describe('openingTargetIndex', () => {
  it('points at the lowest-HP ship, addressed by flattened index across groups', () => {
    const foe = enemy({
      groups: [
        { label: 'escort', count: 2, stats: blankStats({ hp: 6 }) },
        { label: 'runt', count: 1, stats: blankStats({ hp: 1 }) },
      ],
    });
    expect(openingTargetIndex(foe)).toBe(2); // escorts occupy 0 and 1
  });

  it('points at the highest-HP ship under the strongest stance', () => {
    const foe = enemy({
      groups: [
        { label: 'runt', count: 1, stats: blankStats({ hp: 1 }) },
        { label: 'brute', count: 1, stats: blankStats({ hp: 9 }) },
      ],
    });
    expect(openingTargetIndex(foe, 'strongest')).toBe(1);
  });

  it('breaks ties toward the first ship, and handles a lone defender', () => {
    const evenFormation = enemy({ count: 3 }, { hp: 4 });
    expect(openingTargetIndex(evenFormation)).toBe(0);
    expect(openingTargetIndex(enemy({ count: 1 }, { hp: 4 }))).toBe(0);
  });

  it('agrees with where the first shot actually lands', () => {
    const foe = enemy({
      groups: [
        { label: 'escort', count: 1, stats: blankStats({ hp: 6 }) },
        { label: 'runt', count: 1, stats: blankStats({ hp: 2 }) },
      ],
    });
    const fleet = [{ stats: blankStats({ hp: 20, computer: 9, cannons: [{ diceCount: 1, damage: 1 }] }), initialDamage: 0 }];
    let state = initCombat(fleet, foe, 3);
    state = advanceRound(state); // missile (no-op)
    state = advanceRound(state); // cannon round 1
    const firstPlayerShot = state.log.find(
      (e) => e.kind === 'roll' && e.phase === 'cannon' && e.side === 'player',
    ) as { targetIndex: number } | undefined;
    expect(firstPlayerShot?.targetIndex).toBe(openingTargetIndex(foe));
  });
});

describe('mixed enemy formations (iteration 9.3)', () => {
  it('each sub-group activates at its own initiative, via the existing activation machinery', () => {
    const fleet = [{ stats: blankStats({ initiative: -1, hp: 20 }), initialDamage: 0 }]; // never fires first
    // "fast" at initiative 2, not more: still fires before "slow" (0) and the
    // player (-1), but the fast-vs-player gap (3) stays under the
    // iteration-17 Outspeed threshold (4) so this stays a plain
    // activation-order test, not an accidental bonus-activation one.
    const foe = enemy({
      groups: [
        { label: 'fast', count: 1, stats: blankStats({ initiative: 2, hp: 5, cannons: [{ diceCount: 1, damage: 1 }] }) },
        { label: 'slow', count: 1, stats: blankStats({ initiative: 0, hp: 5, cannons: [{ diceCount: 1, damage: 1 }] }) },
      ],
    });
    let state = initCombat(fleet, foe, 1);
    state = advanceRound(state); // missile (no-op)
    state = advanceRound(state); // cannon round 1

    const round1Rolls = state.log.filter((e) => e.kind === 'roll' && e.phase === 'cannon' && e.round === 1);
    expect(round1Rolls).toHaveLength(2);
    // enemyShips are laid out group-in-order (fast=index 0, slow=index 1),
    // but activation must follow each group's own initiative regardless.
    expect((round1Rolls[0] as { shooterIndex: number }).shooterIndex).toBe(0); // fast group fires first
    expect((round1Rolls[1] as { shooterIndex: number }).shooterIndex).toBe(1); // slow group fires second
  });

  it('a formation flattens to one CombatShip per ship across all groups, each with its own stats', () => {
    const fleet = [{ stats: blankStats({ hp: 20 }), initialDamage: 0 }];
    const foe = enemy({
      groups: [
        { label: 'centerpiece', count: 1, stats: blankStats({ hp: 5, computer: 3 }) },
        { label: 'screen', count: 2, stats: blankStats({ hp: 1, computer: 0 }) },
      ],
    });
    const state = initCombat(fleet, foe, 1);
    expect(state.enemyShips).toHaveLength(3);
    expect(state.enemyShips[0].stats.hp).toBe(5);
    expect(state.enemyShips[0].stats.computer).toBe(3);
    expect(state.enemyShips[1].stats.hp).toBe(1);
    expect(state.enemyShips[2].stats.hp).toBe(1);
    // Continuous per-side indices across groups, not reset per group.
    expect(state.enemyShips.map((s) => s.index)).toEqual([0, 1, 2]);
  });

  it('greedy targeting naturally hits a low-HP screen before a tougher centerpiece — the doctrine puzzle', () => {
    const fleet = [{ stats: blankStats({ initiative: 5, computer: 10, hp: 20, cannons: [{ diceCount: 1, damage: 1 }] }), initialDamage: 0 }];
    const foe = enemy({
      groups: [
        { label: 'sniper', count: 1, stats: blankStats({ hp: 2, computer: 3, cannons: [{ diceCount: 1, damage: 2 }] }) },
        { label: 'screen', count: 2, stats: blankStats({ hp: 1, cannons: [{ diceCount: 1, damage: 1 }] }) },
      ],
    });
    let state = initCombat(fleet, foe, 1);
    state = advanceRound(state); // missile (no-op)
    state = advanceRound(state); // cannon round 1

    const playerRolls = state.log.filter((e) => e.kind === 'roll' && e.side === 'player') as { targetIndex: number }[];
    expect(playerRolls.length).toBeGreaterThan(0);
    // Screens are indices 1-2 (lower HP than the sniper at index 0) — greedy
    // targeting (lowest remaining HP) picks a screen first, by construction.
    expect(playerRolls[0].targetIndex).not.toBe(0);
  });
});

describe('targeting doctrine (iteration 9.4)', () => {
  it('"weakest" (default) targets the lowest-remaining-HP enemy first', () => {
    const fleet = [{ stats: blankStats({ initiative: 5, hp: 20, cannons: [{ diceCount: 1, damage: 1 }] }), initialDamage: 0 }];
    const foe = enemy({
      groups: [
        { label: 'tough', count: 1, stats: blankStats({ hp: 5 }) },
        { label: 'fragile', count: 1, stats: blankStats({ hp: 1 }) },
      ],
    });
    let state = initCombat(fleet, foe, 1, 'weakest');
    state = advanceRound(state); // missile
    state = advanceRound(state); // cannon round 1
    const roll = state.log.find((e) => e.kind === 'roll' && e.side === 'player') as { targetIndex: number };
    expect(roll.targetIndex).toBe(1); // fragile group, index 1
  });

  it('"strongest" targets the highest-remaining-HP enemy first', () => {
    const fleet = [{ stats: blankStats({ initiative: 5, hp: 20, cannons: [{ diceCount: 1, damage: 1 }] }), initialDamage: 0 }];
    const foe = enemy({
      groups: [
        { label: 'tough', count: 1, stats: blankStats({ hp: 5 }) },
        { label: 'fragile', count: 1, stats: blankStats({ hp: 1 }) },
      ],
    });
    let state = initCombat(fleet, foe, 1, 'strongest');
    state = advanceRound(state); // missile
    state = advanceRound(state); // cannon round 1
    const roll = state.log.find((e) => e.kind === 'roll' && e.side === 'player') as { targetIndex: number };
    expect(roll.targetIndex).toBe(0); // tough group, index 0
  });

  it('a clicked priority target overrides the stance while it lives (iteration 13)', () => {
    const fleet = [{ stats: blankStats({ initiative: 5, hp: 20, cannons: [{ diceCount: 1, damage: 1 }] }), initialDamage: 0 }];
    const foe = enemy({
      groups: [
        { label: 'tough', count: 1, stats: blankStats({ hp: 5 }) },
        { label: 'fragile', count: 1, stats: blankStats({ hp: 1 }) },
      ],
    });
    let state = initCombat(fleet, foe, 1, 'weakest'); // stance would pick fragile (index 1)
    state = setPriorityTarget(state, 0);
    state = advanceRound(state); // missile
    state = advanceRound(state); // cannon round 1
    const roll = state.log.find((e) => e.kind === 'roll' && e.side === 'player') as { targetIndex: number };
    expect(roll.targetIndex).toBe(0); // priority wins over the weakest stance
  });

  it('priority beats even the siege cannon\'s own override, and a dead/invalid priority clears', () => {
    const fleet = [
      {
        stats: blankStats({ initiative: 5, hp: 20, cannons: [{ diceCount: 1, damage: 1, targetHighest: true }] }),
        initialDamage: 0,
      },
    ];
    const foe = enemy({
      groups: [
        { label: 'tough', count: 1, stats: blankStats({ hp: 5 }) },
        { label: 'fragile', count: 1, stats: blankStats({ hp: 1 }) },
      ],
    });
    let state = initCombat(fleet, foe, 1, 'weakest');
    state = setPriorityTarget(state, 1); // point everything at the fragile ship despite the siege die
    state = advanceRound(state);
    state = advanceRound(state);
    const roll = state.log.find((e) => e.kind === 'roll' && e.side === 'player') as { targetIndex: number };
    expect(roll.targetIndex).toBe(1);
    // Setting a priority on a destroyed ship clears instead of sticking.
    const cleared = setPriorityTarget(
      { ...state, enemyShips: state.enemyShips.map((s) => ({ ...s, damage: s.stats.hp })) },
      0,
    );
    expect(cleared.priorityTargetIndex).toBeNull();
  });

  it('the siege cannon\'s per-die override always targets highest-HP, regardless of stance', () => {
    const fleet = [
      {
        stats: blankStats({ initiative: 5, hp: 20, cannons: [{ diceCount: 1, damage: 1, targetHighest: true }] }),
        initialDamage: 0,
      },
    ];
    const foe = enemy({
      groups: [
        { label: 'tough', count: 1, stats: blankStats({ hp: 5 }) },
        { label: 'fragile', count: 1, stats: blankStats({ hp: 1 }) },
      ],
    });
    let state = initCombat(fleet, foe, 1, 'weakest'); // stance says weakest, siege cannon overrides it
    state = advanceRound(state);
    state = advanceRound(state);
    const roll = state.log.find((e) => e.kind === 'roll' && e.side === 'player') as { targetIndex: number };
    expect(roll.targetIndex).toBe(0); // tough group — the die's own override wins
  });

  it('enemy targeting is untouched by the player\'s stance — always lowest-HP-first', () => {
    const fleet = [
      { stats: blankStats({ hp: 5 }), initialDamage: 0 },
      { stats: blankStats({ hp: 1 }), initialDamage: 0 },
    ];
    const foe = enemy({}, { initiative: 5, hp: 10, cannons: [{ diceCount: 1, damage: 1 }] });
    let state = initCombat(fleet, foe, 1, 'strongest'); // player stance, irrelevant to the enemy
    state = advanceRound(state);
    state = advanceRound(state);
    const roll = state.log.find((e) => e.kind === 'roll' && e.side === 'enemy') as { targetIndex: number };
    expect(roll.targetIndex).toBe(1); // still the fragile player ship
  });

  it('defaults to "weakest" when no stance is passed to initCombat', () => {
    const fleet = [{ stats: blankStats({ initiative: 5, hp: 20, cannons: [{ diceCount: 1, damage: 1 }] }), initialDamage: 0 }];
    const foe = enemy({
      groups: [
        { label: 'tough', count: 1, stats: blankStats({ hp: 5 }) },
        { label: 'fragile', count: 1, stats: blankStats({ hp: 1 }) },
      ],
    });
    const state = initCombat(fleet, foe, 1);
    expect(state.targetingStance).toBe('weakest');
  });
});

describe('Outspeed (iteration 17)', () => {
  it('qualifiesForOutspeed: exactly the gap-4 threshold, not one under', () => {
    expect(qualifiesForOutspeed(4, 0)).toBe(true);
    expect(qualifiesForOutspeed(3, 0)).toBe(false);
    expect(qualifiesForOutspeed(0 + OUTSPEED_GAP, 0)).toBe(true);
  });

  it('a gap of exactly 4 grants exactly one extra cannon activation; gap 3 grants none; gap 99 still grants exactly one', () => {
    const foe = enemy({}, { hp: 50, cannons: [{ diceCount: 1, damage: 1 }] }); // initiative 0

    // Gap 3 — no bonus activation.
    const fleetGap3 = [{ stats: blankStats({ initiative: 3, hp: 50, cannons: [{ diceCount: 1, damage: 1 }] }), initialDamage: 0 }];
    let stateGap3 = initCombat(fleetGap3, foe, 1);
    stateGap3 = advanceRound(stateGap3); // missile (no-op)
    stateGap3 = advanceRound(stateGap3); // cannon round 1
    const rollsGap3 = stateGap3.log.filter((e) => e.kind === 'roll' && e.side === 'player');
    expect(rollsGap3).toHaveLength(1);
    expect(stateGap3.log.some((e) => e.kind === 'outspeed')).toBe(false);

    // Gap 4 — exactly one bonus activation (2 total rolls).
    const fleetGap4 = [{ stats: blankStats({ initiative: 4, hp: 50, cannons: [{ diceCount: 1, damage: 1 }] }), initialDamage: 0 }];
    let stateGap4 = initCombat(fleetGap4, foe, 1);
    stateGap4 = advanceRound(stateGap4);
    stateGap4 = advanceRound(stateGap4);
    const rollsGap4 = stateGap4.log.filter((e) => e.kind === 'roll' && e.side === 'player');
    expect(rollsGap4).toHaveLength(2);
    expect(stateGap4.log.filter((e) => e.kind === 'outspeed')).toHaveLength(1);

    // Gap 99 — still capped at exactly one bonus activation, not more.
    const fleetGap99 = [{ stats: blankStats({ initiative: 99, hp: 50, cannons: [{ diceCount: 1, damage: 1 }] }), initialDamage: 0 }];
    let stateGap99 = initCombat(fleetGap99, foe, 1);
    stateGap99 = advanceRound(stateGap99);
    stateGap99 = advanceRound(stateGap99);
    const rollsGap99 = stateGap99.log.filter((e) => e.kind === 'roll' && e.side === 'player');
    expect(rollsGap99).toHaveLength(2);
    expect(stateGap99.log.filter((e) => e.kind === 'outspeed')).toHaveLength(1);
  });

  it('the missile phase never grants a bonus activation, even at gap 99', () => {
    const fleet = [
      {
        stats: blankStats({
          initiative: 99,
          hp: 50,
          missiles: [{ diceCount: 1, damage: 1 }],
          cannons: [{ diceCount: 1, damage: 1 }],
        }),
        initialDamage: 0,
      },
    ];
    const foe = enemy({}, { hp: 50, cannons: [{ diceCount: 1, damage: 1 }] }); // initiative 0
    let state = initCombat(fleet, foe, 1);
    state = advanceRound(state); // missile phase (round 0)

    const missileRolls = state.log.filter((e) => e.kind === 'roll' && e.phase === 'missile' && e.side === 'player');
    expect(missileRolls).toHaveLength(1); // not doubled
    expect(state.log.some((e) => e.kind === 'outspeed')).toBe(false);

    state = advanceRound(state); // cannon round 1 — the same gap DOES apply here
    const cannonRolls = state.log.filter((e) => e.kind === 'roll' && e.phase === 'cannon' && e.round === 1 && e.side === 'player');
    expect(cannonRolls).toHaveLength(2);
    expect(state.log.some((e) => e.kind === 'outspeed')).toBe(true);
  });

  it('mid-round unlock: killing the enemy\'s only fast ship during a round grants outspeed that same round', () => {
    const fleet = [
      { stats: blankStats({ initiative: 4, hp: 20, computer: 10, cannons: [{ diceCount: 3, damage: 5 }] }), initialDamage: 0 },
    ];
    const foe = enemy({
      groups: [
        // Alive, this "fast" escort's initiative (3) keeps the player's gap
        // at 1 — no outspeed. It dies to a single hit (hp 1), and the
        // player's 3 dice (comp 10, greedy-lowest-HP) reliably kill it in
        // its own first activation.
        { label: 'fast', count: 1, stats: blankStats({ initiative: 3, hp: 1 }) },
        // Once "fast" is the only casualty, "slow" (init 0) becomes the
        // fastest surviving enemy — gap 4, exactly the threshold.
        { label: 'slow', count: 1, stats: blankStats({ initiative: 0, hp: 20 }) },
      ],
    });
    let state = initCombat(fleet, foe, 1);
    state = advanceRound(state); // missile (no-op, no missiles either side)

    let sawSameRoundUnlock = false;
    let guard = 0;
    while (!state.winner && guard < 30) {
      const before = state.log.length;
      state = advanceRound(state);
      const roundLog = state.log.slice(before);
      const fastDied = roundLog.some((e) => e.kind === 'destroyed' && e.side === 'enemy' && e.shipIndex === 0);
      if (fastDied) {
        sawSameRoundUnlock = roundLog.some((e) => e.kind === 'outspeed' && e.side === 'player');
        break;
      }
      guard++;
    }
    expect(sawSameRoundUnlock).toBe(true);
  });

  it('an evading ship still counts toward "fastest alive" and denies the opposing side outspeed', () => {
    // If evading ships did NOT count, "fastest player alive" would drop to
    // ship0's initiative (1) once ship1 evades, and the enemy's gap (5-1=4)
    // would newly qualify. Evading ships DO count, so the enemy's gap stays
    // 5-3=2 — denied, exactly as the design requires.
    const fleet = [
      { stats: blankStats({ initiative: 1, hp: 10, cannons: [{ diceCount: 1, damage: 1 }] }), initialDamage: 0 },
      { stats: blankStats({ initiative: 3, hp: 10, actives: ['thrusters'] }), initialDamage: 0 },
    ];
    const foe = enemy({}, { initiative: 5, hp: 50, computer: 10, cannons: [{ diceCount: 1, damage: 1 }] });
    let state = initCombat(fleet, foe, 1);
    state = advanceRound(state); // missile (no-op)
    state = useActive(state, 1, 0); // arm thrusters for ship1 — evades cannon round 1
    state = advanceRound(state); // cannon round 1

    expect(state.log.some((e) => e.kind === 'outspeed' && e.side === 'enemy')).toBe(false);
  });

  // Iteration 41: injector no longer grants a round modifier (it's a
  // self-heal now) — tacrelay takes over as this test's round-modifier
  // initiative source; it's the same "temporary initiative bump for one
  // round" shape the old injector used to be.
  it('the tacrelay active grants outspeed for exactly the round it is armed', () => {
    // Base initiative 3 sits one short of OUTSPEED_GAP (4) against a
    // 0-initiative foe; tacrelay's +1 is exactly what closes it, only for
    // the round it's armed.
    const fleet = [
      {
        stats: blankStats({ initiative: 3, hp: 20, cannons: [{ diceCount: 1, damage: 1 }], actives: ['tacrelay'] }),
        initialDamage: 0,
      },
    ];
    const foe = enemy({}, { hp: 20, cannons: [{ diceCount: 1, damage: 1 }] }); // initiative 0
    let state = initCombat(fleet, foe, 1);
    state = advanceRound(state); // missile (no-op)
    state = useActive(state, 0, 0); // arm tacrelay for the next round

    const beforeRound1 = state.log.length;
    state = advanceRound(state); // cannon round 1 — +1 initiative active this round only
    expect(state.log.slice(beforeRound1).some((e) => e.kind === 'outspeed' && e.side === 'player')).toBe(true);

    const beforeRound2 = state.log.length;
    state = advanceRound(state); // cannon round 2 — tacrelay already spent, roundModifiers reset
    expect(state.log.slice(beforeRound2).some((e) => e.kind === 'outspeed')).toBe(false);
  });

  it('symmetric: an init-4 enemy outspeeds an all-init-0 player fleet; one init-1 player ship denies it', () => {
    const foe = enemy({}, { initiative: 4, hp: 50, cannons: [{ diceCount: 1, damage: 1 }] });

    const fleetAllSlow = [{ stats: blankStats({ hp: 50, cannons: [{ diceCount: 1, damage: 1 }] }), initialDamage: 0 }];
    let stateA = initCombat(fleetAllSlow, foe, 1);
    stateA = advanceRound(stateA); // missile
    stateA = advanceRound(stateA); // cannon round 1
    expect(stateA.log.some((e) => e.kind === 'outspeed' && e.side === 'enemy')).toBe(true);

    const fleetWithFastEscort = [
      { stats: blankStats({ hp: 50, cannons: [{ diceCount: 1, damage: 1 }] }), initialDamage: 0 },
      { stats: blankStats({ initiative: 1, hp: 5, cannons: [{ diceCount: 1, damage: 1 }] }), initialDamage: 0 },
    ];
    let stateB = initCombat(fleetWithFastEscort, foe, 1);
    stateB = advanceRound(stateB);
    stateB = advanceRound(stateB);
    expect(stateB.log.some((e) => e.kind === 'outspeed' && e.side === 'enemy')).toBe(false);
  });

  it('bonus-phase order: multiple qualifying ships fire fastest-first', () => {
    // Two player ships both clear the gap against a slow (init 0) enemy —
    // ship1 (init 6) should take its bonus activation before ship0 (init 5).
    // (A genuine cross-side tie in this list is mathematically unreachable:
    // whichever ship sets its own side's "fastest alive" cannot itself gap
    // that same value by 4+ against the other side, so "player wins ties"
    // — inherited from the shared `computeActivationOrder` comparator — is
    // only exercisable for the normal activation order, not this list.)
    const fleet = [
      { stats: blankStats({ initiative: 5, hp: 20, cannons: [{ diceCount: 1, damage: 1 }] }), initialDamage: 0 },
      { stats: blankStats({ initiative: 6, hp: 20, cannons: [{ diceCount: 1, damage: 1 }] }), initialDamage: 0 },
    ];
    const foe = enemy({}, { hp: 50, cannons: [{ diceCount: 1, damage: 1 }] }); // initiative 0
    let state = initCombat(fleet, foe, 1);
    state = advanceRound(state); // missile
    state = advanceRound(state); // cannon round 1

    const outspeedEvents = state.log.filter((e) => e.kind === 'outspeed') as { side: string; shipIndex: number }[];
    expect(outspeedEvents.map((e) => e.shipIndex)).toEqual([1, 0]);
  });

  it('a rift-cannon backfire during the bonus activation can destroy the firer', () => {
    // No brute-forced single seed here (the outcome only needs SOME seed
    // where the backfire lands on the bonus, not the normal, activation) —
    // sweep a range and stop at the first match. The player's gap (10) is
    // fixed every round it survives, so the bonus phase fires every round.
    let found = false;
    for (let seed = 1; seed <= 50 && !found; seed++) {
      const fleet = [
        {
          stats: blankStats({
            initiative: 10,
            hp: 1,
            cannons: [{ diceCount: 1, damage: 3, selfDamageOnNatOne: 5 }],
          }),
          initialDamage: 0,
        },
      ];
      // Harmless enemy cannon (0 damage) — the player can only die to its
      // own rift backfire, never to enemy fire, keeping the "was it the
      // bonus activation" check unambiguous.
      const foe = enemy({}, { hp: 50, cannons: [{ diceCount: 1, damage: 0 }] });
      let state = initCombat(fleet, foe, seed);
      state = advanceRound(state); // missile
      let guard = 0;
      while (!state.winner && guard < 30) {
        const before = state.log.length;
        state = advanceRound(state);
        const roundLog = state.log.slice(before);
        const outspeedIdx = roundLog.findIndex((e) => e.kind === 'outspeed');
        const destroyedIdx = roundLog.findIndex((e) => e.kind === 'destroyed' && e.side === 'player');
        if (outspeedIdx !== -1 && destroyedIdx !== -1 && destroyedIdx > outspeedIdx) {
          found = true;
          break;
        }
        guard++;
      }
    }
    expect(found).toBe(true);
  });

  it('priority target applies to the bonus activation the same as a normal one', () => {
    const fleet = [{ stats: blankStats({ initiative: 10, hp: 20, cannons: [{ diceCount: 1, damage: 1 }] }), initialDamage: 0 }];
    const foe = enemy({
      groups: [
        { label: 'tough', count: 1, stats: blankStats({ hp: 5 }) },
        { label: 'fragile', count: 1, stats: blankStats({ hp: 1 }) },
      ],
    }); // both initiative 0, gap 10 qualifies
    let state = initCombat(fleet, foe, 1, 'weakest'); // stance alone would pick 'fragile' (index 1)
    state = setPriorityTarget(state, 0); // force 'tough' (index 0) instead
    state = advanceRound(state); // missile
    state = advanceRound(state); // cannon round 1: normal + bonus, both should honor priority

    const playerRolls = state.log.filter((e) => e.kind === 'roll' && e.side === 'player') as { targetIndex: number }[];
    expect(playerRolls.length).toBeGreaterThanOrEqual(2);
    expect(playerRolls.every((r) => r.targetIndex === 0)).toBe(true);
  });

  // Iteration 41: injector no longer grants initiative — tacrelay takes
  // over as this test's round-modifier source (see the outspeed-arming
  // test above for the same swap and why).
  it('outspeedingShipIndices matches what advanceRound actually grants, live (incl. after tacrelay arms)', () => {
    // Base initiative 3, one short of OUTSPEED_GAP (4) — tacrelay's +1 closes it.
    const fleet = [
      {
        stats: blankStats({ initiative: 3, hp: 20, cannons: [{ diceCount: 1, damage: 1 }], actives: ['tacrelay'] }),
        initialDamage: 0,
      },
    ];
    const foe = enemy({}, { hp: 20, cannons: [{ diceCount: 1, damage: 1 }] }); // initiative 0
    let state = initCombat(fleet, foe, 1);
    expect(outspeedingShipIndices(state)).toEqual({ player: [], enemy: [] });

    state = useActive(state, 0, 0); // arm tacrelay — badge should react immediately, before the round even resolves
    expect(outspeedingShipIndices(state)).toEqual({ player: [0], enemy: [] });
  });

  it('stepping round-by-round through an outspeed-heavy fight is bit-identical to running it to completion', () => {
    const fleet = [
      { stats: blankStats({ initiative: 8, hp: 12, computer: 2, cannons: [{ diceCount: 1, damage: 1 }] }), initialDamage: 0 },
      { stats: blankStats({ initiative: 1, hp: 5, cannons: [{ diceCount: 1, damage: 1 }] }), initialDamage: 1 },
    ];
    const foe = enemy(
      { count: 2 },
      { initiative: 0, hp: 4, computer: 1, cannons: [{ diceCount: 1, damage: 1 }] },
    );

    const seed = 17;
    const oneShot = runToEnd(initCombat(fleet, foe, seed));

    let stepped = initCombat(fleet, foe, seed);
    let guard = 0;
    while (!stepped.winner && guard < 100) {
      stepped = advanceRound(stepped);
      guard++;
    }

    expect(stepped.winner).toBe(oneShot.winner);
    expect(JSON.stringify(stepped.log)).toBe(JSON.stringify(oneShot.log));
    // Confirm this scenario actually exercised the new rule — an
    // equivalence test that never triggers outspeed wouldn't prove much.
    expect(oneShot.log.some((e) => e.kind === 'outspeed')).toBe(true);
  });
});

describe('telegraphs — incomingFirePreview (iteration 19)', () => {
  // The core promise: the preview's opening target for each enemy ship is
  // the SAME target its actual first die logs when the round is played.
  function firstEnemyRollTarget(stateAfterRound: ReturnType<typeof advanceRound>, shooterIndex: number): number | null {
    const roll = stateAfterRound.log.find(
      (e) => e.kind === 'roll' && e.side === 'enemy' && e.shooterIndex === shooterIndex,
    );
    return roll && roll.kind === 'roll' ? roll.targetIndex : null;
  }

  it('matches the actual first-die target: plain greedy picks the lowest-HP player ship', () => {
    const fleet = [
      { stats: blankStats({ hp: 8 }), initialDamage: 0 },
      { stats: blankStats({ hp: 3 }), initialDamage: 0 },
    ];
    const foe = enemy({}, { initiative: 3, hp: 20, cannons: [{ diceCount: 2, damage: 1 }] });
    let state = initCombat(fleet, foe, 1);
    state = advanceRound(state); // missile no-op → next round is cannon
    const preview = incomingFirePreview(state);
    expect(preview.phase).toBe('cannon');
    expect(preview.entries).toHaveLength(1);
    expect(preview.entries[0].targetIndex).toBe(1); // the 3-HP ship
    expect(preview.entries[0].diceCount).toBe(2);
    expect(preview.entries[0].maxDamage).toBe(2);
    const played = advanceRound(state);
    expect(firstEnemyRollTarget(played, 0)).toBe(1);
  });

  it('matches the actual first-die target under taunt and under an armed evade', () => {
    // Taunt: the 10-HP taunter draws fire off the 2-HP ship.
    const tauntFleet = [
      { stats: blankStats({ hp: 2 }), initialDamage: 0 },
      { stats: blankStats({ hp: 10, taunt: true }), initialDamage: 0 },
    ];
    const foe = enemy({}, { initiative: 3, hp: 20, cannons: [{ diceCount: 1, damage: 1 }] });
    let state = initCombat(tauntFleet, foe, 1);
    state = advanceRound(state);
    expect(incomingFirePreview(state).entries[0].targetIndex).toBe(1);
    expect(firstEnemyRollTarget(advanceRound(state), 0)).toBe(1);

    // Evade: arming thrusters removes the otherwise-lowest ship from the
    // pool, and the telegraph shifts BEFORE the round is played.
    const evadeFleet = [
      { stats: blankStats({ hp: 2, actives: ['thrusters'] }), initialDamage: 0 },
      { stats: blankStats({ hp: 10 }), initialDamage: 0 },
    ];
    let evadeState = initCombat(evadeFleet, foe, 1);
    evadeState = advanceRound(evadeState);
    expect(incomingFirePreview(evadeState).entries[0].targetIndex).toBe(0); // before arming
    evadeState = useActive(evadeState, 0, 0);
    expect(incomingFirePreview(evadeState).entries[0].targetIndex).toBe(1); // shifted
    expect(firstEnemyRollTarget(advanceRound(evadeState), 0)).toBe(1);
  });

  it('previews missiles at round 0 and cannons afterward, with per-phase weapon sets', () => {
    const fleet = [{ stats: blankStats({ hp: 10, flak: 2 }), initialDamage: 0 }];
    const foe = enemy(
      { count: 2 },
      { initiative: 1, hp: 5, cannons: [{ diceCount: 1, damage: 2 }], missiles: [{ diceCount: 2, damage: 1 }] },
    );
    const state = initCombat(fleet, foe, 1);

    const missilePreview = incomingFirePreview(state);
    expect(missilePreview.phase).toBe('missile');
    expect(missilePreview.entries).toHaveLength(2);
    expect(missilePreview.entries[0].diceCount).toBe(2); // missile dice only
    expect(missilePreview.flakCancels).toBe(2); // the fleet's flak total

    const afterMissiles = advanceRound(state);
    const cannonPreview = incomingFirePreview(afterMissiles);
    expect(cannonPreview.phase).toBe('cannon');
    expect(cannonPreview.entries[0]?.diceCount).toBe(1); // cannon dice only
    expect(cannonPreview.flakCancels).toBe(0); // flak is a missile-phase concept
  });

  it('doubles previewed cannon dice for enemies that currently qualify for Outspeed, and flags them', () => {
    const fleet = [{ stats: blankStats({ hp: 30, cannons: [{ diceCount: 1, damage: 1 }] }), initialDamage: 0 }]; // init 0
    const foe = enemy({}, { initiative: 4, hp: 30, cannons: [{ diceCount: 2, damage: 1 }] }); // gap 4 — outspeeds
    let state = initCombat(fleet, foe, 1);
    state = advanceRound(state); // missile no-op
    expect(outspeedingShipIndices(state).enemy).toEqual([0]); // sanity: the live badge agrees
    const preview = incomingFirePreview(state);
    expect(preview.entries[0].outspeed).toBe(true);
    expect(preview.entries[0].diceCount).toBe(4); // 2 dice × 2 activations
    expect(preview.entries[0].maxDamage).toBe(4);
  });

  it('is pure: consumes no rng and leaves the state deep-equal', () => {
    const fleet = [{ stats: blankStats({ hp: 5 }), initialDamage: 0 }];
    const foe = enemy({}, { initiative: 1, hp: 5, cannons: [{ diceCount: 1, damage: 1 }] });
    let state = initCombat(fleet, foe, 1);
    state = advanceRound(state);
    const before = JSON.stringify(state);
    incomingFirePreview(state);
    expect(JSON.stringify(state)).toBe(before);
    // Determinism cross-check: playing the round after previewing equals
    // playing it without ever previewing.
    expect(JSON.stringify(advanceRound(state))).toBe(JSON.stringify(advanceRound(JSON.parse(before))));
  });
});

describe('Overspeed protocols (iteration 28)', () => {
  it('drops the PLAYER Outspeed gap to 3, but leaves the enemy at gap 4', () => {
    const foe = enemy({}, { hp: 50, cannons: [{ diceCount: 1, damage: 1 }] }); // initiative 0

    // Gap 3 with the protocol active — now qualifies (didn't without it,
    // per the existing "gap 3 grants none" case above).
    const fleet = [{ stats: blankStats({ initiative: 3, hp: 50, cannons: [{ diceCount: 1, damage: 1 }] }), initialDamage: 0 }];
    let state = initCombat(fleet, foe, 1, 'weakest', { overspeedProtocols: true });
    state = advanceRound(state); // missile (no-op)
    state = advanceRound(state); // cannon round 1
    expect(state.log.filter((e) => e.kind === 'outspeed')).toHaveLength(1);
  });

  it('does not speed up the enemy side even when the player holds the protocol', () => {
    // Enemy at initiative 3 (a gap of exactly 3 over the player's 0) should
    // NOT qualify for its own Outspeed bonus just because the PLAYER holds
    // Overspeed protocols — only the player's own gap loosens.
    const fleet = [{ stats: blankStats({ initiative: 0, hp: 50, cannons: [{ diceCount: 1, damage: 1 }] }), initialDamage: 0 }];
    const foe = enemy({}, { initiative: 3, hp: 50, cannons: [{ diceCount: 1, damage: 1 }] });
    let state = initCombat(fleet, foe, 1, 'weakest', { overspeedProtocols: true });
    state = advanceRound(state);
    state = advanceRound(state);
    expect(state.log.some((e) => e.kind === 'outspeed' && e.side === 'enemy')).toBe(false);
  });

  it('without the protocol flag, the gap stays the default 4', () => {
    const foe = enemy({}, { hp: 50, cannons: [{ diceCount: 1, damage: 1 }] });
    const fleet = [{ stats: blankStats({ initiative: 3, hp: 50, cannons: [{ diceCount: 1, damage: 1 }] }), initialDamage: 0 }];
    let state = initCombat(fleet, foe, 1);
    state = advanceRound(state);
    state = advanceRound(state);
    expect(state.log.filter((e) => e.kind === 'outspeed')).toHaveLength(0);
  });
});

describe('Alpha doctrine (iteration 28)', () => {
  it('fires the player cannons during the missile phase, alongside missiles', () => {
    const fleet = [
      { stats: blankStats({ hp: 50, cannons: [{ diceCount: 1, damage: 1 }] }), initialDamage: 0 },
    ];
    const foe = enemy({}, { hp: 50 }); // no weapons — isolates the player's own activations
    let state = initCombat(fleet, foe, 1, 'weakest', { alphaDoctrine: true });
    state = advanceRound(state); // round 0 — missile phase

    const cannonRolls = state.log.filter((e) => e.kind === 'roll' && e.side === 'player' && e.phase === 'cannon');
    expect(cannonRolls).toHaveLength(1);
    expect(state.round).toBe(1); // still just one round consumed
  });

  it('does nothing extra in the missile phase without the flag', () => {
    const fleet = [{ stats: blankStats({ hp: 50, cannons: [{ diceCount: 1, damage: 1 }] }), initialDamage: 0 }];
    const foe = enemy({}, { hp: 50 });
    let state = initCombat(fleet, foe, 1);
    state = advanceRound(state);
    const cannonRolls = state.log.filter((e) => e.kind === 'roll' && e.side === 'player' && e.phase === 'cannon');
    expect(cannonRolls).toHaveLength(0);
  });

  it('zeroes the player base shield during the missile phase and cannon round 1, then stops', () => {
    // Enemy fires missiles in round 0 and cannons from round 1 on, both
    // 1 die / 1 damage — isolates the logged `shield` value read from a
    // player-side defender in each phase without depending on rng outcome.
    const fleet = [{ stats: blankStats({ hp: 50, shield: 6 }), initialDamage: 0 }];
    const foe = enemy(
      {},
      { hp: 50, computer: 5, missiles: [{ diceCount: 1, damage: 1 }], cannons: [{ diceCount: 1, damage: 1 }] },
    );

    let withAlpha = initCombat(fleet, foe, 1, 'weakest', { alphaDoctrine: true });
    withAlpha = advanceRound(withAlpha); // round 0 — missile phase
    const round0Rolls = withAlpha.log.filter((e) => e.kind === 'roll' && e.side === 'enemy');
    expect(round0Rolls.length).toBeGreaterThan(0);
    expect(round0Rolls.every((e) => e.kind === 'roll' && e.shield === 0)).toBe(true);
    withAlpha = advanceRound(withAlpha); // round 1 — still zeroed
    const round1Rolls = withAlpha.log.filter((e) => e.kind === 'roll' && e.side === 'enemy' && e.round === 1);
    expect(round1Rolls.length).toBeGreaterThan(0);
    expect(round1Rolls.every((e) => e.kind === 'roll' && e.shield === 0)).toBe(true);
    withAlpha = advanceRound(withAlpha); // round 2 — back to normal
    const round2Rolls = withAlpha.log.filter((e) => e.kind === 'roll' && e.side === 'enemy' && e.round === 2);
    expect(round2Rolls.length).toBeGreaterThan(0);
    expect(round2Rolls.every((e) => e.kind === 'roll' && e.shield === 6)).toBe(true);
  });

  it('without the flag, player shield is never zeroed', () => {
    const fleet = [{ stats: blankStats({ hp: 50, shield: 6 }), initialDamage: 0 }];
    const foe = enemy({}, { hp: 50, computer: 5, missiles: [{ diceCount: 1, damage: 1 }] });
    let state = initCombat(fleet, foe, 1);
    state = advanceRound(state); // round 0 — missile phase
    const rolls = state.log.filter((e) => e.kind === 'roll' && e.side === 'enemy');
    expect(rolls.length).toBeGreaterThan(0);
    expect(rolls.every((e) => e.kind === 'roll' && e.shield === 6)).toBe(true);
  });
});

// Iteration 40 (Overcharged rounds / "digital dice"): a weapon with
// `overcharge: true` rolls on a 7-face die instead of 6 — a natural 7
// always hits and deals +1 bonus damage. Swept across many seeds (no
// single fixed seed is known in advance to land a 7) rather than a
// brute-forced exact seed, since the point is "this can happen and pays
// off correctly when it does," not one specific sequence.
describe('Overcharged rounds — the 7-face die (iteration 40)', () => {
  it('an overcharged cannon can roll a natural 7, which always hits and deals +1 bonus damage; a plain cannon never rolls 7', () => {
    let sawSeven = false;
    for (let seed = 1; seed <= 300 && !sawSeven; seed++) {
      const fleet = [
        {
          stats: blankStats({
            hp: 50,
            cannons: [
              { diceCount: 1, damage: 1, overcharge: true },
              { diceCount: 1, damage: 1 }, // plain control weapon, same ship
            ],
          }),
          initialDamage: 0,
        },
      ];
      const foe = enemy({}, { hp: 500, computer: 0, shield: 0 });
      let state = initCombat(fleet, foe, seed);
      for (let i = 0; i < 5 && !state.winner; i++) state = advanceRound(state);

      const playerRolls = state.log.filter((e) => e.kind === 'roll' && e.side === 'player');
      const overchargedRolls = playerRolls.filter((_, i) => i % 2 === 0); // weapon 0 fires first each activation
      const plainRolls = playerRolls.filter((_, i) => i % 2 === 1);

      expect(plainRolls.every((e) => e.kind === 'roll' && e.raw <= 6)).toBe(true);

      const seven = overchargedRolls.find((e) => e.kind === 'roll' && e.raw === 7);
      if (seven && seven.kind === 'roll') {
        sawSeven = true;
        expect(seven.hit).toBe(true);
        expect(seven.damage).toBe(2); // base 1 + the overcharge bonus
      }
    }
    expect(sawSeven).toBe(true); // if this ever fails, the 7-face roll path is broken, not just unlucky
  });
});

// --- Iteration 42: four new per-die weapon mechanics ---------------------

describe('Graviton beam — chipOnMiss (iteration 42)', () => {
  it('a miss still deals the chip damage instead of the normal 0', () => {
    let found = false;
    for (let seed = 1; seed <= 200 && !found; seed++) {
      const fleet = [
        { stats: blankStats({ hp: 20, cannons: [{ diceCount: 1, damage: 2, chipOnMiss: 1 }] }), initialDamage: 0 },
      ];
      // computer 0 vs shield 100: every roll misses except a natural 6
      // (which always auto-hits regardless of the math) — so most seeds
      // land at least one real miss in round 1.
      const foe = enemy({}, { hp: 20, shield: 100 });
      let state = initCombat(fleet, foe, seed);
      state = advanceRound(state); // missile (no-op, no missiles equipped)
      state = advanceRound(state); // cannon round 1

      const rollEvents = state.log.filter((e) => e.kind === 'roll' && e.phase === 'cannon' && e.round === 1);
      const miss = rollEvents.find((e) => e.kind === 'roll' && !e.hit);
      if (miss) {
        found = true;
        expect(state.enemyShips[0].damage).toBe(1); // the chip damage landed despite the miss
      }
    }
    expect(found).toBe(true); // if this ever fails, chipOnMiss is broken, not just unlucky
  });

  it('a hit deals normal damage, not chip damage', () => {
    const fleet = [
      { stats: blankStats({ hp: 20, computer: 10, cannons: [{ diceCount: 1, damage: 2, chipOnMiss: 1 }] }), initialDamage: 0 },
    ];
    const foe = enemy({}, { hp: 20, shield: 0 });
    let state = initCombat(fleet, foe, 1);
    state = advanceRound(state); // missile
    state = advanceRound(state); // cannon round 1
    const rollEvents = state.log.filter((e) => e.kind === 'roll' && e.phase === 'cannon' && e.round === 1);
    const hit = rollEvents.find((e) => e.kind === 'roll' && e.hit);
    expect(hit).toBeTruthy();
    if (hit && hit.kind === 'roll') expect(hit.damage).toBe(2); // full weapon damage, not the 1-point chip
  });
});

describe('Executioner cannon — executeAtHp (iteration 42)', () => {
  // Exercised via a synthetic weapon (damage 1, execute-at-3) rather than
  // the shipped Executioner cannon's own numbers — with the shipped part's
  // damage(1) equal to its own executeAtHp(1), a target at exactly 1 HP
  // dies to the *normal* damage anyway, so its own stats can never actually
  // exercise the override. The field itself needs a real gap to prove out.
  it('a hit against a target at or below the threshold deals full remaining HP, not the base damage', () => {
    const fleet = [
      { stats: blankStats({ hp: 20, computer: 10, cannons: [{ diceCount: 1, damage: 1, executeAtHp: 3 }] }), initialDamage: 0 },
    ];
    const foe = enemy({}, { hp: 2, shield: 0 }); // remaining HP 2, at/below the threshold of 3
    let state = initCombat(fleet, foe, 1);
    state = advanceRound(state); // missile
    state = advanceRound(state); // cannon round 1
    const rollEvents = state.log.filter((e) => e.kind === 'roll' && e.phase === 'cannon' && e.round === 1);
    const hit = rollEvents.find((e) => e.kind === 'roll' && e.hit);
    expect(hit).toBeTruthy();
    if (hit && hit.kind === 'roll') expect(hit.damage).toBe(2); // remaining HP, not the base 1
    expect(state.enemyShips[0].damage).toBeGreaterThanOrEqual(2);
    expect(state.winner).toBe('player'); // the "1 dmg" cannon actually finished a 2-HP target in one die
  });

  it('a hit against a target above the threshold deals only the base damage', () => {
    const fleet = [
      { stats: blankStats({ hp: 20, computer: 10, cannons: [{ diceCount: 1, damage: 1, executeAtHp: 1 }] }), initialDamage: 0 },
    ];
    const foe = enemy({}, { hp: 5, shield: 0 }); // remaining HP 5, well above the threshold of 1
    let state = initCombat(fleet, foe, 1);
    state = advanceRound(state); // missile
    state = advanceRound(state); // cannon round 1
    const rollEvents = state.log.filter((e) => e.kind === 'roll' && e.phase === 'cannon' && e.round === 1);
    const hit = rollEvents.find((e) => e.kind === 'roll' && e.hit);
    expect(hit).toBeTruthy();
    if (hit && hit.kind === 'roll') expect(hit.damage).toBe(1); // base damage, the execute never triggers
  });
});

describe('Flechette cannon — cleaveDamage (iteration 42)', () => {
  it('a hit also splashes a second target for the cleave amount', () => {
    const fleet = [
      { stats: blankStats({ hp: 20, computer: 10, cannons: [{ diceCount: 1, damage: 1, cleaveDamage: 1 }] }), initialDamage: 0 },
    ];
    // Two same-HP enemies: pickTarget's stable tie-break keeps the first
    // as primary; the second call (primary excluded) lands on the other.
    const foe = enemy({ count: 2 }, { hp: 5, shield: 0 });
    let state = initCombat(fleet, foe, 1);
    state = advanceRound(state); // missile
    state = advanceRound(state); // cannon round 1
    expect(state.enemyShips[0].damage).toBe(1); // primary
    expect(state.enemyShips[1].damage).toBe(1); // splash
  });

  it('a miss deals no splash — cleave is gated on the primary die landing', () => {
    const fleet = [
      { stats: blankStats({ hp: 20, computer: 0, cannons: [{ diceCount: 1, damage: 1, cleaveDamage: 1 }] }), initialDamage: 0 },
    ];
    const foe = enemy({ count: 2 }, { hp: 5, shield: 100 });
    let found = false;
    for (let seed = 1; seed <= 200 && !found; seed++) {
      let state = initCombat(fleet, foe, seed);
      state = advanceRound(state); // missile
      state = advanceRound(state); // cannon round 1
      const rollEvents = state.log.filter((e) => e.kind === 'roll' && e.phase === 'cannon' && e.round === 1);
      const miss = rollEvents.find((e) => e.kind === 'roll' && !e.hit);
      if (miss) {
        found = true;
        expect(state.enemyShips[0].damage + state.enemyShips[1].damage).toBe(0);
      }
    }
    expect(found).toBe(true); // if this ever fails, the miss-gate is broken, not just unlucky
  });

  it('with only one enemy alive, cleave finds no second target and is a silent no-op', () => {
    const fleet = [
      { stats: blankStats({ hp: 20, computer: 10, cannons: [{ diceCount: 1, damage: 1, cleaveDamage: 1 }] }), initialDamage: 0 },
    ];
    const foe = enemy({}, { hp: 5, shield: 0 }); // just one enemy ship
    let state = initCombat(fleet, foe, 1);
    state = advanceRound(state); // missile
    state = advanceRound(state); // cannon round 1 — should not throw
    expect(state.enemyShips[0].damage).toBe(1);
  });
});

describe('Homing missile — bypassTaunt (iteration 42)', () => {
  it('ignores an alive taunter and lands on the plain lowest-HP defender instead', () => {
    const fleet = [
      { stats: blankStats({ hp: 20, missiles: [{ diceCount: 1, damage: 2, bypassTaunt: true }] }), initialDamage: 0 },
    ];
    const foe = enemy({
      groups: [
        { label: 'taunter', count: 1, stats: blankStats({ hp: 10, taunt: true }) },
        { label: 'squishy', count: 1, stats: blankStats({ hp: 2 }) },
      ],
    });
    let state = initCombat(fleet, foe, 1);
    state = advanceRound(state); // missile phase
    const rollEvents = state.log.filter((e) => e.kind === 'roll' && e.phase === 'missile' && e.side === 'player');
    expect(rollEvents).toHaveLength(1);
    if (rollEvents[0].kind === 'roll') expect(rollEvents[0].targetIndex).toBe(1); // the squishy, not the taunter at index 0
  });

  it('ignores the player priority-click and the "strongest" targeting stance too', () => {
    const fleet = [
      { stats: blankStats({ hp: 20, missiles: [{ diceCount: 1, damage: 2, bypassTaunt: true }] }), initialDamage: 0 },
    ];
    const foe = enemy({ count: 2 }, { hp: 5 });
    let state = initCombat(fleet, foe, 1, 'strongest');
    state = setPriorityTarget(state, 1); // click the second ship
    state = advanceRound(state); // missile phase
    const rollEvents = state.log.filter((e) => e.kind === 'roll' && e.phase === 'missile' && e.side === 'player');
    expect(rollEvents).toHaveLength(1);
    // Same HP on both — pickTarget's stable tie-break lands on index 0
    // (the lowest-HP default), neither the clicked priority(1) nor
    // "strongest" would have picked.
    if (rollEvents[0].kind === 'roll') expect(rollEvents[0].targetIndex).toBe(0);
  });

  it('a plain (non-homing) missile still respects taunt, for contrast', () => {
    const fleet = [
      { stats: blankStats({ hp: 20, missiles: [{ diceCount: 1, damage: 2 }] }), initialDamage: 0 },
    ];
    const foe = enemy({
      groups: [
        { label: 'taunter', count: 1, stats: blankStats({ hp: 10, taunt: true }) },
        { label: 'squishy', count: 1, stats: blankStats({ hp: 2 }) },
      ],
    });
    let state = initCombat(fleet, foe, 1);
    state = advanceRound(state); // missile phase
    const rollEvents = state.log.filter((e) => e.kind === 'roll' && e.phase === 'missile' && e.side === 'player');
    expect(rollEvents).toHaveLength(1);
    if (rollEvents[0].kind === 'roll') expect(rollEvents[0].targetIndex).toBe(0); // the taunter, as usual
  });
});
