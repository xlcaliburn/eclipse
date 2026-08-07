import { BOSS_IDS, FINAL_BOSS_IDS } from './enemies';
import type { BossId, FinalBossId } from './enemies';

// 2026-08-07 (iteration 33): 'shipyard' is a second trade-station flavor,
// not a variant of 'shop' — see reducer.ts's PICK_NODE (both resolve to
// the same 'shop' phase, distinguished by RunState.shopKind) and
// ShopScreen.tsx (branches its whole layout on that field). Kept as its
// own NodeType (not a `shop` + a kind flag here) so the chart, fog, and
// glyph code all switch on it the same structural way they already switch
// on every other node type.
export type NodeType = 'combat' | 'elite' | 'shop' | 'shipyard' | 'repair' | 'event' | 'boss' | 'opener';

// Iteration 15.1: every plain 'combat' node gets a typed reward tag, seeded
// at map generation — the fight itself is unchanged, only what winning it
// pays out. Elites, the boss, and the opener are never tagged (see
// `generateActColumns`).
export type CargoTag = 'patrol' | 'convoy' | 'wreck' | 'command';

export interface MapNode {
  col: number;
  row: number; // 0-2 for the 3-lane columns; single-node columns (the opener, the boss) use row 0
  type: NodeType;
  cargo?: CargoTag; // only ever set when type === 'combat'
}

// Weighted draw table for 15.1 — patrol is the plain baseline (most common),
// command ship the rarest. Total weight 8.
const CARGO_WEIGHTS: [CargoTag, number][] = [
  ['patrol', 3],
  ['convoy', 2],
  ['wreck', 2],
  ['command', 1],
];
const CARGO_TOTAL_WEIGHT = CARGO_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0);

function drawCargoTag(rng: () => number): CargoTag {
  let roll = rng() * CARGO_TOTAL_WEIGHT;
  for (const [tag, weight] of CARGO_WEIGHTS) {
    if (roll < weight) return tag;
    roll -= weight;
  }
  return CARGO_WEIGHTS[CARGO_WEIGHTS.length - 1][0]; // unreachable in practice; defensive only
}

// UI copy shared between the starchart (tooltip) and the prep screen (plain
// statement of what this fight pays) — one source so the two never drift.
export const CARGO_LABEL: Record<CargoTag, string> = {
  patrol: 'Patrol',
  convoy: 'Convoy',
  wreck: 'Wreck field',
  command: 'Command ship',
};

export const CARGO_DESCRIPTION: Record<CargoTag, string> = {
  patrol: 'Standard payout.',
  convoy: 'Pays +4 credits on top of the normal reward.',
  wreck: 'Pays 2 credits less (never below 1), but drops a salvaged part.',
  command: 'Pays a reaction card on top of the normal reward (+4 credits instead if your hand is full).',
};

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
//
// Iteration 20 (the economy floor) touched two things here, per the
// act-1 clear-rate gate in scripts/actRun.ts:
//   - col 1 gained an event node (was 3 combats) — one more income node
//     early, and one fewer damage-intake node on the way to it.
//   - both acts' LAST lane column (9) now guarantees a shop (dropping
//     repair, same as act 2 already had at col 9 vs. act 1's old
//     repair/elite/combat), so arriving at the boss rich is a plan the
//     player can route toward, not a hope — and column 9 keeps a plain
//     combat option alongside the elite, rather than losing it to make
//     room for the shop.
// Iteration 22.6: col 6 traded one of its two combats for a repair. Once
// 22.1 shifted the mid pool to columns 5-7, columns 6 and 7 were the only
// mid-band columns with zero recovery option — a fleet already carrying
// damage from column 5 had no escape valve before a second (col 6) and
// third (col 7) full-strength fight, and column 6 alone accounted for the
// single largest share of act-1 deaths in the post-22.1/22.2/22.3 sim. This
// mirrors exactly the logic iteration 20 used for column 1 above.
//
// Changing a column's node-TYPE COMPOSITION (not just re-ordering the
// literal — shuffle draws from the multiset regardless of source order)
// also changes how many rng calls that column consumes, since only
// 'combat' entries draw a cargo tag: fewer/more combats shifts every rng
// draw for the rest of map generation and the run. Downstream seeded test
// expectations were updated alongside this change, not preserved — the
// old numbers described the old content, not a contract.
// Iteration 33 (2026-08-07): two of the four 'shop' slots became
// 'shipyard' — col 3 and col 8 stay the general store (parts, war assets,
// repairs, 2 second-hand hulls), col 5 and col 9 became the shipyard (4
// pristine hulls + the upgrade bay, no parts). Swapping a node's TYPE
// without changing the column's type COMPOSITION consumes zero extra rng
// calls (only 'combat' entries draw a cargo tag — see generateActColumns
// below), so this edit is stream-neutral: existing seeds regenerate an
// identical map, just with two of their shop icons relabeled.
const ACT1_QUOTAS: NodeType[][] = [
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
  ['shop', 'elite', 'combat'],
];

function shuffle<T>(items: T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Iteration 22.2: places `pinned` at row 1 instead of leaving its row to the
// shuffle. `nodesConnect` allows |row diff| <= 1, so row 1 is the one row
// reachable from every row (0, 1, 2) of the previous column — a node pinned
// here is guaranteed reachable no matter which lane the player took to get
// there. Used to fix a real gap: about a third of act-1 sim runs reached
// the mid-tier pool having never been able to route into column 3's shop,
// because its row was left to chance and a player boxed into row 0 or row 2
// at column 2 could find it unreachable (see plans/iteration-22.md 22.0).
function pinToRow1(quota: NodeType[], pinned: NodeType, rng: () => number): NodeType[] {
  const idx = quota.indexOf(pinned);
  const rest = [...quota.slice(0, idx), ...quota.slice(idx + 1)];
  const shuffledRest = shuffle(rest, rng);
  return [shuffledRest[0], pinned, shuffledRest[1]];
}

function generateActColumns(
  quotas: NodeType[][],
  rng: () => number,
  pinnedRows: Partial<Record<number, NodeType>> = {},
): MapNode[][] {
  const columns: MapNode[][] = quotas.map((quota, col) => {
    if (quota.length === 1) return [{ col, row: 0, type: quota[0] }]; // the opener — fixed, not shuffled, never tagged
    const pinned = pinnedRows[col];
    const types = pinned !== undefined ? pinToRow1(quota, pinned, rng) : shuffle(quota, rng);
    // Cargo is drawn immediately after each node's type is fixed, in row
    // order — keeps the whole map generation one deterministic pass over a
    // single continued rng stream.
    return types.map((type, row) => ({
      col,
      row,
      type,
      ...(type === 'combat' ? { cargo: drawCargoTag(rng) } : {}),
    }));
  });
  columns.push([{ col: BOSS_COLUMN, row: 0, type: 'boss' }]); // the boss — never tagged
  return columns;
}

// Iteration 22.2: act 1's column-3 shop only, pinned to row 1 (see
// pinToRow1) — act 2 is untouched, out of scope for this iteration (see
// plans/iteration-22.md 22.5).
const ACT1_PINNED_ROWS: Partial<Record<number, NodeType>> = { 3: 'shop' };

export function generateMap(seed: number, rng: () => number): GameMap {
  const act1Columns = generateActColumns(ACT1_QUOTAS, rng, ACT1_PINNED_ROWS);
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
