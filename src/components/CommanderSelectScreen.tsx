import type { CommanderId } from '../game/commanders';
import { getCommander } from '../game/commanders';

interface CommanderSelectScreenProps {
  choices: CommanderId[];
  onChoose: (commanderId: CommanderId) => void;
}

export function CommanderSelectScreen({ choices, onChoose }: CommanderSelectScreenProps) {
  return (
    <div className="commander-select-screen">
      <h2>Pick your commander</h2>
      <p className="hint">Each commander biases a different system. No drawbacks — just a different opening.</p>
      <div className="commander-select-screen__choices">
        {choices.map((id) => {
          const commander = getCommander(id);
          return (
            <button key={id} type="button" className="card-tile" onClick={() => onChoose(id)}>
              <span className="card-tile__name">{commander.name}</span>
              <span className="card-tile__desc">{commander.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
