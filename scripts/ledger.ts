// Iteration 45.4 (deferred) / 46.1: the difficulty ledger. For each act x
// column, prices a realistic budget-fleet (scripts/sim/budget.ts) against
// every enemy the pool can serve there — veterancy, representative
// escalations, and (act 2) a counter-protocol all applied via the REAL
// enemies.ts functions, never a hand model — and flags outliers (>15pp
// below the column's own pool median). This is the instrument iteration
// 46's tuning levers are measured against; run it before and after every
// change, numbers go in plans/iteration-46.md's status notes.
//
// Run: npx tsx scripts/ledger.ts
import {
  applyCounterProtocol,
  applyEscalations,
  applyVeterancy,
  combatEnemyPool,
  eliteEnemyForColumn,
  getBoss,
  getFinalBoss,
  BOSS_IDS,
  FINAL_BOSS_IDS,
} from '../src/game/enemies';
import type { EnemyDef } from '../src/game/types';
import { globalColumn, laneColumns } from '../src/game/map';
import { winReward } from '../src/game/reducer';
import { buildFleet, creditsBankedByColumn } from './sim/budget';
import { simulateFleet } from './sim/combat';
import { pad, padNum } from './sim/table';
import type { ScheduledEscalation } from '../src/game/escalations';

const SIMS = Number(process.env.LEDGER_SIMS ?? 600);
// A representative escalation pair — middle-of-road picks (a flat HP and a
// flat computer/piloting bump), not the worst-case draw combinations.ts
// already audits separately (see enemyValue.ts's worstRealisticEscalations).
//
// Iteration 46.3: act-1 escalations retire at the act boundary (reverses
// 8.4 — see reducer.ts's PICK_NODE) — only the CURRENT act's own two are
// ever live now, matching what `applyEscalations` actually receives via
// the real reducer. This function bypasses the reducer (calls
// `applyEscalations` directly for speed), so it has to mirror that rule
// by hand here rather than inheriting it automatically — keep this in
// sync if the rule ever changes again.
function representativeEscalations(act: 1 | 2): ScheduledEscalation[] {
  const mk = (id: string, col: number): ScheduledEscalation =>
    ({ id, act, landsAfterColumn: globalColumn(act, col), revealed: true }) as ScheduledEscalation;
  return act === 1 ? [mk('hardened', 4), mk('firecontrol', 7)] : [mk('deflectors', 4), mk('overdrive', 7)];
}

// A realistic (not optimistic) budget: ~55% of the optimistic banked-and-
// unspent ceiling, matching enemyValue.ts's own "ratios are a FLOOR on
// difficulty" framing — a real route spends on repairs/events/losses and
// can't always buy the theoretical optimum even with unlimited credits
// (rarity gating). Act 2 carries act 1's whole banked total.
const REALISM_FACTOR = 0.55;
function realisticBudget(act: 1 | 2, col: number): number {
  const act1Total = creditsBankedByColumn(laneColumns(1) + 1, (c) => winReward(c));
  const banked =
    act === 1
      ? creditsBankedByColumn(col, (c) => winReward(c))
      : act1Total + creditsBankedByColumn(col, (c) => winReward(globalColumn(2, c)));
  return Math.round(banked * REALISM_FACTOR);
}

interface Cell {
  label: string;
  winPct: number;
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function runColumn(act: 1 | 2, col: number, counter?: Parameters<typeof applyCounterProtocol>[1]): Cell[] {
  const budget = realisticBudget(act, col);
  const fleet = buildFleet(budget, 'balanced');
  const globalCol = globalColumn(act, col);
  const esc = representativeEscalations(act);
  const cells: Cell[] = [];
  for (const raw of combatEnemyPool(act, col)) {
    let enemy: EnemyDef = applyEscalations(applyVeterancy(raw, act, col), globalCol, esc);
    if (counter) enemy = applyCounterProtocol(enemy, counter);
    const r = simulateFleet(fleet, enemy, SIMS);
    cells.push({ label: enemy.name, winPct: Math.round(r.winRate.point * 100) });
  }
  return cells;
}

function printColumn(act: 1 | 2, col: number, cells: Cell[], eliteCell?: Cell) {
  const budget = realisticBudget(act, col);
  const med = median(cells.map((c) => c.winPct));
  const parts = cells.map((c) => {
    const flag = c.winPct < med - 15 ? ' <-- OUTLIER' : '';
    return `${c.label}=${c.winPct}%${flag}`;
  });
  if (eliteCell) parts.push(`[ELITE ${eliteCell.label}=${eliteCell.winPct}%]`);
  console.log(pad(`c${col}`, 5) + padNum(`${budget}cr`, 8) + '  ' + parts.join('  '));
}

function report() {
  console.log(`Difficulty ledger — budget fleet (~${Math.round(REALISM_FACTOR * 100)}% of optimistic banked credits) vs every pool enemy, ${SIMS} sims/cell.\n`);

  console.log('=== ACT 1 ===');
  for (let col = 1; col <= laneColumns(1) - 1; col++) {
    const cells = runColumn(1, col);
    const budget = realisticBudget(1, col);
    const fleet = buildFleet(budget, 'balanced');
    const elite = applyEscalations(applyVeterancy(eliteEnemyForColumn(1, col, () => 0.5), 1, col), col, representativeEscalations(1));
    const er = simulateFleet(fleet, elite, SIMS);
    printColumn(1, col, cells, { label: elite.name, winPct: Math.round(er.winRate.point * 100) });
  }
  console.log('\n  Act-1 bosses (col-10 budget fleet):');
  {
    const budget = realisticBudget(1, laneColumns(1));
    const fleet = buildFleet(budget, 'balanced');
    for (const id of BOSS_IDS) {
      const boss = applyEscalations(getBoss(id), laneColumns(1), representativeEscalations(1));
      const r = simulateFleet(fleet, boss, SIMS);
      console.log(`    ${getBoss(id).name} (${budget}cr): ${Math.round(r.winRate.point * 100)}%`);
    }
  }

  console.log('\n=== ACT 2 (silver counter-protocol applied) ===');
  for (let col = 0; col <= laneColumns(2) - 1; col++) {
    const cells = runColumn(2, col, 'hardened-veterans');
    printColumn(2, col, cells);
  }
  console.log('\n  Act-2 final trio (col-11 budget fleet, silver counter):');
  {
    const budget = realisticBudget(2, laneColumns(2));
    const fleet = buildFleet(budget, 'balanced');
    for (const id of FINAL_BOSS_IDS) {
      const boss = applyCounterProtocol(
        applyEscalations(getFinalBoss(id), globalColumn(2, laneColumns(2)), representativeEscalations(2)),
        'hardened-veterans',
      );
      const r = simulateFleet(fleet, boss, SIMS);
      console.log(`    ${getFinalBoss(id).name} (${budget}cr): ${Math.round(r.winRate.point * 100)}%`);
    }
  }
}

report();
