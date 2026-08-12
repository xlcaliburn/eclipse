// Iteration 45.2: the headless agent. Instead of hand-mirroring the run
// loop (the old actRun.ts's approach — an approximate world that silently
// drifted from the real game the moment rarity gating, act 2, or the
// Foundry landed), this dispatches REAL RunActions against the REAL
// `runReducer`, starting from a REAL `initialRunState`. The reducer draws
// the rarity-gated shops, schedules escalations, runs boss auto-heal,
// offers the protocol draft — nothing here reimplements any of that, so
// nothing here can drift from it. A future reducer action is either
// automatically covered (it lives inside a phase this file already
// handles) or fails LOUD: the exhaustiveness table below is a compile
// error the moment a new RunAction variant isn't classified.
import type { CommanderId } from '../../src/game/commanders';
import { getFrame, PURCHASABLE_FRAME_IDS } from '../../src/game/frames';
import { getEvent, meetsRequirement } from '../../src/game/events';
import { actColumns, bossColumn, getNode, globalColumn, reachableNodes } from '../../src/game/map';
import type { MapNode } from '../../src/game/map';
import { COMMODITY_LOT_PART_ID } from '../../src/game/parts';
import { hasProtocol } from '../../src/game/protocols';
import {
  canUpgradeMark,
  commodityLotBuyCost,
  commodityLotCap,
  eliteReward,
  fleetCap as commanderFleetCap,
  frameCost,
  initialRunState,
  markUpgradeCost,
  mercenaryCost,
  partCost,
  REPAIR_COST_PER_HP,
  runReducer,
  winReward,
} from '../../src/game/reducer';
import type { RunAction } from '../../src/game/reducer';
import { mulberry32 } from '../../src/game/rng';
import { canEquip, deriveStats, upgradeRedundantOn } from '../../src/game/ship';
import type { PartId, PlayerShipState, RunState } from '../../src/game/types';
import type { PolicyConfig } from './policy';
import { COMMANDER_ROUTE_BIAS, DEFAULT_PROTOCOL_INDEX } from './policy';

// --- Exhaustiveness guard --------------------------------------------------
// A compile error the moment a new RunAction variant is added without a
// line here — the exact bug class this whole rebuild exists to prevent
// (see plans/iteration-45.md's action-by-action policy table). NEW_RUN and
// LOAD_STATE are meta-actions the agent never dispatches (it starts from
// initialRunState directly and never reloads mid-run).
const HANDLED_ACTIONS: Record<RunAction['type'], true> = {
  CHOOSE_COMMANDER: true,
  PICK_NODE: true,
  EQUIP: true,
  UNEQUIP: true,
  ENGAGE: true,
  ADVANCE_ROUND: true,
  AUTO_RESOLVE: true,
  SET_PRIORITY_TARGET: true,
  // Iteration 48 (fleet orders): a purely optional player choice — never
  // dispatched by the floor agent, same as it's never issued by
  // AUTO_RESOLVE/runToEnd in the real engine. Every commander's simulated
  // clear rate is measured with 0 orders ever spent, by design (see
  // plans/iteration-48.md's "Determinism, auto-resolve, and the balance
  // floor" section) — accounted for here, not dispatched anywhere below.
  ISSUE_ORDER: true,
  CONTINUE: true,
  PICK_UPGRADE: true,
  LEAVE_REWARD: true,
  INTERLUDE_CHOOSE: true,
  PROTOCOL_CHOOSE: true,
  RESOLVE_FLAGSHIP_RECOVERY: true,
  BUY_PART: true,
  SELL_PART: true,
  BUY_SHIP: true,
  UPGRADE_MARK: true,
  SCUTTLE_SHIP: true,
  SET_TARGETING_STANCE: true,
  BUY_COMMODITY_LOT: true,
  SELL_COMMODITY_LOT: true,
  BUY_MERCENARY: true,
  BUY_REPAIR: true,
  USE_ACTIVE: true,
  LEAVE_SHOP: true,
  LEAVE_REPAIR: true,
  EVENT_CHOOSE: true,
  EVENT_CONTINUE: true,
  REPAIR_CHOOSE: true,
  NEW_RUN: true, // meta — never dispatched by the agent
  LOAD_STATE: true, // meta — never dispatched by the agent
};
void HANDLED_ACTIONS;

export interface AgentRunOutcome {
  seed: number;
  policySeed: number;
  commanderId: CommanderId | undefined;
  // True when a specific commander was requested but wasn't among the 3
  // (of 5) offered this seed — commanderChoices is itself seeded, so a
  // fixed target isn't always reachable. The caller should not count a
  // skipped run toward that commander's sample.
  skipped: boolean;
  won: boolean;
  act: 1 | 2;
  diedAt: { globalCol: number; type: string } | null;
  fightsWon: number;
  actionsDispatched: number;
  // Liveness guard (45.6): true if any dispatch this run believed legal
  // was rejected by the reducer (returned state unchanged) — a policy/
  // reducer model mismatch, the exact bug class this rebuild exists to
  // catch. A real run must never produce this.
  rejectedDispatch: boolean;
  rejectedAction?: string;
}

const ACTION_CEILING = 5000; // generous — a real run is on the order of 100-300 actions

// Dispatches and asserts the reducer actually accepted it (state changed
// object identity — every reducer guard's reject path is `return state;`
// verbatim, so reference equality is a reliable "was this legal" signal).
function dispatch(state: RunState, action: RunAction, tracker: { count: number; rejected: string | null }): RunState {
  tracker.count++;
  const next = runReducer(state, action);
  if (next === state && tracker.rejected === null) tracker.rejected = action.type;
  return next;
}

function damageRatio(state: RunState): number {
  let hp = 0;
  let damage = 0;
  for (const ship of state.fleet) {
    hp += deriveStats(ship.frameId, ship.equipped, ship.upgrades, state.protocols).hp;
    damage += ship.damage;
  }
  return hp > 0 ? damage / hp : 0;
}

function flagshipIndex(fleet: PlayerShipState[]): number {
  const i = fleet.findIndex((s) => s.frameId === 'cruiser');
  return i === -1 ? 0 : i;
}

// --- Route choice -----------------------------------------------------
// Ported from the old actRun.ts's chooseNode, generalized from a
// commander-only bias switch to (archetype config + commander) both
// layering on the same shared floor.
type RouteType = 'combat' | 'elite' | 'shop' | 'shipyard' | 'repair' | 'event' | 'opener' | 'boss';

function scoreNode(node: MapNode, ratio: number, config: PolicyConfig, commanderId: CommanderId | undefined): number {
  let base: number;
  switch (node.type as RouteType) {
    case 'repair':
      base = ratio > 0.4 ? 100 : 20;
      break;
    case 'shop':
    case 'shipyard':
      base = 80;
      break;
    case 'combat':
      base = 50;
      break;
    case 'elite':
      base = ratio < 0.3 ? 35 : 5;
      break;
    case 'event':
      base = ratio > 0.15 ? 55 : 40;
      break;
    default:
      base = 30; // opener/boss — practically always the sole candidate anyway
  }
  const archetypeBias = (config.routeBias as Partial<Record<string, number>>)[node.type] ?? 0;
  const commanderBias = commanderId
    ? ((COMMANDER_ROUTE_BIAS[commanderId] as Partial<Record<string, number>> | undefined)?.[node.type] ?? 0)
    : 0;
  return base + archetypeBias + commanderBias;
}

function pickNode(state: RunState, config: PolicyConfig, commanderId: CommanderId | undefined, rng: () => number): MapNode {
  const columns = actColumns(state.map, state.act);
  const shortcuts = state.act === 2 ? (state.map.act2Shortcuts ?? []) : [];
  // `reachableNodes` doesn't know about `fled` — a warp-lane shortcut
  // (iteration 32) marks the column it skipped as fled, and PICK_NODE's
  // own guard rejects re-picking any of those nodes. Filter them out here
  // rather than relying on the reducer to reject a candidate this function
  // should never have offered.
  const options = reachableNodes(columns, state.position, shortcuts).filter(
    (n) => !state.fled.some((f) => f.col === n.col && f.row === n.row),
  );
  const ratio = damageRatio(state);
  const best = options.reduce((a, b) => (scoreNode(b, ratio, config, commanderId) > scoreNode(a, ratio, config, commanderId) ? b : a), options[0]);
  // Same 15% routing noise the old sim used — a real player doesn't always
  // take the theoretically-best node either.
  return rng() < 0.15 ? options[Math.floor(rng() * options.length)] : best;
}

// --- Shop --------------------------------------------------------------

// 52.1: delegates to the shared canEquip predicate — the only thing left
// here is the mercenary/commodity-lot guard, which is agent-policy logic,
// not a slot-legality rule (a mercenary CAN physically carry a lot by the
// typed-slot math; it's just never allowed to, same as EQUIP's own guard).
function canFit(ship: PlayerShipState, partId: PartId, protocols: RunState['protocols'], commanderId: CommanderId | undefined): boolean {
  if (ship.mercenary && partId === COMMODITY_LOT_PART_ID) return false;
  return canEquip(ship.frameId, ship.equipped, partId, ship.upgrades, protocols, commanderId, ship.mark);
}

function buyAndEquipFromOffers(state: RunState, config: PolicyConfig, commanderId: CommanderId | undefined, tracker: { count: number; rejected: string | null }): RunState {
  let s = state;
  for (const wantId of config.partPriority) {
    for (;;) {
      const offerIndex = s.shopOffers?.indexOf(wantId) ?? -1;
      if (offerIndex === -1) break; // not currently in stock — try the next priority item
      const cost = partCost(wantId, commanderId, s.protocols);
      const fittingShip = s.fleet.findIndex((sh) => canFit(sh, wantId, s.protocols, commanderId));
      // Skip an unfittable item rather than let credits rot in inventory
      // forever — 2026-08-08: used to buy anyway if this archetype hoarded
      // stat-ladder parts for a later Foundry fuse (shipyard-only); the
      // Foundry is gone, so nothing hoards any more.
      if (fittingShip === -1) break;
      if (cost > s.credits) break; // can't afford this tier right now — move to the next priority item
      s = dispatch(s, { type: 'BUY_PART', offerIndex }, tracker);
      if (fittingShip !== -1) {
        s = dispatch(s, { type: 'EQUIP', shipIndex: fittingShip, partId: wantId }, tracker);
      }
      // Loop again — the same priority item might be in stock more than
      // once is impossible (drawShopOffers is unique), but a DIFFERENT
      // ship might now have room for it after the first purchase filled a
      // different one; harmless either way since offerIndex re-resolves.
      break;
    }
  }
  return s;
}

function buyHull(state: RunState, config: PolicyConfig, commanderId: CommanderId | undefined, tracker: { count: number; rejected: string | null }): RunState {
  let s = state;
  const cap = Math.min(config.fleetCap, commanderFleetCap(commanderId, s.protocols));
  for (const frameId of config.framePriority) {
    if (s.fleet.length >= cap) break;
    if (!s.shopFrameOffers?.includes(frameId)) continue;
    // Iteration 52: generalized off the old hardcoded 'dreadnought' check
    // — legendary hulls are act-2-and-shipyard-only now (see
    // reducer/shop.ts's drawFrameOffers). Belt-and-suspenders only:
    // drawFrameOffers already never puts one in shopFrameOffers outside
    // that gate, so this never actually fires in practice today, but
    // keeps this function correct if a legendary id is ever added to a
    // framePriority list.
    if (getFrame(frameId).rarity === 'legendary' && (s.act === 1 || s.shopKind !== 'shipyard')) continue;
    const cost = frameCost(getFrame(frameId).cost, frameId, commanderId, s.protocols, s.shopKind);
    if (cost > s.credits) continue;
    s = dispatch(s, { type: 'BUY_SHIP', frameId }, tracker);
    break; // one hull per shop visit is plenty for the fixture-scale runs this drives
  }
  return s;
}

// Iteration 59.5 (hull marks, replacing 52.5's refitHull): a simple
// heuristic so the sink is measured rather than invisible — at fleet cap
// (buyHull above already covers "grow the fleet" when there's room) with
// spare credits, upgrade the mark of the cheapest hull aboard that still
// has room to grow (mark < III). "Cheapest hull" (by frame cost) is the
// one with the least sunk investment, so it's the natural one to spend a
// mark on first — same ordering refitHull used, kept dumb and honest per
// the spec's own instruction (no lookahead on which hull most benefits
// from the extra universal slot; the agent already buys parts into
// whatever room it has, so a filled slot is its normal follow-on
// behavior regardless of which ship got it).
function upgradeMark(state: RunState, config: PolicyConfig, commanderId: CommanderId | undefined, tracker: { count: number; rejected: string | null }): RunState {
  const cap = Math.min(config.fleetCap, commanderFleetCap(commanderId, state.protocols));
  if (state.fleet.length < cap) return state; // buyHull already covers this case
  const candidates = state.fleet
    .map((ship, index) => ({ ship, index }))
    .filter(({ ship }) => canUpgradeMark(state.shopKind, ship))
    .sort((a, b) => getFrame(a.ship.frameId).cost - getFrame(b.ship.frameId).cost);
  for (const { ship, index } of candidates) {
    const targetMark = ((ship.mark ?? 1) + 1) as 2 | 3;
    const cost = markUpgradeCost(ship.frameId, targetMark, commanderId, state.protocols);
    if (cost > state.credits) continue;
    return dispatch(state, { type: 'UPGRADE_MARK', shipIndex: index }, tracker);
  }
  return state;
}

function buyRepairs(state: RunState, config: PolicyConfig, tracker: { count: number; rejected: string | null }): RunState {
  let s = state;
  if (damageRatio(s) < config.repairThreshold) return s;
  s.fleet.forEach((ship, i) => {
    if (ship.damage <= 0) return;
    const cost = ship.damage * REPAIR_COST_PER_HP;
    if (cost > s.credits) return;
    s = dispatch(s, { type: 'BUY_REPAIR', shipIndex: i }, tracker);
  });
  return s;
}

function buyCommodityLot(state: RunState, commanderId: CommanderId | undefined, tracker: { count: number; rejected: string | null }): RunState {
  let s = state;
  const cost = commodityLotBuyCost(commanderId);
  const cap = commodityLotCap(commanderId);
  for (;;) {
    const owned = s.fleet.filter((sh) => sh.equipped.includes(COMMODITY_LOT_PART_ID)).length + s.inventory.filter((id) => id === COMMODITY_LOT_PART_ID).length;
    if (owned >= cap || cost > s.credits) break;
    s = dispatch(s, { type: 'BUY_COMMODITY_LOT' }, tracker);
    // 52.1: a plain length check isn't enough any more — cargo is
    // universal-only, so a ship can have room by COUNT while having zero
    // free universal slots (every one already spent on overflow from
    // another category). canFit (== canEquip) is the real answer.
    const carrier = s.fleet.findIndex((sh) => canFit(sh, COMMODITY_LOT_PART_ID, s.protocols, commanderId));
    if (carrier !== -1) s = dispatch(s, { type: 'EQUIP', shipIndex: carrier, partId: COMMODITY_LOT_PART_ID }, tracker);
    else break; // nowhere to carry it — stop rather than buy an uncarryable lot
  }
  return s;
}

function sellCommodityLots(state: RunState, tracker: { count: number; rejected: string | null }): RunState {
  const here = globalColumn(state.act, state.position?.col ?? 0);
  const eligible = state.fleet.some(
    (s) => s.equipped.includes(COMMODITY_LOT_PART_ID) && s.commodityLotBoughtAtGlobalColumn !== undefined && here > s.commodityLotBoughtAtGlobalColumn,
  );
  return eligible ? dispatch(state, { type: 'SELL_COMMODITY_LOT' }, tracker) : state;
}

function buyMercenary(state: RunState, config: PolicyConfig, commanderId: CommanderId | undefined, tracker: { count: number; rejected: string | null }): RunState {
  // Only at the last lane-column shop before the boss — a policy choice
  // (the reducer itself doesn't gate this by node position), matching "a
  // one-fight rental for the hardest fight of the act," not a routine buy.
  if (state.position?.col !== bossColumn(state.act) - 1) return state;
  const cost = mercenaryCost(commanderId);
  if (cost > state.credits) return state;
  if (state.fleet.length >= config.fleetCap + 1) return state; // a mercenary is a bonus hull, not a fleet-cap slot — +1 headroom
  return dispatch(state, { type: 'BUY_MERCENARY' }, tracker);
}

// 2026-08-08: `fuseForFoundry`/`buyShipyardUpgrade` removed — the Foundry
// (permanent stat fuses) and the shipyard's separate purchasable upgrade
// were both removed from the game entirely. A shipyard visit now means a
// (rare-or-better, 59.1) hull purchase — see `buyHull` below — a mark
// upgrade (59.5, when there's no room to grow) — and repairs.
function runShop(state: RunState, config: PolicyConfig, commanderId: CommanderId | undefined, tracker: { count: number; rejected: string | null }): RunState {
  let s = sellCommodityLots(state, tracker);
  if (s.shopKind === 'shipyard') {
    s = buyHull(s, config, commanderId, tracker);
    s = upgradeMark(s, config, commanderId, tracker);
    s = buyRepairs(s, config, tracker);
  } else {
    s = buyAndEquipFromOffers(s, config, commanderId, tracker);
    s = buyHull(s, config, commanderId, tracker);
    s = buyRepairs(s, config, tracker);
    s = buyCommodityLot(s, commanderId, tracker);
  }
  s = buyMercenary(s, config, commanderId, tracker);
  return dispatch(s, { type: 'LEAVE_SHOP' }, tracker);
}

// --- Combat --------------------------------------------------------------

// 51.3: withdraw is gone — every fight the agent enters now resolves to a
// winner (AUTO_RESOLVE/runToEnd) and then CONTINUEs. This removed the
// agent's old bail-out valve (`config.withdrawHpRatio`, a going-badly
// heuristic that used to fire WITHDRAW instead); see plans/iteration-51.md's
// 51.3/51.4 for the measured cost of losing it.
function runCombat(state: RunState, tracker: { count: number; rejected: string | null }): RunState {
  let s = dispatch(state, { type: 'ENGAGE' }, tracker);
  if (s.phase !== 'combat' || !s.combat) return s; // shouldn't happen — see the fleetHasWeapon note in agent.ts's header comment
  if (s.combat && !s.combat.winner) {
    s = dispatch(s, { type: 'AUTO_RESOLVE' }, tracker);
  }
  return dispatch(s, { type: 'CONTINUE' }, tracker);
}

// --- Event -----------------------------------------------------------------

function runEventChoice(state: RunState, tracker: { count: number; rejected: string | null }): RunState {
  const def = getEvent(state.currentEvent!.eventId);
  const index = def.options.findIndex((opt) => {
    if (opt.requirement && !meetsRequirement(opt.requirement, state)) return false;
    if (opt.choosePart && state.inventory.length === 0) return false;
    if (opt.chooseShip && state.fleet.length === 0) return false;
    return true;
  });
  const chosen = index === -1 ? 0 : index; // -1 is defensive only — every event has at least one always-legal option
  const option = def.options[chosen];
  const action: RunAction = {
    type: 'EVENT_CHOOSE',
    choiceIndex: chosen,
    shipIndex: option?.chooseShip ? 0 : undefined,
    partId: option?.choosePart ? state.inventory[0] : undefined,
  };
  return dispatch(state, action, tracker);
}

// --- The step machine --------------------------------------------------

// `map` is deliberately absent from this switch — the caller (the run
// loop below) handles it directly via `pickNodeAction`, which calls
// `pickNode` exactly once. `pickNode` consumes `rng()` for its 15% routing
// noise, so calling it twice per pick (once for `.row`, once for `.col`)
// would silently double-draw and break determinism — worth stating
// explicitly since it's the one phase this function does NOT own.
function step(state: RunState, config: PolicyConfig, commanderId: CommanderId | undefined, rng: () => number, tracker: { count: number; rejected: string | null }): RunState {
  switch (state.phase) {
    case 'prep':
      return runCombat(state, tracker);
    case 'combat':
      // Only reachable if ENGAGE itself silently no-op'd (no weapon) —
      // runCombat handles the normal path start-to-finish in one call.
      return dispatch(state, { type: 'AUTO_RESOLVE' }, tracker);
    case 'reward': {
      if (state.pendingReward?.upgradeOptions) {
        // PICK_UPGRADE always targets the Flagship here, which never has an
        // innate-jink frame, so 61.2's redundancy guard is unreachable in
        // practice today — filtered anyway (rather than relying on that
        // staying true) so this policy can't silently start tripping
        // rejectedDispatch if the target ever changes. Falls back to the
        // full option list only in the impossible case every option is
        // somehow redundant on this ship.
        const shipIndex = flagshipIndex(state.fleet);
        const ship = state.fleet[shipIndex];
        const options = state.pendingReward.upgradeOptions.filter((id) => !ship || !upgradeRedundantOn(ship, id));
        const pool = options.length > 0 ? options : state.pendingReward.upgradeOptions;
        const upgradeId = pool[Math.floor(rng() * pool.length)];
        return dispatch(state, { type: 'PICK_UPGRADE', upgradeId, shipIndex }, tracker);
      }
      return dispatch(state, { type: 'LEAVE_REWARD' }, tracker);
    }
    case 'shop':
      return runShop(state, config, commanderId, tracker);
    case 'repair':
      if (state.repairSummary === undefined) return dispatch(state, { type: 'REPAIR_CHOOSE', choice: 'full' }, tracker);
      return dispatch(state, { type: 'LEAVE_REPAIR' }, tracker);
    case 'event':
      if (!state.currentEvent) return state; // defensive — unreachable in practice
      if (state.currentEvent.outcomeText === undefined) return runEventChoice(state, tracker);
      return dispatch(state, { type: 'EVENT_CONTINUE' }, tracker);
    case 'interlude':
      return dispatch(state, { type: 'INTERLUDE_CHOOSE', shipIndex: flagshipIndex(state.fleet) }, tracker);
    case 'protocol-draft':
      return dispatch(state, { type: 'PROTOCOL_CHOOSE', index: DEFAULT_PROTOCOL_INDEX }, tracker);
    case 'flagship-recovery': {
      const cost = state.pendingFlagshipRecovery?.cost ?? Infinity;
      return dispatch(state, { type: 'RESOLVE_FLAGSHIP_RECOVERY', recover: state.credits >= cost }, tracker);
    }
    case 'commander':
    case 'map': // handled by the caller directly — see the comment above this function
    case 'victory':
    case 'defeat':
      return state; // commander is resolved once before the loop starts; victory/defeat are terminal
  }
}

// Picking the node twice inside the `map` case above (once per property) is
// wasteful but harmless — pickNode is pure/deterministic given the same
// rng draws consumed identically both times only if rng() isn't called
// inside it more than once per call... it IS (the 15% noise roll), which
// would double-consume policyRng. Replaced by a corrected single-call
// version below; the map case is patched to use it.
function pickNodeAction(state: RunState, config: PolicyConfig, commanderId: CommanderId | undefined, rng: () => number): RunAction {
  const node = pickNode(state, config, commanderId, rng);
  return { type: 'PICK_NODE', row: node.row, col: node.col };
}

export function simulateRunWithAgent(
  seed: number,
  policySeed: number,
  config: PolicyConfig,
  desiredCommanderId: CommanderId | undefined,
): AgentRunOutcome {
  const rng = mulberry32(policySeed);
  let state = initialRunState({ seed });
  const tracker = { count: 0, rejected: null as string | null };

  // Commander pick: deterministic, not policy-randomized — pick the
  // desired commander if this seed's 3-of-5 draw happened to offer it;
  // otherwise fall back to the first offered choice and mark this run
  // `skipped` (see AgentRunOutcome's comment) so a caller measuring one
  // specific commander doesn't count it.
  const offeredDesired = desiredCommanderId && state.commanderChoices.includes(desiredCommanderId);
  const commanderId = offeredDesired ? desiredCommanderId : state.commanderChoices[0];
  const skipped = !!desiredCommanderId && !offeredDesired;
  state = dispatch(state, { type: 'CHOOSE_COMMANDER', commanderId }, tracker);

  while (state.phase !== 'victory' && state.phase !== 'defeat' && tracker.count < ACTION_CEILING && !tracker.rejected) {
    if (state.phase === 'map') {
      state = dispatch(state, pickNodeAction(state, config, commanderId, rng), tracker);
    } else {
      state = step(state, config, commanderId, rng, tracker);
    }
  }

  const diedAt =
    state.phase === 'defeat' && state.position
      ? { globalCol: globalColumn(state.act, state.position.col), type: getNode(actColumns(state.map, state.act), state.position).type }
      : null;

  return {
    seed,
    policySeed,
    commanderId,
    skipped,
    won: state.phase === 'victory',
    act: state.act,
    diedAt,
    fightsWon: state.runStats?.fightsWon ?? 0,
    actionsDispatched: tracker.count,
    rejectedDispatch: tracker.rejected !== null,
    rejectedAction: tracker.rejected ?? undefined,
  };
}

// Re-exported for reports/tests that want the reward formulas without a
// second import path.
export { winReward, eliteReward, hasProtocol, PURCHASABLE_FRAME_IDS };
