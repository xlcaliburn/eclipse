import type { CounterProtocolId } from '../game/counterProtocols';
import { getPart } from '../game/parts';
import type { ProtocolId } from '../game/protocols';
import { deriveStats, effectiveSlots, fusionSummary, playerShipLabel } from '../game/ship';
import type { PartId, PlayerShipState } from '../game/types';
import { getUpgrade } from '../game/upgrades';
import { PartCard } from './PartCard';
import { CounterProtocolRow, ProtocolRow } from './SettingsScreen';

interface FleetOverlayProps {
  fleet: PlayerShipState[];
  inventory: PartId[];
  credits: number;
  protocols?: ProtocolId[];
  counterProtocol?: CounterProtocolId;
  onClose: () => void;
}

// Shared body — the ship cards + inventory grid — factored out so the
// desktop modal (below) and the mobile Fleet tab (FleetScreen, iteration
// 16.1) render identical content from one place. Not a component (no hooks
// inside), just a JSX-returning function, called directly.
function fleetBody(
  fleet: PlayerShipState[],
  inventory: PartId[],
  protocols?: ProtocolId[],
  counterProtocol?: CounterProtocolId,
) {
  return (
    <>
      {/* Iteration 29.4: surfaced here too, not just Settings — a player
          checking "what do I have" shouldn't have to go elsewhere to
          remember which protocol they picked, columns ago. Iteration 30:
          the enemy's answer to it rides alongside, same reasoning. */}
      {protocols?.map((id) => (
        <ProtocolRow key={id} protocolId={id} />
      ))}
      {counterProtocol && <CounterProtocolRow counterProtocolId={counterProtocol} />}

      {fleet.map((ship, shipIndex) => {
        const stats = deriveStats(ship.frameId, ship.equipped, ship.upgrades, protocols, ship.fusions);
        const emptySlots = effectiveSlots(ship.frameId, ship.upgrades, protocols) - ship.equipped.length;
        return (
          <div key={shipIndex} className="ship-card">
            <div className="ship-card__header">
              <span className="ship-card__name">{playerShipLabel(fleet, shipIndex)}</span>
              <span className="ship-card__stats">
                HP {Math.max(0, stats.hp - ship.damage)}/{stats.hp} · Init {stats.initiative} · Comp{' '}
                {stats.computer} · Piloting {stats.shield}
              </span>
            </div>
            {(ship.upgrades.length > 0 || fusionSummary(ship.fusions)) && (
              <div className="ship-card__upgrades">
                {ship.upgrades.map((upgradeId, i) => (
                  <span key={`${upgradeId}-${i}`} className="upgrade-badge" title={getUpgrade(upgradeId).description}>
                    {getUpgrade(upgradeId).name}
                  </span>
                ))}
                {fusionSummary(ship.fusions) && (
                  <span className="upgrade-badge" title="Iteration 31: permanent, slotless — fused at the Foundry">
                    Fused: {fusionSummary(ship.fusions)}
                  </span>
                )}
              </div>
            )}
            <div className="slot-grid">
              {ship.equipped.map((partId, i) => (
                <PartCard key={`${partId}-${i}`} part={getPart(partId)} />
              ))}
              {Array.from({ length: emptySlots }).map((_, i) => (
                <div key={`empty-${i}`} className="slot slot--empty" role="img" aria-label="Empty inventory slot" />
              ))}
            </div>
          </div>
        );
      })}

      <h3>Inventory</h3>
      {inventory.length === 0 ? (
        <p className="hint">No spare parts.</p>
      ) : (
        <div className="inventory-grid">
          {inventory.map((partId, i) => (
            <PartCard key={`${partId}-${i}`} part={getPart(partId)} />
          ))}
        </div>
      )}
    </>
  );
}

// A read-only snapshot of the fleet + inventory,
// viewable as a popup from the map, a shop, or an event — so the player can
// check "what do I have" without leaving whatever they're doing.
export function FleetOverlay({ fleet, inventory, protocols, counterProtocol, onClose }: FleetOverlayProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-panel__header">
          <h2>Your fleet</h2>
          {/* Credits live in the persistent HUD bar — no per-screen copy. */}
        </div>

        {fleetBody(fleet, inventory, protocols, counterProtocol)}

        <button type="button" className="continue-button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

// Iteration 16.1: the mobile Fleet tab — the same read-only snapshot,
// promoted to a full screen instead of a modal (desktop keeps the modal
// above). No Close button: once the tab bar exists, it's the way out, same
// reasoning as the Chart tab.
export function FleetScreen({ fleet, inventory, protocols, counterProtocol }: Omit<FleetOverlayProps, 'onClose' | 'credits'>) {
  return (
    <div className="fleet-screen">
      <h2>Your fleet</h2>
      {fleetBody(fleet, inventory, protocols, counterProtocol)}
    </div>
  );
}
