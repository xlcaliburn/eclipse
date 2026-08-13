import type { BuildTag, Part } from '../game/types';
import { WeaponDie } from './Die';
import { PartIcon, PowerBoltIcon } from './PartIcon';

interface PartCardProps {
  part: Part;
  onClick?: () => void;
  disabled?: boolean;
  showCost?: boolean;
  // 2026-08-12: power draw, independent of showCost — an inventory part
  // being EQUIPPED has no relevant credit price (already bought), but the
  // player choosing where to install it still needs to see what it costs
  // in power before clicking a slot that might not have room. showCost
  // implies this on too (the shop's buy-offer view wants both numbers).
  showPower?: boolean;
  // 2026-08-12 (iteration 52.2): a disabled reason ("no free weapon slot")
  // — the shop/fleet callers pass this through equipBlockReason so a
  // disabled part explains itself instead of just dead-clicking.
  title?: string;
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
  reactor: 'Reactor',
};

// Iteration 63.3 (build tags): a short word per chip, not an icon/color
// alone — legible at the card's small size and never ambiguous for a
// colorblind reader. The full name (for the title tooltip) lives in the
// wiki's Builds section, which reads these same ids off `BuildTag`.
const BUILD_TAG_LABEL: Record<BuildTag, string> = {
  alpha: 'Alpha',
  speed: 'Speed',
  tank: 'Tank',
  swarm: 'Swarm',
  pierce: 'Pierce',
  attrition: 'Attrition',
};

export function PartCard({ part, onClick, disabled, showCost, showPower, title }: PartCardProps) {
  return (
    <button
      type="button"
      className={`part-card part-card--${part.type} part-card--rarity-${part.rarity}${part.active ? ' part-card--active' : ''}`}
      onClick={onClick}
      disabled={disabled || !onClick}
      title={title}
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
      {/* Iteration 63.3: which of the six named builds this part belongs
          to (see the wiki's Builds section) — a purely informational chip
          row, absent entirely for the many parts that aren't specifically
          tagged. */}
      {part.buildTags && part.buildTags.length > 0 && (
        <span className="part-card__tags">
          {part.buildTags.map((tag) => (
            <span key={tag} className="part-card__tag">
              {BUILD_TAG_LABEL[tag]}
            </span>
          ))}
        </span>
      )}
      {(showCost || showPower) && (
        <span className="part-card__price-row">
          {showCost && <span className="part-card__cost">{part.cost} cr</span>}
          {/* Iteration 57.3: power draw next to the credit price, so a
              shop buyer sees both numbers before purchasing.
              2026-08-12: also shown (via showPower, cost omitted) on the
              equip screens — FleetPanel's inventory grid — where a spare
              part's power draw was previously invisible until you tried
              (and failed) to install it. Bolt icon over plain "N pwr"
              text (60.8's own reasoning for the ship-level meter applies
              identically here: an unlabeled glyph reads as "power"
              without a separate word).
              Iteration 58.2: a reactor GENERATES rather than draws — shown
              as "+N" instead of "N" so it doesn't read as a (false)
              0-power freebie. */}
          <span className="part-card__power">
            <PowerBoltIcon size={12} className="part-card__power-icon" />
            {part.type === 'reactor' ? `+${part.powerGen}` : part.power}
          </span>
        </span>
      )}
    </button>
  );
}
