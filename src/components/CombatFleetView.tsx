import type { CombatShip } from '../game/combatEngine';
import type { FrameId } from '../game/frames';
import type { Side } from '../game/types';
import { getUpgrade } from '../game/upgrades';
import type { UpgradeId } from '../game/upgrades';
import { EnemySilhouette, FrameSilhouette, BrokenHullGlyph } from './ShipSilhouette';
import type { EnemyArchetype } from './ShipSilhouette';
import { HpPipRow } from './HpPipRow';

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
) {
  const hp = Math.max(0, ship.stats.hp - ship.damage);
  const destroyed = hp <= 0;
  const damaged = !destroyed && hp < ship.stats.hp * 0.5;
  const weapons = [
    ...ship.stats.missiles.map((w) => `${w.diceCount}× missile (${w.damage} dmg)`),
    ...ship.stats.cannons.map((w) => `${w.diceCount}× cannon (${w.damage} dmg)`),
  ];

  const isAttacker = activeAttacker?.side === side && activeAttacker.index === index;
  const isTarget = activeTarget?.side === side && activeTarget.index === index;
  const highlight = isAttacker ? ' combat-ship--firing' : isTarget ? (activeTarget!.hit ? ' combat-ship--hit' : ' combat-ship--miss') : '';

  return (
    <div key={label} className={`combat-ship${destroyed ? ' combat-ship--destroyed' : ''}${highlight}`}>
      <div className="combat-ship__name">{label}</div>
      {destroyed ? (
        <>
          <BrokenHullGlyph size={48} />
          <div className="combat-ship__destroyed">Destroyed</div>
        </>
      ) : (
        <>
          <div className={damaged ? 'silhouette--damaged' : undefined}>{silhouette}</div>
          <HpPipRow hp={hp} maxHp={ship.stats.hp} />
          <div className="combat-ship__hp">
            HP {hp}/{ship.stats.hp}
          </div>
          <div className="combat-ship__stats">
            Init {ship.stats.initiative} · Comp {ship.stats.computer} · Shield {ship.stats.shield}
          </div>
          {weapons.length > 0 && (
            <ul className="combat-ship__weapons">
              {weapons.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
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
}: CombatFleetViewProps) {
  return (
    <div className="combat-fleets">
      <div className="combat-fleets__side">
        <h3>Your fleet</h3>
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
          ),
        )}
      </div>
      <div className="combat-fleets__side combat-fleets__side--enemy">
        <h3>{enemyName}</h3>
        {enemyShips.map((ship, i) =>
          shipCard(
            ship,
            'enemy',
            i,
            enemyLabels[i] ?? enemyName,
            <EnemySilhouette archetype={enemyArchetypes[i] ?? 'cruiser'} size={64} />,
            activeAttacker,
            activeTarget,
          ),
        )}
      </div>
    </div>
  );
}
