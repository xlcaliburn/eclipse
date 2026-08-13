import { mulberry32, resumeRng, rollD6 } from './rng';
import type { RngFn } from './rng';
import { resolveHit } from './hitRule';
import { hasProtocol } from './protocols';
import type { ProtocolId } from './protocols';
import type { CombatEvent, EnemyDef, PartId, Rarity, ShipStats, Side } from './types';

const MAX_CANNON_ROUNDS = 30;

// Iteration 17 ("Outspeed"): a ship whose effective initiative beats the
// fastest surviving opposing ship's by this much or more gets one extra
// cannons-only activation at the end of the round. Exported so every piece
// of UI copy (badges, the enemy-panel readout) derives the number from here
// instead of hardcoding "4" — see `qualifiesForOutspeed`.
export const OUTSPEED_GAP = 4;

// Iteration 62 (fire-control convergence): playtest report of 18+-round
// fights where a 0-computer side vs. 2+ piloting hits only on natural 6s
// forever (no cap on runToEnd, no withdraw since 51.3, orders/actives all
// spent by round ~4 — pure button-holding). From CONVERGENCE_ONSET_ROUND on,
// EVERY ship on BOTH sides gains a cumulative +1 computer per round —
// symmetric (it barely changes who wins a stalled matchup, only how long the
// coin takes to land), uncapped (the natural-1-always-misses rule keeps the
// practical hit ceiling at 5/6, so an uncapped ramp can't create a sure
// thing). Round 0 (the missile phase) can never reach the onset round, so
// missiles are naturally unaffected — no special-casing needed anywhere.
export const CONVERGENCE_ONSET_ROUND = 8;
export function convergenceBonus(round: number): number {
  return Math.max(0, round - (CONVERGENCE_ONSET_ROUND - 1));
}

export interface CombatShip {
  side: Side;
  index: number; // index within its own side
  stats: ShipStats;
  damage: number;
  reactiveArmorRemaining: number; // hits still negated this whole combat (does not replenish per round)
  ablativeRemaining: number; // temporary HP absorbed before real HP, this whole combat (does not persist between fights)
  jinkAvailable: boolean; // iteration 8: the first hit this combat misses instead, consumed before reactive armor
}

export interface RoundModifiers {
  // Iteration 66 (Jamming sweep): can now go NEGATIVE — verified sane at
  // every read site (effectiveInitiative/byEffectiveInitiative/
  // fastestAliveInitiative/qualifiesForOutspeed are all plain arithmetic on
  // this value, no clamping assumed anywhere), so a jammed fleet simply
  // sorts and outspeed-qualifies as if genuinely slower this round — no
  // special-casing needed.
  initiativeBonus: number;
  computerBonus: number;
  playerShieldBonus: number; // shield modulator active: +2 shield to all player ships this round
  overrideShipIndices: number[]; // fire-control override active: these player ships reroll a missed die once
  evadingShipIndices: number[]; // emergency thrusters active: these player ships can't be targeted and don't fire
  chaffShipIndices: number[]; // chaff launcher active: natural 6s against these player ships resolve as normal rolls
  // Iteration 23 (ECM pod): the first part to touch the ENEMY side's
  // effective stats instead of the player's own — everything above this
  // line only ever modifies player ships. (Shield disruptor used to be
  // the other one, reducing enemy piloting; reworked 2026-08-07 into
  // Evasion suite, a player-side-only permanent bonus — see its
  // 'disruptor' case in useActive below, no longer a round modifier.)
  enemyComputerPenalty: number;
  // Iteration 28 (Alpha doctrine): a per-round derived flag, not a played
  // effect — computed fresh in advanceRound from CombatState.alphaDoctrineActive
  // and the current round number, not carried in freshRoundModifiers()'s
  // "armed actives reset every round" bag. True for player defenders during
  // the opening exchange (missile phase + cannon round 1) when the protocol
  // is active.
  playerBaseShieldZeroed: boolean;
  // Iteration 48 (fleet orders): the Brace order's target — like an evading
  // ship, it fires nothing this round, but UNLIKE evade it stays targetable
  // (legalDefenders doesn't exclude it) and gets a flat +2 piloting instead
  // of full immunity. Distinct list from evadingShipIndices on both counts.
  bracingShipIndices: number[];
  // Iteration 48: the Exploit weakness order's target (Spymaster only) — the
  // whole player fleet's dice gain +2 computer against this one enemy ship
  // for the round. Null when no order is armed, or the marked ship has since
  // died (dice simply never resolve against a dead target, so no explicit
  // clear is needed — see fireShip's own comment).
  markedEnemyIndex: number | null;
  // Iteration 66 (fleet doctrine progression): the magnitude of the
  // markedEnemyIndex bonus above — Exploit weakness sets 2 (unchanged),
  // Focus fire (the everyone-else, drawback-carrying cousin) sets 1.
  // Meaningless while markedEnemyIndex is null.
  markedEnemyBonus: number;
  // Iteration 66: Focus fire's drawback — a flat computer penalty applied
  // to player dice landing on any enemy OTHER than markedEnemyIndex. 0 for
  // Exploit weakness (no drawback, D3) and every other order; only Focus
  // fire's issueOrder case ever sets this nonzero.
  markedEnemyOffPenalty: number;
  // Iteration 66: Patch crews' target — like Brace, fires nothing this
  // round, but grants no piloting bonus (the ship is healing, not
  // maneuvering), so it can't reuse bracingShipIndices.
  heldFireShipIndices: number[];
  // Iteration 66: Bulwark's target (Brace II) — +2 piloting in ANY phase
  // (not phase-scoped like Brace's braceBonus) and, unlike Brace, the ship
  // keeps firing normally — so this deliberately does NOT feed the
  // fires-nothing checks bracingShipIndices/heldFireShipIndices do.
  bulwarkShipIndices: number[];
  // Iteration 66: Focused barrage's target — that ship's dice deal +1
  // damage this round, folded in wherever weapon.damage is read (same
  // iteration-62 convergenceBonus rule: before any downstream use/log).
  // null when no order is armed this round.
  damageBoostShipIndex: number | null;
  // Iteration 63.3 (Reload drones): armed by ANY one ship's active — the
  // effect itself is fleet-wide ("every ship fires its missiles once
  // more"), so this is a plain flag, not a per-ship list like
  // overrideShipIndices/evadingShipIndices above. Consumed at the end of
  // THIS round's resolution in advanceRound, then cleared like every other
  // armed active when freshRoundModifiers() resets for the next round.
  reloadDronesArmed: boolean;
}

// A plain, serializable snapshot of an in-progress (or finished) fight. The
// resumable engine (initCombat/advanceRound/runToEnd) is the single source
// of truth for combat — the original one-shot `resolveCombat` from
// iteration 1/2 (then living in resolver.ts) was deleted in 47.2b once it
// had zero production callers left; only `resolveHit`, the shared hit-math
// primitive both engines called, survives (now in hitRule.ts).
export type TargetingStance = 'weakest' | 'strongest';

// Iteration 48 (fleet orders), rewritten iteration 66 (fleet doctrine
// progression): the fleet's order menu is no longer a fixed, always-the-same
// 3/4-order set. RunState.knownOrders tracks which of the ids below this
// run's fleet has EARNED — via command drafts at 4/8/12 combat wins (see
// reducer.ts) — and that set only ever grows, permanently, for the rest of
// the run. The line that still must not be crossed (iteration 35 removed
// reaction cards for exactly this reason, and orders must not reintroduce
// the shape under a new name): nothing is drawn, spent, or consumed PER
// FIGHT — an earned order is a permanent unlock, the menu is fixed within
// any one fight, and issuing one still only spends a command point, never a
// card from a hand. 'exploit-weakness' alone stays commander-gated on top of
// the known-orders check — see CombatState.exploitEnabled.
export type FleetOrderId =
  | 'attack-run'
  | 'evasive-pattern'
  | 'brace'
  | 'exploit-weakness'
  | 'patch-crews'
  | 'countermeasures'
  | 'attack-run-2'
  | 'evasive-pattern-2'
  | 'focus-fire'
  | 'jamming-sweep'
  | 'pd-screen'
  | 'focused-barrage'
  | 'all-ahead-full'
  | 'bulwark';

// The orders that pick a ship rather than issuing immediately — shared
// between CombatScreen's pick-mode state and CombatFleetView's per-side
// click override, so the two can't drift on which orders need one.
export type TargetedOrderId = Extract<
  FleetOrderId,
  'brace' | 'exploit-weakness' | 'patch-crews' | 'focus-fire' | 'focused-barrage' | 'bulwark'
>;

// New runs start knowing just these two (D2: Brace leaves the default kit,
// earned back — as Bulwark's stronger legendary form, or itself — through
// play). Exported so reducer.ts (seeding RunState.knownOrders) and every
// `state.knownOrders ?? DEFAULT_KNOWN_ORDERS` read site share one constant.
export const DEFAULT_KNOWN_ORDERS: FleetOrderId[] = ['attack-run', 'evasive-pattern'];

// Which base order id a drafted improvement REPLACES in knownOrders (D4:
// the two never coexist — Attack run II swaps Attack run out outright, not
// alongside it). Bulwark is Brace's legendary replacement, not a numbered
// mark, but follows the identical rule. Consulted by reducer.ts's
// ORDER_DRAFT_CHOOSE and by the command bar's display filter.
export const ORDER_REPLACES: Partial<Record<FleetOrderId, FleetOrderId>> = {
  'attack-run-2': 'attack-run',
  'evasive-pattern-2': 'evasive-pattern',
  bulwark: 'brace',
};

// Rarity of each order, for the draft-offer pools (reducer.ts) and the
// wiki's catalog table. The rarity-drawback gradient is a design LAW for
// this catalog (common = clear drawback, rare = slight drawback, epic+ = no
// drawback) — see plans/iteration-66.md. Attack run/Evasive pattern are the
// two baseline orders (never themselves drafted — only their II marks are);
// Exploit weakness is the Spymaster-exclusive epic-tier order granted at
// commander pick, never offered by a draft (D3) — see reducer.ts's
// ORDER_DRAFT_POOLS, which deliberately omits it.
export const ORDER_RARITY: Record<FleetOrderId, Rarity> = {
  'attack-run': 'common',
  'evasive-pattern': 'common',
  brace: 'common',
  'patch-crews': 'common',
  countermeasures: 'common',
  'attack-run-2': 'rare',
  'evasive-pattern-2': 'rare',
  'focus-fire': 'rare',
  'jamming-sweep': 'rare',
  'pd-screen': 'epic',
  'focused-barrage': 'epic',
  'exploit-weakness': 'epic',
  'all-ahead-full': 'legendary',
  bulwark: 'legendary',
};

export interface CombatState {
  seed: number;
  rngCounter: number; // rollD6 calls consumed so far, for resuming
  round: number; // next round to resolve; 0 = missile phase, 1+ = cannon rounds
  playerShips: CombatShip[];
  enemyShips: CombatShip[];
  roundModifiers: RoundModifiers;
  usedActives: { shipIndex: number; abilityIndex: number }[]; // active parts already spent this combat
  // Iteration 63.3 (Reload drones): flak's "cancels N enemy missile dice
  // EACH COMBAT" promise used to be free — the pool was recomputed fresh
  // every advanceRound call but only ever given nonzero values during the
  // one missile-phase round (round 0), so it was never actually spent
  // across more than one call. Reload drones adds a SECOND missile-firing
  // opportunity, possibly in a later round, so the pool now genuinely has
  // to persist and be decremented across advanceRound calls — computed
  // once in initCombat from each side's flak at the fight's start, carried
  // forward, and only ever consumed by an actual missile-phase fireShip
  // call (round 0's real missile phase, or a reload volley in any round).
  flakRemaining: { player: number; enemy: number };
  // Iteration 9.4: the player's fleet-wide targeting doctrine for this fight
  // — set once at initCombat (from RunState, persists between fights until
  // the player changes it on the prep screen), applies to every player die.
  // 2026-08-08: enemy targeting is random by default (sniper-class ships
  // are the exception, still greedy lowest-HP) — untouched by this either
  // way, this doctrine has only ever been a player-side knob.
  targetingStance: TargetingStance;
  // Iteration 13: a manually-picked enemy ship (flattened index) that ALL
  // player dice fire at while it lives — clicked in the combat theater.
  // Beats the stance and the siege cannon's per-die override (player intent
  // outranks doctrine); dead/absent priority falls back to the stance.
  // Additive + optional, so pre-13 saves stay loadable.
  priorityTargetIndex?: number | null;
  log: CombatEvent[];
  winner?: Side;
  // Iteration 28 (Protocols): set once at initCombat from RunState.protocols,
  // never changes mid-fight. `playerOutspeedGap` is asymmetric by design —
  // it only ever loosens the PLAYER side's Outspeed qualification (Overspeed
  // protocols); the enemy always still needs the full OUTSPEED_GAP, or the
  // protocol would silently speed up every enemy in the game too.
  playerOutspeedGap: number;
  alphaDoctrineActive: boolean;
  // Iteration 48 (fleet orders): a fleet-wide budget, set once at initCombat
  // and never replenished mid-fight (unlike actives, which are per-part —
  // this is a single shared pool). Spent 1 per issued order.
  commandPoints: number;
  // Iteration 48: Spymaster-only — set once at initCombat from
  // commanderId, gates whether 'exploit-weakness' is a legal order at all
  // (not just shown-disabled; see canIssueOrder).
  exploitEnabled: boolean;
  // Iteration 48: the order armed for the round about to resolve, or null.
  // At most one per round (canIssueOrder refuses a second); cleared by
  // advanceRound alongside the round-modifier reset.
  orderThisRound: FleetOrderId | null;
  // 51.1 (Spymaster "Forewarned"): set once at initCombat from
  // CombatOrderOptions.openingComputerBonus, never changes mid-fight — see
  // that field's own comment. Read with `?? 0` at its one consuming site
  // (advanceRound) rather than bumping SAVE_VERSION: old mid-fight saves
  // lack this key, and an `undefined ?? 0` numeric add degrades safely
  // (unlike iteration 48's bracingShipIndices, which needed a real bump
  // because `.includes()` throws on undefined at multiple read sites).
  openingComputerBonus: number;
  // Iteration 66 (fleet doctrine progression): the orders THIS fight's
  // fleet has earned, set once at initCombat from
  // CombatOrderOptions.knownOrders and never changed mid-fight. Optional —
  // deliberately NOT defaulted here (no SAVE_VERSION bump for this
  // iteration) — every consuming site (canIssueOrder, the command bar)
  // reads it as `(state.knownOrders ?? DEFAULT_KNOWN_ORDERS)`, so an old
  // mid-fight save missing this key simply loads as a baseline-kit fleet
  // for the rest of that one fight. See the iteration-48-lesson comment on
  // openingComputerBonus above for why this discipline (default-at-every-
  // read, not default-at-declaration) is required whenever a field is read
  // with `.includes()` rather than a plain numeric add.
  knownOrders?: FleetOrderId[];
}

export interface PlayerFleetInput {
  stats: ShipStats;
  initialDamage: number;
}

function remainingHp(ship: CombatShip): number {
  return ship.stats.hp - ship.damage;
}

function isAlive(ship: CombatShip): boolean {
  return remainingHp(ship) > 0;
}

// 47.5g: the fleet-wide flak pool — summed across every alive ship's own
// `flak` stat — computed inline 3 times (2 byte-identical, the 3rd
// specifically written to agree with the other two, per its own comment).
function totalFlak(ships: CombatShip[]): number {
  return ships.filter(isAlive).reduce((sum, s) => sum + (s.stats.flak ?? 0), 0);
}

// Greedy lowest- (or, for the siege cannon, highest-) remaining-HP
// targeting. A taunting defender, if alive, overrides everything — every
// die must go to a taunter (still narrowed by HP preference among them).
// Absent a taunter, cloaked defenders are excluded from consideration
// UNLESS every alive defender is cloaked (the all-cloaked exception, so
// combat can never stall with no legal target). Taunt beats cloak: a
// cloaked taunter is still targetable. Only player parts ever set
// `taunt`/`cloak`, so both are no-ops when the defenders are an enemy group.
// `ignoreTaunt` (iteration 42, Homing missile): skips the taunt-forcing
// branch entirely — the cloak all-cloaked exception below still applies.
// `randomRng` (2026-08-08): when given, picks uniformly among the same
// candidate pool instead of the greedy HP comparison below — the enemy's
// default targeting now (see fireShip), with sniper-class ships (
// stats.targetsLowestHp) the deliberate opt-out that still passes nothing
// here and falls through to the greedy behavior.
// 47.5o: an options object instead of 3 positional booleans — call sites
// like `pickTarget(defenders, false, true)` were a boolean trap (which
// flag is which, at the call site, with no names to read).
function pickTarget(
  defenders: CombatShip[],
  opts: { preferHighest?: boolean; ignoreTaunt?: boolean; randomRng?: RngFn } = {},
): CombatShip | null {
  const { preferHighest = false, ignoreTaunt = false, randomRng } = opts;
  const alive = defenders.filter(isAlive);
  if (alive.length === 0) return null;

  const taunters = ignoreTaunt ? [] : alive.filter((d) => d.stats.taunt);
  let candidates: CombatShip[];
  if (taunters.length > 0) {
    candidates = taunters;
  } else {
    const nonCloaked = alive.filter((d) => !d.stats.cloak);
    candidates = nonCloaked.length > 0 ? nonCloaked : alive;
  }

  if (randomRng) {
    return candidates[Math.floor(randomRng() * candidates.length)];
  }

  let best: CombatShip | null = null;
  for (const ship of candidates) {
    if (best === null) {
      best = ship;
      continue;
    }
    const better = preferHighest ? remainingHp(ship) > remainingHp(best) : remainingHp(ship) < remainingHp(best);
    if (better) best = ship;
  }
  return best;
}

// 2026-08-08: a derived, independently-seeded generator for "which target
// did this enemy ship randomly commit to this round" — NOT drawn from the
// shared, resumable dice-roll rng (that would need the incoming-fire
// preview, which runs ahead of the round and must never consume rng, to
// somehow agree with what fireShip rolls later). Pure function of values
// both already know (the fight's own seed, the round number, the shooter's
// flattened index), so the preview and the real resolution always compute
// the identical pick with no shared state at all. One draw only — that's
// the ship's target for every die it fires this round (missile phase and
// any bonus/Outspeed cannon activation share the same round number, so
// they agree too), not re-rolled per die.
function enemyTargetRng(seed: number, round: number, shipIndex: number): RngFn {
  return mulberry32((seed ^ Math.imul(round + 1, 0x9e3779b1) ^ Math.imul(shipIndex + 1, 0x85ebca6b)) >>> 0);
}

// Emergency thrusters (evasive burn) make a ship untargetable for the round
// with no fallback — unlike cloak, if every defender happens to be evading,
// the attacker's die simply finds no legal target and isn't rolled.
function legalDefenders(
  opponents: CombatShip[],
  roundModifiers: RoundModifiers,
): CombatShip[] {
  return opponents.filter((d) => !(d.side === 'player' && roundModifiers.evadingShipIndices.includes(d.index)));
}

// A ramming prow's on-destruction strike: the destroyed ship immediately
// deals its `onDestroyDamage` to the lowest-remaining-HP enemy (from the
// destroyed ship's own side's perspective). Triggers on any destruction —
// enemy fire or a ship's own rift-cannon suicide — but only once per death
// (enemies carry no prows, so this never chains).
function applyOnDestroyTrigger(
  destroyed: CombatShip,
  opponentsOf: (s: CombatShip) => CombatShip[],
  log: CombatEvent[],
  checkWinner: () => Side | null,
): Side | null {
  const dmg = destroyed.stats.onDestroyDamage;
  if (!dmg) return null;
  const target = pickTarget(opponentsOf(destroyed));
  if (!target) return null;
  target.damage += dmg;
  log.push({ kind: 'part-effect', text: 'Ramming prow deals damage as the ship goes down.' });
  if (!isAlive(target)) {
    log.push({ kind: 'destroyed', side: target.side, shipIndex: target.index });
  }
  return checkWinner();
}

function cloneShips(ships: CombatShip[]): CombatShip[] {
  return ships.map((s) => ({ ...s }));
}

// Only the player side ever carries a round-modifier initiative bonus
// (`injector`'s active) — enemy initiative is always its raw stat.
function effectiveInitiative(ship: CombatShip, initiativeBonus: number): number {
  return ship.stats.initiative + (ship.side === 'player' ? initiativeBonus : 0);
}

// Shared tie-break for both the normal activation order and the outspeed
// bonus phase: fastest first, player wins ties, then stable by index.
function byEffectiveInitiative(initiativeBonus: number) {
  return (a: CombatShip, b: CombatShip) => {
    const ia = effectiveInitiative(a, initiativeBonus);
    const ib = effectiveInitiative(b, initiativeBonus);
    if (ib !== ia) return ib - ia;
    if (a.side !== b.side) return a.side === 'player' ? -1 : 1;
    return a.index - b.index;
  };
}

function computeActivationOrder(playerShips: CombatShip[], enemyShips: CombatShip[], initiativeBonus: number): CombatShip[] {
  return [...playerShips, ...enemyShips].sort(byEffectiveInitiative(initiativeBonus));
}

// The highest effective initiative among a side's currently-alive ships, or
// null if none survive. Evading (thrusters) ships still count — they are
// alive and fast, merely untargetable this round, so they still deny an
// opponent's outspeed exactly like any other survivor.
function fastestAliveInitiative(ships: CombatShip[], initiativeBonus: number): number | null {
  const alive = ships.filter(isAlive);
  if (alive.length === 0) return null;
  return Math.max(...alive.map((s) => effectiveInitiative(s, initiativeBonus)));
}

// Iteration 17: pure, side-agnostic version of the rule for presentation
// code that only has static numbers (the prep screen, the enemy panel) —
// no live CombatShip/CombatState available before a fight starts. The real
// resolution below (`computeOutspeedShips`) is defined in terms of this
// same check, so the two can never drift apart.
export function qualifiesForOutspeed(shipInitiative: number, opponentFastestInitiative: number, gap = OUTSPEED_GAP): boolean {
  return shipInitiative - opponentFastestInitiative >= gap;
}

// Iteration 28 (Overspeed protocols): the player-side Outspeed gap drops by
// 1 with the protocol drafted. 47.3h: this was independently re-derived in
// FleetPanel.tsx and EnemyPanel.tsx, each commenting that initCombat below
// (`protocolFlags?.overspeedProtocols ? OUTSPEED_GAP - 1 : OUTSPEED_GAP`) was
// "the only other place this is computed" — which was already false of the
// OTHER UI copy by the time either comment was written. One function now;
// initCombat's own inline version stays (it takes a resolved boolean flag,
// not a protocol list, at the point it runs) but is definitionally the same
// rule.
export function playerOutspeedGap(protocols?: ProtocolId[]): number {
  return hasProtocol(protocols, 'overspeed-protocols') ? OUTSPEED_GAP - 1 : OUTSPEED_GAP;
}

// Every surviving ship (either side) whose effective initiative beats the
// fastest surviving OPPOSING ship's by OUTSPEED_GAP or more, in the order
// they'll take their bonus activation (fastest first, player wins ties).
// Called ONCE, at the moment the bonus phase begins (i.e., after the
// round's normal activations have already resolved) — this is what gives
// the rule its best emergent read: killing the enemy's last fast escort
// during the NORMAL round already changes "fastest surviving opposing
// ship" by the time this runs, unlocking outspeed that same round. The
// membership list itself is not recomputed again mid-bonus-phase; a ship
// already on the list simply skips its turn if something upstream (a rift
// backfire, an earlier bonus activation) killed it first — see the
// isAlive guard in advanceRound's bonus-phase loop.
function computeOutspeedShips(
  playerShips: CombatShip[],
  enemyShips: CombatShip[],
  initiativeBonus: number,
  playerGap: number = OUTSPEED_GAP,
): CombatShip[] {
  const fastestPlayer = fastestAliveInitiative(playerShips, initiativeBonus);
  const fastestEnemy = fastestAliveInitiative(enemyShips, initiativeBonus);
  const qualifying: CombatShip[] = [];
  if (fastestEnemy !== null) {
    for (const s of playerShips) {
      if (isAlive(s) && qualifiesForOutspeed(effectiveInitiative(s, initiativeBonus), fastestEnemy, playerGap)) {
        qualifying.push(s);
      }
    }
  }
  if (fastestPlayer !== null) {
    // The enemy side always needs the full OUTSPEED_GAP — Overspeed
    // protocols is a player-only edge (see CombatState.playerOutspeedGap).
    for (const s of enemyShips) {
      if (isAlive(s) && qualifiesForOutspeed(effectiveInitiative(s, initiativeBonus), fastestPlayer)) qualifying.push(s);
    }
  }
  return qualifying.sort(byEffectiveInitiative(initiativeBonus));
}

// Mutable, shared across every ship's activation within one missile-phase
// resolution: how many more missile dice each side's flak batteries can
// still shoot down this round (flak only ever fires once, since the missile
// phase only ever resolves once). Symmetric since iteration 8 — enemy flak
// (Flak fortress) cancels player missile/torpedo dice the same way player
// flak cancels the enemy's.
interface FlakState {
  playerRemaining: number; // player flak batteries — cancel enemy missile dice
  enemyRemaining: number; // enemy flak — cancel player missile dice
}

function fireShip(
  ship: CombatShip,
  phase: 'missile' | 'cannon',
  round: number,
  rng: RngFn,
  log: CombatEvent[],
  opponentsOf: (s: CombatShip) => CombatShip[],
  roundModifiers: RoundModifiers,
  flakState: FlakState,
  targetingStance: TargetingStance,
  priorityTargetIndex: number | null | undefined,
  checkWinner: () => Side | null,
  seed: number,
  // 2026-08-08 bug fix: missiles are a simultaneous opening volley, not a
  // sequential exchange — a ship destroyed by an earlier-activating ship's
  // missiles THIS SAME phase should still get to fire its own before going
  // down (the reported bug: "none of my missiles shot" when the enemy's
  // higher-initiative alpha strike killed the ship first). Only meaningful
  // for phase === 'missile'; cannon rounds stay sequential (a ship really
  // is gone for the rest of an ongoing exchange once destroyed). Passed
  // from advanceRound as a snapshot taken before any fire this round.
  missileAliveAtPhaseStart?: Set<CombatShip>,
): Side | null {
  const alive = phase === 'missile' && missileAliveAtPhaseStart ? missileAliveAtPhaseStart.has(ship) : isAlive(ship);
  if (!alive) return null;

  // Emergency thrusters (evasive burn): this ship neither fires nor can be
  // targeted this round — it sits out entirely, including suppressing any
  // taunt it would otherwise apply (it's simply excluded from the pool).
  if (ship.side === 'player' && roundModifiers.evadingShipIndices.includes(ship.index)) {
    return null;
  }

  // Iteration 48 (Brace order): fires nothing this round — but UNLIKE
  // thrusters, stays a legal target (legalDefenders doesn't check this
  // list) and keeps any taunt it carries. See the +2 piloting applied at
  // the defender-shield computation below.
  if (ship.side === 'player' && roundModifiers.bracingShipIndices.includes(ship.index)) {
    return null;
  }

  // Iteration 66 (Patch crews): the same "fires nothing, stays a legal
  // target" shape as Brace above, but grants no piloting bonus — the crews
  // are patching the hull, not maneuvering — so it's a separate list, not a
  // reuse of bracingShipIndices.
  if (ship.side === 'player' && roundModifiers.heldFireShipIndices.includes(ship.index)) {
    return null;
  }

  const weapons = phase === 'missile' ? ship.stats.missiles : ship.stats.cannons;

  // Iteration 66 (Focused barrage): a flat +1 damage per die THIS ship
  // fires this round, folded in below wherever weapon.damage is read (the
  // convergenceBonus/exploitBonus precedent: before any downstream use,
  // including the roll-log push, so the log always shows the real number).
  const damageBoost = ship.side === 'player' && roundModifiers.damageBoostShipIndex === ship.index ? 1 : 0;

  // 2026-08-08: this ship's committed random target for the round, if it
  // has one — every die it fires this round uses the same draw (see
  // enemyTargetRng's own comment). Hoisted here (constant across the whole
  // activation) rather than recomputed per die.
  const enemyRandomRng =
    ship.side === 'enemy' && !ship.stats.targetsLowestHp ? enemyTargetRng(seed, round, ship.index) : undefined;

  for (const weapon of weapons) {
    const diceCount = weapon.diceCount;

    for (let d = 0; d < diceCount; d++) {
      // Flak cancels the opposing side's missile dice before they're rolled,
      // from the earliest-firing ships first (activation order already
      // gives us that — this ship's own dice, in order).
      if (phase === 'missile') {
        if (ship.side === 'enemy' && flakState.playerRemaining > 0) {
          flakState.playerRemaining--;
          log.push({ kind: 'part-effect', text: 'Flak battery shoots down a missile.' });
          continue;
        }
        if (ship.side === 'player' && flakState.enemyRemaining > 0) {
          flakState.enemyRemaining--;
          log.push({ kind: 'part-effect', text: 'Enemy flak shoots down a missile.' });
          continue;
        }
      }

      // Iteration 13: a clicked priority target outranks everything for
      // player dice while it's alive and legal. Otherwise the siege
      // cannon's per-die override wins, then the fleet doctrine (9.4).
      // 2026-08-08: enemy targeting is random by default now (enemyRandomRng
      // above) — a sniper-class ship is the one exception, still greedy
      // lowest-HP, untouched by any of this.
      const defenders = legalDefenders(opponentsOf(ship), roundModifiers);
      const priority =
        ship.side === 'player' && priorityTargetIndex != null
          ? defenders.find((s) => s.index === priorityTargetIndex)
          : undefined;
      const preferHighest =
        ship.side === 'player' ? weapon.targetHighest || targetingStance === 'strongest' : !!weapon.targetHighest;
      // Homing missile (iteration 42): ignores the player's priority click,
      // targeting stance, AND taunt — always the plain lowest-HP defender.
      // Cloak's all-cloaked exception still applies (pickTarget handles it).
      const target = weapon.bypassTaunt
        ? pickTarget(defenders, { ignoreTaunt: true })
        : (priority ?? pickTarget(defenders, { preferHighest, randomRng: enemyRandomRng }));
      if (!target) return checkWinner(); // no legal target — the barrage finds nothing

      // ECM pod (iteration 23): the enemy penalty applies only to enemy
      // attackers, symmetric with how the player's own computerBonus
      // (targeting uplink, and iteration 48's Attack run order) only ever
      // applies to player attackers.
      // Iteration 48 (Exploit weakness), generalized iteration 66 (Focus
      // fire, the everyone-else cousin): the fleet's dice gain
      // markedEnemyBonus computer, but only for dice that land on the
      // marked ship specifically — computed per-die (not once per
      // ship-activation, unlike every other term here) since which target a
      // die lands on can change activation-to-activation, and even
      // die-to-die once `target` starts retargeting after a kill. Exploit
      // weakness sets the bonus to 2 (unchanged); Focus fire sets it to 1.
      const exploitBonus =
        ship.side === 'player' && roundModifiers.markedEnemyIndex === target.index
          ? roundModifiers.markedEnemyBonus
          : 0;
      // Iteration 66 (Focus fire's drawback): "tunnel vision" — a flat
      // computer penalty on player dice landing on any enemy OTHER than the
      // marked one. 0 for Exploit weakness and every order but Focus fire
      // (markedEnemyOffPenalty only ever set nonzero by its own issueOrder
      // case), so this is a pure no-op everywhere else.
      const offMarkPenalty =
        ship.side === 'player' && roundModifiers.markedEnemyIndex !== null && roundModifiers.markedEnemyIndex !== target.index
          ? roundModifiers.markedEnemyOffPenalty
          : 0;
      // Iteration 62: convergenceBonus(round) applies to BOTH sides, folded
      // in here (before every downstream use, including the roll log push
      // below) so the iteration-29 combat-log math shows the boosted number
      // automatically — no separate display work needed.
      const attackerComputer =
        ship.stats.computer +
        convergenceBonus(round) +
        (ship.side === 'player'
          ? roundModifiers.computerBonus + exploitBonus - offMarkPenalty
          : -roundModifiers.enemyComputerPenalty);

      // Piloting capacitors add bonus piloting only during the missile
      // phase and the first cannon round — gone from round 2 on. The
      // piloting modulator active adds a flat bonus to the whole player
      // fleet. (Evasion suite, iteration 23's other "shield"-named part,
      // no longer touches the enemy — see its 'disruptor' case in
      // useActive, a permanent self-buff folded into stats.shield
      // directly, not a round modifier.)
      const capacitorActive = phase === 'missile' || (phase === 'cannon' && round === 1);
      const modulatorBonus = target.side === 'player' ? roundModifiers.playerShieldBonus : 0;
      // Iteration 48 (Brace order): +2 piloting on the braced ship
      // specifically, on top of the fleet-wide playerShieldBonus above (an
      // Evasive pattern round + a Brace on your Bastion stack additively —
      // deliberate, same "every layer is additive" rule capacitor/modulator
      // already follow).
      // 2026-08-13 (player report: "no downside for using during the
      // missile round"): the missile phase is a one-time volley — often
      // zero dice for a ship with no missile weapon equipped — while every
      // cannon round is repeating damage. Bracing before round 0 was
      // forfeiting little or nothing for the same +2 defensive payoff a
      // cannon-round brace pays for with real, recurring damage. Phase-
      // scoped now, same pattern capacitorActive above already uses: +1
      // during the cheap missile round, +2 during a cannon round.
      const braceBonus =
        target.side === 'player' && roundModifiers.bracingShipIndices.includes(target.index)
          ? phase === 'missile'
            ? 1
            : 2
          : 0;
      // Iteration 66 (Bulwark, "Brace but the ship keeps firing"): the same
      // +2 piloting Brace's cannon-round bonus grants, but NOT phase-scoped
      // (Bulwark pays no missile-phase discount — it never sits out any
      // phase in the first place, so there's no "cheap volley" to price
      // differently) and on a wholly separate list from bracingShipIndices,
      // since fireShip's own hold-fire check above never consults
      // bulwarkShipIndices.
      const bulwarkBonus =
        target.side === 'player' && roundModifiers.bulwarkShipIndices.includes(target.index) ? 2 : 0;
      // Alpha doctrine (iteration 28): the player's base shield stat is
      // zeroed for the opening exchange — everything else (capacitor,
      // piloting modulator) is additive and still applies on top of that 0.
      const targetBaseShield =
        target.side === 'player' && roundModifiers.playerBaseShieldZeroed ? 0 : target.stats.shield;
      const baseShield =
        targetBaseShield +
        (capacitorActive ? target.stats.capacitorShield ?? 0 : 0) +
        modulatorBonus +
        braceBonus +
        bulwarkBonus;
      const effectiveShield = Math.max(
        0,
        baseShield - (ship.stats.shieldPierce ?? 0) - (weapon.shieldPierce ?? 0),
      );
      // Overcharged rounds (iteration 40): this weapon's die has a 7th
      // face — a natural 7 always hits, same as 6 normally would, and (see
      // below, once hit is resolved) deals +1 bonus damage on top.
      const dieFaces = weapon.overcharge ? 7 : 6;
      const raw = rollD6(rng, dieFaces);

      // Rift cannon: a natural 1 doesn't miss — it backfires on the firing
      // ship instead (direct damage, ignores shields, not a "hit" for
      // reactive armor purposes since the target was never actually hit).
      // Fire-control override never rerolls this — it's not a miss.
      if (raw === 1 && weapon.selfDamageOnNatOne) {
        log.push({
          kind: 'roll',
          phase,
          round,
          side: ship.side,
          shooterIndex: ship.index,
          targetIndex: target.index,
          raw,
          computer: attackerComputer,
          shield: effectiveShield,
          hit: false,
          damage: 0,
        });
        ship.damage += weapon.selfDamageOnNatOne;
        log.push({ kind: 'part-effect', text: 'Rift cannon backfires — the firing ship takes damage.' });
        if (!isAlive(ship)) {
          log.push({ kind: 'destroyed', side: ship.side, shipIndex: ship.index });
          const prowWinner = applyOnDestroyTrigger(ship, opponentsOf, log, checkWinner);
          if (prowWinner) return prowWinner;
          const winner = checkWinner();
          if (winner) return winner;
          return null; // destroyed itself — loses its remaining dice this activation
        }
        continue;
      }

      // Chaff launcher: while armed for the target this round, a natural 6
      // is no longer an automatic hit against it.
      const chaffActive = target.side === 'player' && roundModifiers.chaffShipIndices.includes(target.index);

      let finalRaw = raw;
      let hit = resolveHit(raw, attackerComputer, effectiveShield, chaffActive, dieFaces);

      // Fire-control override: this ship rerolls each missed die once.
      if (!hit && ship.side === 'player' && roundModifiers.overrideShipIndices.includes(ship.index)) {
        const rerollRaw = rollD6(rng, dieFaces);
        const rerollHit = resolveHit(rerollRaw, attackerComputer, effectiveShield, chaffActive, dieFaces);
        log.push({ kind: 'part-effect', text: `Fire-control override rerolls the miss — rolls ${rerollRaw}.` });
        finalRaw = rerollRaw;
        hit = rerollHit;
      }

      // Overcharged rounds: the bonus damage a natural 7 deals, folded in
      // wherever this weapon's damage is actually applied below (the normal
      // single-target path and the AOE path both read this).
      const overchargeBonus = weapon.overcharge && finalRaw === dieFaces && dieFaces === 7 ? 1 : 0;

      // Arc projector: a hit doesn't damage the picked target directly — it
      // blasts every alive enemy ship for a flat amount, one roll deciding
      // all of it.
      if (weapon.aoeDamage) {
        log.push({
          kind: 'roll',
          phase,
          round,
          side: ship.side,
          shooterIndex: ship.index,
          targetIndex: target.index,
          raw: finalRaw,
          computer: attackerComputer,
          shield: effectiveShield,
          hit,
          damage: 0,
        });
        if (hit) {
          const aoeDamage = weapon.aoeDamage + overchargeBonus;
          log.push({ kind: 'part-effect', text: `Arc projector deals ${aoeDamage} damage to every enemy ship.` });
          let anyDestroyed = false;
          for (const opp of opponentsOf(ship)) {
            if (!isAlive(opp)) continue;
            opp.damage += aoeDamage;
            if (!isAlive(opp)) {
              log.push({ kind: 'destroyed', side: opp.side, shipIndex: opp.index });
              anyDestroyed = true;
            }
          }
          if (anyDestroyed) {
            const winner = checkWinner();
            if (winner) return winner;
          }
        }
        continue;
      }

      // Jink (innate to the Interceptor frame): the first hit that would
      // land on this ship misses instead, once per combat — consumed
      // before reactive armor gets a chance to negate it.
      //
      // Deliberately gated on `hit`, and checked only after shields, chaff
      // and any fire-control reroll have settled the outcome: a shot that
      // was going to miss anyway never burns the dodge.
      if (hit && target.jinkAvailable) {
        target.jinkAvailable = false;
        hit = false;
        log.push({ kind: 'part-effect', text: 'Interceptor jinks aside — dodges the first hit of the fight.' });
      }

      // Graviton beam (iteration 42): a miss still grazes for chip damage —
      // its own dedicated branch, same shape as Arc projector's AOE branch
      // above, since a miss otherwise never touches `target.damage`.
      if (!hit && weapon.chipOnMiss) {
        log.push({
          kind: 'roll',
          phase,
          round,
          side: ship.side,
          shooterIndex: ship.index,
          targetIndex: target.index,
          raw: finalRaw,
          computer: attackerComputer,
          shield: effectiveShield,
          hit: false,
          damage: 0,
        });
        log.push({ kind: 'part-effect', text: `Graviton beam grazes for ${weapon.chipOnMiss} damage despite the miss.` });
        target.damage += weapon.chipOnMiss;
        if (!isAlive(target)) {
          log.push({ kind: 'destroyed', side: target.side, shipIndex: target.index });
          const prowWinner = applyOnDestroyTrigger(target, opponentsOf, log, checkWinner);
          if (prowWinner) return prowWinner;
          const winner = checkWinner();
          if (winner) return winner;
        }
        continue;
      }

      // Executioner cannon (iteration 42): a hit against a target already
      // at or below `executeAtHp` deals its full remaining HP instead of
      // the normal per-die damage — read BEFORE this die's own damage is
      // applied, so it's "already at 1" as of the moment the die lands, not
      // after. Reactive armor and ablative coating still apply as normal
      // below (a called shot is still a shot).
      const preHitHp = remainingHp(target);
      const executed = hit && weapon.executeAtHp !== undefined && preHitHp <= weapon.executeAtHp;

      // Iteration 66 (Focused barrage): damageBoost (hoisted above, once
      // per shooter) folds in here — before the log push below — so the
      // roll log always shows the real, boosted number, same rule
      // convergenceBonus/overchargeBonus already follow. Not applied to an
      // executed kill (preHitHp is already the ship's full remaining HP;
      // there's nothing left for +1 to add).
      let damage = hit ? (executed ? preHitHp : weapon.damage + overchargeBonus + damageBoost) : 0;
      let reactiveSaved = false;
      let ablativeAbsorbed = 0;

      if (hit && target.reactiveArmorRemaining > 0) {
        target.reactiveArmorRemaining--;
        reactiveSaved = true;
        damage = 0;
      } else if (hit) {
        if (target.ablativeRemaining > 0 && damage > 0) {
          ablativeAbsorbed = Math.min(target.ablativeRemaining, damage);
          target.ablativeRemaining -= ablativeAbsorbed;
          damage -= ablativeAbsorbed;
        }
      }

      log.push({
        kind: 'roll',
        phase,
        round,
        side: ship.side,
        shooterIndex: ship.index,
        targetIndex: target.index,
        raw: finalRaw,
        computer: attackerComputer,
        shield: effectiveShield,
        hit,
        damage,
      });

      if (hit) {
        if (reactiveSaved) {
          log.push({ kind: 'part-effect', text: 'Reactive armor negates the hit.' });
        } else {
          if (executed) {
            log.push({ kind: 'part-effect', text: 'Executioner cannon finishes the job.' });
          }
          if (ablativeAbsorbed > 0) {
            // 2026-08-13: was "Ablative coating absorbs..." unconditionally —
            // stats.ablative sums every source (the Ablative coating part,
            // Ablative mesh, Titan's innate Ablative plating, the
            // ablative-plating counter-protocol, AND the Engineer's banked
            // over-repair) into one pre-combat number with no per-source
            // tracking, so naming "Ablative coating" specifically was a
            // false claim whenever the HP actually came from one of the
            // other sources (a live player hit exactly this: absorbed
            // damage with none of those parts/protocols equipped). Names
            // the mechanic instead of any one item — true regardless of
            // source, and distinct from every real part/innate/protocol
            // display name above.
            log.push({ kind: 'part-effect', text: `Ablative HP absorbs ${ablativeAbsorbed} damage.` });
          }
          target.damage += damage;
          if (!isAlive(target)) {
            log.push({ kind: 'destroyed', side: target.side, shipIndex: target.index });
            const prowWinner = applyOnDestroyTrigger(target, opponentsOf, log, checkWinner);
            if (prowWinner) return prowWinner;
            const winner = checkWinner();
            if (winner) return winner;
          }
        }
      }

      // Flechette cannon (iteration 42): on a hit, also splashes a second
      // target — a fresh pickTarget call against the same defender pool
      // with the primary excluded, reusing the exact lowest-HP/taunt
      // logic the primary pick just used. A guaranteed hit (no separate
      // roll), gated on the primary landing at all (see plans/iteration-
      // 42.md's decision points).
      if (hit && weapon.cleaveDamage) {
        const secondary = pickTarget(
          defenders.filter((d) => d.index !== target.index),
          { preferHighest },
        );
        if (secondary) {
          secondary.damage += weapon.cleaveDamage;
          log.push({
            kind: 'part-effect',
            text: `Flechette cannon's splash deals ${weapon.cleaveDamage} damage to a second target.`,
          });
          if (!isAlive(secondary)) {
            log.push({ kind: 'destroyed', side: secondary.side, shipIndex: secondary.index });
            const prowWinner = applyOnDestroyTrigger(secondary, opponentsOf, log, checkWinner);
            if (prowWinner) return prowWinner;
            const winner = checkWinner();
            if (winner) return winner;
          }
        }
      }
    }
  }
  return null;
}

function freshRoundModifiers(): RoundModifiers {
  return {
    initiativeBonus: 0,
    computerBonus: 0,
    playerShieldBonus: 0,
    overrideShipIndices: [],
    evadingShipIndices: [],
    chaffShipIndices: [],
    enemyComputerPenalty: 0,
    playerBaseShieldZeroed: false, // always recomputed per-round in advanceRound, never carried
    bracingShipIndices: [],
    markedEnemyIndex: null,
    markedEnemyBonus: 0,
    markedEnemyOffPenalty: 0,
    heldFireShipIndices: [],
    bulwarkShipIndices: [],
    damageBoostShipIndex: null,
    reloadDronesArmed: false,
  };
}

// Iteration 28 (Protocols): the two combat-engine-level protocol effects,
// bundled into one options bag so initCombat's signature doesn't grow a
// new positional param per protocol added later.
export interface CombatProtocolFlags {
  overspeedProtocols?: boolean; // player Outspeed gap 4 -> 3
  alphaDoctrine?: boolean; // player cannons also fire in the missile phase; player shield zeroed rounds 0-1
}

// Iteration 48 (fleet orders): commandPoints/exploitEnabled are a separate
// options bag from CombatProtocolFlags — they're a commander-doctrine
// concern (see reducer.ts's ENGAGE, which derives both from commanderId),
// not a drafted-protocol one. Defaults (2 CP, no Exploit) apply whenever a
// call site doesn't care — every existing initCombat call in the test
// suite, scripts/sim, and EnemyPanel's preview keeps compiling unchanged.
// 51.1 (Spymaster "Forewarned"): +1 player-side computer during the opening
// exchange (missile phase + cannon round 1) only — folded into
// `advanceRound`'s per-round derivation of `roundModifiers.computerBonus`
// the same way Alpha doctrine's `playerBaseShieldZeroed` is derived from
// `alphaDoctrineActive` (NOT part of the armed-actives reset bag), so it
// composes additively with uplink2/orders rather than overwriting them.
// Defaults to 0 for every non-Spymaster ENGAGE and for every existing
// initCombat call site (tests, scripts/sim, EnemyPanel's preview).
export interface CombatOrderOptions {
  commandPoints?: number;
  exploitEnabled?: boolean;
  openingComputerBonus?: number;
  // Iteration 66 (fleet doctrine progression): this run's earned order set
  // (RunState.knownOrders), passed straight through from reducer.ts's
  // ENGAGE. Undefined for every existing call site (tests, scripts/sim,
  // EnemyPanel's preview) — CombatState.knownOrders degrades to
  // DEFAULT_KNOWN_ORDERS at initCombat AND at every later read site (see
  // that field's own comment).
  knownOrders?: FleetOrderId[];
}

export function initCombat(
  playerFleet: PlayerFleetInput[],
  enemyDef: EnemyDef,
  seed: number,
  targetingStance: TargetingStance = 'weakest',
  protocolFlags?: CombatProtocolFlags,
  orderOptions?: CombatOrderOptions,
): CombatState {
  const playerShips: CombatShip[] = playerFleet.map((p, index) => ({
    side: 'player',
    index,
    stats: p.stats,
    damage: p.initialDamage,
    reactiveArmorRemaining: p.stats.reactiveArmor ?? 0,
    ablativeRemaining: p.stats.ablative ?? 0,
    jinkAvailable: p.stats.jink ?? false,
  }));
  // Iteration 9: an enemy is a composition of one or more sub-groups, each
  // with its own stats — flatten to one CombatShip per ship, in group
  // order, with a single continuous per-side index (targeting/logging
  // don't care which group a ship came from, only its own stats).
  const enemyShips: CombatShip[] = enemyDef.groups
    .flatMap((group) => Array.from({ length: group.count }, () => group.stats))
    .map((stats, index) => ({
      side: 'enemy' as Side,
      index,
      stats,
      damage: 0,
      reactiveArmorRemaining: stats.reactiveArmor ?? 0,
      ablativeRemaining: stats.ablative ?? 0,
      jinkAvailable: stats.jink ?? false,
    }));

  return {
    seed,
    rngCounter: 0,
    round: 0,
    playerShips,
    enemyShips,
    roundModifiers: freshRoundModifiers(),
    usedActives: [],
    // 63.3: the fight's real, once-ever flak budget — see CombatState's own
    // comment on this field for why it now has to persist instead of being
    // recomputed fresh (and thrown away) every advanceRound call.
    flakRemaining: { player: totalFlak(playerShips), enemy: totalFlak(enemyShips) },
    targetingStance,
    priorityTargetIndex: null,
    log: [],
    winner: undefined,
    playerOutspeedGap: protocolFlags?.overspeedProtocols ? OUTSPEED_GAP - 1 : OUTSPEED_GAP,
    alphaDoctrineActive: !!protocolFlags?.alphaDoctrine,
    commandPoints: orderOptions?.commandPoints ?? 2,
    exploitEnabled: !!orderOptions?.exploitEnabled,
    orderThisRound: null,
    openingComputerBonus: orderOptions?.openingComputerBonus ?? 0,
    knownOrders: orderOptions?.knownOrders ?? DEFAULT_KNOWN_ORDERS,
  };
}

// Which defender the player's dice open on, as a flattened enemy-ship index
// (the same indexing initCombat produces). Built from initCombat +
// pickTarget rather than reimplementing the rule, so the prep screen's
// target highlight can never drift from what the fight actually does.
// Defenders are at full HP here, so this is a pure stats comparison; a siege
// cannon's per-die `targetHighest` still redirects that one weapon in the
// actual fight. Returns -1 for an enemy with no ships.
export function openingTargetIndex(
  enemyDef: EnemyDef,
  stance: TargetingStance = 'weakest',
): number {
  const { enemyShips } = initCombat([], enemyDef, 1, stance);
  const target = pickTarget(enemyShips, { preferHighest: stance === 'strongest' });
  return target ? target.index : -1;
}

// Whether either fleet has any missiles at all — if not, the missile phase
// is a guaranteed no-op and can be skipped without ever showing it.
export function hasMissilePhase(state: CombatState): boolean {
  return (
    state.playerShips.some((s) => s.stats.missiles.length > 0) ||
    state.enemyShips.some((s) => s.stats.missiles.length > 0)
  );
}

// Resolves exactly one round (round 0 = the missile phase, then cannon
// rounds 1..30) and returns a new state. A no-op if the fight is already won.
export function advanceRound(state: CombatState): CombatState {
  if (state.winner) return state;

  const playerShips = cloneShips(state.playerShips);
  const enemyShips = cloneShips(state.enemyShips);
  const log = [...state.log];

  const { rng, consumedThisCall } = resumeRng(state.seed, state.rngCounter);

  function opponentsOf(ship: CombatShip): CombatShip[] {
    return ship.side === 'player' ? enemyShips : playerShips;
  }
  function checkWinner(): Side | null {
    if (!enemyShips.some(isAlive)) return 'player';
    if (!playerShips.some(isAlive)) return 'enemy';
    return null;
  }

  const isMissilePhase = state.round === 0;
  const phase: 'missile' | 'cannon' = isMissilePhase ? 'missile' : 'cannon';
  const roundNumber = state.round;

  // Iteration 28 (Alpha doctrine): derived fresh every round from the
  // fight-long `alphaDoctrineActive` flag, not part of the "armed actives"
  // bag freshRoundModifiers() resets — true for the opening exchange only
  // (the missile phase and the first cannon round).
  // 51.1 (Spymaster "Forewarned"): same per-round-derived shape — +1 player
  // computer folded additively onto whatever uplink2/orders already armed
  // this round (`state.roundModifiers.computerBonus`), for the opening
  // exchange only. `?? 0` covers a pre-51.1 mid-fight save (see
  // CombatState.openingComputerBonus's own comment).
  const roundModifiers: RoundModifiers = {
    ...state.roundModifiers,
    playerBaseShieldZeroed: state.alphaDoctrineActive && roundNumber <= 1,
    computerBonus: state.roundModifiers.computerBonus + (roundNumber <= 1 ? (state.openingComputerBonus ?? 0) : 0),
  };

  log.push({ kind: 'phase-start', phase, round: roundNumber });

  // Iteration 62: one announcement the round convergence first kicks in,
  // a short tick line on every round after that (the per-roll computer-vs-
  // piloting math already shows the boosted number — see fireShip — so this
  // is deliberately just a one-liner, not a restatement of the formula).
  // roundNumber is never < 0 and convergenceBonus is 0 through round 7, so
  // this never fires during the missile phase (round 0).
  if (roundNumber === CONVERGENCE_ONSET_ROUND) {
    log.push({
      kind: 'part-effect',
      text: 'Fire-control convergence — accumulated targeting data grants +1 computer to all ships, growing each round.',
    });
  } else if (roundNumber > CONVERGENCE_ONSET_ROUND) {
    log.push({ kind: 'part-effect', text: `Convergence +${convergenceBonus(roundNumber)}.` });
  }

  // 63.3: reads the fight's real, persisted flak budget (CombatState's own
  // comment) rather than recomputing fresh — was `isMissilePhase ?
  // totalFlak(...) : 0` before Reload drones existed, since flak only ever
  // needed to matter during the one round-0 missile phase. `fireShip`'s
  // own flak-cancel branch is still gated on `phase === 'missile'`, so a
  // normal cannon round's flakState values are simply never read — this
  // change only enables the NEW case (a missile-phase fireShip call in a
  // later round, via Reload drones below) to draw from the same pool.
  const flakState: FlakState = {
    playerRemaining: state.flakRemaining.player,
    enemyRemaining: state.flakRemaining.enemy,
  };

  const order = computeActivationOrder(playerShips, enemyShips, roundModifiers.initiativeBonus);
  // 2026-08-08: who's alive BEFORE any fire this round — the missile phase
  // is a simultaneous volley, so a ship destroyed by an earlier-activating
  // ship's missiles this same phase must still get to fire its own (see
  // fireShip's own comment on the param this feeds).
  const missileAliveAtPhaseStart = isMissilePhase ? new Set(order.filter(isAlive)) : undefined;

  let winner: Side | null = null;
  // 2026-08-08: the missile phase doesn't stop early on a winner either —
  // simultaneous means every ship alive when it began fires, even one
  // whose side gets wiped out by an earlier-activating ship's missiles
  // this same phase (the other half of the bug fireShip's own comment
  // describes: fixing WHO gets to fire is pointless if the loop still
  // stops calling fireShip at all once a winner is provisionally decided
  // mid-phase). Cannon rounds keep the early-exit — they're a genuinely
  // sequential ongoing exchange, not a simultaneous volley.
  for (const ship of order) {
    const roundWinner = fireShip(
      ship,
      phase,
      roundNumber,
      rng,
      log,
      opponentsOf,
      roundModifiers,
      flakState,
      state.targetingStance,
      state.priorityTargetIndex,
      checkWinner,
      state.seed,
      missileAliveAtPhaseStart,
    );
    if (roundWinner) {
      winner = roundWinner;
      if (!isMissilePhase) break;
    }
  }

  // Iteration 28 (Alpha doctrine): the missile phase's normal activations
  // are done — now every alive player ship with cannons fires them too,
  // same phase, same round (0). Activation order is initiative-derived
  // (the same `order`, filtered to player ships still standing).
  if (!winner && isMissilePhase && state.alphaDoctrineActive) {
    const alphaShips = order.filter((s) => s.side === 'player');
    if (alphaShips.some((s) => isAlive(s) && s.stats.cannons.length > 0)) {
      log.push({ kind: 'part-effect', text: 'Alpha doctrine — cannons fire early, alongside the opening missiles.' });
    }
    for (const ship of alphaShips) {
      if (!isAlive(ship) || ship.stats.cannons.length === 0) continue;
      winner = fireShip(
        ship,
        'cannon',
        roundNumber,
        rng,
        log,
        opponentsOf,
        roundModifiers,
        flakState,
        state.targetingStance,
        state.priorityTargetIndex,
        checkWinner,
        state.seed,
      );
      if (winner) break;
    }
  }

  // Iteration 17 ("Outspeed"): a ≥OUTSPEED_GAP initiative advantage over the
  // fastest surviving opponent earns one extra, cannons-only activation —
  // missile phase never qualifies. Evaluated once, right here, after the
  // round's normal activations have already resolved: killing the enemy's
  // last fast screen earlier in THIS round already unlocks it this same
  // round (see computeOutspeedShips). Runs before the stalemate check so a
  // bonus activation gets the same chance the normal round did to actually
  // end the fight on round 30, instead of a stalemate being declared with an
  // available finishing blow left unfired.
  if (!winner && !isMissilePhase) {
    const outspeeders = computeOutspeedShips(playerShips, enemyShips, roundModifiers.initiativeBonus, state.playerOutspeedGap);
    for (const ship of outspeeders) {
      // A ship with no cannons has nothing to do with a bonus activation
      // (missiles don't fire in a cannon round) — skip it silently rather
      // than announcing a "second activation" that fires no dice. Also
      // re-check isAlive: an earlier bonus activation this same phase (a
      // rift backfire, an opposing ship's kill) may have already destroyed it.
      if (!isAlive(ship) || ship.stats.cannons.length === 0) continue;
      log.push({ kind: 'outspeed', side: ship.side, shipIndex: ship.index });
      winner = fireShip(
        ship,
        'cannon',
        roundNumber,
        rng,
        log,
        opponentsOf,
        roundModifiers,
        flakState,
        state.targetingStance,
        state.priorityTargetIndex,
        checkWinner,
        state.seed,
      );
      if (winner) break;
    }
  }

  // Iteration 63.3 (Reload drones): armed by any one ship's active — the
  // effect is fleet-wide ("every ship fires its missiles once more"),
  // resolved at the end of THIS round, whichever round that is (the
  // missile phase itself, or any later cannon round — the one deliberate
  // way to get a second missile-firing window). Player-only (no enemy part
  // grants this), so no player ship can die mid-volley from enemy fire —
  // a plain `isAlive` check per ship (fireShip's default when no
  // `missileAliveAtPhaseStart` is passed) is correct, no snapshot needed.
  // Uses the SAME flakState object already threaded through this round, so
  // enemy flak draws from the real per-combat pool automatically (see
  // CombatState.flakRemaining's own comment) — no special-casing. Runs
  // before the stalemate check, same reasoning as Outspeed above: a
  // finishing blow on round 30 should still win, not stalemate.
  if (!winner && roundModifiers.reloadDronesArmed) {
    const reloaders = order.filter((s) => s.side === 'player' && isAlive(s) && s.stats.missiles.length > 0);
    if (reloaders.length > 0) {
      log.push({ kind: 'part-effect', text: "Reload drones — the fleet's missiles fire once more." });
    }
    for (const ship of reloaders) {
      winner = fireShip(
        ship,
        'missile',
        roundNumber,
        rng,
        log,
        opponentsOf,
        roundModifiers,
        flakState,
        state.targetingStance,
        state.priorityTargetIndex,
        checkWinner,
        state.seed,
      );
      if (winner) break;
    }
  }

  if (!winner && !isMissilePhase && roundNumber === MAX_CANNON_ROUNDS) {
    log.push({ kind: 'stalemate' });
    winner = 'enemy';
  }

  // Iteration 62 (command point regeneration): +1 CP at the start of every
  // 4th cannon round (4, 8, 12, ...) — computed off the round about to
  // become current (`nextRound`), not the one just resolved, so "the player
  // can spend it on round 4's orders" is literally true: by the time this
  // returned state is what the player next sees (and can issueOrder
  // against), the regenerated point is already in commandPoints. Uncapped —
  // convergence bounds fights at ~13 rounds in practice, so a cap rule isn't
  // worth adding. AUTO_RESOLVE/runToEnd never call issueOrder, so this can't
  // move the balance-sim floor either way.
  const nextRound = state.round + 1;
  const commandPointRegen = nextRound % 4 === 0 ? 1 : 0;
  if (commandPointRegen > 0) {
    log.push({ kind: 'part-effect', text: 'Command point regained.' });
  }

  return {
    seed: state.seed,
    rngCounter: state.rngCounter + consumedThisCall(),
    round: nextRound,
    playerShips,
    enemyShips,
    roundModifiers: freshRoundModifiers(),
    usedActives: state.usedActives,
    flakRemaining: { player: flakState.playerRemaining, enemy: flakState.enemyRemaining },
    targetingStance: state.targetingStance,
    priorityTargetIndex: state.priorityTargetIndex,
    log,
    winner: winner ?? undefined,
    playerOutspeedGap: state.playerOutspeedGap,
    alphaDoctrineActive: state.alphaDoctrineActive,
    commandPoints: state.commandPoints + commandPointRegen,
    exploitEnabled: state.exploitEnabled,
    orderThisRound: null, // iteration 48: at most one order arms per round — cleared same as roundModifiers
    openingComputerBonus: state.openingComputerBonus ?? 0,
    knownOrders: state.knownOrders,
  };
}

// Iteration 17: which ships currently qualify for an Outspeed bonus
// activation, given the CURRENT live state (including any round-modifier
// initiative bonus already armed, e.g. the `injector` active) — the exact
// same computation `advanceRound`'s bonus phase will use, so the combat
// theater's badge can never show a ship as outspeeding when the engine
// wouldn't actually grant it the extra activation. Recomputing from live
// state on every render is intentional: the badge should react instantly
// when the enemy's last fast ship dies, or when an active gets armed.
export function outspeedingShipIndices(state: CombatState): { player: number[]; enemy: number[] } {
  const qualifying = computeOutspeedShips(
    state.playerShips,
    state.enemyShips,
    state.roundModifiers.initiativeBonus,
    state.playerOutspeedGap,
  );
  return {
    player: qualifying.filter((s) => s.side === 'player').map((s) => s.index),
    enemy: qualifying.filter((s) => s.side === 'enemy').map((s) => s.index),
  };
}

// --- Telegraphs (iteration 19) ---------------------------------------------
// Enemy targeting is deterministic given (seed, round, shooter) — a random
// pick as of 2026-08-08, but computed the same pure way every time (see
// enemyTargetRng), not drawn from the live dice-roll rng stream — so next
// round's OPENING fire is still computable before the round is played.
// Each entry is one enemy ship's first-die pick, made with the exact
// functions `fireShip` uses (`legalDefenders` + `pickTarget`, against the
// LIVE roundModifiers — so arming an evade visibly shifts the telegraph
// before the player commits). Honest limitation for the UI copy: dice
// retarget mid-activation after kills, so this is the opening picture, not
// a contract. Pure and read-only: consumes no rng, mutates nothing.

export interface IncomingFire {
  shooterIndex: number; // enemy-side flattened index
  targetIndex: number; // player-side index its first die opens on
  diceCount: number; // dice it will fire in the previewed phase (outspeed-doubled for cannons)
  maxDamage: number; // sum of those dice's damage — an upper bound, before any roll
  outspeed: boolean; // cannon preview only: this ship currently qualifies for a bonus activation
}

export interface FirePreview {
  phase: 'missile' | 'cannon'; // the phase the next `advanceRound` will resolve
  entries: IncomingFire[];
  flakCancels: number; // missile phase only: the fleet's flak downs this many dice first
}

// Iteration 62: this preview's `diceCount`/`maxDamage` are, and were already,
// hit-chance-agnostic — an upper bound assuming every previewed die hits for
// its full listed damage (see FirePreview's own doc comment), never derived
// from computer/piloting at all. convergenceBonus(round) therefore has
// nothing to fold in here: there's no computer-derived number in this
// preview's output that could go stale. What DOES need to hold is target
// selection staying identical to what fireShip will actually roll against
// post-onset (the telegraph's real honesty promise) — pinned by a parity
// test at a post-onset round, same shape as the pre-62 telegraph tests below.
export function incomingFirePreview(state: CombatState): FirePreview {
  const phase: 'missile' | 'cannon' = state.round === 0 ? 'missile' : 'cannon';
  const outspeedingEnemies =
    phase === 'cannon'
      ? new Set(
          computeOutspeedShips(state.playerShips, state.enemyShips, state.roundModifiers.initiativeBonus, state.playerOutspeedGap)
            .filter((s) => s.side === 'enemy')
            .map((s) => s.index),
        )
      : new Set<number>();

  const entries: IncomingFire[] = [];
  for (const ship of state.enemyShips) {
    if (!isAlive(ship)) continue;
    const weapons = phase === 'missile' ? ship.stats.missiles : ship.stats.cannons;
    if (weapons.length === 0) continue;
    // 2026-08-08: mirrors fireShip's own enemyRandomRng exactly (same
    // seed/round/shooter inputs) — this preview runs BEFORE the round it's
    // previewing, so it can't share a live pick with the real resolution;
    // computing the identical pure function is how the two agree anyway.
    const randomRng = ship.stats.targetsLowestHp ? undefined : enemyTargetRng(state.seed, state.round, ship.index);
    const target = pickTarget(legalDefenders(state.playerShips, state.roundModifiers), {
      preferHighest: !!weapons[0]?.targetHighest,
      randomRng,
    });
    if (!target) continue;
    const outspeed = outspeedingEnemies.has(ship.index);
    const multiplier = outspeed ? 2 : 1;
    const diceCount = weapons.reduce((n, w) => n + w.diceCount, 0) * multiplier;
    const maxDamage = weapons.reduce((n, w) => n + w.diceCount * w.damage, 0) * multiplier;
    entries.push({ shooterIndex: ship.index, targetIndex: target.index, diceCount, maxDamage, outspeed });
  }

  const flakCancels = phase === 'missile' ? totalFlak(state.playerShips) : 0;

  return { phase, entries, flakCancels };
}

// 2026-08-08: the player's own half of the telegraph — which enemy each of
// your ships is about to open on. Deliberately a separate function, not
// `incomingFirePreview` parameterized by side: player targeting is priority
// click > weapon.targetHighest/targetingStance, always deterministic, while
// enemy targeting is random-by-default with a seeded draw (see
// enemyTargetRng) — genuinely different rules, same as fireShip's own
// side-branch. Mirrors fireShip's player-side target selection exactly.
export interface OutgoingFire {
  shooterIndex: number; // player-side flattened index
  targetIndex: number; // enemy-side index its first die opens on
  diceCount: number; // dice it will fire in the previewed phase (outspeed-doubled for cannons)
  maxDamage: number; // sum of those dice's damage — an upper bound, before any roll
  outspeed: boolean; // cannon preview only: this ship currently qualifies for a bonus activation
}

export interface OutgoingFirePreview {
  phase: 'missile' | 'cannon';
  entries: OutgoingFire[];
  flakCancels: number; // missile phase only: the enemy's flak downs this many player dice first
}

export function outgoingFirePreview(state: CombatState): OutgoingFirePreview {
  const phase: 'missile' | 'cannon' = state.round === 0 ? 'missile' : 'cannon';
  const outspeedingPlayers =
    phase === 'cannon'
      ? new Set(
          computeOutspeedShips(state.playerShips, state.enemyShips, state.roundModifiers.initiativeBonus, state.playerOutspeedGap)
            .filter((s) => s.side === 'player')
            .map((s) => s.index),
        )
      : new Set<number>();

  const entries: OutgoingFire[] = [];
  for (const ship of state.playerShips) {
    if (!isAlive(ship)) continue;
    // Emergency thrusters / iteration 48's Brace order / iteration 66's
    // Patch crews: this ship sits out the round entirely — same guards
    // fireShip itself checks before a player ship ever fires. (Bulwark
    // deliberately has NO entry here — it keeps firing, unlike Brace.)
    if (state.roundModifiers.evadingShipIndices.includes(ship.index)) continue;
    if (state.roundModifiers.bracingShipIndices.includes(ship.index)) continue;
    if (state.roundModifiers.heldFireShipIndices.includes(ship.index)) continue;
    const weapons = phase === 'missile' ? ship.stats.missiles : ship.stats.cannons;
    if (weapons.length === 0) continue;
    const defenders = legalDefenders(state.enemyShips, state.roundModifiers);
    const priority =
      state.priorityTargetIndex != null ? defenders.find((s) => s.index === state.priorityTargetIndex) : undefined;
    const preferHighest = !!weapons[0]?.targetHighest || state.targetingStance === 'strongest';
    const target = weapons[0]?.bypassTaunt
      ? pickTarget(defenders, { ignoreTaunt: true })
      : (priority ?? pickTarget(defenders, { preferHighest }));
    if (!target) continue;
    const outspeed = outspeedingPlayers.has(ship.index);
    const multiplier = outspeed ? 2 : 1;
    const diceCount = weapons.reduce((n, w) => n + w.diceCount, 0) * multiplier;
    const maxDamage = weapons.reduce((n, w) => n + w.diceCount * w.damage, 0) * multiplier;
    entries.push({ shooterIndex: ship.index, targetIndex: target.index, diceCount, maxDamage, outspeed });
  }

  const flakCancels = phase === 'missile' ? totalFlak(state.enemyShips) : 0;

  return { phase, entries, flakCancels };
}

// Iteration 13: set (or clear, with null) the manual priority target.
// Only an alive enemy ship is accepted; anything else clears instead —
// clicking a wreck should never leave a stale lock.
export function setPriorityTarget(state: CombatState, index: number | null): CombatState {
  const valid = index !== null && state.enemyShips.some((s) => s.index === index && s.stats.hp - s.damage > 0);
  return { ...state, priorityTargetIndex: valid ? index : null };
}

// --- Fleet orders (iteration 48, expanded iteration 66): a per-round -----
// tactical command layer. Stance orders (fleet-wide, no target) and
// targeted orders (pick one ship). At most one order armed per round, 1
// command point each, no replenishment mid-fight — see
// CombatState.commandPoints. Orders consume no rng: they're recorded player
// input, same determinism class as actives and priority targeting.
// AUTO_RESOLVE/runToEnd never call issueOrder — the established "auto
// presses no buttons" rule that already covers actives — so every
// balance-sim number is unaffected by this feature by construction.
// Iteration 66: which orders are actually offered still comes from
// RunState.knownOrders (checked by canIssueOrder below) — this section only
// knows how to resolve an order once armed, not which ones a given fleet
// has earned.

export const ORDER_NEEDS_TARGET: Record<FleetOrderId, 'player' | 'enemy' | null> = {
  'attack-run': null,
  'evasive-pattern': null,
  brace: 'player',
  'exploit-weakness': 'enemy',
  'patch-crews': 'player',
  countermeasures: null,
  'attack-run-2': null,
  'evasive-pattern-2': null,
  'focus-fire': 'enemy',
  'jamming-sweep': null,
  'pd-screen': null,
  'focused-barrage': 'player',
  'all-ahead-full': null,
  bulwark: 'player',
};

export function canIssueOrder(state: CombatState, order: FleetOrderId, targetIndex?: number): boolean {
  if (state.winner) return false;
  if (state.commandPoints <= 0) return false;
  if (state.orderThisRound !== null) return false;
  // Iteration 66: an order not yet earned this run can never be issued —
  // same early-return shape as the exploitEnabled gate right below, which
  // stays a SEPARATE check (exploitEnabled is a commander fact, not a
  // draft fact — the Spymaster must hold both: exploit-weakness is seeded
  // into their knownOrders at CHOOSE_COMMANDER AND gated here).
  if (!(state.knownOrders ?? DEFAULT_KNOWN_ORDERS).includes(order)) return false;
  if (order === 'exploit-weakness' && !state.exploitEnabled) return false;
  const targetSide = ORDER_NEEDS_TARGET[order];
  if (targetSide === null) return true;
  if (targetIndex === undefined) return false;
  const pool = targetSide === 'player' ? state.playerShips : state.enemyShips;
  const target = pool.find((s) => s.index === targetIndex && isAlive(s));
  if (!target) return false;
  // Iteration 66 (Patch crews): a no-op heal is refused outright rather
  // than silently wasting the command point on an already-undamaged ship.
  if (order === 'patch-crews' && target.damage <= 0) return false;
  return true;
}

export function issueOrder(state: CombatState, order: FleetOrderId, targetIndex?: number): CombatState {
  if (!canIssueOrder(state, order, targetIndex)) return state;
  const commandPoints = state.commandPoints - 1;
  const orderThisRound = order;
  const logged = (text: string): CombatEvent[] => [...state.log, { kind: 'part-effect', text }];

  switch (order) {
    case 'attack-run':
      return {
        ...state,
        commandPoints,
        orderThisRound,
        log: logged('Order: Attack run — the fleet commits to the attack (+1 computer, −1 piloting this round).'),
        roundModifiers: {
          ...state.roundModifiers,
          computerBonus: state.roundModifiers.computerBonus + 1,
          playerShieldBonus: state.roundModifiers.playerShieldBonus - 1,
        },
      };
    case 'evasive-pattern':
      return {
        ...state,
        commandPoints,
        orderThisRound,
        log: logged('Order: Evasive pattern — the fleet flies defensively (+1 piloting, −1 computer this round).'),
        roundModifiers: {
          ...state.roundModifiers,
          computerBonus: state.roundModifiers.computerBonus - 1,
          playerShieldBonus: state.roundModifiers.playerShieldBonus + 1,
        },
      };
    case 'brace': {
      const ship = state.playerShips.find((s) => s.index === targetIndex);
      const label = ship ? `ship ${ship.index + 1}` : 'the ship';
      // 2026-08-13: the piloting bonus is now phase-scoped (see the
      // braceBonus comment above) — state.round === 0 is the missile phase
      // (the round about to resolve when this order is armed), so the log
      // can state the real number instead of a flat "+2" that's wrong half
      // the time.
      const bonus = state.round === 0 ? 1 : 2;
      return {
        ...state,
        commandPoints,
        orderThisRound,
        log: logged(`Order: Brace — ${label} holds fire and braces (+${bonus} piloting this round).`),
        roundModifiers: {
          ...state.roundModifiers,
          bracingShipIndices: [...state.roundModifiers.bracingShipIndices, targetIndex!],
        },
      };
    }
    case 'exploit-weakness': {
      const ship = state.enemyShips.find((s) => s.index === targetIndex);
      const label = ship ? `enemy ${ship.index + 1}` : 'the target';
      return {
        ...state,
        commandPoints,
        orderThisRound,
        log: logged(`Order: Exploit weakness — intel marks ${label} (+2 computer against it this round).`),
        roundModifiers: {
          ...state.roundModifiers,
          markedEnemyIndex: targetIndex!,
          markedEnemyBonus: 2,
          markedEnemyOffPenalty: 0,
        },
      };
    }
    case 'patch-crews': {
      const ship = state.playerShips.find((s) => s.index === targetIndex);
      const label = ship ? `ship ${ship.index + 1}` : 'the ship';
      const playerShips = state.playerShips.map((s) =>
        s.index === targetIndex ? { ...s, damage: Math.max(0, s.damage - 1) } : s,
      );
      return {
        ...state,
        commandPoints,
        orderThisRound,
        playerShips,
        log: logged(`Order: Patch crews — ${label} repairs 1 hull damage and holds fire this round.`),
        roundModifiers: {
          ...state.roundModifiers,
          heldFireShipIndices: [...state.roundModifiers.heldFireShipIndices, targetIndex!],
        },
      };
    }
    case 'countermeasures':
      return {
        ...state,
        commandPoints,
        orderThisRound,
        flakRemaining: { ...state.flakRemaining, player: state.flakRemaining.player + 1 },
        log: logged(
          'Order: Countermeasures — sensors devoted to intercept (+1 flak against this fight’s remaining missiles, −1 computer this round).',
        ),
        roundModifiers: { ...state.roundModifiers, computerBonus: state.roundModifiers.computerBonus - 1 },
      };
    case 'attack-run-2':
      return {
        ...state,
        commandPoints,
        orderThisRound,
        log: logged('Order: Attack run II — the fleet commits hard (+2 computer, −1 piloting this round).'),
        roundModifiers: {
          ...state.roundModifiers,
          computerBonus: state.roundModifiers.computerBonus + 2,
          playerShieldBonus: state.roundModifiers.playerShieldBonus - 1,
        },
      };
    case 'evasive-pattern-2':
      return {
        ...state,
        commandPoints,
        orderThisRound,
        log: logged('Order: Evasive pattern II — the fleet flies defensively, hard (+2 piloting, −1 computer this round).'),
        roundModifiers: {
          ...state.roundModifiers,
          computerBonus: state.roundModifiers.computerBonus - 2,
          playerShieldBonus: state.roundModifiers.playerShieldBonus + 1,
        },
      };
    case 'focus-fire': {
      const ship = state.enemyShips.find((s) => s.index === targetIndex);
      const label = ship ? `enemy ${ship.index + 1}` : 'the target';
      return {
        ...state,
        commandPoints,
        orderThisRound,
        log: logged(
          `Order: Focus fire — the fleet tunnels in on ${label} (+1 computer against it, −1 against every other enemy this round).`,
        ),
        roundModifiers: {
          ...state.roundModifiers,
          markedEnemyIndex: targetIndex!,
          markedEnemyBonus: 1,
          markedEnemyOffPenalty: 1,
        },
      };
    }
    case 'jamming-sweep':
      return {
        ...state,
        commandPoints,
        orderThisRound,
        log: logged('Order: Jamming sweep — wide-band jamming (enemy fleet −1 computer, your fleet −1 initiative this round).'),
        roundModifiers: {
          ...state.roundModifiers,
          enemyComputerPenalty: state.roundModifiers.enemyComputerPenalty + 1,
          initiativeBonus: state.roundModifiers.initiativeBonus - 1,
        },
      };
    case 'pd-screen':
      return {
        ...state,
        commandPoints,
        orderThisRound,
        flakRemaining: { ...state.flakRemaining, player: state.flakRemaining.player + 3 },
        log: logged('Order: Point-defense screen — the escorts weave a screen (+3 flak against this fight’s remaining missiles).'),
      };
    case 'focused-barrage': {
      const ship = state.playerShips.find((s) => s.index === targetIndex);
      const label = ship ? `ship ${ship.index + 1}` : 'the ship';
      return {
        ...state,
        commandPoints,
        orderThisRound,
        log: logged(`Order: Focused barrage — ${label}'s weapons hit harder (+1 damage per die this round).`),
        roundModifiers: { ...state.roundModifiers, damageBoostShipIndex: targetIndex! },
      };
    }
    case 'all-ahead-full':
      return {
        ...state,
        commandPoints,
        orderThisRound,
        log: logged('Order: All ahead full — the whole fleet surges (+1 initiative this round).'),
        roundModifiers: { ...state.roundModifiers, initiativeBonus: state.roundModifiers.initiativeBonus + 1 },
      };
    case 'bulwark': {
      const ship = state.playerShips.find((s) => s.index === targetIndex);
      const label = ship ? `ship ${ship.index + 1}` : 'the ship';
      return {
        ...state,
        commandPoints,
        orderThisRound,
        log: logged(`Order: Bulwark — ${label} holds the line (+2 piloting this round, any phase) and keeps firing.`),
        roundModifiers: {
          ...state.roundModifiers,
          bulwarkShipIndices: [...state.roundModifiers.bulwarkShipIndices, targetIndex!],
        },
      };
    }
  }
}

// 2026-08-12 (player report): once armed, an order was permanently locked
// in for the round with no way back — a misclick (wrong ship braced, wrong
// order entirely) cost the command point for nothing. This reverses
// whatever `orderThisRound` currently holds, valid only up to the next
// ADVANCE_ROUND (freshRoundModifiers() there wipes the round clean anyway,
// so there's nothing to undo once a new round starts — canUnissueOrder
// doesn't need its own round-boundary check beyond `orderThisRound` itself
// being cleared by that same reset).
export function canUnissueOrder(state: CombatState): boolean {
  return !state.winner && state.orderThisRound !== null;
}

// Reverses issueOrder's per-case delta exactly. Safe unconditionally
// because at most one order can ever be armed in a round (orderThisRound's
// own lock) — so whatever's in roundModifiers attributable to THIS order
// is exactly what issueOrder added a moment ago, nothing else has touched
// it since, and resetting brace/exploit-weakness's fields outright (rather
// than filtering/diffing) is equivalent to subtracting them.
export function unissueOrder(state: CombatState): CombatState {
  if (!canUnissueOrder(state)) return state;
  const order = state.orderThisRound!;
  const commandPoints = state.commandPoints + 1;
  const logged = (text: string): CombatEvent[] => [...state.log, { kind: 'part-effect', text }];

  switch (order) {
    case 'attack-run':
      return {
        ...state,
        commandPoints,
        orderThisRound: null,
        log: logged('Order cancelled: Attack run.'),
        roundModifiers: {
          ...state.roundModifiers,
          computerBonus: state.roundModifiers.computerBonus - 1,
          playerShieldBonus: state.roundModifiers.playerShieldBonus + 1,
        },
      };
    case 'evasive-pattern':
      return {
        ...state,
        commandPoints,
        orderThisRound: null,
        log: logged('Order cancelled: Evasive pattern.'),
        roundModifiers: {
          ...state.roundModifiers,
          computerBonus: state.roundModifiers.computerBonus + 1,
          playerShieldBonus: state.roundModifiers.playerShieldBonus - 1,
        },
      };
    case 'brace':
      return {
        ...state,
        commandPoints,
        orderThisRound: null,
        log: logged('Order cancelled: Brace.'),
        roundModifiers: { ...state.roundModifiers, bracingShipIndices: [] },
      };
    case 'exploit-weakness':
      return {
        ...state,
        commandPoints,
        orderThisRound: null,
        log: logged('Order cancelled: Exploit weakness.'),
        roundModifiers: { ...state.roundModifiers, markedEnemyIndex: null, markedEnemyBonus: 0, markedEnemyOffPenalty: 0 },
      };
    case 'patch-crews': {
      const targetIndex = state.roundModifiers.heldFireShipIndices[0];
      const playerShips = state.playerShips.map((s) => (s.index === targetIndex ? { ...s, damage: s.damage + 1 } : s));
      return {
        ...state,
        commandPoints,
        orderThisRound: null,
        playerShips,
        log: logged('Order cancelled: Patch crews.'),
        roundModifiers: { ...state.roundModifiers, heldFireShipIndices: [] },
      };
    }
    case 'countermeasures':
      return {
        ...state,
        commandPoints,
        orderThisRound: null,
        flakRemaining: { ...state.flakRemaining, player: Math.max(0, state.flakRemaining.player - 1) },
        log: logged('Order cancelled: Countermeasures.'),
        roundModifiers: { ...state.roundModifiers, computerBonus: state.roundModifiers.computerBonus + 1 },
      };
    case 'attack-run-2':
      return {
        ...state,
        commandPoints,
        orderThisRound: null,
        log: logged('Order cancelled: Attack run II.'),
        roundModifiers: {
          ...state.roundModifiers,
          computerBonus: state.roundModifiers.computerBonus - 2,
          playerShieldBonus: state.roundModifiers.playerShieldBonus + 1,
        },
      };
    case 'evasive-pattern-2':
      return {
        ...state,
        commandPoints,
        orderThisRound: null,
        log: logged('Order cancelled: Evasive pattern II.'),
        roundModifiers: {
          ...state.roundModifiers,
          computerBonus: state.roundModifiers.computerBonus + 2,
          playerShieldBonus: state.roundModifiers.playerShieldBonus - 1,
        },
      };
    case 'focus-fire':
      return {
        ...state,
        commandPoints,
        orderThisRound: null,
        log: logged('Order cancelled: Focus fire.'),
        roundModifiers: { ...state.roundModifiers, markedEnemyIndex: null, markedEnemyBonus: 0, markedEnemyOffPenalty: 0 },
      };
    case 'jamming-sweep':
      return {
        ...state,
        commandPoints,
        orderThisRound: null,
        log: logged('Order cancelled: Jamming sweep.'),
        roundModifiers: {
          ...state.roundModifiers,
          enemyComputerPenalty: state.roundModifiers.enemyComputerPenalty - 1,
          initiativeBonus: state.roundModifiers.initiativeBonus + 1,
        },
      };
    case 'pd-screen':
      return {
        ...state,
        commandPoints,
        orderThisRound: null,
        flakRemaining: { ...state.flakRemaining, player: Math.max(0, state.flakRemaining.player - 3) },
        log: logged('Order cancelled: Point-defense screen.'),
      };
    case 'focused-barrage':
      return {
        ...state,
        commandPoints,
        orderThisRound: null,
        log: logged('Order cancelled: Focused barrage.'),
        roundModifiers: { ...state.roundModifiers, damageBoostShipIndex: null },
      };
    case 'all-ahead-full':
      return {
        ...state,
        commandPoints,
        orderThisRound: null,
        log: logged('Order cancelled: All ahead full.'),
        roundModifiers: { ...state.roundModifiers, initiativeBonus: state.roundModifiers.initiativeBonus - 1 },
      };
    case 'bulwark':
      return {
        ...state,
        commandPoints,
        orderThisRound: null,
        log: logged('Order cancelled: Bulwark.'),
        roundModifiers: { ...state.roundModifiers, bulwarkShipIndices: [] },
      };
  }
}

export function runToEnd(state: CombatState): CombatState {
  let s = state;
  while (!s.winner) {
    s = advanceRound(s);
  }
  return s;
}

// 47.5a: a ship's clamped end-of-fight damage + whether it's destroyed —
// pure function of one CombatShip, no `state.winner` requirement.
// `combatOutcome` below maps every player ship through this. Originally
// also exported for the reducer's WITHDRAW case, which ran deliberately on
// an UNFINISHED fight (`combatOutcome` would throw) and needed the
// identical destroyed/endDamage formula without re-deriving it by hand —
// 51.3 removed WITHDRAW, so this is internal-only again, but is left
// exported (harmless) rather than churning the combatEngine.ts public
// surface for its own sake.
export function shipEndState(s: CombatShip): { endDamage: number; destroyed: boolean } {
  return { endDamage: Math.min(s.damage, s.stats.hp), destroyed: s.damage >= s.stats.hp };
}

export interface CombatOutcome {
  winner: Side;
  log: CombatEvent[];
  playerShips: { endDamage: number; destroyed: boolean }[];
}

export function combatOutcome(state: CombatState): CombatOutcome {
  if (!state.winner) throw new Error('combatOutcome called before the fight ended');
  return {
    winner: state.winner,
    log: state.log,
    playerShips: state.playerShips.map(shipEndState),
  };
}

// --- Active parts (iteration 7): once-per-combat abilities on equipment --

// A ship's Nth active ability (by equip order) is identified by
// `(shipIndex, abilityIndex)`, where `abilityIndex` indexes into
// `stats.actives` — the part ids of every active part this ship carries.
// 2026-08-12 (player report): a repair active (injector, dcbay) could be
// spent at full HP for zero effect — Math.max(0, damage - N) silently
// no-ops at damage 0, so the once-per-combat charge just burned for
// nothing, with no warning it would.
const REPAIR_ACTIVES: PartId[] = ['injector', 'dcbay'];

export function canUseActive(state: CombatState, shipIndex: number, abilityIndex: number): boolean {
  if (state.winner) return false;
  const ship = state.playerShips[shipIndex];
  if (!ship || !isAlive(ship)) return false;
  const abilityId = ship.stats.actives?.[abilityIndex];
  if (!abilityId) return false;
  if (REPAIR_ACTIVES.includes(abilityId) && ship.damage <= 0) return false;
  return !state.usedActives.some((u) => u.shipIndex === shipIndex && u.abilityIndex === abilityIndex);
}

export function useActive(state: CombatState, shipIndex: number, abilityIndex: number): CombatState {
  if (!canUseActive(state, shipIndex, abilityIndex)) return state;
  const abilityId: PartId = state.playerShips[shipIndex].stats.actives![abilityIndex];
  const usedActives = [...state.usedActives, { shipIndex, abilityIndex }];

  // Every activation logs a part-effect line (2026-08-02). Before, only the
  // dcbay did — the round-modifier actives changed nothing visible until the
  // next round resolved, so an activation looked like a dead click and
  // players re-clicked into the spent state.
  const armed = (text: string): CombatEvent[] => [...state.log, { kind: 'part-effect', text }];

  switch (abilityId) {
    // Iteration 41: redesigned from a round-modifier ("fire first this
    // round") to an immediate self-heal — same shape as dcbay just below,
    // at half the repair (rare vs. epic, priced accordingly).
    case 'injector': {
      const playerShips = cloneShips(state.playerShips);
      playerShips[shipIndex].damage = Math.max(0, playerShips[shipIndex].damage - 1);
      return { ...state, usedActives, playerShips, log: armed('Overdrive injector repairs 1 damage.') };
    }
    case 'uplink2':
      return {
        ...state,
        usedActives,
        log: armed('Targeting uplink armed — +2 computer for your fleet this round.'),
        roundModifiers: { ...state.roundModifiers, computerBonus: state.roundModifiers.computerBonus + 2 },
      };
    case 'modulator':
      return {
        ...state,
        usedActives,
        log: armed('Piloting modulator armed — +2 piloting for your fleet this round.'),
        roundModifiers: { ...state.roundModifiers, playerShieldBonus: state.roundModifiers.playerShieldBonus + 2 },
      };
    case 'dcbay': {
      const playerShips = cloneShips(state.playerShips);
      playerShips[shipIndex].damage = Math.max(0, playerShips[shipIndex].damage - 2);
      return { ...state, usedActives, playerShips, log: armed('Damage control bay repairs 2 damage.') };
    }
    case 'override':
      return {
        ...state,
        usedActives,
        log: armed('Fire-control override armed — this ship rerolls each missed die this round.'),
        roundModifiers: {
          ...state.roundModifiers,
          overrideShipIndices: [...state.roundModifiers.overrideShipIndices, shipIndex],
        },
      };
    // Iteration 63.3 (Reload drones): a round modifier like uplink2/
    // modulator above, just consumed by advanceRound's own dedicated block
    // (right before the stalemate check) instead of a per-die formula —
    // the effect isn't "bigger dice this round," it's "fire a whole
    // second missile volley," which doesn't fit the additive-bonus shape
    // the other round modifiers use.
    case 'reloaddrones':
      return {
        ...state,
        usedActives,
        log: armed('Reload drones armed — the fleet fires its missiles once more at the end of this round.'),
        roundModifiers: { ...state.roundModifiers, reloadDronesArmed: true },
      };
    case 'thrusters':
      return {
        ...state,
        usedActives,
        log: armed('Emergency thrusters armed — this ship evades everything this round, and fires nothing.'),
        roundModifiers: {
          ...state.roundModifiers,
          evadingShipIndices: [...state.roundModifiers.evadingShipIndices, shipIndex],
        },
      };
    case 'chaff':
      return {
        ...state,
        usedActives,
        log: armed('Chaff launcher armed — natural 6s against this ship are not automatic hits this round.'),
        roundModifiers: {
          ...state.roundModifiers,
          chaffShipIndices: [...state.roundModifiers.chaffShipIndices, shipIndex],
        },
      };
    // Iteration 23 (support hulls) below.
    case 'tacrelay':
      return {
        ...state,
        usedActives,
        log: armed('Tactical relay armed — +1 computer and +1 initiative for your fleet this round.'),
        roundModifiers: {
          ...state.roundModifiers,
          computerBonus: state.roundModifiers.computerBonus + 1,
          initiativeBonus: state.roundModifiers.initiativeBonus + 1,
        },
      };
    case 'repairbay': {
      const alive = state.playerShips.filter(isAlive);
      if (alive.length === 0) return { ...state, usedActives, log: armed('Repair drone bay finds nothing to repair.') };
      // Lowest remaining-HP fraction, not lowest raw HP — a hurt Dreadnought
      // still outranks a barely-scratched Derelict.
      const target = alive.reduce((worst, s) =>
        remainingHp(s) / s.stats.hp < remainingHp(worst) / worst.stats.hp ? s : worst,
      );
      const playerShips = cloneShips(state.playerShips);
      playerShips[target.index].damage = Math.max(0, playerShips[target.index].damage - 3);
      return {
        ...state,
        usedActives,
        playerShips,
        log: armed("Repair drone bay repairs 3 damage on the fleet's most-damaged ship."),
      };
    }
    case 'ecm':
      return {
        ...state,
        usedActives,
        log: armed("ECM pod armed — the enemy fleet's computer is reduced by 2 this round."),
        roundModifiers: {
          ...state.roundModifiers,
          enemyComputerPenalty: state.roundModifiers.enemyComputerPenalty + 2,
        },
      };
    // Evasion suite (reworked 2026-08-07 from "Shield disruptor", which
    // used to reduce the enemy fleet's piloting): a permanent self-buff,
    // not a round modifier — mutates this ship's own live stats.shield
    // directly, same "clone + mutate" shape dcbay/injector use for
    // .damage, just on a different field. Persists for the rest of the
    // fight since CombatShip.stats is a live object, not recomputed.
    case 'disruptor': {
      const playerShips = cloneShips(state.playerShips);
      const ship = playerShips[shipIndex];
      playerShips[shipIndex] = { ...ship, stats: { ...ship.stats, shield: ship.stats.shield + 3 } };
      return {
        ...state,
        usedActives,
        playerShips,
        log: armed('Evasion suite armed — this ship gains +3 piloting for the rest of the fight.'),
      };
    }
    default:
      return state;
  }
}
