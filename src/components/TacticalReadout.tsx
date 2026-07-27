import { weaponHitChance } from '../game/hitMath';
import { playerShipLabel } from '../game/ship';
import type { TargetingStance } from '../game/combatEngine';
import type { EnemyDef, PlayerShipState, ShipStats, WeaponStats } from '../game/types';

// Iteration 13: the win-rate forecast is GONE by design — per-weapon odds
// (below) are the only numbers the player gets before a fight; outcomes
// are discovered by playing. `forecast.ts` still exists for the balance
// script and tests; nothing player-facing calls it.

interface TacticalReadoutProps {
  fleet: PlayerShipState[];
  fleetStats: ShipStats[];
  enemy: EnemyDef;
  stance: TargetingStance;
  onSetStance: (stance: TargetingStance) => void;
}

function weaponLabel(weapon: WeaponStats, kind: 'cannon' | 'missile'): string {
  return `${weapon.diceCount}× ${kind} (${weapon.damage} dmg)`;
}

function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

// Every (weapon, phase) a set of stats can fire, in display order.
function shipWeapons(stats: ShipStats): { weapon: WeaponStats; phase: 'missile' | 'cannon' }[] {
  return [
    ...stats.missiles.map((weapon) => ({ weapon, phase: 'missile' as const })),
    ...stats.cannons.map((weapon) => ({ weapon, phase: 'cannon' as const })),
  ];
}

export function TacticalReadout({ fleet, fleetStats, enemy, stance, onSetStance }: TacticalReadoutProps) {
  const playerRows = fleet.flatMap((_ship, shipIndex) => {
    const stats = fleetStats[shipIndex];
    if (!stats) return [];
    return shipWeapons(stats).map(({ weapon, phase }, wi) => ({
      key: `${shipIndex}-${wi}`,
      shipLabel: playerShipLabel(fleet, shipIndex),
      weapon,
      phase,
      stats,
    }));
  });

  const enemyRows = enemy.groups.flatMap((group, gi) =>
    shipWeapons(group.stats).map(({ weapon, phase }, wi) => ({
      key: `${gi}-${wi}`,
      groupLabel: enemy.groups.length > 1 ? group.label : enemy.name,
      weapon,
      phase,
      stats: group.stats,
    })),
  );

  return (
    <section className="tactical-readout">
      <h3 className="tactical-readout__title">Tactical readout</h3>

      <div className="stance-toggle" role="group" aria-label="Targeting doctrine">
        <span className="stance-toggle__label">Doctrine:</span>
        <button
          type="button"
          className={`stance-toggle__option${stance === 'weakest' ? ' stance-toggle__option--active' : ''}`}
          onClick={() => onSetStance('weakest')}
          title="Dice hunt the lowest-HP enemy first — clears screens and swarms fastest"
        >
          Focus weakest
        </button>
        <button
          type="button"
          className={`stance-toggle__option${stance === 'strongest' ? ' stance-toggle__option--active' : ''}`}
          onClick={() => onSetStance('strongest')}
          title="Dice hunt the highest-HP enemy first — punches through screens to the threat"
        >
          Focus strongest
        </button>
      </div>
      <p className="hint">In the fight, click an enemy ship to override doctrine and focus fire on it.</p>

      <details className="firing-solutions" open>
        <summary>Firing solutions</summary>
        <table className="firing-table">
          <thead>
            <tr>
              <th>Your guns</th>
              {enemy.groups.map((group, gi) => (
                <th key={gi}>{enemy.groups.length > 1 ? group.label : enemy.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {playerRows.map((row) => (
              <tr key={row.key}>
                <td>
                  {row.shipLabel} · {weaponLabel(row.weapon, row.phase === 'missile' ? 'missile' : 'cannon')}
                </td>
                {enemy.groups.map((group, gi) => (
                  <td key={gi}>{pct(weaponHitChance(row.stats, row.weapon, group.stats, row.phase))}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <table className="firing-table firing-table--enemy">
          <thead>
            <tr>
              <th>Incoming fire</th>
              {fleet.map((_, i) => (
                <th key={i}>{playerShipLabel(fleet, i)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {enemyRows.map((row) => (
              <tr key={row.key}>
                <td>
                  {row.groupLabel} · {weaponLabel(row.weapon, row.phase === 'missile' ? 'missile' : 'cannon')}
                </td>
                {fleet.map((_, i) => {
                  const defender = fleetStats[i];
                  return (
                    <td key={i}>{defender ? pct(weaponHitChance(row.stats, row.weapon, defender, row.phase)) : '—'}</td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
