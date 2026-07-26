import { useState } from 'react';
import { getCard } from '../game/cards';
import { playerShipLabel } from '../game/ship';
import type { PlayerShipState, RewardSummary } from '../game/types';
import { getUpgrade } from '../game/upgrades';
import type { UpgradeId } from '../game/upgrades';
import { FrameSilhouette } from './ShipSilhouette';

function shipUpgradeNote(ship: PlayerShipState): string | null {
  if (ship.upgrades.length === 0) return null;
  // Addendum A.4: at most 1 permanent upgrade per ship — a second pick
  // replaces (destroys) the first, so say so before the click confirms it.
  return `replaces ${getUpgrade(ship.upgrades[0]).name}`;
}

interface RewardScreenProps {
  reward: RewardSummary;
  fleet: PlayerShipState[];
  onPickUpgrade: (upgradeId: UpgradeId, shipIndex: number) => void;
  onLeave: () => void;
}

export function RewardScreen({ reward, fleet, onPickUpgrade, onLeave }: RewardScreenProps) {
  const [selectedUpgrade, setSelectedUpgrade] = useState<UpgradeId | null>(null);
  const needsUpgradePick = Boolean(reward.upgradeOptions);

  return (
    <div className="reward-screen">
      <h2>Victory rewards</h2>
      <p className="reward-screen__credits">
        +{reward.credits} credits <span className="hint">(total {reward.creditsTotal})</span>
      </p>
      {reward.intelGained > 0 && (
        <p className="hint">Flight recorders salvaged: +{reward.intelGained} intel</p>
      )}

      {reward.cardGained && <p className="hint">Reaction card gained: {getCard(reward.cardGained).name}</p>}
      {reward.cardInsteadCredits !== undefined && (
        <p className="hint">Hand was full — +{reward.cardInsteadCredits} credits instead of a card.</p>
      )}

      {reward.lostShips.length > 0 && (
        <div className="reward-screen__losses">
          <p className="warning">Lost: {reward.lostShips.join(', ')}</p>
          {reward.salvagedParts.length > 0 && <p className="hint">Salvaged: {reward.salvagedParts.join(', ')}</p>}
        </div>
      )}

      {needsUpgradePick && reward.upgradeOptions && (
        <div className="reward-screen__upgrades">
          <h3>Choose an upgrade</h3>
          <p className="hint">Slotless and permanent — pick one, then choose which ship carries it.</p>
          <div className="reward-screen__upgrade-options">
            {reward.upgradeOptions.map((upgradeId, i) => {
              const upgrade = getUpgrade(upgradeId);
              const selected = selectedUpgrade === upgradeId;
              return (
                <button
                  key={`${upgradeId}-${i}`}
                  type="button"
                  className={`card-tile${selected ? ' card-tile--selected' : ''}`}
                  onClick={() => setSelectedUpgrade(upgradeId)}
                >
                  <span className="card-tile__name">{upgrade.name}</span>
                  <span className="card-tile__desc">{upgrade.description}</span>
                </button>
              );
            })}
          </div>

          {selectedUpgrade && (
            <>
              <p className="hint">Attach to which ship?</p>
              <div className="reward-screen__ship-picks">
                {fleet.map((ship, i) => {
                  const note = shipUpgradeNote(ship);
                  return (
                    <button
                      key={i}
                      type="button"
                      className="shop-button"
                      onClick={() => onPickUpgrade(selectedUpgrade, i)}
                      title={note ?? undefined}
                    >
                      <FrameSilhouette frameId={ship.frameId} size={24} />
                      {playerShipLabel(fleet, i)}
                      {note && <span className="hint"> ({note})</span>}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {!needsUpgradePick && (
        <button type="button" className="continue-button" onClick={onLeave}>
          Back to map
        </button>
      )}
    </div>
  );
}
