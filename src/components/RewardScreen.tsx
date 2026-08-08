import { useState } from 'react';
import { getPart } from '../game/parts';
import type { PlayerShipState, RewardSummary } from '../game/types';
import { getUpgrade } from '../game/upgrades';
import type { UpgradeId } from '../game/upgrades';
import { ShipPickRow } from './ShipPickRow';
import { shipUpgradeNote } from '../game/ship';

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
      {reward.intelText && <p className="hint reward-screen__intel">Intelligence: {reward.intelText}</p>}

      {reward.lostShips.length > 0 && (
        <div className="reward-screen__losses">
          <p className="warning">Lost: {reward.lostShips.join(', ')}</p>
          {reward.salvagedParts.length > 0 && <p className="hint">Salvaged: {reward.salvagedParts.join(', ')}</p>}
        </div>
      )}

      {reward.foundParts && reward.foundParts.length > 0 && (
        <p className="hint reward-screen__found">
          Found: {reward.foundParts.map((id) => getPart(id).name).join(', ')}
        </p>
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
              <ShipPickRow
                fleet={fleet}
                onPick={(i) => onPickUpgrade(selectedUpgrade, i)}
                noteFor={shipUpgradeNote}
                titleFor={(ship) => shipUpgradeNote(ship) ?? undefined}
              />
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
