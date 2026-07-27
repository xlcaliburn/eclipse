import type { CombatShip } from '../game/combatEngine';
import type { FrameId } from '../game/frames';
import type { Side } from '../game/types';
import { getUpgrade } from '../game/upgrades';
import type { UpgradeId } from '../game/upgrades';
import { EnemySilhouette, FrameSilhouette, BrokenHullGlyph } from './ShipSilhouette';
import type { EnemyArchetype } from './ShipSilhouette';
import { StatBar } from './StatBar';

interface ActiveAttacker {
  side: Side;
  index: number;
}

interface ActiveTarget extends ActiveAttacker {
  hit: boolean;
}

interface CombatFleetViewProps {
  playerShips: CombatShip[];
  enemyShips: CombatShip[];
  playerLabels: string[];
  playerFrameIds: FrameId[]; // indexed to match playerShips
  playerUpgrades?: UpgradeId[][]; // indexed to match playerShips
  enemyName: string;
  enemyLabels: string[]; // indexed to match enemyShips — group-aware for mixed formations (iteration 9)
  enemyArchetypes: EnemyArchetype[]; // indexed to match enemyShips
  // Iteration 10.5: the event currently revealing in the theater's replay,
  // so the involved ships can flash — the log is the source of truth, this
  // is just a view of "which entry is showing right now."
  activeAttacker?: ActiveAttacker | null;
  activeTarget?: ActiveTarget | null;
  // Iteration 12.2: the fx layer needs real card positions to draw tracers
  // between ships. Each card reports its element; null on unmount.
  onShipEl?: (side: Side, index: number, el: HTMLElement | null) => void;
  // Iteration 13: click an enemy card to make it the fleet's priority
  // target (click again to clear). Set only during a live fight.
  onSelectEnemy?: (index: number) => void;
  priorityTargetIndex?: number | null;
}

function shipCard(
  ship: CombatShip,
  side: Side,
  index: number,
  label: string,
  silhouette: React.ReactNode,
  activeAttacker: ActiveAttacker | null | undefined,
  activeTarget: ActiveTarget | null | undefined,
  upgrades?: UpgradeId[],
  onShipEl?: (side: Side, index: number, el: HTMLElement | null) => void,
  onSelectEnemy?: (index: number) => void,
  isPriority = false,
) {
  const hp = Math.max(0, ship.stats.hp - ship.damage);
  const destroyed = hp <= 0;
  const damaged = !destroyed && hp < ship.stats.hp * 0.5;

  const isAttacker = activeAttacker?.side === side && activeAttacker.index === index;
  const isTarget = activeTarget?.side === side && activeTarget.index === index;
  const highlight = isAttacker ? ' combat-ship--firing' : isTarget ? (activeTarget!.hit ? ' combat-ship--hit' : ' combat-ship--miss') : '';
  const clickable = side === 'enemy' && !destroyed && !!onSelectEnemy;

  return (
    <div
      key={label}
      ref={onShipEl ? (el) => onShipEl(side, index, el) : undefined}
      className={`combat-ship${destroyed ? ' combat-ship--destroyed' : ''}${highlight}${clickable ? ' combat-ship--clickable' : ''}${isPriority ? ' combat-ship--priority' : ''}`}
      onClick={clickable ? () => onSelectEnemy!(index) : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') onSelectEnemy!(index); } : undefined}
      title={clickable ? (isPriority ? 'Priority target — click to clear' : 'Click to focus all fire here') : undefined}
    >
      <div className="combat-ship__name">
        {isPriority && <span className="combat-ship__priority-mark" aria-label="priority target">◎ </span>}
        {label}
      </div>
      {destroyed ? (
        <>
          <BrokenHullGlyph size={48} />
          <div className="combat-ship__destroyed">Destroyed</div>
        </>
      ) : (
        <>
          <div className={damaged ? 'silhouette--damaged' : undefined}>{silhouette}</div>
          <StatBar stats={ship.stats} damage={ship.damage} />
          {upgrades && upgrades.length > 0 && (
            <div className="ship-card__upgrades">
              {upgrades.map((upgradeId, i) => (
                <span key={`${upgradeId}-${i}`} className="upgrade-badge" title={getUpgrade(upgradeId).description}>
                  {getUpgrade(upgradeId).name}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function CombatFleetView({
  playerShips,
  enemyShips,
  playerLabels,
  playerFrameIds,
  playerUpgrades,
  enemyName,
  enemyLabels,
  enemyArchetypes,
  activeAttacker,
  activeTarget,
  onShipEl,
  onSelectEnemy,
  priorityTargetIndex,
}: CombatFleetViewProps) {
  return (
    <div className="combat-fleets">
      <div className="combat-fleets__side">
        {playerShips.map((ship, i) =>
          shipCard(
            ship,
            'player',
            i,
            playerLabels[i] ?? `Ship #${i + 1}`,
            <FrameSilhouette frameId={playerFrameIds[i] ?? 'cruiser'} size={64} />,
            activeAttacker,
            activeTarget,
            playerUpgrades?.[i],
            onShipEl,
          ),
        )}
      </div>
      <div className="combat-fleets__side combat-fleets__side--enemy">
        {enemyShips.map((ship, i) =>
          shipCard(
            ship,
            'enemy',
            i,
            enemyLabels[i] ?? enemyName,
            <EnemySilhouette archetype={enemyArchetypes[i] ?? 'cruiser'} size={64} />,
            activeAttacker,
            activeTarget,
            undefined,
            onShipEl,
            onSelectEnemy,
            priorityTargetIndex === i,
          ),
        )}
      </div>
    </div>
  );
}
