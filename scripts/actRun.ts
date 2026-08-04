import { initCombat, runToEnd } from '../src/game/combatEngine';
import {
  applyEscalations,
  applyVeterancy,
  combatEnemyPool,
  eliteEnemyForColumn,
  getBoss,
  OPENER,
} from '../src/game/enemies';
import { getFrame } from '../src/game/frames';
import { ESCALATIONS } from '../src/game/escalations';
import type { EscalationId, ScheduledEscalation } from '../src/game/escalations';
import { actColumns, generateMap, reachableNodes } from '../src/game/map';
import type { MapNode } from '../src/game/map';
import { getPart, STARTING_LOADOUT } from '../src/game/parts';
import { deriveFleetForCombat, effectiveSlots } from '../src/game/ship';
import type { PartId, PlayerShipState } from '../src/game/types';

// Simulates a WHOLE act-1 run: "can a player who actually spends their
// credits expect to clear act 1?"
//
// scripts/balance.ts answers "is this fight winnable by this exact fleet".
// This answers the question a player actually has — you start with the stock
// Flagship, you pick a lane, you buy things on the way, damage carries, and
// you finish at the boss. What fraction of those runs end in a win?
//
// The route comes from the REAL map generator, so the mix of combat / elite /
// shop / repair / event nodes is whatever the game actually deals. An earlier
// draft invented a lane that fought at every column with two repairs, which
// reported 0% and was measuring its own bad assumptions.
//
// Run: npx tsx scripts/actRun.ts

const RUNS = 500;
const POST_WIN_REPAIR = Number(process.env.POST_WIN_REPAIR ?? 0);

// --- The purchasing policy -------------------------------------------------
// Deliberately NOT optimal play: buys sensible things when it can afford
// them, never sells, never re-optimises, never plays a reaction card. That's
// the floor for "actually engages with the shop", which is the bar in
// question. Ordered the way a reasonable player reaches: damage, then the
// accuracy to land it, then survivability.
const WISHLIST: PartId[] = [
  'plasma',
  'comp2',
  'plasma',
  'hull2',
  'comp3',
  'antimatter',
  'shield2',
  'hull2',
  'init3',
];

function winReward(col: number): number {
  return 4 + col;
}
function eliteReward(col: number): number {
  return 8 + col;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawAct1Escalations(rng: () => number): ScheduledEscalation[] {
  const pool = ESCALATIONS.map((e) => e.id);
  const pick = (): EscalationId => pool.splice(Math.floor(rng() * pool.length), 1)[0];
  return [
    { id: pick(), act: 1, landsAfterColumn: 3, revealed: false },
    { id: pick(), act: 1, landsAfterColumn: 6, revealed: false },
  ];
}

export interface RunOutcome {
  won: boolean;
  diedAt: { col: number; type: string } | null;
  spent: number;
  leftOver: number;
  fights: number;
}

// Route choice: a player who prefers to fight what pays, but takes a shop or
// repair when one is on offer and they need it. Slight preference for elites
// only when reasonably healthy, which is what a real player does.
function chooseNode(options: MapNode[], damageRatio: number, rng: () => number): MapNode {
  const score = (n: MapNode): number => {
    switch (n.type) {
      case 'repair':
        return damageRatio > 0.4 ? 100 : 20;
      case 'shop':
        return 80;
      case 'elite':
        return damageRatio < 0.3 ? 60 : 5;
      case 'combat':
        return 50;
      case 'event':
        return 40;
      default:
        return 30;
    }
  };
  const best = options.reduce((a, b) => (score(b) > score(a) ? b : a), options[0]);
  // A little noise so runs aren't all identical routes.
  return rng() < 0.15 ? options[Math.floor(rng() * options.length)] : best;
}

export function simulateRun(seed: number): RunOutcome {
  const rng = mulberry32(seed);
  const map = generateMap(seed, rng);
  const columns = actColumns(map, 1);
  const escalations = drawAct1Escalations(rng);

  const fleet: PlayerShipState[] = [
    { frameId: 'cruiser', equipped: [...STARTING_LOADOUT], upgrades: [], damage: 0 },
  ];
  let credits = 0;
  let spent = 0;
  let wishIndex = 0;
  let fights = 0;

  const totalHp = () => fleet.reduce((n, s) => n + 4 + s.equipped.filter((p) => getPart(p).hull).length, 0);
  const damageRatio = () => fleet.reduce((n, s) => n + s.damage, 0) / Math.max(1, totalHp());

  function shop() {
    for (;;) {
      // Flagship full? Buy an escort and keep fitting it. The realistic
      // end-of-run fleet has two, so a policy that can't buy ships would
      // understate what "actually buying things" reaches.
      const openShip = fleet.find((s) => s.equipped.length < effectiveSlots(s.frameId, s.upgrades));
      if (!openShip) {
        const interceptor = getFrame('interceptor');
        if (fleet.length >= 4 || interceptor.cost > credits) return;
        fleet.push({ frameId: 'interceptor', equipped: [], upgrades: [], damage: 0 });
        credits -= interceptor.cost;
        spent += interceptor.cost;
        continue;
      }
      const want = WISHLIST[wishIndex];
      if (!want) return;
      const cost = getPart(want).cost;
      if (cost > credits) return;
      openShip.equipped.push(want);
      credits -= cost;
      spent += cost;
      wishIndex++;
    }
  }

  function fight(enemyRaw: ReturnType<typeof getBoss>, col: number, tag: string): RunOutcome | null {
    fights++;
    const enemy = applyEscalations(applyVeterancy(enemyRaw, col), col, escalations);
    const result = runToEnd(initCombat(deriveFleetForCombat(fleet), enemy, seed * 1000 + col * 13 + fights));
    if (result.winner !== 'player') {
      return { won: false, diedAt: { col, type: tag }, spent, leftOver: credits, fights };
    }
    result.playerShips.forEach((s, i) => {
      if (fleet[i]) fleet[i].damage = s.damage;
    });
    // Experiment knob: patch-up after a win. Damage carryover is the run's
    // dominant killer (a stock fleet drops 90% -> 48% against a missile
    // frigate with just 2 damage), so this measures how much of act 1's
    // difficulty is the death spiral rather than any single fight.
    if (POST_WIN_REPAIR > 0) {
      for (const s of fleet) s.damage = Math.max(0, s.damage - POST_WIN_REPAIR);
    }
    return null;
  }

  let position: { col: number; row: number } | null = null;
  for (;;) {
    const options = reachableNodes(columns, position);
    if (options.length === 0) break;
    const node = chooseNode(options, damageRatio(), rng);
    position = { col: node.col, row: node.row };

    switch (node.type) {
      case 'shop':
        shop();
        break;
      case 'repair':
        for (const s of fleet) s.damage = 0;
        break;
      case 'event':
        // Events are a wash on average for this purpose; a small credit
        // trickle stands in for the ones that pay.
        credits += 2;
        break;
      case 'opener': {
        // The opener is its own hand-tuned warm-up enemy, NOT a draw from the
        // act-1 easy pool. An earlier version of this script used the pool
        // here and reported spurious deaths at column 0.
        const dead = fight(OPENER, node.col, 'opener');
        if (dead) return dead;
        credits += winReward(node.col);
        break;
      }
      case 'combat': {
        const pool = combatEnemyPool(1, node.col);
        const raw = pool[Math.floor(rng() * pool.length)];
        const dead = fight(raw, node.col, node.type);
        if (dead) return dead;
        credits += winReward(node.col);
        break;
      }
      case 'elite': {
        const dead = fight(eliteEnemyForColumn(1, node.col, rng), node.col, 'elite');
        if (dead) return dead;
        credits += eliteReward(node.col);
        break;
      }
      case 'boss': {
        shop(); // spend whatever is left before the boss — any real player does
        const dead = fight(getBoss(map.act1BossId), node.col, 'boss');
        if (dead) return dead;
        return { won: true, diedAt: null, spent, leftOver: credits, fights };
      }
    }
  }
  return { won: false, diedAt: null, spent, leftOver: credits, fights };
}

function report() {
  const outcomes = Array.from({ length: RUNS }, (_, i) => simulateRun(i + 1));
  const wins = outcomes.filter((o) => o.won).length;
  const byType = new Map<string, number>();
  const byCol = new Map<number, number>();
  for (const o of outcomes) {
    if (!o.diedAt) continue;
    byType.set(o.diedAt.type, (byType.get(o.diedAt.type) ?? 0) + 1);
    byCol.set(o.diedAt.col, (byCol.get(o.diedAt.col) ?? 0) + 1);
  }
  const avg = (f: (o: RunOutcome) => number) => outcomes.reduce((n, o) => n + f(o), 0) / outcomes.length;

  console.log(`Act-1 run simulation — ${RUNS} runs on real generated maps.`);
  console.log('Player buys down a fixed wishlist at shops, repairs when hurt, plays no cards.\n');
  console.log(`  ACT-1 CLEAR RATE: ${((wins / RUNS) * 100).toFixed(0)}%   (${wins}/${RUNS})`);
  console.log(`  avg fights: ${avg((o) => o.fights).toFixed(1)}`);
  console.log(`  avg spent: ${avg((o) => o.spent).toFixed(0)}cr, avg unspent: ${avg((o) => o.leftOver).toFixed(0)}cr`);
  console.log(
    `\n  deaths by node type: ${[...byType.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}=${n}`).join('  ')}`,
  );
  console.log(
    `  deaths by column:    ${[...byCol.entries()].sort((a, b) => a[0] - b[0]).map(([c, n]) => `c${c}=${n}`).join('  ')}`,
  );
}

report();
