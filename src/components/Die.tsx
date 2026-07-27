import type { ShipStats, WeaponStats } from '../game/types';

// Iteration 13: dice everywhere. `DieFace` is a standard d6 face (pip
// layout) used by the combat replay to show actual rolls; `WeaponDie`
// shows a weapon die with its DAMAGE as the face (cannon = solid, missile
// = dashed ring); `WeaponDiceRow` renders a ship's whole armament as dice
// instead of text lines.

const PIP_LAYOUT: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[30, 30], [70, 70]],
  3: [[30, 30], [50, 50], [70, 70]],
  4: [[30, 30], [70, 30], [30, 70], [70, 70]],
  5: [[30, 30], [70, 30], [50, 50], [30, 70], [70, 70]],
  6: [[30, 30], [70, 30], [30, 50], [70, 50], [30, 70], [70, 70]],
};

export function DieFace({ value, size = 22, className }: { value: number; size?: number; className?: string }) {
  const pips = PIP_LAYOUT[value] ?? [];
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={`die-face ${className ?? ''}`} aria-label={`rolled ${value}`}>
      <rect x="6" y="6" width="88" height="88" rx="18" className="die-face__body" />
      {pips.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="9" className="die-face__pip" />
      ))}
    </svg>
  );
}

function WeaponDie({
  damage,
  kind,
  size = 20,
}: {
  damage: number;
  kind: 'cannon' | 'missile';
  size?: number;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={`weapon-die weapon-die--${kind}`}
      aria-label={`${kind} die, ${damage} damage`}
    >
      <rect x="6" y="6" width="88" height="88" rx="18" className="weapon-die__body" />
      <text x="50" y="54" className="weapon-die__num" textAnchor="middle" dominantBaseline="central">
        {damage}
      </text>
    </svg>
  );
}

function diceFor(weapons: WeaponStats[], kind: 'cannon' | 'missile'): { damage: number; kind: 'cannon' | 'missile'; title: string }[] {
  return weapons.flatMap((w) =>
    Array.from({ length: w.diceCount }, () => ({
      damage: w.damage,
      kind,
      title: `${w.diceCount}× ${kind} (${w.damage} dmg${w.shieldPierce ? `, pierces ${w.shieldPierce} shield` : ''}${w.aoeDamage ? ', hits every ship' : ''}${w.targetHighest ? ', targets strongest' : ''}${w.selfDamageOnNatOne ? ', backfires on a natural 1' : ''})`,
    })),
  );
}

export function WeaponDiceRow({ stats, size = 20 }: { stats: ShipStats; size?: number }) {
  const dice = [...diceFor(stats.missiles, 'missile'), ...diceFor(stats.cannons, 'cannon')];
  if (dice.length === 0) return <span className="weapon-dice weapon-dice--none">unarmed</span>;
  return (
    <span className="weapon-dice">
      {dice.map((die, i) => (
        <span key={i} title={die.title}>
          <WeaponDie damage={die.damage} kind={die.kind} size={size} />
        </span>
      ))}
    </span>
  );
}
