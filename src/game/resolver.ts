import type { RngFn } from './rng';
import { rollD6 } from './rng';
import type { CombatEvent, CombatResult, EnemyDef, ShipStats, Side } from './types';

const MAX_CANNON_ROUNDS = 30;

interface CombatShip {
  side: Side;
  index: number; // index within its own side
  stats: ShipStats;
  damage: number;
}

function remainingHp(ship: CombatShip): number {
  return ship.stats.hp - ship.damage;
}

function isAlive(ship: CombatShip): boolean {
  return remainingHp(ship) > 0;
}

// Picks the alive defender with the lowest remaining HP; ties broken by
// lowest index. Returns null if no defender is alive.
function pickTarget(defenders: CombatShip[]): CombatShip | null {
  let best: CombatShip | null = null;
  for (const ship of defenders) {
    if (!isAlive(ship)) continue;
    if (best === null || remainingHp(ship) < remainingHp(best)) {
      best = ship;
    }
  }
  return best;
}

// `chaffActive` (iteration 8, addendum A.3): while the chaff launcher active
// is armed for the defending ship this round, a natural 6 (or `maxRoll`,
// iteration 40) is no longer an automatic hit — it resolves as a normal
// roll instead. `maxRoll` defaults to 6; an overcharged die rolls on 7
// faces, and its top face (7) is the one that always hits, not 6.
export function resolveHit(
  raw: number,
  attackerComputer: number,
  defenderShield: number,
  chaffActive = false,
  maxRoll = 6,
): boolean {
  if (raw === maxRoll && !chaffActive) return true;
  if (raw === 1) return false;
  return raw + attackerComputer - defenderShield >= 6;
}

export function resolveCombat(playerFleet: ShipStats[], enemyDef: EnemyDef, rng: RngFn): CombatResult {
  const log: CombatEvent[] = [];

  const playerShips: CombatShip[] = playerFleet.map((stats, index) => ({
    side: 'player',
    index,
    stats,
    damage: 0,
  }));
  // Iteration 9: an enemy is a composition of sub-groups — flatten to one
  // CombatShip per ship, in group order, with a single continuous index.
  const enemyShips: CombatShip[] = enemyDef.groups
    .flatMap((group) => Array.from({ length: group.count }, () => group.stats))
    .map((stats, index) => ({
      side: 'enemy' as Side,
      index,
      stats,
      damage: 0,
    }));

  // Every ship acts on its own initiative: descending, player wins ties,
  // then by index for a stable order.
  const activationOrder: CombatShip[] = [...playerShips, ...enemyShips].sort((a, b) => {
    if (b.stats.initiative !== a.stats.initiative) return b.stats.initiative - a.stats.initiative;
    if (a.side !== b.side) return a.side === 'player' ? -1 : 1;
    return a.index - b.index;
  });

  function opponentsOf(ship: CombatShip): CombatShip[] {
    return ship.side === 'player' ? enemyShips : playerShips;
  }

  function checkWinner(): Side | null {
    if (!enemyShips.some(isAlive)) return 'player';
    if (!playerShips.some(isAlive)) return 'enemy';
    return null;
  }

  // Fires one ship's dice for the phase. Returns the winner if the battle
  // ends mid-activation, else null.
  function activate(ship: CombatShip, phase: 'missile' | 'cannon', round: number): Side | null {
    if (!isAlive(ship)) return null;
    const weapons = phase === 'missile' ? ship.stats.missiles : ship.stats.cannons;

    for (const weapon of weapons) {
      for (let d = 0; d < weapon.diceCount; d++) {
        const target = pickTarget(opponentsOf(ship));
        if (!target) return checkWinner();

        const raw = rollD6(rng);
        const hit = resolveHit(raw, ship.stats.computer, target.stats.shield);
        const damage = hit ? weapon.damage : 0;

        log.push({
          kind: 'roll',
          phase,
          round,
          side: ship.side,
          shooterIndex: ship.index,
          targetIndex: target.index,
          raw,
          computer: ship.stats.computer,
          shield: target.stats.shield,
          hit,
          damage,
        });

        if (hit) {
          target.damage += damage;
          if (!isAlive(target)) {
            log.push({ kind: 'destroyed', side: target.side, shipIndex: target.index });
            const winner = checkWinner();
            if (winner) return winner;
          }
        }
      }
    }
    return null;
  }

  let winner: Side | null = null;

  // --- Missile phase (once) ---
  log.push({ kind: 'phase-start', phase: 'missile', round: 0 });
  for (const ship of activationOrder) {
    winner = activate(ship, 'missile', 0);
    if (winner) break;
  }

  // --- Cannon rounds ---
  let round = 1;
  while (!winner && round <= MAX_CANNON_ROUNDS) {
    log.push({ kind: 'phase-start', phase: 'cannon', round });
    for (const ship of activationOrder) {
      winner = activate(ship, 'cannon', round);
      if (winner) break;
    }
    round++;
  }

  if (!winner) {
    log.push({ kind: 'stalemate' });
    winner = 'enemy';
  }

  return { winner, log };
}
