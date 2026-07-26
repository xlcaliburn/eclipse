import { CARDS, MAX_HAND_SIZE } from './cards';
import type { CardId } from './cards';
import {
  advanceRound,
  canPlayCard,
  combatOutcome,
  hasMissilePhase,
  initCombat,
  playCard,
  runToEnd,
  unconsumedContingentCards,
  useActive,
} from './combatEngine';
import type { TargetingStance } from './combatEngine';
import { drawCommanderChoices } from './commanders';
import type { CommanderId } from './commanders';
import {
  applyEscalations,
  applyVeterancy,
  bountyEnemyForColumn,
  combatEnemyPool,
  eliteEnemyForColumn,
  getBoss,
  getFinalBoss,
  OPENER,
} from './enemies';
import { drawEscalationSchedule } from './escalations';
import { drawEvent, nextUnrevealedIndex, resolveEventChoice } from './events';
import type { EventId } from './events';
import { getFrame, MAX_FLEET_SIZE } from './frames';
import { actColumns, BOSS_COLUMN, generateMap, getNode, globalColumn, LANE_COLUMNS, reachableNodes } from './map';
import type { GameMap, MapNode, MapPosition } from './map';
export { globalColumn } from './map';
import { CARGO_POD_PART_ID, getPart, PARTS, STARTING_LOADOUT } from './parts';
import { generateQuestOffer } from './quests';
import type { ActiveQuest } from './quests';
import { randomSeed, resumeRng } from './rng';
import type { RngFn } from './rng';
import {
  deriveFleetForCombat,
  deriveFleetStats,
  deriveStats,
  effectiveSlots,
  equippedWeaponCount,
  fleetHasWeapon,
  hasWeapon,
  playerShipLabel,
} from './ship';
import { randomUpgradeIds } from './upgrades';
import type { UpgradeId } from './upgrades';
import type { EnemyDef, PartId, PlayerShipState, RewardSummary, RunState } from './types';

export type RunAction =
  | { type: 'CHOOSE_COMMANDER'; commanderId: CommanderId }
  | { type: 'SETUP_ADD_PART'; partId: PartId }
  | { type: 'SETUP_REMOVE_PART'; partId: PartId }
  | { type: 'SETUP_CONFIRM' }
  | { type: 'PICK_NODE'; row: number }
  | { type: 'EQUIP'; shipIndex: number; partId: PartId }
  | { type: 'UNEQUIP'; shipIndex: number; partId: PartId }
  | { type: 'ENGAGE' }
  | { type: 'ADVANCE_ROUND' }
  | { type: 'AUTO_RESOLVE' }
  | { type: 'PLAY_CARD'; cardId: CardId }
  | { type: 'CONTINUE' }
  | { type: 'WITHDRAW' }
  | { type: 'PICK_UPGRADE'; upgradeId: UpgradeId; shipIndex: number }
  | { type: 'LEAVE_REWARD' }
  | { type: 'INTERLUDE_CHOOSE'; index: 0 | 1 | 2; shipIndex?: number }
  | { type: 'BUY_PART'; offerIndex: number }
  | { type: 'SELL_PART'; partId: PartId }
  | { type: 'BUY_SHIP'; frameId: 'interceptor' | 'bastion' | 'dreadnought' | 'light-cruiser' } // the Flagship is never purchasable
  | { type: 'SCUTTLE_SHIP'; shipIndex: number }
  | { type: 'SET_TARGETING_STANCE'; stance: TargetingStance }
  | { type: 'BUY_DOSSIER' }
  | { type: 'BUY_SECTOR_SCAN' }
  | { type: 'BUY_DEEP_SCAN'; row: number }
  | { type: 'BUY_ESCALATION_INTERCEPT' }
  | { type: 'ACCEPT_QUEST'; carrierShipIndex?: number }
  | { type: 'MOVE_CARGO_POD'; toShipIndex: number }
  | { type: 'USE_ACTIVE'; shipIndex: number; abilityIndex: number }
  | { type: 'REROLL' }
  | { type: 'LEAVE_SHOP' }
  | { type: 'LEAVE_REPAIR' }
  | { type: 'EVENT_CHOOSE'; choiceIndex: 0 | 1 }
  | { type: 'EVENT_CONTINUE' }
  | { type: 'NEW_RUN' };

export const SHOP_OFFER_COUNT = 6;
export const REROLL_COST = 2;
// Iteration 7: the info broker is priced in intel, never credits.
export const DOSSIER_INTEL_COST = 3;
export const SECTOR_SCAN_INTEL_COST = 1;
export const DEEP_SCAN_INTEL_COST = 2;
export const ESCALATION_INTERCEPT_INTEL_COST = 2;
export const WIN_INTEL = 1; // every combat win salvages flight recorders
export const ELITE_BONUS_INTEL = 2; // elites additionally yield this much (3 total)
// Addendum A.2 (iteration 8): every job now costs an upfront stake, forfeit
// on failure (passive lapse, fled bounty node, dead cargo carrier) — with no
// stake, accepting was never a real decision. Rewards raised to ~3x stake.
export const QUEST_STAKE: Record<ActiveQuest['archetype'], number> = { bounty: 6, delivery: 5, recon: 3 };
export const BOUNTY_BONUS_CREDITS = 18;
export const DELIVERY_REWARD_CREDITS = 15;
export const DELIVERY_FALLBACK_CREDITS = 4;
export const RECON_BONUS_INTEL = 3;

// How many columns beyond the current vision high-water mark a sector scan
// reveals in one purchase.
const SECTOR_SCAN_DEPTH = 2;

// The starting cruiser is fitted out from a fixed credit budget rather than
// a free pick of parts — sized to match the original reference loadout
// (2x ion cannon + electron computer + hull plating, all tier-1 parts at
// 3 credits each = 12).
export const SETUP_BUDGET = 12;

// Only the basic tier-1 parts are available at the setup screen — anything
// fancier has to be earned via the run's real trade stations.
export const SETUP_ALLOWED_PARTS: PartId[] = ['ion', 'hull1', 'shield1', 'comp1'];

// A purchased ship arrives pre-fitted with one signature part, like the
// Flagship's own starting loadout — an Interceptor with an ion cannon, a
// Bastion with the lure beacon its whole role depends on, a Cruiser with
// the same ion cannon (its identity is having no gimmick). The Dreadnought
// has no signature identity part — it's a blank slate for whatever the
// fleet needs at that point in the run.
const STARTING_FIT: Record<'interceptor' | 'bastion' | 'dreadnought' | 'light-cruiser', PartId[]> = {
  interceptor: ['ion'],
  bastion: ['lure'],
  dreadnought: [],
  'light-cruiser': ['ion'],
};

function setupSpent(equipped: PartId[]): number {
  return equipped.reduce((sum, id) => sum + getPart(id).cost, 0);
}

// Credits earned for winning a combat node at the given column.
export function winReward(col: number): number {
  return 4 + col;
}

// Credits earned for winning an elite node at the given column (when the
// hand is full and a reaction card can't be granted, +4 more is added).
export function eliteReward(col: number): number {
  return 8 + col;
}

function bossEnemyForAct(map: GameMap, act: 1 | 2): EnemyDef {
  return act === 1 ? getBoss(map.act1BossId) : getFinalBoss(map.act2BossId);
}

// Iteration 9: every in-run draw (shop stock, enemy picks, event/card/
// upgrade draws) continues the one run-level rng stream instead of calling
// the browser's raw random source directly, so reload-and-replay can never
// change fate. Call `rng()` as many times as needed for this action, then
// read `nextCounter()` exactly once when building the returned state.
function runRng(state: RunState): { rng: RngFn; nextCounter: () => number } {
  const { rng, consumedThisCall } = resumeRng(state.map.seed, state.rngCounter);
  return { rng, nextCounter: () => state.rngCounter + consumedThisCall() };
}

// Draws and stores this fight's combat seed at the moment `currentEnemy` is
// set (PICK_NODE or an event ambush) — not at ENGAGE — so a reload before
// Engage can never reroll the fight (9.1).
function drawCombatSeed(rng: RngFn): number {
  return Math.floor(rng() * 0xffffffff);
}

export function initialRunState(): RunState {
  const seed = randomSeed();
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
    intel: 0,
    inventory: [],
    fleet: [{ frameId: 'cruiser', equipped: [...STARTING_LOADOUT], damage: 0, upgrades: [] }],
    hand: ['bulkheads', 'volley'], // iteration 7: cards are found, never bought — start with one of each
    escalations,
    bossRevealed: false,
    visionCol: 0,
    revealedNodes: [],
    commanderChoices,
  };
}

// Vision extends further per pick for the Spymaster.
function visionStep(state: RunState): number {
  return state.commanderId === 'spymaster' ? 2 : 1;
}

// The Spymaster earns double intel income per combat win.
function intelMultiplier(commanderId: CommanderId | undefined): number {
  return commanderId === 'spymaster' ? 2 : 1;
}

// Shop rerolls cost 1cr instead of 2 for the Merchant.
export function rerollCost(commanderId: CommanderId | undefined): number {
  return commanderId === 'merchant' ? 1 : REROLL_COST;
}

function removeOnce<T>(list: T[], item: T): T[] {
  const index = list.indexOf(item);
  if (index === -1) return list;
  const copy = [...list];
  copy.splice(index, 1);
  return copy;
}

// Iteration 7: a flat uniform draw over ~30 parts can no longer reliably
// surface an answer to a given threat. The 6 offers are drawn stratified
// instead — 2 weapons, 2 defense (shield/hull), 1 computer-or-drive, 1
// active part — uniform within each stratum; duplicates across strata (or
// within one) are allowed.
const WEAPON_POOL = PARTS.filter((p) => p.type === 'weapon');
const DEFENSE_POOL = PARTS.filter((p) => p.type === 'shield' || p.type === 'hull');
const COMPUTER_DRIVE_POOL = PARTS.filter((p) => p.type === 'computer' || p.type === 'drive');
const ACTIVE_POOL = PARTS.filter((p) => p.active);

function drawFrom(pool: { id: PartId }[], rng: RngFn): PartId {
  return pool[Math.floor(rng() * pool.length)].id;
}

function drawShopOffers(rng: RngFn): PartId[] {
  return [
    drawFrom(WEAPON_POOL, rng),
    drawFrom(WEAPON_POOL, rng),
    drawFrom(DEFENSE_POOL, rng),
    drawFrom(DEFENSE_POOL, rng),
    drawFrom(COMPUTER_DRIVE_POOL, rng),
    drawFrom(ACTIVE_POOL, rng),
  ];
}

function drawRandomCard(rng: RngFn): CardId {
  return CARDS[Math.floor(rng() * CARDS.length)].id;
}

function pickFromPool(pool: EnemyDef[], rng: () => number): EnemyDef {
  return pool[Math.floor(rng() * pool.length)];
}

function repairFleet(fleet: PlayerShipState[]): { fleet: PlayerShipState[]; totalRepaired: number } {
  let totalRepaired = 0;
  const repaired = fleet.map((ship) => {
    totalRepaired += ship.damage;
    return { ...ship, damage: 0 };
  });
  return { fleet: repaired, totalRepaired };
}

function repairSummaryText(totalRepaired: number, shipCount: number): string {
  if (totalRepaired === 0) return 'Your fleet is already at full strength.';
  return `Repaired ${totalRepaired} damage across ${shipCount} ship${shipCount > 1 ? 's' : ''}.`;
}

// Addendum A.4: a ship holds at most 1 permanent upgrade — a second
// acquisition (elite reward or the interlude's Field promotion) replaces
// the old one rather than stacking. The old one is simply gone (destroyed),
// same as any upgrade lost with its ship.
function withUpgrade(ship: PlayerShipState, upgradeId: UpgradeId): PlayerShipState {
  return { ...ship, upgrades: [upgradeId] };
}

function samePosition(a: MapPosition, b: MapPosition): boolean {
  return a.col === b.col && a.row === b.row;
}

// A delivery quest's cargo pod is a real (slot-consuming) part on its
// carrier ship — this strips it back out wherever the quest ends (success,
// passive failure, or carrier loss), so the player is never left with a
// permanently dead slot.
function removeCargoPod(fleet: PlayerShipState[], carrierShipIndex: number | undefined): PlayerShipState[] {
  if (carrierShipIndex === undefined) return fleet;
  return fleet.map((s, i) =>
    i === carrierShipIndex ? { ...s, equipped: removeOnce(s.equipped, CARGO_POD_PART_ID) } : s,
  );
}

// Whether arriving at `node` (having not hit the quest's target there)
// means the quest's target column has been passed for good — the map only
// moves forward one column at a time, so once true it can never revisit.
function questMissed(quest: ActiveQuest, node: MapNode): boolean {
  if (node.col > quest.target.col) return true;
  return node.col === quest.target.col && node.row !== quest.target.row;
}

// The position the run reverts to if the current node is fled — the node
// visited immediately before it, or null if the current node was column 0
// (there is no "before column 0").
function revertedPosition(state: RunState): MapPosition | null {
  const revertedIndex = state.visited.length - 2;
  return revertedIndex >= 0 ? state.visited[revertedIndex] : null;
}

// Whether the fight at the player's current node can be walked away from.
// The boss column has only one node, so it naturally has no line of
// retreat once "itself" is excluded below — no special case needed. Ambush
// fights (the player's position is still the event node they were jumped
// from) are excluded explicitly: you were jumped, there is nothing to
// retreat to.
export function hasLineOfRetreat(state: RunState): boolean {
  if (!state.position) return false;
  const columns = actColumns(state.map, state.act);
  const node = getNode(columns, state.position);
  if (node.type === 'event') return false;
  const candidates = reachableNodes(columns, revertedPosition(state));
  return candidates.some(
    (n) =>
      !samePosition(n, state.position!) &&
      !state.fled.some((f) => samePosition(f, n)),
  );
}

export function runReducer(state: RunState, action: RunAction): RunState {
  switch (action.type) {
    case 'CHOOSE_COMMANDER': {
      if (state.phase !== 'commander') return state;
      if (!state.commanderChoices.includes(action.commanderId)) return state;
      const fleet =
        action.commanderId === 'warlord'
          ? [...state.fleet, { frameId: 'interceptor' as const, equipped: ['ion'], damage: 0, upgrades: [] }]
          : state.fleet;
      return { ...state, phase: 'setup', commanderId: action.commanderId, fleet };
    }

    case 'SETUP_ADD_PART': {
      if (state.phase !== 'setup') return state;
      if (!SETUP_ALLOWED_PARTS.includes(action.partId)) return state;
      const ship = state.fleet[0];
      if (!ship) return state;
      const cost = getPart(action.partId).cost;
      if (setupSpent(ship.equipped) + cost > SETUP_BUDGET) return state;
      const fleet = [{ ...ship, equipped: [...ship.equipped, action.partId] }];
      return { ...state, fleet };
    }

    case 'SETUP_REMOVE_PART': {
      if (state.phase !== 'setup') return state;
      const ship = state.fleet[0];
      if (!ship || !ship.equipped.includes(action.partId)) return state;
      const fleet = [{ ...ship, equipped: removeOnce(ship.equipped, action.partId) }];
      return { ...state, fleet };
    }

    case 'SETUP_CONFIRM': {
      if (state.phase !== 'setup') return state;
      const ship = state.fleet[0];
      if (!ship) return state;
      const stats = deriveStats(ship.frameId, ship.equipped);
      if (!hasWeapon(stats)) return state;
      return { ...state, phase: 'map' };
    }

    case 'PICK_NODE': {
      if (state.phase !== 'map') return state;
      const { rng, nextCounter } = runRng(state);
      const columns = actColumns(state.map, state.act);
      const nextCol = state.position === null ? 0 : state.position.col + 1;
      const candidates = reachableNodes(columns, state.position);
      const node = candidates.find((n) => n.row === action.row && n.col === nextCol);
      if (!node) return state;
      if (state.fled.some((f) => f.col === node.col && f.row === node.row)) return state;

      const position: MapPosition = { col: node.col, row: node.row };
      const visited = [...state.visited, position];
      // Arriving anywhere reveals your next set of choices (fog of war,
      // iteration 6) — a high-water mark, so retreating never un-reveals.
      const visionCol = Math.max(state.visionCol, node.col + visionStep(state));
      let base: RunState = { ...state, position, visited, visionCol };

      // Quest resolution (iteration 6). Bounty completion happens on combat
      // *win* (CONTINUE), not on arrival — so it's left alone here except
      // for the passive-failure check shared with the other archetypes.
      const quest = state.activeQuest;
      if (quest) {
        const atTarget = samePosition(quest.target, position);
        if (atTarget && quest.archetype === 'recon') {
          const escIndex = nextUnrevealedIndex(state);
          const escalations =
            escIndex === -1
              ? state.escalations
              : state.escalations.map((e, i) => (i === escIndex ? { ...e, revealed: true } : e));
          base = {
            ...base,
            visionCol: base.visionCol + 2,
            escalations,
            intel: base.intel + RECON_BONUS_INTEL,
            activeQuest: undefined,
          };
        } else if (atTarget && quest.archetype === 'delivery') {
          const handFull = state.hand.length >= MAX_HAND_SIZE;
          const cardId = handFull ? undefined : drawRandomCard(rng);
          base = {
            ...base,
            credits: base.credits + DELIVERY_REWARD_CREDITS + (handFull ? DELIVERY_FALLBACK_CREDITS : 0),
            hand: cardId ? [...base.hand, cardId] : base.hand,
            fleet: removeCargoPod(base.fleet, quest.carrierShipIndex),
            activeQuest: undefined,
          };
        } else if (!atTarget && questMissed(quest, node)) {
          base = { ...base, fleet: removeCargoPod(base.fleet, quest.carrierShipIndex), activeQuest: undefined };
        }
      }

      if (node.type === 'opener') {
        // The act-1 opener: fixed enemy, no escalations (none are scheduled
        // before column 3 anyway), no veterancy, a guaranteed-survivable
        // first step.
        return {
          ...base,
          phase: 'prep',
          currentEnemy: OPENER,
          currentCombatSeed: drawCombatSeed(rng),
          rngCounter: nextCounter(),
        };
      }
      // Escalations are seeded for both acts at once, but act-1's are
      // permanent once landed — they stay in effect through act 2, stacking
      // with act 2's own (8.4: "act-2 escalations apply on top of act-1's").
      // Comparing on the global column (not each escalation's act-local
      // landsAfterColumn) makes act-1's escalations unconditionally active
      // from anywhere in act 2, with no special-casing needed.
      const globalEscalations = state.escalations.map((e) => ({
        ...e,
        landsAfterColumn: globalColumn(e.act, e.landsAfterColumn),
      }));
      const globalCol = globalColumn(state.act, node.col);
      if (node.type === 'combat') {
        const isBountyTarget = base.activeQuest?.archetype === 'bounty' && samePosition(base.activeQuest.target, position);
        const rawEnemy = isBountyTarget
          ? bountyEnemyForColumn(state.act, node.col)
          : pickFromPool(combatEnemyPool(state.act, node.col), rng);
        const enemy = applyEscalations(applyVeterancy(rawEnemy, node.col), globalCol, globalEscalations);
        return {
          ...base,
          phase: 'prep',
          currentEnemy: enemy,
          currentCombatSeed: drawCombatSeed(rng),
          rngCounter: nextCounter(),
        };
      }
      if (node.type === 'elite') {
        const rawEnemy = eliteEnemyForColumn(state.act, node.col, rng);
        const enemy = applyEscalations(applyVeterancy(rawEnemy, node.col), globalCol, globalEscalations);
        return {
          ...base,
          phase: 'prep',
          currentEnemy: enemy,
          currentCombatSeed: drawCombatSeed(rng),
          rngCounter: nextCounter(),
        };
      }
      if (node.type === 'boss') {
        const enemy = applyEscalations(bossEnemyForAct(state.map, state.act), globalCol, globalEscalations);
        return {
          ...base,
          phase: 'prep',
          currentEnemy: enemy,
          currentCombatSeed: drawCombatSeed(rng),
          rngCounter: nextCounter(),
        };
      }
      if (node.type === 'shop') {
        return {
          ...base,
          phase: 'shop',
          shopOffers: drawShopOffers(rng),
          shopIntel: { sectorScan: false, deepScan: false, escalationIntercept: false },
          shopQuestOffer: generateQuestOffer(columns, node, rng) ?? undefined,
          rngCounter: nextCounter(),
        };
      }
      if (node.type === 'repair') {
        const { fleet, totalRepaired } = repairFleet(state.fleet);
        return {
          ...base,
          phase: 'repair',
          fleet,
          repairSummary: repairSummaryText(totalRepaired, state.fleet.length),
          rngCounter: nextCounter(),
        };
      }

      // event
      const eventId: EventId = drawEvent(rng, state.lastEventId);
      return {
        ...base,
        phase: 'event',
        currentEvent: { eventId },
        lastEventId: eventId,
        rngCounter: nextCounter(),
      };
    }

    case 'EQUIP': {
      if (state.phase !== 'prep' && state.phase !== 'shop') return state;
      const ship = state.fleet[action.shipIndex];
      if (!ship) return state;
      if (ship.equipped.length >= effectiveSlots(ship.frameId, ship.upgrades)) return state;
      if (!state.inventory.includes(action.partId)) return state;
      const part = getPart(action.partId);
      const maxWeapons = getFrame(ship.frameId).maxWeapons;
      if (part.weapon && maxWeapons !== undefined && equippedWeaponCount(ship.equipped) >= maxWeapons) return state;
      const fleet = state.fleet.map((s, i) =>
        i === action.shipIndex ? { ...s, equipped: [...s.equipped, action.partId] } : s,
      );
      return { ...state, inventory: removeOnce(state.inventory, action.partId), fleet };
    }

    case 'UNEQUIP': {
      if (state.phase !== 'prep' && state.phase !== 'shop') return state;
      if (action.partId === CARGO_POD_PART_ID) return state; // moved via MOVE_CARGO_POD, never unequipped to inventory
      const ship = state.fleet[action.shipIndex];
      if (!ship || !ship.equipped.includes(action.partId)) return state;
      const equipped = removeOnce(ship.equipped, action.partId);
      // Removing a hull part lowers max HP — never let that drop a ship's
      // carried damage below survivable (this is an equipment change, not
      // combat; it should never destroy the ship).
      const newHp = deriveStats(ship.frameId, equipped, ship.upgrades).hp;
      const damage = Math.min(ship.damage, newHp - 1);
      const fleet = state.fleet.map((s, i) => (i === action.shipIndex ? { ...s, equipped, damage } : s));
      return { ...state, fleet, inventory: [...state.inventory, action.partId] };
    }

    case 'ENGAGE': {
      if (state.phase !== 'prep' || !state.currentEnemy || state.currentCombatSeed === undefined) return state;
      const fleetStats = deriveFleetStats(state.fleet);
      if (!fleetHasWeapon(fleetStats)) return state;

      const fleetInput = deriveFleetForCombat(state.fleet);
      // The combat seed was already drawn (and stored) when this fight was
      // set up, not now — a reload before Engage can never reroll it (9.1).
      let combat = initCombat(fleetInput, state.currentEnemy, state.currentCombatSeed, state.targetingStance);
      // Neither fleet has a missile weapon — round 0 is a guaranteed no-op,
      // so skip straight past it rather than making the player click through.
      if (!hasMissilePhase(combat)) combat = advanceRound(combat);
      return { ...state, phase: 'combat', combat };
    }

    case 'ADVANCE_ROUND': {
      if (state.phase !== 'combat' || !state.combat || state.combat.winner) return state;
      return { ...state, combat: advanceRound(state.combat) };
    }

    case 'AUTO_RESOLVE': {
      if (state.phase !== 'combat' || !state.combat || state.combat.winner) return state;
      return { ...state, combat: runToEnd(state.combat) };
    }

    case 'PLAY_CARD': {
      if (state.phase !== 'combat' || !state.combat) return state;
      if (!state.hand.includes(action.cardId)) return state;
      if (!canPlayCard(state.combat, action.cardId)) return state;
      const combat = playCard(state.combat, action.cardId);
      return { ...state, combat, hand: removeOnce(state.hand, action.cardId) };
    }

    case 'CONTINUE': {
      if (state.phase !== 'combat' || !state.combat || !state.combat.winner) return state;
      const { rng, nextCounter } = runRng(state);
      const outcome = combatOutcome(state.combat);
      const returnedCards = unconsumedContingentCards(state.combat);

      if (outcome.winner === 'enemy') {
        return { ...state, phase: 'defeat', rngCounter: nextCounter() };
      }

      let inventory = [...state.inventory];
      const salvagedParts: PartId[] = [];
      const lostShips: string[] = [];
      const survivingFleet: PlayerShipState[] = [];
      let carrierDestroyed = false;
      state.fleet.forEach((ship, i) => {
        const shipOutcome = outcome.playerShips[i];
        if (shipOutcome.destroyed) {
          // Parts salvage back to inventory; upgrades are lost with the
          // ship — that's what makes a capital ship's upgrades feel earned.
          // A cargo pod is not a real part — it's lost with the ship, not
          // salvaged (the quest has failed; there's nothing to keep).
          const salvage = ship.equipped.filter((id) => id !== CARGO_POD_PART_ID);
          inventory = [...inventory, ...salvage];
          salvagedParts.push(...salvage);
          lostShips.push(playerShipLabel(state.fleet, i));
          if (state.activeQuest?.archetype === 'delivery' && state.activeQuest.carrierShipIndex === i) {
            carrierDestroyed = true;
          }
        } else {
          survivingFleet.push({ ...ship, damage: shipOutcome.endDamage });
        }
      });
      // A delivery quest's carrier dying fails the quest silently — the pod
      // (and any reward) goes down with the ship, no separate penalty.
      const activeQuestAfterFight = carrierDestroyed ? undefined : state.activeQuest;

      const col = state.position?.col ?? 0;
      const globalCol = globalColumn(state.act, col);
      const isBoss = state.position?.col === BOSS_COLUMN;
      if (isBoss && state.act === 2) {
        return {
          ...state,
          phase: 'victory',
          fleet: survivingFleet,
          inventory,
          combat: undefined,
          activeQuest: activeQuestAfterFight,
          rngCounter: nextCounter(),
        };
      }
      if (isBoss && state.act === 1) {
        // The act-1 boss pays like an elite at its column — the only boss
        // that pays, since the run continues — but is not an elite for
        // reward-screen purposes: no card, no upgrade pick, straight into
        // the interlude (no shop between acts).
        const creditsEarned = eliteReward(globalCol);
        const intelEarned = (WIN_INTEL + ELITE_BONUS_INTEL) * intelMultiplier(state.commanderId);
        return {
          ...state,
          phase: 'interlude',
          fleet: survivingFleet,
          inventory,
          credits: state.credits + creditsEarned,
          intel: state.intel + intelEarned,
          hand: [...state.hand, ...returnedCards],
          combat: undefined,
          currentEnemy: undefined,
          activeQuest: activeQuestAfterFight,
          rngCounter: nextCounter(),
        };
      }

      const isBounty = !!(
        state.activeQuest &&
        state.activeQuest.archetype === 'bounty' &&
        state.position &&
        samePosition(state.activeQuest.target, state.position)
      );
      const isElite = state.currentEnemy?.id.endsWith('-elite') ?? false;
      const baseReward = isElite ? eliteReward(globalCol) : winReward(globalCol);
      let hand = [...state.hand, ...returnedCards];
      let cardGained: CardId | undefined;
      let cardInsteadCredits: number | undefined;

      if (isElite) {
        if (hand.length < MAX_HAND_SIZE) {
          cardGained = drawRandomCard(rng);
          hand = [...hand, cardGained];
        } else {
          cardInsteadCredits = 4;
        }
      }

      // 'regen' heals damage after a win; 'salvage' pays extra credits per
      // win. Both are per-upgrade-instance, so duplicates stack. The
      // Engineer commander adds a flat +1 heal on top, stacking with regen.
      const engineerHeal = state.commanderId === 'engineer' ? 1 : 0;
      let salvageTotal = 0;
      const healedFleet = survivingFleet.map((ship) => {
        const regenCount = ship.upgrades.filter((u) => u === 'regen').length;
        salvageTotal += ship.upgrades.filter((u) => u === 'salvage').length * 3;
        const totalHeal = regenCount + engineerHeal;
        if (totalHeal === 0 || ship.damage === 0) return ship;
        return { ...ship, damage: Math.max(0, ship.damage - totalHeal) };
      });

      const bountyBonus = isBounty ? BOUNTY_BONUS_CREDITS : 0;
      const merchantBonus = state.commanderId === 'merchant' ? 2 : 0;
      const creditsEarned = baseReward + bountyBonus + merchantBonus + (cardInsteadCredits ?? 0) + salvageTotal;
      const credits = state.credits + creditsEarned;
      const upgradeOptions = isElite || isBounty ? randomUpgradeIds(3, rng) : undefined;

      // "Flight recorders salvaged" — the intel currency, earned whether or
      // not you fight well, doubled for the Spymaster.
      const intelEarned = (WIN_INTEL + (isElite ? ELITE_BONUS_INTEL : 0)) * intelMultiplier(state.commanderId);
      const intel = state.intel + intelEarned;

      const pendingReward: RewardSummary = {
        credits: creditsEarned,
        creditsTotal: credits,
        intelGained: intelEarned,
        cardGained,
        cardInsteadCredits,
        salvagedParts,
        lostShips,
        upgradeOptions,
      };

      return {
        ...state,
        phase: 'reward',
        fleet: healedFleet,
        inventory,
        credits,
        intel,
        hand,
        combat: undefined,
        currentEnemy: undefined,
        pendingReward,
        activeQuest: isBounty ? undefined : activeQuestAfterFight,
        rngCounter: nextCounter(),
      };
    }

    case 'WITHDRAW': {
      if (state.phase !== 'combat' || !state.combat || state.combat.winner) return state;
      if (state.combat.round < 1) return state; // can't back out before the missile phase resolves
      if (!hasLineOfRetreat(state)) return state;

      // Surviving ships keep their damage, same as a win; destroyed ships
      // are lost with parts salvaged and upgrades gone (existing rules).
      // No credits, no reward screen — the fight simply stops.
      let inventory = [...state.inventory];
      const survivingFleet: PlayerShipState[] = [];
      let carrierDestroyed = false;
      state.fleet.forEach((ship, i) => {
        const combatShip = state.combat!.playerShips[i];
        const destroyed = combatShip.damage >= combatShip.stats.hp;
        if (destroyed) {
          inventory = [...inventory, ...ship.equipped.filter((id) => id !== CARGO_POD_PART_ID)];
          if (state.activeQuest?.archetype === 'delivery' && state.activeQuest.carrierShipIndex === i) {
            carrierDestroyed = true;
          }
        } else {
          survivingFleet.push({ ...ship, damage: Math.min(combatShip.damage, combatShip.stats.hp) });
        }
      });

      const returnedCards = unconsumedContingentCards(state.combat);
      const hand = [...state.hand, ...returnedCards];

      const fled = [...state.fled, state.position!];
      const position = revertedPosition(state);
      const visited = state.visited.slice(0, -1);

      // Withdrawing from a bounty fight fails the quest — the node is fled,
      // the target is gone. A delivery carrier destroyed this round also
      // fails its quest, same as any other combat.
      const isBountyHere = !!(
        state.activeQuest &&
        state.activeQuest.archetype === 'bounty' &&
        state.position &&
        samePosition(state.activeQuest.target, state.position)
      );
      const activeQuest = isBountyHere || carrierDestroyed ? undefined : state.activeQuest;

      return {
        ...state,
        phase: 'map',
        fleet: survivingFleet,
        inventory,
        hand,
        combat: undefined,
        currentEnemy: undefined,
        fled,
        position,
        visited,
        activeQuest,
      };
    }

    case 'PICK_UPGRADE': {
      if (state.phase !== 'reward' || !state.pendingReward?.upgradeOptions) return state;
      if (!state.pendingReward.upgradeOptions.includes(action.upgradeId)) return state;
      const ship = state.fleet[action.shipIndex];
      if (!ship) return state;
      const fleet = state.fleet.map((s, i) => (i === action.shipIndex ? withUpgrade(s, action.upgradeId) : s));
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
      const { rng, nextCounter } = runRng(state);
      let fleet = state.fleet;
      let credits = state.credits;
      if (action.index === 0) {
        // Refit: fully repair every ship.
        fleet = state.fleet.map((s) => ({ ...s, damage: 0 }));
      } else if (action.index === 1) {
        // War chest.
        credits = state.credits + 15;
      } else if (action.index === 2) {
        // Field promotion: 1 random elite-pool upgrade, attached to a ship
        // of the player's choice.
        if (action.shipIndex === undefined || !state.fleet[action.shipIndex]) return state;
        const upgradeId = randomUpgradeIds(1, rng)[0];
        fleet = state.fleet.map((s, i) => (i === action.shipIndex ? withUpgrade(s, upgradeId) : s));
      } else {
        return state;
      }
      // Into act 2: a fresh sector — position/visited/fled/fog reset, the
      // boss dossier resets (a second reveal purchase awaits), any leftover
      // quest is dropped (act-1 quests always resolve by the boss, since
      // their targets can never reach column 10 — this is just a backstop).
      return {
        ...state,
        phase: 'map',
        act: 2,
        fleet,
        credits,
        position: null,
        visited: [],
        fled: [],
        visionCol: 0,
        revealedNodes: [],
        bossRevealed: false,
        activeQuest: undefined,
        shopQuestOffer: undefined,
        rngCounter: nextCounter(),
      };
    }

    case 'BUY_PART': {
      if (state.phase !== 'shop' || !state.shopOffers) return state;
      const partId = state.shopOffers[action.offerIndex];
      if (!partId) return state;
      const cost = getPart(partId).cost;
      if (state.credits < cost) return state;
      const shopOffers = [...state.shopOffers];
      shopOffers.splice(action.offerIndex, 1);
      return { ...state, credits: state.credits - cost, inventory: [...state.inventory, partId], shopOffers };
    }

    case 'SELL_PART': {
      if (state.phase !== 'shop') return state;
      if (!state.inventory.includes(action.partId)) return state;
      const payout = Math.floor(getPart(action.partId).cost / 2);
      return {
        ...state,
        credits: state.credits + payout,
        inventory: removeOnce(state.inventory, action.partId),
      };
    }

    case 'BUY_SHIP': {
      if (state.phase !== 'shop') return state;
      if (state.fleet.length >= MAX_FLEET_SIZE) return state;
      const frame = getFrame(action.frameId); // the Flagship ('cruiser') is never purchasable
      if (state.credits < frame.cost) return state;
      return {
        ...state,
        credits: state.credits - frame.cost,
        fleet: [
          ...state.fleet,
          { frameId: action.frameId, equipped: [...STARTING_FIT[action.frameId]], damage: 0, upgrades: [] },
        ],
      };
    }

    case 'SCUTTLE_SHIP': {
      // Iteration 8 (8.7): decommission a non-Flagship ship — parts return
      // to inventory, upgrades are destroyed (consistent with combat loss),
      // no credit refund. The Flagship guard alone guarantees the fleet can
      // never be emptied, since it's always present and never scuttleable.
      if (state.phase !== 'shop') return state;
      const ship = state.fleet[action.shipIndex];
      if (!ship || ship.frameId === 'cruiser') return state;
      const salvage = ship.equipped.filter((id) => id !== CARGO_POD_PART_ID);
      const fleet = state.fleet.filter((_, i) => i !== action.shipIndex);
      const quest = state.activeQuest;
      let activeQuest = quest;
      if (quest?.archetype === 'delivery' && quest.carrierShipIndex !== undefined) {
        if (quest.carrierShipIndex === action.shipIndex) {
          activeQuest = undefined; // the carrier is gone — the pod (and reward) go with it
        } else if (quest.carrierShipIndex > action.shipIndex) {
          activeQuest = { ...quest, carrierShipIndex: quest.carrierShipIndex - 1 }; // re-index past the removed ship
        }
      }
      return { ...state, fleet, inventory: [...state.inventory, ...salvage], activeQuest };
    }

    case 'SET_TARGETING_STANCE': {
      // Iteration 9.4: set on the prep screen, persists between fights
      // until changed — a RunState field, not a per-combat one.
      if (state.phase !== 'prep') return state;
      return { ...state, targetingStance: action.stance };
    }

    case 'BUY_DOSSIER': {
      if (state.phase !== 'shop') return state;
      if (state.bossRevealed) return state;
      if (state.intel < DOSSIER_INTEL_COST) return state;
      return { ...state, intel: state.intel - DOSSIER_INTEL_COST, bossRevealed: true };
    }

    case 'BUY_SECTOR_SCAN': {
      if (state.phase !== 'shop' || !state.shopIntel) return state;
      if (state.shopIntel.sectorScan) return state;
      if (state.intel < SECTOR_SCAN_INTEL_COST) return state;
      return {
        ...state,
        intel: state.intel - SECTOR_SCAN_INTEL_COST,
        visionCol: state.visionCol + SECTOR_SCAN_DEPTH,
        shopIntel: { ...state.shopIntel, sectorScan: true },
      };
    }

    case 'BUY_DEEP_SCAN': {
      if (state.phase !== 'shop' || !state.shopIntel) return state;
      if (state.shopIntel.deepScan) return state;
      if (state.intel < DEEP_SCAN_INTEL_COST) return state;
      if (action.row < 0 || action.row > 2) return state;
      const columns = actColumns(state.map, state.act);
      const newlyRevealed: MapPosition[] = [];
      for (let col = 0; col < LANE_COLUMNS; col++) {
        if (columns[col][action.row]) newlyRevealed.push({ col, row: action.row });
      }
      return {
        ...state,
        intel: state.intel - DEEP_SCAN_INTEL_COST,
        revealedNodes: [...state.revealedNodes, ...newlyRevealed],
        shopIntel: { ...state.shopIntel, deepScan: true },
      };
    }

    case 'BUY_ESCALATION_INTERCEPT': {
      if (state.phase !== 'shop' || !state.shopIntel) return state;
      if (state.shopIntel.escalationIntercept) return state;
      if (state.intel < ESCALATION_INTERCEPT_INTEL_COST) return state;
      const index = nextUnrevealedIndex(state);
      if (index === -1) return state;
      const escalations = state.escalations.map((e, i) => (i === index ? { ...e, revealed: true } : e));
      return {
        ...state,
        intel: state.intel - ESCALATION_INTERCEPT_INTEL_COST,
        escalations,
        shopIntel: { ...state.shopIntel, escalationIntercept: true },
      };
    }

    case 'ACCEPT_QUEST': {
      if (state.phase !== 'shop' || !state.shopQuestOffer) return state;
      if (state.activeQuest) return state; // cap 1 active
      const offer = state.shopQuestOffer;
      const stake = QUEST_STAKE[offer.archetype];
      if (state.credits < stake) return state; // can't afford the stake
      const credits = state.credits - stake;
      if (offer.archetype === 'delivery') {
        const idx = action.carrierShipIndex;
        if (idx === undefined) return state;
        const ship = state.fleet[idx];
        if (!ship) return state;
        if (ship.equipped.length >= effectiveSlots(ship.frameId, ship.upgrades)) return state;
        const fleet = state.fleet.map((s, i) =>
          i === idx ? { ...s, equipped: [...s.equipped, CARGO_POD_PART_ID] } : s,
        );
        return {
          ...state,
          fleet,
          credits,
          activeQuest: { ...offer, carrierShipIndex: idx },
          revealedNodes: [...state.revealedNodes, offer.target],
          shopQuestOffer: undefined,
        };
      }
      return {
        ...state,
        credits,
        activeQuest: offer,
        revealedNodes: [...state.revealedNodes, offer.target],
        shopQuestOffer: undefined,
      };
    }

    case 'MOVE_CARGO_POD': {
      if (state.phase !== 'prep' && state.phase !== 'shop') return state;
      if (!state.activeQuest || state.activeQuest.archetype !== 'delivery') return state;
      const fromIndex = state.activeQuest.carrierShipIndex;
      if (fromIndex === undefined || fromIndex === action.toShipIndex) return state;
      const toShip = state.fleet[action.toShipIndex];
      if (!toShip) return state;
      if (toShip.equipped.length >= effectiveSlots(toShip.frameId, toShip.upgrades)) return state;
      const fleet = state.fleet.map((s, i) => {
        if (i === fromIndex) return { ...s, equipped: removeOnce(s.equipped, CARGO_POD_PART_ID) };
        if (i === action.toShipIndex) return { ...s, equipped: [...s.equipped, CARGO_POD_PART_ID] };
        return s;
      });
      return { ...state, fleet, activeQuest: { ...state.activeQuest, carrierShipIndex: action.toShipIndex } };
    }

    case 'USE_ACTIVE': {
      if (state.phase !== 'combat' || !state.combat) return state;
      const combat = useActive(state.combat, action.shipIndex, action.abilityIndex);
      return { ...state, combat };
    }

    case 'REROLL': {
      if (state.phase !== 'shop') return state;
      const cost = rerollCost(state.commanderId);
      if (state.credits < cost) return state;
      const { rng, nextCounter } = runRng(state);
      return { ...state, credits: state.credits - cost, shopOffers: drawShopOffers(rng), rngCounter: nextCounter() };
    }

    case 'LEAVE_SHOP': {
      if (state.phase !== 'shop') return state;
      return {
        ...state,
        phase: 'map',
        shopOffers: undefined,
        shopIntel: undefined,
        shopQuestOffer: undefined,
        currentEnemy: undefined,
      };
    }

    case 'LEAVE_REPAIR': {
      if (state.phase !== 'repair') return state;
      return { ...state, phase: 'map', repairSummary: undefined };
    }

    case 'EVENT_CHOOSE': {
      if (state.phase !== 'event' || !state.currentEvent) return state;
      const { rng, nextCounter } = runRng(state);
      const { state: nextState, outcomeText, ambushEnemy } = resolveEventChoice(
        state.currentEvent.eventId,
        action.choiceIndex,
        state,
        rng,
      );
      return {
        ...nextState,
        currentEvent: { ...state.currentEvent, outcomeText, ambushEnemy },
        rngCounter: nextCounter(),
      };
    }

    case 'EVENT_CONTINUE': {
      if (state.phase !== 'event' || !state.currentEvent) return state;
      const { ambushEnemy } = state.currentEvent;
      if (ambushEnemy) {
        const { rng, nextCounter } = runRng(state);
        return {
          ...state,
          phase: 'prep',
          currentEvent: undefined,
          currentEnemy: ambushEnemy,
          currentCombatSeed: drawCombatSeed(rng),
          rngCounter: nextCounter(),
        };
      }
      return { ...state, phase: 'map', currentEvent: undefined };
    }

    case 'NEW_RUN':
      return initialRunState();

    default:
      return state;
  }
}
