import { canUseActive } from '../game/combatEngine';
import type { CombatState, FleetOrderId } from '../game/combatEngine';
import type { FrameId } from '../game/frames';
import { getPart } from '../game/parts';
import type { PartId } from '../game/types';
import { ActiveSparkIcon } from './PartIcon';
import { FrameSilhouette } from './ShipSilhouette';

// 47.4.1: extracted from CombatScreen. Pinned to the bottom of the
// viewport on mobile (see .combat-command-bar's ≤720px rule) so the
// hand/actives stay reachable without scrolling past the log.
interface ActiveAbility {
  shipIndex: number;
  abilityIndex: number;
  partId: PartId;
}

// Iteration 48 (fleet orders): the fixed order menu — pure UI copy, no
// engine logic. `needsTarget` drives whether a tile click starts a pick
// (see CombatScreen's handleOrderTileClick) or issues immediately.
const ORDER_INFO: Record<FleetOrderId, { name: string; description: string; needsTarget: boolean }> = {
  'attack-run': {
    name: 'Attack run',
    description: 'The fleet commits to the attack: +1 computer, −1 piloting this round.',
    needsTarget: false,
  },
  'evasive-pattern': {
    name: 'Evasive pattern',
    description: 'The fleet flies defensively: +1 piloting, −1 computer this round.',
    needsTarget: false,
  },
  brace: {
    name: 'Brace',
    description:
      'Pick a ship: it holds all fire this round — including missiles, if braced for the opening volley — and gains +2 piloting.',
    needsTarget: true,
  },
  'exploit-weakness': {
    name: 'Exploit weakness',
    description: "Pick an enemy ship: your fleet's dice gain +2 computer against it this round.",
    needsTarget: true,
  },
};

// A fixed display order — Spymaster's exclusive 4th slot only ever appears
// when combat.exploitEnabled is true (never shown-but-locked; see
// plans/iteration-48.md's decision point D).
const ORDER_DISPLAY_ORDER: FleetOrderId[] = ['attack-run', 'evasive-pattern', 'brace', 'exploit-weakness'];

// Whether `order` could be issued right now, IGNORING the target
// requirement (a targeted order becomes real only once a pick completes —
// see combatEngine.ts's canIssueOrder, which this deliberately does NOT
// call, since calling it without a targetIndex would report every targeted
// order as always unavailable).
function orderAvailable(combat: CombatState, order: FleetOrderId): boolean {
  if (combat.winner) return false;
  if (combat.commandPoints <= 0) return false;
  if (combat.orderThisRound !== null) return false;
  if (order === 'exploit-weakness' && !combat.exploitEnabled) return false;
  return true;
}

interface CombatCommandBarProps {
  combat: CombatState;
  activeAbilities: ActiveAbility[];
  playerLabels: string[];
  playerFrameIds: FrameId[];
  handCollapsed: boolean;
  onToggleCollapsed: () => void;
  onUseActive: (shipIndex: number, abilityIndex: number) => void;
  // Iteration 48: which targeted order is mid-pick (awaiting a theater
  // click), if any — owned by CombatScreen, not this component, since the
  // theater click that completes a pick lives outside this bar.
  pickingOrder: FleetOrderId | null;
  onOrderTileClick: (order: FleetOrderId) => void;
}

export function CombatCommandBar({
  combat,
  activeAbilities,
  playerLabels,
  playerFrameIds,
  handCollapsed,
  onToggleCollapsed,
  onUseActive,
  pickingOrder,
  onOrderTileClick,
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
        <div className="combat-hand combat-orders">
          <h3>
            Fleet orders{' '}
            <span className="command-points" title="Command points remaining this fight">
              {Array.from({ length: combat.commandPoints }, (_, i) => (
                <span key={i} className="command-points__pip" />
              ))}
              <span className="command-points__count">{combat.commandPoints}</span>
            </span>
          </h3>
          <div className="combat-hand__cards">
            {ORDER_DISPLAY_ORDER.filter((order) => order !== 'exploit-weakness' || combat.exploitEnabled).map(
              (order) => {
                const info = ORDER_INFO[order];
                const armed = combat.orderThisRound === order;
                const picking = pickingOrder === order;
                const available = orderAvailable(combat, order);
                return (
                  <button
                    key={order}
                    type="button"
                    className={`card-tile${picking ? ' card-tile--picking' : ''}${armed ? ' card-tile--armed' : ''}`}
                    disabled={!available && !picking}
                    onClick={() => onOrderTileClick(order)}
                    title={info.description}
                  >
                    <span className="card-tile__kind">
                      {armed ? 'Armed' : picking ? 'Pick a target…' : info.needsTarget ? 'Pick a target' : '1 command point'}
                    </span>
                    <span className="card-tile__name">{info.name}</span>
                    <span className="card-tile__desc">{info.description}</span>
                  </button>
                );
              },
            )}
          </div>
        </div>
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
                    <span className="card-tile__ship">
                      {playerFrameIds[shipIndex] && (
                        <FrameSilhouette frameId={playerFrameIds[shipIndex]} size={20} />
                      )}
                      {playerLabels[shipIndex] ?? 'your ship'}
                    </span>
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
