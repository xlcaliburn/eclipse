import { describe, expect, it } from 'vitest';
import { BOSS_IDS, FINAL_BOSS_IDS } from './enemies';
import { mulberry32 } from './rng';
import { actColumns, BOSS_COLUMN, generateMap, getNode, LANE_COLUMNS, nodesConnect, reachableNodes } from './map';
import type { CargoTag } from './map';

const ACT1_QUOTAS = [
  ['opener'],
  ['combat', 'combat', 'combat'],
  ['combat', 'combat', 'event'],
  ['shop', 'combat', 'event'],
  ['elite', 'combat', 'event'],
  ['repair', 'shop', 'combat'],
  ['combat', 'combat', 'event'],
  ['elite', 'combat', 'event'],
  ['shop', 'elite', 'combat'],
  ['repair', 'elite', 'combat'],
];

const ACT2_QUOTAS = [
  ['combat', 'combat', 'combat'],
  ['combat', 'combat', 'event'],
  ['shop', 'combat', 'event'],
  ['elite', 'combat', 'event'],
  ['repair', 'shop', 'combat'],
  ['elite', 'combat', 'event'],
  ['combat', 'elite', 'event'],
  ['shop', 'elite', 'combat'],
  ['repair', 'elite', 'combat'],
  ['elite', 'combat', 'event'],
];

describe('generateMap', () => {
  it('produces the same full run for the same seed — both acts, both boss picks', () => {
    const mapA = generateMap(123, mulberry32(123));
    const mapB = generateMap(123, mulberry32(123));
    expect(JSON.stringify(mapA)).toBe(JSON.stringify(mapB));
  });

  it('each act is 11 columns: a 10-column trellis plus a single boss node', () => {
    const map = generateMap(1, mulberry32(1));
    for (const columns of [map.act1Columns, map.act2Columns]) {
      expect(columns).toHaveLength(LANE_COLUMNS + 1);
      expect(columns[BOSS_COLUMN]).toHaveLength(1);
      expect(columns[BOSS_COLUMN][0].type).toBe('boss');
    }
  });

  it('act-1 column 0 is a single opener node; every other lane column has 3 nodes', () => {
    const map = generateMap(1, mulberry32(1));
    expect(map.act1Columns[0]).toHaveLength(1);
    expect(map.act1Columns[0][0].type).toBe('opener');
    for (let col = 1; col < LANE_COLUMNS; col++) {
      expect(map.act1Columns[col]).toHaveLength(3);
    }
    for (let col = 0; col < LANE_COLUMNS; col++) {
      expect(map.act2Columns[col]).toHaveLength(3);
    }
  });

  it('matches the exact per-column type quota for both acts (as a set, order shuffled)', () => {
    const map = generateMap(7, mulberry32(7));
    for (let col = 0; col < LANE_COLUMNS; col++) {
      const actual = map.act1Columns[col].map((n) => n.type).sort();
      const expected = [...ACT1_QUOTAS[col]].sort();
      expect(actual).toEqual(expected);
    }
    for (let col = 0; col < LANE_COLUMNS; col++) {
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
    // 20 columns' worth of combat nodes across both acts is comfortably
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

  it('every column-9 node connects to the boss', () => {
    expect(nodesConnect({ col: 9, row: 0 }, { col: BOSS_COLUMN, row: 0 })).toBe(true);
    expect(nodesConnect({ col: 9, row: 1 }, { col: BOSS_COLUMN, row: 0 })).toBe(true);
    expect(nodesConnect({ col: 9, row: 2 }, { col: BOSS_COLUMN, row: 0 })).toBe(true);
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
      for (let col = 1; col <= LANE_COLUMNS; col++) {
        const fromColumn = columns[col - 1];
        // A single-node "from" column (the act-1 opener) connects to
        // everything in the next column, overriding the normal +/-1 rule.
        for (const node of columns[col]) {
          const reachableFromSomewhere =
            fromColumn.length === 1 || fromColumn.some((prev) => nodesConnect(prev, node));
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
