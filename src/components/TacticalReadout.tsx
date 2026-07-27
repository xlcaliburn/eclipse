import { useMemo } from 'react';
import { forecastWinRate } from '../game/forecast';
import { weaponHitChance } from '../game/hitMath';
import { getPart } from '../game/parts';
import { effectiveSlots, playerShipLabel } from '../game/ship';
import type { TargetingStance } from '../game/combatEngine';
import type { EnemyDef, PartId, PlayerShipState, ShipStats, WeaponStats } from '../game/types';

interface TacticalReadoutProps {
  fleet: PlayerShipState[];
  fleetStats: ShipStats[];
  enemy: EnemyDef;
  stance: TargetingStance;
  onSetStance: (stance: TargetingStance) => void;
  // Iteration 12.3 delta preview: the inventory part currently hovered (and
  // the ship it would go to). Null when nothing is hovered.
  hoveredPartId: PartId | null;
  selectedShipIndex: number;
}

const FORECAST_PIPS = 20;

// `forecastWinRate` returns a whole-number percentage (0-100).
function forecastTone(ratePct: number): string {
  if (ratePct < 40) return 'danger';
  if (ratePct <= 70) return 'warning';
  return 'success';
}

function ForecastRow({
  label,
  rate,
  active,
  onClick,
}: {
  label: string;
  rate: number;
  active: boolean;
  onClick: () => void;
}) {
  const pct = Math.round(rate);
  const filled = Math.round((rate / 100) * FORECAST_PIPS);
  const tone = forecastTone(rate);
  return (
    <button
      type="button"
      className={`forecast-row${active ? ' forecast-row--active' : ''}`}
      onClick={onClick}
      title={active ? 'Current doctrine' : 'Switch doctrine'}
    >
      <span className="forecast-row__label">{label}</span>
      <span className={`forecast-row__pips forecast-row__pips--${tone}`} aria-hidden="true">
        {Array.from({ length: FORECAST_PIPS }, (_, i) => (
          <span key={i} className={`forecast-pip${i < filled ? ' forecast-pip--filled' : ''}`} />
        ))}
      </span>
      <span className={`forecast-row__pct forecast-row__pct--${tone}`}>{pct}%</span>
    </button>
  );
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

export function TacticalReadout({
  fleet,
  fleetStats,
  enemy,
  stance,
  onSetStance,
  hoveredPartId,
  selectedShipIndex,
}: TacticalReadoutProps) {
  const forecastWeakest = useMemo(() => forecastWinRate(fleet, enemy, undefined, 'weakest'), [fleet, enemy]);
  const forecastStrongest = useMemo(() => forecastWinRate(fleet, enemy, undefined, 'strongest'), [fleet, enemy]);

  // Delta preview: the forecast if the hovered inventory part were equipped
  // to the selected ship right now. Null when un-equippable (no free slot).
  const preview = useMemo(() => {
    if (!hoveredPartId) return null;
    const ship = fleet[selectedShipIndex];
    if (!ship) return null;
    if (ship.equipped.length >= effectiveSlots(ship.frameId, ship.upgrades)) return { blocked: true as const };
    const withPart = fleet.map((s, i) =>
      i === selectedShipIndex ? { ...s, equipped: [...s.equipped, hoveredPartId] } : s,
    );
    return { blocked: false as const, rate: forecastWinRate(withPart, enemy, undefined, stance) };
  }, [hoveredPartId, fleet, selectedShipIndex, enemy, stance]);

  const current = stance === 'weakest' ? forecastWeakest : forecastStrongest;

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

      <div className="forecast-stances">
        <ForecastRow
          label="Focus weakest"
          rate={forecastWeakest}
          active={stance === 'weakest'}
          onClick={() => onSetStance('weakest')}
        />
        <ForecastRow
          label="Focus strongest"
          rate={forecastStrongest}
          active={stance === 'strongest'}
          onClick={() => onSetStance('strongest')}
        />
      </div>
      {hoveredPartId && (
        <p className="forecast-delta">
          {getPart(hoveredPartId).name} on {playerShipLabel(fleet, selectedShipIndex)}:{' '}
          {preview?.blocked ? (
            <strong>no free slot</strong>
          ) : preview ? (
            <>
              {Math.round(current)}% → <strong>{Math.round(preview.rate)}%</strong>
            </>
          ) : null}
        </p>
      )}
      <p className="hint">Forecast excludes reaction cards and active abilities — those are your edge.</p>

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
