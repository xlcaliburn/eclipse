import type { CommanderId } from '../game/commanders';
import type { CounterProtocolId } from '../game/counterProtocols';
import { getPart } from '../game/parts';
import type { ProtocolId } from '../game/protocols';
import { upgradeCapFor } from '../game/reducer';
import {
  deriveStats,
  effectiveSlotLayout,
  equippedPower,
  equippedPowerGen,
  formatStatLine,
  playerShipLabel,
  powerBudget,
} from '../game/ship';
import type { PartId, PlayerShipState } from '../game/types';
import { AdaptivePanel } from './AdaptivePanel';
import { PartCard } from './PartCard';
import { PowerPipRow } from './PowerPipRow';
import { CounterProtocolRow, ProtocolRow } from './SettingsScreen';
import { ShipBlueprint } from './ShipBlueprint';
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
        const layout = effectiveSlotLayout(ship.frameId, ship.upgrades, protocols, commanderId, ship.mark);
        const power = equippedPower(ship.equipped);
        // 58.3: powerBudget (innate + any carried reactor's grant) —
        // getFrame(...).power alone would silently hide a reactor's
        // contribution here, same reasoning as FleetPanel's card.
        const budget = powerBudget(ship.frameId, ship.equipped);
        const reactorGen = equippedPowerGen(ship.equipped);
        return (
          <div key={shipIndex} className="ship-card">
            <div className="ship-card__header">
              <span className="ship-card__name">{playerShipLabel(fleet, shipIndex)}</span>
              <span className="ship-card__stats">{formatStatLine(stats, ship.damage)}</span>
            </div>
            {/* 2026-08-12: the same collapsed Items fold FleetPanel's prep
                screen uses — this surface used to render the blueprint,
                power meter, and augment badges always-open, which is
                exactly the "item slots and power in the middle of a fight"
                clutter the fold exists to hide. Read-only here, so no
                onUnequip: the overlay is for looking at the fleet, and
                refitting happens on the prep/shop screens. */}
            <details className="parts-fold">
              <summary className="parts-fold__summary">
                Items
                <span className="parts-fold__summary-detail">
                  {ship.equipped.length}/{layout.length} slots · {power}/{budget} power
                  {ship.upgrades.length > 0 &&
                    ` · ${ship.upgrades.length} augment${ship.upgrades.length === 1 ? '' : 's'}`}
                </span>
              </summary>
              <UpgradeBadgeRow
                upgrades={ship.upgrades}
                emptySlots={upgradeCapFor(ship, commanderId) - ship.upgrades.length}
              />
              <ShipBlueprint layout={layout} equipped={ship.equipped} />
              {/* 60.8: PowerPipRow's bolt icon is unambiguous on its own —
                  no separate "Power" word label needed (same reasoning as
                  FleetPanel's card). */}
              <div className="blueprint__power">
                <PowerPipRow used={power} budget={budget} />
                {reactorGen > 0 && (
                  <span className="blueprint__power-reactor">(+{reactorGen} from reactors)</span>
                )}
              </div>
            </details>
          </div>
        );
      })}

      {/* 2026-08-12: same collapsed fold as FleetPanel's prep screen —
          and, per the declutter pass, an empty inventory renders NOTHING
          rather than a "No spare parts." hint: an empty section needs no
          explanation. */}
      {inventory.length > 0 && (
        <details className="parts-fold parts-fold--inventory">
          <summary className="parts-fold__summary">
            Inventory · {inventory.length} spare part{inventory.length === 1 ? '' : 's'}
          </summary>
          <div className="inventory-grid">
            {inventory.map((partId, i) => (
              <PartCard key={`${partId}-${i}`} part={getPart(partId)} />
            ))}
          </div>
        </details>
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
