import { resumeRng, rollD6 } from './rng';
import type { RngFn } from './rng';
import { resolveHit } from './resolver';
import type { CombatEvent, EnemyDef, PartId, ShipStats, Side } from './types';

const MAX_CANNON_ROUNDS = 30;

// Iteration 17 ("Outspeed"): a ship whose effective initiative beats the
// fastest surviving opposing ship's by this much or more gets one extra
// cannons-only activation at the end of the round. Exported so every piece
// of UI copy (badges, the enemy-panel readout) derives the number from here
// instead of hardcoding "4" — see `qualifiesForOutspeed`.
export const OUTSPEED_GAP = 4;

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
  // Iteration 28 (Protocols): set once at initCombat from RunState.protocols,
  // never changes mid-fight. `playerOutspeedGap` is asymmetric by design —
  // it only ever loosens the PLAYER side's Outspeed qualification (Overspeed
  // protocols); the enemy always still needs the full OUTSPEED_GAP, or the
  // protocol would silently speed up every enemy in the game too.
  playerOutspeedGap: number;
  alphaDoctrineActive: boolean;
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
// `ignoreTaunt` (iteration 42, Homing missile): skips the taunt-forcing
// branch entirely — the cloak all-cloaked exception below still applies.
function pickTarget(defenders: CombatShip[], preferHighest = false, ignoreTaunt = false): CombatShip | null {
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
): Side | null {
  if (!isAlive(ship)) return null;

  // Emergency thrusters (evasive burn): this ship neither fires nor can be
  // targeted this round — it sits out entirely, including suppressing any
  // taunt it would otherwise apply (it's simply excluded from the pool).
  if (ship.side === 'player' && roundModifiers.evadingShipIndices.includes(ship.index)) {
    return null;
  }

  const weapons = phase === 'missile' ? ship.stats.missiles : ship.stats.cannons;

  // ECM pod (iteration 23): the enemy penalty applies only to enemy
  // attackers, symmetric with how the player's own computerBonus (targeting
  // uplink) only ever applies to player attackers.
  const attackerComputer =
    ship.stats.computer +
    (ship.side === 'player' ? roundModifiers.computerBonus : -roundModifiers.enemyComputerPenalty);

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
      // cannon's per-die override wins, then the fleet doctrine (9.4) —
      // enemy targeting is always lowest-HP-first, untouched by any of it.
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
      const target = weapon.bypassTaunt ? pickTarget(defenders, false, true) : (priority ?? pickTarget(defenders, preferHighest));
      if (!target) return checkWinner(); // no legal target — the barrage finds nothing

      // Piloting capacitors add bonus piloting only during the missile
      // phase and the first cannon round — gone from round 2 on. The
      // piloting modulator active adds a flat bonus to the whole player
      // fleet. (Evasion suite, iteration 23's other "shield"-named part,
      // no longer touches the enemy — see its 'disruptor' case in
      // useActive, a permanent self-buff folded into stats.shield
      // directly, not a round modifier.)
      const capacitorActive = phase === 'missile' || (phase === 'cannon' && round === 1);
      const modulatorBonus = target.side === 'player' ? roundModifiers.playerShieldBonus : 0;
      // Alpha doctrine (iteration 28): the player's base shield stat is
      // zeroed for the opening exchange — everything else (capacitor,
      // piloting modulator) is additive and still applies on top of that 0.
      const targetBaseShield =
        target.side === 'player' && roundModifiers.playerBaseShieldZeroed ? 0 : target.stats.shield;
      const baseShield = targetBaseShield + (capacitorActive ? target.stats.capacitorShield ?? 0 : 0) + modulatorBonus;
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

      let damage = hit ? (executed ? preHitHp : weapon.damage + overchargeBonus) : 0;
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
            log.push({ kind: 'part-effect', text: `Ablative coating absorbs ${ablativeAbsorbed} damage.` });
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
          preferHighest,
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
  };
}

// Iteration 28 (Protocols): the two combat-engine-level protocol effects,
// bundled into one options bag so initCombat's signature doesn't grow a
// new positional param per protocol added later.
export interface CombatProtocolFlags {
  overspeedProtocols?: boolean; // player Outspeed gap 4 -> 3
  alphaDoctrine?: boolean; // player cannons also fire in the missile phase; player shield zeroed rounds 0-1
}

export function initCombat(
  playerFleet: PlayerFleetInput[],
  enemyDef: EnemyDef,
  seed: number,
  targetingStance: TargetingStance = 'weakest',
  protocolFlags?: CombatProtocolFlags,
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
    targetingStance,
    priorityTargetIndex: null,
    log: [],
    winner: undefined,
    playerOutspeedGap: protocolFlags?.overspeedProtocols ? OUTSPEED_GAP - 1 : OUTSPEED_GAP,
    alphaDoctrineActive: !!protocolFlags?.alphaDoctrine,
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
  const roundModifiers: RoundModifiers = {
    ...state.roundModifiers,
    playerBaseShieldZeroed: state.alphaDoctrineActive && roundNumber <= 1,
  };

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
      flakState,
      state.targetingStance,
      state.priorityTargetIndex,
      checkWinner,
    );
    if (winner) break;
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
      );
      if (winner) break;
    }
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
    usedActives: state.usedActives,
    targetingStance: state.targetingStance,
    priorityTargetIndex: state.priorityTargetIndex,
    log,
    winner: winner ?? undefined,
    playerOutspeedGap: state.playerOutspeedGap,
    alphaDoctrineActive: state.alphaDoctrineActive,
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
// Enemy targeting is deterministic given board state, so next round's
// OPENING fire is computable before the round is played. Each entry is one
// enemy ship's first-die pick, made with the exact functions `fireShip`
// uses (`legalDefenders` + `pickTarget`, against the LIVE roundModifiers —
// so arming an evade visibly shifts the telegraph before the player
// commits). Honest limitation for the UI copy: dice retarget
// mid-activation after kills, so this is the opening picture, not a
// contract. Pure and read-only: consumes no rng, mutates nothing.

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
    const target = pickTarget(legalDefenders(state.playerShips, state.roundModifiers), !!weapons[0]?.targetHighest);
    if (!target) continue;
    const outspeed = outspeedingEnemies.has(ship.index);
    const multiplier = outspeed ? 2 : 1;
    const diceCount = weapons.reduce((n, w) => n + w.diceCount, 0) * multiplier;
    const maxDamage = weapons.reduce((n, w) => n + w.diceCount * w.damage, 0) * multiplier;
    entries.push({ shooterIndex: ship.index, targetIndex: target.index, diceCount, maxDamage, outspeed });
  }

  const flakCancels =
    phase === 'missile' ? state.playerShips.filter(isAlive).reduce((sum, s) => sum + (s.stats.flak ?? 0), 0) : 0;

  return { phase, entries, flakCancels };
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
