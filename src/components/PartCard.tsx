import type { Part } from '../game/types';
import { WeaponDie } from './Die';
import { PartIcon } from './PartIcon';

interface PartCardProps {
  part: Part;
  onClick?: () => void;
  disabled?: boolean;
  showCost?: boolean;
}

// Iteration 29: the Shield stat is displayed as "Piloting" everywhere a
// player reads it. The underlying `PartType`/`ShipStats.shield`
// identifiers are deliberately untouched (internal data category, not
// player-facing) — this category label is the display text that changed.
// 2026-08-07: every shield-*themed* part's own flavor NAME was also
// renamed off "shield" (Gauss coils, Piloting modulator, ...) in a
// separate pass — see parts.ts.
const TYPE_LABEL: Record<Part['type'], string> = {
  weapon: 'Weapon',
  computer: 'Computer',
  shield: 'Piloting',
  hull: 'Hull',
  drive: 'Drive',
  cargo: 'Cargo',
};

export function PartCard({ part, onClick, disabled, showCost }: PartCardProps) {
  return (
    <button
      type="button"
      className={`part-card part-card--${part.type} part-card--rarity-${part.rarity}${part.active ? ' part-card--active' : ''}`}
      onClick={onClick}
      disabled={disabled || !onClick}
    >
      <span className="part-card__type">
        <PartIcon part={part} size={16} />
        {TYPE_LABEL[part.type]}
        {part.active && <span className="part-card__active-badge">ACTIVE</span>}
      </span>
      <span className="part-card__name">{part.name}</span>
      {/* Iteration 41: shop offers used to be pure text — the die shows a
          weapon's damage/count at a glance, same visual language as a
          ship's own armament row (WeaponDiceRow) elsewhere in the UI. */}
      {part.weapon && (
        <span className="part-card__dice">
          {Array.from({ length: part.weapon.diceCount }, (_, i) => (
            <WeaponDie key={i} damage={part.weapon!.damage} kind={part.weapon!.kind} size={18} />
          ))}
        </span>
      )}
      <span className="part-card__desc">{part.description}</span>
      {showCost && <span className="part-card__cost">{part.cost} cr</span>}
    </button>
  );
}
