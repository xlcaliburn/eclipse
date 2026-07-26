import type { Part } from '../game/types';
import { PartIcon } from './PartIcon';

interface PartCardProps {
  part: Part;
  onClick?: () => void;
  disabled?: boolean;
  showCost?: boolean;
}

const TYPE_LABEL: Record<Part['type'], string> = {
  weapon: 'Weapon',
  computer: 'Computer',
  shield: 'Shield',
  hull: 'Hull',
  drive: 'Drive',
  cargo: 'Cargo',
};

export function PartCard({ part, onClick, disabled, showCost }: PartCardProps) {
  return (
    <button
      type="button"
      className={`part-card part-card--${part.type}${part.active ? ' part-card--active' : ''}`}
      onClick={onClick}
      disabled={disabled || !onClick}
    >
      <span className="part-card__type">
        <PartIcon part={part} size={16} />
        {TYPE_LABEL[part.type]}
        {part.active && <span className="part-card__active-badge">ACTIVE</span>}
      </span>
      <span className="part-card__name">{part.name}</span>
      <span className="part-card__desc">{part.description}</span>
      {showCost && <span className="part-card__cost">{part.cost} cr</span>}
    </button>
  );
}
