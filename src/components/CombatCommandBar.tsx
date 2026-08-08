import { canUseActive } from '../game/combatEngine';
import type { CombatState } from '../game/combatEngine';
import { getPart } from '../game/parts';
import type { PartId } from '../game/types';
import { ActiveSparkIcon } from './PartIcon';

// 47.4.1: extracted from CombatScreen. Pinned to the bottom of the
// viewport on mobile (see .combat-command-bar's ≤720px rule) so the
// hand/actives stay reachable without scrolling past the log.
interface ActiveAbility {
  shipIndex: number;
  abilityIndex: number;
  partId: PartId;
}

interface CombatCommandBarProps {
  combat: CombatState;
  activeAbilities: ActiveAbility[];
  playerLabels: string[];
  handCollapsed: boolean;
  onToggleCollapsed: () => void;
  onUseActive: (shipIndex: number, abilityIndex: number) => void;
}

export function CombatCommandBar({
  combat,
  activeAbilities,
  playerLabels,
  handCollapsed,
  onToggleCollapsed,
  onUseActive,
}: CombatCommandBarProps) {
  return (
    <div className={`combat-command-bar${handCollapsed ? ' combat-command-bar--collapsed' : ''}`}>
      <button
        type="button"
        className="combat-command-bar__toggle"
        aria-expanded={!handCollapsed}
        aria-controls="combat-command-bar-body"
        onClick={onToggleCollapsed}
      >
        {handCollapsed ? `Show actives (${activeAbilities.length})` : 'Hide actives'}
      </button>
      <div className="combat-command-bar__body" id="combat-command-bar-body">
        <div className="combat-hand">
          <h3>Ship actives</h3>
          {activeAbilities.length === 0 ? (
            <p className="hint">No active parts equipped.</p>
          ) : (
            <div className="combat-hand__cards">
              {activeAbilities.map(({ shipIndex, abilityIndex, partId }) => {
                const part = getPart(partId);
                const usable = canUseActive(combat, shipIndex, abilityIndex);
                return (
                  <button
                    key={`${shipIndex}-${abilityIndex}`}
                    type="button"
                    className="card-tile"
                    disabled={!usable}
                    onClick={() => onUseActive(shipIndex, abilityIndex)}
                    title={part.description}
                  >
                    <span className="card-tile__kind">{usable ? '1 per combat' : 'Spent'}</span>
                    <span className="card-tile__name">
                      <ActiveSparkIcon size={14} className={usable ? 'part-icon--charged' : 'part-icon--spent'} />
                      {part.name}
                    </span>
                    <span className="card-tile__desc">{part.description}</span>
                    <span className="card-tile__ship">{playerLabels[shipIndex] ?? 'your ship'}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
