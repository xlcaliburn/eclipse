import type { CommanderId } from '../game/commanders';
import { getCommander } from '../game/commanders';
import { CommanderCrest } from './CommanderCrest';

interface CommanderSelectScreenProps {
  choices: CommanderId[];
  onChoose: (commanderId: CommanderId) => void;
}

export function CommanderSelectScreen({ choices, onChoose }: CommanderSelectScreenProps) {
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
            </button>
          );
        })}
      </div>
    </div>
  );
}
