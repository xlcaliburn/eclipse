import { useState } from 'react';
import { shipUpgradeNote, upgradeRedundantOn } from '../game/ship';
import type { PlayerShipState } from '../game/types';
import { getUpgrade } from '../game/upgrades';
import type { UpgradeId } from '../game/upgrades';
import { ShipPickRow } from './ShipPickRow';

interface RepairScreenProps {
  fleet: PlayerShipState[];
  upgradeOptions: UpgradeId[]; // drawn on arrival, whether or not overhaul ends up chosen
  summary?: string; // set once the choice has been resolved (either branch)
  onChooseFull: () => void;
  onChooseOverhaul: (upgradeId: UpgradeId, shipIndex: number) => void;
  onContinue: () => void;
}

// Iteration 15.3: a repair yard is now a choice, not a free heal. Mirrors
// RewardScreen's upgrade-pick flow (select a tile, then a ship) for the
// overhaul branch, so the two "pick an upgrade" moments in the game feel
// like the same interaction.
export function RepairScreen({
  fleet,
  upgradeOptions,
  summary,
  onChooseFull,
  onChooseOverhaul,
  onContinue,
}: RepairScreenProps) {
  const [selectedUpgrade, setSelectedUpgrade] = useState<UpgradeId | null>(null);
  const overhaulLocked = fleet.length > 0 && fleet.every((s) => s.upgrades.length >= 1);

  if (summary !== undefined) {
    return (
      <div className="repair-screen">
        <h2>Repair yard</h2>
        <p className="hint">{summary}</p>
        <button type="button" className="continue-button" onClick={onContinue}>
          Back to map
        </button>
      </div>
    );
  }

  return (
    <div className="repair-screen">
      <h2>Repair yard</h2>
      <p className="hint">Full repair, or trade the heal for a permanent upgrade — your call.</p>

      <div className="repair-screen__choices">
        <div className="repair-screen__choice">
          <h3>Full repair</h3>
          <p className="hint">Heal every ship in the fleet back to full strength.</p>
          <button type="button" className="continue-button" onClick={onChooseFull}>
            Repair the fleet
          </button>
        </div>

        <div className="repair-screen__choice">
          <h3>Overhaul</h3>
          <p className="hint">No healing — pick one of 3 permanent upgrades and fit it to a ship.</p>
          {overhaulLocked && <p className="warning">Locked — every ship already carries an upgrade.</p>}
          {!overhaulLocked && (
            <>
              <div className="reward-screen__upgrade-options">
                {upgradeOptions.map((upgradeId, i) => {
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
                    onPick={(i) => onChooseOverhaul(selectedUpgrade, i)}
                    noteFor={shipUpgradeNote}
                    // 61.2: same redundancy guard as RewardScreen's picker —
                    // see its comment.
                    disabledFor={(ship) => upgradeRedundantOn(ship, selectedUpgrade)}
                    titleFor={(ship) =>
                      upgradeRedundantOn(ship, selectedUpgrade) ? 'Already dodges the first hit' : (shipUpgradeNote(ship) ?? undefined)
                    }
                  />
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
