// Iteration 45.2/45.3/45.4: replaces actRun.ts. Where actRun.ts hand-
// mirrored the run loop (and, by construction, could only ever measure
// act 1 — it never modeled act 2's protocols, counter-protocols, warp
// lanes, pursuit, or the Foundry), this drives the REAL reducer via
// scripts/sim/agent.ts, so full-run (act 1 + act 2) measurement exists for
// the first time, and it can never silently drift from a game-layer
// change the way the old sim's "+2cr average" event approximation and
// unlimited-stock shop eventually did.
//
// Run: npx tsx scripts/runSim.ts        (matches `npm run balance:full`)
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { CommanderId } from '../src/game/commanders';
import { bossColumn, LANE_COLUMNS } from '../src/game/map';
import { runChecks } from './sim/gates';
import type { CheckResult } from './sim/gates';
import { bandGate, percentile, regressionGate, wilsonInterval } from './sim/stats';
import type { WilsonInterval } from './sim/stats';
import { pad, padNum } from './sim/table';
import type { AgentRunOutcome, FleetSnapshot } from './sim/agent';
import { simulateRunWithAgent } from './sim/agent';
import { ARCHETYPES } from './sim/policy';
import type { Archetype } from './sim/budget';

const RUNS = Number(process.env.SIM_RUNS ?? 500);

function runFor(archetype = ARCHETYPES.balanced, commanderId: CommanderId | undefined): AgentRunOutcome[] {
  const outcomes: AgentRunOutcome[] = [];
  // Oversample: a fixed commander is only offered on ~3/5 of seeds, so draw
  // extra seeds and keep going until RUNS non-skipped outcomes are banked —
  // see agent.ts's AgentRunOutcome.skipped for why.
  let seed = 0;
  let used = 0;
  while (used < RUNS && seed < RUNS * 4) {
    seed++;
    const outcome = simulateRunWithAgent(seed, seed, archetype, commanderId);
    if (outcome.skipped) continue;
    outcomes.push(outcome);
    used++;
  }
  return outcomes;
}

// Iteration 64.0: per-act-2-local-column survival, the standing version of
// the hand-computed table in plans/iteration-64.md's grounding section —
// deaths at each local column (0-11, plus the boss) and how many entrants
// were still alive (i.e. started that column) going in. Pure reporting
// over AgentRunOutcome.act/.diedAt/.won, already on every outcome — no new
// instrumentation needed for this table specifically.
interface Act2SurvivalRow {
  label: string; // "c0".."c11", "boss"
  deaths: number;
  stillAliveAfter: number; // entrants minus every death at or before this column
}

function computeAct2Survival(outcomes: AgentRunOutcome[]): { rows: Act2SurvivalRow[]; entrants: number } {
  const reached = outcomes.filter((o) => o.act === 2);
  const bossLocalCol = bossColumn(2); // 12 — one past the 12 lane columns (0-11)
  const deathLocalCols = reached.filter((o) => !o.won && o.diedAt).map((o) => o.diedAt!.globalCol - (LANE_COLUMNS + 1));
  let stillAlive = reached.length;
  const rows: Act2SurvivalRow[] = [];
  for (let c = 0; c <= bossLocalCol; c++) {
    const deaths = deathLocalCols.filter((dc) => dc === c).length;
    stillAlive -= deaths;
    rows.push({ label: c === bossLocalCol ? 'boss' : `c${c}`, deaths, stillAliveAfter: stillAlive });
  }
  return { rows, entrants: reached.length };
}

function printAct2Survival(label: string, survival: { rows: Act2SurvivalRow[]; entrants: number }) {
  console.log(`  act-2 per-local-column survival (${survival.entrants} entrants):`);
  console.log(`    ${'col'.padEnd(9)}${survival.rows.map((r) => padNum(r.label, 6)).join('')}`);
  console.log(`    ${'deaths'.padEnd(9)}${survival.rows.map((r) => padNum(String(r.deaths), 6)).join('')}`);
  console.log(`    ${'alive after'.padEnd(9)}${survival.rows.map((r) => padNum(String(r.stillAliveAfter), 6)).join('')}`);
  void label;
}

// Iteration 64.0: act-2-entry (and local-col-6) fleet snapshot, reported as
// a median/p25/p75 distribution over every run that actually reached the
// trigger point — a single mean would hide how wide the spread is, which
// is exactly the question the decision gate in plans/iteration-64.md's
// 64.0 section is asking.
interface SnapshotDistribution {
  n: number;
  fleetSize: { median: number; p25: number; p75: number };
  fleetValue: { median: number; p25: number; p75: number };
  credits: { median: number; p25: number; p75: number };
}

function summarizeSnapshots(outcomes: AgentRunOutcome[], pick: (o: AgentRunOutcome) => FleetSnapshot | null): SnapshotDistribution {
  const snaps = outcomes.map(pick).filter((s): s is FleetSnapshot => s !== null);
  const dist = (values: number[]) => ({
    median: percentile(values, 0.5),
    p25: percentile(values, 0.25),
    p75: percentile(values, 0.75),
  });
  return {
    n: snaps.length,
    fleetSize: dist(snaps.map((s) => s.fleetSize)),
    fleetValue: dist(snaps.map((s) => s.fleetValue)),
    credits: dist(snaps.map((s) => s.credits)),
  };
}

function printSnapshotDistribution(label: string, d: SnapshotDistribution) {
  console.log(`  ${label} (n=${d.n}):`);
  console.log(
    `    fleet size:  median ${d.fleetSize.median}  [p25 ${d.fleetSize.p25} - p75 ${d.fleetSize.p75}]`,
  );
  console.log(
    `    fleet value: median ${d.fleetValue.median}cr  [p25 ${d.fleetValue.p25}cr - p75 ${d.fleetValue.p75}cr]`,
  );
  console.log(
    `    credits:     median ${d.credits.median}cr  [p25 ${d.credits.p25}cr - p75 ${d.credits.p75}cr]`,
  );
}

interface RunReport {
  label: string;
  fullRunClear: WilsonInterval;
  act1Clear: WilsonInterval; // reached act 2 at all
  act2Conditional: WilsonInterval; // won, of those who reached act 2
  deathsByGlobalCol: Map<number, number>;
  n: number;
  act2Survival: { rows: Act2SurvivalRow[]; entrants: number };
  act2EntrySnapshot: SnapshotDistribution;
  act2Col6Snapshot: SnapshotDistribution;
}

function summarize(label: string, outcomes: AgentRunOutcome[]): RunReport {
  const n = outcomes.length;
  const wins = outcomes.filter((o) => o.won).length;
  const reachedAct2 = outcomes.filter((o) => o.act === 2);
  const act2Wins = reachedAct2.filter((o) => o.won).length;
  const deathsByGlobalCol = new Map<number, number>();
  for (const o of outcomes) {
    if (o.diedAt) deathsByGlobalCol.set(o.diedAt.globalCol, (deathsByGlobalCol.get(o.diedAt.globalCol) ?? 0) + 1);
  }
  return {
    label,
    fullRunClear: wilsonInterval(wins, n),
    act1Clear: wilsonInterval(reachedAct2.length, n),
    act2Conditional: wilsonInterval(act2Wins, Math.max(1, reachedAct2.length)),
    deathsByGlobalCol,
    n,
    act2Survival: computeAct2Survival(outcomes),
    act2EntrySnapshot: summarizeSnapshots(outcomes, (o) => o.act2EntrySnapshot),
    act2Col6Snapshot: summarizeSnapshots(outcomes, (o) => o.act2Col6Snapshot),
  };
}

function printReport(r: RunReport) {
  console.log(`\n=== ${r.label} (n=${r.n}) ===`);
  console.log(`  full-run clear:  ${(r.fullRunClear.point * 100).toFixed(1)}% [${(r.fullRunClear.low * 100).toFixed(1)}-${(r.fullRunClear.high * 100).toFixed(1)}]`);
  console.log(`  act-1 clear:     ${(r.act1Clear.point * 100).toFixed(1)}% [${(r.act1Clear.low * 100).toFixed(1)}-${(r.act1Clear.high * 100).toFixed(1)}]`);
  console.log(`  act-2 conditional (of those who reached it): ${(r.act2Conditional.point * 100).toFixed(1)}%`);
  const cols = [...r.deathsByGlobalCol.entries()].sort((a, b) => a[0] - b[0]);
  console.log(`  deaths by global column: ${cols.map(([c, n]) => `c${c}=${n}`).join('  ') || 'none'}`);
  printAct2Survival(r.label, r.act2Survival);
  printSnapshotDistribution('act-2 entry snapshot', r.act2EntrySnapshot);
  printSnapshotDistribution('act-2 local-col-6 snapshot', r.act2Col6Snapshot);
}

// --- Baseline + commander sweep ------------------------------------------

console.log(`Full-run simulation (act 1 + act 2) — ${RUNS} runs per commander, headless agent over the real reducer.\n`);

const baseline = summarize('Baseline (auto-picked commander)', runFor(ARCHETYPES.balanced, undefined));
printReport(baseline);

const COMMANDERS: CommanderId[] = ['merchant', 'engineer', 'spymaster', 'admiral', 'warlord'];
const commanderReports = COMMANDERS.map((id) => summarize(id, runFor(ARCHETYPES.balanced, id)));
for (const r of commanderReports) printReport(r);

// --- Archetype matrix (45.4) ----------------------------------------------
// No commander (isolates the build's own effect); full-run clear per
// archetype. Gate: no archetype should be a trap (~0%, unwinnable by
// construction) or dominant (~90%+, trivializing the run).

console.log('\n\n=== Archetype matrix (no commander, full-run clear rate) ===\n');
const archetypeReports = (Object.keys(ARCHETYPES) as Archetype[]).map((name) =>
  summarize(ARCHETYPES[name].label, runFor(ARCHETYPES[name], undefined)),
);
const archetypeHeader = pad('archetype', 30) + padNum('clear', 10) + padNum('[interval]', 16);
console.log(archetypeHeader);
console.log('-'.repeat(archetypeHeader.length));
for (const r of archetypeReports) {
  console.log(
    pad(r.label, 30) +
      padNum(`${(r.fullRunClear.point * 100).toFixed(1)}%`, 10) +
      padNum(`[${(r.fullRunClear.low * 100).toFixed(1)}-${(r.fullRunClear.high * 100).toFixed(1)}]`, 16),
  );
}

// --- Regression gate (45.3, absorbs iteration 44's 44.4) ------------------
// Compares against a checked-in baseline snapshot. No file yet on a first
// run — prints the numbers to copy into scripts/sim/baseline.json rather
// than failing with nothing to compare against.
const BASELINE_PATH = fileURLToPath(new URL('./sim/baseline.json', import.meta.url));
const storedBaseline: Record<string, number> | null = existsSync(BASELINE_PATH)
  ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  : null;

const checks: CheckResult[] = [];
if (storedBaseline) {
  for (const r of commanderReports) {
    const prior = storedBaseline[r.label];
    if (prior === undefined) continue;
    checks.push({
      label: `${r.label}: full-run clear rate holds within 30% of the recorded baseline (${prior}%)`,
      verdict: regressionGate(r.fullRunClear, prior),
    });
  }
} else {
  console.log(
    '\nNo scripts/sim/baseline.json found — regression gate skipped this run. ' +
      'Copy the commander sweep numbers above into that file once they are reviewed as the accepted baseline.',
  );
}
// Iteration 64.1 (re-anchors 46.4, was 30/30/... before that 50/50 — see
// plans/iteration-46.md for that history): act-1 clear stays in its own
// 20-40% band, untouched by this pass. Act-2 conditional and full-run are
// re-anchored here to the CONFIRMED (2026-08-13, D1) 15-25%/2-4% figures —
// the 46-era 30%/20-40% conditional target is formally retired. 46's own
// compounding math still holds (act 2 is ~12-13 forced fights in sequence;
// even a healthy 85% average per-fight win rate only clears ~12% of the
// time, `0.85^13`), so 30% conditional was never reachable at that fight
// count without making every individual fight a non-fight (~90%+ average
// odds). 15-25% is what the math can honestly support once 64.2's shortcuts
// (and, if built, 64.4's fleet-quality lever) shorten the chain instead of
// further nerfing any single fight — see plans/iteration-64.md's own status
// notes for the measured before/after and which lever moved what.
for (const r of commanderReports) {
  checks.push({
    label: `${r.label}: act-1 clear in the 20-40% target band — KNOWN GAP, see plans/iteration-46.md`,
    verdict: bandGate(r.act1Clear, 20, 40),
  });
  checks.push({
    label: `${r.label}: act-2 conditional clear in the 15-25% target band — see plans/iteration-64.md (D1)`,
    verdict: bandGate(r.act2Conditional, 15, 25),
  });
  checks.push({
    label: `${r.label}: full-run clear in the 2-4% target band — see plans/iteration-64.md (D1)`,
    verdict: bandGate(r.fullRunClear, 2, 4),
  });
}

// No-trap / no-dominant-build check for every archetype, always run
// (doesn't depend on a stored baseline).
for (const r of archetypeReports) {
  checks.push({
    label: `${r.label}: not a trap build (full-run clear > 0%)`,
    verdict: r.fullRunClear.high > 0.005 ? 'PASS' : 'FAIL',
  });
  checks.push({
    label: `${r.label}: not dominant (full-run clear < 90%)`,
    verdict: r.fullRunClear.low < 0.9 ? 'PASS' : 'FAIL',
  });
}

const anyFailed = runChecks('Gate checks', checks);
if (anyFailed) process.exitCode = 1;
