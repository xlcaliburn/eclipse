import { playerShipLabel } from '../game/ship';
import type { PlayerShipState } from '../game/types';
import { FrameSilhouette } from './ShipSilhouette';

// 47.3a: extracted from 6 copy-pasted "pick a ship" button lists —
// RewardScreen, RepairScreen, InterludeScreen, ShopScreen's upgrade bay
// and Foundry, EventScreen. Every rendering was identical (a row of
// shop-button chips, each a FrameSilhouette + playerShipLabel), differing
// only in the per-site disabled rule, title, and optional trailing note
// ("(replaces X)", "(12 cr)") — those differences are threaded through as
// props rather than unified, since unifying the disabled rules themselves
// (only 2 of the 6 original sites disabled mercenary ships) is a design
// decision, not a refactor.
interface ShipPickRowProps {
  fleet: PlayerShipState[];
  onPick: (shipIndex: number) => void;
  // A trailing "(note)" — e.g. "replaces Reinforced spine" or "12 cr".
  // Returning null/undefined renders no note (EventScreen's plain picker,
  // the upgrade-bay ship pick).
  noteFor?: (ship: PlayerShipState, index: number) => string | null | undefined;
  disabledFor?: (ship: PlayerShipState, index: number) => boolean;
  titleFor?: (ship: PlayerShipState, index: number) => string | undefined;
}

export function ShipPickRow({ fleet, onPick, noteFor, disabledFor, titleFor }: ShipPickRowProps) {
  return (
    <div className="ship-picks">
      {fleet.map((ship, i) => {
        const note = noteFor?.(ship, i);
        return (
          <button
            key={i}
            type="button"
            className="shop-button"
            onClick={() => onPick(i)}
            disabled={disabledFor?.(ship, i) ?? false}
            title={titleFor?.(ship, i)}
          >
            <FrameSilhouette frameId={ship.frameId} size={24} />
            {playerShipLabel(fleet, i)}
            {note && <span className="hint"> ({note})</span>}
          </button>
        );
      })}
    </div>
  );
}
