import { describe, expect, it } from 'vitest';
import {
  BOSSES,
  EASY_POOL,
  EASY_POOL_ACT2,
  FINAL_BOSSES,
  GAUNTLET,
  HARD_POOL,
  HARD_POOL_ACT2,
  MID_POOL,
  MID_POOL_ACT2,
  OPENER,
} from './enemies';
import type { EnemyDef } from './types';
import { ENEMY_LORE, getEnemyLore } from './enemyLore';

// The lore lives in its own module keyed by id, which means it can silently
// drift out of sync with enemies.ts. These tests are the tripwire: add an
// enemy without flavor text and this fails, naming the id that's missing.

// Every enemy the player can actually be sent against. The act-2 extras
// (escorted sniper, carrier group, command wing) are push()ed into these
// pools at module load, so collecting the pools picks them up too.
const ALL_ENEMIES: EnemyDef[] = [
  ...GAUNTLET,
  ...EASY_POOL,
  ...MID_POOL,
  ...HARD_POOL,
  ...EASY_POOL_ACT2,
  ...MID_POOL_ACT2,
  ...HARD_POOL_ACT2,
  ...Object.values(BOSSES),
  ...Object.values(FINAL_BOSSES),
  OPENER,
];

describe('enemy lore coverage', () => {
  it('covers every enemy the player can be sent against', () => {
    const missing = [...new Set(ALL_ENEMIES.map((e) => e.id))].filter((id) => !getEnemyLore(id)).sort();
    expect(missing).toEqual([]);
  });

  it('has no lore keyed to an id that does not exist', () => {
    const real = new Set(ALL_ENEMIES.map((e) => e.id));
    const orphans = Object.keys(ENEMY_LORE).filter((id) => !real.has(id)).sort();
    expect(orphans).toEqual([]);
  });

  it('resolves an ambush variant back to its base enemy', () => {
    // hunterKillerForAmbush reuses a base stat block under a suffixed id —
    // the flavor should follow.
    const base = getEnemyLore('sniper');
    expect(base).toBeTruthy();
    expect(getEnemyLore('sniper-hunter')).toBe(base);
  });

  it('returns undefined for an unknown enemy rather than throwing', () => {
    expect(getEnemyLore('not-a-real-enemy')).toBeUndefined();
  });

  it('keeps every line short enough to read before a fight', () => {
    for (const [id, text] of Object.entries(ENEMY_LORE)) {
      expect(text.trim(), `${id} lore is empty`).not.toBe('');
      expect(text.length, `${id} lore is too long`).toBeLessThanOrEqual(240);
    }
  });

  it('stays distinct from the tactical blurb', () => {
    // blurb tells you what to bring; lore tells you who they are. If they
    // ever match, one of them is doing the other's job.
    for (const enemy of ALL_ENEMIES) {
      const lore = getEnemyLore(enemy.id);
      if (lore) expect(lore).not.toBe(enemy.blurb);
    }
  });
});
