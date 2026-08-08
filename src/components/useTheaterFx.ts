import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { incomingFirePreview, outgoingFirePreview } from '../game/combatEngine';
import type { CombatState } from '../game/combatEngine';
import type { EnemyDef, Side } from '../game/types';
import { playSfx } from '../audio';
import { describeEvent } from './combatLogText';
import type { FxItem, FxSpawn } from './TheaterFx';

// 47.4.1: extracted from CombatScreen. Iteration 12.2: transient fx spawned
// per revealed event, drawn between the *measured* centers of the ship
// cards involved. Cards register their elements; centers are computed
// relative to the theater container at spawn time. Takes `revealedCount`
// and `lastStepRef` from useReplayReveal as inputs — it doesn't own the
// replay ticker itself, only reacts to it (the "first two share nothing
// with the rest" split from the plan holds: this hook and useReplayReveal
// each work standalone, composed only at the CombatScreen call site).

// Roughly how long a tracer takes to reach its target — card badges wait
// this long so they read as the shot landing, not as the event firing.
const TRACER_TRAVEL_MS = 260;
const BADGE_HOLD_MS = 1100;

export interface CardBadge {
  text: string;
  tone: 'dodge' | 'damage';
  id: number; // changes on every badge, so the animation restarts on repeats
}

interface UseTheaterFxArgs {
  combat: CombatState;
  enemy: EnemyDef;
  playerLabels: string[];
  revealedCount: number;
  reducedMotion: boolean;
  lastStepRef: RefObject<{ from: number; to: number } | null>;
}

export function useTheaterFx({ combat, enemy, playerLabels, revealedCount, reducedMotion, lastStepRef }: UseTheaterFxArgs) {
  const theaterRef = useRef<HTMLDivElement>(null);
  const shipElsRef = useRef(new Map<string, HTMLElement>());
  const [fx, setFx] = useState<FxItem[]>([]);
  const fxKeyRef = useRef(0);
  // Per-card badges ("−3", "DODGED"), keyed by `side:index`.
  const [cardBadges, setCardBadges] = useState<Record<string, CardBadge>>({});
  const badgeKeyRef = useRef(0);
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

  // The shooter's card box, in the same theater-relative space as centerOf —
  // dice are laid out inside this rather than drifting toward the target, so
  // a volley always reads as belonging to the ship that fired it.
  const boundsOf = useCallback(
    (side: Side, index: number): { left: number; top: number; width: number; height: number } | null => {
      const container = theaterRef.current;
      const el = shipElsRef.current.get(`${side}:${index}`);
      if (!container || !el) return null;
      const cRect = container.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return { left: r.left - cRect.left, top: r.top - cRect.top, width: r.width, height: r.height };
    },
    [],
  );

  // Iteration 19 (telegraphs): persistent threat lines from each firing
  // enemy card to its opening target, measured from real card positions
  // after layout. Hidden while a round replays (the transient fx own the
  // stage) and once the fight ends; re-measured on state change and resize.
  // 2026-08-08: the player's own outgoing half joins it (outgoingFirePreview),
  // same measuring pass, kept as a separate array so CombatScreen can style
  // "what's about to hit me" and "what I'm about to hit" differently.
  type ThreatLine = { key: string; x1: number; y1: number; x2: number; y2: number };
  const [threatLines, setThreatLines] = useState<ThreatLine[]>([]);
  const [outgoingThreatLines, setOutgoingThreatLines] = useState<ThreatLine[]>([]);
  const finished = Boolean(combat.winner);
  const isReplayingNow = revealedCount < combat.log.length;
  const showTelegraph = !finished && !isReplayingNow;
  useEffect(() => {
    if (!showTelegraph) {
      setThreatLines([]);
      setOutgoingThreatLines([]);
      return;
    }
    const measure = () => {
      const preview = incomingFirePreview(combat);
      const lines: ThreatLine[] = [];
      for (const entry of preview.entries) {
        const from = centerOf('enemy', entry.shooterIndex);
        const to = centerOf('player', entry.targetIndex);
        if (from && to) {
          lines.push({ key: `${entry.shooterIndex}-${entry.targetIndex}`, x1: from.x, y1: from.y, x2: to.x, y2: to.y });
        }
      }
      setThreatLines(lines);

      const outgoing = outgoingFirePreview(combat);
      const outgoingLines: ThreatLine[] = [];
      for (const entry of outgoing.entries) {
        const from = centerOf('player', entry.shooterIndex);
        const to = centerOf('enemy', entry.targetIndex);
        if (from && to) {
          outgoingLines.push({ key: `${entry.shooterIndex}-${entry.targetIndex}`, x1: from.x, y1: from.y, x2: to.x, y2: to.y });
        }
      }
      setOutgoingThreatLines(outgoingLines);
    };
    // Measured synchronously: by effect time the ship cards' ref callbacks
    // have run and layout is committed. (Not requestAnimationFrame — RAF
    // never fires in a hidden/background tab, which would leave the lines
    // blank until the next resize.)
    measure();
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
    };
  }, [combat, showTelegraph, centerOf]);

  useEffect(() => {
    const prev = prevRevealedRef.current;
    prevRevealedRef.current = revealedCount;
    // Only the replay ticker's own steps spawn fx — fresh mounts,
    // fast-forwards, and auto-resolve jumps stay visually silent.
    const step = lastStepRef.current;
    if (reducedMotion || !step || step.from !== prev || step.to !== revealedCount) return;

    const spawned: FxItem[] = [];
    const push = (item: FxSpawn, ttlMs: number) => {
      const key = ++fxKeyRef.current;
      spawned.push({ ...item, key } as FxItem);
      window.setTimeout(() => setFx((all) => all.filter((i) => i.key !== key)), ttlMs);
    };

    // A badge stuck on the target's own card, timed to land when the tracer
    // does rather than the moment the event is revealed.
    const badgeOnCard = (side: Side, index: number, text: string, tone: 'dodge' | 'damage') => {
      const key = `${side}:${index}`;
      window.setTimeout(() => {
        setCardBadges((all) => ({ ...all, [key]: { text, tone, id: ++badgeKeyRef.current } }));
        window.setTimeout(() => {
          setCardBadges((all) => {
            if (!all[key]) return all;
            const { [key]: _dropped, ...rest } = all;
            return rest;
          });
        }, BADGE_HOLD_MS);
      }, TRACER_TRAVEL_MS);
    };

    // The step's roll entries, up front: the whole volley reveals as one
    // step, so its size is known before placing any single die — which is
    // what lets the row be sized to fit the shooter's card.
    const rollIndices: number[] = [];
    for (let i = step.from; i < step.to; i++) {
      if (combat.log[i]?.kind === 'roll') rollIndices.push(i);
    }
    const volleySize = rollIndices.length;

    // Every entry the step revealed, so a ship's dice all spawn on this same
    // frame and read as one volley.
    for (let idx = step.from; idx < step.to; idx++) {
      const event = combat.log[idx];
      if (!event) continue;

      if (event.kind === 'roll') {
        const from = centerOf(event.side, event.shooterIndex);
        const to = centerOf(event.side === 'player' ? 'enemy' : 'player', event.targetIndex);
        if (from && to) {
          const lastPhase = [...combat.log.slice(0, idx + 1)].reverse().find((e) => e.kind === 'phase-start');
          const missile = lastPhase?.kind === 'phase-start' && lastPhase.phase === 'missile';

          // A ship with multiple guns (or a multi-die weapon) fires several
          // dice in one activation. They lay out as a horizontal row centered
          // in the shooter's own card — always screen-horizontal, so a ship's
          // dice read as one row regardless of which side of the theater it's
          // on or where its target sits.
          //
          // Dice used to be offset toward the target and fanned at a fixed
          // 30px, which drifted them outside the card — worse once a whole
          // volley appeared at once instead of one die at a time. Spacing now
          // shrinks to whatever the card can hold and every die is clamped
          // inside it, so a volley can never wander off its own ship.
          const shotIndex = rollIndices.indexOf(idx);
          const box = boundsOf(event.side, event.shooterIndex);
          const DIE_SIZE = 26;
          const DIE_PAD = 3;
          const MAX_DIE_SPACING = 30;
          let dieX = from.x;
          let dieY = from.y;
          if (box) {
            const half = DIE_SIZE / 2 + DIE_PAD;
            const usable = Math.max(0, box.width - DIE_SIZE - DIE_PAD * 2);
            const spacing = volleySize > 1 ? Math.min(MAX_DIE_SPACING, usable / (volleySize - 1)) : 0;
            const offset = (shotIndex - (volleySize - 1) / 2) * spacing;
            const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
            dieX = clamp(box.left + box.width / 2 + offset, box.left + half, box.left + box.width - half);
            dieY = clamp(box.top + box.height / 2, box.top + half, box.top + box.height - half);
          }

          // Iteration 13: show the actual die, on the shooter, tinted by outcome.
          push({ kind: 'die', x: dieX, y: dieY, raw: event.raw, hit: event.hit }, 1900);
          const targetSide: Side = event.side === 'player' ? 'enemy' : 'player';
          // A jink logs its part-effect immediately *before* the roll it
          // negates, so a miss preceded by that entry is a dodge, not a whiff.
          const previous = combat.log[idx - 1];
          const dodged =
            !event.hit && previous?.kind === 'part-effect' && previous.text.includes('jinks');

          if (event.hit) {
            push({ kind: 'tracer', x1: from.x, y1: from.y, x2: to.x, y2: to.y, side: event.side, missile, veer: false }, 650);
            if (event.damage > 0) badgeOnCard(targetSide, event.targetIndex, `−${event.damage}`, 'damage');
            playSfx(event.side === 'player' ? 'hitDealt' : 'hitTaken');
          } else if (dodged) {
            // The shot is thrown wide by the dodge, and the card says so.
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            push(
              { kind: 'tracer', x1: from.x, y1: from.y, x2: to.x + dx * 0.3, y2: to.y + dy * 0.3 - 44, side: event.side, missile, veer: true },
              650,
            );
            badgeOnCard(targetSide, event.targetIndex, 'DODGED', 'dodge');
            playSfx('dodge');
          } else if (event.raw === 1) {
            // Natural 1 (or a jink) — the shot veers wide past the card.
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            push(
              { kind: 'tracer', x1: from.x, y1: from.y, x2: to.x + dx * 0.3, y2: to.y + dy * 0.3 - 44, side: event.side, missile, veer: true },
              650,
            );
            playSfx('miss');
          } else {
            // Blocked by shields/evasion — tracer lands, shield ripple blooms.
            push({ kind: 'tracer', x1: from.x, y1: from.y, x2: to.x, y2: to.y, side: event.side, missile, veer: false }, 650);
            push({ kind: 'ripple', x: to.x, y: to.y }, 700);
            playSfx('block');
          }
        }
      } else if (event.kind === 'destroyed') {
        const at = centerOf(event.side, event.shipIndex);
        if (at) push({ kind: 'shards', x: at.x, y: at.y }, 1100);
        playSfx(event.side === 'player' ? 'shipLost' : 'kill');
      } else if (event.kind === 'part-effect') {
        // The jink gets a badge on the dodging card instead of a top banner —
        // it belongs to one ship, not the whole fight.
        if (!(event.kind === 'part-effect' && event.text.includes('jinks'))) {
          push({ kind: 'banner', text: event.text }, 1500);
          playSfx('effect');
        }
      } else if (event.kind === 'outspeed') {
        // Iteration 17: a top banner, same wording as the log line — this is
        // a whole-fight moment (a ship earning a second activation), not
        // something that belongs on just one card the way a dodge does.
        const text = describeEvent(event, enemy, playerLabels);
        if (text) push({ kind: 'banner', text }, 1600);
        playSfx('outspeed');
      }
    }

    if (spawned.length > 0) setFx((all) => [...all, ...spawned]);
  }, [revealedCount, reducedMotion, combat.log, centerOf, enemy, playerLabels, lastStepRef]);

  function clearFx() {
    setFx([]);
  }

  return { theaterRef, fx, cardBadges, registerShipEl, threatLines, outgoingThreatLines, showTelegraph, clearFx };
}
