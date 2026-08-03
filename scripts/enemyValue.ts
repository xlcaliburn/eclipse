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
import { PARTS, STARTING_LOADOUT } from '../src/game/parts';
import { ESCALATIONS } from '../src/game/escalations';
import { initCombat, runToEnd } from '../src/game/combatEngine';
import { deriveFleetForCombat } from '../src/game/ship';
import type { EnemyDef, PlayerShipState, ShipStats } from '../src/game/types';
import type { ScheduledEscalation } from '../src/game/escalations';

// Prices an enemy composition in credits, using the player's own shop as the
// yardstick — "what would it cost to buy this ship's capability out of the
// parts list". This is a *lens*, not ground truth: the simulator
// (scripts/balance.ts) decides whether a fight is winnable. What this adds is
// an economic read — whether a fight's price tag has drifted away from what
// the player can actually have afforded by that column.
//
// Run: npx tsx scripts/enemyValue.ts

// --- Unit prices, derived from the real parts list -------------------------
// Taken from the cheapest per-point option the player can actually buy, so
// these aren't invented numbers. Tier-2 parts are the efficient buy, which is
// why most of these land at 2.5 rather than the tier-1 price of 3.
//   hull2   5cr / +2 HP   -> 2.5   comp3   7cr / +3   -> 2.33
//   shield2 5cr / +2      -> 2.5   init3   7cr / +3   -> 2.33
const PRICE = {
  hp: 2.5,
  computer: 2.33,
  shield: 2.5,
  initiative: 2.33,
};

// Cannon dice are priced off the real weapon ladder rather than a formula,
// because the ladder isn't linear: ion 3cr@1dmg, plasma 5cr@2, antimatter
// 7cr@4. Damage 3 is interpolated (rift is 5cr but carries a backfire
// drawback, siege is 7cr but can't choose its target).
const CANNON_DIE: Record<number, number> = { 0: 1, 1: 3, 2: 5, 3: 6, 4: 7 };
// Missile rack: 5cr for 2 dice at 1 damage -> 2.5 per die. Missiles fire once
// per combat, so a missile die is worth materially less than a cannon die of
// the same damage; the ladder reflects that.
const MISSILE_DIE: Record<number, number> = { 1: 2.5, 2: 4, 3: 5 };

function ladder(table: Record<number, number>, damage: number, fallbackPerDamage: number): number {
  if (table[damage] !== undefined) return table[damage];
  // Past the table, extrapolate from its top entry.
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  const top = keys[keys.length - 1];
  return table[top] + (damage - top) * fallbackPerDamage;
}

// Shield pierce is priced against the Gauss lance: 6cr for 1 die @2dmg with
// pierce 2, versus plasma's 5cr for 1 die @2dmg. So pierce 2 costs ~1cr.
const PIERCE_PER_POINT = 0.5;
// Arc projector: 6cr for a die that deals 0 direct damage but 1 to every
// enemy. Against the 1cr price of a bare die, the aoe rider is worth ~5.
const AOE_PER_POINT = 5;

export function statsValue(stats: ShipStats): number {
  let value = 0;
  value += stats.hp * PRICE.hp;
  value += stats.computer * PRICE.computer;
  value += stats.shield * PRICE.shield;
  value += Math.max(0, stats.initiative) * PRICE.initiative;

  for (const w of stats.cannons ?? []) {
    let per = ladder(CANNON_DIE, w.damage, 1);
    per += (w.shieldPierce ?? 0) * PIERCE_PER_POINT;
    per += (w.aoeDamage ?? 0) * AOE_PER_POINT;
    value += per * w.diceCount;
  }
  for (const w of stats.missiles ?? []) {
    value += ladder(MISSILE_DIE, w.damage, 1.5) * w.diceCount;
  }
  return value;
}

export function enemyValue(enemy: EnemyDef): number {
  return enemy.groups.reduce((sum, g) => sum + statsValue(g.stats) * g.count, 0);
}

function shipCount(enemy: EnemyDef): number {
  return enemy.groups.reduce((n, g) => n + g.count, 0);
}

function composition(enemy: EnemyDef): string {
  return enemy.groups.map((g) => `${g.count}x ${g.label}`).join(' + ');
}

// --- The player's side -----------------------------------------------------
const PART_COST = new Map(PARTS.map((p) => [p.id, p.cost]));
const STARTING_FIT_VALUE = STARTING_LOADOUT.reduce((sum, id) => sum + (PART_COST.get(id) ?? 0), 0);

// Credits banked by the time the player *arrives* at `col`, assuming they win
// every combat node on the way in (one node per column) and bank all of it.
// This is the optimistic ceiling: real routes take shops, repairs, and events
// that spend it. winReward(col) = 4 + col.
function bankedByColumn(col: number): number {
  let total = 0;
  for (let c = 0; c < col; c++) total += 4 + c;
  return total;
}

// Total fleet value the player could theoretically be fielding at `col`.
function playerBudget(act: 1 | 2, col: number): number {
  // Act 2 arrives carrying act 1's whole banked total on top.
  const priorAct = act === 2 ? bankedByColumn(10) : 0;
  return STARTING_FIT_VALUE + priorAct + bankedByColumn(col);
}

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

// Every escalation live at once — the worst case a late column can present.
function allEscalations(act: 1 | 2): ScheduledEscalation[] {
  return ESCALATIONS.map((e) => ({ id: e.id, act, landsAfterColumn: -1 }) as ScheduledEscalation);
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
    for (let col = act === 1 ? 1 : 0; col <= 9; col++) {
      const budget = playerBudget(act, col);
      const pool = combatEnemyPool(act, col);
      const hardest = pool.reduce((best, e) => (enemyValue(e) > enemyValue(best) ? e : best), pool[0]);
      const withVet = applyVeterancy(hardest, col);
      console.log(row(`c${col} combat (worst): ${withVet.name}`, withVet, budget));

      const elite = applyVeterancy(eliteEnemyForColumn(act, col, () => 0.99), col);
      console.log(row(`c${col} ELITE: ${elite.name}`, elite, budget));
    }

    // The specific late-game case: the last elite with every escalation live.
    const lastCol = 9;
    const budget = playerBudget(act, lastCol);
    const worst = applyEscalations(
      applyVeterancy(eliteEnemyForColumn(act, lastCol, () => 0.99), lastCol),
      lastCol,
      allEscalations(act),
    );
    console.log('');
    console.log(row(`c${lastCol} ELITE + all escalations`, worst, budget));
    console.log(`      composition: ${composition(worst)}`);
  }

  console.log('\n\n=== BOSSES ===');
  const act1Budget = playerBudget(1, 10);
  for (const id of BOSS_IDS) {
    console.log(row(`act1 boss: ${getBoss(id).name}`, getBoss(id), act1Budget));
  }
  const act2Budget = playerBudget(2, 10);
  for (const id of FINAL_BOSS_IDS) {
    console.log(row(`act2 boss: ${getFinalBoss(id).name}`, getFinalBoss(id), act2Budget));
  }

  console.log(`\nStarting fit: ${STARTING_FIT_VALUE}cr. Act-1 full clear banks ${bankedByColumn(10)}cr.`);
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

function simulate(fleet: PlayerShipState[], enemy: EnemyDef, sims = 2000): number {
  const input = deriveFleetForCombat(fleet);
  let wins = 0;
  for (let seed = 1; seed <= sims; seed++) {
    if (runToEnd(initCombat(input, enemy, seed)).winner === 'player') wins++;
  }
  return Math.round((wins / sims) * 100);
}

function simulationCheck() {
  console.log('\n\n=== SIMULATED WIN RATE (late act-1 reference fleet) ===');
  const col = 9;
  const base = applyVeterancy(eliteEnemyForColumn(1, col, () => 0.99), col);
  const squadronsOnly = applyEscalations(base, col, [
    { id: 'squadrons', act: 1, landsAfterColumn: -1 } as ScheduledEscalation,
  ]);
  const everything = applyEscalations(base, col, allEscalations(1));

  // A deliberately over-budget fleet too: if even this can't win, the fight
  // isn't "hard", it's arithmetically closed.
  const OVERBUILT: PlayerShipState[] = [
    { frameId: 'cruiser', equipped: ['antimatter', 'plasma', 'comp3', 'hull2', 'shield2', 'init3'], upgrades: [], damage: 0 },
    { frameId: 'interceptor', equipped: ['plasma', 'comp2', 'hull1'], upgrades: [], damage: 0 },
    { frameId: 'interceptor', equipped: ['plasma', 'comp2', 'hull1'], upgrades: [], damage: 0 },
  ];

  console.log(`${''.padEnd(26)} ${'value'.padStart(7)}  ${'composition'.padEnd(28)} ${'ref'.padStart(5)} ${'overbuilt'.padStart(10)}`);
  for (const [label, enemy] of [
    ['elite, no escalations', base],
    ['elite + squadrons only', squadronsOnly],
    ['elite + all escalations', everything],
  ] as const) {
    console.log(
      `${label.padEnd(26)} ${`${enemyValue(enemy).toFixed(0)}cr`.padStart(7)}  ${composition(enemy).padEnd(28)} ${`${simulate(LATE_ACT1_FLEET, enemy)}%`.padStart(5)} ${`${simulate(OVERBUILT, enemy)}%`.padStart(10)}`,
    );
  }
}

report();
simulationCheck();
