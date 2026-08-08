import { getPart } from '../game/parts';
import type { PartId } from '../game/types';
import { WeaponDie } from './Die';

// 47.3e: extracted from ShopScreen's two identical weapon-fit chip lists
// (the mercenary's fixed fit, a frame offer's starting fit) — same
// "always show the weapon with its dice" rule (2026-08-08), just two
// different part-id sources.
export function FitChips({ partIds }: { partIds: PartId[] }) {
  return (
    <div className="frame-card__fit">
      {partIds.map((partId, i) => {
        const part = getPart(partId);
        return (
          <span key={`${partId}-${i}`} className="frame-card__fit-item" title={part.description}>
            {part.weapon && <WeaponDie damage={part.weapon.damage} kind={part.weapon.kind} size={16} />}
            {part.name}
          </span>
        );
      })}
    </div>
  );
}
