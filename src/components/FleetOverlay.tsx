import type { CommanderId } from '../game/commanders';
import { playerOutspeedGap, qualifiesForOutspeed } from '../game/combatEngine';
import type { CounterProtocolId } from '../game/counterProtocols';
import { getPart } from '../game/parts';
import type { ProtocolId } from '../game/protocols';
import { upgradeCapFor } from '../game/reducer';
import {
  deriveStats,
  effectiveSlotLayout,
  equipBlockReason,
  equippedPower,
  formatStatLine,
  playerShipLabel,
  powerBudget,
  unequipBlockReason,
} from '../game/ship';
import type { PartId, PlayerShipState } from '../game/types';
import { AdaptivePanel } from './AdaptivePanel';
import { PartCard } from './PartCard';
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
  // 2026-08-12: this overlay is now THE one place equipping happens — the
  // Prep screen used to have its own separate always-open FleetPanel for
  // it, and this modal was read-only; that split was the inconsistency
  // the user asked to remove ("we will always open the modal to do
  // equipping... let's remove that option from the pre-fight screen").
  // Both optional and undefined by default so a caller can still show a
  // genuinely read-only snapshot (App.tsx does this during live combat —
  // changing the loadout mid-fight wouldn't affect the fight already in
  // progress, so the option is withheld there rather than offered as a
  // trap).
  onEquip?: (shipIndex: number, partId: PartId) => void;
  onUnequip?: (shipIndex: number, partId: PartId) => void;
  // 2026-08-12: ported from FleetPanel's Prep-screen card — the ⚡×2 "would
  // outspeed this enemy" mark. Prep's own fleet panel is gone (equipping
  // consolidated into this modal), so without this the pre-fight "would
  // swapping a drive part push me over the outspeed threshold" question
  // had nowhere to be answered. Undefined outside a phase with a specific
  // upcoming enemy (App.tsx passes it whenever state.currentEnemy exists).
  outspeedFastestEnemyInitiative?: number;
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
  onEquip?: (shipIndex: number, partId: PartId) => void,
  onUnequip?: (shipIndex: number, partId: PartId) => void,
  outspeedFastestEnemyInitiative?: number,
) {
  const outspeedGap = playerOutspeedGap(protocols);
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
        const outspeeding =
          outspeedFastestEnemyInitiative !== undefined &&
          qualifiesForOutspeed(stats.initiative, outspeedFastestEnemyInitiative, outspeedGap);
        return (
          <div key={shipIndex} className="ship-card">
            <div className="ship-card__header">
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
              </span>
              <span className="ship-card__stats">{formatStatLine(stats, ship.damage)}</span>
              {/* 2026-08-13: same over-repair-bank visibility as FleetPanel's
                  ship-card (see its comment) — this modal is the one the
                  Prep screen actually opens (onViewFleet), so it's the
                  surface that matters most for catching this before ENGAGE. */}
              {(ship.overRepairBank ?? 0) > 0 && (
                <span
                  className="ship-card__bank"
                  title={`Over-repair banked ${ship.overRepairBank} temporary HP — absorbs damage first in the next fight only.`}
                >
                  +{ship.overRepairBank} banked
                </span>
              )}
            </div>
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
              <ShipBlueprint
                layout={layout}
                equipped={ship.equipped}
                onUnequip={onUnequip ? (partId) => onUnequip(shipIndex, partId) : undefined}
                unequipBlockReason={
                  onUnequip ? (partId) => unequipBlockReason(ship.frameId, ship.equipped, partId) : undefined
                }
              />
              {/* 2026-08-12: install-from-inventory, scoped to THIS ship —
                  the modal is now the one place equipping happens (see
                  FleetOverlayProps' own comment), and each ship's own fold
                  is the natural place to decide what goes on it, rather
                  than one global inventory list bound to a separately-
                  tracked "selected ship" (FleetPanel's older pattern).
                  showPower so a part's power draw is visible right where
                  the decision to install it gets made — the exact "what
                  do I need to remove or change" question this exists to
                  answer. */}
              {onEquip && inventory.length > 0 && (
                <>
                  <p className="parts-fold__install-label hint">Install:</p>
                  <div className="inventory-grid">
                    {inventory.map((partId, i) => {
                      const blockReason = equipBlockReason(
                        ship.frameId,
                        ship.equipped,
                        partId,
                        ship.upgrades,
                        protocols,
                        commanderId,
                        ship.mark,
                      );
                      return (
                        <PartCard
                          key={`${partId}-${i}`}
                          part={getPart(partId)}
                          onClick={blockReason ? undefined : () => onEquip(shipIndex, partId)}
                          disabled={!!blockReason}
                          showPower
                          title={blockReason ?? undefined}
                        />
                      );
                    })}
                  </div>
                </>
              )}
            </details>
          </div>
        );
      })}

      {/* Read-only browse list — only when nothing above already covers
          "what do I have" (onEquip unset: the read-only combat-time
          snapshot). Equip-capable callers get the per-ship Install
          sections above instead; showing the same inventory a second
          time, unscoped, would just be the power-fraction duplication
          bug fixed elsewhere this session, again. */}
      {!onEquip && inventory.length > 0 && (
        <details className="parts-fold parts-fold--inventory">
          <summary className="parts-fold__summary">
            Inventory · {inventory.length} spare part{inventory.length === 1 ? '' : 's'}
          </summary>
          <div className="inventory-grid">
            {inventory.map((partId, i) => (
              <PartCard key={`${partId}-${i}`} part={getPart(partId)} showPower />
            ))}
          </div>
        </details>
      )}
    </>
  );
}

// The one equip surface in the game (2026-08-12) — viewable as a popup
// from the map, a shop, an event, or the Prep screen, so the player can
// manage their loadout without a separate always-open panel duplicating
// this same UI. Desktop gets a modal (no tab bar to hold it); mobile
// (iteration 16.1) gets a full screen, with its own Back button (iteration
// 35 — dropping the Mission tab removed the tab bar's own way back to it).
// Falls back to read-only when onEquip/onUnequip aren't provided — App.tsx
// uses this during live combat, where a loadout change couldn't affect the
// fight already in progress.
export function FleetOverlay({
  fleet,
  inventory,
  commanderId,
  protocols,
  counterProtocol,
  isCompact,
  onClose,
  onEquip,
  onUnequip,
  outspeedFastestEnemyInitiative,
}: FleetOverlayProps) {
  return (
    <AdaptivePanel title="Your fleet" isCompact={isCompact} screenClassName="fleet-screen" onClose={onClose}>
      {fleetBody(
        fleet,
        inventory,
        commanderId,
        protocols,
        counterProtocol,
        onEquip,
        onUnequip,
        outspeedFastestEnemyInitiative,
      )}
    </AdaptivePanel>
  );
}
