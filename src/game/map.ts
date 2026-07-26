import { BOSS_IDS, FINAL_BOSS_IDS } from './enemies';
import type { BossId, FinalBossId } from './enemies';

export type NodeType = 'combat' | 'elite' | 'shop' | 'repair' | 'event' | 'boss' | 'opener';

export interface MapNode {
  col: number;
  row: number; // 0-2 for the 3-lane columns; single-node columns (the opener, the boss) use row 0
  type: NodeType;
}

// Iteration 8: the run is two acts, each an 11-column trellis (0-9 lanes +
// col 10 boss), generated together from one continued rng stream so a
// single seed determines the whole run — both acts, both boss picks.
export interface GameMap {
  seed: number;
  act1Columns: MapNode[][];
  act2Columns: MapNode[][];
  act1BossId: BossId; // the existing mid-boss trio
  act2BossId: FinalBossId; // the new final-boss trio
}

export interface MapPosition {
  col: number;
  row: number;
}

export const LANE_COLUMNS = 10; // columns 0-9 are the 3-lane trellis (act1 col0 is a single-node opener); column 10 is the boss
export const BOSS_COLUMN = LANE_COLUMNS;

// Node type quotas per column (before per-column shuffling), per 8.1. Every
// node's type is visible on the map (subject to iteration-6 fog) —
// routing is the whole point. A one-entry quota (the act-1 opener) is a
// fixed single node, never shuffled.
const ACT1_QUOTAS: NodeType[][] = [
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

const ACT2_QUOTAS: NodeType[][] = [
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

function shuffle<T>(items: T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function generateActColumns(quotas: NodeType[][], rng: () => number): MapNode[][] {
  const columns: MapNode[][] = quotas.map((quota, col) => {
    if (quota.length === 1) return [{ col, row: 0, type: quota[0] }]; // the opener — fixed, not shuffled
    const shuffled = shuffle(quota, rng);
    return shuffled.map((type, row) => ({ col, row, type }));
  });
  columns.push([{ col: BOSS_COLUMN, row: 0, type: 'boss' }]);
  return columns;
}

export function generateMap(seed: number, rng: () => number): GameMap {
  const act1Columns = generateActColumns(ACT1_QUOTAS, rng);
  const act1BossId = BOSS_IDS[Math.floor(rng() * BOSS_IDS.length)];
  const act2Columns = generateActColumns(ACT2_QUOTAS, rng);
  const act2BossId = FINAL_BOSS_IDS[Math.floor(rng() * FINAL_BOSS_IDS.length)];
  return { seed, act1Columns, act2Columns, act1BossId, act2BossId };
}

export function actColumns(map: GameMap, act: 1 | 2): MapNode[][] {
  return act === 1 ? map.act1Columns : map.act2Columns;
}

export function actBossId(map: GameMap, act: 1 | 2): BossId | FinalBossId {
  return act === 1 ? map.act1BossId : map.act2BossId;
}

// A single continuous column number across both acts, so reward formulas
// and cross-act permanence (escalations) can compare columns from either
// act on one number line — act-1 col 0-10 is global 0-10, act-2 col 0-10 is
// global 11-21.
export function globalColumn(act: 1 | 2, col: number): number {
  return act === 1 ? col : col + LANE_COLUMNS + 1;
}

// Two nodes in adjacent columns connect iff their lanes differ by at most 1.
// Every column-9 node connects to the single boss node.
export function nodesConnect(a: MapPosition, b: MapPosition): boolean {
  if (b.col !== a.col + 1) return false;
  if (b.col === BOSS_COLUMN) return true;
  return Math.abs(a.row - b.row) <= 1;
}

// `columns` is a single act's column array (see `actColumns`). A single-node
// "from" column (the act-1 opener) connects to every node in the next
// column, overriding the normal +/-1 lane rule — structurally detected by
// column length rather than needing act context here.
export function reachableNodes(columns: MapNode[][], from: MapPosition | null): MapNode[] {
  if (from === null) return columns[0];
  const nextCol = columns[from.col + 1];
  if (!nextCol) return [];
  const fromColumn = columns[from.col];
  if (fromColumn.length === 1) return nextCol;
  return nextCol.filter((node) => nodesConnect(from, { col: node.col, row: node.row }));
}

export function getNode(columns: MapNode[][], position: MapPosition): MapNode {
  return columns[position.col][position.row];
}
