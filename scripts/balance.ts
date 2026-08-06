import { eliteEnemyForColumn, eliteVariant, GAUNTLET, getBoss, getFinalBoss } from '../src/game/enemies';
import { forecastWinRate } from '../src/game/forecast';
import { initCombat, runToEnd } from '../src/game/combatEngine';
import { deriveFleetForCombat } from '../src/game/ship';
import { STARTING_LOADOUT } from '../src/game/parts';
import type { EnemyDef, PlayerShipState } from '../src/game/types';

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
    fleet: [{ frameId: 'cruiser', equipped: [...STARTING_LOADOUT], damage: 0 }],
  },
  {
    // Same ship, carrying 3 damage into the fight — tests how punishing
    // carryover damage is early in a run.
    name: 'starting fleet (2 dmg)',
    fleet: [{ frameId: 'cruiser', equipped: [...STARTING_LOADOUT], damage: 2 }],
  },
  {
    // Roughly what a player has by column 3: 1 shop visit, ~12 credits
    // spent on top of the starting loadout.
    name: 'col3-typical fleet',
    fleet: [
      { frameId: 'cruiser', equipped: ['ion', 'ion', 'comp1', 'hull1', 'shield1', 'hull1'], damage: 0 },
    ],
  },
  {
    // Roughly fights 3-5 of a decent run: ~16-18 credits spent on parts.
    name: 'mid fleet',
    fleet: [{ frameId: 'cruiser', equipped: ['ion', 'ion', 'comp2', 'shield1', 'hull1', 'init1'], damage: 0 }],
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
      { frameId: 'cruiser', equipped: ['ion', 'plasma', 'comp2', 'hull1', 'shield1'], damage: 0 },
      { frameId: 'interceptor', equipped: ['ion', 'hull1'], damage: 0 },
    ],
  },
  {
    // Realistic end-of-run fleet: ~66 of the ~68 credits a full winning run
    // earns (parts 32 + interceptor 8 + parts 13 + interceptor 8 + ion 3 + hull 3).
    name: 'strong fleet',
    fleet: [
      { frameId: 'cruiser', equipped: ['plasma', 'plasma', 'comp3', 'hull2', 'init3', 'shield1'], damage: 0 },
      { frameId: 'interceptor', equipped: ['plasma', 'comp2', 'hull1'], damage: 0 },
      { frameId: 'interceptor', equipped: ['ion', 'hull1'], damage: 0 },
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
function simulateFleet(fleet: PlayerShipState[], enemy: EnemyDef, sims: number): { winRate: number; avgRounds: number } {
  const fleetInput = deriveFleetForCombat(fleet);
  let wins = 0;
  let totalRounds = 0;
  for (let seed = 1; seed <= sims; seed++) {
    const result = runToEnd(initCombat(fleetInput, enemy, seed));
    if (result.winner === 'player') wins++;
    totalRounds += Math.max(0, result.round - 1); // round 0 is the missile phase, not a cannon round
  }
  return { winRate: Math.round((wins / sims) * 100), avgRounds: totalRounds / sims };
}

console.log('\nIteration 17 (Outspeed) — average cannon rounds per matchup (strike fleet vs control):\n');
const roundsHeader = pad('enemy', 26) + pad('strike fleet', 16) + pad('  rounds', 12) + pad('control', 16) + pad('  rounds', 12);
console.log(roundsHeader);
console.log('-'.repeat(roundsHeader.length));

const strikeAvgRounds: Record<string, number> = {};
const controlAvgRounds: Record<string, number> = {};
const strikeWinRate: Record<string, number> = {};
const controlWinRate: Record<string, number> = {};

for (const enemy of MATCHUPS) {
  const strike = simulateFleet(STRIKE_FLEET, enemy, SIMS);
  const control = simulateFleet(NO_SPEED_CONTROL, enemy, SIMS);
  strikeAvgRounds[enemy.id] = strike.avgRounds;
  controlAvgRounds[enemy.id] = control.avgRounds;
  strikeWinRate[enemy.id] = strike.winRate;
  controlWinRate[enemy.id] = control.winRate;
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
const EMPRESS = getFinalBoss('empress');
const ALL_SLOW_FLEET: PlayerShipState[] = [
  { frameId: 'cruiser', equipped: ['plasma', 'plasma', 'comp3', 'hull2', 'shield1'], damage: 0 },
  { frameId: 'bastion', equipped: ['plasma'], damage: 0 },
];
const SLOW_FLEET_PLUS_INTERCEPTOR: PlayerShipState[] = [
  { frameId: 'cruiser', equipped: ['plasma', 'plasma', 'comp3', 'hull2', 'shield1'], damage: 0 },
  { frameId: 'interceptor', equipped: ['plasma'], damage: 0 }, // base initiative 2 — enough to deny the Empress's gap-4 (4-2=2 < 4)
];
const empressAllSlow = simulateFleet(ALL_SLOW_FLEET, EMPRESS, SIMS);
const empressPlusInterceptor = simulateFleet(SLOW_FLEET_PLUS_INTERCEPTOR, EMPRESS, SIMS);

console.log('\nHive Empress (init 4) tempo-cover test:\n');
console.log(`  all-init-0 fleet:            ${empressAllSlow.winRate}% (avg ${empressAllSlow.avgRounds.toFixed(2)} rounds)`);
console.log(`  same fleet + 1 Interceptor:  ${empressPlusInterceptor.winRate}% (avg ${empressPlusInterceptor.avgRounds.toFixed(2)} rounds)`);

console.log('\nSanity checks:');

const checks: { label: string; pass: boolean }[] = [
  {
    label: 'starting fleet (fresh) beats scout pack >= 97%',
    pass: rates[GAUNTLET[0].id]['starting fleet'] >= 97,
  },
  {
    label: 'starting fleet (fresh) vs shield cruiser <= 45%',
    pass: rates[GAUNTLET[2].id]['starting fleet'] <= 45,
  },
  {
    label: 'strong fleet beats ancient guardian (non-elite) >= 60%',
    pass: rates[GAUNTLET[7].id]['strong fleet'] >= 60,
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
    pass: rates[GAUNTLET[8].id]['col10 solid fleet'] >= 20 && rates[GAUNTLET[8].id]['col10 solid fleet'] <= 60,
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
    pass: rates[GAUNTLET[8].id]['strong fleet'] >= 60,
  },
  {
    // Same iteration-26 re-tune and same rationale as GCDS above.
    label: 'col10 solid fleet vs Dreadnought (the other act-1 mid-boss) in 20-60%',
    pass: rates[DREADNOUGHT.id]['col10 solid fleet'] >= 20 && rates[DREADNOUGHT.id]['col10 solid fleet'] <= 60,
  },
  {
    label: 'strong fleet beats Dreadnought >= 60% (ceiling intentionally uncapped since iteration 26)',
    pass: rates[DREADNOUGHT.id]['strong fleet'] >= 60,
  },
  {
    // Known gap, not yet closed (2026-08-04, iteration 22.6): a 3-ship
    // fleet with 4+ cannon dice one-shots Hive Mother's 4x 1-2-HP ships
    // regardless of shield/HP tuning tried so far. Left as a documented
    // FAIL (see this file's Hive Mother comment) rather than silently
    // dropped from the table, so a future pass has the number to beat.
    label: 'strong fleet vs Hive Mother (the other act-1 mid-boss) in 20-60% — KNOWN FAIL, see enemies.ts',
    pass: rates[HIVE_MOTHER.id]['strong fleet'] >= 20 && rates[HIVE_MOTHER.id]['strong fleet'] <= 60,
  },
  {
    // iteration 26: checked against the same "two-shots me" feedback that
    // drove GCDS/Dreadnought's re-tune. Already healthy (81%, comfortably
    // on the easy side) — left as a floor check, not re-tuned; see this
    // file's Hive Mother comment.
    label: 'col10 solid fleet vs Hive Mother >= 60% (already easy, not re-tuned in iteration 26)',
    pass: rates[HIVE_MOTHER.id]['col10 solid fleet'] >= 60,
  },
  {
    label: 'strong fleet beats the col-7 elite (ancient guardian +2 HP) >= 40%',
    pass: rates[ANCIENT_GUARDIAN_ELITE.id]['strong fleet'] >= 40,
  },
  {
    label: 'col3-typical fleet beats the col-3 elite (sniper +1 HP) >= 50%',
    pass: rates[SNIPER_ELITE.id]['col3-typical fleet'] >= 50,
  },
  {
    label: 'a fresh starting fleet vs the col-3 elite is a real risk, not a wall: 5-25%',
    pass: rates[SNIPER_ELITE.id]['starting fleet'] >= 5 && rates[SNIPER_ELITE.id]['starting fleet'] <= 25,
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
    pass: strikeWinRate[GAUNTLET[4].id] >= 65 && strikeWinRate[GAUNTLET[4].id] <= 90,
  },
  {
    label: 'strike fleet vs plasma tank beats the no-speed control (speed is worth buying)',
    pass: strikeWinRate[GAUNTLET[4].id] > controlWinRate[GAUNTLET[4].id],
  },
  {
    // Target 17.4 #2: vs an init >= 3 enemy (interceptor swarm), speed the
    // fleet can't leverage shouldn't cost it more than 5pp against the
    // control fleet built the same way minus the drive.
    label: 'strike fleet vs interceptor swarm (init 3, can\'t leverage speed) within 5pp of control',
    pass: Math.abs(strikeWinRate[GAUNTLET[3].id] - controlWinRate[GAUNTLET[3].id]) <= 5,
  },
  {
    // Target 17.4 #3: the gap between these two IS the Hive Empress's
    // signature mechanic working as designed.
    label: 'Hive Empress: one Interceptor (tempo cover) measurably improves the win rate',
    pass: empressPlusInterceptor.winRate > empressAllSlow.winRate,
  },
];

for (const check of checks) {
  console.log(`  [${check.pass ? 'PASS' : 'FAIL'}] ${check.label}`);
}

const anyFailed = checks.some((c) => !c.pass);
if (anyFailed) {
  process.exitCode = 1;
}
