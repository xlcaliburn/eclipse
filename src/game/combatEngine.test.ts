import { describe, expect, it } from 'vitest';
import {
  advanceRound,
  applyVolley,
  armBulkheads,
  canUseActive,
  combatOutcome,
  hasMissilePhase,
  initCombat,
  runToEnd,
  unconsumedContingentCards,
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

describe('cards (iteration 7: pool trimmed to {bulkheads, volley})', () => {
  it('bulkheads converts a lethal hit into 1-HP survival, then is consumed', () => {
    // A single die per activation (not several), so the very first lethal
    // hit is the only thing that can trigger — and trigger it must, since a
    // computer of 10 hits on anything but a natural 1.
    const fleet = [{ stats: blankStats({ hp: 2 }), initialDamage: 0 }];
    const foe = enemy(
      {},
      { initiative: 5, hp: 5, computer: 10, cannons: [{ diceCount: 1, damage: 5 }] },
    );
    let state = initCombat(fleet, foe, 9);
    state = armBulkheads(state);

    let bulkheadsFired = false;
    let damageAtTrigger = -1;
    let guard = 0;
    while (!state.winner && !bulkheadsFired && guard < 20) {
      state = advanceRound(state);
      bulkheadsFired = state.log.some((e) => e.kind === 'card' && e.cardId === 'bulkheads');
      if (bulkheadsFired) damageAtTrigger = state.playerShips[0].damage;
      guard++;
    }

    expect(bulkheadsFired).toBe(true);
    // The hit that triggered it must have left the ship at exactly 1 HP,
    // not destroyed.
    expect(damageAtTrigger).toBe(state.playerShips[0].stats.hp - 1);
    expect(unconsumedContingentCards(state)).toEqual([]);
  });

  it('the exact scenario the card exists for: same seed, loses without bulkheads, wins with it', () => {
    // Found by brute-force seed search over a scenario tuned so a single
    // enemy hit is virtually always lethal and virtually always lands.
    const playerStats: ShipStats = {
      initiative: 0,
      hp: 2,
      computer: 10,
      shield: 0,
      cannons: [{ diceCount: 1, damage: 1 }],
      missiles: [],
    };
    const foe = enemy(
      {},
      { initiative: 5, hp: 1, computer: 10, cannons: [{ diceCount: 1, damage: 5 }] },
    );
    const seed = 2;

    const withoutCard = runToEnd(initCombat([{ stats: playerStats, initialDamage: 0 }], foe, seed));
    const withCard = runToEnd(armBulkheads(initCombat([{ stats: playerStats, initialDamage: 0 }], foe, seed)));

    expect(withoutCard.winner).toBe('enemy');
    expect(withCard.winner).toBe('player');
  });

  it('volley doubles every player cannon die for exactly one round', () => {
    const fleet = [
      { stats: blankStats({ initiative: 5, computer: 10, hp: 5, cannons: [{ diceCount: 2, damage: 1 }] }), initialDamage: 0 },
    ];
    const foe = enemy({}, { hp: 20 });
    let state = initCombat(fleet, foe, 1);
    state = advanceRound(state); // missile (no-op)
    state = applyVolley(state);
    state = advanceRound(state); // cannon round 1 — doubled to 4 dice
    const round1PlayerRolls = state.log.filter((e) => e.kind === 'roll' && e.phase === 'cannon' && e.round === 1 && e.side === 'player');
    expect(round1PlayerRolls).toHaveLength(4);

    state = advanceRound(state); // cannon round 2 — back to the normal 2 dice
    const round2PlayerRolls = state.log.filter((e) => e.kind === 'roll' && e.phase === 'cannon' && e.round === 2 && e.side === 'player');
    expect(round2PlayerRolls).toHaveLength(2);
  });
});

describe('active parts (iteration 7)', () => {
  it('injector: this round, all player ships fire first (like the retired overdrive card)', () => {
    const fleet = [
      {
        stats: blankStats({ initiative: 0, hp: 5, cannons: [{ diceCount: 1, damage: 1 }], actives: ['injector'] }),
        initialDamage: 0,
      },
    ];
    const foe = enemy({}, { initiative: 5, hp: 5, cannons: [{ diceCount: 1, damage: 1 }] });
    let state = initCombat(fleet, foe, 7);
    state = advanceRound(state); // missile (no weapons involved)
    state = useActive(state, 0, 0);
    state = advanceRound(state); // cannon round 1 — player should fire first now
    const round1Rolls = state.log.filter((e) => e.kind === 'roll' && e.phase === 'cannon' && e.round === 1);
    expect((round1Rolls[0] as { side: string }).side).toBe('player');
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
    const foe = enemy({}, { initiative: 5, hp: 5, computer: 10, cannons: [{ diceCount: 2, damage: 1 }] });
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
    // cannon round, giving exactly 2 hit attempts in round 1.
    const foe = enemy({ count: 2 }, { initiative: 5, computer: 10, hp: 5, cannons: [{ diceCount: 1, damage: 2 }] });
    let state = initCombat(fleet, foe, 2); // seed chosen so both enemy dice land (comp 10 can still miss on a nat 1)
    state = advanceRound(state); // missile
    state = advanceRound(state); // cannon round 1

    const negations = state.log.filter((e) => e.kind === 'part-effect' && e.text.includes('Reactive armor'));
    expect(negations).toHaveLength(1);
    expect(state.playerShips[0].damage).toBe(2); // only the second hit landed
  });

  it('stacks: N armors negate the first N hits per round', () => {
    const fleet = [{ stats: blankStats({ hp: 10, reactiveArmor: 2 }), initialDamage: 0 }];
    const foe = enemy({ count: 3 }, { initiative: 5, computer: 10, hp: 5, cannons: [{ diceCount: 1, damage: 2 }] });
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
    const foe = enemy({ count: 2 }, { initiative: 5, computer: 10, hp: 5, cannons: [{ diceCount: 1, damage: 5 }] });
    let state = initCombat(fleet, foe, 2); // seed chosen so both enemy dice land
    state = advanceRound(state); // missile
    state = advanceRound(state); // cannon round 1 — 2 hit attempts this round

    const jinks = state.log.filter((e) => e.kind === 'part-effect' && e.text.includes('jinks'));
    expect(jinks).toHaveLength(1);
    expect(state.playerShips[0].damage).toBe(5); // only the second hit landed
  });

  it('is consumed before reactive armor gets a chance', () => {
    const fleet = [{ stats: blankStats({ hp: 20, jink: true, reactiveArmor: 1 }), initialDamage: 0 }];
    const foe = enemy({ count: 2 }, { initiative: 5, computer: 10, hp: 5, cannons: [{ diceCount: 1, damage: 5 }] });
    let state = initCombat(fleet, foe, 2);
    state = advanceRound(state); // missile
    state = advanceRound(state); // cannon round 1 — 2 hit attempts: jink eats #1, reactive armor eats #2

    expect(state.log.some((e) => e.kind === 'part-effect' && e.text.includes('jinks'))).toBe(true);
    expect(state.log.some((e) => e.kind === 'part-effect' && e.text.includes('Reactive armor'))).toBe(true);
    expect(state.playerShips[0].damage).toBe(0); // both hits negated, by two different defenses
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

describe('mixed enemy formations (iteration 9.3)', () => {
  it('each sub-group activates at its own initiative, via the existing activation machinery', () => {
    const fleet = [{ stats: blankStats({ initiative: -1, hp: 20 }), initialDamage: 0 }]; // never fires first
    const foe = enemy({
      groups: [
        { label: 'fast', count: 1, stats: blankStats({ initiative: 5, hp: 5, cannons: [{ diceCount: 1, damage: 1 }] }) },
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
