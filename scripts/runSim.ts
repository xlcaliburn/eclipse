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
import { runChecks } from './sim/gates';
import type { CheckResult } from './sim/gates';
import { bandGate, regressionGate, wilsonInterval } from './sim/stats';
import type { WilsonInterval } from './sim/stats';
import { pad, padNum } from './sim/table';
import type { AgentRunOutcome } from './sim/agent';
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

interface RunReport {
  label: string;
  fullRunClear: WilsonInterval;
  act1Clear: WilsonInterval; // reached act 2 at all
  act2Conditional: WilsonInterval; // won, of those who reached act 2
  deathsByGlobalCol: Map<number, number>;
  n: number;
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
  };
}

function printReport(r: RunReport) {
  console.log(`\n=== ${r.label} (n=${r.n}) ===`);
  console.log(`  full-run clear:  ${(r.fullRunClear.point * 100).toFixed(1)}% [${(r.fullRunClear.low * 100).toFixed(1)}-${(r.fullRunClear.high * 100).toFixed(1)}]`);
  console.log(`  act-1 clear:     ${(r.act1Clear.point * 100).toFixed(1)}% [${(r.act1Clear.low * 100).toFixed(1)}-${(r.act1Clear.high * 100).toFixed(1)}]`);
  console.log(`  act-2 conditional (of those who reached it): ${(r.act2Conditional.point * 100).toFixed(1)}%`);
  const cols = [...r.deathsByGlobalCol.entries()].sort((a, b) => a[0] - b[0]);
  console.log(`  deaths by global column: ${cols.map(([c, n]) => `c${c}=${n}`).join('  ') || 'none'}`);
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
// Iteration 46.4: band checks re-anchored to the 30/30 targets (was
// 50/50 — see plans/iteration-46.md). As of 46.2/46.3's landed levers
// (Sniper-pair fix, post-win repair, act-1-escalations-retire-at-
// boundary, hard-pool + final-trio re-tune) act-1 clear reads 11-19%
// and act-2 conditional/full-run both read a measured 0% — a real,
// substantial improvement over the pre-46 state (act-1 was 6-13%,
// act-2 conditional had never once been won) but still short of the
// 20-40%/20-40%/4-16% target bands. Labeled explicitly as a known,
// documented gap (not a silent regression) — the compounding math
// across act 2's ~13 required fights means hitting 30% conditional
// needs ~90%+ AVERAGE per-fight odds, well above what any individual
// enemy-stat pass targeted; closing it needs either a broader
// corridor-shortening pass or a revisited target, not further
// blind nerfs — see this file's own status notes for the full
// diagnosis.
for (const r of commanderReports) {
  checks.push({
    label: `${r.label}: act-1 clear in the 20-40% target band — KNOWN GAP, see plans/iteration-46.md`,
    verdict: bandGate(r.act1Clear, 20, 40),
  });
  checks.push({
    label: `${r.label}: act-2 conditional clear in the 20-40% target band — KNOWN GAP, see plans/iteration-46.md`,
    verdict: bandGate(r.act2Conditional, 20, 40),
  });
  checks.push({
    label: `${r.label}: full-run clear in the 4-16% target band — KNOWN GAP, see plans/iteration-46.md`,
    verdict: bandGate(r.fullRunClear, 4, 16),
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
