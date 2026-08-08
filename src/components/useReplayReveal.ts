import { useEffect, useRef, useState } from 'react';
import type { CombatEvent } from '../game/types';
import { countRevealSteps, revealStepEnd } from './replaySteps';

// 47.4.1: extracted from CombatScreen. Iteration 10.5: event replay — the
// engine already resolved the whole round synchronously; this just reveals
// combat.log's newest entries one at a time instead of dumping them all in.
// Auto-resolve and reduced-motion both skip straight to the full log; a
// click anywhere (via `fastForwardReplay`) fast-forwards the round
// currently replaying.

// ~1.5s replay budget per round (10.5) — spread evenly across however many
// events landed this round, clamped so a single-event round doesn't linger
// and a huge round doesn't blow past a sane per-tick minimum.
const ROUND_REPLAY_BUDGET_MS = 1500;
const MIN_TICK_MS = 40;
const MAX_TICK_MS = 220;

export function useReplayReveal(log: CombatEvent[], reducedMotion: boolean) {
  const [revealedCount, setRevealedCount] = useState(log.length);
  const prevLogLengthRef = useRef(log.length);
  const tickTimerRef = useRef<number | null>(null);
  // The step the ticker's `tick()` most recently revealed — read by
  // useTheaterFx (as a ref, so no extra re-render) to decide whether the
  // fx it's about to spawn actually correspond to the replay's own step
  // vs. a fresh mount, fast-forward, or auto-resolve jump.
  const lastStepRef = useRef<{ from: number; to: number } | null>(null);

  useEffect(() => {
    return () => {
      if (tickTimerRef.current !== null) window.clearTimeout(tickTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const prevLength = prevLogLengthRef.current;
    const newLength = log.length;
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

    // Budget is spread over reveal *steps*, not log entries — a ship's dice
    // now land together as one step, so pacing off raw entry count would rush
    // a round of multi-gun volleys through in a fraction of the budget.
    const steps = countRevealSteps(log, prevLength, newLength);
    const perTickMs = Math.max(MIN_TICK_MS, Math.min(MAX_TICK_MS, ROUND_REPLAY_BUDGET_MS / steps));
    setRevealedCount(prevLength);
    let count = prevLength;
    const tick = () => {
      const from = count;
      count = revealStepEnd(log, from);
      lastStepRef.current = { from, to: count };
      setRevealedCount(count);
      tickTimerRef.current = count < newLength ? window.setTimeout(tick, perTickMs) : null;
    };
    tickTimerRef.current = window.setTimeout(tick, perTickMs);
  }, [log, reducedMotion]);

  function fastForwardReplay() {
    if (tickTimerRef.current !== null) {
      window.clearTimeout(tickTimerRef.current);
      tickTimerRef.current = null;
    }
    setRevealedCount(log.length);
  }

  const isReplaying = revealedCount < log.length;
  return { revealedCount, isReplaying, fastForwardReplay, lastStepRef };
}
