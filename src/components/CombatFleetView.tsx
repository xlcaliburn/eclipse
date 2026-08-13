import { ORDER_NEEDS_TARGET } from '../game/combatEngine';
import type { CombatShip, TargetedOrderId } from '../game/combatEngine';
import type { FrameId } from '../game/frames';
import type { Side } from '../game/types';
import type { CardBadge } from './useTheaterFx';
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
  // Iteration 48 (fleet orders), expanded 66: while a targeted order is
  // mid-pick, exactly ONE side's ships become clickable for that purpose
  // (which side comes from combatEngine.ts's ORDER_NEEDS_TARGET), replacing
  // that side's normal click role entirely — an enemy click during an
  // enemy-targeted order's pick marks the target, not priority; it never
  // sets both. Player ships are never otherwise clickable, so a
  // player-targeted order's pick is a pure addition there.
  orderPickMode?: { order: TargetedOrderId; onPick: (index: number) => void } | null;
}

function shipCard(
  ship: CombatShip,
  side: Side,
  index: number,
  label: string,
  silhouette: React.ReactNode,
  activeAttacker: ActiveAttacker | null | undefined,
  activeTarget: ActiveTarget | null | undefined,
  onShipEl: ((side: Side, index: number, el: HTMLElement | null) => void) | undefined,
  // 48: generalized from `onSelectEnemy` — the caller now decides, per
  // side and per pick-mode state, what a click on this card means (set
  // priority, pick a Brace target, pick an Exploit target) and passes the
  // right handler + hint text in. shipCard itself no longer hardcodes
  // "only enemy cards are ever clickable."
  onClick: ((index: number) => void) | undefined,
  clickTitle: string | undefined,
  isPriority = false,
  pendingDamage = 0,
  destructionPending = false,
  badge?: CardBadge,
  isOutspeeding = false,
  isPickTarget = false,
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
  const clickable = !destroyed && !!onClick;

  return (
    <div
      key={label}
      ref={onShipEl ? (el) => onShipEl(side, index, el) : undefined}
      className={`combat-ship${destroyed ? ' combat-ship--destroyed' : ''}${highlight}${clickable ? ' combat-ship--clickable' : ''}${isPickTarget ? ' combat-ship--pick-target' : ''}${isPriority ? ' combat-ship--priority' : ''}${isOutspeeding && !destroyed ? ` combat-ship--outspeeding combat-ship--outspeeding-${side}` : ''}`}
      onClick={clickable ? () => onClick!(index) : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick!(index); } : undefined}
      title={clickable ? clickTitle : undefined}
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
          // 2026-08-08: augment badges (Expansion bay, etc.) dropped from
          // the combat theater — the cards are already tight with six
          // hulls on screen, and a ship's fitted augments aren't something
          // a player needs mid-fight (check the Fleet tab for that).
          <StatBar stats={ship.stats} damage={shownDamage} />
        )}
      </div>
    </div>
  );
}

// Iteration 66: one click-title per targeted order, keyed by TargetedOrderId
// so a new targeted order missing a line here is a compile error. Split by
// side since ORDER_NEEDS_TARGET already says which side each order needs —
// only that side's map is ever actually read for a given order.
const PLAYER_PICK_TITLE: Record<TargetedOrderId, string> = {
  brace: 'Click to brace this ship — holds fire, +2 piloting this round',
  'exploit-weakness': '',
  'patch-crews': 'Click to repair this ship 1 hull damage — it holds fire this round',
  'focus-fire': '',
  'focused-barrage': "Click to mark this ship — its dice deal +1 damage this round",
  bulwark: 'Click to mark this ship — +2 piloting this round, and it keeps firing',
};
const ENEMY_PICK_TITLE: Record<TargetedOrderId, string> = {
  brace: '',
  'exploit-weakness': 'Click to mark this ship — your fleet gains +2 computer against it this round',
  'patch-crews': '',
  'focus-fire': 'Click to mark this ship — your fleet gains +1 computer against it (−1 vs everything else) this round',
  'focused-barrage': '',
  bulwark: '',
};

export function CombatFleetView({
  playerShips,
  enemyShips,
  playerLabels,
  playerFrameIds,
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
  orderPickMode,
}: CombatFleetViewProps) {
  // 48, generalized 66: while a pick mode is active, it fully owns the
  // relevant side's click behavior — an enemy-targeted order's pick
  // REPLACES priority-target clicking (never both live at once, so a click
  // mid-pick can't be misread), and a player-targeted order's pick is a
  // pure addition (player ships have no other click role). Which side is
  // "relevant" comes straight from combatEngine.ts's ORDER_NEEDS_TARGET —
  // one source of truth, so a new targeted order never needs a matching
  // edit here.
  const pickSide = orderPickMode ? ORDER_NEEDS_TARGET[orderPickMode.order] : null;
  const playerClick = pickSide === 'player' ? orderPickMode!.onPick : undefined;
  const enemyClick = orderPickMode ? (pickSide === 'enemy' ? orderPickMode.onPick : undefined) : onSelectEnemy;
  const enemyPickActive = pickSide === 'enemy';

  return (
    <div className="combat-fleets">
      <div className="combat-fleets__side">
        {playerShips.map((ship, i) =>
          shipCard(
            ship,
            'player',
            i,
            playerLabels[i] ?? `Ship #${i + 1}`,
            <FrameSilhouette frameId={playerFrameIds[i] ?? 'cruiser'} size={40} />,
            activeAttacker,
            activeTarget,
            onShipEl,
            playerClick,
            orderPickMode ? PLAYER_PICK_TITLE[orderPickMode.order] : undefined,
            false,
            pendingDamage?.get(`player:${i}`) ?? 0,
            pendingDestroyed?.has(`player:${i}`) ?? false,
            cardBadges?.[`player:${i}`],
            outspeedingIndices?.player.includes(i) ?? false,
            !!playerClick,
          ),
        )}
      </div>
      <div className="combat-fleets__side combat-fleets__side--enemy">
        {enemyShips.map((ship, i) => {
          const clickTitle = enemyPickActive
            ? ENEMY_PICK_TITLE[orderPickMode!.order]
            : priorityTargetIndex === i
              ? 'Priority target — click to clear'
              : 'Click to focus all fire here';
          return shipCard(
            ship,
            'enemy',
            i,
            enemyLabels[i] ?? enemyName,
            <EnemySilhouette archetype={enemyArchetypes[i] ?? 'cruiser'} size={40} />,
            activeAttacker,
            activeTarget,
            onShipEl,
            enemyClick,
            clickTitle,
            priorityTargetIndex === i,
            pendingDamage?.get(`enemy:${i}`) ?? 0,
            pendingDestroyed?.has(`enemy:${i}`) ?? false,
            cardBadges?.[`enemy:${i}`],
            outspeedingIndices?.enemy.includes(i) ?? false,
            enemyPickActive,
          );
        })}
      </div>
    </div>
  );
}
