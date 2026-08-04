import { describe, expect, it } from 'vitest';
import {
  applyVeterancy,
  bountyEnemyForColumn,
  combatEnemyPool,
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
    expect(core.stats.shield).toBe(5);
    for (const escort of escorts) {
      expect(escort.stats.shield).toBeLessThan(core.stats.shield);
    }
  });
});

describe('combatEnemyPool (iteration 8: act + depth band)', () => {
  it('act 1 uses the original pools, re-banded to easy 0-4 / mid 5-7 / hard 8-9 (iteration 22)', () => {
    expect(combatEnemyPool(1, 1)).toBe(EASY_POOL);
    expect(combatEnemyPool(1, 4)).toBe(EASY_POOL);
    expect(combatEnemyPool(1, 5)).toBe(MID_POOL);
    expect(combatEnemyPool(1, 7)).toBe(MID_POOL);
    expect(combatEnemyPool(1, 8)).toBe(HARD_POOL);
    expect(combatEnemyPool(1, 9)).toBe(HARD_POOL);
  });

  it('act 2 uses the new roster pools at the same column bands', () => {
    expect(combatEnemyPool(2, 0)).toBe(EASY_POOL_ACT2);
    expect(combatEnemyPool(2, 4)).toBe(EASY_POOL_ACT2);
    expect(combatEnemyPool(2, 5)).toBe(MID_POOL_ACT2);
    expect(combatEnemyPool(2, 7)).toBe(MID_POOL_ACT2);
    expect(combatEnemyPool(2, 8)).toBe(HARD_POOL_ACT2);
    expect(combatEnemyPool(2, 9)).toBe(HARD_POOL_ACT2);
  });

  it('act-2 pools introduce enemy-side flak, lance (shield-pierce), and rift (self-damage) tech', () => {
    const allAct2 = [...EASY_POOL_ACT2, ...MID_POOL_ACT2, ...HARD_POOL_ACT2];
    const allGroups = allAct2.flatMap((e) => e.groups);
    expect(allGroups.some((g) => (g.stats.flak ?? 0) > 0)).toBe(true);
    expect(allGroups.some((g) => g.stats.cannons.some((c) => (c.shieldPierce ?? 0) > 0))).toBe(true);
    expect(allGroups.some((g) => g.stats.cannons.some((c) => c.selfDamageOnNatOne))).toBe(true);
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

describe('eliteEnemyForColumn / bountyEnemyForColumn (act-aware)', () => {
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

  it('bountyEnemyForColumn draws from the correct act\'s pool', () => {
    const act1Bounty = bountyEnemyForColumn(1, 1);
    const act2Bounty = bountyEnemyForColumn(2, 1);
    expect(EASY_POOL.some((e) => act1Bounty.id === `${e.id}-bounty`)).toBe(true);
    expect(EASY_POOL_ACT2.some((e) => act2Bounty.id === `${e.id}-bounty`)).toBe(true);
  });

  it('hardestEnemyForAmbush draws from the correct act\'s band', () => {
    const act2Ambush = hardestEnemyForAmbush(2, 5);
    expect(MID_POOL_ACT2).toContain(act2Ambush);
  });
});

describe('veterancy (iteration 8)', () => {
  it('none at cols 0-4, +1 HP at 5-7, +2 HP at 8-9 (iteration 22)', () => {
    for (const col of [0, 1, 2, 3, 4]) expect(veterancyBonus(col)).toBe(0);
    for (const col of [5, 6, 7]) expect(veterancyBonus(col)).toBe(1);
    for (const col of [8, 9]) expect(veterancyBonus(col)).toBe(2);
  });

  it('applyVeterancy folds the bonus into every group\'s stats.hp and labels it; a no-op at col <= 4 leaves the enemy untouched', () => {
    const base = EASY_POOL[0];
    const untouched = applyVeterancy(base, 2);
    expect(untouched).toBe(base); // same reference — genuinely a no-op
    expect(untouched.veterancyBonus).toBeUndefined();

    const veteran = applyVeterancy(base, 8);
    expect(veteran.groups[0].stats.hp).toBe(base.groups[0].stats.hp + 2);
    expect(veteran.veterancyBonus).toBe(2);
  });

  it('stacks additively with the elite +2 HP bonus, across every group', () => {
    const base = EASY_POOL[0];
    const elite = eliteVariant(base);
    const veteranElite = applyVeterancy(elite, 8);
    expect(veteranElite.groups[0].stats.hp).toBe(base.groups[0].stats.hp + 2 + 2);
  });

  it('applies to every group of a formation enemy', () => {
    const formation = HARD_POOL.find((e) => e.groups.length > 1)!;
    const veteran = applyVeterancy(formation, 8);
    veteran.groups.forEach((g, i) => {
      expect(g.stats.hp).toBe(formation.groups[i].stats.hp + 2);
    });
  });
});
