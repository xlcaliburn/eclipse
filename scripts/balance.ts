import {
  applyCounterProtocol,
  eliteEnemyForColumn,
  eliteVariant,
  FINAL_BOSS_IDS,
  GAUNTLET,
  getBoss,
  getFinalBoss,
  HARD_POOL_ACT2,
} from '../src/game/enemies';
import type { FinalBossId } from '../src/game/enemies';
import { COUNTER_PROTOCOLS, getCounterProtocol } from '../src/game/counterProtocols';
import type { CounterProtocolId } from '../src/game/counterProtocols';
import { forecastWinRate } from '../src/game/forecast';
import { STARTING_LOADOUT } from '../src/game/parts';
import type { ProtocolId } from '../src/game/protocols';
import type { EnemyDef, PlayerShipState } from '../src/game/types';
import { simulateFleet as sharedSimulateFleet } from './sim/combat';
import { runChecks } from './sim/gates';
import type { CheckResult } from './sim/gates';
import { bandGate, floorGate } from './sim/stats';
import type { WilsonInterval } from './sim/stats';

// Iteration 17 ("Outspeed"): the strike fleet is a Flagship built around
// initiative — fusion drive (+3) plus the `drives` elite upgrade (+2) reach
// init 5, with one escort. The no-speed control keeps the EXACT SAME weapon
// TYPE (ion cannons) and simply fills the drive's slot with one more of
// them instead, with no upgrade — so the two fleets differ in nothing but
// speed (2 ion cannons doubled some rounds vs. 3 ion cannons every round),
// not in per-die damage or weapon variety. An earlier draft of this fleet
// swapped the drive for a plasma cannon, which made the control fleet
// strictly better at raw damage too and confounded the comparison (control
// beat strike outright against tanky/shielded targets, which said nothing
// about speed) — recorded here so the mistake isn't repeated.
const STRIKE_FLEET: PlayerShipState[] = [
  { frameId: 'cruiser', equipped: ['init3', 'ion', 'ion', 'comp2', 'hull1'], upgrades: ['drives'], damage: 0 },
  { frameId: 'interceptor', equipped: ['ion'], upgrades: [], damage: 0 },
];
const NO_SPEED_CONTROL: PlayerShipState[] = [
  { frameId: 'cruiser', equipped: ['ion', 'ion', 'ion', 'comp2', 'hull1'], upgrades: [], damage: 0 },
  { frameId: 'interceptor', equipped: ['ion'], upgrades: [], damage: 0 },
];

const FLEETS: { name: string; fleet: PlayerShipState[] }[] = [
  {
    name: 'starting fleet',
    fleet: [{ frameId: 'cruiser', equipped: [...STARTING_LOADOUT], damage: 0, upgrades: [] }],
  },
  {
    // Same ship, carrying 3 damage into the fight — tests how punishing
    // carryover damage is early in a run.
    name: 'starting fleet (2 dmg)',
    fleet: [{ frameId: 'cruiser', equipped: [...STARTING_LOADOUT], damage: 2, upgrades: [] }],
  },
  {
    // Roughly what a player has by column 3: 1 shop visit, ~12 credits
    // spent on top of the starting loadout.
    name: 'col3-typical fleet',
    fleet: [
      { frameId: 'cruiser', equipped: ['ion', 'ion', 'comp1', 'hull1', 'shield1', 'hull1'], damage: 0, upgrades: [] },
    ],
  },
  {
    // Roughly fights 3-5 of a decent run: ~16-18 credits spent on parts.
    name: 'mid fleet',
    fleet: [{ frameId: 'cruiser', equipped: ['ion', 'ion', 'comp2', 'shield1', 'hull1', 'init1'], damage: 0, upgrades: [] }],
  },
  {
    // 2026-08-05 (iteration 26): the gap between "mid fleet" (16-18cr,
    // columns 3-5) and "strong fleet" (~67cr, near-perfect play) had
    // nothing standing in for the player who actually reaches column 10
    // having shopped normally — a couple of visits, some parts that
    // weren't the theoretical optimum, credits not perfectly zeroed out
    // every stop. ~31cr (ion 3 + plasma 5 + comp2 5 + hull1 3 + shield1 3
    // on the Flagship, interceptor 6 + ion 3 + hull1 3 for the escort): a
    // Flagship with 2 decent weapons and hull/shield, plus one escort —
    // solid, not minmaxed. This is what surfaced the act-1-boss complaint
    // the "strong fleet" gate alone couldn't catch.
    name: 'col10 solid fleet',
    fleet: [
      { frameId: 'cruiser', equipped: ['ion', 'plasma', 'comp2', 'hull1', 'shield1'], damage: 0, upgrades: [] },
      { frameId: 'interceptor', equipped: ['ion', 'hull1'], damage: 0, upgrades: [] },
    ],
  },
  {
    // Realistic end-of-run fleet: ~66 of the ~68 credits a full winning run
    // earns (parts 32 + interceptor 8 + parts 13 + interceptor 8 + ion 3 + hull 3).
    name: 'strong fleet',
    fleet: [
      { frameId: 'cruiser', equipped: ['plasma', 'plasma', 'comp3', 'hull2', 'init3', 'shield1'], damage: 0, upgrades: [] },
      { frameId: 'interceptor', equipped: ['plasma', 'comp2', 'hull1'], damage: 0, upgrades: [] },
      { frameId: 'interceptor', equipped: ['ion', 'hull1'], damage: 0, upgrades: [] },
    ],
  },
  {
    // Iteration 31-M3: what "strong fleet" (~66cr, near-perfect act-1 play)
    // actually looks like by the time it's standing in front of a final
    // boss — protocols and the Foundry both exist by then. Same shape as
    // "strong fleet" plus +1 computer and +1 HP fused into the Flagship
    // (6cr for the HP fusion, 10cr for the computer fusion as the ship's
    // 2nd purchase — fusionCost's per-ship escalation — +20cr on top of
    // strong fleet's ~66cr, so ~86cr all-in). The gold protocol pick
    // (twin-linked mounts, one extra die on each ship's first weapon) is
    // free — a draft, not a purchase — and is folded in only where this
    // fixture is measured with `protocols` passed explicitly (this table's
    // own forecastWinRate grid below doesn't thread protocols through, so
    // twin-linked's die doesn't show up there — see the final-boss section
    // near the bottom of this file for the protocol-aware measurement).
    name: 'act-2 endgame fleet',
    fleet: [
      { frameId: 'cruiser', equipped: ['plasma', 'plasma', 'comp3', 'hull2', 'init3', 'shield1'], damage: 0, upgrades: [], fusions: { computer: 1, hp: 1 } },
      { frameId: 'interceptor', equipped: ['plasma', 'comp2', 'hull1'], damage: 0, upgrades: [] },
      { frameId: 'interceptor', equipped: ['ion', 'hull1'], damage: 0, upgrades: [] },
    ],
  },
  { name: 'strike fleet (init 5)', fleet: STRIKE_FLEET },
  { name: 'no-speed control', fleet: NO_SPEED_CONTROL },
];

const SIMS = 1000;

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + ' '.repeat(width - s.length);
}

function findEnemy(id: string): EnemyDef {
  const found = GAUNTLET.find((e) => e.id === id);
  if (!found) throw new Error(`Unknown enemy id: ${id}`);
  return found;
}

const ANCIENT_GUARDIAN_ELITE = eliteVariant(findEnemy('ancient-guardian'));
const SNIPER_ELITE = eliteEnemyForColumn(1, 3, Math.random); // the col-3 elite, softened to +1 HP

// The act-1 mid-boss trio (iteration 8): one of these three is drawn at
// random for every run's column-10 boss fight, equal probability — GCDS is
// already in GAUNTLET (its col-3-legacy id kept it there since iteration
// 1), but Hive Mother and Dreadnought were never added to this table, so
// only one of the three bosses a run can actually meet was ever measured
// against the sanity checks below (iteration 22.6 fix).
const HIVE_MOTHER = getBoss('hive');
const DREADNOUGHT = getBoss('dread');

const MATCHUPS: EnemyDef[] = [...GAUNTLET, SNIPER_ELITE, ANCIENT_GUARDIAN_ELITE, HIVE_MOTHER, DREADNOUGHT];

console.log(`Win rate over ${SIMS} simulations per matchup\n`);

const header = pad('enemy', 26) + FLEETS.map((f) => pad(f.name, 20)).join('');
console.log(header);
console.log('-'.repeat(header.length));

const rates: Record<string, Record<string, number>> = {};

for (const enemy of MATCHUPS) {
  const row = FLEETS.map((build) => {
    const rate = forecastWinRate(build.fleet, enemy, SIMS);
    rates[enemy.id] ??= {};
    rates[enemy.id][build.name] = rate;
    return pad(`${rate}%`, 20);
  }).join('');
  console.log(pad(enemy.name, 26) + row);
}

// --- Iteration 17 ("Outspeed") audit --------------------------------------
// Win rate alone doesn't show what Outspeed is FOR (shorter fights), so this
// section also tracks average cannon-round count — simulated directly
// (bypassing forecastWinRate's cache, which only stores the win percentage)
// so both numbers come from the exact same simulation runs.
//
// Iteration 45.1: this used to be a third private copy of the same combat
// loop balance.ts, actRun.ts, and enemyValue.ts each hand-rolled — now a
// thin wrapper over the one shared `sharedSimulateFleet` (scripts/sim/
// combat.ts), keeping this file's own plain-percent return shape (every
// call site below already compares it with >=/<= against a whole number)
// while exposing the underlying Wilson interval for the sanity-check gates
// at the bottom of this file to read directly.
function simulateFleet(
  fleet: PlayerShipState[],
  enemy: EnemyDef,
  sims: number,
  protocols?: ProtocolId[],
): { winRate: number; avgRounds: number; interval: WilsonInterval } {
  const result = sharedSimulateFleet(fleet, enemy, sims, { protocols });
  return { winRate: Math.round(result.winRate.point * 100), avgRounds: result.avgRounds, interval: result.winRate };
}

console.log('\nIteration 17 (Outspeed) — average cannon rounds per matchup (strike fleet vs control):\n');
const roundsHeader = pad('enemy', 26) + pad('strike fleet', 16) + pad('  rounds', 12) + pad('control', 16) + pad('  rounds', 12);
console.log(roundsHeader);
console.log('-'.repeat(roundsHeader.length));

const strikeAvgRounds: Record<string, number> = {};
const controlAvgRounds: Record<string, number> = {};
const strikeWinRate: Record<string, number> = {};
const controlWinRate: Record<string, number> = {};
const strikeWinInterval: Record<string, WilsonInterval> = {};
const controlWinInterval: Record<string, WilsonInterval> = {};

for (const enemy of MATCHUPS) {
  const strike = simulateFleet(STRIKE_FLEET, enemy, SIMS);
  const control = simulateFleet(NO_SPEED_CONTROL, enemy, SIMS);
  strikeAvgRounds[enemy.id] = strike.avgRounds;
  controlAvgRounds[enemy.id] = control.avgRounds;
  strikeWinRate[enemy.id] = strike.winRate;
  controlWinRate[enemy.id] = control.winRate;
  strikeWinInterval[enemy.id] = strike.interval;
  controlWinInterval[enemy.id] = control.interval;
  console.log(
    pad(enemy.name, 26) +
      pad(`${strike.winRate}%`, 16) +
      pad(strike.avgRounds.toFixed(2), 12) +
      pad(`${control.winRate}%`, 16) +
      pad(control.avgRounds.toFixed(2), 12),
  );
}

// The Hive Empress (init 4) is the one enemy fast enough to outspeed a
// slow player fleet on her own — the counter is one fast escort denying
// her gap, not raw stats. Both fleets need enough HP/shield AND enough
// weapons to survive her 12-die missile alpha (6 ships x 2 missile dice)
// AND actually clear her 6 ships (hp2 each) within the 30-round cap — two
// earlier attempts at this fleet failed for different reasons: hp 3 with
// shield 1 died to the alpha outright; hp 5 with only 1 weapon survived
// fine but couldn't out-damage her 6 ships before the stalemate cap
// declared the enemy the winner. Both are recorded here so the mistakes
// aren't repeated. The fix is a second ship for more guns; the base fleet
// pairs the Flagship with a slow, tanky Bastion (base hp 6, init 0 — the
// "wall of HP" approach), and the tempo-cover variant swaps that Bastion
// for an Interceptor (base initiative 2, enough to deny her gap-4) instead
// — the exact tank-vs-tempo-cover tradeoff the design doc describes.
// 2026-08-08 (iteration 46): re-strengthened again — both fixtures had
// drifted to a 1%/1% dead heat (unable to discriminate anything) as the
// Empress's own ship count grew 6 -> 7 (31-M3) -> 8 (46.3, this
// iteration's final-trio re-tune) without this fixture ever being
// revisited; her alpha strike is now 16 missile dice, not the 12 this
// fleet was originally sized for. +hull2 on both ships (survivability
// only — the tank-vs-tempo-cover comparison itself is untouched).
const EMPRESS = getFinalBoss('empress');
const ALL_SLOW_FLEET: PlayerShipState[] = [
  { frameId: 'cruiser', equipped: ['plasma', 'plasma', 'comp3', 'hull2', 'shield1', 'hull2'], damage: 0, upgrades: [] },
  { frameId: 'bastion', equipped: ['plasma', 'hull2'], damage: 0, upgrades: [] },
];
const SLOW_FLEET_PLUS_INTERCEPTOR: PlayerShipState[] = [
  { frameId: 'cruiser', equipped: ['plasma', 'plasma', 'comp3', 'hull2', 'shield1', 'hull2'], damage: 0, upgrades: [] },
  { frameId: 'interceptor', equipped: ['plasma', 'hull2'], damage: 0, upgrades: [] }, // base initiative 2 — enough to deny the Empress's gap-4 (4-2=2 < 4)
];
const empressAllSlow = simulateFleet(ALL_SLOW_FLEET, EMPRESS, SIMS);
const empressPlusInterceptor = simulateFleet(SLOW_FLEET_PLUS_INTERCEPTOR, EMPRESS, SIMS);

console.log('\nHive Empress (init 4) tempo-cover test:\n');
console.log(`  all-init-0 fleet:            ${empressAllSlow.winRate}% (avg ${empressAllSlow.avgRounds.toFixed(2)} rounds)`);
console.log(`  same fleet + 1 Interceptor:  ${empressPlusInterceptor.winRate}% (avg ${empressPlusInterceptor.avgRounds.toFixed(2)} rounds)`);

// --- Iteration 30 (counter-protocols): the "half or less" principle, ------
// measured, NOT yet gated — see finding below.
//
// Attempted against "strong fleet" (a near-maximal act-1 endgame build) on
// two act-2 reference points: Flak fortress (mid pool) and Warden (hard
// pool, "the pre-boss wall"). Finding: "strong fleet" has no calibrated
// middle ground against act-2's roster, because it was tuned exclusively
// against act 1. Against Flak fortress it wins 99%+ — every silver/gold
// counter measures ~0pp not because the counter is weak, but because
// there's no win rate left to move. Against Warden it's already down at
// 1-4% — the opposite floor, same problem. Titan (a final boss) is a third
// data point at the same failure mode from the hard side: 0% baseline, no
// headroom at all (the trio has never been measured against a post-
// protocols fleet at all — see plans/iteration-31.md, "31-M3 requires
// iteration 30 first"). None of the three is a fixture this gate can trust
// yet. Printed here for visibility and as the harness iteration 31-M3 will
// reuse once it builds the "act-2 endgame fleet" fixture that milestone
// already calls for — this table becomes a real gate the moment that
// fixture exists, with no other code change needed.
const STRONG_FLEET = FLEETS.find((f) => f.name === 'strong fleet')!.fleet;
const WARDEN = HARD_POOL_ACT2[1]; // 'the pre-boss wall' — see enemies.ts
const COUNTER_REP_ENEMIES: { label: string; enemy: EnemyDef }[] = [
  { label: 'Warden (act-2 hard)', enemy: WARDEN },
  { label: 'Titan (final boss)', enemy: getFinalBoss('titan') },
];

console.log('\nIteration 30 (counter-protocols) — win-rate delta (pp) from "strong fleet" alone, per counter:');
console.log('(measured, not gated — no calibrated act-2 reference fleet exists yet; see comment above)\n');
const counterHeader = pad('counter (tier)', 34) + COUNTER_REP_ENEMIES.map((e) => pad(e.label, 26)).join('');
console.log(counterHeader);
console.log('-'.repeat(counterHeader.length));

const counterBaseline = COUNTER_REP_ENEMIES.map(({ enemy }) => simulateFleet(STRONG_FLEET, enemy, SIMS).winRate);

for (const id of Object.keys(COUNTER_PROTOCOLS) as CounterProtocolId[]) {
  const def = COUNTER_PROTOCOLS[id];
  const cells = COUNTER_REP_ENEMIES.map(({ enemy }, i) => {
    const withCounter = simulateFleet(STRONG_FLEET, applyCounterProtocol(enemy, id), SIMS).winRate;
    const delta = counterBaseline[i] - withCounter; // positive = the counter made the fight harder
    return pad(`${delta}pp (${withCounter}%)`, 26);
  });
  console.log(pad(`${def.name} (${def.tier})`, 34) + cells.join(''));
}

// --- Iteration 31-M3 (final-boss re-tune) ---------------------------------
// The trio, measured against the fixture this milestone exists to build
// (see "act-2 endgame fleet" above), the way the game can actually put it
// in front of a player: a gold protocol folded in (twin-linked mounts —
// the "representative gold protocol" the plan calls for, since it's the
// one whose effect is expressible as flat stats) and a silver counter-
// protocol on the enemy side (post-iteration-30, act 2 is never counter-
// less — the draft is mandatory — so measuring without one would tune
// against a state the game can no longer be in; silver is the floor every
// player can guarantee by drafting silver, per the plan's Sequencing
// note). 'hardened-veterans' (+1 HP, every enemy ship) is the
// representative silver: generic across every boss shape, unlike
// targeting-arrays/evasive-doctrine which lean into the computer-vs-
// piloting asymmetry iteration 26 already characterized at length.
const ENDGAME_FLEET = FLEETS.find((f) => f.name === 'act-2 endgame fleet')!.fleet;
const ENDGAME_PROTOCOLS: ProtocolId[] = ['twin-linked-mounts'];
const REP_SILVER_COUNTER: CounterProtocolId = 'hardened-veterans';
const REP_PRISMATIC_COUNTER: CounterProtocolId = 'attack-wings'; // spot-check only, see below

console.log('\nIteration 31-M3 (final-boss re-tune) — act-2 endgame fleet vs the trio, target band 25-55%:\n');
const finalBossHeader = pad('final boss', 20) + pad('win rate', 14) + pad('avg rounds', 14);
console.log(finalBossHeader);
console.log('-'.repeat(finalBossHeader.length));

const finalBossRates: Record<FinalBossId, number> = { titan: 0, empress: 0, citadel: 0 };
const finalBossInterval: Partial<Record<FinalBossId, WilsonInterval>> = {};
for (const id of FINAL_BOSS_IDS) {
  const boss = applyCounterProtocol(getFinalBoss(id), REP_SILVER_COUNTER);
  const result = simulateFleet(ENDGAME_FLEET, boss, SIMS, ENDGAME_PROTOCOLS);
  finalBossRates[id] = result.winRate;
  finalBossInterval[id] = result.interval;
  console.log(pad(getFinalBoss(id).name, 20) + pad(`${result.winRate}%`, 14) + pad(result.avgRounds.toFixed(2), 14));
}

// Spot-check (plan step 2): a prismatic counter shouldn't push any boss
// absurdly past the band — printed only, not gated, since prismatic is a
// player choice (drafting it is opting into the harder answer), not the
// guaranteed floor silver is.
console.log(`\nSpot-check — prismatic counter (${getCounterProtocol(REP_PRISMATIC_COUNTER).name}) on top, same fleet:`);
for (const id of FINAL_BOSS_IDS) {
  const boss = applyCounterProtocol(getFinalBoss(id), REP_PRISMATIC_COUNTER);
  const result = simulateFleet(ENDGAME_FLEET, boss, SIMS, ENDGAME_PROTOCOLS);
  console.log(`  ${pad(getFinalBoss(id).name, 18)}${result.winRate}%`);
}

// Floor check (plan step 4): the pre-fusion, pre-protocol "strong fleet"
// must still beat each boss at a visible, non-wall rate with NO counter
// applied — the trio getting harder for the maxed-out endgame must not
// also wall off a merely-solid finish (col10-solid's exact lesson, one
// act later).
const finalBossFloor: Record<FinalBossId, number> = { titan: 0, empress: 0, citadel: 0 };
const finalBossFloorInterval: Partial<Record<FinalBossId, WilsonInterval>> = {};
console.log('\nFloor check — strong fleet (pre-fusion, no counter) vs the trio:');
for (const id of FINAL_BOSS_IDS) {
  const result = simulateFleet(STRONG_FLEET, getFinalBoss(id), SIMS);
  finalBossFloor[id] = result.winRate;
  finalBossFloorInterval[id] = result.interval;
  console.log(`  ${pad(getFinalBoss(id).name, 18)}${result.winRate}%`);
}

// --- Iteration 34 (the relic chain) — the Ancient artifact, spot-checked --
// not gated. A once-per-run, 3-event-gated capstone isn't tuned like a shop
// part; this just answers "what does +4 computer/+4 piloting in one slot
// actually do" against a representative mid-pool matchup, per the plan's
// 34.3. "mid fleet" (16-18cr, fights 3-5 of a decent run) with its comp2
// swapped for the artifact — a like-for-like computer-slot upgrade (both
// are `type: 'computer'` parts), not a weapon removed, so this isolates the
// artifact's own effect instead of measuring "one fewer cannon."
const MID_FLEET = FLEETS.find((f) => f.name === 'mid fleet')!.fleet;
const MID_FLEET_WITH_ARTIFACT: PlayerShipState[] = MID_FLEET.map((ship) => ({
  ...ship,
  equipped: ship.equipped.map((p) => (p === 'comp2' ? 'ancient-artifact' : p)),
}));
const ARTIFACT_MATCHUP = GAUNTLET[2]; // shield cruiser — a real accuracy check, benefits directly from +4 computer
const artifactBaseline = forecastWinRate(MID_FLEET, ARTIFACT_MATCHUP, SIMS);
const artifactWithPart = forecastWinRate(MID_FLEET_WITH_ARTIFACT, ARTIFACT_MATCHUP, SIMS);
console.log('\nIteration 34 (the relic chain) — Ancient artifact spot-check (informational, not gated):');
console.log(
  `  mid fleet vs ${ARTIFACT_MATCHUP.name}: ${artifactBaseline}% baseline -> ${artifactWithPart}% with the artifact swapped in for comp2 (+${artifactWithPart - artifactBaseline}pp)`,
);

// Iteration 45.1: gate semantics upgraded from point checks to
// interval-aware ones (see scripts/sim/stats.ts) wherever a Wilson
// interval is available — the strike/control and final-boss checks below
// all run through the shared `simulateFleet`, which exposes one. The
// GAUNTLET-matchup checks still read `rates` (forecastWinRate's own
// cached point estimate — that table isn't threaded through the shared
// interval machinery yet) and fall back to a plain PASS/FAIL boolean;
// noted here rather than silently mixed in as if identical.
function toVerdict(pass: boolean): CheckResult['verdict'] {
  return pass ? 'PASS' : 'FAIL';
}

const checks: CheckResult[] = [
  {
    label: 'starting fleet (fresh) beats scout pack >= 97%',
    verdict: toVerdict(rates[GAUNTLET[0].id]['starting fleet'] >= 97),
  },
  {
    label: 'starting fleet (fresh) vs shield cruiser <= 45%',
    verdict: toVerdict(rates[GAUNTLET[2].id]['starting fleet'] <= 45),
  },
  {
    label: 'strong fleet beats ancient guardian (non-elite) >= 60%',
    verdict: toVerdict(rates[GAUNTLET[7].id]['strong fleet'] >= 60),
  },
  {
    // iteration 26: player feedback ("two cruisers with multiple weapons
    // plus the Warlord flagship — the boss two-shots me every run") found
    // the previous "strong fleet in 20-60%" gate below was checking the
    // wrong fleet — it only ever exercised balance.ts's near-maximum,
    // ~67cr reference, which no below-'strong' fleet (including this one)
    // was measured against. "col10 solid fleet" (~31cr, a solid-but-not-
    // maxed build — the shape of fleet the feedback actually described) is
    // the fixture this boss is now tuned against; see enemies.ts's GCDS
    // comment for the full re-tune writeup.
    label: 'col10 solid fleet vs GCDS in 20-60%',
    verdict: toVerdict(rates[GAUNTLET[8].id]['col10 solid fleet'] >= 20 && rates[GAUNTLET[8].id]['col10 solid fleet'] <= 60),
  },
  {
    // Superseded band (kept only as a floor, not a ceiling): re-tuning for
    // the check above pushed strong fleet's win rate to ~100%. That's a
    // deliberate acceptance, not a regression — see enemies.ts's GCDS
    // comment for why the two fleets aren't separable with this boss's
    // stats alone. A near-maxed build reliably beating a mid-boss was
    // never the complaint; a solid-but-not-maxed build losing every run
    // was.
    label: 'strong fleet beats GCDS >= 60% (ceiling intentionally uncapped since iteration 26)',
    verdict: toVerdict(rates[GAUNTLET[8].id]['strong fleet'] >= 60),
  },
  {
    // Same iteration-26 re-tune and same rationale as GCDS above.
    label: 'col10 solid fleet vs Dreadnought (the other act-1 mid-boss) in 20-60%',
    verdict: toVerdict(rates[DREADNOUGHT.id]['col10 solid fleet'] >= 20 && rates[DREADNOUGHT.id]['col10 solid fleet'] <= 60),
  },
  {
    label: 'strong fleet beats Dreadnought >= 60% (ceiling intentionally uncapped since iteration 26)',
    verdict: toVerdict(rates[DREADNOUGHT.id]['strong fleet'] >= 60),
  },
  {
    // Known gap, not yet closed (2026-08-04, iteration 22.6): a 3-ship
    // fleet with 4+ cannon dice one-shots Hive Mother's 4x 1-2-HP ships
    // regardless of shield/HP tuning tried so far. Left as a documented
    // FAIL (see this file's Hive Mother comment) rather than silently
    // dropped from the table, so a future pass has the number to beat.
    label: 'strong fleet vs Hive Mother (the other act-1 mid-boss) in 20-60% — KNOWN FAIL, see enemies.ts',
    verdict: toVerdict(rates[HIVE_MOTHER.id]['strong fleet'] >= 20 && rates[HIVE_MOTHER.id]['strong fleet'] <= 60),
  },
  {
    // iteration 26: checked against the same "two-shots me" feedback that
    // drove GCDS/Dreadnought's re-tune. Already healthy (81%, comfortably
    // on the easy side) — left as a floor check, not re-tuned; see this
    // file's Hive Mother comment.
    label: 'col10 solid fleet vs Hive Mother >= 60% (already easy, not re-tuned in iteration 26)',
    verdict: toVerdict(rates[HIVE_MOTHER.id]['col10 solid fleet'] >= 60),
  },
  {
    label: 'strong fleet beats the col-7 elite (ancient guardian +2 HP) >= 40%',
    verdict: toVerdict(rates[ANCIENT_GUARDIAN_ELITE.id]['strong fleet'] >= 40),
  },
  {
    label: 'col3-typical fleet beats the col-3 elite (sniper +1 HP) >= 50%',
    verdict: toVerdict(rates[SNIPER_ELITE.id]['col3-typical fleet'] >= 50),
  },
  {
    label: 'a fresh starting fleet vs the col-3 elite is a real risk, not a wall: 5-25%',
    verdict: toVerdict(rates[SNIPER_ELITE.id]['starting fleet'] >= 5 && rates[SNIPER_ELITE.id]['starting fleet'] <= 25),
  },
  {
    // Target 17.4 #1: strike fleet vs its prey — strong but not free.
    // Scout pack (also init 0) was the first candidate tried here and had
    // to be dropped: it's so weak (1 HP, 0 comp/shield) that EVERY fleet in
    // this script beats it 100%, strike and control alike — a ceiling that
    // proves nothing about speed. Plasma tank (init 0, hp 5, shield 1) is
    // still squarely "prey" by the gap-4 rule but is an actual fight, so it
    // discriminates: this is where the two fleets' numbers actually differ.
    label: 'strike fleet vs plasma tank (its prey, init 0) is 65-90%',
    verdict: bandGate(strikeWinInterval[GAUNTLET[4].id], 65, 90),
  },
  {
    label: 'strike fleet vs plasma tank beats the no-speed control (speed is worth buying)',
    verdict: toVerdict(strikeWinRate[GAUNTLET[4].id] > controlWinRate[GAUNTLET[4].id]),
  },
  {
    // Target 17.4 #2: vs an init >= 3 enemy (interceptor swarm), speed the
    // fleet can't leverage shouldn't cost it more than 5pp against the
    // control fleet built the same way minus the drive.
    label: 'strike fleet vs interceptor swarm (init 3, can\'t leverage speed) within 5pp of control',
    verdict: toVerdict(Math.abs(strikeWinRate[GAUNTLET[3].id] - controlWinRate[GAUNTLET[3].id]) <= 5),
  },
  {
    // Target 17.4 #3: the gap between these two IS the Hive Empress's
    // signature mechanic working as designed.
    label: 'Hive Empress: one Interceptor (tempo cover) measurably improves the win rate',
    verdict: toVerdict(empressPlusInterceptor.winRate > empressAllSlow.winRate),
  },
  ...FINAL_BOSS_IDS.map((id) => ({
    label: `act-2 endgame fleet (+ silver counter) vs ${getFinalBoss(id).name} in 25-55%`,
    verdict: bandGate(finalBossInterval[id]!, 25, 55),
  })),
  ...FINAL_BOSS_IDS.map((id) => {
    // 9 was the real floor all three bosses could hit at once — until
    // iteration 46.3 re-tuned the trio back into its endgame-fleet band
    // (drifted to 65-73% from unrelated economy/rarity churn) and hit
    // the same band-vs-floor tension Void Citadel's own comment already
    // documented for itself: raising difficulty enough to satisfy the
    // endgame-fleet band (this file's own check above, and the number
    // actually tied to this iteration's act-2 target) pushes the
    // pre-fusion floor fleet below 9% for Titan and Citadel too now —
    // see enemies.ts's TITAN/VOID_CITADEL comments for the full
    // isolation sweep. Left as documented, known-marginal FAILs (same
    // treatment as Hive Mother's pre-existing one below) rather than
    // silently loosened or dropped.
    const knownMarginal = id === 'titan' || id === 'citadel';
    return {
      label: `strong fleet (pre-fusion, no counter) still beats ${getFinalBoss(id).name} >= 9% (not a wall)${knownMarginal ? ' — KNOWN MARGINAL (band-vs-floor tension), see enemies.ts' : ''}`,
      verdict: floorGate(finalBossFloorInterval[id]!, 9),
    };
  }),
];

const anyFailed = runChecks('Sanity checks', checks);
if (anyFailed) {
  process.exitCode = 1;
}
