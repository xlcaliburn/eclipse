import type { CardId } from './cards';
import { resumeRng, rollD6 } from './rng';
import type { RngFn } from './rng';
import { resolveHit } from './resolver';
import type { CombatEvent, EnemyDef, PartId, ShipStats, Side } from './types';

const MAX_CANNON_ROUNDS = 30;

export interface CombatShip {
  side: Side;
  index: number; // index within its own side
  stats: ShipStats;
  damage: number;
  reactiveArmorRemaining: number; // hits still negated this whole combat (does not replenish per round)
  ablativeRemaining: number; // temporary HP absorbed before real HP, this whole combat (does not persist between fights)
  jinkAvailable: boolean; // iteration 8: the first hit this combat misses instead, consumed before reactive armor
}

export interface ArmedEffects {
  bulkheadsArmed: boolean;
}

export interface RoundModifiers {
  initiativeBonus: number;
  computerBonus: number;
  playerShieldBonus: number; // shield modulator active: +2 shield to all player ships this round
  volleyActive: boolean; // second volley card: player cannon dice fire twice this round
  overrideShipIndices: number[]; // fire-control override active: these player ships reroll a missed die once
  evadingShipIndices: number[]; // emergency thrusters active: these player ships can't be targeted and don't fire
  chaffShipIndices: number[]; // chaff launcher active: natural 6s against these player ships resolve as normal rolls
}

// A plain, serializable snapshot of an in-progress (or finished) fight. The
// resumable engine (initCombat/advanceRound/runToEnd) is the single source
// of truth for iteration 3's stepped, card-aware combat. This is separate
// from resolver.ts's original one-shot `resolveCombat`, which is left
// untouched so the iteration 1/2 resolver test suite keeps passing verbatim
// against fresh (zero-damage, card-free) fleets.
export type TargetingStance = 'weakest' | 'strongest';

export interface CombatState {
  seed: number;
  rngCounter: number; // rollD6 calls consumed so far, for resuming
  round: number; // next round to resolve; 0 = missile phase, 1+ = cannon rounds
  playerShips: CombatShip[];
  enemyShips: CombatShip[];
  roundModifiers: RoundModifiers;
  armedEffects: ArmedEffects;
  usedActives: { shipIndex: number; abilityIndex: number }[]; // active parts already spent this combat
  // Iteration 9.4: the player's fleet-wide targeting doctrine for this fight
  // — set once at initCombat (from RunState, persists between fights until
  // the player changes it on the prep screen), applies to every player die.
  // Enemy targeting is always lowest-HP-first, untouched by this.
  targetingStance: TargetingStance;
  // Iteration 13: a manually-picked enemy ship (flattened index) that ALL
  // player dice fire at while it lives — clicked in the combat theater.
  // Beats the stance and the siege cannon's per-die override (player intent
  // outranks doctrine); dead/absent priority falls back to the stance.
  // Additive + optional, so pre-13 saves stay loadable.
  priorityTargetIndex?: number | null;
  log: CombatEvent[];
  winner?: Side;
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

// Greedy lowest- (or, for the siege cannon, highest-) remaining-HP
// targeting. A taunting defender, if alive, overrides everything — every
// die must go to a taunter (still narrowed by HP preference among them).
// Absent a taunter, cloaked defenders are excluded from consideration
// UNLESS every alive defender is cloaked (the all-cloaked exception, so
// combat can never stall with no legal target). Taunt beats cloak: a
// cloaked taunter is still targetable. Only player parts ever set
// `taunt`/`cloak`, so both are no-ops when the defenders are an enemy group.
function pickTarget(defenders: CombatShip[], preferHighest = false): CombatShip | null {
  const alive = defenders.filter(isAlive);
  if (alive.length === 0) return null;

  const taunters = alive.filter((d) => d.stats.taunt);
  let candidates: CombatShip[];
  if (taunters.length > 0) {
    candidates = taunters;
  } else {
    const nonCloaked = alive.filter((d) => !d.stats.cloak);
    candidates = nonCloaked.length > 0 ? nonCloaked : alive;
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

function computeActivationOrder(playerShips: CombatShip[], enemyShips: CombatShip[], initiativeBonus: number): CombatShip[] {
  const effInit = (s: CombatShip) => s.stats.initiative + (s.side === 'player' ? initiativeBonus : 0);
  return [...playerShips, ...enemyShips].sort((a, b) => {
    const ia = effInit(a);
    const ib = effInit(b);
    if (ib !== ia) return ib - ia;
    if (a.side !== b.side) return a.side === 'player' ? -1 : 1;
    return a.index - b.index;
  });
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
  armedEffects: ArmedEffects,
  flakState: FlakState,
  targetingStance: TargetingStance,
  priorityTargetIndex: number | null | undefined,
  checkWinner: () => Side | null,
): Side | null {
  if (!isAlive(ship)) return null;

  // Emergency thrusters (evasive burn): this ship neither fires nor can be
  // targeted this round — it sits out entirely, including suppressing any
  // taunt it would otherwise apply (it's simply excluded from the pool).
  if (ship.side === 'player' && roundModifiers.evadingShipIndices.includes(ship.index)) {
    return null;
  }

  const weapons = phase === 'missile' ? ship.stats.missiles : ship.stats.cannons;

  const attackerComputer = ship.stats.computer + (ship.side === 'player' ? roundModifiers.computerBonus : 0);

  for (const weapon of weapons) {
    // Second volley doubles every player cannon die for the round.
    const diceCount =
      weapon.diceCount * (phase === 'cannon' && ship.side === 'player' && roundModifiers.volleyActive ? 2 : 1);

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
      // cannon's per-die override wins, then the fleet doctrine (9.4) —
      // enemy targeting is always lowest-HP-first, untouched by any of it.
      const defenders = legalDefenders(opponentsOf(ship), roundModifiers);
      const priority =
        ship.side === 'player' && priorityTargetIndex != null
          ? defenders.find((s) => s.index === priorityTargetIndex)
          : undefined;
      const preferHighest =
        ship.side === 'player' ? weapon.targetHighest || targetingStance === 'strongest' : !!weapon.targetHighest;
      const target = priority ?? pickTarget(defenders, preferHighest);
      if (!target) return checkWinner(); // no legal target — the barrage finds nothing

      // Shield capacitors add bonus shield only during the missile phase
      // and the first cannon round — gone from round 2 on. The shield
      // modulator active adds a flat bonus to the whole player fleet.
      const capacitorActive = phase === 'missile' || (phase === 'cannon' && round === 1);
      const modulatorBonus = target.side === 'player' ? roundModifiers.playerShieldBonus : 0;
      const baseShield = target.stats.shield + (capacitorActive ? target.stats.capacitorShield ?? 0 : 0) + modulatorBonus;
      const effectiveShield = Math.max(
        0,
        baseShield - (ship.stats.shieldPierce ?? 0) - (weapon.shieldPierce ?? 0),
      );
      const raw = rollD6(rng);

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
      let hit = resolveHit(raw, attackerComputer, effectiveShield, chaffActive);

      // Fire-control override: this ship rerolls each missed die once.
      if (!hit && ship.side === 'player' && roundModifiers.overrideShipIndices.includes(ship.index)) {
        const rerollRaw = rollD6(rng);
        const rerollHit = resolveHit(rerollRaw, attackerComputer, effectiveShield, chaffActive);
        log.push({ kind: 'part-effect', text: `Fire-control override rerolls the miss — rolls ${rerollRaw}.` });
        finalRaw = rerollRaw;
        hit = rerollHit;
      }

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
          log.push({ kind: 'part-effect', text: `Arc projector deals ${weapon.aoeDamage} damage to every enemy ship.` });
          let anyDestroyed = false;
          for (const opp of opponentsOf(ship)) {
            if (!isAlive(opp)) continue;
            opp.damage += weapon.aoeDamage;
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

      let damage = hit ? weapon.damage : 0;
      let bulkheadsSaved = false;
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
        if (target.side === 'player' && armedEffects.bulkheadsArmed) {
          const would = target.damage + damage;
          if (would >= target.stats.hp) {
            damage = Math.max(0, target.stats.hp - 1 - target.damage);
            bulkheadsSaved = true;
          }
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
          if (ablativeAbsorbed > 0) {
            log.push({ kind: 'part-effect', text: `Ablative coating absorbs ${ablativeAbsorbed} damage.` });
          }
          target.damage += damage;
          if (bulkheadsSaved) {
            armedEffects.bulkheadsArmed = false;
            log.push({
              kind: 'card',
              cardId: 'bulkheads' as CardId,
              text: 'Emergency bulkheads keep a ship in the fight at 1 HP.',
            });
          } else if (!isAlive(target)) {
            log.push({ kind: 'destroyed', side: target.side, shipIndex: target.index });
            const prowWinner = applyOnDestroyTrigger(target, opponentsOf, log, checkWinner);
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
    volleyActive: false,
    overrideShipIndices: [],
    evadingShipIndices: [],
    chaffShipIndices: [],
  };
}

export function initCombat(
  playerFleet: PlayerFleetInput[],
  enemyDef: EnemyDef,
  seed: number,
  targetingStance: TargetingStance = 'weakest',
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
    armedEffects: { bulkheadsArmed: false },
    usedActives: [],
    targetingStance,
    priorityTargetIndex: null,
    log: [],
    winner: undefined,
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
  const target = pickTarget(enemyShips, stance === 'strongest');
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
  const armedEffects: ArmedEffects = { ...state.armedEffects };
  const roundModifiers = state.roundModifiers;

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

  log.push({ kind: 'phase-start', phase, round: roundNumber });

  const flakState: FlakState = {
    playerRemaining: isMissilePhase ? playerShips.filter(isAlive).reduce((sum, s) => sum + (s.stats.flak ?? 0), 0) : 0,
    enemyRemaining: isMissilePhase ? enemyShips.filter(isAlive).reduce((sum, s) => sum + (s.stats.flak ?? 0), 0) : 0,
  };

  const order = computeActivationOrder(playerShips, enemyShips, roundModifiers.initiativeBonus);

  let winner: Side | null = null;
  for (const ship of order) {
    winner = fireShip(
      ship,
      phase,
      roundNumber,
      rng,
      log,
      opponentsOf,
      roundModifiers,
      armedEffects,
      flakState,
      state.targetingStance,
      state.priorityTargetIndex,
      checkWinner,
    );
    if (winner) break;
  }

  if (!winner && !isMissilePhase && roundNumber === MAX_CANNON_ROUNDS) {
    log.push({ kind: 'stalemate' });
    winner = 'enemy';
  }

  return {
    seed: state.seed,
    rngCounter: state.rngCounter + consumedThisCall(),
    round: state.round + 1,
    playerShips,
    enemyShips,
    roundModifiers: freshRoundModifiers(),
    armedEffects,
    usedActives: state.usedActives,
    targetingStance: state.targetingStance,
    priorityTargetIndex: state.priorityTargetIndex,
    log,
    winner: winner ?? undefined,
  };
}

// Iteration 13: set (or clear, with null) the manual priority target.
// Only an alive enemy ship is accepted; anything else clears instead —
// clicking a wreck should never leave a stale lock.
export function setPriorityTarget(state: CombatState, index: number | null): CombatState {
  const valid = index !== null && state.enemyShips.some((s) => s.index === index && s.stats.hp - s.damage > 0);
  return { ...state, priorityTargetIndex: valid ? index : null };
}

export function runToEnd(state: CombatState): CombatState {
  let s = state;
  while (!s.winner) {
    s = advanceRound(s);
  }
  return s;
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
    playerShips: state.playerShips.map((s) => ({
      endDamage: Math.min(s.damage, s.stats.hp),
      destroyed: s.damage >= s.stats.hp,
    })),
  };
}

// --- Reaction card effects (pure state transitions) ---------------------

export function armBulkheads(state: CombatState): CombatState {
  return { ...state, armedEffects: { ...state.armedEffects, bulkheadsArmed: true } };
}

export function applyVolley(state: CombatState): CombatState {
  return { ...state, roundModifiers: { ...state.roundModifiers, volleyActive: true } };
}

export function canPlayCard(state: CombatState, _cardId: CardId): boolean {
  return !state.winner;
}

export function playCard(state: CombatState, cardId: CardId): CombatState {
  switch (cardId) {
    case 'bulkheads':
      return armBulkheads(state);
    case 'volley':
      return applyVolley(state);
    default:
      return state;
  }
}

// Cards that should return to the player's hand if the fight ends before
// they ever triggered (currently just bulkheads, if it was armed but no hit
// was ever lethal enough to consume it).
export function unconsumedContingentCards(state: CombatState): CardId[] {
  const returned: CardId[] = [];
  if (state.armedEffects.bulkheadsArmed) returned.push('bulkheads');
  return returned;
}

// --- Active parts (iteration 7): once-per-combat abilities on equipment --

// A ship's Nth active ability (by equip order) is identified by
// `(shipIndex, abilityIndex)`, where `abilityIndex` indexes into
// `stats.actives` — the part ids of every active part this ship carries.
export function canUseActive(state: CombatState, shipIndex: number, abilityIndex: number): boolean {
  if (state.winner) return false;
  const ship = state.playerShips[shipIndex];
  if (!ship || !isAlive(ship)) return false;
  const abilityId = ship.stats.actives?.[abilityIndex];
  if (!abilityId) return false;
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
    case 'injector':
      return {
        ...state,
        usedActives,
        log: armed('Overdrive injector armed — your ships fire first this round.'),
        roundModifiers: { ...state.roundModifiers, initiativeBonus: state.roundModifiers.initiativeBonus + 99 },
      };
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
        log: armed('Shield modulator armed — +2 shield for your fleet this round.'),
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
    default:
      return state;
  }
}
