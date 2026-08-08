import { useEffect, useRef, useState } from 'react';
import { outspeedingShipIndices } from '../game/combatEngine';
import type { CombatState } from '../game/combatEngine';
import type { FrameId } from '../game/frames';
import type { EnemyDef } from '../game/types';
import type { UpgradeId } from '../game/upgrades';
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
  playerUpgrades?: UpgradeId[][];
  canWithdraw: boolean;
  onAdvanceRound: () => void;
  onContinue: () => void;
  onWithdraw: () => void;
  onUseActive: (shipIndex: number, abilityIndex: number) => void;
  onSelectEnemy: (index: number) => void;
}

export function CombatScreen({
  combat,
  enemy,
  playerLabels,
  playerFrameIds,
  playerUpgrades,
  canWithdraw,
  onAdvanceRound,
  onContinue,
  onWithdraw,
  onUseActive,
  onSelectEnemy,
}: CombatScreenProps) {
  const finished = Boolean(combat.winner);
  const won = combat.winner === 'player';
  const withdrawEnabled = canWithdraw && combat.round >= 1;

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
  const { theaterRef, fx, cardBadges, registerShipEl, threatLines, showTelegraph, clearFx } = useTheaterFx({
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

  // Mobile only (the toggle is display:none above the breakpoint): the pinned
  // dock costs ~300px of a phone screen, which is worth it while you're
  // choosing a card and dead weight while you're reading the theater.
  const [handCollapsed, setHandCollapsed] = useState(false);
  // The dock unmounts entirely once the fight resolves — cards can't be played
  // against a decided combat. The screen's padding reservation has to follow it
  // out, or the layout keeps holding ~300px open for a bar that isn't there.
  const dockState = finished ? 'none' : handCollapsed ? 'collapsed' : 'open';

  return (
    <div className={`combat-screen${dockState === 'none' ? '' : ` combat-screen--dock-${dockState}`}`}>
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
        {showTelegraph && threatLines.length > 0 && (
          <svg className="threat-lines" aria-hidden="true">
            {threatLines.map((l) => (
              <line key={l.key} className="threat-line" x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />
            ))}
          </svg>
        )}
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
          pendingDamage={pendingDamage}
          pendingDestroyed={pendingDestroyed}
          cardBadges={cardBadges}
          onShipEl={registerShipEl}
          onSelectEnemy={!finished && !isReplaying ? onSelectEnemy : undefined}
          priorityTargetIndex={effectivePriority}
          outspeedingIndices={outspeeding}
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

      <CombatLog visibleLog={visibleLog} enemy={enemy} playerLabels={playerLabels} logRef={logRef} />

      {/* Iteration: pinned to the bottom of the viewport on mobile (see
          .combat-command-bar's ≤720px rule) so the hand/actives stay
          reachable without scrolling past the log. */}
      {!finished && (
        <CombatCommandBar
          combat={combat}
          activeAbilities={activeAbilities}
          playerLabels={playerLabels}
          handCollapsed={handCollapsed}
          onToggleCollapsed={() => setHandCollapsed((v) => !v)}
          onUseActive={onUseActive}
        />
      )}
      {!finished && !canWithdraw && (
        <p className="hint">No line of retreat here — this fight must be finished.</p>
      )}
      {onboardingPopup && <OnboardingPopup topic={onboardingPopup} onClose={dismissOnboardingPopup} />}
    </div>
  );
}
