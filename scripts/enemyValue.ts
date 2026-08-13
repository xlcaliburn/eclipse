import {
  combatEnemyPool,
  eliteEnemyForColumn,
  applyEscalations,
  applyVeterancy,
  getBoss,
  getFinalBoss,
  BOSS_IDS,
  FINAL_BOSS_IDS,
} from '../src/game/enemies';
import { bossColumn, laneColumns } from '../src/game/map';
import { PARTS } from '../src/game/parts';
import { ESCALATIONS } from '../src/game/escalations';
import type { EnemyDef, PlayerShipState } from '../src/game/types';
import type { EscalationId, ScheduledEscalation } from '../src/game/escalations';
import { simulateFleet as sharedSimulateFleet } from './sim/combat';
// Iteration 55: the pricing engine (statsValue/enemyValue) and the budget
// model (playerBudget/bankedByColumn/act1FullClearIncome/STARTING_FIT_VALUE)
// moved to src/game/difficultyCurve.ts, shared verbatim with
// difficultyCurve.test.ts's vitest gate — see that file's own header for
// why a single shared module matters here (no second copy to drift).
import {
  enemyValue,
  STARTING_FIT_VALUE,
  playerBudget,
  act1FullClearIncome,
  t1BandEntryJumps,
  t2WithinActSlope,
  t3SeamRatio,
  T1_TIGHT_MAX_JUMP,
  T2_TIGHT_MIN_SLOPE,
  T3_TIGHT_MAX_SEAM,
} from '../src/game/difficultyCurve';

// Prices an enemy composition in credits, using the player's own shop as the
// yardstick — "what would it cost to buy this ship's capability out of the
// parts list". This is a *lens*, not ground truth: the simulator
// (scripts/balance.ts) decides whether a fight is winnable. What this adds is
// an economic read — whether a fight's price tag has drifted away from what
// the player can actually have afforded by that column.
//
// Run: npx tsx scripts/enemyValue.ts

function shipCount(enemy: EnemyDef): number {
  return enemy.groups.reduce((n, g) => n + g.count, 0);
}

function composition(enemy: EnemyDef): string {
  return enemy.groups.map((g) => `${g.count}x ${g.label}`).join(' + ');
}

// --- The player's side -----------------------------------------------------
// statsValue/enemyValue/STARTING_FIT_VALUE/playerBudget/act1FullClearIncome
// are all imported from src/game/difficultyCurve.ts now (see header note).
const PART_COST = new Map(PARTS.map((p) => [p.id, p.cost]));

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

function row(label: string, enemy: EnemyDef, budget: number): string {
  const v = enemyValue(enemy);
  const ratio = v / budget;
  const flag = ratio > 0.9 ? '  <-- OVER' : ratio > 0.75 ? '  <- high' : '';
  return [
    label.padEnd(34),
    `${v.toFixed(0)}cr`.padStart(7),
    `${shipCount(enemy)} ships`.padStart(9),
    `${pct(ratio)} of budget`.padStart(17),
    flag,
  ].join(' ');
}

// A run schedules 4 escalations without replacement: 2 land in act 1 (after
// local columns 3 and 6) and 2 more in act 2.
//
// 2026-08-08: act 2 was 4 here — correct when act-1's pair carried through
// and stacked, but iteration 46.3 made only the CURRENT act's escalations
// live (it was the single biggest lever behind act 2's 0% clear rate; see
// the reducer's PICK_NODE, which filters `e.act === state.act`). Modelling
// 4 overstated every act-2 fight. The second of 47.7.3's three staleness
// bugs.
const LIVE_ESCALATIONS: Record<1 | 2, number> = { 1: 2, 2: 2 };

function scheduled(ids: EscalationId[], act: 1 | 2): ScheduledEscalation[] {
  return ids.map((id) => ({ id, act, landsAfterColumn: -1 }) as ScheduledEscalation);
}

function combinations<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (items.length < k) return [];
  const [head, ...rest] = items;
  return [...combinations(rest, k - 1).map((c) => [head, ...c]), ...combinations(rest, k)];
}

// The worst escalation draw a run can actually deal at this act, by value.
function worstRealisticEscalations(act: 1 | 2, enemy: EnemyDef, col: number): { ids: EscalationId[]; enemy: EnemyDef } {
  const all = ESCALATIONS.map((e) => e.id);
  let worst: { ids: EscalationId[]; enemy: EnemyDef } | null = null;
  for (const combo of combinations(all, LIVE_ESCALATIONS[act])) {
    const escalated = applyEscalations(enemy, col, scheduled(combo, act));
    if (!worst || enemyValue(escalated) > enemyValue(worst.enemy)) worst = { ids: combo, enemy: escalated };
  }
  return worst!;
}

function report() {
  console.log('Enemy credit value vs. the player\'s optimistic budget');
  console.log('Budget = starting fit + every win reward banked, nothing spent.');
  console.log('Ratios are therefore a FLOOR on difficulty: a real fleet has less.\n');

  for (const act of [1, 2] as const) {
    console.log(`\n=== ACT ${act} ===`);
    console.log(
      ['node'.padEnd(34), 'value'.padStart(7), 'ships'.padStart(9), 'share'.padStart(17)].join(' '),
    );
    // 2026-08-08: was hardcoded `col <= 9` for both acts — act 2 has been 12
    // lane columns since iteration 32's starchart expansion, so the pre-boss
    // columns this tool exists to price were never priced at all. The third
    // of 47.7.3's staleness bugs.
    const lastLaneCol = laneColumns(act) - 1;
    for (let col = act === 1 ? 1 : 0; col <= lastLaneCol; col++) {
      const budget = playerBudget(act, col);
      const pool = combatEnemyPool(act, col);
      const hardest = pool.reduce((best, e) => (enemyValue(e) > enemyValue(best) ? e : best), pool[0]);
      const withVet = applyVeterancy(hardest, act, col);
      console.log(row(`c${col} combat (worst): ${withVet.name}`, withVet, budget));

      const elite = applyVeterancy(eliteEnemyForColumn(act, col, () => 0.99), act, col);
      console.log(row(`c${col} ELITE: ${elite.name}`, elite, budget));
    }

    // The specific late-game case: the last elite under the worst escalation
    // draw the schedule can actually produce for this act.
    const lastCol = laneColumns(act) - 1;
    const budget = playerBudget(act, lastCol);
    const { ids, enemy: worst } = worstRealisticEscalations(
      act,
      applyVeterancy(eliteEnemyForColumn(act, lastCol, () => 0.99), act, lastCol),
      lastCol,
    );
    console.log('');
    console.log(row(`c${lastCol} ELITE + worst draw (${LIVE_ESCALATIONS[act]} live)`, worst, budget));
    console.log(`      escalations: ${ids.join(', ')}`);
    console.log(`      composition: ${composition(worst)}`);
  }

  console.log('\n\n=== BOSSES ===');
  const act1Budget = playerBudget(1, bossColumn(1));
  for (const id of BOSS_IDS) {
    console.log(row(`act1 boss: ${getBoss(id).name}`, getBoss(id), act1Budget));
  }
  const act2Budget = playerBudget(2, bossColumn(2));
  for (const id of FINAL_BOSS_IDS) {
    console.log(row(`act2 boss: ${getFinalBoss(id).name}`, getFinalBoss(id), act2Budget));
  }

  console.log(`\nStarting fit: ${STARTING_FIT_VALUE}cr. Act-1 full clear banks ${act1FullClearIncome()}cr.`);
}

// --- Cross-check against the simulator -------------------------------------
// Credit value is only a proxy. These reference fleets are priced at roughly
// what the budget above allows, so a win rate here says whether the price tag
// actually translates into an unwinnable fight.
const LATE_ACT1_FLEET: PlayerShipState[] = [
  // ~62cr of parts on a Flagship plus an escort: a realistic, well-played
  // column-9 act-1 fleet that spent on offense and a little defense.
  { frameId: 'cruiser', equipped: ['plasma', 'plasma', 'comp2', 'hull2', 'shield1'], upgrades: [], damage: 0 },
  { frameId: 'interceptor', equipped: ['ion', 'hull1'], upgrades: [], damage: 0 },
];

// Iteration 45.1: delegates to the one shared `sharedSimulateFleet`
// (scripts/sim/combat.ts) instead of this file's own private copy of the
// same loop, keeping the plain-percent return this file's callers expect.
function simulate(fleet: PlayerShipState[], enemy: EnemyDef, sims = 2000): number {
  return Math.round(sharedSimulateFleet(fleet, enemy, sims).winRate.point * 100);
}

// What a fleet's parts would cost at shop prices — so a win rate can be read
// against the column's budget instead of taken on faith.
function fleetPartsCost(fleet: PlayerShipState[]): number {
  return fleet.reduce((sum, s) => sum + s.equipped.reduce((n, id) => n + (PART_COST.get(id) ?? 0), 0), 0);
}

function simulationCheck() {
  console.log('\n\n=== SIMULATED WIN RATE (act-1 column 9) ===');
  const col = laneColumns(1) - 1;
  const base = applyVeterancy(eliteEnemyForColumn(1, col, () => 0.99), 1, col);
  const squadronsOnly = applyEscalations(base, col, scheduled(['squadrons'], 1));
  // The real worst case in act 1: squadrons plus one more, not all five.
  const everything = worstRealisticEscalations(1, base, col).enemy;

  // A fleet spending near the full column budget: if even this can't win, the
  // fight isn't "hard", it's arithmetically closed.
  const OVERBUILT: PlayerShipState[] = [
    { frameId: 'cruiser', equipped: ['antimatter', 'plasma', 'comp3', 'hull2', 'shield2', 'init3'], upgrades: [], damage: 0 },
    { frameId: 'interceptor', equipped: ['plasma', 'comp2', 'hull1'], upgrades: [], damage: 0 },
    { frameId: 'interceptor', equipped: ['plasma', 'comp2', 'hull1'], upgrades: [], damage: 0 },
  ];

  console.log(
    `Column-${col} budget is ${playerBudget(1, col).toFixed(0)}cr. ` +
      `"lean" fleet = ${fleetPartsCost(LATE_ACT1_FLEET)}cr of parts (under-spent, a floor); ` +
      `"rich" = ${fleetPartsCost(OVERBUILT)}cr (about what a clean run can field).\n`,
  );
  console.log(`${''.padEnd(26)} ${'value'.padStart(7)}  ${'composition'.padEnd(28)} ${'lean'.padStart(5)} ${'rich'.padStart(6)}`);
  for (const [label, enemy] of [
    ['elite, no escalations', base],
    ['elite + squadrons only', squadronsOnly],
    ['elite + worst act-1 draw', everything],
  ] as const) {
    console.log(
      `${label.padEnd(26)} ${`${enemyValue(enemy).toFixed(0)}cr`.padStart(7)}  ${composition(enemy).padEnd(28)} ${`${simulate(LATE_ACT1_FLEET, enemy)}%`.padStart(5)} ${`${simulate(OVERBUILT, enemy)}%`.padStart(6)}`,
    );
  }
}

// --- 55.3: the tuning-tier self-check ---------------------------------------
// target/actual/delta against the TIGHT invariants (plans/iteration-55.md
// 55.1/55.3). This is the instrument the tuning loop is driven to green —
// it never fails the build (no process.exitCode write); the loose vitest
// gate (src/game/difficultyCurve.test.ts) is the real, build-failing check.
function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function selfCheckRow(label: string, target: string, actual: number, actualFmt: (n: number) => string, pass: boolean): string {
  const delta = pass ? 'OK' : 'OVER';
  return [
    label.padEnd(38),
    target.padStart(10),
    actualFmt(actual).padStart(10),
    delta.padStart(6),
  ].join(' ');
}

function selfCheckReport() {
  console.log('\n\n=== 55.3 SELF-CHECK (tuning tier — tight targets, advisory only) ===');
  console.log([`invariant`.padEnd(38), `target`.padStart(10), `actual`.padStart(10), ``.padStart(6)].join(' '));

  for (const act of [1, 2] as const) {
    for (const { col, jump } of t1BandEntryJumps(act)) {
      console.log(
        selfCheckRow(
          `T1 act${act} c${col - 1}->c${col} band-entry jump`,
          `<=${fmtPct(T1_TIGHT_MAX_JUMP)}`,
          jump,
          fmtPct,
          jump <= T1_TIGHT_MAX_JUMP,
        ),
      );
    }
  }

  for (const act of [1, 2] as const) {
    const slope = t2WithinActSlope(act);
    console.log(
      selfCheckRow(`T2 act${act} within-act slope (last/first share)`, `>=${fmtPct(T2_TIGHT_MIN_SLOPE)}`, slope, fmtPct, slope >= T2_TIGHT_MIN_SLOPE),
    );
  }

  const seam = t3SeamRatio();
  console.log(
    selfCheckRow(`T3 act seam (act2 c0 / act1 last, value ratio)`, `<=${T3_TIGHT_MAX_SEAM.toFixed(2)}x`, seam, (n) => `${n.toFixed(2)}x`, seam <= T3_TIGHT_MAX_SEAM),
  );
}

report();
simulationCheck();
selfCheckReport();
