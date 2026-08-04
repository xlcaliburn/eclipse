import type { CommanderId } from '../game/commanders';
import { qualifiesForOutspeed } from '../game/combatEngine';
import { getFrame } from '../game/frames';
import { CARGO_POD_PART_ID, getPart } from '../game/parts';
import { deriveFleetStats, effectiveSlots, playerShipLabel } from '../game/ship';
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
  // Iteration 17: the CURRENT enemy's fastest raw initiative, so each ship
  // card can show a static "would outspeed them" badge before the fight
  // starts. Undefined in contexts with no committed enemy (the shop) — no
  // badges render there, since there's nothing to compare against.
  outspeedFastestEnemyInitiative?: number;
  // Prep only. The pre-fight screen is a scanning screen — you're comparing
  // two fleets, not shopping — so parts start folded away and the panel
  // stays short enough to read against the enemy beside it. The shop leaves
  // this off: browsing parts is the entire point there.
  collapsibleParts?: boolean;
  // Iteration 21 (the Admiral, ace pilots): folded into each ship's derived
  // stats below so a 3+-kill veteran's +1 initiative shows here the same
  // way it affects the actual fight — one source of truth (ship.ts's
  // withAceBonus, via deriveFleetStats), not a display-only badge that
  // could drift from what combat actually does.
  commanderId?: CommanderId;
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
  outspeedFastestEnemyInitiative,
  collapsibleParts,
  commanderId,
}: FleetPanelProps) {
  const selectedShip = fleet[selectedShipIndex];
  const selectedHasRoom = selectedShip
    ? selectedShip.equipped.length < effectiveSlots(selectedShip.frameId, selectedShip.upgrades)
    : false;

  const instructions =
    'Click a ship to select it, click inventory parts to equip them to it, and click an equipped part to remove it.';

  return (
    <section className="blueprint-panel">
      <h2 className="panel-title">
        Your fleet
        {/* The instructions are onboarding: essential once, clutter every
            fight after. Folded into the header so they're still one hover
            (or tap) away without costing a permanent line. */}
        <button type="button" className="info-dot" title={instructions} aria-label={instructions}>
          i
        </button>
      </h2>

      {fleet.map((ship, shipIndex) => {
        const stats = deriveFleetStats([ship], commanderId)[0];
        const selected = shipIndex === selectedShipIndex;
        const emptySlots = effectiveSlots(ship.frameId, ship.upgrades) - ship.equipped.length;
        const outspeeding =
          outspeedFastestEnemyInitiative !== undefined &&
          qualifiesForOutspeed(stats.initiative, outspeedFastestEnemyInitiative);
        return (
          <div
            key={shipIndex}
            className={`ship-card${selected ? ' ship-card--selected' : ''}${outspeeding ? ' ship-card--outspeeding' : ''}`}
            onClick={() => onSelectShip(shipIndex)}
          >
            <div className="ship-card__header">
              <FrameSilhouette frameId={ship.frameId} size={36} />
              <span className="ship-card__name">
                {outspeeding && (
                  <span
                    className="combat-ship__outspeed-mark"
                    aria-label="outspeeds the current enemy"
                    title={`Outspeeds this enemy — init ${stats.initiative} vs their fastest ${outspeedFastestEnemyInitiative}. Strikes twice each round.`}
                  >
                    ⚡×2{' '}
                  </span>
                )}
                {playerShipLabel(fleet, shipIndex)}
                {/* Iteration 18: named ships need the frame stated somewhere. */}
                <span className="ship-card__frame">{getFrame(ship.frameId).name}</span>
                {(ship.kills ?? 0) > 0 && (
                  <span
                    className="ship-card__kills"
                    title={`${ship.kills} kill${ship.kills === 1 ? '' : 's'} · survived ${ship.fightsSurvived ?? 0} fight${(ship.fightsSurvived ?? 0) === 1 ? '' : 's'}`}
                  >
                    ☠ {ship.kills}
                  </span>
                )}
              </span>
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
            {(() => {
              const grid = (
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
              );
              if (!collapsibleParts) return grid;
              return (
                // onClick stops propagation because the whole card is a
                // select-ship target.
                <details className="parts-fold" onClick={(e) => e.stopPropagation()}>
                  <summary className="parts-fold__summary">Items</summary>
                  {grid}
                </details>
              );
            })()}
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

      {/* Folded on the prep screen for the same reason as the ship parts —
          the count in the summary is enough to tell you whether it's worth
          opening before a fight. */}
      {collapsibleParts && inventory.length > 0 ? (
        <details className="parts-fold parts-fold--inventory">
          <summary className="parts-fold__summary">
            Inventory · {inventory.length} spare part{inventory.length === 1 ? '' : 's'}
          </summary>
          {inventoryGrid()}
          {!selectedHasRoom && <p className="hint">Selected ship is full — select another ship or remove a part.</p>}
        </details>
      ) : (
        <>
          <h3 className="panel-subtitle">Inventory</h3>
          {inventory.length === 0 ? <p className="hint">No spare parts.</p> : inventoryGrid()}
          {!selectedHasRoom && inventory.length > 0 && (
            <p className="hint">Selected ship is full — select another ship or remove a part.</p>
          )}
        </>
      )}
    </section>
  );

  function inventoryGrid() {
    return (
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
    );
  }
}
