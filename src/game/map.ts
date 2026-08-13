import { BOSS_IDS, FINAL_BOSS_IDS } from './enemies';
import type { BossId, FinalBossId } from './enemies';
import { shuffle } from './rng';

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
  convoy: 'A hardened escort rides with this shipment — tougher fight, better pay.',
  wreck: 'Pays 2 credits less (never below 1), but drops a salvaged part.',
  command: 'A high-value target — pays +8 credits on top of the normal reward.',
};

// Iteration 8: the run is two acts, generated together from one continued
// rng stream so a single seed determines the whole run — both acts, both
// boss picks. (Iteration 32: the acts stopped being the same shape — act 1
// is still a 10-column trellis + boss; act 2 grew to 12 columns x 4 lanes
// + boss, and gained warp-lane shortcuts — see `act2Shortcuts` below.)
export interface GameMap {
  seed: number;
  act1Columns: MapNode[][];
  act2Columns: MapNode[][];
  act1BossId: BossId; // the existing mid-boss trio
  act2BossId: FinalBossId; // the new final-boss trio
  // Iteration 32 (FTL's "roundabout path"), grown 2 -> 3 by iteration 64.2:
  // seeded edges, each normally skipping exactly one column outright
  // (`from.col` to `from.col + 2`, one of the three skipping two columns
  // instead) — the shorter route through act 2. Optional-additive: absent
  // on any pre-32 save, which every consumer (`reachableNodes`, PICK_NODE,
  // the renderer) reads as "no shortcuts on this map," identical to how the
  // route always worked before this iteration.
  act2Shortcuts?: MapShortcut[];
}

export interface MapPosition {
  col: number;
  row: number;
}

export interface MapShortcut {
  from: MapPosition;
  to: MapPosition;
}

export const LANE_COLUMNS = 10; // act 1's width: columns 0-9 are the 3-lane trellis (col 0 is a single-node opener); column 10 is the boss.
// Iteration 32: act 2 grew from a copy of act 1's shape (10 columns) to its
// own bigger chart (12 columns, 4 lanes instead of 3) — see ACT2_QUOTAS.
// `LANE_COLUMNS` above stays act-1-specific (not renamed/generalized)
// because `globalColumn`'s act-2 offset (col + LANE_COLUMNS + 1) keys off
// act 1's width specifically, not whichever act is currently active — see
// that function's comment.
export const ACT2_LANE_COLUMNS = 12;

// The number of lane columns (excluding the boss) in the given act's chart.
// Replaces the old flat `BOSS_COLUMN` constant, which silently assumed both
// acts were the same width — true before this iteration, false after.
export function laneColumns(act: 1 | 2): number {
  return act === 1 ? LANE_COLUMNS : ACT2_LANE_COLUMNS;
}

// The boss always sits one column past the last lane column.
export function bossColumn(act: 1 | 2): number {
  return laneColumns(act);
}

// The widest lane column in this act's chart (3 for act 1, 4 for act 2) —
// single-node columns (the opener, the boss) never widen it, since they're
// always length 1. Used anywhere that needs to iterate "every possible row"
// generically instead of hardcoding 3 (fog reveals, the starchart renderer).
export function maxRows(columns: MapNode[][]): number {
  return Math.max(...columns.map((c) => c.length));
}

// Node type quotas per column (before per-column shuffling), per 8.1. Every
// node's type is visible on the map (subject to iteration-6 fog) —
// routing is the whole point. A one-entry quota (the act-1 opener) is a
// fixed single node, never shuffled.
//
// Iteration 20 (the economy floor) touched two things here, per the
// act-1 clear-rate gate (then scripts/actRun.ts, since retired —
// see scripts/runSim.ts / `npm run balance:full`):
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

// Iteration 32 (2026-08-07): act 2 grew from a 10-column x 3-lane copy of
// act 1's own shape to its own bigger, 4-lane, 12-column chart — see the
// plan's 32.1. `laneColumns`/`bossColumn`/`maxRows` above make every other
// consumer (fog reveals, the starchart renderer, `globalColumn`'s act-2
// reach) read this table's actual size instead of assuming it matches act
// 1's. Invariants kept from the old table: ~1 recovery option per 2
// columns, elite density rising toward the boss, every column keeping at
// least one plain combat. Two of the four shop slots are 'shipyard' (33's
// split, same reasoning as ACT1_QUOTAS below).
const ACT2_QUOTAS: NodeType[][] = [
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
  // Structural, not `bossColumn(act)`: the boss sits one past however many
  // lane columns THIS quotas table actually has — true for both acts, and
  // doesn't require this function to know which act it's generating.
  columns.push([{ col: quotas.length, row: 0, type: 'boss' }]); // the boss — never tagged
  return columns;
}

// Iteration 22.2: act 1's column-3 shop only, pinned to row 1 (see
// pinToRow1) — act 2 is untouched, out of scope for this iteration (see
// plans/iteration-22.md 22.5).
const ACT1_PINNED_ROWS: Partial<Record<number, NodeType>> = { 3: 'shop' };

// Iteration 32 (warp lanes, 32.2), grown 2 -> 3 by iteration 64.2: seeded
// shortcuts, each normally an edge from a node at column `c` to a node at
// column `c + 2`, skipping `c + 1` entirely. Placement rules straight from
// the plan:
//   - `from.col` drawn from lane columns 2-8 (never the first couple of
//     columns, never close enough to the boss to trivialize the approach)
//     for slots 1-2 below; slot 0 (64.2) is instead guaranteed to draw its
//     `from.col` from the "hard band", 8-9 — the stretch 64's own survival
//     table shows as the worst back-half bleed (44-50% per-column losses)
//     is exactly where a skip is worth the most, and the old generator
//     could roll both of its shortcuts early and never touch that stretch
//     at all.
//   - Every shortcut's `from.col` at least 2 apart from every other's, so
//     they can never chain into a triple-skip corridor.
//   - `|from.row - to.row| <= 1` — a warp lane bends at most one lane,
//     same as a normal edge, so the chart stays readable.
//   - Never lands on or departs from a repair node — skipping is supposed
//     to cost resources, not hand a free heal on arrival.
//   - 64.2: one of the three (seeded, decided before any slot is placed)
//     skips 2 columns instead of 1 (`c + 3`, not `c + 2`) — "a genuinely
//     dramatic lane for the run that finds it". Capped back down to a
//     normal 1-column skip whenever the double would overflow past the
//     last lane column (`columns.length - 2`, i.e. the boss slot) — the
//     one relaxation from the spec's literal "landing at 10-11 or the
//     double-skip target" text: rather than let a doubled hard-band
//     shortcut warp straight onto the boss node when its from-col rolls 9
//     (9+3 = 12, the boss slot), it silently falls back to a 1-column skip
//     in that specific case. The hard-band slot still always exists
//     (from-col 8 or 9, landing at 10 or 11) either way; only whether IT
//     specifically is the doubled one is what's capped.
// Rejection sampling over the rng stream already in hand: each retry just
// draws more from the same continued stream, so the result is still fully
// deterministic per seed (same seed -> same number of draws -> same
// shortcuts), it just doesn't consume a fixed number of rng() calls the
// way a straight-line generator would — expected and fine, exactly like
// every other content-shaped draw in this file (shuffle's own draw count
// already varies with quota composition).
function generateAct2Shortcuts(columns: MapNode[][], rng: () => number): MapShortcut[] {
  const shortcuts: MapShortcut[] = [];
  const usedFromCols: number[] = [];
  // columns includes the trailing boss node (see generateActColumns) — the
  // last real lane column index is one before that.
  const lastLaneCol = columns.length - 2;
  // Which of the 3 shortcut slots (0 = hard band, 1-2 = the original 2-8
  // range) skips 2 columns instead of 1 — decided once, up front, so every
  // slot's own placement loop can just consult it.
  const doubleSkipSlot = Math.floor(rng() * 3);

  function placeSlot(slotIndex: number, minFromCol: number, maxFromCol: number): void {
    let attempts = 0;
    while (attempts < 500) {
      attempts++;
      const fromCol = minFromCol + Math.floor(rng() * (maxFromCol - minFromCol + 1));
      if (usedFromCols.some((c) => Math.abs(c - fromCol) < 2)) continue;
      const wantsDouble = doubleSkipSlot === slotIndex;
      const skip = wantsDouble && fromCol + 3 <= lastLaneCol ? 3 : 2;
      const toCol = fromCol + skip;
      const fromColumn = columns[fromCol];
      const toColumn = columns[toCol];
      if (!fromColumn || !toColumn) continue;
      const fromCandidates = fromColumn.filter((n) => n.type !== 'repair');
      if (fromCandidates.length === 0) continue;
      const from = fromCandidates[Math.floor(rng() * fromCandidates.length)];
      const toCandidates = toColumn.filter((n) => n.type !== 'repair' && Math.abs(n.row - from.row) <= 1);
      if (toCandidates.length === 0) continue;
      const to = toCandidates[Math.floor(rng() * toCandidates.length)];
      shortcuts.push({ from: { col: from.col, row: from.row }, to: { col: to.col, row: to.row } });
      usedFromCols.push(fromCol);
      return;
    }
    // Unreached in practice at this chart's size (12 lane columns, generous
    // candidate pools) — defensive only, matching the old function's own
    // 500-attempt rejection-sampling budget.
  }

  placeSlot(0, 8, 9); // slot 0: the guaranteed hard-band shortcut
  placeSlot(1, 2, 8); // slot 1: original range, unchanged
  placeSlot(2, 2, 8); // slot 2: original range, unchanged

  return shortcuts;
}

export function generateMap(seed: number, rng: () => number): GameMap {
  const act1Columns = generateActColumns(ACT1_QUOTAS, rng, ACT1_PINNED_ROWS);
  const act1BossId = BOSS_IDS[Math.floor(rng() * BOSS_IDS.length)];
  const act2Columns = generateActColumns(ACT2_QUOTAS, rng);
  const act2Shortcuts = generateAct2Shortcuts(act2Columns, rng);
  const act2BossId = FINAL_BOSS_IDS[Math.floor(rng() * FINAL_BOSS_IDS.length)];
  return { seed, act1Columns, act2Columns, act1BossId, act2BossId, act2Shortcuts };
}

export function actColumns(map: GameMap, act: 1 | 2): MapNode[][] {
  return act === 1 ? map.act1Columns : map.act2Columns;
}

export function actBossId(map: GameMap, act: 1 | 2): BossId | FinalBossId {
  return act === 1 ? map.act1BossId : map.act2BossId;
}

// A single continuous column number across both acts, so reward formulas
// and cross-act permanence (escalations) can compare columns from either
// act on one number line — act-1 col 0-10 is global 0-10, act-2 col 0-12 is
// global 11-23 (iteration 32: act 2 grew to 12 lane columns + boss; the
// offset itself, `LANE_COLUMNS + 1`, is still act 1's width and stays
// fixed — only act 2's own reach got longer).
export function globalColumn(act: 1 | 2, col: number): number {
  return act === 1 ? col : col + LANE_COLUMNS + 1;
}

// Two nodes in adjacent columns connect iff their lanes differ by at most 1.
// `targetIsSingleNode` (iteration 32: was a `b.col === BOSS_COLUMN` check —
// wrong the moment the two acts stopped sharing a boss column) lets a
// single-node target column (the boss, today; anything shaped like it
// tomorrow) connect from every lane, without this function needing to know
// which column that is or which act it's in — the caller already has the
// target column's node array in hand and can just check its length, same
// structural approach `chartEdges` in MapScreen.tsx already used.
export function nodesConnect(a: MapPosition, b: MapPosition, targetIsSingleNode = false): boolean {
  if (b.col !== a.col + 1) return false;
  if (targetIsSingleNode) return true;
  return Math.abs(a.row - b.row) <= 1;
}

// `columns` is a single act's column array (see `actColumns`). A single-node
// "from" column (the act-1 opener) connects to every node in the next
// column, overriding the normal +/-1 lane rule — structurally detected by
// column length rather than needing act context here.
//
// `shortcuts` (iteration 32, defaults to none — act 1 never has any):
// whenever `from` matches a shortcut's `from` position exactly, its `to`
// node joins the normally-reachable set, on top of (never instead of) the
// regular +1-column options — taking a shortcut is a choice alongside the
// normal route, not a replacement for it.
export function reachableNodes(
  columns: MapNode[][],
  from: MapPosition | null,
  shortcuts: MapShortcut[] = [],
): MapNode[] {
  if (from === null) return columns[0];
  const nextCol = columns[from.col + 1];
  const normal = !nextCol
    ? []
    : columns[from.col].length === 1
      ? nextCol
      : nextCol.filter((node) => nodesConnect(from, { col: node.col, row: node.row }, nextCol.length === 1));
  const shortcutTargets = shortcuts
    .filter((s) => s.from.col === from.col && s.from.row === from.row)
    .map((s) => getNode(columns, s.to));
  return [...normal, ...shortcutTargets];
}

export function getNode(columns: MapNode[][], position: MapPosition): MapNode {
  return columns[position.col][position.row];
}
