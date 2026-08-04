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
import { addHeat, MAX_HEAT } from '../src/game/heat';
import { actColumns, generateMap, globalColumn, reachableNodes } from '../src/game/map';
import type { MapNode } from '../src/game/map';
import { COMMODITY_LOT_BUY_COST, COMMODITY_LOT_SELL_PRICE, MERCENARY_COST } from '../src/game/reducer';
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
// Iteration 20 (the economy floor): this policy now also engages the new
// non-combat economy — salvage claims, fleet triage, commodity-lot
// flipping, and a mercenary before the boss. Everything else (parts
// wishlist, routing preference) is unchanged from the pre-20 draft that
// first found the ~0% baseline, so the delta this reports is attributable
// to the new mechanics, not a rewritten policy.
//
// Run: npx tsx scripts/actRun.ts

const RUNS = 500;
const POST_WIN_REPAIR = Number(process.env.POST_WIN_REPAIR ?? 0);

// --- The purchasing policy -------------------------------------------------
// Deliberately NOT optimal play: buys sensible things when it can afford
// them, never sells, never re-optimises, never plays a reaction card. That's
// the floor for "actually engages with the shop", which is the bar in
// question.
//
// Re-ordered 2026-08-04: the original order front-loaded pure offense
// (plasma, comp2, another plasma, comp3, antimatter — 4 damage/accuracy
// buys before a single point of survivability) on the theory that damage
// output is what a reasonable player reaches for first. It measured worse
// than doing nothing differently: damage carryover is the run's dominant
// killer (see the module comment), and stacking every early credit into
// offense left the fleet exactly as fragile as the stock loadout through
// the columns where that fragility compounds fastest. Two cheap tier-1
// defensive buys now come first — still "a reasonable player," just one
// who's noticed they keep dying to a second hit, not a first one.
const WISHLIST: PartId[] = [
  'hull1',
  'shield1',
  'plasma',
  'comp2',
  'hull2',
  'shield2',
  'plasma',
  'comp3',
  'antimatter',
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
// repair when one is on offer and they need it.
//
// Elites used to outscore plain combat whenever healthy (60 vs 50) — a
// deliberate "seek the bigger payout" bias carried over from the pre-20
// draft. Diagnostic breakdown (see `deaths by col+type` below) showed that
// was the single largest killer in the whole simulation: c4:elite alone
// caused 30% of every run's deaths, MORE than c4:combat, at exactly the
// column where the mid-tier pool starts and a fleet has had at most one
// shop visit. A policy that deliberately walks into the harder of two
// available fights, just because an elite that early has had barely more
// than the stock loadout, isn't "not optimal" the way the wishlist/no-cards
// restrictions are — it's actively self-destructive, which is a policy bug,
// not a signal about the game. Elites now always score below combat; the
// existing 15% routing noise still occasionally takes one anyway, same as
// a real player size-of-mistake.
function chooseNode(options: MapNode[], damageRatio: number, rng: () => number): MapNode {
  const score = (n: MapNode): number => {
    switch (n.type) {
      case 'repair':
        return damageRatio > 0.4 ? 100 : 20;
      case 'shop':
        return 80;
      case 'combat':
        return 50;
      case 'elite':
        return damageRatio < 0.3 ? 35 : 5;
      // Column 1-2 has no shop or repair node at all (see ACT1_QUOTAS), so
      // an event is the only chance to avoid stacking a second fight's
      // damage onto the first before column 3's shop — not a guaranteed
      // heal (13 events, most aren't repair-tender), but a hurt player
      // gambling on one over a certain second fight is realistic, not
      // optimal-play cheating.
      case 'event':
        return damageRatio > 0.15 ? 55 : 40;
      default:
        return 30;
    }
  };
  const best = options.reduce((a, b) => (score(b) > score(a) ? b : a), options[0]);
  // A little noise so runs aren't all identical routes.
  return rng() < 0.15 ? options[Math.floor(rng() * options.length)] : best;
}

// Fraction of RANDOM_EVENTS (events.ts) that is now salvage-claim vs.
// repair-tender vs. everything else — kept in sync by hand rather than
// imported, since importing events.ts here would need a full RunState to
// drive resolveEventChoice, which this lightweight sim doesn't build. 13
// random events total as of iteration 20 (12 pre-20 + salvage-claim);
// repair-tender and salvage-claim are each 1 of those 13.
const RANDOM_EVENT_COUNT = 13;

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
  let heat = 0;
  // Iteration 20: mirrors RunState.commodityLotBoughtAtGlobalColumn — undef
  // means the fleet carries no lot. Heat here tracks ONLY salvage-claim
  // gains, not the real game's per-dock-node cost or combat-win decay (that
  // full loop, including Hunted interception, isn't modeled) — a real
  // player's heat runs higher than this sim's, so the salvage policy below
  // is slightly more permissive than perfectly safe play. Documented, not
  // hidden, since it would otherwise read as more validated than it is.
  let lotBoughtAtGlobalColumn: number | undefined;

  const totalHp = () => fleet.reduce((n, s) => n + 4 + s.equipped.filter((p) => getPart(p).hull).length, 0);
  const damageRatio = () => fleet.reduce((n, s) => n + s.damage, 0) / Math.max(1, totalHp());
  const carriesLot = () => fleet.some((s) => s.equipped.includes('commodity-lot'));

  function shopWishlist() {
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

  // Iteration 20 (commodity runs): sell first (frees the slot and the
  // credits for the wishlist pass right after), then — once nothing on the
  // wishlist is affordable — put any spare change into a fresh lot instead
  // of letting it sit idle. A rational player sells the moment they can:
  // holding longer adds risk (the carrying ship might die) for no extra
  // reward (the price doesn't appreciate).
  function shopCommodityLot(here: number) {
    if (carriesLot() && lotBoughtAtGlobalColumn !== undefined && here > lotBoughtAtGlobalColumn) {
      const carrierIndex = fleet.findIndex((s) => s.equipped.includes('commodity-lot'));
      fleet[carrierIndex].equipped = fleet[carrierIndex].equipped.filter((p) => p !== 'commodity-lot');
      credits += COMMODITY_LOT_SELL_PRICE;
      lotBoughtAtGlobalColumn = undefined;
    }
    if (!carriesLot() && credits >= COMMODITY_LOT_BUY_COST) {
      const carrier = fleet.find((s) => s.equipped.length < effectiveSlots(s.frameId, s.upgrades));
      if (carrier) {
        carrier.equipped.push('commodity-lot');
        credits -= COMMODITY_LOT_BUY_COST;
        spent += COMMODITY_LOT_BUY_COST;
        lotBoughtAtGlobalColumn = here;
      }
    }
  }

  function shop(here: number) {
    shopCommodityLot(here);
    shopWishlist();
  }

  // Iteration 20 (salvage claims + fleet triage): the two new event options,
  // folded into the flat "+2cr average" the other 11 events still use (see
  // RANDOM_EVENT_COUNT above). Weighted by draw probability so the run's
  // total event income reflects the real pool, not just "assume the best
  // event every time."
  function event() {
    const roll = rng();
    if (roll < 1 / RANDOM_EVENT_COUNT) {
      // Salvage claim: strip the field if heat is low enough not to risk
      // Hunted soon; otherwise leave it.
      if (heat <= 2) {
        credits += 8;
        heat = addHeat(heat, 1);
      }
      return;
    }
    if (roll < 2 / RANDOM_EVENT_COUNT) {
      // Repair tender: the fleet-wide overhaul if it's affordable and
      // there's real damage to undo; otherwise move on. (The old
      // single-ship option is dominated by the wishlist's own spending
      // priorities for this policy, so it isn't modeled separately.)
      if (damageRatio() > 0 && credits >= 8) {
        credits -= 8;
        for (const s of fleet) s.damage = Math.max(0, s.damage - 2);
      }
      return;
    }
    // The other 11 events, unmodeled individually — same flat approximation
    // the pre-20 draft used.
    credits += 2;
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
    const here = globalColumn(1, node.col);

    switch (node.type) {
      case 'shop':
        shop(here);
        break;
      case 'repair':
        for (const s of fleet) s.damage = 0;
        break;
      case 'event':
        event();
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
        shop(here); // spend whatever is left before the boss — any real player does
        // Iteration 20 (war assets): a rich run spends its last leftover
        // credits on one-fight firepower rather than banking money the run
        // is about to end either way.
        if (fleet.length < 4 && credits >= MERCENARY_COST) {
          fleet.push({ frameId: 'interceptor', equipped: ['ion'], upgrades: [], damage: 0, mercenary: true });
          credits -= MERCENARY_COST;
          spent += MERCENARY_COST;
        }
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
  const byColType = new Map<string, number>();
  for (const o of outcomes) {
    if (!o.diedAt) continue;
    byType.set(o.diedAt.type, (byType.get(o.diedAt.type) ?? 0) + 1);
    byCol.set(o.diedAt.col, (byCol.get(o.diedAt.col) ?? 0) + 1);
    const key = `c${o.diedAt.col}:${o.diedAt.type}`;
    byColType.set(key, (byColType.get(key) ?? 0) + 1);
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
  console.log(
    `  deaths by col+type:  ${[...byColType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => `${k}=${n}`).join('  ')}`,
  );
}

report();
