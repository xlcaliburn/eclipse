import {
  advanceRound,
  combatOutcome,
  hasMissilePhase,
  initCombat,
  issueOrder,
  setPriorityTarget,
  runToEnd,
  unissueOrder,
  useActive,
} from './combatEngine';
import type { FleetOrderId, TargetingStance } from './combatEngine';
import { drawCommanderChoices } from './commanders';
import type { CommanderId } from './commanders';
import {
  applyCounterProtocol,
  applyEscalations,
  applyVeterancy,
  combatEnemyPool,
  convoyEscort,
  eliteEnemyForColumn,
  getBoss,
  getFinalBoss,
  hunterKillerForAmbush,
  OPENER,
} from './enemies';
import { drawCounterProtocols } from './counterProtocols';
import { drawEscalationSchedule } from './escalations';
import { drawEvent, getEvent, meetsRequirement, nextUnrevealedIndex, resolveEventChoice } from './events';
import type { EventId } from './events';
import { getFrame } from './frames';
import type { FrameId } from './frames';
import { addHeat, MAX_HEAT } from './heat';
import { actColumns, bossColumn, generateMap, getNode, globalColumn, laneColumns, maxRows, reachableNodes } from './map';
import type { CargoTag, GameMap, MapPosition } from './map';
import { CAPTURED_SCHEMATIC_PART_ID, COMMODITY_LOT_PART_ID, isSalvageablePart, PARTS, STARTING_LOADOUT } from './parts';
import { drawProtocolOffers, hasProtocol } from './protocols';
import type { ProtocolId } from './protocols';
import { pickOne, randomSeed, resumeRng, runRng } from './rng';
import type { RngFn } from './rng';
import {
  applyRepairBanking,
  canEquip,
  canUnequip,
  deriveFleetForCombat,
  deriveFleetStats,
  deriveStats,
  everyShipAtUpgradeCap,
  fleetHasWeapon,
  playerShipLabel,
  upgradeRedundantOn,
  withUpgrade,
} from './ship';
// 47.6: upgradeCapFor moved to ship.ts — re-exported here so
// FleetOverlay.tsx/FleetPanel.tsx's existing
// `import { upgradeCapFor } from '../game/reducer'` keeps working
// unchanged, same "no consumer needs to touch its import path" discipline
// the whole reducer.ts split follows. (Not in the value-import list above —
// nothing in this file calls it directly any more; withUpgrade calls it
// internally now, inside ship.ts.)
export { upgradeCapFor } from './ship';
import { getUpgrade, randomUpgradeIds } from './upgrades';
import type { UpgradeId } from './upgrades';
import { emptyRunStats } from './daily';
import { mapShip, removeOnce } from './util';
import { shipName } from './shipNames';
import type { CombatEvent, EnemyDef, PartId, PlayerShipState, RewardSummary, RunState, RunStats } from './types';
// 47.6: the shop cases (BUY_PART..LEAVE_SHOP) and their pricing/pool/rarity
// helpers live in reducer/shop.ts now — see that file's header comment for
// the full split rationale. `handleShopAction` is this file's one
// delegation point; the rest are re-exported below (external consumers
// still import them from here) or imported back for PICK_NODE's/
// PROTOCOL_CHOOSE's own non-shop use of shop-pricing logic.
// Only the names PICK_NODE/PROTOCOL_CHOOSE/the switch delegation actually
// reference — everything else re-exported below is re-exported straight
// from the module (no local binding needed), same reasoning `export {
// upgradeCapFor } from './ship'` above doesn't repeat it in a value import.
import { drawFrameOffers, drawShopOffers, handleShopAction, hullScrapValue, STARTING_FIT } from './reducer/shop';
export {
  canUpgradeMark,
  commodityLotBuyCost,
  commodityLotCap,
  COMMODITY_LOT_SELL_PRICE,
  drawShopOffers,
  fleetCap,
  frameCost,
  markUpgradeCost,
  MERCENARY_FIT,
  mercenaryCost,
  partCost,
  partSellPrice,
  RARITY_ORDER,
  REPAIR_COST_PER_HP,
  rollRarity,
  SHOP_OFFER_COUNT,
  STARTING_FIT,
} from './reducer/shop';

export type RunAction =
  | { type: 'CHOOSE_COMMANDER'; commanderId: CommanderId }
  // `col` (iteration 32): omitted means the normal next column
  // (position.col + 1, same as every pre-32 call site keeps meaning);
  // present means a warp-lane shortcut target — two columns can be
  // reachable at once once shortcuts exist, so `row` alone no longer
  // disambiguates which one was picked.
  | { type: 'PICK_NODE'; row: number; col?: number }
  | { type: 'EQUIP'; shipIndex: number; partId: PartId }
  | { type: 'UNEQUIP'; shipIndex: number; partId: PartId }
  | { type: 'ENGAGE' }
  | { type: 'ADVANCE_ROUND' }
  | { type: 'AUTO_RESOLVE' }
  | { type: 'SET_PRIORITY_TARGET'; index: number | null }
  // Iteration 48 (fleet orders): arms one order for the round about to
  // resolve — costs 1 command point, at most one per round. `targetIndex`
  // is required for 'brace' (a player-side index) and 'exploit-weakness'
  // (an enemy-side index), omitted for the two fleet-wide stance orders.
  | { type: 'ISSUE_ORDER'; order: FleetOrderId; targetIndex?: number }
  // 2026-08-12: reverses whichever order ISSUE_ORDER last armed this
  // round — a misclick (wrong ship braced, wrong order picked) no longer
  // permanently costs the command point. Only valid up to the next
  // ADVANCE_ROUND (see combatEngine's canUnissueOrder/unissueOrder).
  | { type: 'UNISSUE_ORDER' }
  | { type: 'CONTINUE' }
  | { type: 'PICK_UPGRADE'; upgradeId: UpgradeId; shipIndex: number }
  | { type: 'LEAVE_REWARD' }
  | { type: 'INTERLUDE_CHOOSE'; shipIndex: number }
  // Iteration 28 (Protocols): resolves the act-1 boss's one-time augment
  // draft — `index` picks one of the 3 offers on RunState.protocolOffers.
  | { type: 'PROTOCOL_CHOOSE'; index: 0 | 1 | 2 }
  | { type: 'RESOLVE_FLAGSHIP_RECOVERY'; recover: boolean }
  | { type: 'BUY_PART'; offerIndex: number }
  | { type: 'SELL_PART'; partId: PartId }
  | { type: 'BUY_SHIP'; frameId: Exclude<FrameId, 'cruiser'> } // the Flagship is never purchasable
  // Iteration 59.3 (hull marks — replaces 52.5's REFIT_SHIP, removed by
  // 59.2): upgrades shipIndex's ship one mark (I -> II -> III, cap III),
  // shipyard-only, mercenaries excluded (see canUpgradeMark in
  // reducer/shop.ts). Unlike the old refit this never changes frameId, so
  // the Flagship CAN be marked.
  | { type: 'UPGRADE_MARK'; shipIndex: number }
  | { type: 'SCUTTLE_SHIP'; shipIndex: number }
  | { type: 'SET_TARGETING_STANCE'; stance: TargetingStance }
  // Iteration 20 (commodity runs): buy adds a lot to inventory, same as any
  // other part (2026-08-06 — used to take a shipIndex and load straight
  // onto a ship in one step, but that per-ship button row got unreadable
  // past 2 hulls; equipping it is now the normal EQUIP flow, which is also
  // where commodityLotBoughtAtGlobalColumn gets recorded). Sell removes
  // whichever ship(s) currently carry an eligible one.
  | { type: 'BUY_COMMODITY_LOT' }
  | { type: 'SELL_COMMODITY_LOT' }
  // Iteration 20 (war assets): a one-fight-only escort. Consumed the very
  // next time a combat resolves (win or loss), regardless of outcome.
  | { type: 'BUY_MERCENARY' }
  // 2026-08-06: pay a shop to fully heal one ship's accumulated damage —
  // REPAIR_COST_PER_HP credits per point, same shape as any other per-ship
  // shop action (Scuttle, Load commodity lot).
  | { type: 'BUY_REPAIR'; shipIndex: number }
  | { type: 'USE_ACTIVE'; shipIndex: number; abilityIndex: number }
  | { type: 'LEAVE_SHOP' }
  | { type: 'LEAVE_REPAIR' }
  | { type: 'EVENT_CHOOSE'; choiceIndex: number; shipIndex?: number; partId?: PartId }
  | { type: 'EVENT_CONTINUE' }
  // Iteration 15.3: either branch of the repair-yard choice. `choice: 'full'`
  // needs nothing else; `choice: 'overhaul'` carries the ship + upgrade the
  // player picked from `RunState.repairUpgradeOptions` (drawn on arrival).
  | { type: 'REPAIR_CHOOSE'; choice: 'full' }
  | { type: 'REPAIR_CHOOSE'; choice: 'overhaul'; shipIndex: number; upgradeId: UpgradeId }
  // Iteration 18: NEW_RUN can carry a fixed seed (the daily run) and a
  // mode tag; LOAD_STATE is pure state replacement so the landing screen
  // can choose between the standard and daily save slots.
  | { type: 'NEW_RUN'; seed?: number; mode?: 'daily'; dailyDate?: string }
  | { type: 'LOAD_STATE'; state: RunState };

// How many columns beyond the current vision high-water mark a long-range
// sweep reveals.
const SECTOR_SCAN_DEPTH = 2;

// Iteration 48 (fleet orders): the fleet-wide command-point budget ENGAGE
// seeds into initCombat — see combatEngine.ts's CombatState.commandPoints
// and the "Fleet orders" section for what a point buys. The Spymaster's
// bump (2cr worth of "runs the battle on better intelligence" doctrine, in
// mechanical terms) is the info-doctrine's first presence in the phase the
// player actually spends their minutes in — the map-side kit (vision,
// intel draws, heat-free salvage) never touches combat at all otherwise.
// Exported so PrepScreen's one-line CP preview reads the same numbers
// ENGAGE actually seeds — not a re-derived duplicate.
export const BASE_COMMAND_POINTS = 2;
export const SPYMASTER_COMMAND_POINTS = 3;
// Iteration 51.1 ("Forewarned"): +1 player-side computer for the whole
// fleet during the opening exchange (missile phase + cannon round 1) —
// see combatEngine.ts's CombatState.openingComputerBonus. Exported for the
// same "one source of truth" reasoning as BASE_COMMAND_POINTS, in case any
// UI copy wants the number.
export const SPYMASTER_FOREWARNED_COMPUTER = 1;

// Iteration 46.2 (2026-08-08): a flat, free heal on every won fight,
// universal (every commander, stacks with regen/the Engineer's bonus) —
// see the CONTINUE win branch's comment for the attrition finding that
// motivated this. Was actRun.ts's old POST_WIN_REPAIR experiment env var;
// promoted from a measurement knob to a real rule.
export const POST_WIN_REPAIR = 2;
// Credits earned for winning a combat node at the given (global) column.
// `act` defaults to 1 since almost every call site is act-1 context
// (act-2 callers pass `2` explicitly — see the CONTINUE case below).
//
// Iteration 22.6: base bumped 4->7. Simulation found the base pool
// difficulty (mid-tier enemies re-tuned in 22.3, difficulty ramp de-stacked
// in 22.1) still outpaced what this reward rate could buy by the columns
// where it mattered — even with veterancy AND escalations fully disabled,
// the fleet this formula could field only cleared 8% of runs. +3cr per win
// compounds: a run that fights every column from 1-6 nets ~18cr more by
// column 6 than the old rate, which is the difference between the Flagship
// reaching computer 2 by the mid pool or never reaching it at all (see
// plans/iteration-22.md's status notes on the 0%-comp2-by-col6 finding).
//
// 2026-08-07: act 1 was briefly halved (floored) here — a deliberate
// re-tightening of the early game specifically. Un-halved the same day,
// after a playtest report plus an actRun.ts isolation sweep (see
// plans/iteration-44.md's 44.1) showed the halving was overwhelmingly the
// dominant cause of every commander's act-1 clear rate collapsing to
// 0.6%-4.6% (vs. a historical 3.8%-20.8% best-case — see iteration-22.md;
// the un-halved rate at least gets back to that healthier territory).
//
// 2026-08-08: a narrower cut, not a repeat of that collapse — only
// columns 1-3 (not the whole act) halved (floored), driven by a playtest
// report: a straight run to the first shop (guaranteed reachable by
// col 3-4, iteration 22.2) banks a forced 27cr (8+9+10) before the player
// makes a single real choice, often more than the shop's own stock costs
// to clear. Column 0 (the opener) is untouched — it's already excluded
// from that 27cr tally. The removed early income (27->13, -14cr) is
// redirected into act 2 instead, via ACT2_REWARD_BONUS below — which also
// directly helps the iteration-46 finding that act 2's ~13-fight chain,
// not any single fight, is the real bottleneck.
const ACT1_HALVED_COLUMNS: readonly number[] = [1, 2, 3];
// +3cr per win/elite, act 2 only. Across the ~13 fights iteration 46
// measured act 2 requiring, that's roughly +39cr over a full act-2 clear
// — more than double the 14cr pulled from act 1's first 3 columns above,
// intentionally "more than 1:1" per the direction to shift more into
// act 2, not just relocate the same total.
const ACT2_REWARD_BONUS = 3;

export function winReward(col: number, act: 1 | 2 = 1): number {
  const base = 7 + col;
  if (act === 1 && ACT1_HALVED_COLUMNS.includes(col)) return Math.floor(base / 2);
  return act === 2 ? base + ACT2_REWARD_BONUS : base;
}

// Credits earned for winning an elite node at the given (global) column.
// Iteration 35: used to also grant a random reaction card (or +4cr if the
// hand was full) on top of this — now a flat +4cr bonus every time (see
// the CONTINUE case). Iteration 22.6: base bumped 8->11, same reasoning as
// winReward above — kept 3cr above it so an elite still reads as the
// bigger payout. 2026-08-07: act-1 halving added, then un-halved the same
// day — see winReward's note. Elites are optional, chosen risk (not part
// of the forced "walk to the first shop" income winReward's 2026-08-08
// note describes), so they don't get that early-column cut — but DO get
// the same act-2 bonus, preserving the existing "+4 over winReward" gap
// between the two at every column.
export function eliteReward(col: number, act: 1 | 2 = 1): number {
  const base = 11 + col;
  return act === 2 ? base + ACT2_REWARD_BONUS : base;
}

// Iteration 50 (the reward-tier guardrail): pulled out of the CONTINUE
// case's inline ternary and exported so rewardTiers.ts's manifest can
// measure these bonuses off the real constant instead of a hand-copied
// number — the same "one source of truth" discipline BASE_COMMAND_POINTS
// follows for the prep screen (iteration 48). A copied literal drifting
// from this value is exactly how distress-beacon's own payout drifted
// from design intent in the first place (see plans/iteration-50.md).
export const ELITE_KILL_BONUS = 4;
export const COMMAND_CARGO_BONUS = 8;

function bossEnemyForAct(map: GameMap, act: 1 | 2): EnemyDef {
  return act === 1 ? getBoss(map.act1BossId) : getFinalBoss(map.act2BossId);
}

// Iteration 30: the single gate every act-2 enemy construction site routes
// through — act-2-only (the guard, not a per-call check scattered
// everywhere) and only when a counter-protocol was actually drafted. Called
// AFTER veterancy/escalations at every site (documented ordering: counters
// are the outermost layer, so appliedCounter always reflects what they
// actually added on top of whatever else already landed).
function withCounterProtocol(enemy: EnemyDef, state: RunState): EnemyDef {
  return state.act === 2 && state.counterProtocol ? applyCounterProtocol(enemy, state.counterProtocol) : enemy;
}

// Iteration 24 (Flagship recovery): the Flagship ('cruiser') is the one hull
// that can never be rebought — losing it in a fight the rest of the fleet
// survives used to just mean it was gone for good, permanently. This wraps
// whatever a fight's natural next state would have been (a won fight's
// reward/interlude/victory) behind a one-time salvage offer when that's
// exactly what happened. Every field the natural transition already set
// (fleet, credits, pendingReward, etc.) stays on `next` untouched — only
// `phase` is swapped out and restored by RESOLVE_FLAGSHIP_RECOVERY, so this
// needs no duplicate branch logic at any of its three call sites. (51.3
// removed the fourth: WITHDRAW's return-to-map path.)
function withFlagshipRecoveryGate(originalFleet: PlayerShipState[], next: RunState): RunState {
  if (next.fleet.length === 0) return next; // total wipe — 'defeat' is a separate, earlier return; not reachable here
  if (next.fleet.some((s) => s.frameId === 'cruiser')) return next; // Flagship survived — nothing to gate
  const lostFlagship = originalFleet.find((s) => s.frameId === 'cruiser');
  if (!lostFlagship) return next; // no Flagship was in this fight to begin with
  return {
    ...next,
    phase: 'flagship-recovery',
    flagshipRecoveryResumePhase: next.phase,
    pendingFlagshipRecovery: {
      cost: getFrame('cruiser').cost,
      shipName: lostFlagship.name ?? 'the Flagship',
      kills: lostFlagship.kills ?? 0,
      fightsSurvived: lostFlagship.fightsSurvived ?? 0,
    },
  };
}

// Draws and stores this fight's combat seed at the moment `currentEnemy` is
// set (PICK_NODE or an event ambush) — not at ENGAGE — so a reload before
// Engage can never reroll the fight (9.1).
function drawCombatSeed(rng: RngFn): number {
  return Math.floor(rng() * 0xffffffff);
}

// 47.5d: PICK_NODE's 5 branches that land on a fight (opener, combat,
// elite, boss, a Hunted-heat interception) all built this identical
// object by hand, differing only in `currentEnemy` and whether
// `interceptionActive` is set.
function enterCombat(
  base: RunState,
  enemy: EnemyDef,
  rng: RngFn,
  nextCounter: () => number,
  opts: { interceptionActive?: boolean } = {},
): RunState {
  return {
    ...base,
    phase: 'prep',
    currentEnemy: enemy,
    currentCombatSeed: drawCombatSeed(rng),
    rngCounter: nextCounter(),
    ...(opts.interceptionActive ? { interceptionActive: true as const } : {}),
  };
}

export function initialRunState(options?: { seed?: number; mode?: 'daily'; dailyDate?: string }): RunState {
  const seed = options?.seed ?? randomSeed();
  // One rng stream seeds the whole run: the map first, then the escalation
  // schedule, then the commander draw, then (iteration 9) every later
  // in-run draw continues the exact same sequence via `rngCounter` — the
  // entire run, start to end, is deterministic from this one seed.
  const { rng, consumedThisCall } = resumeRng(seed, 0);
  const map = generateMap(seed, rng);
  const escalations = drawEscalationSchedule(rng);
  const commanderChoices = drawCommanderChoices(rng);
  return {
    phase: 'commander',
    map,
    act: 1,
    rngCounter: consumedThisCall(),
    targetingStance: 'weakest',
    position: null,
    visited: [],
    fled: [],
    credits: 0,
    inventory: [],
    fleet: [
      {
        frameId: 'cruiser',
        equipped: [...STARTING_LOADOUT],
        damage: 0,
        upgrades: [],
        name: shipName(seed, 0, 'cruiser'),
        kills: 0,
        fightsSurvived: 0,
      },
    ],
    escalations,
    bossRevealed: false,
    visionCol: 0,
    revealedNodes: [],
    commanderChoices,
    heat: 0,
    mode: options?.mode ?? 'standard',
    dailyDate: options?.dailyDate,
    shipsCommissioned: 1,
    runStats: emptyRunStats(),
  };
}

// Iteration 18: fight-end stat attribution, from the fight's complete log.
// Damage is summed from roll events (arc/prow/rift side-damage flows
// through amount-less part-effect events — undercounted by design). A kill
// is credited to the last player hit-roll whose target matches the
// destroyed ship; prow/arc chains that don't match fall back to
// unattributed rather than misattributed.
function attributeFightStats(
  log: CombatEvent[],
  fleetSize: number,
): { kills: number[]; damageDealt: number; damageTaken: number } {
  const kills = Array.from({ length: fleetSize }, () => 0);
  let damageDealt = 0;
  let damageTaken = 0;
  let lastPlayerHit: { shooterIndex: number; targetIndex: number } | null = null;
  for (const event of log) {
    if (event.kind === 'roll') {
      if (event.side === 'player') {
        damageDealt += event.damage;
        if (event.hit) lastPlayerHit = { shooterIndex: event.shooterIndex, targetIndex: event.targetIndex };
      } else {
        damageTaken += event.damage;
      }
    } else if (event.kind === 'destroyed' && event.side === 'enemy') {
      if (lastPlayerHit && lastPlayerHit.targetIndex === event.shipIndex && lastPlayerHit.shooterIndex < fleetSize) {
        kills[lastPlayerHit.shooterIndex]++;
      }
    }
  }
  return { kills, damageDealt, damageTaken };
}

type FightStats = { kills: number[]; damageDealt: number; damageTaken: number };

// 47.5a: extracted from CONTINUE and (pre-51.3) WITHDRAW, which each
// hand-rolled the same post-fight fleet walk (skip mercenaries, salvage a
// destroyed ship's equipped parts to inventory, carry a survivor's
// kills/fightsSurvived forward) — the single highest-consequence
// duplication found in the 47.5 review, since either copy drifting from the
// other silently changes salvage/kill-crediting rules. 51.3 removed
// WITHDRAW outright, leaving CONTINUE as the one caller, but the shape is
// kept as-is rather than collapsed into CONTINUE — `outcome` stays a plain
// index-aligned array (CONTINUE derives it from `combatOutcome`, since the
// fight always has a winner by the time this runs) so the function's own
// logic doesn't need to know how its caller got there. Heal
// (regen/Engineer/POST_WIN_REPAIR) is deliberately NOT applied here — see
// `applyPostFightHeal` below, called as a separate pass so heal rules stay
// independent of settlement.
function settleFleetAfterFight(
  fleet: PlayerShipState[],
  outcome: { endDamage: number; destroyed: boolean }[],
  fightStats: FightStats,
  startingInventory: PartId[],
  opts: { protocols?: ProtocolId[]; ghostFleet?: boolean } = {},
): { survivingFleet: PlayerShipState[]; inventory: PartId[]; salvagedParts: PartId[]; lostShips: string[] } {
  let inventory = startingInventory;
  const salvagedParts: PartId[] = [];
  const lostShips: string[] = [];
  const survivingFleet: PlayerShipState[] = [];
  fleet.forEach((ship, i) => {
    // A hired mercenary is good for exactly this one fight — it leaves the
    // fleet the moment combat resolves regardless of outcome, with no
    // salvage and no ships-lost entry. It fought; it's not owed anything
    // beyond that.
    if (ship.mercenary) return;
    const shipOutcome = outcome[i];
    // Iteration 28 (Ghost fleet protocol): a ship that would be destroyed
    // survives critically damaged instead — no resolver change needed,
    // since this is purely a reinterpretation of the fight's
    // already-computed outcome: it simply doesn't take the "destroyed"
    // branch below, and lands at 1 HP (critically damaged, not gone)
    // instead. Its parts/upgrades are untouched (it never actually died),
    // unlike a real destruction's salvage-and-lose.
    if (shipOutcome.destroyed && opts.ghostFleet) {
      const maxHp = deriveStats(ship.frameId, ship.equipped, ship.upgrades, opts.protocols).hp;
      survivingFleet.push({
        ...ship,
        damage: Math.max(0, maxHp - 1),
        kills: (ship.kills ?? 0) + fightStats.kills[i],
        fightsSurvived: (ship.fightsSurvived ?? 0) + 1,
      });
    } else if (shipOutcome.destroyed) {
      // Parts salvage back to inventory; upgrades are lost with the ship —
      // that's what makes a capital ship's upgrades feel earned. A
      // commodity lot is not a real part — lost with the ship, not
      // salvaged.
      const salvage = ship.equipped.filter(isSalvageablePart);
      inventory = [...inventory, ...salvage];
      salvagedParts.push(...salvage);
      lostShips.push(playerShipLabel(fleet, i));
    } else {
      survivingFleet.push({
        ...ship,
        damage: shipOutcome.endDamage,
        kills: (ship.kills ?? 0) + fightStats.kills[i],
        fightsSurvived: (ship.fightsSurvived ?? 0) + 1,
      });
    }
  });
  return { survivingFleet, inventory, salvagedParts, lostShips };
}

// 47.5b: the (originally 3) hand-spread RunStats merges (defeat, win,
// withdraw) folded into one. 51.3 removed withdraw, leaving 2 — `opts` is
// kept as an options bag rather than collapsed into a plain boolean, since
// a defeat still needs neither flag (only damageDealt/damageTaken change
// there, matching the original 3-way shape).
function mergeRunStats(
  base: RunStats,
  fightStats: FightStats,
  opts: { won?: boolean; lostShips?: string[] } = {},
): RunStats {
  return {
    ...base,
    fightsWon: base.fightsWon + (opts.won ? 1 : 0),
    shipsLost: opts.lostShips && opts.lostShips.length > 0 ? [...base.shipsLost, ...opts.lostShips] : base.shipsLost,
    damageDealt: base.damageDealt + fightStats.damageDealt,
    damageTaken: base.damageTaken + fightStats.damageTaken,
  };
}

// 47.5c: originally the divergent post-fight heal blocks in CONTINUE
// (regen + Engineer's flat bonus + POST_WIN_REPAIR, with the Engineer's
// heal BANKED past full via applyRepairBanking) vs WITHDRAW (bare regen,
// no banking — iteration 39 made regen heal after any survived fight, not
// just a win, while the Engineer's bonus/banking stayed win-only, tied to
// the reward itself). 51.3 removed WITHDRAW, so CONTINUE is the only
// caller left and every call now passes `regen: true` alongside the win
// options — regen's "any survived fight" framing collapses back to
// win-only in practice, since winning is the only way to survive a fight
// any more. Left as an options bag (not simplified into a plain heal call)
// since the Engineer's bank/flat still vary independently of regen at the
// one remaining call site. Applied as a separate pass AFTER
// settleFleetAfterFight, over ships whose `damage` is already the settled
// end-of-fight value.
function applyPostFightHeal(
  ship: PlayerShipState,
  opts: { regen?: boolean; flat?: number; bank?: boolean } = {},
): PlayerShipState {
  const regenCount = opts.regen ? ship.upgrades.filter((u) => u === 'regen').length : 0;
  const totalHeal = regenCount + (opts.flat ?? 0);
  if (totalHeal === 0) return ship;
  if (opts.bank) return applyRepairBanking(ship, totalHeal);
  if (ship.damage === 0) return ship;
  return { ...ship, damage: Math.max(0, ship.damage - totalHeal) };
}

// Vision extends further per pick for the Spymaster.
function visionStep(state: RunState): number {
  return state.commanderId === 'spymaster' ? 2 : 1;
}

// --- Intelligence (the Spymaster's whole identity) -------------------------
// There is no intel currency and no info broker. Instead the Spymaster is
// handed one free piece of intelligence after every combat win. The draw is
// taken only from options that would actually reveal something, so a late
// run never rolls a dud.

type RevealKind = 'dossier' | 'sector-scan' | 'deep-scan' | 'escalation';

// Lanes that still hide at least one node the player cannot already see.
// Iteration 32: row count generalized from a hardcoded 3 to `maxRows` —
// act 2's chart is 4 lanes wide, not 3.
function scannableRows(state: RunState): number[] {
  const columns = actColumns(state.map, state.act);
  const rows: number[] = [];
  for (let row = 0; row < maxRows(columns); row++) {
    for (let col = 0; col < laneColumns(state.act); col++) {
      if (!columns[col][row]) continue;
      if (col <= state.visionCol) continue;
      if (state.revealedNodes.some((p) => p.col === col && p.row === row)) continue;
      rows.push(row);
      break;
    }
  }
  return rows;
}

function availableReveals(state: RunState): RevealKind[] {
  const kinds: RevealKind[] = [];
  if (!state.bossRevealed) kinds.push('dossier');
  if (state.visionCol < laneColumns(state.act) - 1) kinds.push('sector-scan');
  if (scannableRows(state).length > 0) kinds.push('deep-scan');
  if (nextUnrevealedIndex(state) !== -1) kinds.push('escalation');
  return kinds;
}

// Applies one random still-useful reveal. Returns the state unchanged (and
// no text) once there is nothing left to learn.
function grantIntel(state: RunState, rng: RngFn): { state: RunState; text?: string } {
  const kinds = availableReveals(state);
  if (kinds.length === 0) return { state };
  const kind = kinds[Math.floor(rng() * kinds.length)];

  switch (kind) {
    case 'dossier':
      return {
        state: { ...state, bossRevealed: true },
        text: 'Intercepted traffic identifies the boss waiting at the end of the sector.',
      };
    case 'sector-scan':
      return {
        state: { ...state, visionCol: state.visionCol + SECTOR_SCAN_DEPTH },
        text: 'A long-range sweep resolves two more columns of the chart.',
      };
    case 'deep-scan': {
      const rows = scannableRows(state);
      const row = rows[Math.floor(rng() * rows.length)];
      const columns = actColumns(state.map, state.act);
      const newlyRevealed: MapPosition[] = [];
      for (let col = 0; col < laneColumns(state.act); col++) {
        if (columns[col][row]) newlyRevealed.push({ col, row });
      }
      return {
        state: { ...state, revealedNodes: [...state.revealedNodes, ...newlyRevealed] },
        text: `Deep scan charts lane ${row + 1} end to end.`,
      };
    }
    case 'escalation': {
      const index = nextUnrevealedIndex(state);
      const escalations = state.escalations.map((e, i) => (i === index ? { ...e, revealed: true } : e));
      return {
        state: { ...state, escalations },
        text: 'Decrypted orders reveal the enemy fleet’s next upgrade.',
      };
    }
  }
}

// Only the Spymaster gathers intelligence; everyone else fights blind.
function grantCommanderIntel(state: RunState, rng: RngFn): { state: RunState; text?: string } {
  if (state.commanderId !== 'spymaster') return { state };
  return grantIntel(state, rng);
}

function pickFromPool(pool: EnemyDef[], rng: RngFn): EnemyDef {
  return pickOne(pool, rng);
}

// --- Cargo (iteration 15.1) --------------------------------------------
// Same 5-credit tier the shop draws its mid parts from — a wreck field's
// find is exactly "a part you'd otherwise find in a shop," not a
// bespoke loot table.
const WRECK_FIELD_PART_POOL: PartId[] = PARTS.filter((p) => p.cost === 5).map((p) => p.id);

function randomWreckPart(rng: RngFn): PartId {
  return pickOne(WRECK_FIELD_PART_POOL, rng);
}

// Applies the cargo table's credit adjustment to an already-computed base
// reward. Patrol/command/untagged pass through unchanged — command's bonus
// (eliteOrCommandBonus) is wired separately in CONTINUE, not a base-reward
// change. Exported for a direct unit test of the wreck-field floor
// (winReward's own minimum of 4 can never actually reach the floor in an
// integration test).
export function applyCargoReward(tag: CargoTag | undefined, base: number): number {
  if (tag === 'convoy') return base + 4;
  if (tag === 'wreck') return Math.max(1, base - 2);
  return base;
}

// `bankFlat`: the Engineer's flat +1 over-repair bank on every ship visiting
// a repair yard — a full heal has no excess by definition (there's no
// damage left over to measure against), so without this a yard visit would
// give the Engineer nothing beyond what any other commander gets, which is
// exactly backwards for the doctrine most interested in repair sources.
function repairFleet(
  fleet: PlayerShipState[],
  bankFlat: boolean,
): { fleet: PlayerShipState[]; totalRepaired: number } {
  let totalRepaired = 0;
  const repaired = fleet.map((ship) => {
    totalRepaired += ship.damage;
    return bankFlat ? applyRepairBanking(ship, ship.damage, true) : { ...ship, damage: 0 };
  });
  return { fleet: repaired, totalRepaired };
}

function repairSummaryText(totalRepaired: number, shipCount: number): string {
  if (totalRepaired === 0) return 'Your fleet is already at full strength.';
  return `Repaired ${totalRepaired} damage across ${shipCount} ship${shipCount > 1 ? 's' : ''}.`;
}


export function runReducer(state: RunState, action: RunAction): RunState {
  switch (action.type) {
    case 'CHOOSE_COMMANDER': {
      if (state.phase !== 'commander') return state;
      if (!state.commanderChoices.includes(action.commanderId)) return state;
      const commissioned = state.shipsCommissioned ?? state.fleet.length;
      // One rng instance for the whole case — the Warlord branch below is
      // the only one that actually draws from it; nextCounter() naturally
      // reports 0 extra consumed when it doesn't, so it's always safe to
      // call unconditionally rather than needing an if/else on the action.
      const { rng, nextCounter } = runRng(state);

      // The Admiral (wide, iteration 21) inherits the old Warlord's free
      // starting Interceptor — the fleet begins at 3 ships now (51.2: a
      // second free Interceptor added on top of the original one — the
      // simplest available lever on the worst-measuring commander's
      // numbers, see plans/iteration-51.md's 51.2). 61.3: fitted with a
      // light missile now, matching STARTING_FIT.interceptor's new
      // speed-biased default (reducer/shop.ts) rather than a hardcoded
      // 'ion'.
      const fleet =
        action.commanderId === 'admiral'
          ? [
              ...state.fleet,
              {
                frameId: 'interceptor' as const,
                equipped: [...STARTING_FIT.interceptor] as PartId[],
                damage: 0,
                upgrades: [],
                name: shipName(state.map.seed, commissioned, 'interceptor'),
                kills: 0,
                fightsSurvived: 0,
              },
              {
                frameId: 'interceptor' as const,
                equipped: [...STARTING_FIT.interceptor] as PartId[],
                damage: 0,
                upgrades: [],
                name: shipName(state.map.seed, commissioned + 1, 'interceptor'),
                kills: 0,
                fightsSurvived: 0,
              },
            ]
          : state.fleet;

      // The Warlord (tall, reworked) starts with one upgrade already fitted
      // to the Flagship instead — a random pick, not a player choice; a
      // full pick screen for a one-time run-start bonus was more UI than
      // the flavor is worth. Their 2-upgrade cap (withUpgrade,
      // upgradeCapFor) means this doesn't cost them a later pick the way it
      // would for anyone else. Maps to a fresh array rather than assigning
      // into `fleet[0]` directly — `fleet` still aliases `state.fleet` for
      // every commander but the Admiral, and mutating it in place would
      // corrupt the state this reducer was handed.
      const finalFleet =
        action.commanderId === 'warlord' && fleet[0]
          ? mapShip(fleet, 0, (s) => withUpgrade(s, randomUpgradeIds(1, rng)[0], action.commanderId))
          : fleet;

      // 2026-08-07: the setup phase (a customize-your-fit screen between
      // commander pick and map) is gone — the Flagship's fit is always the
      // fixed STARTING_LOADOUT (always includes a weapon), so the old
      // hasWeapon gate SETUP_CONFIRM used to enforce was already
      // unreachable in practice. Straight to the map now.
      return {
        ...state,
        phase: 'map',
        commanderId: action.commanderId,
        fleet: finalFleet,
        shipsCommissioned: action.commanderId === 'admiral' ? commissioned + 2 : state.shipsCommissioned,
        rngCounter: nextCounter(),
      };
    }

    case 'PICK_NODE': {
      if (state.phase !== 'map') return state;
      const { rng, nextCounter } = runRng(state);
      const columns = actColumns(state.map, state.act);
      // Iteration 32 (warp lanes): act 2's map may carry shortcut edges —
      // act 1 never does, so this is always [] there. `reachableNodes`
      // folds shortcut targets in alongside the normal +1-column set, so
      // two different columns can be reachable from one position at once;
      // `action.col` (defaulting to the normal next column, same as every
      // pre-32 caller) is what disambiguates which one was picked.
      const shortcuts = state.act === 2 ? (state.map.act2Shortcuts ?? []) : [];
      const targetCol = action.col ?? (state.position === null ? 0 : state.position.col + 1);
      const candidates = reachableNodes(columns, state.position, shortcuts);
      const node = candidates.find((n) => n.row === action.row && n.col === targetCol);
      if (!node) return state;
      if (state.fled.some((f) => f.col === node.col && f.row === node.row)) return state;

      // A shortcut skips exactly one column outright — every node in it is
      // marked fled (the "can never be picked again" rule `fled` exists
      // for — see its doc comment on RunState), since position just moved
      // two columns at once and the run can never visit them now.
      const isShortcut = state.position !== null && targetCol === state.position.col + 2;
      const skippedColumn = isShortcut ? (columns[state.position!.col + 1] ?? []) : [];
      const fled = [...state.fled, ...skippedColumn.map((n) => ({ col: n.col, row: n.row }))];

      const position: MapPosition = { col: node.col, row: node.row };
      const visited = [...state.visited, position];
      // Arriving anywhere reveals your next set of choices (fog of war,
      // iteration 6) — a high-water mark, so it only ever climbs.
      const visionCol = Math.max(state.visionCol, node.col + visionStep(state));

      // Iteration 32 (the pursuit clock, 32.3): arriving at any act-2 lane
      // node beyond the shortest-possible route's length adds +1 heat, on
      // top of whatever the node itself does (a dock's own +1-to-enter
      // below, or nothing for combat/elite — the boss is explicitly
      // exempt, same as it's exempt from interception). Derived from
      // `visited` (act-2-local, reset at the act boundary), not a new
      // persisted counter; the threshold is `laneColumns(2) - 2`, not a
      // magic 10, so a future re-sizing keeps "the shortest possible route
      // pays no tax" true with no second edit here. A route using both
      // warp lanes visits exactly `laneColumns(2) - 2` lane nodes and never
      // crosses the threshold; the full-length route's last two arrivals
      // do.
      const pursuitThreshold = laneColumns(2) - 2;
      const act2LaneVisitsSoFar = state.act === 2 ? state.visited.filter((p) => p.col < laneColumns(2)).length : 0;
      const arrivalOrdinal = act2LaneVisitsSoFar + 1;
      const pursuitTax =
        state.act === 2 && node.type !== 'boss' && arrivalOrdinal > pursuitThreshold ? 1 : 0;
      const heatAfterArrival = addHeat(state.heat, pursuitTax);

      const base: RunState = { ...state, position, visited, visionCol, fled, heat: heatAfterArrival };

      if (node.type === 'opener') {
        // The act-1 opener: fixed enemy, no escalations (none are scheduled
        // before column 3 anyway), no veterancy, a guaranteed-survivable
        // first step.
        return enterCombat(base, OPENER, rng, nextCounter);
      }
      // Escalations are seeded for both acts at once. Iteration 8.4 made
      // act-1's permanent once landed — carrying through and stacking with
      // act-2's own for the rest of the run. Iteration 46.3 reverses that:
      // only the CURRENT act's two escalations are ever live. Measured
      // cause: the difficulty ledger found act-1's leftover pair alone
      // cost ~30pp at act-2 entry (94-97% plain -> ~68-69%), before act
      // 2's own escalations or its counter-protocol stack on top — the
      // single biggest lever behind act 2's 0% conditional clear rate.
      // Reads cleanly too: a new sector runs a different enemy doctrine,
      // not last sector's plus its own.
      const globalEscalations = state.escalations
        .filter((e) => e.act === state.act)
        .map((e) => ({ ...e, landsAfterColumn: globalColumn(e.act, e.landsAfterColumn) }));
      const globalCol = globalColumn(state.act, node.col);
      if (node.type === 'combat') {
        const rawEnemy = pickFromPool(combatEnemyPool(state.act, node.col), rng);
        const scaledEnemy = applyEscalations(applyVeterancy(rawEnemy, node.col), globalCol, globalEscalations);
        // A convoy's +4cr premium (map.ts's CARGO_DESCRIPTION) is danger
        // money, not free — see convoyEscort's own comment.
        const enemy = withCounterProtocol(node.cargo === 'convoy' ? convoyEscort(scaledEnemy) : scaledEnemy, state);
        return enterCombat(base, enemy, rng, nextCounter);
      }
      if (node.type === 'elite') {
        const rawEnemy = eliteEnemyForColumn(state.act, node.col, rng);
        const enemy = withCounterProtocol(applyEscalations(applyVeterancy(rawEnemy, node.col), globalCol, globalEscalations), state);
        return enterCombat(base, enemy, rng, nextCounter);
      }
      if (node.type === 'boss') {
        // Iteration 30: the act-2 final boss is included, same uniformity
        // rule as escalations — the balance pass (not a fiat exemption)
        // catches it if a prismatic counter ever pushes a boss out of band.
        const enemy = withCounterProtocol(applyEscalations(bossEnemyForAct(state.map, state.act), globalCol, globalEscalations), state);
        return enterCombat(base, enemy, rng, nextCounter);
      }
      // shop / shipyard / repair / event — the "dock" node types (15.2,
      // shipyard added 33): each costs +1 heat to enter, unless heat is
      // already armed at 4 ("Hunted"), in which case the dock is never
      // reached at all — a hunter-killer squad replaces the node's content
      // outright, paying a normal winReward(col) on top of the map's usual
      // prep/combat flow. Combat/elite/boss/opener entries are never
      // intercepted (they're already a fight). Checked against `base.heat`
      // (iteration 32: post-pursuit-tax), not `state.heat` — a long-router
      // arriving at a dock with the clock already at 4 gets caught exactly
      // like any other Hunted arrival; the pursuit tax is meant to compose
      // with this, not bypass it.
      if (base.heat >= MAX_HEAT) {
        const enemy = withCounterProtocol(hunterKillerForAmbush(state.act, node.col), state);
        return enterCombat(base, enemy, rng, nextCounter, { interceptionActive: true });
      }
      const heat = addHeat(base.heat, 1);

      if (node.type === 'shop' || node.type === 'shipyard') {
        // Iteration 33: both node types resolve to the same 'shop' phase,
        // branched everywhere else by shopKind. A shipyard sells no parts
        // (shopOffers: [] — present-but-empty, distinct from undefined so
        // isValidRunState's `!!state.shopOffers` check still passes).
        const shopKind: 'store' | 'shipyard' = node.type === 'shipyard' ? 'shipyard' : 'store';
        const shopFrameOffers = drawFrameOffers(rng, state.act, shopKind);
        return {
          ...base,
          phase: 'shop',
          shopKind,
          shopOffers: shopKind === 'shipyard' ? [] : drawShopOffers(rng, state.commanderId, state.protocols),
          shopFrameOffers,
          heat,
          rngCounter: nextCounter(),
        };
      }
      if (node.type === 'repair') {
        // 15.3: no auto-heal on arrival any more — the player chooses full
        // repair vs. overhaul next (REPAIR_CHOOSE). The 3 overhaul options
        // are drawn now regardless of which way they'll go, so a single
        // later dispatch can carry the pick without a second rng step.
        //
        // Iteration 28 (Ghost fleet protocol's cost): repairs are never
        // credit-priced in this game (a yard heals or overhauls for free),
        // so "every repair costs double" is paid in the currency a yard
        // visit actually has a price in — pursuit heat. One extra point on
        // top of the arrival cost every fight's-worth CONTINUE branch
        // normally already vents.
        const repairHeat = hasProtocol(state.protocols, 'ghost-fleet-protocol') ? addHeat(heat, 1) : heat;
        return {
          ...base,
          phase: 'repair',
          repairUpgradeOptions: randomUpgradeIds(3, rng),
          heat: repairHeat,
          rngCounter: nextCounter(),
        };
      }

      // event
      // 14.3: the defector's "take them aboard" choice schedules the pursuit
      // as the very next event node instead of rolling the pool — a one-off
      // forced follow-up, consumed here and then cleared.
      // 49.1: drawEvent's stage gating needs the ENTERED node's column
      // (`node.col`, the destination), not the pre-move `state.position` —
      // an event node at column 4 must draw from the mid pool even though
      // pre-move state.position.col is 3. See reducer.test.ts's regression
      // test pinning this.
      const eventId: EventId = state.pendingEventId ?? drawEvent(rng, state, node.col);
      return {
        ...base,
        phase: 'event',
        currentEvent: { eventId },
        lastEventId: eventId,
        pendingEventId: undefined,
        heat,
        rngCounter: nextCounter(),
      };
    }

    case 'EQUIP': {
      if (state.phase !== 'prep' && state.phase !== 'shop') return state;
      const ship = state.fleet[action.shipIndex];
      if (!ship) return state;
      if (!state.inventory.includes(action.partId)) return state;
      // 2026-08-07 bug fix (still true under 52.1's canEquip): this used to
      // omit `state.protocols`, so a Lone flagship Flagship's +2 bonus
      // slots (real everywhere else — deriveStats, FleetPanel/
      // FleetOverlay's "has room" checks) were silently invisible to the
      // one gate that actually allows an EQUIP. The UI showed the slot as
      // available and let the player click it; this then rejected the
      // action with no feedback.
      // Iteration 52.1: canEquip subsumes both the old separate checks
      // here (slot-count room AND the frame's weapon cap) into the one
      // typed-slot feasibility predicate — see ship.ts. 59.3: ship.mark
      // threaded through so a marked ship's bonus universal slot is
      // actually usable, not just displayed.
      if (!canEquip(ship.frameId, ship.equipped, action.partId, ship.upgrades, state.protocols, state.commanderId, ship.mark))
        return state;
      // 2026-08-06: a commodity lot bought to inventory still can't ride on
      // a mercenary — it would be lost with the ship after one fight, same
      // guard BUY_COMMODITY_LOT used to carry when buy and equip were one
      // step. Equipping one also stamps the "bought at" column here now,
      // since that's when it actually starts occupying a slot.
      if (action.partId === COMMODITY_LOT_PART_ID) {
        if (ship.mercenary) return state;
        const fleet = mapShip(state.fleet, action.shipIndex, (s) => ({
          ...s,
          equipped: [...s.equipped, action.partId],
          commodityLotBoughtAtGlobalColumn: globalColumn(state.act, state.position?.col ?? 0),
        }));
        return { ...state, inventory: removeOnce(state.inventory, action.partId), fleet };
      }
      const fleet = mapShip(state.fleet, action.shipIndex, (s) => ({ ...s, equipped: [...s.equipped, action.partId] }));
      return { ...state, inventory: removeOnce(state.inventory, action.partId), fleet };
    }

    case 'UNEQUIP': {
      if (state.phase !== 'prep' && state.phase !== 'shop') return state;
      if (action.partId === COMMODITY_LOT_PART_ID) return state; // sold via SELL_COMMODITY_LOT, never unequipped to inventory
      const ship = state.fleet[action.shipIndex];
      if (!ship || !ship.equipped.includes(action.partId)) return state;
      // Iteration 58.3: the one genuinely new UNEQUIP guard — only ever
      // binds when action.partId is a reactor the rest of the loadout was
      // relying on (ship.ts's canUnequip). Every other removal was already
      // guaranteed legal (freeing a slot/draw can't make a layout worse).
      if (!canUnequip(ship.frameId, ship.equipped, action.partId)) return state;
      const equipped = removeOnce(ship.equipped, action.partId);
      // Re-tuned 2026-08-04: removing a hull part should cost max HP, not
      // current HP — a ship sitting on damage should absorb the reduction
      // out of that headroom first (3/4 -> 3/3, not 2/3), and only a
      // FULLY healed ship drops in lockstep (4/4 -> 3/3, since there's no
      // headroom to absorb it from). Re-equipping never restores damage on
      // its own (EQUIP just adds the part back), so a full unequip/re-equip
      // round trip lands back at max/max either way — that's the point:
      // swapping a hull part is an equipment change, not free healing, but
      // it should also never cost you HP you hadn't actually lost yet.
      const oldHp = deriveStats(ship.frameId, ship.equipped, ship.upgrades, undefined).hp;
      const newHp = deriveStats(ship.frameId, equipped, ship.upgrades, undefined).hp;
      const hullReduction = Math.max(0, oldHp - newHp);
      const damage = Math.min(Math.max(0, ship.damage - hullReduction), Math.max(0, newHp - 1));
      const fleet = mapShip(state.fleet, action.shipIndex, (s) => ({ ...s, equipped, damage }));
      return { ...state, fleet, inventory: [...state.inventory, action.partId] };
    }

    case 'ENGAGE': {
      if (state.phase !== 'prep' || !state.currentEnemy || state.currentCombatSeed === undefined) return state;
      const fleetStats = deriveFleetStats(state.fleet, state.commanderId, state.protocols);
      if (!fleetHasWeapon(fleetStats)) return state;

      const fleetInput = deriveFleetForCombat(state.fleet, state.commanderId, state.protocols);
      // The combat seed was already drawn (and stored) when this fight was
      // set up, not now — a reload before Engage can never reroll it (9.1).
      let combat = initCombat(
        fleetInput,
        state.currentEnemy,
        state.currentCombatSeed,
        state.targetingStance,
        {
          overspeedProtocols: hasProtocol(state.protocols, 'overspeed-protocols'),
          alphaDoctrine: hasProtocol(state.protocols, 'alpha-doctrine'),
        },
        // Iteration 48 (fleet orders): the Spymaster runs the battle on
        // better intelligence — 3 command points instead of 2, and
        // exclusive access to the Exploit weakness order. The engine never
        // reads commanderId itself; this is the one place the doctrine
        // becomes two resolved numbers/flags, same pattern the protocol
        // flags just above already use.
        {
          commandPoints: state.commanderId === 'spymaster' ? SPYMASTER_COMMAND_POINTS : BASE_COMMAND_POINTS,
          exploitEnabled: state.commanderId === 'spymaster',
          openingComputerBonus: state.commanderId === 'spymaster' ? SPYMASTER_FOREWARNED_COMPUTER : 0,
        },
      );
      // Neither fleet has a missile weapon — round 0 is a guaranteed no-op,
      // so skip straight past it rather than making the player click through.
      if (!hasMissilePhase(combat)) combat = advanceRound(combat);
      // The Engineer's banked over-repair (ship.overRepairBank) was already
      // folded into fleetInput's ablativeRemaining above — clear it here so
      // it can't carry into a second fight this bank was never meant for.
      const fleet = state.fleet.some((s) => s.overRepairBank)
        ? state.fleet.map((s) => (s.overRepairBank ? { ...s, overRepairBank: undefined } : s))
        : state.fleet;
      return { ...state, phase: 'combat', combat, fleet };
    }

    case 'ADVANCE_ROUND': {
      if (state.phase !== 'combat' || !state.combat || state.combat.winner) return state;
      return { ...state, combat: advanceRound(state.combat) };
    }

    case 'AUTO_RESOLVE': {
      if (state.phase !== 'combat' || !state.combat || state.combat.winner) return state;
      return { ...state, combat: runToEnd(state.combat) };
    }

    // Iteration 13: click an enemy ship in the theater to make every player
    // die fire at it while it lives; clicking the current priority again
    // clears it. No RNG — determinism untouched.
    case 'SET_PRIORITY_TARGET': {
      if (state.phase !== 'combat' || !state.combat || state.combat.winner) return state;
      const index = state.combat.priorityTargetIndex === action.index ? null : action.index;
      return { ...state, combat: setPriorityTarget(state.combat, index) };
    }

    case 'ISSUE_ORDER': {
      if (state.phase !== 'combat' || !state.combat) return state;
      return { ...state, combat: issueOrder(state.combat, action.order, action.targetIndex) };
    }

    case 'UNISSUE_ORDER': {
      if (state.phase !== 'combat' || !state.combat) return state;
      return { ...state, combat: unissueOrder(state.combat) };
    }

    case 'CONTINUE': {
      if (state.phase !== 'combat' || !state.combat || !state.combat.winner) return state;
      const { rng, nextCounter } = runRng(state);
      const outcome = combatOutcome(state.combat);

      // Iteration 18: fight-end stat attribution — per-ship kills, run-wide
      // damage totals. Computed once here, folded into every branch below.
      const fightStats = attributeFightStats(state.combat.log, state.fleet.length);
      const baseStats = state.runStats ?? emptyRunStats();

      if (outcome.winner === 'enemy') {
        const runStats = mergeRunStats(baseStats, fightStats);
        return { ...state, phase: 'defeat', pendingAmbushBonus: undefined, runStats, rngCounter: nextCounter() };
      }

      // 14.3: a win-conditional bonus from an event ambush (e.g. the
      // defector-pursuit's bounty) — the event resolver couldn't know the
      // fight's outcome at choice time, so it rides along on RunState until
      // now. Consumed (and cleared) regardless of which branch below pays
      // out, so it can never leak into an unrelated later fight.
      const ambushBonus = state.pendingAmbushBonus;
      // 49.4/49.5: the debt/colony chains' win-conditional side effect
      // beyond credits/a part (see AmbushBonus.chainEffect) — applied only
      // here, on an actual WIN, same "consumed regardless of outcome"
      // discipline as ambushBonus itself. Never reached on a boss fight
      // (an event ambush is always a plain 'combat' enemy), so only this
      // non-boss win branch needs it.
      const chainEffectPatch: Partial<RunState> =
        ambushBonus?.chainEffect === 'debt-cleared'
          ? { loanOutstanding: undefined }
          : ambushBonus?.chainEffect === 'colony-defended'
            ? { colonyStage: 2 }
            : {};

      const startingInventory = ambushBonus?.partId ? [...state.inventory, ambushBonus.partId] : [...state.inventory];
      // Iteration 28 (Ghost fleet protocol): a ship that would be destroyed
      // survives critically damaged instead — see settleFleetAfterFight's
      // own comment for why.
      const ghostFleet = hasProtocol(state.protocols, 'ghost-fleet-protocol');
      const settled = settleFleetAfterFight(state.fleet, outcome.playerShips, fightStats, startingInventory, {
        protocols: state.protocols,
        ghostFleet,
      });
      const survivingFleet = settled.survivingFleet;
      const salvagedParts = settled.salvagedParts;
      const lostShips = settled.lostShips;
      let inventory = settled.inventory;

      // Iteration 18: the run's cumulative record, after this win.
      const runStatsAfterWin = mergeRunStats(baseStats, fightStats, { won: true, lostShips });
      const col = state.position?.col ?? 0;
      const globalCol = globalColumn(state.act, col);
      const isBoss = state.position?.col === bossColumn(state.act);
      // 15.2: any won fight vents heat — winning leaves no one to report
      // your position. An interception win is the one exception: heat
      // resets to 0 outright rather than just stepping down by 1 (they
      // found you either way; the track restarts clean).
      const heatAfterWin = state.interceptionActive ? 0 : addHeat(state.heat, -1);

      // 2026-08-04: a boss fight — either one — fully heals the fleet on
      // the way out. There's no shop between here and whatever comes next
      // (the interlude, or the run's end), so a battered survivor would
      // otherwise carry that damage somewhere it can never be repaired.
      const bossHealedFleet = survivingFleet.map((s) => ({ ...s, damage: 0 }));

      if (isBoss && state.act === 2) {
        return withFlagshipRecoveryGate(state.fleet, {
          ...state,
          phase: 'victory',
          fleet: bossHealedFleet,
          inventory,
          combat: undefined,
          pendingAmbushBonus: undefined,
          heat: heatAfterWin,
          interceptionActive: undefined,
          runStats: runStatsAfterWin,
          rngCounter: nextCounter(),
        });
      }
      if (isBoss && state.act === 1) {
        // The act-1 boss pays like an elite at its column — the only boss
        // that pays, since the run continues. 2026-08-04: the interlude's
        // guaranteed upgrade pick (INTERLUDE_CHOOSE) is now the actual
        // reward for beating it, on top of these credits — a boss kill
        // used to be worth nothing more than a slightly bigger paycheck.
        const salvageRigsBonus = hasProtocol(state.protocols, 'salvage-rigs') ? 2 : 0;
        const creditsEarned = eliteReward(globalCol, state.act) + salvageRigsBonus;
        // Iteration 28 (Protocols): the act-1 boss's one-time augment draft
        // — drawn right here, the moment the boss is actually beaten (same
        // 9.1 discipline as a combat seed: a reload before the draft is
        // resolved can never reroll the offers). Continues through
        // withFlagshipRecoveryGate untouched if a recovery offer intervenes
        // first — every field on `next` besides `phase` survives that gate.
        const protocolOffers = drawProtocolOffers(rng, state.commanderId, bossHealedFleet);
        // Iteration 30: drawn immediately after, same rng stream, same 9.1
        // discipline — index i's counter answers offer i's tier.
        const protocolCounterOffers = drawCounterProtocols(rng);
        return withFlagshipRecoveryGate(state.fleet, {
          ...state,
          phase: 'interlude',
          fleet: bossHealedFleet,
          inventory,
          credits: state.credits + creditsEarned,
          combat: undefined,
          currentEnemy: undefined,
          pendingAmbushBonus: undefined,
          heat: heatAfterWin, // moot — INTERLUDE_CHOOSE resets to 0 regardless, kept for consistency
          interceptionActive: undefined,
          runStats: runStatsAfterWin,
          rngCounter: nextCounter(),
          protocolOffers,
          protocolCounterOffers,
        });
      }

      const isElite = state.currentEnemy?.id.endsWith('-elite') ?? false;
      // Cargo tags (15.1) only ever land on plain 'combat' nodes — elites,
      // the boss, the opener, and a heat-4 interception's stand-in fight
      // are all excluded here, though only the first two are structurally
      // possible (the others' positions never carry a `.cargo` anyway).
      const columns = actColumns(state.map, state.act);
      const node = state.position ? getNode(columns, state.position) : undefined;
      const cargoTag: CargoTag | undefined = !isElite && !state.interceptionActive ? node?.cargo : undefined;
      const baseReward = applyCargoReward(
        cargoTag,
        isElite ? eliteReward(globalCol, state.act) : winReward(globalCol, state.act),
      );
      // Iteration 35: an elite kill used to grant a random reaction card (or
      // +4cr if the hand was full); a command-ship cargo tag paid the same.
      // Now that cards are gone, both just pay flat credits — command stays
      // above elite's old fallback value so it doesn't collapse into being
      // mechanically identical to convoy's flat +4cr despite being rarer.
      const eliteOrCommandBonus = isElite ? ELITE_KILL_BONUS : cargoTag === 'command' ? COMMAND_CARGO_BONUS : 0;

      // Iteration 41: tracked separately from `inventory` purely so the
      // reward screen has something to point at — these parts arrive with
      // no pick and no lost-ship tie, so they'd otherwise vanish into the
      // inventory list unannounced.
      const foundParts: PartId[] = [];

      // A wreck-field cargo tag also drops a random 5-credit-tier part
      // straight into inventory, on top of its (reduced) credit payout.
      if (cargoTag === 'wreck') {
        const wreckPart = randomWreckPart(rng);
        inventory = [...inventory, wreckPart];
        foundParts.push(wreckPart);
      }

      // 2026-08-12 (player report): an elite used to guarantee its elevated
      // credit payout (eliteReward + ELITE_KILL_BONUS, below) AND the
      // captured-schematic part drop AND a 3-choice augment pick, all at
      // once — four rewards stacked onto one fight. The credits stay (an
      // elite SHOULD pay more than a plain win); the schematic and the
      // augment pick are now mutually exclusive, decided by one coin flip
      // off the same seeded rng stream every other reward draw here uses
      // (still fully reproducible from the run's seed — just a new draw in
      // the sequence, so elite-fight seeds diverge from pre-this-change
      // runs, same as any other reward-draw reordering in this codebase's
      // history). No lean toward either side: 50/50.
      const eliteGetsSchematic = isElite && rng() < 0.5;

      // Iteration 40 ("Captured schematic"): drops a weapon straight to
      // inventory, no pick needed, unlike the upgrade options below.
      // Currently always the one captured-plasma variant; more captured
      // weapons can join CAPTURED_SCHEMATIC_PART_ID's pool later without
      // touching this call site.
      if (eliteGetsSchematic) {
        inventory = [...inventory, CAPTURED_SCHEMATIC_PART_ID];
        foundParts.push(CAPTURED_SCHEMATIC_PART_ID);
      }

      // 'regen' heals damage after a win — per-upgrade-instance, so
      // duplicates stack. The Engineer commander adds a flat +1 heal on
      // top, stacking with regen.
      //
      // 2026-08-08 (iteration 46.2): POST_WIN_REPAIR adds a further flat
      // +1, universal — every commander, every ship, stacking with both
      // of the above. This is actRun.ts's old POST_WIN_REPAIR experiment
      // knob (used to gauge how much of act 1's difficulty was carried-
      // damage death-spiral rather than any single fight), now shipped as
      // a real rule. The difficulty ledger found a healthy budget fleet
      // beats every act-1 boss 87-96%, yet real runs die there at scale —
      // the gap is attrition compounding across 8-10 fights, not any one
      // fight being individually too hard. A small heal after every win
      // (not just a repair-yard visit) closes most of that gap without
      // touching a single enemy's stats.
      const engineerHeal = state.commanderId === 'engineer' ? 1 : 0;
      // The Engineer banks a heal that outran actual damage instead of
      // wasting it — including a ship that's already at 0 damage, where the
      // WHOLE heal is excess. Everyone else keeps the plain clamp (see
      // applyPostFightHeal's own no-op skip when there's nothing to heal).
      const healedFleet = survivingFleet.map((ship) =>
        applyPostFightHeal(ship, {
          regen: true,
          flat: engineerHeal + POST_WIN_REPAIR,
          bank: state.commanderId === 'engineer',
        }),
      );

      // 2026-08-06: was +2 — trimmed alongside the commodity-lot cap above.
      // This flat per-win bonus stacks with every fight in the run (8-10+
      // in a typical clear), so it was worth more in aggregate than its
      // small per-fight size suggested.
      const merchantBonus = state.commanderId === 'merchant' ? 1 : 0;
      const ambushBonusCredits = ambushBonus?.credits ?? 0;
      // Iteration 28 (Salvage rigs): +2cr flat on every combat won, this
      // fleet-won branch included (elite kills already earn eliteReward
      // here via `baseReward` above — this stacks on top the same way
      // merchantBonus does).
      const salvageRigsBonus = hasProtocol(state.protocols, 'salvage-rigs') ? 2 : 0;
      const creditsEarned = baseReward + merchantBonus + eliteOrCommandBonus + ambushBonusCredits + salvageRigsBonus;
      const credits = state.credits + creditsEarned;
      // Iteration 39 trimmed the elite pool to 2 entries (optics, salvage);
      // both were removed outright 2026-08-07 (see upgrades.ts), so elites
      // are back to a 3-option pick off the full remaining list — the
      // pre-39 default, restored now that nothing makes the elite pool
      // exclusive any more. 2026-08-12: only offered when the coin flip
      // above didn't already give the schematic — see its own comment.
      const upgradeOptions = isElite && !eliteGetsSchematic ? randomUpgradeIds(3, rng) : undefined;

      // The Spymaster's free intelligence, drawn from the same rng stream so
      // the whole run stays reproducible from its seed.
      const intelDraw = grantCommanderIntel(state, rng);

      const pendingReward: RewardSummary = {
        credits: creditsEarned,
        creditsTotal: credits,
        intelText: intelDraw.text,
        salvagedParts,
        lostShips,
        upgradeOptions,
        foundParts: foundParts.length > 0 ? foundParts : undefined,
      };

      return withFlagshipRecoveryGate(state.fleet, {
        ...intelDraw.state,
        ...chainEffectPatch,
        phase: 'reward',
        fleet: healedFleet,
        inventory,
        credits,
        combat: undefined,
        currentEnemy: undefined,
        pendingReward,
        pendingAmbushBonus: undefined,
        heat: heatAfterWin,
        interceptionActive: undefined,
        runStats: runStatsAfterWin,
        rngCounter: nextCounter(),
      });
    }

    case 'PICK_UPGRADE': {
      if (state.phase !== 'reward' || !state.pendingReward?.upgradeOptions) return state;
      if (!state.pendingReward.upgradeOptions.includes(action.upgradeId)) return state;
      const ship = state.fleet[action.shipIndex];
      if (!ship) return state;
      // 61.2: reject 'vectoring' onto a ship whose frame innate already
      // grants jink (Interceptor, Valkyrie) — a dead pick, same shared
      // guard withUpgrade itself no-ops on (ship.ts's upgradeRedundantOn).
      if (upgradeRedundantOn(ship, action.upgradeId)) return state;
      const fleet = mapShip(state.fleet, action.shipIndex, (s) => withUpgrade(s, action.upgradeId, state.commanderId));
      return {
        ...state,
        fleet,
        pendingReward: { ...state.pendingReward, upgradeOptions: undefined },
      };
    }

    case 'LEAVE_REWARD': {
      if (state.phase !== 'reward') return state;
      if (state.pendingReward?.upgradeOptions) return state; // must resolve the upgrade pick first
      return { ...state, phase: 'map', pendingReward: undefined };
    }

    case 'INTERLUDE_CHOOSE': {
      if (state.phase !== 'interlude') return state;
      if (!state.fleet[action.shipIndex]) return state;
      const { rng, nextCounter } = runRng(state);
      // 2026-08-04: the boss's actual reward — the fleet is already fully
      // healed by CONTINUE before this phase is even reached (see the boss
      // branches above), and credits were already paid then too. The one
      // thing still pending here is which ship gets it: a guaranteed random
      // elite-pool upgrade, no longer one option competing against a heal
      // or a flat credit bonus that used to make boss kills feel optional
      // to actually build around.
      // Draws from the full remaining upgrade list, same as a normal elite
      // kill above (see randomUpgradeIds's comment in upgrades.ts).
      const upgradeId = randomUpgradeIds(1, rng)[0];
      const fleet = mapShip(state.fleet, action.shipIndex, (s) => withUpgrade(s, upgradeId, state.commanderId));
      // Into act 2: a fresh sector — position/visited/fled/fog reset, the
      // boss dossier resets (a second reveal purchase awaits). Iteration
      // 28: the protocol draft (offers already drawn, back at CONTINUE)
      // comes next, not the map directly — it's a second boss-reward step,
      // not a replacement for this one.
      return {
        ...state,
        phase: 'protocol-draft',
        act: 2,
        fleet,
        position: null,
        visited: [],
        fled: [],
        visionCol: 0,
        revealedNodes: [],
        bossRevealed: false,
        heat: 0, // 15.2: crossing the sector border shakes pursuit, same as the fog reset
        rngCounter: nextCounter(),
      };
    }

    case 'PROTOCOL_CHOOSE': {
      if (state.phase !== 'protocol-draft' || !state.protocolOffers) return state;
      const chosen = state.protocolOffers[action.index];
      if (!chosen) return state;
      const protocols = [...(state.protocols ?? []), chosen];
      // Iteration 30: same index into protocolCounterOffers — absent on a
      // legacy save from before counters existed (drafted before this
      // iteration shipped), which is fine: the run simply finishes with no
      // counter, exactly as it would have before this iteration existed.
      const counterProtocol = state.protocolCounterOffers?.[action.index];

      // 47.5e: shared once — every branch below records the pick the same
      // way, differing only in what else (if anything) the specific
      // protocol does immediately.
      const resolved: RunState = {
        ...state,
        phase: 'map',
        protocols,
        protocolOffers: undefined,
        counterProtocol,
        protocolCounterOffers: undefined,
      };

      // Lone flagship's immediate effect: scrap every escort right now, for
      // half its frame value — the permanent +2 slots/+2 HP on the Flagship
      // itself is a passive derive-time bonus (see ship.ts), not applied
      // here. No mercenaries can be present at this point (they're always
      // stripped from the fleet by the end of the fight that led here — see
      // CONTINUE) but the filter stays explicit rather than assumed,
      // matching the "mercenaries are never touched by a protocol" rule
      // stated in plans/iteration-28.md.
      if (chosen === 'lone-flagship') {
        const escorts = state.fleet.filter((s) => s.frameId !== 'cruiser' && !s.mercenary);
        const scrapValue = escorts.reduce((sum, s) => sum + hullScrapValue(s.frameId), 0);
        const fleet = state.fleet.filter((s) => s.frameId === 'cruiser' || s.mercenary);
        return { ...resolved, fleet, credits: state.credits + scrapValue };
      }

      // Deep-space relays' immediate effect: the fog high-water mark jumps
      // straight to the far end of act 2 — every node type from here to the
      // boss is visible from this moment on.
      if (chosen === 'deep-space-relays') {
        // PROTOCOL_CHOOSE only ever resolves in act 2 (protocols are an
        // act-2-only draft — see the type's own comment); state.act is
        // already 2 by the time this fires (INTERLUDE_CHOOSE sets it
        // before entering the 'protocol-draft' phase this action lives
        // in), so laneColumns(state.act) here always means act 2's 12,
        // not act 1's 10.
        return { ...resolved, visionCol: laneColumns(state.act) };
      }

      // Every other protocol (silver stat value, or a gold/prismatic whose
      // whole effect is a passive stat/pricing/combat hook read off
      // RunState.protocols elsewhere) needs nothing more than recording the
      // pick.
      return resolved;
    }

    case 'RESOLVE_FLAGSHIP_RECOVERY': {
      if (state.phase !== 'flagship-recovery' || !state.pendingFlagshipRecovery || !state.flagshipRecoveryResumePhase) {
        return state;
      }
      const { cost, shipName, kills, fightsSurvived } = state.pendingFlagshipRecovery;
      const resumePhase = state.flagshipRecoveryResumePhase;
      if (!action.recover) {
        return { ...state, phase: resumePhase, pendingFlagshipRecovery: undefined, flagshipRecoveryResumePhase: undefined };
      }
      if (state.credits < cost) return state; // can't afford — UI should already disable this
      // Salvage crews rebuild the hull, not what was riding on it: fresh
      // (empty) loadout, no upgrade — but the same name and combat record,
      // since it's the same ship, recovered, not a replacement.
      const recovered: PlayerShipState = {
        frameId: 'cruiser',
        equipped: [],
        damage: 0,
        upgrades: [],
        name: shipName,
        kills,
        fightsSurvived,
      };
      return {
        ...state,
        phase: resumePhase,
        fleet: [recovered, ...state.fleet],
        credits: state.credits - cost,
        pendingFlagshipRecovery: undefined,
        flagshipRecoveryResumePhase: undefined,
      };
    }

    // 47.6: the shop actions all delegate to reducer/shop.ts's single
    // handleShopAction dispatcher — see that file's header for why this
    // split exists and what stays here vs. there. 59.2/59.3 replaced
    // 52.5's REFIT_SHIP with UPGRADE_MARK in the set.
    case 'BUY_PART':
    case 'SELL_PART':
    case 'BUY_SHIP':
    case 'UPGRADE_MARK':
    case 'SCUTTLE_SHIP':
    case 'BUY_COMMODITY_LOT':
    case 'SELL_COMMODITY_LOT':
    case 'BUY_MERCENARY':
    case 'BUY_REPAIR':
    case 'LEAVE_SHOP':
      return handleShopAction(state, action);

    case 'SET_TARGETING_STANCE': {
      // Iteration 9.4: set on the prep screen, persists between fights
      // until changed — a RunState field, not a per-combat one.
      if (state.phase !== 'prep') return state;
      return { ...state, targetingStance: action.stance };
    }

    case 'USE_ACTIVE': {
      if (state.phase !== 'combat' || !state.combat) return state;
      const combat = useActive(state.combat, action.shipIndex, action.abilityIndex);
      return { ...state, combat };
    }

    case 'REPAIR_CHOOSE': {
      // The choosing sub-state: arrived (repairUpgradeOptions drawn), not
      // yet resolved (repairSummary still undefined). A second dispatch
      // once resolved is a no-op — same "no double-dispatch" rule as
      // EVENT_CHOOSE below.
      if (state.phase !== 'repair' || state.repairSummary !== undefined) return state;

      if (action.choice === 'full') {
        // Iteration 28 (Rapid drydocks): grants the same flat +1 over-repair
        // bank the Engineer doctrine gets — reuses that exact mechanism
        // (applyRepairBanking's `flatBank` path) rather than inventing a
        // second one; the two stack if somehow both are ever true (an
        // Engineer who also drafts this protocol just banks from two
        // sources that both cap at the same OVER_REPAIR_CAP).
        const bankFlat = state.commanderId === 'engineer' || hasProtocol(state.protocols, 'rapid-drydocks');
        const { fleet, totalRepaired } = repairFleet(state.fleet, bankFlat);
        return { ...state, fleet, repairSummary: repairSummaryText(totalRepaired, state.fleet.length) };
      }

      // Overhaul: no healing — attach one of the 3 pre-drawn upgrades to a
      // chosen ship instead. Locked out once every ship already carries a
      // full complement of upgrades (per-ship cap — see everyShipAtUpgradeCap).
      if (!state.repairUpgradeOptions?.includes(action.upgradeId)) return state;
      if (everyShipAtUpgradeCap(state.fleet, state.commanderId)) return state;
      const ship = state.fleet[action.shipIndex];
      if (!ship) return state;
      // 61.2: same reject as PICK_UPGRADE above — see its comment.
      if (upgradeRedundantOn(ship, action.upgradeId)) return state;
      const fleet = mapShip(state.fleet, action.shipIndex, (s) => withUpgrade(s, action.upgradeId, state.commanderId));
      const label = playerShipLabel(state.fleet, action.shipIndex);
      return {
        ...state,
        fleet,
        repairSummary: `Overhaul complete — ${getUpgrade(action.upgradeId).name} fitted to ${label}. No repairs made.`,
      };
    }

    case 'LEAVE_REPAIR': {
      if (state.phase !== 'repair' || state.repairSummary === undefined) return state;
      return { ...state, phase: 'map', repairSummary: undefined, repairUpgradeOptions: undefined };
    }

    case 'EVENT_CHOOSE': {
      if (state.phase !== 'event' || !state.currentEvent) return state;
      if (state.currentEvent.outcomeText !== undefined) return state; // already resolved — no double-dispatch
      const def = getEvent(state.currentEvent.eventId);
      const option = def.options[action.choiceIndex];
      if (!option) return state;
      if (option.requirement && !meetsRequirement(option.requirement, state)) return state;
      if (option.chooseShip && (action.shipIndex === undefined || !state.fleet[action.shipIndex])) return state;
      if (option.choosePart && (action.partId === undefined || !state.inventory.includes(action.partId))) return state;

      const { rng, nextCounter } = runRng(state);
      const {
        state: nextState,
        outcomeText,
        ambushEnemy,
        ambushBonus,
      } = resolveEventChoice(state.currentEvent.eventId, action.choiceIndex, state, rng, {
        shipIndex: action.shipIndex,
        partId: action.partId,
      });
      return {
        ...nextState,
        currentEvent: { ...state.currentEvent, outcomeText, ambushEnemy, ambushBonus },
        rngCounter: nextCounter(),
      };
    }

    case 'EVENT_CONTINUE': {
      if (state.phase !== 'event' || !state.currentEvent) return state;
      const { ambushEnemy, ambushBonus } = state.currentEvent;
      if (ambushEnemy) {
        const { rng, nextCounter } = runRng(state);
        return {
          ...state,
          phase: 'prep',
          currentEvent: undefined,
          currentEnemy: withCounterProtocol(ambushEnemy, state), // iteration 30: an act-2 event-ambush is still a fight
          pendingAmbushBonus: ambushBonus,
          currentCombatSeed: drawCombatSeed(rng),
          rngCounter: nextCounter(),
        };
      }
      return { ...state, phase: 'map', currentEvent: undefined };
    }

    case 'NEW_RUN':
      return initialRunState({ seed: action.seed, mode: action.mode, dailyDate: action.dailyDate });

    // Pure state replacement — the landing screen's slot picker (18). No
    // rng, no validation beyond what loadRun already did.
    case 'LOAD_STATE':
      return action.state;

    default:
      return state;
  }
}
