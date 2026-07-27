import type { ShipStats } from '../game/types';
import { HpPipRow } from './HpPipRow';
import { WeaponDiceRow } from './Die';

// Iteration 13: ONE stat presentation for every ship everywhere — fleet
// panel, enemy panel, combat cards. HP as pips, the three combat stats in
// a fixed order with fixed labels, weapons as dice.
export function StatBar({
  stats,
  damage = 0,
  showWeapons = true,
}: {
  stats: ShipStats;
  damage?: number;
  showWeapons?: boolean;
}) {
  const hp = Math.max(0, stats.hp - damage);
  return (
    <div className="stat-bar">
      <HpPipRow hp={hp} maxHp={stats.hp} />
      <div className="stat-bar__line">
        <span className="stat-bar__stat" title="Initiative — fires earlier each round">
          <abbr>INIT</abbr> {stats.initiative}
        </span>
        <span className="stat-bar__stat" title="Computer — added to every attack roll">
          <abbr>COMP</abbr> {stats.computer}
        </span>
        <span className="stat-bar__stat" title="Shield — subtracted from every roll against this ship">
          <abbr>SHD</abbr> {stats.shield}
        </span>
      </div>
      {showWeapons && <WeaponDiceRow stats={stats} />}
    </div>
  );
}
