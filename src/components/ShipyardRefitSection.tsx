import type { CommanderId } from '../game/commanders';
import { FRAMES } from '../game/frames';
import type { FrameId } from '../game/frames';
import type { ProtocolId } from '../game/protocols';
import { canRefit, refitCost } from '../game/reducer';
import { equippedPower, playerShipLabel } from '../game/ship';
import type { PlayerShipState } from '../game/types';
import { PowerPipRow } from './PowerPipRow';
import { SlotRow } from './SlotRow';

interface ShipyardRefitSectionProps {
  fleet: PlayerShipState[];
  credits: number;
  shopFrameOffers?: Exclude<FrameId, 'cruiser'>[];
  act: 1 | 2;
  protocols?: ProtocolId[];
  commanderId?: CommanderId;
  onRefit: (shipIndex: number, frameId: Exclude<FrameId, 'cruiser'>) => void;
}

// Iteration 52.5 (the hull refit): "trade a ship up, keeping what made it
// that ship" — a shipyard-only section (canRefit itself enforces this,
// same predicate the reducer's REFIT_SHIP case calls, so this can never
// show a target the reducer would refuse). Only rendered when at least one
// ship has at least one legal target this visit, so an empty shipyard
// stock or an all-maxed fleet doesn't add a permanently-empty section.
export function ShipyardRefitSection({
  fleet,
  credits,
  shopFrameOffers,
  act,
  protocols,
  commanderId,
  onRefit,
}: ShipyardRefitSectionProps) {
  const refitCandidates = fleet
    .map((ship, shipIndex) => {
      const targets = (shopFrameOffers ?? []).filter((frameId) =>
        canRefit({ shopKind: 'shipyard', shopFrameOffers, act, protocols, commanderId }, ship, frameId),
      );
      return { ship, shipIndex, targets };
    })
    .filter(({ targets }) => targets.length > 0);

  if (refitCandidates.length === 0) return null;

  return (
    <>
      <h3>Refit</h3>
      <p className="hint">
        Trade a ship up into a bigger hull — keeps its equipped parts, augments, name, kills, and fights survived.
        Price is the new hull's cost less a trade-in on the old one.
      </p>
      <div className="shop-screen__refits">
        {refitCandidates.map(({ ship, shipIndex, targets }) => (
          <div key={shipIndex} className="refit-row">
            <span className="refit-row__ship">{playerShipLabel(fleet, shipIndex)}</span>
            <div className="refit-row__targets">
              {targets.map((frameId) => {
                const frame = FRAMES[frameId];
                const cost = refitCost(ship, frameId);
                const disabled = credits < cost;
                return (
                  <button
                    key={frameId}
                    type="button"
                    className={`frame-card frame-card--rarity-${frame.rarity}`}
                    onClick={() => onRefit(shipIndex, frameId)}
                    disabled={disabled}
                    title={disabled ? `Not enough credits (${cost} cr needed).` : undefined}
                  >
                    <span className="frame-card__name">{frame.name}</span>
                    {/* The equipped set already legal against this target
                        (canRefit checked it) — shown against the TARGET's
                        layout so the player sees the shape they're trading
                        into, same as a fresh-purchase frame card. */}
                    <SlotRow layout={frame.slotLayout} equipped={ship.equipped} />
                    {/* Iteration 57.3: canRefit already guaranteed this
                        loadout fits the target's power budget (ship.ts's
                        layoutCanHold) — shown so the player can see HOW
                        much headroom the trade leaves, not just that it's
                        legal. */}
                    <PowerPipRow used={equippedPower(ship.equipped)} budget={frame.power} />
                    <span className="frame-card__cost">{cost} cr</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
