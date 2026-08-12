import type { CommanderId } from '../game/commanders';
import { frameDisplayName } from '../game/frames';
import type { ProtocolId } from '../game/protocols';
import { canUpgradeMark, markUpgradeCost } from '../game/reducer';
import { playerShipLabel } from '../game/ship';
import type { PlayerShipState } from '../game/types';

interface ShipyardMarkSectionProps {
  fleet: PlayerShipState[];
  credits: number;
  shopKind?: 'store' | 'shipyard';
  protocols?: ProtocolId[];
  commanderId?: CommanderId;
  onUpgradeMark: (shipIndex: number) => void;
}

// Iteration 59.3/59.4 (hull marks): replaces ShipyardRefitSection — "trade a
// ship up" is now buying a bigger hull outright (shipyards stock rare-or-
// better, 59.1); this section is for DEEPENING a ship you're keeping. One
// row per eligible ship (non-mercenary, mark < III — canUpgradeMark is the
// same predicate the reducer's UPGRADE_MARK case calls, so this can never
// show a row the reducer would refuse). Renders nothing outside a shipyard
// or once every ship is either a mercenary or already mark III.
export function ShipyardMarkSection({
  fleet,
  credits,
  shopKind,
  protocols,
  commanderId,
  onUpgradeMark,
}: ShipyardMarkSectionProps) {
  const candidates = fleet
    .map((ship, shipIndex) => ({ ship, shipIndex }))
    .filter(({ ship }) => canUpgradeMark(shopKind, ship));

  if (candidates.length === 0) return null;

  // 2026-08-12: title/info-dot, not a standing paragraph — same onboarding-
  // vs-clutter rule the old refit section (and 60's declutter pass) apply
  // everywhere else on this screen.
  const explainer =
    'Permanently upgrade a ship\'s hull mark — I to II to III. Each step grants +1 universal slot (no extra power — bring a reactor if you fill it).';

  return (
    <>
      <h3>
        Mark upgrades
        <button type="button" className="info-dot" title={explainer} aria-label={explainer}>
          i
        </button>
      </h3>
      <div className="shop-screen__marks">
        {candidates.map(({ ship, shipIndex }) => {
          const currentMark = ship.mark ?? 1;
          const targetMark = (currentMark + 1) as 2 | 3;
          const cost = markUpgradeCost(ship.frameId, targetMark, commanderId, protocols);
          const disabled = credits < cost;
          return (
            <div key={shipIndex} className="mark-row">
              <span className="mark-row__ship">{playerShipLabel(fleet, shipIndex)}</span>
              <button
                type="button"
                className="mark-row__button"
                onClick={() => onUpgradeMark(shipIndex)}
                disabled={disabled}
                title={disabled ? `Not enough credits (${cost} cr needed).` : '+1 universal slot'}
              >
                <span className="mark-row__button-name">
                  {frameDisplayName(ship.frameId, ship.mark)} → {frameDisplayName(ship.frameId, targetMark)}
                </span>
                <span className="mark-row__button-detail">+1 universal slot</span>
                <span className="mark-row__button-cost">{cost} cr</span>
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
