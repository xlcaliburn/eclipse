import { getFrame } from '../game/frames';
import { getPart } from '../game/parts';
import type { CommanderId } from '../game/commanders';
import { getCommander } from '../game/commanders';
import type { PartId } from '../game/types';
import { deriveStats, formatStatLine } from '../game/ship';
import { CommanderCrest } from './CommanderCrest';
import { PartCard } from './PartCard';

interface CommanderSelectScreenProps {
  choices: CommanderId[];
  // 2026-08-07: the old two-step commander -> setup ("Your Flagship is
  // ready", with a "Customize" escape hatch nobody needed — the fit is
  // always the fixed STARTING_LOADOUT) flow is gone. CHOOSE_COMMANDER now
  // goes straight to the map, so this screen shows the Flagship's fixed
  // starting fit itself, right where the player commits to a commander.
  startingEquipped: PartId[];
  onChoose: (commanderId: CommanderId) => void;
}

export function CommanderSelectScreen({ choices, startingEquipped, onChoose }: CommanderSelectScreenProps) {
  const frame = getFrame('cruiser');
  const stats = deriveStats('cruiser', startingEquipped);
  return (
    <div className="commander-select-screen">
      <h2>Pick your commander</h2>
      <p className="hint">Each commander biases a different system. No drawbacks — just a different opening.</p>
      {/* Three cards side by side, each with its own crest — the first
          choice of a run should look like a choice, not a list. */}
      <div className="commander-select-screen__choices">
        {choices.map((id) => {
          const commander = getCommander(id);
          return (
            <button key={id} type="button" className="commander-card" onClick={() => onChoose(id)}>
              <span className="commander-card__art">
                <CommanderCrest commanderId={id} size={72} />
              </span>
              <span className="commander-card__name">{commander.name}</span>
              <span className="commander-card__desc">{commander.description}</span>
              <ul className="commander-card__bullets">
                {commander.bullets.map((bullet, i) => (
                  <li key={i}>{bullet}</li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      <h3 className="commander-select-screen__starting-ship-heading">Your starting ship: {frame.name}</h3>
      <div className="slot-grid">
        {startingEquipped.map((partId, i) => (
          <PartCard key={`${partId}-${i}`} part={getPart(partId)} />
        ))}
      </div>
      <div className="commander-select-screen__starting-ship-stats">{formatStatLine(stats)}</div>
    </div>
  );
}
