import { playerShipLabel } from '../game/ship';
import type { PlayerShipState } from '../game/types';
import { getUpgrade } from '../game/upgrades';
import { FrameSilhouette } from './ShipSilhouette';

interface InterludeScreenProps {
  fleet: PlayerShipState[];
  onChoose: (shipIndex: number) => void;
}

function shipUpgradeNote(ship: PlayerShipState): string | null {
  if (ship.upgrades.length === 0) return null;
  // Addendum A.4: at most 1 permanent upgrade per ship — a second pick
  // replaces (destroys) the first, so say so before the click confirms it.
  return `replaces ${getUpgrade(ship.upgrades[0]).name}`;
}

// 2026-08-04: the boss's real reward — the fleet is already fully healed
// and the credits already banked by the time this screen shows (CONTINUE
// does both before entering the interlude phase). The only thing left
// pending is which ship banks the guaranteed upgrade; this used to be one
// of three competing choices (Refit / War chest / Field promotion), which
// meant a boss kill could net nothing more than a slightly bigger paycheck.
export function InterludeScreen({ fleet, onChoose }: InterludeScreenProps) {
  return (
    <div className="interlude-screen">
      <h2>The long war continues</h2>
      <p className="hint">
        Act one is behind you. The fleet is fully repaired — pick a ship to carry a field promotion into act two.
      </p>

      <div className="interlude-screen__ship-picks">
        <div className="reward-screen__ship-picks">
          {fleet.map((ship, i) => {
            const note = shipUpgradeNote(ship);
            return (
              <button
                key={i}
                type="button"
                className="shop-button"
                onClick={() => onChoose(i)}
                title={note ?? undefined}
              >
                <FrameSilhouette frameId={ship.frameId} size={24} />
                {playerShipLabel(fleet, i)}
                {note && <span className="hint"> ({note})</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
