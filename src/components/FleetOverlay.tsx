import type { CommanderId } from '../game/commanders';
import type { CounterProtocolId } from '../game/counterProtocols';
import { getPart } from '../game/parts';
import type { ProtocolId } from '../game/protocols';
import { upgradeCapFor } from '../game/reducer';
import { deriveStats, effectiveSlots, formatStatLine, playerShipLabel } from '../game/ship';
import type { PartId, PlayerShipState } from '../game/types';
import { AdaptivePanel } from './AdaptivePanel';
import { PartCard } from './PartCard';
import { CounterProtocolRow, ProtocolRow } from './SettingsScreen';
import { UpgradeBadgeRow } from './UpgradeBadgeRow';

interface FleetOverlayProps {
  fleet: PlayerShipState[];
  inventory: PartId[];
  commanderId?: CommanderId;
  protocols?: ProtocolId[];
  counterProtocol?: CounterProtocolId;
  // 47.3g: the mobile-tab (FleetScreen) / desktop-modal (FleetOverlay) split
  // is now one component picking its shell via AdaptivePanel — isCompact
  // decides which. Was two separate exported components.
  isCompact: boolean;
  onClose?: () => void;
}

// Shared body — the ship cards + inventory grid — factored out so the
// desktop modal (below) and the mobile Fleet tab (FleetScreen, iteration
// 16.1) render identical content from one place. Not a component (no hooks
// inside), just a JSX-returning function, called directly.
function fleetBody(
  fleet: PlayerShipState[],
  inventory: PartId[],
  commanderId?: CommanderId,
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
        const stats = deriveStats(ship.frameId, ship.equipped, ship.upgrades, protocols);
        const emptySlots = effectiveSlots(ship.frameId, ship.upgrades, protocols, commanderId) - ship.equipped.length;
        return (
          <div key={shipIndex} className="ship-card">
            <div className="ship-card__header">
              <span className="ship-card__name">{playerShipLabel(fleet, shipIndex)}</span>
              <span className="ship-card__stats">{formatStatLine(stats, ship.damage)}</span>
            </div>
            <UpgradeBadgeRow
              upgrades={ship.upgrades}
              emptySlots={upgradeCapFor(ship, commanderId) - ship.upgrades.length}
            />
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

// A read-only snapshot of the fleet + inventory, viewable as a popup from
// the map, a shop, or an event — so the player can check "what do I have"
// without leaving whatever they're doing. Desktop gets a modal (no tab
// bar to hold it); mobile (iteration 16.1) gets a full screen, with its
// own Back button (iteration 35 — dropping the Mission tab removed the tab
// bar's own way back to it).
export function FleetOverlay({
  fleet,
  inventory,
  commanderId,
  protocols,
  counterProtocol,
  isCompact,
  onClose,
}: FleetOverlayProps) {
  return (
    <AdaptivePanel title="Your fleet" isCompact={isCompact} screenClassName="fleet-screen" onClose={onClose}>
      {fleetBody(fleet, inventory, commanderId, protocols, counterProtocol)}
    </AdaptivePanel>
  );
}
