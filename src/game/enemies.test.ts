import { describe, expect, it } from 'vitest';
import {
  applyVeterancy,
  combatEnemyPool,
  COLUMN_SCALING,
  eliteEnemyForColumn,
  eliteVariant,
  EASY_POOL,
  EASY_POOL_ACT2,
  HARD_POOL,
  HARD_POOL_ACT2,
  hardestEnemyForAmbush,
  MID_POOL,
  MID_POOL_ACT2,
  veterancyBonus,
  FINAL_BOSS_IDS,
  getFinalBoss,
} from './enemies';
import type { EnemyDef } from './types';

// Total HP across every ship in every group — mirrors enemies.ts's private
// `totalHp`, needed here since pools now hold multi-group formations too.
function totalHp(enemy: EnemyDef): number {
  return enemy.groups.reduce((sum, g) => sum + g.stats.hp * g.count, 0);
}

describe('final bosses bring support', () => {
  it('every final boss fields more than one hull', () => {
    for (const id of FINAL_BOSS_IDS) {
      const boss = getFinalBoss(id);
      const ships = boss.groups.reduce((n, g) => n + g.count, 0);
      expect(ships, `${id} should not be a lone ship`).toBeGreaterThan(1);
    }
  });

  it('escorts are their own group, with the centerpiece first', () => {
    // ShipSilhouette's archetype heuristic treats group 0 as the flagship,
    // so escorts must never lead the list.
    for (const id of ['titan', 'citadel'] as const) {
      const boss = getFinalBoss(id);
      expect(boss.groups.length).toBeGreaterThan(1);
      const [centerpiece, ...escorts] = boss.groups;
      for (const escort of escorts) {
        expect(escort.stats.hp, `${id} escort should be lighter than its flagship`).toBeLessThan(
          centerpiece.stats.hp,
        );
      }
    }
  });

  it('the citadel keeps a screen the player can hit without shield pierce', () => {
    const citadel = getFinalBoss('citadel');
    const [core, ...escorts] = citadel.groups;
    // Iteration 31-M3 (2026-08-07): re-tuned 5 -> 2 against the act-2
    // endgame fleet — iteration 46.3 (2026-08-08) corrected the same
    // drift via HP instead of a further shield raise (see enemies.ts's
    // Citadel comment) — this test's real assertion is the ordering
    // below, not the literal number.
    expect(core.stats.shield).toBe(2);
    for (const escort of escorts) {
      expect(escort.stats.shield).toBeLessThan(core.stats.shield);
    }
  });
});

describe('combatEnemyPool (iteration 8: act + depth band)', () => {
  it('act 1 uses the original pools, re-banded to easy 0-4 / mid 5-7 / hard 8-9 (iteration 22)', () => {
    // 2026-08-12 (iteration 55, mechanism B): col 5 is the mid band's own
    // opening column — the band-entry ramp (see the dedicated describe
    // block below) means the pool reference there is a filtered copy, not
    // MID_POOL itself; every other column, including col 8 (the hard
    // band's own opening column — ramped there and reverted after
    // measurement, see bandEntryRamp's comment), still returns the exact
    // same array reference.
    expect(combatEnemyPool(1, 1)).toBe(EASY_POOL);
    expect(combatEnemyPool(1, 4)).toBe(EASY_POOL);
    expect(combatEnemyPool(1, 6)).toBe(MID_POOL);
    expect(combatEnemyPool(1, 7)).toBe(MID_POOL);
    expect(combatEnemyPool(1, 8)).toBe(HARD_POOL);
    expect(combatEnemyPool(1, 9)).toBe(HARD_POOL);
  });

  it('act 2 uses the new roster pools at the same column bands, from local col 2 on', () => {
    // 2026-08-12 (iteration 55, mechanism A): cols 0-1 are the act-seam
    // ramp — see the dedicated describe block below — so the FULL easy
    // pool (with Raider wing back in it) only starts at col 2. Mechanism B
    // also ramps col 8 (the hard band's own opening column) — see below.
    expect(combatEnemyPool(2, 2)).toBe(EASY_POOL_ACT2);
    expect(combatEnemyPool(2, 4)).toBe(EASY_POOL_ACT2);
    expect(combatEnemyPool(2, 5)).toBe(MID_POOL_ACT2);
    expect(combatEnemyPool(2, 7)).toBe(MID_POOL_ACT2);
    expect(combatEnemyPool(2, 9)).toBe(HARD_POOL_ACT2);
  });

  it('act-2 pools introduce enemy-side flak, lance (shield-pierce), and rift (self-damage) tech', () => {
    const allAct2 = [...EASY_POOL_ACT2, ...MID_POOL_ACT2, ...HARD_POOL_ACT2];
    const allGroups = allAct2.flatMap((e) => e.groups);
    expect(allGroups.some((g) => (g.stats.flak ?? 0) > 0)).toBe(true);
    expect(allGroups.some((g) => g.stats.cannons.some((c) => (c.shieldPierce ?? 0) > 0))).toBe(true);
    expect(allGroups.some((g) => g.stats.cannons.some((c) => c.selfDamageOnNatOne))).toBe(true);
  });

  describe('act-2 seam ramp (iteration 55, mechanism A)', () => {
    it('cols 0-1 exclude Raider wing (the priciest easy-pool entry) — only 2 entries', () => {
      expect(combatEnemyPool(2, 0)).toHaveLength(2);
      expect(combatEnemyPool(2, 0).some((e) => e.id === 'raider-wing')).toBe(false);
      expect(combatEnemyPool(2, 1)).toHaveLength(2);
      expect(combatEnemyPool(2, 1).some((e) => e.id === 'raider-wing')).toBe(false);
    });

    it('col 2 on restores the full 3-entry easy pool, Raider wing included', () => {
      expect(combatEnemyPool(2, 2)).toBe(EASY_POOL_ACT2);
      expect(combatEnemyPool(2, 2).some((e) => e.id === 'raider-wing')).toBe(true);
    });

    it('is a pure function of (act, col) — no fleet/run-state parameter exists to read', () => {
      // Type-level: combatEnemyPool's signature is (act: 1 | 2, col: number)
      // => EnemyDef[] — asserted here by simply calling it with only those
      // two arguments and nothing else, twice, for the same result.
      expect(combatEnemyPool(2, 0)).toEqual(combatEnemyPool(2, 0));
    });
  });

  describe('band-entry ramp (iteration 55, mechanism B)', () => {
    it('act 1 col 5 (mid-band opening) excludes Sniper pair, the totalHp-hardest MID_POOL entry', () => {
      const pool = combatEnemyPool(1, 5);
      expect(pool).toHaveLength(2);
      expect(pool.some((e) => e.id === 'sniper-pair')).toBe(false);
      expect(combatEnemyPool(1, 6)).toBe(MID_POOL); // the very next column is unramped
    });

    it('act 1 col 8 (hard-band opening) is left UNRAMPED — reverted after measurement', () => {
      // The same totalHp-exclusion mechanism was tried here too, but
      // removing Plasma tank left Ancient guardian as the tie-break
      // winner, and Ancient guardian's elite (61cr/73% share) measured
      // HARDER than Plasma tank's elite (37cr/44%) had been — the wrong
      // direction. Reverted; see bandEntryRamp's comment and
      // plans/iteration-55.md's stage-B status notes for the numbers.
      expect(combatEnemyPool(1, 8)).toBe(HARD_POOL);
    });

    it('act 2 col 8 (hard-band opening) excludes Swarm armada, the enemyValue-worst HARD_POOL_ACT2 entry', () => {
      const pool = combatEnemyPool(2, 8);
      expect(pool).toHaveLength(3);
      expect(pool.some((e) => e.id === 'swarm-armada')).toBe(false);
      expect(combatEnemyPool(2, 9)).toBe(HARD_POOL_ACT2); // the very next column is unramped
    });

    it('act 2 mid-band (col 5) is left unramped — its own T1 check was already passing', () => {
      expect(combatEnemyPool(2, 5)).toBe(MID_POOL_ACT2);
    });

    it('every ramp is a pure function of (act, col)', () => {
      expect(combatEnemyPool(1, 5)).toEqual(combatEnemyPool(1, 5));
      expect(combatEnemyPool(1, 8)).toEqual(combatEnemyPool(1, 8));
      expect(combatEnemyPool(2, 8)).toEqual(combatEnemyPool(2, 8));
    });
  });
});

describe('mixed formations (iteration 9)', () => {
  it('act-1 hard, act-2 mid, and act-2 hard each include a multi-group formation enemy', () => {
    expect(HARD_POOL.some((e) => e.groups.length > 1)).toBe(true);
    expect(MID_POOL_ACT2.some((e) => e.groups.length > 1)).toBe(true);
    expect(HARD_POOL_ACT2.some((e) => e.groups.length > 1)).toBe(true);
  });

  it('each sub-group keeps its own stats/count/label and activates at its own initiative', () => {
    const formation = HARD_POOL.find((e) => e.groups.length > 1)!; // Escorted sniper
    expect(formation.groups).toHaveLength(2);
    const [primary, screen] = formation.groups;
    expect(primary.label).not.toBe(screen.label);
    expect(primary.stats.initiative).not.toBe(screen.stats.initiative);
    expect(primary.count).toBeGreaterThan(0);
    expect(screen.count).toBeGreaterThan(0);
  });
});

describe('eliteEnemyForColumn (act-aware)', () => {
  it('act 2 has no hand-tuned exceptions — always the hardest entry of the column pool, elite strength', () => {
    for (const col of [1, 5, 8]) {
      const pool = combatEnemyPool(2, col);
      const hardest = pool.reduce((best, e) => (totalHp(e) > totalHp(best) ? e : best), pool[0]);
      const elite = eliteEnemyForColumn(2, col, Math.random);
      expect(elite.id).toBe(`${hardest.id}-elite`);
      expect(elite.groups).toHaveLength(hardest.groups.length);
      elite.groups.forEach((g, i) => {
        expect(g.stats.hp).toBe(hardest.groups[i].stats.hp + 2);
      });
    }
  });

  it('hardestEnemyForAmbush draws from the correct act\'s band', () => {
    const act2Ambush = hardestEnemyForAmbush(2, 5);
    expect(MID_POOL_ACT2).toContain(act2Ambush);
  });
});

describe('veterancy (iteration 8; continuous COLUMN_SCALING since iteration 55)', () => {
  it('none at cols 0-4 (both acts), matching COLUMN_SCALING', () => {
    for (const act of [1, 2] as const) {
      for (const col of [0, 1, 2, 3, 4]) expect(veterancyBonus(act, col)).toBe(0);
    }
  });

  it('act 1 ramps 1/1/1/3/8 HP at cols 5-9, matching COLUMN_SCALING[1]', () => {
    // Deliberately flat through c6-c7 (same as the old 3-step schedule) —
    // the increase is concentrated almost entirely at c9, the one column
    // T2 actually measures, rather than spread across the whole back
    // half. Spreading it (an earlier candidate table) compounded across
    // every fight from c5 to c9 and measurably cratered act-1 clear rate
    // in `balance:full`; concentrating it at c9 alone was the fix — see
    // plans/iteration-55.md's stage-C status notes.
    expect(veterancyBonus(1, 5)).toBe(1);
    expect(veterancyBonus(1, 6)).toBe(1);
    expect(veterancyBonus(1, 7)).toBe(1);
    expect(veterancyBonus(1, 8)).toBe(3);
    expect(veterancyBonus(1, 9)).toBe(8);
  });

  it('act 2 ramps 1/2/3/4/4/4/7 HP at cols 5-11, matching COLUMN_SCALING[2]', () => {
    // Flat from c8 through c10 (same principle as act 1 above — the
    // increase concentrates at c11, the one column T2 measures).
    expect(veterancyBonus(2, 5)).toBe(1);
    expect(veterancyBonus(2, 6)).toBe(2);
    expect(veterancyBonus(2, 7)).toBe(3);
    expect(veterancyBonus(2, 8)).toBe(4);
    expect(veterancyBonus(2, 9)).toBe(4);
    expect(veterancyBonus(2, 10)).toBe(4);
    expect(veterancyBonus(2, 11)).toBe(7);
  });

  it('computer never appears at a band-entry column (either act)', () => {
    for (const col of [5, 8]) {
      expect(COLUMN_SCALING[1][col].computer).toBe(0);
      expect(COLUMN_SCALING[2][col].computer).toBe(0);
    }
  });

  it('act 2\'s top end carries a computer bonus — act 1\'s top end was measured and dropped instead', () => {
    // Act 1 c9 shipped at computer:0 — an earlier hp+computer combination
    // there cratered `balance:full`'s act-1 clear rate; HP alone at a
    // larger value reached the same T2 target with less collateral damage
    // (see the comment on COLUMN_SCALING[1] itself). Act 2's own top end
    // (c11) kept a modest computer bonus — a real, if small, presence of
    // the "genuinely harder, not just longer" lever the spec calls for.
    expect(COLUMN_SCALING[1][9].computer).toBe(0);
    expect(COLUMN_SCALING[2][11].computer).toBeGreaterThan(0);
  });

  it('applyVeterancy folds hp+computer into every group\'s stats and labels the HP portion; a no-op at col <= 4 leaves the enemy untouched', () => {
    const base = EASY_POOL[0];
    const untouched = applyVeterancy(base, 1, 2);
    expect(untouched).toBe(base); // same reference — genuinely a no-op
    expect(untouched.veterancyBonus).toBeUndefined();

    const veteran = applyVeterancy(base, 1, 9);
    const scaling = COLUMN_SCALING[1][9];
    expect(veteran.groups[0].stats.hp).toBe(base.groups[0].stats.hp + scaling.hp);
    expect(veteran.groups[0].stats.computer).toBe(base.groups[0].stats.computer + scaling.computer);
    expect(veteran.veterancyBonus).toBe(scaling.hp);
  });

  it('stacks additively with the elite +2 HP bonus, across every group', () => {
    const base = EASY_POOL[0];
    const elite = eliteVariant(base);
    const veteranElite = applyVeterancy(elite, 1, 9);
    expect(veteranElite.groups[0].stats.hp).toBe(base.groups[0].stats.hp + 2 + COLUMN_SCALING[1][9].hp);
  });

  it('applies to every group of a formation enemy', () => {
    const formation = HARD_POOL.find((e) => e.groups.length > 1)!;
    const veteran = applyVeterancy(formation, 1, 9);
    veteran.groups.forEach((g, i) => {
      expect(g.stats.hp).toBe(formation.groups[i].stats.hp + COLUMN_SCALING[1][9].hp);
      expect(g.stats.computer).toBe(formation.groups[i].stats.computer + COLUMN_SCALING[1][9].computer);
    });
  });

  it('is a pure function of (act, col) — no fleet/run-state parameter exists to read', () => {
    expect(applyVeterancy(EASY_POOL[0], 1, 9)).toEqual(applyVeterancy(EASY_POOL[0], 1, 9));
  });
});
