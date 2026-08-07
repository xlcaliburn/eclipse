import { describe, expect, it } from 'vitest';
import { BOSS_IDS, FINAL_BOSS_IDS } from './enemies';
import { mulberry32 } from './rng';
import { actColumns, bossColumn, generateMap, getNode, laneColumns, nodesConnect, reachableNodes } from './map';
import type { CargoTag } from './map';

// Mirrors map.ts's ACT1_QUOTAS/ACT2_QUOTAS — see that file's comment for
// why iteration 20 changed columns 1 and 9, iteration 33 for why columns 5
// and 9 (act 1) / 5 and 9 (act 2) became 'shipyard', and iteration 32 for
// why act 2 grew from 10 columns x 3 lanes to 12 columns x 4 lanes.
const ACT1_QUOTAS = [
  ['opener'],
  ['combat', 'combat', 'event'],
  ['combat', 'combat', 'event'],
  ['shop', 'combat', 'event'],
  ['elite', 'combat', 'event'],
  ['repair', 'shipyard', 'combat'],
  ['repair', 'combat', 'event'],
  ['elite', 'combat', 'event'],
  ['shop', 'elite', 'combat'],
  ['shipyard', 'elite', 'combat'],
];

const ACT2_QUOTAS = [
  ['combat', 'combat', 'combat', 'event'],
  ['combat', 'combat', 'event', 'shop'],
  ['elite', 'combat', 'combat', 'event'],
  ['repair', 'shop', 'combat', 'combat'],
  ['elite', 'combat', 'event', 'combat'],
  ['shipyard', 'combat', 'elite', 'event'],
  ['repair', 'combat', 'combat', 'event'],
  ['elite', 'elite', 'combat', 'shop'],
  ['combat', 'elite', 'event', 'repair'],
  ['shipyard', 'elite', 'combat', 'combat'],
  ['repair', 'elite', 'combat', 'event'],
  ['shop', 'elite', 'elite', 'combat'],
];

describe('generateMap', () => {
  it('produces the same full run for the same seed — both acts, both boss picks', () => {
    const mapA = generateMap(123, mulberry32(123));
    const mapB = generateMap(123, mulberry32(123));
    expect(JSON.stringify(mapA)).toBe(JSON.stringify(mapB));
  });

  it('each act is its own lane count + a single boss node (act 1: 10+1, act 2: 12+1)', () => {
    const map = generateMap(1, mulberry32(1));
    for (const [act, columns] of [[1, map.act1Columns], [2, map.act2Columns]] as const) {
      expect(columns).toHaveLength(laneColumns(act) + 1);
      expect(columns[bossColumn(act)]).toHaveLength(1);
      expect(columns[bossColumn(act)][0].type).toBe('boss');
    }
  });

  it('act-1 column 0 is a single opener node; every other act-1 lane column has 3 nodes', () => {
    const map = generateMap(1, mulberry32(1));
    expect(map.act1Columns[0]).toHaveLength(1);
    expect(map.act1Columns[0][0].type).toBe('opener');
    for (let col = 1; col < laneColumns(1); col++) {
      expect(map.act1Columns[col]).toHaveLength(3);
    }
  });

  it('every act-2 lane column has 4 nodes (iteration 32: 4 lanes, not 3)', () => {
    const map = generateMap(1, mulberry32(1));
    for (let col = 0; col < laneColumns(2); col++) {
      expect(map.act2Columns[col]).toHaveLength(4);
    }
  });

  it('matches the exact per-column type quota for both acts (as a set, order shuffled)', () => {
    const map = generateMap(7, mulberry32(7));
    for (let col = 0; col < laneColumns(1); col++) {
      const actual = map.act1Columns[col].map((n) => n.type).sort();
      const expected = [...ACT1_QUOTAS[col]].sort();
      expect(actual).toEqual(expected);
    }
    for (let col = 0; col < laneColumns(2); col++) {
      const actual = map.act2Columns[col].map((n) => n.type).sort();
      const expected = [...ACT2_QUOTAS[col]].sort();
      expect(actual).toEqual(expected);
    }
  });

  it('every node has row indices matching its position in the column array', () => {
    const map = generateMap(99, mulberry32(99));
    for (const columns of [map.act1Columns, map.act2Columns]) {
      for (const column of columns) {
        column.forEach((node, row) => {
          expect(node.row).toBe(row);
        });
      }
    }
  });

  it('picks one of the three mid-bosses for act 1 and one of the three final bosses for act 2, seeded', () => {
    const mapA = generateMap(123, mulberry32(123));
    const mapB = generateMap(123, mulberry32(123));
    expect(BOSS_IDS).toContain(mapA.act1BossId);
    expect(FINAL_BOSS_IDS).toContain(mapA.act2BossId);
    expect(mapB.act1BossId).toBe(mapA.act1BossId);
    expect(mapB.act2BossId).toBe(mapA.act2BossId);
  });
});

// --- Cargo tags (iteration 15.1) ---------------------------------------
describe('cargo tags', () => {
  const VALID_TAGS: CargoTag[] = ['patrol', 'convoy', 'wreck', 'command'];

  function allNodes(map: ReturnType<typeof generateMap>) {
    return [...map.act1Columns.flat(), ...map.act2Columns.flat()];
  }

  it('every plain combat node gets one of the 4 valid tags', () => {
    const map = generateMap(11, mulberry32(11));
    for (const node of allNodes(map)) {
      if (node.type === 'combat') {
        expect(node.cargo).toBeDefined();
        expect(VALID_TAGS).toContain(node.cargo);
      }
    }
  });

  it('elites, the boss, and the opener are never tagged', () => {
    const map = generateMap(11, mulberry32(11));
    for (const node of allNodes(map)) {
      if (node.type !== 'combat') {
        expect(node.cargo).toBeUndefined();
      }
    }
    expect(map.act1Columns[0][0].type).toBe('opener');
    expect(map.act1Columns[0][0].cargo).toBeUndefined();
  });

  it('the same seed produces the same cargo map (determinism)', () => {
    const mapA = generateMap(456, mulberry32(456));
    const mapB = generateMap(456, mulberry32(456));
    expect(JSON.stringify(mapA)).toBe(JSON.stringify(mapB));
    const combatCargoA = mapA.act1Columns.flat().filter((n) => n.type === 'combat').map((n) => n.cargo);
    expect(combatCargoA.length).toBeGreaterThan(0);
  });

  it('over many combat nodes, all 4 tags appear (weighted draw is actually drawing from the full table)', () => {
    const map = generateMap(999, mulberry32(999));
    const tags = new Set(allNodes(map).filter((n) => n.type === 'combat').map((n) => n.cargo));
    // 22 columns' worth of combat nodes across both acts is comfortably
    // enough for all 4 weighted outcomes to show up at least once.
    for (const tag of VALID_TAGS) {
      expect(tags.has(tag)).toBe(true);
    }
  });
});

describe('nodesConnect / reachableNodes', () => {
  it('only connects nodes in adjacent columns with |row diff| <= 1', () => {
    expect(nodesConnect({ col: 0, row: 0 }, { col: 1, row: 0 })).toBe(true);
    expect(nodesConnect({ col: 0, row: 0 }, { col: 1, row: 1 })).toBe(true);
    expect(nodesConnect({ col: 0, row: 0 }, { col: 1, row: 2 })).toBe(false);
    expect(nodesConnect({ col: 0, row: 0 }, { col: 2, row: 0 })).toBe(false);
  });

  it('a single-node target column (the boss) connects from every lane, given the structural flag', () => {
    expect(nodesConnect({ col: 9, row: 0 }, { col: bossColumn(1), row: 0 }, true)).toBe(true);
    expect(nodesConnect({ col: 9, row: 1 }, { col: bossColumn(1), row: 0 }, true)).toBe(true);
    expect(nodesConnect({ col: 9, row: 2 }, { col: bossColumn(1), row: 0 }, true)).toBe(true);
    // Without the flag, the boss column falls back to the normal |row
    // diff| <= 1 rule — the flag is what makes it single-node-reachable,
    // not the column number (iteration 32: acts no longer share one).
    expect(nodesConnect({ col: 9, row: 2 }, { col: bossColumn(1), row: 0 })).toBe(false);
  });

  it('every act-2 column-11 node connects to act 2\'s own (farther) boss column', () => {
    for (const fromRow of [0, 1, 2, 3]) {
      expect(nodesConnect({ col: 11, row: fromRow }, { col: bossColumn(2), row: 0 }, true)).toBe(true);
    }
  });

  it('reachableNodes from null returns all of column 0', () => {
    const map = generateMap(5, mulberry32(5));
    const columns = actColumns(map, 2);
    expect(reachableNodes(columns, null)).toEqual(columns[0]);
  });

  it("the act-1 opener (a single node) connects to all of column 1", () => {
    const map = generateMap(5, mulberry32(5));
    const columns = actColumns(map, 1);
    const opener = columns[0][0];
    expect(reachableNodes(columns, { col: opener.col, row: opener.row })).toEqual(columns[1]);
  });

  it('every node in columns 1..boss is reachable from at least one node in the previous column (act-scoped)', () => {
    const map = generateMap(42, mulberry32(42));
    for (const act of [1, 2] as const) {
      const columns = actColumns(map, act);
      for (let col = 1; col <= laneColumns(act); col++) {
        const fromColumn = columns[col - 1];
        const toColumn = columns[col];
        // A single-node "from" column (the act-1 opener) connects to
        // everything in the next column, overriding the normal +/-1 rule;
        // a single-node "to" column (the boss) connects FROM everything
        // in the previous column, same override in the other direction.
        for (const node of toColumn) {
          const reachableFromSomewhere =
            fromColumn.length === 1 ||
            fromColumn.some((prev) => nodesConnect(prev, node, toColumn.length === 1));
          expect(reachableFromSomewhere).toBe(true);
        }
      }
    }
  });

  it('getNode returns the node at a given position', () => {
    const map = generateMap(3, mulberry32(3));
    const columns = actColumns(map, 1);
    const node = getNode(columns, { col: 2, row: 1 });
    expect(node).toBe(columns[2][1]);
  });
});

// Iteration 22.2: about a third of act-1 sim runs used to reach the
// mid-tier pool having never been able to route into column 3's shop,
// because its row was left to the shuffle and a player boxed into row 0 or
// row 2 at column 2 could find it unreachable. The shop is now pinned to
// row 1, which nodesConnect's |row diff| <= 1 rule makes reachable from
// every row of the previous column.
describe('act-1 column-3 shop is always reachable (iteration 22.2)', () => {
  it('the column-3 shop is always at row 1', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const map = generateMap(seed, mulberry32(seed));
      const col3 = map.act1Columns[3];
      const shop = col3.find((n) => n.type === 'shop')!;
      expect(shop.row).toBe(1);
    }
  });

  it('every row of column 2 can reach the column-3 shop', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const map = generateMap(seed, mulberry32(seed));
      const shop = map.act1Columns[3].find((n) => n.type === 'shop')!;
      for (const fromRow of [0, 1, 2]) {
        expect(nodesConnect({ col: 2, row: fromRow }, { col: shop.col, row: shop.row })).toBe(true);
      }
    }
  });

  it('act-1 column 3 still carries its full quota as a set (combat + event alongside the pinned shop)', () => {
    const map = generateMap(7, mulberry32(7));
    const types = map.act1Columns[3].map((n) => n.type).sort();
    expect(types).toEqual(['combat', 'event', 'shop']);
  });

  it("act 2 is untouched — its own column-1 shop (the quota's only guaranteed shop-bearing column near the front) is not pinned", () => {
    // Act 2's quota at column 1 (0-indexed) is
    // ['combat', 'combat', 'event', 'shop'] — pick a handful of seeds and
    // confirm at least one places the shop outside row 1, proving act 2
    // was never touched by the act-1-only pin.
    const rows = new Set<number>();
    for (let seed = 1; seed <= 20; seed++) {
      const map = generateMap(seed, mulberry32(seed));
      const shop = map.act2Columns[1].find((n) => n.type === 'shop');
      if (shop) rows.add(shop.row);
    }
    expect(rows.size).toBeGreaterThan(1);
  });
});

// Iteration 32.2: FTL's "roundabout path" — 2 seeded shortcuts per map,
// each skipping exactly one act-2 column.
describe('act2Shortcuts (iteration 32.2, warp lanes)', () => {
  it('is deterministic for the same seed', () => {
    const mapA = generateMap(17, mulberry32(17));
    const mapB = generateMap(17, mulberry32(17));
    expect(mapA.act2Shortcuts).toEqual(mapB.act2Shortcuts);
  });

  it('every map gets exactly 2 shortcuts, across many seeds', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const map = generateMap(seed, mulberry32(seed));
      expect(map.act2Shortcuts).toHaveLength(2);
    }
  });

  it('every shortcut satisfies every placement rule, across many seeds', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const map = generateMap(seed, mulberry32(seed));
      const shortcuts = map.act2Shortcuts!;
      for (const s of shortcuts) {
        // from.col drawn from lane columns 2-8.
        expect(s.from.col).toBeGreaterThanOrEqual(2);
        expect(s.from.col).toBeLessThanOrEqual(8);
        // Skips exactly one column.
        expect(s.to.col).toBe(s.from.col + 2);
        // Bends at most one lane.
        expect(Math.abs(s.from.row - s.to.row)).toBeLessThanOrEqual(1);
        // Never departs from or lands on a repair node.
        const fromNode = getNode(map.act2Columns, s.from);
        const toNode = getNode(map.act2Columns, s.to);
        expect(fromNode.type).not.toBe('repair');
        expect(toNode.type).not.toBe('repair');
      }
      // The two shortcuts' from.col values are at least 2 apart — no
      // triple-skip corridor.
      expect(Math.abs(shortcuts[0].from.col - shortcuts[1].from.col)).toBeGreaterThanOrEqual(2);
    }
  });

  it('act 1 never has shortcuts', () => {
    const map = generateMap(1, mulberry32(1));
    // GameMap has no act1Shortcuts field at all — a shortcut is an
    // act-2-only concept, structurally absent for act 1 rather than an
    // empty array to check.
    expect((map as unknown as Record<string, unknown>).act1Shortcuts).toBeUndefined();
  });

  it('reachableNodes folds a shortcut target in alongside the normal next column', () => {
    const map = generateMap(17, mulberry32(17));
    const shortcut = map.act2Shortcuts![0];
    const reachable = reachableNodes(map.act2Columns, shortcut.from, map.act2Shortcuts);
    const normalNextCol = shortcut.from.col + 1;
    expect(reachable.some((n) => n.col === shortcut.to.col && n.row === shortcut.to.row)).toBe(true);
    // The normal +1-column route is still available too — a shortcut is a
    // choice alongside the normal route, not a replacement for it.
    expect(reachable.some((n) => n.col === normalNextCol)).toBe(true);
  });

  it('reachableNodes ignores shortcuts when no shortcuts array is passed (act-1 call sites are unaffected)', () => {
    const map = generateMap(17, mulberry32(17));
    const shortcut = map.act2Shortcuts![0];
    const reachable = reachableNodes(map.act2Columns, shortcut.from);
    expect(reachable.every((n) => n.col === shortcut.from.col + 1)).toBe(true);
  });
});
