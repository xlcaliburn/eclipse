import { useState } from 'react';
import { playerShipLabel } from '../game/ship';
import type { PlayerShipState } from '../game/types';
import { getUpgrade } from '../game/upgrades';
import { FrameSilhouette } from './ShipSilhouette';

interface InterludeScreenProps {
  fleet: PlayerShipState[];
  onChoose: (index: 0 | 1 | 2, shipIndex?: number) => void;
}

function shipUpgradeNote(ship: PlayerShipState): string | null {
  if (ship.upgrades.length === 0) return null;
  // Addendum A.4: at most 1 permanent upgrade per ship — a second pick
  // replaces (destroys) the first, so say so before the click confirms it.
  return `replaces ${getUpgrade(ship.upgrades[0]).name}`;
}

export function InterludeScreen({ fleet, onChoose }: InterludeScreenProps) {
  const [pickingShip, setPickingShip] = useState(false);

  return (
    <div className="interlude-screen">
      <h2>The long war continues</h2>
      <p className="hint">
        Act one is behind you. Before the next sector, take exactly one: a battered fleet takes Refit, a healthy one
        banks power.
      </p>

      {!pickingShip && (
        <div className="interlude-screen__options">
          <button type="button" className="card-tile" onClick={() => onChoose(0)}>
            <span className="card-tile__name">Refit</span>
            <span className="card-tile__desc">Fully repair every ship.</span>
          </button>
          <button type="button" className="card-tile" onClick={() => onChoose(1)}>
            <span className="card-tile__name">War chest</span>
            <span className="card-tile__desc">+15 credits.</span>
          </button>
          <button type="button" className="card-tile" onClick={() => setPickingShip(true)}>
            <span className="card-tile__name">Field promotion</span>
            <span className="card-tile__desc">1 random upgrade from the elite pool, attached to a ship of your choice.</span>
          </button>
        </div>
      )}

      {pickingShip && (
        <div className="interlude-screen__ship-picks">
          <p className="hint">Attach to which ship?</p>
          <div className="reward-screen__ship-picks">
            {fleet.map((ship, i) => {
              const note = shipUpgradeNote(ship);
              return (
                <button
                  key={i}
                  type="button"
                  className="shop-button"
                  onClick={() => onChoose(2, i)}
                  title={note ?? undefined}
                >
                  <FrameSilhouette frameId={ship.frameId} size={24} />
                  {playerShipLabel(fleet, i)}
                  {note && <span className="hint"> ({note})</span>}
                </button>
              );
            })}
          </div>
          <button type="button" className="shop-button" onClick={() => setPickingShip(false)}>
            Back
          </button>
        </div>
      )}
    </div>
  );
}
