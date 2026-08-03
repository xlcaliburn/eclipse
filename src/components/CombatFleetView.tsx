import type { CombatShip } from '../game/combatEngine';
import type { FrameId } from '../game/frames';
import type { Side } from '../game/types';
import type { CardBadge } from './CombatScreen';
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
  // Replay rollback: damage/destruction not yet revealed, keyed `side:index`.
  pendingDamage?: Map<string, number>;
  pendingDestroyed?: Set<string>;
  cardBadges?: Record<string, CardBadge>;
  // Iteration 12.2: the fx layer needs real card positions to draw tracers
  // between ships. Each card reports its element; null on unmount.
  onShipEl?: (side: Side, index: number, el: HTMLElement | null) => void;
  // Iteration 13: click an enemy card to make it the fleet's priority
  // target (click again to clear). Set only during a live fight.
  onSelectEnemy?: (index: number) => void;
  priorityTargetIndex?: number | null;
  // Iteration 17: ships (by side) currently qualifying for an Outspeed
  // bonus activation — same computation the engine itself uses, so this
  // can never show a badge the fight wouldn't actually honor. The exact
  // numbers live in the enemy panel's readout; the card badge just marks
  // "this ship gets a second activation this round."
  outspeedingIndices?: { player: number[]; enemy: number[] };
  // Iteration 19 (telegraphs): next round's opening fire, aggregated per
  // player ship. Undefined while replaying / once finished — chips only
  // show between rounds, when the player can still react.
  incomingFire?: Map<number, { dice: number; maxDamage: number; outspeed: boolean; shooters: string[] }>;
  incomingFlakNote?: string; // missile-phase preview only
}

interface IncomingChip {
  dice: number;
  maxDamage: number;
  outspeed: boolean;
  shooters: string[];
  flakNote?: string;
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
  pendingDamage = 0,
  destructionPending = false,
  badge?: CardBadge,
  isOutspeeding = false,
  incoming?: IncomingChip,
) {
  // Show the fight as of the revealed point in the replay, not the end of
  // the round: damage that has not been shown yet is rolled back, and a hull
  // stays intact until its destruction is actually played out.
  const shownDamage = Math.max(0, ship.damage - pendingDamage);
  const hp = Math.max(0, ship.stats.hp - shownDamage);
  const destroyed = hp <= 0 && !destructionPending;
  const damaged = !destroyed && hp < ship.stats.hp * 0.5;

  const isAttacker = activeAttacker?.side === side && activeAttacker.index === index;
  const isTarget = activeTarget?.side === side && activeTarget.index === index;
  const highlight = isAttacker ? ' combat-ship--firing' : isTarget ? (activeTarget!.hit ? ' combat-ship--hit' : ' combat-ship--miss') : '';
  const clickable = side === 'enemy' && !destroyed && !!onSelectEnemy;

  return (
    <div
      key={label}
      ref={onShipEl ? (el) => onShipEl(side, index, el) : undefined}
      className={`combat-ship${destroyed ? ' combat-ship--destroyed' : ''}${highlight}${clickable ? ' combat-ship--clickable' : ''}${isPriority ? ' combat-ship--priority' : ''}${isOutspeeding && !destroyed ? ` combat-ship--outspeeding combat-ship--outspeeding-${side}` : ''}`}
      onClick={clickable ? () => onSelectEnemy!(index) : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') onSelectEnemy!(index); } : undefined}
      title={clickable ? (isPriority ? 'Priority target — click to clear' : 'Click to focus all fire here') : undefined}
    >
      {badge && (
        <span key={badge.id} className={`combat-ship__badge combat-ship__badge--${badge.tone}`}>
          {badge.text}
        </span>
      )}
      {/* Art beside the readout, not above it — a fight with six hulls has
          to fit on screen alongside the log and the round controls. */}
      <div className="combat-ship__art">
        {destroyed ? (
          <BrokenHullGlyph size={36} />
        ) : (
          <div className={damaged ? 'silhouette--damaged' : undefined}>{silhouette}</div>
        )}
      </div>
      <div className="combat-ship__body">
        <div className="combat-ship__name">
          {isPriority && <span className="combat-ship__priority-mark" aria-label="priority target">◎ </span>}
          {isOutspeeding && !destroyed && (
            <span
              className="combat-ship__outspeed-mark"
              aria-label="outspeeding — second activation this round"
              title={
                side === 'player'
                  ? 'Outspeeds the enemy fleet — fires a second cannon activation this round.'
                  : 'Outspeeds your fleet — fires a second cannon activation this round.'
              }
            >
              ⚡×2{' '}
            </span>
          )}
          {label}
        </div>
        {destroyed ? (
          <div className="combat-ship__destroyed">Destroyed</div>
        ) : (
          <>
                  <StatBar stats={ship.stats} damage={shownDamage} />
            {incoming && (
              <span
                className="combat-ship__incoming"
                title={`Opening fire from ${incoming.shooters.join(', ')}. Dice retarget after kills, so this is the opening picture.${incoming.flakNote ? ` ${incoming.flakNote}` : ''}`}
              >
                ⚠ {incoming.dice} {incoming.dice === 1 ? 'die' : 'dice'} · up to {incoming.maxDamage} dmg
                {incoming.outspeed ? ' · ×2 strike' : ''}
              </span>
            )}
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
  pendingDamage,
  pendingDestroyed,
  cardBadges,
  onShipEl,
  onSelectEnemy,
  priorityTargetIndex,
  outspeedingIndices,
  incomingFire,
  incomingFlakNote,
}: CombatFleetViewProps) {
  return (
    <div className="combat-fleets">
      <div className="combat-fleets__side">
        {playerShips.map((ship, i) => {
          const agg = incomingFire?.get(i);
          return shipCard(
            ship,
            'player',
            i,
            playerLabels[i] ?? `Ship #${i + 1}`,
            <FrameSilhouette frameId={playerFrameIds[i] ?? 'cruiser'} size={40} />,
            activeAttacker,
            activeTarget,
            playerUpgrades?.[i],
            onShipEl,
            undefined,
            false,
            pendingDamage?.get(`player:${i}`) ?? 0,
            pendingDestroyed?.has(`player:${i}`) ?? false,
            cardBadges?.[`player:${i}`],
            outspeedingIndices?.player.includes(i) ?? false,
            agg ? { ...agg, flakNote: incomingFlakNote } : undefined,
          );
        })}
      </div>
      <div className="combat-fleets__side combat-fleets__side--enemy">
        {enemyShips.map((ship, i) =>
          shipCard(
            ship,
            'enemy',
            i,
            enemyLabels[i] ?? enemyName,
            <EnemySilhouette archetype={enemyArchetypes[i] ?? 'cruiser'} size={40} />,
            activeAttacker,
            activeTarget,
            undefined,
            onShipEl,
            onSelectEnemy,
            priorityTargetIndex === i,
            pendingDamage?.get(`enemy:${i}`) ?? 0,
            pendingDestroyed?.has(`enemy:${i}`) ?? false,
            cardBadges?.[`enemy:${i}`],
            outspeedingIndices?.enemy.includes(i) ?? false,
          ),
        )}
      </div>
    </div>
  );
}
