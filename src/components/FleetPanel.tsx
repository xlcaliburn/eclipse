import { CARGO_POD_PART_ID, getPart } from '../game/parts';
import { deriveStats, effectiveSlots, playerShipLabel } from '../game/ship';
import type { PartId, PlayerShipState } from '../game/types';
import { getUpgrade } from '../game/upgrades';
import { PartCard } from './PartCard';
import { StatBar } from './StatBar';
import { FrameSilhouette } from './ShipSilhouette';

interface FleetPanelProps {
  fleet: PlayerShipState[];
  inventory: PartId[];
  selectedShipIndex: number;
  onSelectShip: (index: number) => void;
  onEquip: (shipIndex: number, partId: PartId) => void;
  onUnequip: (shipIndex: number, partId: PartId) => void;
  onSellPart?: (partId: PartId) => void; // shop only — sells an unequipped inventory part for floor(cost/2)
  cargoCarrierIndex?: number; // ship carrying an active delivery quest's pod, if any
  onMoveCargoPod?: (toShipIndex: number) => void;
  onScuttle?: (shipIndex: number) => void; // shop only — decommissions a non-Flagship ship (iteration 8)
  onPartHover?: (partId: PartId | null) => void; // prep only — feeds the forecast delta preview (iteration 12.3)
}

export { playerShipLabel };

export function FleetPanel({
  fleet,
  inventory,
  selectedShipIndex,
  onSelectShip,
  onEquip,
  onUnequip,
  onSellPart,
  cargoCarrierIndex,
  onMoveCargoPod,
  onScuttle,
  onPartHover,
}: FleetPanelProps) {
  const selectedShip = fleet[selectedShipIndex];
  const selectedHasRoom = selectedShip
    ? selectedShip.equipped.length < effectiveSlots(selectedShip.frameId, selectedShip.upgrades)
    : false;

  return (
    <section className="blueprint-panel">
      <h2>Your fleet</h2>
      <p className="hint">
        Click a ship to select it, click inventory parts to equip them to it, and click an
        equipped part to remove it.
      </p>

      {fleet.map((ship, shipIndex) => {
        const stats = deriveStats(ship.frameId, ship.equipped, ship.upgrades);
        const selected = shipIndex === selectedShipIndex;
        const emptySlots = effectiveSlots(ship.frameId, ship.upgrades) - ship.equipped.length;
        return (
          <div
            key={shipIndex}
            className={`ship-card${selected ? ' ship-card--selected' : ''}`}
            onClick={() => onSelectShip(shipIndex)}
          >
            <div className="ship-card__header">
              <FrameSilhouette frameId={ship.frameId} size={36} />
              <span className="ship-card__name">{playerShipLabel(fleet, shipIndex)}</span>
              {onScuttle && ship.frameId !== 'cruiser' && (
                <button
                  type="button"
                  className="shop-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`Scuttle ${playerShipLabel(fleet, shipIndex)}? This cannot be undone.`)) {
                      onScuttle(shipIndex);
                    }
                  }}
                >
                  Scuttle
                </button>
              )}
            </div>
            {/* Iteration 13: same StatBar as the enemy panel and combat cards. */}
            <StatBar stats={stats} damage={ship.damage} />
            {ship.upgrades.length > 0 && (
              <div className="ship-card__upgrades">
                {ship.upgrades.map((upgradeId, i) => (
                  <span key={`${upgradeId}-${i}`} className="upgrade-badge" title={getUpgrade(upgradeId).description}>
                    {getUpgrade(upgradeId).name}
                  </span>
                ))}
              </div>
            )}
            <div className="slot-grid">
              {ship.equipped.map((partId, i) =>
                partId === CARGO_POD_PART_ID ? (
                  <PartCard key={`${partId}-${i}`} part={getPart(partId)} />
                ) : (
                  <PartCard
                    key={`${partId}-${i}`}
                    part={getPart(partId)}
                    onClick={() => onUnequip(shipIndex, partId)}
                  />
                ),
              )}
              {Array.from({ length: emptySlots }).map((_, i) => (
                <div key={`empty-${i}`} className="slot slot--empty" role="img" aria-label="Empty hardpoint" />
              ))}
            </div>
            {cargoCarrierIndex === shipIndex && onMoveCargoPod && fleet.length > 1 && (
              <div className="cargo-pod-mover" onClick={(e) => e.stopPropagation()}>
                <span className="hint">Move cargo pod to:</span>
                {fleet.map(
                  (_, i) =>
                    i !== shipIndex && (
                      <button key={i} type="button" className="shop-button" onClick={() => onMoveCargoPod(i)}>
                        {playerShipLabel(fleet, i)}
                      </button>
                    ),
                )}
              </div>
            )}
          </div>
        );
      })}

      <h3>Inventory</h3>
      {inventory.length === 0 ? (
        <p className="hint">No spare parts.</p>
      ) : (
        <div className="inventory-grid">
          {inventory.map((partId, i) => (
            <div
              key={`${partId}-${i}`}
              className="inventory-item"
              onMouseEnter={onPartHover ? () => onPartHover(partId) : undefined}
              onMouseLeave={onPartHover ? () => onPartHover(null) : undefined}
            >
              <PartCard
                part={getPart(partId)}
                onClick={selectedHasRoom ? () => onEquip(selectedShipIndex, partId) : undefined}
                disabled={!selectedHasRoom}
              />
              {onSellPart && (
                <button
                  type="button"
                  className="shop-button"
                  onClick={() => {
                    const price = Math.floor(getPart(partId).cost / 2);
                    if (window.confirm(`Sell ${getPart(partId).name} for ${price} credits?`)) onSellPart(partId);
                  }}
                >
                  Sell ({Math.floor(getPart(partId).cost / 2)} cr)
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {!selectedHasRoom && inventory.length > 0 && (
        <p className="hint">Selected ship is full — select another ship or remove a part.</p>
      )}
    </section>
  );
}
