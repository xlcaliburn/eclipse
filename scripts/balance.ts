import { eliteEnemyForColumn, eliteVariant, GAUNTLET } from '../src/game/enemies';
import { forecastWinRate } from '../src/game/forecast';
import { STARTING_LOADOUT } from '../src/game/parts';
import type { EnemyDef, PlayerShipState } from '../src/game/types';

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
    // Realistic end-of-run fleet: ~66 of the ~68 credits a full winning run
    // earns (parts 32 + interceptor 8 + parts 13 + interceptor 8 + ion 3 + hull 3).
    name: 'strong fleet',
    fleet: [
      { frameId: 'cruiser', equipped: ['plasma', 'plasma', 'comp3', 'hull2', 'init3', 'shield1'], damage: 0 },
      { frameId: 'interceptor', equipped: ['plasma', 'comp2', 'hull1'], damage: 0 },
      { frameId: 'interceptor', equipped: ['ion', 'hull1'], damage: 0 },
    ],
  },
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
const SNIPER_ELITE = eliteEnemyForColumn(3, Math.random); // the col-3 elite, softened to +1 HP

const MATCHUPS: EnemyDef[] = [...GAUNTLET, SNIPER_ELITE, ANCIENT_GUARDIAN_ELITE];

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
    label: 'strong fleet vs GCDS in 20-60%',
    pass: rates[GAUNTLET[8].id]['strong fleet'] >= 20 && rates[GAUNTLET[8].id]['strong fleet'] <= 60,
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
];

for (const check of checks) {
  console.log(`  [${check.pass ? 'PASS' : 'FAIL'}] ${check.label}`);
}

const anyFailed = checks.some((c) => !c.pass);
if (anyFailed) {
  process.exitCode = 1;
}
