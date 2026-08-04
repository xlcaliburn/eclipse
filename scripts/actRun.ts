import { initCombat, runToEnd } from '../src/game/combatEngine';
import type { CommanderId } from '../src/game/commanders';
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
import { addHeat } from '../src/game/heat';
import { actColumns, generateMap, globalColumn, reachableNodes } from '../src/game/map';
import type { MapNode } from '../src/game/map';
import {
  commodityLotBuyCost,
  commodityLotCap,
  COMMODITY_LOT_SELL_PRICE,
  eliteReward,
  fleetCap,
  frameCost,
  mercenaryCost,
  partCost,
  winReward,
} from '../src/game/reducer';
import { getPart, STARTING_LOADOUT } from '../src/game/parts';
import { applyRepairBanking, deriveFleetForCombat, effectiveSlots } from '../src/game/ship';
import type { CombatEvent, PartId, PlayerShipState } from '../src/game/types';
import { randomUpgradeIds } from '../src/game/upgrades';

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
// Iteration 20 (the economy floor): this policy also engages the new
// non-combat economy — salvage claims, fleet triage, commodity-lot
// flipping, and a mercenary before the boss.
//
// Iteration 21 (commander doctrines, 21.6): the policy is now parameterized
// by commanderId — each of the 5 commanders gets a route bias and a shopping
// bias that leans into their doctrine (per the table in the module's
// COMMANDER_POLICY comment below), on top of the shared "reasonable but not
// optimal" wishlist/routing floor. `undefined` still runs the doctrine-free
// baseline from iteration 20, reported alongside the five for comparison.
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

// Mirrors escalations.ts's drawEscalationSchedule act-1 half by hand (this
// sim doesn't build a full RunState to drive the real one) — landing
// columns must stay in sync with that file's 4/7 (iteration 22).
function drawAct1Escalations(rng: () => number): ScheduledEscalation[] {
  const pool = ESCALATIONS.map((e) => e.id);
  const pick = (): EscalationId => pool.splice(Math.floor(rng() * pool.length), 1)[0];
  return [
    { id: pick(), act: 1, landsAfterColumn: 4, revealed: false },
    { id: pick(), act: 1, landsAfterColumn: 7, revealed: false },
  ];
}

// Iteration 18-style kill attribution, trimmed to just the part this sim
// needs (ace-pilot tracking) from the combat log runToEnd already returns —
// mirrors reducer.ts's attributeFightStats without needing a full RunState.
function attributeKills(log: CombatEvent[], fleetSize: number): number[] {
  const kills = Array.from({ length: fleetSize }, () => 0);
  let lastPlayerHit: { shooterIndex: number; targetIndex: number } | null = null;
  for (const event of log) {
    if (event.kind === 'roll') {
      if (event.side === 'player' && event.hit) {
        lastPlayerHit = { shooterIndex: event.shooterIndex, targetIndex: event.targetIndex };
      }
    } else if (event.kind === 'destroyed' && event.side === 'enemy') {
      if (lastPlayerHit && lastPlayerHit.targetIndex === event.shipIndex && lastPlayerHit.shooterIndex < fleetSize) {
        kills[lastPlayerHit.shooterIndex]++;
      }
    }
  }
  return kills;
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
//
// Iteration 21 (21.6): commanderId nudges the base score toward each
// doctrine's "route read" from plans/iteration-21.md — the Merchant chases
// shops, the Engineer and Admiral lean into fights their doctrine is built
// to absorb, the Spymaster avoids them in favor of events (where salvage
// claims live). The Warlord has no routing doctrine (its whole identity is
// shop-side, not route-side), so it uses the shared baseline unmodified.
function chooseNode(options: MapNode[], damageRatio: number, rng: () => number, commanderId?: CommanderId): MapNode {
  const score = (n: MapNode): number => {
    let base: number;
    switch (n.type) {
      case 'repair':
        base = damageRatio > 0.4 ? 100 : 20;
        break;
      case 'shop':
        base = 80;
        break;
      case 'combat':
        base = 50;
        break;
      case 'elite':
        base = damageRatio < 0.3 ? 35 : 5;
        break;
      // Column 1-2 has no shop or repair node at all (see ACT1_QUOTAS), so
      // an event is the only chance to avoid stacking a second fight's
      // damage onto the first before column 3's shop — not a guaranteed
      // heal (13 events, most aren't repair-tender), but a hurt player
      // gambling on one over a certain second fight is realistic, not
      // optimal-play cheating.
      case 'event':
        base = damageRatio > 0.15 ? 55 : 40;
        break;
      default:
        base = 30;
    }
    switch (commanderId) {
      case 'merchant':
        // "shop-to-shop, skip marginal fights, buy the boss fight."
        if (n.type === 'shop') base += 30;
        if (n.type === 'combat') base -= 15;
        break;
      case 'engineer':
        // "takes the fights everyone else routes around."
        if (n.type === 'combat') base += 20;
        if (n.type === 'elite') base += 10;
        break;
      case 'spymaster':
        // "farm every wreck risk-free." Iteration 22.6: cut the event bonus
        // from +25 to +5 (and dropped the combat/elite downweight this had
        // at launch entirely). At +25, an event (base score 40-55) always
        // outscored combat (flat 50) regardless of the downweight — so
        // removing the downweight alone changed nothing (confirmed by
        // measurement: identical clear rate before and after). With
        // winReward raised to 7+col (was 4+col), a won fight is worth
        // several times an average event's ~2.3cr expected value (mostly
        // the flat +2cr draw, occasionally the Spymaster's own heat-free
        // +8cr salvage claim) — a doctrine whose only real mechanical edge
        // is "no heat cost on salvage" doesn't need to out-and-out avoid
        // fights to realize that edge, just take the free-money event when
        // it's actually competitive.
        if (n.type === 'event') base += 5;
        break;
      case 'admiral':
        // "elite nodes are food" — a wide fleet can afford the premium fight.
        if (n.type === 'elite') base += 15;
        break;
      default:
        break;
    }
    return base;
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

export function simulateRun(seed: number, commanderId?: CommanderId): RunOutcome {
  const rng = mulberry32(seed);
  const map = generateMap(seed, rng);
  const columns = actColumns(map, 1);
  const escalations = drawAct1Escalations(rng);

  const fleet: PlayerShipState[] = [
    { frameId: 'cruiser', equipped: [...STARTING_LOADOUT], upgrades: [], damage: 0, kills: 0 },
  ];
  // Iteration 21: the Admiral inherits the old Warlord's free starting
  // Interceptor; the Warlord instead gets one random upgrade auto-granted to
  // the Flagship (mirrors CHOOSE_COMMANDER in reducer.ts).
  if (commanderId === 'admiral') {
    fleet.push({ frameId: 'interceptor', equipped: ['ion'], upgrades: [], damage: 0, kills: 0 });
  }
  if (commanderId === 'warlord') {
    fleet[0].upgrades = [randomUpgradeIds(1, rng)[0]];
  }

  let credits = 0;
  let spent = 0;
  let wishIndex = 0;
  let fights = 0;
  let heat = 0;

  const totalHp = () => fleet.reduce((n, s) => n + 4 + s.equipped.filter((p) => getPart(p).hull).length, 0);
  const damageRatio = () => fleet.reduce((n, s) => n + s.damage, 0) / Math.max(1, totalHp());

  function shopWishlist() {
    for (;;) {
      // Iteration 21 (the Admiral, wide): "buys hulls" — a cheap escort,
      // discounted, is reached for before more gear whenever the fleet has
      // room to grow. Checked first every loop, not just when the Flagship
      // is full, so the wide doctrine actually outpaces the shared fallback
      // (which only expands the fleet once nothing else fits).
      if (commanderId === 'admiral' && fleet.length < fleetCap(commanderId)) {
        const cost = frameCost(getFrame('interceptor').cost, 'interceptor', commanderId);
        if (cost <= credits) {
          fleet.push({ frameId: 'interceptor', equipped: [], upgrades: [], damage: 0, kills: 0 });
          credits -= cost;
          spent += cost;
          continue;
        }
      }

      // Iteration 21 (the Warlord, tall): "buys flagship parts" — fits the
      // Flagship first, every time, ahead of any escort. Iteration 22.6:
      // this used to stop shopping entirely once the Flagship was full
      // ("every credit either fits the Flagship or is banked"), which
      // measurably hoarded credits no real player would leave idle (avg
      // 22cr unspent per run) instead of buying even one support hull —
      // "tall" means the Flagship carries the run, not that a spare 22cr
      // buys nothing. It now falls through to the same escort-buying floor
      // every other commander uses once the Flagship has no room left.
      const openShip =
        commanderId === 'warlord' && fleet[0].equipped.length < effectiveSlots(fleet[0].frameId, fleet[0].upgrades)
          ? fleet[0]
          : fleet.find((s) => s.equipped.length < effectiveSlots(s.frameId, s.upgrades));
      if (!openShip) {
        // Flagship (and every escort so far) full? Buy an escort and keep
        // fitting it. The realistic end-of-run fleet has two, so a policy
        // that can't buy ships would understate what "actually buying
        // things" reaches.
        const interceptor = getFrame('interceptor');
        const cost = frameCost(interceptor.cost, 'interceptor', commanderId);
        if (fleet.length >= fleetCap(commanderId) || cost > credits) return;
        fleet.push({ frameId: 'interceptor', equipped: [], upgrades: [], damage: 0, kills: 0 });
        credits -= cost;
        spent += cost;
        continue;
      }
      const want = WISHLIST[wishIndex];
      if (!want) return;
      const cost = partCost(want, commanderId);
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
  //
  // Iteration 21: lot tracking moved to a per-ship field (matching the real
  // reducer), so the Merchant's cap-2 can carry two lots on two different
  // ships at once instead of one scalar for the whole fleet.
  function shopCommodityLot(here: number) {
    for (const s of fleet) {
      if (
        s.equipped.includes('commodity-lot') &&
        s.commodityLotBoughtAtGlobalColumn !== undefined &&
        here > s.commodityLotBoughtAtGlobalColumn
      ) {
        s.equipped = s.equipped.filter((p) => p !== 'commodity-lot');
        s.commodityLotBoughtAtGlobalColumn = undefined;
        credits += COMMODITY_LOT_SELL_PRICE;
      }
    }
    const cap = commodityLotCap(commanderId);
    const buyCost = commodityLotBuyCost(commanderId);
    let carried = fleet.filter((s) => s.equipped.includes('commodity-lot')).length;
    while (carried < cap && credits >= buyCost) {
      const carrier = fleet.find(
        (s) => !s.equipped.includes('commodity-lot') && s.equipped.length < effectiveSlots(s.frameId, s.upgrades),
      );
      if (!carrier) break;
      carrier.equipped.push('commodity-lot');
      carrier.commodityLotBoughtAtGlobalColumn = here;
      credits -= buyCost;
      spent += buyCost;
      carried++;
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
  //
  // Iteration 21 (the Spymaster): salvage claims cost no heat for them, so
  // the heat-gate that makes everyone else sometimes skip the field never
  // applies — "farm every wreck risk-free."
  function event() {
    const roll = rng();
    if (roll < 1 / RANDOM_EVENT_COUNT) {
      if (commanderId === 'spymaster') {
        credits += 8;
      } else if (heat <= 2) {
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
        for (const s of fleet) {
          if (commanderId === 'engineer') {
            const banked = applyRepairBanking(s, 2);
            s.damage = banked.damage;
            s.overRepairBank = banked.overRepairBank;
          } else {
            s.damage = Math.max(0, s.damage - 2);
          }
        }
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
    const fleetInput = deriveFleetForCombat(fleet, commanderId);
    // Mirrors reducer.ts's ENGAGE case: the bank is folded into this fight's
    // ablative by deriveFleetForCombat above, then cleared so it can't also
    // apply to a second fight.
    for (const s of fleet) if (s.overRepairBank) s.overRepairBank = undefined;
    const result = runToEnd(initCombat(fleetInput, enemy, seed * 1000 + col * 13 + fights));
    if (result.winner !== 'player') {
      return { won: false, diedAt: { col, type: tag }, spent, leftOver: credits, fights };
    }
    const kills = attributeKills(result.log, fleet.length);
    result.playerShips.forEach((s, i) => {
      if (fleet[i]) {
        fleet[i].damage = s.damage;
        fleet[i].kills = (fleet[i].kills ?? 0) + kills[i];
      }
    });
    // Iteration 21 (the Engineer): +1 heal per win, banked like any other
    // over-repair (mirrors reducer.ts's engineerHeal, applied unconditionally
    // like every other repair source).
    if (commanderId === 'engineer') {
      for (const s of fleet) {
        const banked = applyRepairBanking(s, 1);
        s.damage = banked.damage;
        s.overRepairBank = banked.overRepairBank;
      }
    }
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
    const node = chooseNode(options, damageRatio(), rng, commanderId);
    position = { col: node.col, row: node.row };
    const here = globalColumn(1, node.col);

    switch (node.type) {
      case 'shop':
        shop(here);
        break;
      case 'repair':
        // Iteration 21 (the Engineer): a repair-yard full heal has no
        // "excess" by definition, so it grants a flat +1 bank instead
        // (mirrors reducer.ts's repairFleet(..., bankFlat)).
        for (const s of fleet) {
          if (commanderId === 'engineer') {
            const banked = applyRepairBanking(s, s.damage, true);
            s.damage = banked.damage;
            s.overRepairBank = banked.overRepairBank;
          } else {
            s.damage = 0;
          }
        }
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
        // is about to end either way. Iteration 21: cheaper and the fleet
        // cap is wider for the commanders whose doctrine says so.
        if (fleet.length < fleetCap(commanderId) && credits >= mercenaryCost(commanderId)) {
          const cost = mercenaryCost(commanderId);
          fleet.push({ frameId: 'interceptor', equipped: ['ion'], upgrades: [], damage: 0, mercenary: true, kills: 0 });
          credits -= cost;
          spent += cost;
        }
        const dead = fight(getBoss(map.act1BossId), node.col, 'boss');
        if (dead) return dead;
        return { won: true, diedAt: null, spent, leftOver: credits, fights };
      }
    }
  }
  return { won: false, diedAt: null, spent, leftOver: credits, fights };
}

interface CommanderReport {
  label: string;
  commanderId: CommanderId | undefined;
  clearRate: number;
  wins: number;
}

function runFor(commanderId: CommanderId | undefined): RunOutcome[] {
  return Array.from({ length: RUNS }, (_, i) => simulateRun(i + 1, commanderId));
}

function printOutcomes(label: string, outcomes: RunOutcome[]): number {
  const wins = outcomes.filter((o) => o.won).length;
  const byType = new Map<string, number>();
  const byCol = new Map<number, number>();
  for (const o of outcomes) {
    if (!o.diedAt) continue;
    byType.set(o.diedAt.type, (byType.get(o.diedAt.type) ?? 0) + 1);
    byCol.set(o.diedAt.col, (byCol.get(o.diedAt.col) ?? 0) + 1);
  }
  const avg = (f: (o: RunOutcome) => number) => outcomes.reduce((n, o) => n + f(o), 0) / outcomes.length;
  const clearRate = (wins / RUNS) * 100;

  console.log(`\n=== ${label} ===`);
  console.log(`  ACT-1 CLEAR RATE: ${clearRate.toFixed(1)}%   (${wins}/${RUNS})`);
  console.log(`  avg fights: ${avg((o) => o.fights).toFixed(1)}`);
  console.log(`  avg spent: ${avg((o) => o.spent).toFixed(0)}cr, avg unspent: ${avg((o) => o.leftOver).toFixed(0)}cr`);
  console.log(
    `  deaths by node type: ${[...byType.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}=${n}`).join('  ') || 'none'}`,
  );
  console.log(
    `  deaths by column:    ${[...byCol.entries()].sort((a, b) => a[0] - b[0]).map(([c, n]) => `c${c}=${n}`).join('  ') || 'none'}`,
  );
  return clearRate;
}

// Iteration 21 (21.6): gate is "every commander's clear rate ≥ the
// iteration-20 baseline gate (40%), and no commander exceeds ~85%" — a
// doctrine that trivializes the act is as much a failure as one that can't
// clear it.
const GATE_MIN = 40;
const GATE_MAX = 85;

function report() {
  console.log(`Act-1 run simulation — ${RUNS} runs per commander on real generated maps.`);
  console.log('Each commander buys down the same wishlist floor, plus a doctrine-specific route/shop bias.\n');

  const baseline = printOutcomes('No commander (iteration-20 baseline)', runFor(undefined));

  const commanders: { id: CommanderId; label: string }[] = [
    { id: 'merchant', label: 'The Merchant' },
    { id: 'engineer', label: 'The Engineer' },
    { id: 'spymaster', label: 'The Spymaster' },
    { id: 'admiral', label: 'The Admiral' },
    { id: 'warlord', label: 'The Warlord' },
  ];

  const results: CommanderReport[] = commanders.map(({ id, label }) => ({
    label,
    commanderId: id,
    wins: 0,
    clearRate: printOutcomes(label, runFor(id)),
  }));

  console.log(`\n=== Gate check (${GATE_MIN}%–${GATE_MAX}%) ===`);
  console.log(`  baseline (no commander, informational only): ${baseline.toFixed(1)}%`);
  for (const r of results) {
    const pass = r.clearRate >= GATE_MIN && r.clearRate <= GATE_MAX;
    const reason = r.clearRate < GATE_MIN ? 'below floor' : r.clearRate > GATE_MAX ? 'trivializes the act' : 'ok';
    console.log(`  ${r.label.padEnd(16)} ${r.clearRate.toFixed(1)}%  ${pass ? 'PASS' : 'FAIL'} (${reason})`);
  }
}

report();
