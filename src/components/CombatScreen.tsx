import { useCallback, useEffect, useRef, useState } from 'react';
import { canPlayCard, canUseActive } from '../game/combatEngine';
import type { CombatState } from '../game/combatEngine';
import { getCard } from '../game/cards';
import type { CardId } from '../game/cards';
import type { FrameId } from '../game/frames';
import { getPart } from '../game/parts';
import type { CombatEvent, EnemyDef, EnemyGroup, Side } from '../game/types';
import type { UpgradeId } from '../game/upgrades';
import { classifyArchetype } from './ShipSilhouette';
import { ActiveSparkIcon } from './PartIcon';
import { CombatFleetView } from './CombatFleetView';
import { TheaterFxLayer } from './TheaterFx';
import type { FxItem, FxSpawn } from './TheaterFx';
import { usePrefersReducedMotion } from './useReducedMotion';

// ~1.5s replay budget per round (10.5) — spread evenly across however many
// events landed this round, clamped so a single-event round doesn't linger
// and a huge round doesn't blow past a sane per-tick minimum.
const ROUND_REPLAY_BUDGET_MS = 1500;
const MIN_TICK_MS = 40;
const MAX_TICK_MS = 220;

interface CombatScreenProps {
  combat: CombatState;
  enemy: EnemyDef;
  playerLabels: string[];
  playerFrameIds: FrameId[];
  playerUpgrades?: UpgradeId[][];
  hand: CardId[];
  canWithdraw: boolean;
  onPlayCard: (cardId: CardId) => void;
  onAdvanceRound: () => void;
  onContinue: () => void;
  onWithdraw: () => void;
  onUseActive: (shipIndex: number, abilityIndex: number) => void;
  onSelectEnemy: (index: number) => void;
}

// Resolves a flattened enemy-side index (see combatEngine.ts's initCombat,
// which lays sub-groups out in order) back to the group it came from, plus
// that ship's position within its own group.
function resolveGroup(
  enemy: EnemyDef,
  index: number,
): { group: EnemyGroup; groupIndex: number; withinGroupIndex: number } {
  let remaining = index;
  for (let g = 0; g < enemy.groups.length; g++) {
    const group = enemy.groups[g];
    if (remaining < group.count) return { group, groupIndex: g, withinGroupIndex: remaining };
    remaining -= group.count;
  }
  const groupIndex = enemy.groups.length - 1;
  return { group: enemy.groups[groupIndex], groupIndex, withinGroupIndex: 0 };
}

function shipLabel(
  side: 'player' | 'enemy',
  index: number,
  enemy: EnemyDef,
  playerLabels: string[],
): string {
  if (side === 'player') return playerLabels[index] ?? 'your ship';
  if (enemy.groups.length === 1) {
    const { count } = enemy.groups[0];
    return count > 1 ? `${enemy.name} #${index + 1}` : enemy.name;
  }
  const { group, withinGroupIndex } = resolveGroup(enemy, index);
  return group.count > 1 ? `${group.label} #${withinGroupIndex + 1}` : group.label;
}

function eventClassName(event: CombatEvent): string {
  if (event.kind === 'phase-start') return 'combat-log__phase';
  if (event.kind === 'roll') {
    if (!event.hit) return 'combat-log__line combat-log__line--miss';
    return event.side === 'player' ? 'combat-log__line combat-log__line--good' : 'combat-log__line combat-log__line--bad';
  }
  if (event.kind === 'destroyed') {
    return event.side === 'player' ? 'combat-log__line combat-log__line--bad' : 'combat-log__line combat-log__line--good';
  }
  if (event.kind === 'card' || event.kind === 'part-effect') {
    return 'combat-log__line combat-log__line--card';
  }
  return 'combat-log__line combat-log__line--bad';
}

function describeEvent(event: CombatEvent, enemy: EnemyDef, playerLabels: string[]): string | null {
  switch (event.kind) {
    case 'phase-start':
      return event.phase === 'missile' ? 'Missile phase' : `Cannon round ${event.round}`;
    case 'roll': {
      const attacker = shipLabel(event.side, event.shooterIndex, enemy, playerLabels);
      const defenderSide = event.side === 'player' ? 'enemy' : 'player';
      const target = shipLabel(defenderSide, event.targetIndex, enemy, playerLabels);
      if (event.hit) {
        return `${attacker} rolls ${event.raw} — hits ${target} for ${event.damage} damage.`;
      }
      return `${attacker} rolls ${event.raw} — misses ${target}.`;
    }
    case 'destroyed': {
      const label = shipLabel(event.side, event.shipIndex, enemy, playerLabels);
      return `${label} is destroyed.`;
    }
    case 'stalemate':
      return 'Combat drags on for 30 rounds with no resolution — the enemy is declared the winner.';
    case 'card':
    case 'part-effect':
      return event.text;
    default:
      return null;
  }
}

export function CombatScreen({
  combat,
  enemy,
  playerLabels,
  playerFrameIds,
  playerUpgrades,
  hand,
  canWithdraw,
  onPlayCard,
  onAdvanceRound,
  onContinue,
  onWithdraw,
  onUseActive,
  onSelectEnemy,
}: CombatScreenProps) {
  const finished = Boolean(combat.winner);
  const won = combat.winner === 'player';
  const withdrawEnabled = canWithdraw && combat.round >= 1;

  // Iteration 13: the priority lock only *displays* while its target lives —
  // the engine already ignores a dead priority, but a ring on a wreck reads
  // as a stale lock the player can't click away.
  const effectivePriority =
    combat.priorityTargetIndex != null &&
    combat.enemyShips.some((s) => s.index === combat.priorityTargetIndex && s.stats.hp - s.damage > 0)
      ? combat.priorityTargetIndex
      : null;

  // Every active part any player ship carries, identified by (shipIndex,
  // abilityIndex) — the same pair `canUseActive`/`onUseActive` key off of.
  const activeAbilities = combat.playerShips.flatMap((ship, shipIndex) =>
    (ship.stats.actives ?? []).map((partId, abilityIndex) => ({ shipIndex, abilityIndex, partId })),
  );

  // Iteration 10.5: event replay — the engine already resolved the whole
  // round synchronously; this just reveals combat.log's newest entries one
  // at a time instead of dumping them all in. Auto-resolve and reduced-
  // motion both skip straight to the full log; a click anywhere fast-
  // forwards the round currently replaying.
  const reducedMotion = usePrefersReducedMotion();
  const [revealedCount, setRevealedCount] = useState(combat.log.length);
  const prevLogLengthRef = useRef(combat.log.length);
  const tickTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (tickTimerRef.current !== null) window.clearTimeout(tickTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const prevLength = prevLogLengthRef.current;
    const newLength = combat.log.length;
    prevLogLengthRef.current = newLength;

    if (tickTimerRef.current !== null) {
      window.clearTimeout(tickTimerRef.current);
      tickTimerRef.current = null;
    }

    if (newLength <= prevLength) {
      setRevealedCount(newLength); // fresh combat, or nothing new to reveal
      return;
    }
    if (reducedMotion) {
      setRevealedCount(newLength);
      return;
    }

    const newEntries = newLength - prevLength;
    const perTickMs = Math.max(MIN_TICK_MS, Math.min(MAX_TICK_MS, ROUND_REPLAY_BUDGET_MS / newEntries));
    setRevealedCount(prevLength);
    let count = prevLength;
    const tick = () => {
      count++;
      setRevealedCount(count);
      tickTimerRef.current = count < newLength ? window.setTimeout(tick, perTickMs) : null;
    };
    tickTimerRef.current = window.setTimeout(tick, perTickMs);
  }, [combat.log.length, reducedMotion]);

  // Iteration 12.2: transient fx spawned per revealed event, drawn between
  // the *measured* centers of the ship cards involved. Cards register their
  // elements; centers are computed relative to the theater container at
  // spawn time.
  const theaterRef = useRef<HTMLDivElement>(null);
  const shipElsRef = useRef(new Map<string, HTMLElement>());
  const [fx, setFx] = useState<FxItem[]>([]);
  const fxKeyRef = useRef(0);
  const prevRevealedRef = useRef(revealedCount);

  const registerShipEl = useCallback((side: Side, index: number, el: HTMLElement | null) => {
    const key = `${side}:${index}`;
    if (el) shipElsRef.current.set(key, el);
    else shipElsRef.current.delete(key);
  }, []);

  const centerOf = useCallback((side: Side, index: number): { x: number; y: number } | null => {
    const container = theaterRef.current;
    const el = shipElsRef.current.get(`${side}:${index}`);
    if (!container || !el) return null;
    const cRect = container.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2 - cRect.left, y: r.top + r.height / 2 - cRect.top };
  }, []);

  useEffect(() => {
    const prev = prevRevealedRef.current;
    prevRevealedRef.current = revealedCount;
    // Only single-step reveals (the replay ticking) spawn fx — fresh mounts,
    // fast-forwards, and auto-resolve jumps stay visually silent.
    if (reducedMotion || revealedCount - prev !== 1) return;
    const event = combat.log[revealedCount - 1];
    if (!event) return;

    const spawned: FxItem[] = [];
    const push = (item: FxSpawn, ttlMs: number) => {
      const key = ++fxKeyRef.current;
      spawned.push({ ...item, key } as FxItem);
      window.setTimeout(() => setFx((all) => all.filter((i) => i.key !== key)), ttlMs);
    };

    if (event.kind === 'roll') {
      const from = centerOf(event.side, event.shooterIndex);
      const to = centerOf(event.side === 'player' ? 'enemy' : 'player', event.targetIndex);
      if (from && to) {
        const lastPhase = [...combat.log.slice(0, revealedCount)].reverse().find((e) => e.kind === 'phase-start');
        const missile = lastPhase?.kind === 'phase-start' && lastPhase.phase === 'missile';
        // Iteration 13: show the actual die, near the shooter, tinted by outcome.
        push(
          { kind: 'die', x: from.x + (to.x - from.x) * 0.18, y: from.y + (to.y - from.y) * 0.18 - 26, raw: event.raw, hit: event.hit },
          900,
        );
        if (event.hit) {
          push({ kind: 'tracer', x1: from.x, y1: from.y, x2: to.x, y2: to.y, side: event.side, missile, veer: false }, 650);
          push({ kind: 'damage', x: to.x, y: to.y - 34, text: `−${event.damage}` }, 1000);
        } else if (event.raw === 1) {
          // Natural 1 (or a jink) — the shot veers wide past the card.
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          push(
            { kind: 'tracer', x1: from.x, y1: from.y, x2: to.x + dx * 0.3, y2: to.y + dy * 0.3 - 44, side: event.side, missile, veer: true },
            650,
          );
        } else {
          // Blocked by shields/evasion — tracer lands, shield ripple blooms.
          push({ kind: 'tracer', x1: from.x, y1: from.y, x2: to.x, y2: to.y, side: event.side, missile, veer: false }, 650);
          push({ kind: 'ripple', x: to.x, y: to.y }, 700);
        }
      }
    } else if (event.kind === 'destroyed') {
      const at = centerOf(event.side, event.shipIndex);
      if (at) push({ kind: 'shards', x: at.x, y: at.y }, 1100);
    } else if (event.kind === 'card' || event.kind === 'part-effect') {
      push({ kind: 'banner', text: event.text }, 1500);
    }

    if (spawned.length > 0) setFx((all) => [...all, ...spawned]);
  }, [revealedCount, reducedMotion, combat.log, centerOf]);

  function fastForwardReplay() {
    if (tickTimerRef.current !== null) {
      window.clearTimeout(tickTimerRef.current);
      tickTimerRef.current = null;
    }
    setFx([]);
    setRevealedCount(combat.log.length);
  }

  const visibleLog = combat.log.slice(0, revealedCount);
  const activeEvent = revealedCount > 0 ? combat.log[revealedCount - 1] : undefined;
  const isReplaying = revealedCount < combat.log.length;
  let activeAttacker: { side: Side; index: number } | null = null;
  let activeTarget: { side: Side; index: number; hit: boolean } | null = null;
  if (isReplaying && activeEvent?.kind === 'roll') {
    activeAttacker = { side: activeEvent.side, index: activeEvent.shooterIndex };
    activeTarget = {
      side: activeEvent.side === 'player' ? 'enemy' : 'player',
      index: activeEvent.targetIndex,
      hit: activeEvent.hit,
    };
  } else if (isReplaying && activeEvent?.kind === 'destroyed') {
    activeTarget = { side: activeEvent.side, index: activeEvent.shipIndex, hit: true };
  }

  // Keep the newest revealed entry in view — the log is the whole point of
  // stepping through a fight, so it should never require a manual scroll.
  const logRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const list = logRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [revealedCount]);

  return (
    <div className="combat-screen">
      {finished && (
        <h2 className={won ? 'verdict verdict--win' : 'verdict verdict--loss'}>{won ? 'Victory' : 'Defeat'}</h2>
      )}

      {/* Click anywhere in the theater to fast-forward the round replaying. */}
      <div
        ref={theaterRef}
        className={`combat-theater${isReplaying ? ' combat-theater--replaying' : ''}`}
        onClick={isReplaying ? fastForwardReplay : undefined}
        title={isReplaying ? 'Click to skip ahead' : undefined}
      >
        <TheaterFxLayer fx={fx} />
        <CombatFleetView
          playerShips={combat.playerShips}
          enemyShips={combat.enemyShips}
          playerLabels={playerLabels}
          playerFrameIds={playerFrameIds}
          playerUpgrades={playerUpgrades}
          enemyName={enemy.name}
          enemyLabels={combat.enemyShips.map((_, i) => shipLabel('enemy', i, enemy, playerLabels))}
          enemyArchetypes={combat.enemyShips.map((_, i) => {
            const { group, groupIndex } = resolveGroup(enemy, i);
            return classifyArchetype(enemy.id, group, groupIndex);
          })}
          activeAttacker={activeAttacker}
          activeTarget={activeTarget}
          onShipEl={registerShipEl}
          onSelectEnemy={!finished && !isReplaying ? onSelectEnemy : undefined}
          priorityTargetIndex={effectivePriority}
        />
      </div>
      {!finished && (
        <p className="hint combat-priority-hint">
          {effectivePriority != null
            ? 'All guns locked on the marked ship — click it again to release.'
            : 'Click an enemy ship to focus all fire on it.'}
        </p>
      )}

      {/* Open by default — the log is the fight, not an appendix. React only
          patches `open` when the prop itself changes, so collapsing it by
          hand survives the re-render on every revealed event. */}
      <details className="combat-log" open>
        <summary>Play-by-play</summary>
        <ol className="combat-log__list" ref={logRef}>
          {visibleLog.map((event, i) => {
            const text = describeEvent(event, enemy, playerLabels);
            if (!text) return null;
            return (
              <li key={i} className={eventClassName(event)}>
                {text}
              </li>
            );
          })}
        </ol>
      </details>

      <div className="combat-command-bar">
      {/* Actions first — most critical tap target on mobile */}
      <div className="combat-screen__actions">
        {!finished && (
          <>
            <button
              type="button"
              className="continue-button"
              disabled={isReplaying}
              onClick={onAdvanceRound}
            >
              Next round
            </button>
            <button
              type="button"
              className="withdraw-button"
              disabled={!withdrawEnabled || isReplaying}
              onClick={onWithdraw}
              title="Keep damage, forfeit reward, node is lost"
            >
              Withdraw
            </button>
          </>
        )}
        {finished && (
          <button type="button" className="continue-button" disabled={isReplaying} onClick={onContinue}>
            Continue
          </button>
        )}
      </div>

      {!finished && (
        <div className="combat-hand">
          <h3>Your hand</h3>
          {hand.length === 0 ? (
            <p className="hint">No reaction cards.</p>
          ) : (
            <div className="combat-hand__cards">
              {hand.map((cardId, i) => {
                const card = getCard(cardId);
                const playable = canPlayCard(combat, cardId);
                return (
                  <button
                    key={`${cardId}-${i}`}
                    type="button"
                    className="card-tile"
                    disabled={!playable}
                    onClick={() => onPlayCard(cardId)}
                    title={card.description}
                  >
                    <span className="card-tile__name">{card.name}</span>
                    <span className="card-tile__desc">{card.description}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!finished && (
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
      )}
      </div>
      {!finished && !canWithdraw && (
        <p className="hint">No line of retreat here — this fight must be finished.</p>
      )}
    </div>
  );
}
