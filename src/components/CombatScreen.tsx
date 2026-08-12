import { useEffect, useRef, useState } from 'react';
import { outspeedingShipIndices } from '../game/combatEngine';
import type { CombatState, FleetOrderId, TargetedOrderId } from '../game/combatEngine';
import type { FrameId } from '../game/frames';
import type { EnemyDef } from '../game/types';
import { classifyArchetype } from './ShipSilhouette';
import { CombatCommandBar } from './CombatCommandBar';
import { CombatFleetView } from './CombatFleetView';
import { CombatLog } from './CombatLog';
import { resolveGroup, shipLabel } from './combatLogText';
import { OnboardingPopup } from './OnboardingPopup';
import { rollbackToRevealed } from './replaySteps';
import { TheaterFxLayer } from './TheaterFx';
import { useOnboardingPopup } from './useOnboardingPopup';
import { usePrefersReducedMotion } from './useReducedMotion';
import { useReplayReveal } from './useReplayReveal';
import { useTheaterFx } from './useTheaterFx';

// 47.4.1: CombatScreen was a 697-line file mixing five concerns — the fx
// spawner + card measurement, the log text/classing, the replay reveal
// ticker, the replay rollback math, the onboarding gate, and the hand/
// actives dock. All six are now extracted (useTheaterFx, combatLogText.ts
// + CombatLog, useReplayReveal, replaySteps.ts's rollbackToRevealed,
// useOnboardingPopup, CombatCommandBar); this file is the layout shell
// that composes them.

interface CombatScreenProps {
  combat: CombatState;
  enemy: EnemyDef;
  playerLabels: string[];
  playerFrameIds: FrameId[];
  onAdvanceRound: () => void;
  onContinue: () => void;
  onUseActive: (shipIndex: number, abilityIndex: number) => void;
  onSelectEnemy: (index: number) => void;
  onIssueOrder: (order: FleetOrderId, targetIndex?: number) => void;
}

export function CombatScreen({
  combat,
  enemy,
  playerLabels,
  playerFrameIds,
  onAdvanceRound,
  onContinue,
  onUseActive,
  onSelectEnemy,
  onIssueOrder,
}: CombatScreenProps) {
  const finished = Boolean(combat.winner);
  const won = combat.winner === 'player';

  // Iteration 48 (fleet orders): which targeted order (Brace/Exploit
  // weakness) is mid-pick, awaiting a theater click — null for the two
  // untargeted stance orders, which issue immediately on tile click and
  // never touch this state at all. Owned here (not CombatCommandBar) since
  // completing a pick means clicking a ship card in the theater, outside
  // the command bar's own DOM.
  const [pickingOrder, setPickingOrder] = useState<TargetedOrderId | null>(null);

  // Mobile only (the toggle is display:none above the breakpoint): the pinned
  // dock costs ~280px of a phone screen (see .combat-command-bar's ≤720px
  // rule), which is worth it while you're choosing an order/active and dead
  // weight while you're reading the theater. Driven ONLY by the player's own
  // toggle — see the picking note below for why a pick no longer touches it.
  const [handCollapsed, setHandCollapsed] = useState(false);

  // A pick left open across a round boundary would be stale (CP/armed
  // state just reset) — same "the round moved on" cleanup the replay
  // ticker/fx layer already do via their own effects.
  useEffect(() => {
    setPickingOrder(null);
  }, [combat.round]);

  // 53.2, reworked 2026-08-12 after a player report of the mobile view
  // "moving up and down / resize spasms". The original fix flipped
  // `handCollapsed` on pick entry to get the fixed dock off the ship cards.
  // But `handCollapsed` drives `.combat-screen`'s dock-state class, whose
  // reserved `padding-bottom` swings 304px -> 72px — so every order tap
  // reflowed the whole document by 232px, and the round-change reset
  // lurched it back. The dock is `position: fixed`, so its own height costs
  // the document nothing; only that reservation moves things. So picking
  // now hides the dock's BODY (a purely visual `--picking` class) while
  // leaving the reservation — and therefore the page — completely still.
  // `scrollIntoView` went too: it was a second source of movement competing
  // with the first, and with the body hidden the theater is already clear.
  function handleOrderTileClick(order: FleetOrderId) {
    if (order === 'brace' || order === 'exploit-weakness') {
      if (pickingOrder === order) {
        cancelPick();
        return;
      }
      setPickingOrder(order);
      return;
    }
    onIssueOrder(order);
  }

  function handleOrderPick(index: number) {
    if (!pickingOrder) return;
    onIssueOrder(pickingOrder, index);
    setPickingOrder(null);
  }

  // Re-clicking the tile that started the pick still cancels it (see
  // handleOrderTileClick above), but that tile is inside the dock body,
  // which a pick hides — so the pick hint's Cancel button (rendered below,
  // outside the bar) is the reliable affordance.
  function cancelPick() {
    setPickingOrder(null);
  }

  const { onboardingPopup, dismissOnboardingPopup } = useOnboardingPopup(combat, enemy);

  // Iteration 13: the priority lock only *displays* while its target lives —
  // the engine already ignores a dead priority, but a ring on a wreck reads
  // as a stale lock the player can't click away.
  const effectivePriority =
    combat.priorityTargetIndex != null &&
    combat.enemyShips.some((s) => s.index === combat.priorityTargetIndex && s.stats.hp - s.damage > 0)
      ? combat.priorityTargetIndex
      : null;

  // Iteration 17: which ships qualify for a bonus activation RIGHT NOW —
  // recomputed on every render from live state, so the badge reacts the
  // instant an active gets armed or an opposing fast ship dies.
  const outspeeding = outspeedingShipIndices(combat);

  // Every active part any player ship carries, identified by (shipIndex,
  // abilityIndex) — the same pair `canUseActive`/`onUseActive` key off of.
  const activeAbilities = combat.playerShips.flatMap((ship, shipIndex) =>
    (ship.stats.actives ?? []).map((partId, abilityIndex) => ({ shipIndex, abilityIndex, partId })),
  );

  const reducedMotion = usePrefersReducedMotion();
  const { revealedCount, isReplaying, fastForwardReplay: tickerFastForward, lastStepRef } = useReplayReveal(
    combat.log,
    reducedMotion,
  );
  const { theaterRef, fx, cardBadges, registerShipEl, threatLines, outgoingThreatLines, showTelegraph, clearFx } = useTheaterFx({
    combat,
    enemy,
    playerLabels,
    revealedCount,
    reducedMotion,
    lastStepRef,
  });
  // Clicking to skip ahead should also clear any fx still mid-animation —
  // composed here since useTheaterFx and useReplayReveal each own their
  // own half (fx state vs. the tick timer) and neither depends on the other.
  function fastForwardReplay() {
    clearFx();
    tickerFastForward();
  }

  const { visibleLog, pendingDamage, pendingDestroyed, activeAttacker, activeTarget } = rollbackToRevealed(
    combat.log,
    revealedCount,
  );

  // Keep the newest revealed entry in view — the log is the whole point of
  // stepping through a fight, so it should never require a manual scroll.
  const logRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const list = logRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [revealedCount]);

  // The dock unmounts entirely once the fight resolves — cards can't be played
  // against a decided combat. The screen's padding reservation has to follow it
  // out, or the layout keeps holding ~280px open for a bar that isn't there.
  const dockState = finished ? 'none' : handCollapsed ? 'collapsed' : 'open';

  return (
    <div
      className={`combat-screen${dockState === 'none' ? '' : ` combat-screen--dock-${dockState}`}${
        pickingOrder ? ' combat-screen--picking' : ''
      }`}
    >
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
        {showTelegraph && (threatLines.length > 0 || outgoingThreatLines.length > 0) && (
          <svg className="threat-lines" aria-hidden="true">
            {/* Arrowhead at the target end — the same marker shape for both
                directions, colored per line so a glance at just the tip
                says "incoming" (danger) or "outgoing" (accent) without
                needing to trace the whole line back to its ship. */}
            <defs>
              <marker
                id="threat-arrow-incoming"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 z" className="threat-arrow threat-arrow--incoming" />
              </marker>
              <marker
                id="threat-arrow-outgoing"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 z" className="threat-arrow threat-arrow--outgoing" />
              </marker>
            </defs>
            {threatLines.map((l) => (
              <line
                key={`in-${l.key}`}
                className="threat-line threat-line--incoming"
                x1={l.x1}
                y1={l.y1}
                x2={l.x2}
                y2={l.y2}
                markerEnd="url(#threat-arrow-incoming)"
              />
            ))}
            {outgoingThreatLines.map((l) => (
              <line
                key={`out-${l.key}`}
                className="threat-line threat-line--outgoing"
                x1={l.x1}
                y1={l.y1}
                x2={l.x2}
                y2={l.y2}
                markerEnd="url(#threat-arrow-outgoing)"
              />
            ))}
          </svg>
        )}
        <TheaterFxLayer fx={fx} />
        <CombatFleetView
          playerShips={combat.playerShips}
          enemyShips={combat.enemyShips}
          playerLabels={playerLabels}
          playerFrameIds={playerFrameIds}
          enemyName={enemy.name}
          enemyLabels={combat.enemyShips.map((_, i) => shipLabel('enemy', i, enemy, playerLabels))}
          enemyArchetypes={combat.enemyShips.map((_, i) => {
            const { group, groupIndex } = resolveGroup(enemy, i);
            return classifyArchetype(enemy.id, group, groupIndex);
          })}
          activeAttacker={activeAttacker}
          activeTarget={activeTarget}
          pendingDamage={pendingDamage}
          pendingDestroyed={pendingDestroyed}
          cardBadges={cardBadges}
          onShipEl={registerShipEl}
          onSelectEnemy={!finished && !isReplaying ? onSelectEnemy : undefined}
          priorityTargetIndex={effectivePriority}
          outspeedingIndices={outspeeding}
          orderPickMode={!finished && !isReplaying && pickingOrder ? { order: pickingOrder, onPick: handleOrderPick } : null}
        />
      </div>
      {/* The static "click an enemy ship..." instruction is gone — onboarding
          clutter every fight after the first. The clickable ship cards
          themselves carry a hover title with the same info. This line now
          only appears once it has real state to report. */}
      {!finished && effectivePriority != null && (
        <p className="hint combat-priority-hint">All guns locked on the marked ship — click it again to release.</p>
      )}

      {/* Round controls sit above the log — the most critical tap target
          shouldn't require scrolling past a growing play-by-play to reach. */}
      <div className="combat-screen__actions">
        {!finished && (
          <button
            type="button"
            className="continue-button"
            disabled={isReplaying}
            onClick={onAdvanceRound}
          >
            {/* round 0 is always a real missile phase by the time this
                renders — reducer.ts's ENGAGE already auto-skips it
                entirely when neither fleet carries a missile (see
                hasMissilePhase), so round 0 here never means "nothing's
                about to happen." */}
            {combat.round === 0 ? 'Start Missile Phase' : 'Next round'}
          </button>
        )}
        {finished && (
          <button type="button" className="continue-button" disabled={isReplaying} onClick={onContinue}>
            Continue
          </button>
        )}
      </div>

      <CombatLog visibleLog={visibleLog} enemy={enemy} playerLabels={playerLabels} logRef={logRef} />

      {/* Iteration: pinned to the bottom of the viewport on mobile (see
          .combat-command-bar's ≤720px rule) so the hand/actives stay
          reachable without scrolling past the log. */}
      {!finished && (
        <CombatCommandBar
          combat={combat}
          activeAbilities={activeAbilities}
          playerLabels={playerLabels}
          playerFrameIds={playerFrameIds}
          handCollapsed={handCollapsed}
          onToggleCollapsed={() => setHandCollapsed((v) => !v)}
          onUseActive={onUseActive}
          pickingOrder={pickingOrder}
          onOrderTileClick={handleOrderTileClick}
        />
      )}
      {/* 53.2: the tile that started this pick may now be scrolled out of
          reach — see handCollapsed above — so the Cancel control lives here
          instead of relying on "click the tile again", which is where the
          instruction previously pointed. */}
      {!finished && pickingOrder && (
        <p className="hint combat-order-pick-hint">
          <span>
            {pickingOrder === 'brace'
              ? 'Click one of your ships in the theater to brace it.'
              : 'Click an enemy ship in the theater to mark it.'}
          </span>
          <button type="button" className="combat-order-pick-hint__cancel" onClick={cancelPick}>
            Cancel
          </button>
        </p>
      )}
      {onboardingPopup && <OnboardingPopup topic={onboardingPopup} onClose={dismissOnboardingPopup} />}
    </div>
  );
}
