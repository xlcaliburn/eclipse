import { CARDS, MAX_HAND_SIZE } from './cards';
import type { CardId } from './cards';
import {
  advanceRound,
  canPlayCard,
  combatOutcome,
  hasMissilePhase,
  initCombat,
  playCard,
  setPriorityTarget,
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
  hunterKillerForAmbush,
  OPENER,
} from './enemies';
import { drawEscalationSchedule } from './escalations';
import { drawEvent, getEvent, meetsRequirement, nextUnrevealedIndex, resolveEventChoice } from './events';
import type { EventId } from './events';
import { getFrame, MAX_FLEET_SIZE } from './frames';
import type { FrameId } from './frames';
import { addHeat, MAX_HEAT } from './heat';
import { actColumns, BOSS_COLUMN, generateMap, getNode, globalColumn, LANE_COLUMNS, reachableNodes } from './map';
import type { CargoTag, GameMap, MapNode, MapPosition } from './map';
export { globalColumn } from './map';
import { CARGO_POD_PART_ID, COMMODITY_LOT_PART_ID, getPart, PARTS, STARTING_LOADOUT } from './parts';
import { generateQuestOffer } from './quests';
import type { ActiveQuest } from './quests';
import { randomSeed, resumeRng } from './rng';
import type { RngFn } from './rng';
import {
  applyRepairBanking,
  deriveFleetForCombat,
  deriveFleetStats,
  deriveStats,
  effectiveSlots,
  equippedWeaponCount,
  fleetHasWeapon,
  hasWeapon,
  playerShipLabel,
} from './ship';
import { getUpgrade, randomUpgradeIds } from './upgrades';
import type { UpgradeId } from './upgrades';
import { emptyRunStats } from './daily';
import { shipName } from './shipNames';
import type { CombatEvent, EnemyDef, PartId, PlayerShipState, RewardSummary, RunState, RunStats } from './types';

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
  | { type: 'SET_PRIORITY_TARGET'; index: number | null }
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
  | { type: 'ACCEPT_QUEST'; carrierShipIndex?: number }
  | { type: 'MOVE_CARGO_POD'; toShipIndex: number }
  // Iteration 20 (commodity runs): buy loads the lot onto the chosen ship;
  // sell removes whichever ship currently carries it (there is never more
  // than one lot in the fleet at a time — see RunState.commodityLotBought-
  // AtGlobalColumn).
  | { type: 'BUY_COMMODITY_LOT'; shipIndex: number }
  | { type: 'SELL_COMMODITY_LOT' }
  // Iteration 20 (war assets): a one-fight-only escort. Consumed the very
  // next time a combat resolves (win or withdraw), regardless of outcome.
  | { type: 'BUY_MERCENARY' }
  | { type: 'USE_ACTIVE'; shipIndex: number; abilityIndex: number }
  | { type: 'REROLL' }
  | { type: 'LEAVE_SHOP' }
  | { type: 'LEAVE_REPAIR' }
  | { type: 'EVENT_CHOOSE'; choiceIndex: number; shipIndex?: number; cardId?: CardId }
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

export const SHOP_OFFER_COUNT = 6;
export const REROLL_COST = 2;
// Addendum A.2 (iteration 8): every job now costs an upfront stake, forfeit
// on failure (passive lapse, fled bounty node, dead cargo carrier) — with no
// stake, accepting was never a real decision. Rewards raised to ~3x stake.
export const QUEST_STAKE: Record<ActiveQuest['archetype'], number> = { bounty: 6, delivery: 5, recon: 3 };
export const BOUNTY_BONUS_CREDITS = 18;
export const DELIVERY_REWARD_CREDITS = 15;
export const DELIVERY_FALLBACK_CREDITS = 4;
// How many columns beyond the current vision high-water mark a long-range
// sweep reveals.
const SECTOR_SCAN_DEPTH = 2;

// How many separate reveals a completed recon job hands over.
export const RECON_REVEALS = 2;

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

// Iteration 20 (commodity runs): buy low at one shop, sell high at any
// later one. The +5cr spread is the reward; the risk is the slot it ties up
// for however many columns pass in between, and that it's lost outright if
// the carrying ship is. The sell price never varies by commander — only the
// Merchant's buy side and capacity change (iteration 21).
export const COMMODITY_LOT_SELL_PRICE = 9;
const BASE_COMMODITY_LOT_BUY_COST = 4;
const MERCHANT_COMMODITY_LOT_BUY_COST = 3;
export function commodityLotBuyCost(commanderId: CommanderId | undefined): number {
  return commanderId === 'merchant' ? MERCHANT_COMMODITY_LOT_BUY_COST : BASE_COMMODITY_LOT_BUY_COST;
}
const BASE_COMMODITY_LOT_CAP = 1;
const MERCHANT_COMMODITY_LOT_CAP = 2;
export function commodityLotCap(commanderId: CommanderId | undefined): number {
  return commanderId === 'merchant' ? MERCHANT_COMMODITY_LOT_CAP : BASE_COMMODITY_LOT_CAP;
}

// Iteration 20 (war assets): a one-fight escort, priced above a real
// Interceptor (8cr) since it costs nothing but credits and never has to
// survive past the fight it's hired for. The Merchant's discount (iteration
// 21) still prices it above the real Interceptor.
const BASE_MERCENARY_COST = 12;
const MERCHANT_MERCENARY_COST = 8;
export function mercenaryCost(commanderId: CommanderId | undefined): number {
  return commanderId === 'merchant' ? MERCHANT_MERCENARY_COST : BASE_MERCENARY_COST;
}
const MERCENARY_SHIP_NAME = 'Mercenary escort';

// Iteration 21 (the Admiral, wide): fleet cap 5 instead of the standard 4.
const ADMIRAL_FLEET_CAP = 5;
export function fleetCap(commanderId: CommanderId | undefined): number {
  return commanderId === 'admiral' ? ADMIRAL_FLEET_CAP : MAX_FLEET_SIZE;
}

// Iteration 21: purchasable-frame pricing for the two ship-doctrine
// commanders. The Admiral (wide) discounts every frame 25%, rounded down —
// a general shopping discount, since the doctrine is "many cheap hulls."
// The Warlord (tall) discounts only the Dreadnought, flatly — the whole
// doctrine is "one specific ship," not a general one. The two commanders
// are mutually exclusive within a run, so there's no stacking case to
// resolve. The Flagship is never purchasable, so it never reaches this.
const ADMIRAL_FRAME_MULTIPLIER = 0.75; // 25% off
const WARLORD_DREADNOUGHT_DISCOUNT = 5;
export function frameCost(baseCost: number, frameId: FrameId, commanderId: CommanderId | undefined): number {
  // Rounds the FINAL price down (not the discount amount down before
  // subtracting) — Math.floor(cost * 0.75), not cost - Math.floor(cost *
  // 0.25). The two differ whenever cost is odd (6cr: 4cr either way is
  // fine, but 7cr gives 5cr vs. 6cr) and "rounds in the player's favor" is
  // the more natural reading of a discount, so this is deliberate.
  if (commanderId === 'admiral') return Math.floor(baseCost * ADMIRAL_FRAME_MULTIPLIER);
  if (commanderId === 'warlord' && frameId === 'dreadnought') return Math.max(0, baseCost - WARLORD_DREADNOUGHT_DISCOUNT);
  return baseCost;
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
    hand: ['bulkheads', 'volley'], // iteration 7: cards are found, never bought — start with one of each
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
function scannableRows(state: RunState): number[] {
  const columns = actColumns(state.map, state.act);
  const rows: number[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < LANE_COLUMNS; col++) {
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
  if (state.visionCol < LANE_COLUMNS - 1) kinds.push('sector-scan');
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
      for (let col = 0; col < LANE_COLUMNS; col++) {
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

// Neither pseudo-part is real equipment — a cargo pod is failed quest
// freight, a commodity lot is unrealized profit. Both are lost outright
// with a destroyed/scuttled ship rather than salvaged to inventory; shared
// here so every salvage site excludes both without repeating the list.
function isSalvageablePart(partId: PartId): boolean {
  return partId !== CARGO_POD_PART_ID && partId !== COMMODITY_LOT_PART_ID;
}

// Iteration 7: a flat uniform draw over ~30 parts can no longer reliably
// surface an answer to a given threat. The 6 offers are drawn stratified
// instead — 2 weapons, 2 defense (shield/hull), 1 computer-or-drive, 1
// active part — uniform within each stratum. All six offers are unique
// (2026-08-02): a duplicate wastes a slot, and the actives stratum overlaps
// the typed ones (every active part also has a type), so cross-slot
// duplicates were possible too, not just the double weapon/defense draws.
const WEAPON_POOL = PARTS.filter((p) => p.type === 'weapon');
const DEFENSE_POOL = PARTS.filter((p) => p.type === 'shield' || p.type === 'hull');
const COMPUTER_DRIVE_POOL = PARTS.filter((p) => p.type === 'computer' || p.type === 'drive');
const ACTIVE_POOL = PARTS.filter((p) => p.active);

// Uniqueness by filtering the stratum to parts not already drawn — exactly
// one rng draw per slot either way. The fallback to the unfiltered pool is
// defensive only: no stratum can be exhausted by the five other slots.
function drawUniqueFrom(pool: { id: PartId }[], taken: Set<PartId>, rng: RngFn): PartId {
  const fresh = pool.filter((p) => !taken.has(p.id));
  const source = fresh.length > 0 ? fresh : pool;
  const id = source[Math.floor(rng() * source.length)].id;
  taken.add(id);
  return id;
}

// Iteration 21 (signature stock): each commander always finds their
// signature part in stock, at a discount — a cheap alternative to true
// exclusive item pools (a much bigger content/balance surface). No entry
// for the Merchant: 21.2 covers their doctrine entirely via the commodity
// lot (already guaranteed by commodityLotCap/commodityLotBuyCost) and the
// mercenary discount, with no additional part.
const SIGNATURE_PART: Partial<Record<CommanderId, PartId>> = {
  engineer: 'dcbay',
  spymaster: 'cloak',
  warlord: 'siege',
  admiral: 'uplink2',
};
const SIGNATURE_DISCOUNT = 2;

// The offer slot a signature part is force-inserted into if the normal
// stratified draw didn't already surface it — matched to the part's own
// type so a guaranteed slot never distorts the offer's usual balance (one
// weapon slot, one defense slot, etc. either way). Index into the fixed
// 6-slot layout drawShopOffers builds below.
const SIGNATURE_SLOT: Partial<Record<CommanderId, number>> = {
  engineer: 5, // dcbay: hull + active -> the active slot
  spymaster: 2, // cloak: shield -> the first defense slot
  warlord: 0, // siege: weapon -> the first weapon slot
  admiral: 4, // uplink2: computer + active -> the computer/drive slot
};

export function partCost(partId: PartId, commanderId: CommanderId | undefined): number {
  const base = getPart(partId).cost;
  if (commanderId && SIGNATURE_PART[commanderId] === partId) return Math.max(0, base - SIGNATURE_DISCOUNT);
  return base;
}

function drawShopOffers(rng: RngFn, commanderId?: CommanderId): PartId[] {
  const taken = new Set<PartId>();
  const offers = [
    drawUniqueFrom(WEAPON_POOL, taken, rng),
    drawUniqueFrom(WEAPON_POOL, taken, rng),
    drawUniqueFrom(DEFENSE_POOL, taken, rng),
    drawUniqueFrom(DEFENSE_POOL, taken, rng),
    drawUniqueFrom(COMPUTER_DRIVE_POOL, taken, rng),
    drawUniqueFrom(ACTIVE_POOL, taken, rng),
  ];
  const signaturePart = commanderId ? SIGNATURE_PART[commanderId] : undefined;
  const signatureSlot = commanderId ? SIGNATURE_SLOT[commanderId] : undefined;
  if (signaturePart && signatureSlot !== undefined && !offers.includes(signaturePart)) {
    offers[signatureSlot] = signaturePart;
  }
  return offers;
}

function drawRandomCard(rng: RngFn): CardId {
  return CARDS[Math.floor(rng() * CARDS.length)].id;
}

function pickFromPool(pool: EnemyDef[], rng: () => number): EnemyDef {
  return pool[Math.floor(rng() * pool.length)];
}

// --- Cargo (iteration 15.1) --------------------------------------------
// Same 5-credit tier the shop draws its mid parts from — a wreck field's
// find is exactly "a part you'd otherwise find in a shop," not a
// bespoke loot table.
const WRECK_FIELD_PART_POOL: PartId[] = PARTS.filter((p) => p.cost === 5).map((p) => p.id);

function randomWreckPart(rng: RngFn): PartId {
  return WRECK_FIELD_PART_POOL[Math.floor(rng() * WRECK_FIELD_PART_POOL.length)];
}

// Applies the cargo table's credit adjustment to an already-computed base
// reward. Patrol/command/untagged pass through unchanged — command's bonus
// is the card (wired separately in CONTINUE), not a credit change. Exported
// for a direct unit test of the wreck-field floor (winReward's own minimum
// of 4 can never actually reach the floor in an integration test).
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

// Addendum A.4: a ship holds at most 1 permanent upgrade — a second
// acquisition (elite reward, the interlude's Field promotion, or now a
// repair-yard overhaul) replaces the old one rather than stacking. The old
// one is simply gone (destroyed), same as any upgrade lost with its ship.
//
// Iteration 21 (the Warlord, tall): the Flagship alone may hold 2. A third
// pick still replaces rather than being refused outright — same "oldest
// simply gone" rule as the base case, just with room for one more before it
// kicks in. `slice(-cap)` keeps only the most recent `cap` entries either
// way, so this one function covers both caps without a separate branch.
function upgradeCapFor(ship: PlayerShipState, commanderId: CommanderId | undefined): number {
  return commanderId === 'warlord' && ship.frameId === 'cruiser' ? 2 : 1;
}
function withUpgrade(
  ship: PlayerShipState,
  upgradeId: UpgradeId,
  commanderId?: CommanderId,
): PlayerShipState {
  const cap = upgradeCapFor(ship, commanderId);
  return { ...ship, upgrades: [...ship.upgrades, upgradeId].slice(-cap) };
}

// Iteration 15.3: overhaul is locked out once every ship already carries a
// full complement of upgrades — swapping a player's own earned pick for a
// random one is never the better choice, so the option is withheld rather
// than offered as a trap. "Full complement" is per-ship since iteration 21
// (the Warlord's Flagship holds 2, not 1).
function everyShipAtUpgradeCap(fleet: PlayerShipState[], commanderId: CommanderId | undefined): boolean {
  return fleet.length > 0 && fleet.every((s) => s.upgrades.length >= upgradeCapFor(s, commanderId));
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
// retreat to. A heat-4 interception is the one exception to that
// exclusion (15.2): it can land on an event node too, but it "follows
// normal retreat rules" per spec — the player walked in on their own feet,
// they just got jumped once inside — so it falls through to the ordinary
// reachability check below instead.
export function hasLineOfRetreat(state: RunState): boolean {
  if (!state.position) return false;
  const columns = actColumns(state.map, state.act);
  const node = getNode(columns, state.position);
  if (node.type === 'event' && !state.interceptionActive) return false;
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
      const commissioned = state.shipsCommissioned ?? state.fleet.length;
      // One rng instance for the whole case — the Warlord branch below is
      // the only one that actually draws from it; nextCounter() naturally
      // reports 0 extra consumed when it doesn't, so it's always safe to
      // call unconditionally rather than needing an if/else on the action.
      const { rng, nextCounter } = runRng(state);

      // The Admiral (wide, iteration 21) inherits the old Warlord's free
      // starting Interceptor — the fleet begins at 2 ships either way, just
      // under the commander whose whole doctrine is "many hulls" now.
      const fleet =
        action.commanderId === 'admiral'
          ? [
              ...state.fleet,
              {
                frameId: 'interceptor' as const,
                equipped: ['ion'],
                damage: 0,
                upgrades: [],
                name: shipName(state.map.seed, commissioned, 'interceptor'),
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
          ? fleet.map((s, i) => (i === 0 ? withUpgrade(s, randomUpgradeIds(1, rng)[0], action.commanderId) : s))
          : fleet;

      return {
        ...state,
        phase: 'setup',
        commanderId: action.commanderId,
        fleet: finalFleet,
        shipsCommissioned: action.commanderId === 'admiral' ? commissioned + 1 : state.shipsCommissioned,
        rngCounter: nextCounter(),
      };
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
          // A recon job pays in intelligence itself now that there is no
          // intel currency: extra vision plus a couple of free reveals,
          // available to every commander (this is the job, not a perk).
          let reconState: RunState = { ...base, visionCol: base.visionCol + 2 };
          for (let i = 0; i < RECON_REVEALS; i++) {
            reconState = grantIntel(reconState, rng).state;
          }
          base = { ...reconState, activeQuest: undefined };
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
      // shop / repair / event — the three "dock" node types (15.2): each
      // costs +1 heat to enter, unless heat is already armed at 4
      // ("Hunted"), in which case the dock is never reached at all — a
      // hunter-killer squad replaces the node's content outright, paying a
      // normal winReward(col) on top of the map's usual prep/combat flow.
      // Combat/elite/boss/opener entries are never intercepted (they're
      // already a fight).
      if (state.heat >= MAX_HEAT) {
        const enemy = hunterKillerForAmbush(state.act, node.col);
        return {
          ...base,
          phase: 'prep',
          currentEnemy: enemy,
          currentCombatSeed: drawCombatSeed(rng),
          interceptionActive: true,
          rngCounter: nextCounter(),
        };
      }
      const heat = addHeat(state.heat, 1);

      if (node.type === 'shop') {
        return {
          ...base,
          phase: 'shop',
          shopOffers: drawShopOffers(rng, state.commanderId),
          shopQuestOffer: generateQuestOffer(columns, node, rng) ?? undefined,
          heat,
          rngCounter: nextCounter(),
        };
      }
      if (node.type === 'repair') {
        // 15.3: no auto-heal on arrival any more — the player chooses full
        // repair vs. overhaul next (REPAIR_CHOOSE). The 3 overhaul options
        // are drawn now regardless of which way they'll go, so a single
        // later dispatch can carry the pick without a second rng step.
        return {
          ...base,
          phase: 'repair',
          repairUpgradeOptions: randomUpgradeIds(3, rng),
          heat,
          rngCounter: nextCounter(),
        };
      }

      // event
      // 14.3: the defector's "take them aboard" choice schedules the pursuit
      // as the very next event node instead of rolling the pool — a one-off
      // forced follow-up, consumed here and then cleared.
      const eventId: EventId = state.pendingEventId ?? drawEvent(rng, state.lastEventId);
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
      if (action.partId === COMMODITY_LOT_PART_ID) return state; // sold via SELL_COMMODITY_LOT, never unequipped to inventory
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
      const fleetStats = deriveFleetStats(state.fleet, state.commanderId);
      if (!fleetHasWeapon(fleetStats)) return state;

      const fleetInput = deriveFleetForCombat(state.fleet, state.commanderId);
      // The combat seed was already drawn (and stored) when this fight was
      // set up, not now — a reload before Engage can never reroll it (9.1).
      let combat = initCombat(fleetInput, state.currentEnemy, state.currentCombatSeed, state.targetingStance);
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

    case 'PLAY_CARD': {
      if (state.phase !== 'combat' || !state.combat) return state;
      if (!state.hand.includes(action.cardId)) return state;
      if (!canPlayCard(state.combat, action.cardId)) return state;
      const combat = playCard(state.combat, action.cardId);
      return { ...state, combat, hand: removeOnce(state.hand, action.cardId) };
    }

    // Iteration 13: click an enemy ship in the theater to make every player
    // die fire at it while it lives; clicking the current priority again
    // clears it. No RNG — determinism untouched.
    case 'SET_PRIORITY_TARGET': {
      if (state.phase !== 'combat' || !state.combat || state.combat.winner) return state;
      const index = state.combat.priorityTargetIndex === action.index ? null : action.index;
      return { ...state, combat: setPriorityTarget(state.combat, index) };
    }

    case 'CONTINUE': {
      if (state.phase !== 'combat' || !state.combat || !state.combat.winner) return state;
      const { rng, nextCounter } = runRng(state);
      const outcome = combatOutcome(state.combat);
      const returnedCards = unconsumedContingentCards(state.combat);

      // Iteration 18: fight-end stat attribution — per-ship kills, run-wide
      // damage totals. Computed once here, folded into every branch below.
      const fightStats = attributeFightStats(state.combat.log, state.fleet.length);
      const baseStats = state.runStats ?? emptyRunStats();

      if (outcome.winner === 'enemy') {
        const runStats: RunStats = {
          ...baseStats,
          damageDealt: baseStats.damageDealt + fightStats.damageDealt,
          damageTaken: baseStats.damageTaken + fightStats.damageTaken,
        };
        return { ...state, phase: 'defeat', pendingAmbushBonus: undefined, runStats, rngCounter: nextCounter() };
      }

      // 14.3: a win-conditional bonus from an event ambush (e.g. the
      // defector-pursuit's bounty) — the event resolver couldn't know the
      // fight's outcome at choice time, so it rides along on RunState until
      // now. Consumed (and cleared) regardless of which branch below pays
      // out, so it can never leak into an unrelated later fight.
      const ambushBonus = state.pendingAmbushBonus;

      let inventory = ambushBonus?.partId ? [...state.inventory, ambushBonus.partId] : [...state.inventory];
      const salvagedParts: PartId[] = [];
      const lostShips: string[] = [];
      const survivingFleet: PlayerShipState[] = [];
      let carrierDestroyed = false;
      state.fleet.forEach((ship, i) => {
        // A hired mercenary is good for exactly this one fight — it leaves
        // the fleet the moment combat resolves regardless of outcome, with
        // no salvage and no ships-lost entry. It fought; it's not owed
        // anything beyond that.
        if (ship.mercenary) return;
        const shipOutcome = outcome.playerShips[i];
        if (shipOutcome.destroyed) {
          // Parts salvage back to inventory; upgrades are lost with the
          // ship — that's what makes a capital ship's upgrades feel earned.
          // Cargo pods and commodity lots are not real parts — lost with
          // the ship, not salvaged.
          const salvage = ship.equipped.filter(isSalvageablePart);
          inventory = [...inventory, ...salvage];
          salvagedParts.push(...salvage);
          lostShips.push(playerShipLabel(state.fleet, i));
          if (state.activeQuest?.archetype === 'delivery' && state.activeQuest.carrierShipIndex === i) {
            carrierDestroyed = true;
          }
        } else {
          survivingFleet.push({
            ...ship,
            damage: shipOutcome.endDamage,
            kills: (ship.kills ?? 0) + fightStats.kills[i],
            fightsSurvived: (ship.fightsSurvived ?? 0) + 1,
          });
        }
      });

      // Iteration 18: the run's cumulative record, after this win.
      const runStatsAfterWin: RunStats = {
        ...baseStats,
        fightsWon: baseStats.fightsWon + 1,
        shipsLost: [...baseStats.shipsLost, ...lostShips],
        damageDealt: baseStats.damageDealt + fightStats.damageDealt,
        damageTaken: baseStats.damageTaken + fightStats.damageTaken,
      };
      // A delivery quest's carrier dying fails the quest silently — the pod
      // (and any reward) goes down with the ship, no separate penalty.
      const activeQuestAfterFight = carrierDestroyed ? undefined : state.activeQuest;

      const col = state.position?.col ?? 0;
      const globalCol = globalColumn(state.act, col);
      const isBoss = state.position?.col === BOSS_COLUMN;
      // 15.2: any won fight vents heat — winning leaves no one to report
      // your position. An interception win is the one exception: heat
      // resets to 0 outright rather than just stepping down by 1 (they
      // found you either way; the track restarts clean).
      const heatAfterWin = state.interceptionActive ? 0 : addHeat(state.heat, -1);

      if (isBoss && state.act === 2) {
        return {
          ...state,
          phase: 'victory',
          fleet: survivingFleet,
          inventory,
          combat: undefined,
          activeQuest: activeQuestAfterFight,
          pendingAmbushBonus: undefined,
          heat: heatAfterWin,
          interceptionActive: undefined,
          runStats: runStatsAfterWin,
          rngCounter: nextCounter(),
        };
      }
      if (isBoss && state.act === 1) {
        // The act-1 boss pays like an elite at its column — the only boss
        // that pays, since the run continues — but is not an elite for
        // reward-screen purposes: no card, no upgrade pick, straight into
        // the interlude (no shop between acts).
        const creditsEarned = eliteReward(globalCol);
        return {
          ...state,
          phase: 'interlude',
          fleet: survivingFleet,
          inventory,
          credits: state.credits + creditsEarned,
          hand: [...state.hand, ...returnedCards],
          combat: undefined,
          currentEnemy: undefined,
          activeQuest: activeQuestAfterFight,
          pendingAmbushBonus: undefined,
          heat: heatAfterWin, // moot — INTERLUDE_CHOOSE resets to 0 regardless, kept for consistency
          interceptionActive: undefined,
          runStats: runStatsAfterWin,
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
      // Cargo tags (15.1) only ever land on plain 'combat' nodes — elites,
      // the boss, the opener, and a heat-4 interception's stand-in fight
      // are all excluded here, though only the first two are structurally
      // possible (the others' positions never carry a `.cargo` anyway).
      const columns = actColumns(state.map, state.act);
      const node = state.position ? getNode(columns, state.position) : undefined;
      const cargoTag: CargoTag | undefined = !isElite && !state.interceptionActive ? node?.cargo : undefined;
      const baseReward = applyCargoReward(cargoTag, isElite ? eliteReward(globalCol) : winReward(globalCol));
      let hand = [...state.hand, ...returnedCards];
      let cardGained: CardId | undefined;
      let cardInsteadCredits: number | undefined;

      // A command-ship cargo tag grants a reaction card exactly like an
      // elite kill does (same hand-full -> +4cr fallback).
      if (isElite || cargoTag === 'command') {
        if (hand.length < MAX_HAND_SIZE) {
          cardGained = drawRandomCard(rng);
          hand = [...hand, cardGained];
        } else {
          cardInsteadCredits = 4;
        }
      }

      // A wreck-field cargo tag also drops a random 5-credit-tier part
      // straight into inventory, on top of its (reduced) credit payout.
      if (cargoTag === 'wreck') {
        inventory = [...inventory, randomWreckPart(rng)];
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
        if (totalHeal === 0) return ship;
        // The Engineer banks a heal that outran actual damage instead of
        // wasting it — including a ship that's already at 0 damage, where
        // the WHOLE heal is excess. Everyone else keeps the plain no-op
        // skip (nothing to gain from computing a repair that does nothing).
        if (state.commanderId === 'engineer') return applyRepairBanking(ship, totalHeal);
        if (ship.damage === 0) return ship;
        return { ...ship, damage: Math.max(0, ship.damage - totalHeal) };
      });

      const bountyBonus = isBounty ? BOUNTY_BONUS_CREDITS : 0;
      const merchantBonus = state.commanderId === 'merchant' ? 2 : 0;
      const ambushBonusCredits = ambushBonus?.credits ?? 0;
      const creditsEarned =
        baseReward + bountyBonus + merchantBonus + (cardInsteadCredits ?? 0) + salvageTotal + ambushBonusCredits;
      const credits = state.credits + creditsEarned;
      const upgradeOptions = isElite || isBounty ? randomUpgradeIds(3, rng) : undefined;

      // The Spymaster's free intelligence, drawn from the same rng stream so
      // the whole run stays reproducible from its seed.
      const intelDraw = grantCommanderIntel(state, rng);

      const pendingReward: RewardSummary = {
        credits: creditsEarned,
        creditsTotal: credits,
        intelText: intelDraw.text,
        cardGained,
        cardInsteadCredits,
        salvagedParts,
        lostShips,
        upgradeOptions,
      };

      return {
        ...intelDraw.state,
        phase: 'reward',
        fleet: healedFleet,
        inventory,
        credits,
        hand,
        combat: undefined,
        currentEnemy: undefined,
        pendingReward,
        pendingAmbushBonus: undefined,
        activeQuest: isBounty ? undefined : activeQuestAfterFight,
        heat: heatAfterWin,
        interceptionActive: undefined,
        runStats: runStatsAfterWin,
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
      // Iteration 18: kills earned before withdrawing still count, and
      // surviving a withdrawal is still surviving a fight.
      const fightStats = attributeFightStats(state.combat.log, state.fleet.length);
      const baseStats = state.runStats ?? emptyRunStats();
      let inventory = [...state.inventory];
      const survivingFleet: PlayerShipState[] = [];
      const lostShips: string[] = [];
      let carrierDestroyed = false;
      state.fleet.forEach((ship, i) => {
        // Same rule as a resolved combat (CONTINUE): a mercenary leaves the
        // fleet the moment this fight is over, win, loss, or — here —
        // withdrawal. Without this, a mercenary that happened to survive to
        // the withdraw would wrongly persist into the next fight for free.
        if (ship.mercenary) return;
        const combatShip = state.combat!.playerShips[i];
        const destroyed = combatShip.damage >= combatShip.stats.hp;
        if (destroyed) {
          inventory = [...inventory, ...ship.equipped.filter(isSalvageablePart)];
          lostShips.push(playerShipLabel(state.fleet, i));
          if (state.activeQuest?.archetype === 'delivery' && state.activeQuest.carrierShipIndex === i) {
            carrierDestroyed = true;
          }
        } else {
          survivingFleet.push({
            ...ship,
            damage: Math.min(combatShip.damage, combatShip.stats.hp),
            kills: (ship.kills ?? 0) + fightStats.kills[i],
            fightsSurvived: (ship.fightsSurvived ?? 0) + 1,
          });
        }
      });
      const runStats: RunStats = {
        ...baseStats,
        fightsWithdrawn: baseStats.fightsWithdrawn + 1,
        shipsLost: [...baseStats.shipsLost, ...lostShips],
        damageDealt: baseStats.damageDealt + fightStats.damageDealt,
        damageTaken: baseStats.damageTaken + fightStats.damageTaken,
      };

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

      // 15.2: withdrawing costs heat too (they watched you run) — except an
      // interception, which always resets to 0 regardless of outcome: they
      // found you either way, so the track restarts clean rather than
      // stepping up from an already-armed 4.
      const heat = state.interceptionActive ? 0 : addHeat(state.heat, 1);

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
        heat,
        interceptionActive: undefined,
        runStats,
        pendingAmbushBonus: undefined, // withdrawing from an event ambush forfeits any win-conditional bonus
      };
    }

    case 'PICK_UPGRADE': {
      if (state.phase !== 'reward' || !state.pendingReward?.upgradeOptions) return state;
      if (!state.pendingReward.upgradeOptions.includes(action.upgradeId)) return state;
      const ship = state.fleet[action.shipIndex];
      if (!ship) return state;
      const fleet = state.fleet.map((s, i) =>
        i === action.shipIndex ? withUpgrade(s, action.upgradeId, state.commanderId) : s,
      );
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
        fleet = state.fleet.map((s, i) => (i === action.shipIndex ? withUpgrade(s, upgradeId, state.commanderId) : s));
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
        heat: 0, // 15.2: crossing the sector border shakes pursuit, same as the fog reset
        rngCounter: nextCounter(),
      };
    }

    case 'BUY_PART': {
      if (state.phase !== 'shop' || !state.shopOffers) return state;
      const partId = state.shopOffers[action.offerIndex];
      if (!partId) return state;
      const cost = partCost(partId, state.commanderId);
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
      if (state.fleet.length >= fleetCap(state.commanderId)) return state;
      const frame = getFrame(action.frameId); // the Flagship ('cruiser') is never purchasable
      const cost = frameCost(frame.cost, action.frameId, state.commanderId);
      if (state.credits < cost) return state;
      const commissioned = state.shipsCommissioned ?? state.fleet.length;
      return {
        ...state,
        credits: state.credits - cost,
        fleet: [
          ...state.fleet,
          {
            frameId: action.frameId,
            equipped: [...STARTING_FIT[action.frameId]],
            damage: 0,
            upgrades: [],
            name: shipName(state.map.seed, commissioned, action.frameId),
            kills: 0,
            fightsSurvived: 0,
          },
        ],
        shipsCommissioned: commissioned + 1,
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
      const salvage = ship.equipped.filter(isSalvageablePart);
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

    case 'BUY_COMMODITY_LOT': {
      if (state.phase !== 'shop') return state;
      const cost = commodityLotBuyCost(state.commanderId);
      if (state.credits < cost) return state;
      // Cap 1 normally, 2 for the Merchant — a second lot for anyone else
      // would just be a second bet on the same trade, not a new decision.
      const lotsCarried = state.fleet.filter((s) => s.equipped.includes(COMMODITY_LOT_PART_ID)).length;
      if (lotsCarried >= commodityLotCap(state.commanderId)) return state;
      const ship = state.fleet[action.shipIndex];
      if (!ship) return state;
      // A mercenary leaves the fleet — with whatever it's carrying — the
      // moment its one fight resolves. Refusing here rather than letting the
      // lot silently vanish later keeps the loss a rule, not a trap.
      if (ship.mercenary) return state;
      if (ship.equipped.length >= effectiveSlots(ship.frameId, ship.upgrades)) return state;
      const boughtAtGlobalColumn = globalColumn(state.act, state.position?.col ?? 0);
      const fleet = state.fleet.map((s, i) =>
        i === action.shipIndex
          ? { ...s, equipped: [...s.equipped, COMMODITY_LOT_PART_ID], commodityLotBoughtAtGlobalColumn: boughtAtGlobalColumn }
          : s,
      );
      return { ...state, fleet, credits: state.credits - cost };
    }

    case 'SELL_COMMODITY_LOT': {
      if (state.phase !== 'shop') return state;
      const here = globalColumn(state.act, state.position?.col ?? 0);
      // Sells EVERY lot that's eligible (bought at an earlier station) in
      // one action, not just one — with the Merchant able to carry 2 at
      // once, requiring a second click to clear the second lot would be
      // friction the single-lot case never had. Same-visit flipping is
      // impossible by construction (shops are forward-only nodes the
      // player can't revisit), but the per-ship check stands on its own
      // regardless of how a future map feature might change that.
      let sold = 0;
      const fleet = state.fleet.map((s) => {
        const boughtAt = s.commodityLotBoughtAtGlobalColumn;
        if (!s.equipped.includes(COMMODITY_LOT_PART_ID) || boughtAt === undefined || here <= boughtAt) return s;
        sold++;
        return {
          ...s,
          equipped: removeOnce(s.equipped, COMMODITY_LOT_PART_ID),
          commodityLotBoughtAtGlobalColumn: undefined,
        };
      });
      if (sold === 0) return state;
      return { ...state, fleet, credits: state.credits + sold * COMMODITY_LOT_SELL_PRICE };
    }

    case 'BUY_MERCENARY': {
      if (state.phase !== 'shop') return state;
      if (state.fleet.length >= fleetCap(state.commanderId)) return state;
      const cost = mercenaryCost(state.commanderId);
      if (state.credits < cost) return state;
      return {
        ...state,
        credits: state.credits - cost,
        fleet: [
          ...state.fleet,
          {
            frameId: 'interceptor',
            equipped: ['ion'],
            damage: 0,
            upgrades: [],
            name: MERCENARY_SHIP_NAME,
            kills: 0,
            fightsSurvived: 0,
            mercenary: true,
          },
        ],
        // Deliberately NOT counted against shipsCommissioned — the naming
        // counter is for the fleet's real, permanent roster (ships that
        // earn a seeded name); a one-fight hire has a literal name instead
        // and shouldn't shift later ships' names by consuming a slot in
        // that sequence.
      };
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
      return {
        ...state,
        credits: state.credits - cost,
        shopOffers: drawShopOffers(rng, state.commanderId),
        rngCounter: nextCounter(),
      };
    }

    case 'LEAVE_SHOP': {
      if (state.phase !== 'shop') return state;
      return {
        ...state,
        phase: 'map',
        shopOffers: undefined,
        shopQuestOffer: undefined,
        currentEnemy: undefined,
      };
    }

    case 'REPAIR_CHOOSE': {
      // The choosing sub-state: arrived (repairUpgradeOptions drawn), not
      // yet resolved (repairSummary still undefined). A second dispatch
      // once resolved is a no-op — same "no double-dispatch" rule as
      // EVENT_CHOOSE below.
      if (state.phase !== 'repair' || state.repairSummary !== undefined) return state;

      if (action.choice === 'full') {
        const { fleet, totalRepaired } = repairFleet(state.fleet, state.commanderId === 'engineer');
        return { ...state, fleet, repairSummary: repairSummaryText(totalRepaired, state.fleet.length) };
      }

      // Overhaul: no healing — attach one of the 3 pre-drawn upgrades to a
      // chosen ship instead. Locked out once every ship already carries a
      // full complement of upgrades (per-ship cap — see everyShipAtUpgradeCap).
      if (!state.repairUpgradeOptions?.includes(action.upgradeId)) return state;
      if (everyShipAtUpgradeCap(state.fleet, state.commanderId)) return state;
      const ship = state.fleet[action.shipIndex];
      if (!ship) return state;
      const fleet = state.fleet.map((s, i) =>
        i === action.shipIndex ? withUpgrade(s, action.upgradeId, state.commanderId) : s,
      );
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
      if (option.chooseCard && (action.cardId === undefined || !state.hand.includes(action.cardId))) return state;

      const { rng, nextCounter } = runRng(state);
      const {
        state: nextState,
        outcomeText,
        ambushEnemy,
        ambushBonus,
      } = resolveEventChoice(state.currentEvent.eventId, action.choiceIndex, state, rng, {
        shipIndex: action.shipIndex,
        cardId: action.cardId,
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
          currentEnemy: ambushEnemy,
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
