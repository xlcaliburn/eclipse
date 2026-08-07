import { useCallback, useEffect, useRef, useState } from 'react';
import { canUseActive, hasMissilePhase, incomingFirePreview, outspeedingShipIndices } from '../game/combatEngine';
import type { CombatState } from '../game/combatEngine';
import type { FrameId } from '../game/frames';
import { getPart } from '../game/parts';
import type { CombatEvent, EnemyDef, EnemyGroup, Side } from '../game/types';
import type { UpgradeId } from '../game/upgrades';
import { classifyArchetype } from './ShipSilhouette';
import { ActiveSparkIcon } from './PartIcon';
import { CombatFleetView } from './CombatFleetView';
import { OnboardingPopup } from './OnboardingPopup';
import { TheaterFxLayer } from './TheaterFx';
import type { FxItem, FxSpawn } from './TheaterFx';
import { usePrefersReducedMotion } from './useReducedMotion';
import { countRevealSteps, revealStepEnd } from './replaySteps';
import { describeRoll } from './combatRollText';
import { hasSeenOnboarding, markOnboardingSeen } from '../onboardingProgress';
import type { OnboardingKey } from '../onboardingProgress';
import { playSfx } from '../audio';

// Iteration 29: the first-run onboarding sequence — dice roll, then
// missiles, then piloting, checked in that fixed priority order every time
// a popup closes (not just once), so a fight that trips two conditions at
// once (e.g. a first-ever fight that also happens to have a live missile
// phase) shows them back-to-back instead of only ever surfacing one.
// `hasMissilePhase`/the piloting check are pure functions of the fight's
// starting composition (neither changes mid-fight), so it's safe to
// re-derive from `combat`/`enemy` on every check rather than caching them.
function nextOnboardingPopup(combat: CombatState, enemy: EnemyDef): OnboardingKey | null {
  if (!hasSeenOnboarding('diceRoll')) return 'diceRoll';
  if (!hasSeenOnboarding('missiles') && hasMissilePhase(combat)) return 'missiles';
  if (!hasSeenOnboarding('piloting') && enemy.groups.some((g) => g.stats.shield > 0)) return 'piloting';
  return null;
}

// ~1.5s replay budget per round (10.5) — spread evenly across however many
// events landed this round, clamped so a single-event round doesn't linger
// and a huge round doesn't blow past a sane per-tick minimum.
const ROUND_REPLAY_BUDGET_MS = 1500;
const MIN_TICK_MS = 40;
const MAX_TICK_MS = 220;
// Roughly how long a tracer takes to reach its target — card badges wait
// this long so they read as the shot landing, not as the event firing.
const TRACER_TRAVEL_MS = 260;
const BADGE_HOLD_MS = 1100;

export interface CardBadge {
  text: string;
  tone: 'dodge' | 'damage';
  id: number; // changes on every badge, so the animation restarts on repeats
}

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
  if (event.kind === 'part-effect') {
    return 'combat-log__line combat-log__line--card';
  }
  if (event.kind === 'outspeed') {
    return event.side === 'player' ? 'combat-log__line combat-log__line--good' : 'combat-log__line combat-log__line--bad';
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
      return describeRoll(event, attacker, target);
    }
    case 'destroyed': {
      const label = shipLabel(event.side, event.shipIndex, enemy, playerLabels);
      return `${label} is destroyed.`;
    }
    case 'outspeed': {
      const label = shipLabel(event.side, event.shipIndex, enemy, playerLabels);
      const opposing = event.side === 'player' ? 'the enemy fleet' : 'your fleet';
      return `${label} outspeeds ${opposing} — second activation.`;
    }
    case 'stalemate':
      return 'Combat drags on for 30 rounds with no resolution — the enemy is declared the winner.';
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

  // Iteration 29: the first-run onboarding sequence. Checked once when
  // CombatScreen first mounts for this fight (a ref, not a dependency
  // array, so it never re-fires as `combat` changes every round) and again
  // each time a popup is dismissed, so multiple first-time conditions in
  // the same fight surface one after another instead of only the first.
  const [onboardingPopup, setOnboardingPopup] = useState<OnboardingKey | null>(null);
  const onboardingCheckedRef = useRef(false);
  useEffect(() => {
    if (onboardingCheckedRef.current) return;
    onboardingCheckedRef.current = true;
    setOnboardingPopup(nextOnboardingPopup(combat, enemy));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately once per mount, see comment above
  }, []);
  function dismissOnboardingPopup() {
    if (onboardingPopup) markOnboardingSeen(onboardingPopup);
    setOnboardingPopup(nextOnboardingPopup(combat, enemy));
  }

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

  // Iteration 19 (telegraphs): next round's opening fire, recomputed from
  // live state every render — arming an evade or a lure-swap visibly moves
  // the telegraph before the round is committed.
  const firePreview = !finished ? incomingFirePreview(combat) : null;
  const incomingByTarget = new Map<
    number,
    { dice: number; maxDamage: number; outspeed: boolean; shooters: string[] }
  >();
  if (firePreview) {
    for (const entry of firePreview.entries) {
      const agg = incomingByTarget.get(entry.targetIndex) ?? { dice: 0, maxDamage: 0, outspeed: false, shooters: [] };
      agg.dice += entry.diceCount;
      agg.maxDamage += entry.maxDamage;
      agg.outspeed = agg.outspeed || entry.outspeed;
      agg.shooters.push(shipLabel('enemy', entry.shooterIndex, enemy, playerLabels));
      incomingByTarget.set(entry.targetIndex, agg);
    }
  }

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

    // Budget is spread over reveal *steps*, not log entries — a ship's dice
    // now land together as one step, so pacing off raw entry count would rush
    // a round of multi-gun volleys through in a fraction of the budget.
    const steps = countRevealSteps(combat.log, prevLength, newLength);
    const perTickMs = Math.max(MIN_TICK_MS, Math.min(MAX_TICK_MS, ROUND_REPLAY_BUDGET_MS / steps));
    setRevealedCount(prevLength);
    let count = prevLength;
    const tick = () => {
      const from = count;
      count = revealStepEnd(combat.log, from);
      replayStepRef.current = { from, to: count };
      setRevealedCount(count);
      tickTimerRef.current = count < newLength ? window.setTimeout(tick, perTickMs) : null;
    };
    tickTimerRef.current = window.setTimeout(tick, perTickMs);
  }, [combat.log, reducedMotion]);

  // Iteration 12.2: transient fx spawned per revealed event, drawn between
  // the *measured* centers of the ship cards involved. Cards register their
  // elements; centers are computed relative to the theater container at
  // spawn time.
  const theaterRef = useRef<HTMLDivElement>(null);
  const shipElsRef = useRef(new Map<string, HTMLElement>());
  const [fx, setFx] = useState<FxItem[]>([]);
  const fxKeyRef = useRef(0);
  // Per-card badges ("−3", "DODGED"), keyed by `side:index`.
  const [cardBadges, setCardBadges] = useState<Record<string, CardBadge>>({});
  const badgeKeyRef = useRef(0);
  const prevRevealedRef = useRef(revealedCount);
  // The range the replay ticker just revealed. Fx spawn only for a range that
  // matches this exactly, which is what keeps fresh mounts, fast-forwards, and
  // auto-resolve jumps silent now that a step can cover more than one entry.
  const replayStepRef = useRef<{ from: number; to: number } | null>(null);

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
  const [threatLines, setThreatLines] = useState<
    { key: string; x1: number; y1: number; x2: number; y2: number }[]
  >([]);
  const isReplayingNow = revealedCount < combat.log.length;
  const showTelegraph = !finished && !isReplayingNow;
  useEffect(() => {
    if (!showTelegraph) {
      setThreatLines([]);
      return;
    }
    const measure = () => {
      const preview = incomingFirePreview(combat);
      const lines: { key: string; x1: number; y1: number; x2: number; y2: number }[] = [];
      for (const entry of preview.entries) {
        const from = centerOf('enemy', entry.shooterIndex);
        const to = centerOf('player', entry.targetIndex);
        if (from && to) {
          lines.push({ key: `${entry.shooterIndex}-${entry.targetIndex}`, x1: from.x, y1: from.y, x2: to.x, y2: to.y });
        }
      }
      setThreatLines(lines);
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
    const step = replayStepRef.current;
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
  }, [revealedCount, reducedMotion, combat.log, centerOf, enemy, playerLabels]);

  function fastForwardReplay() {
    if (tickTimerRef.current !== null) {
      window.clearTimeout(tickTimerRef.current);
      tickTimerRef.current = null;
    }
    setFx([]);
    setRevealedCount(combat.log.length);
  }

  // The ship arrays hold end-of-round state, but the theater is mid-replay —
  // so roll back everything not yet revealed. Damage is reconstructed by
  // subtracting the pending rolls' own logged amounts (which are the exact
  // values applied), and a ship only reads as destroyed once its `destroyed`
  // entry has actually been shown. Self-correcting: at full reveal there is
  // nothing pending and this is the real state again.
  const pendingDamage = new Map<string, number>();
  const pendingDestroyed = new Set<string>();
  for (let i = revealedCount; i < combat.log.length; i++) {
    const event = combat.log[i];
    if (event.kind === 'roll' && event.damage > 0) {
      const key = `${event.side === 'player' ? 'enemy' : 'player'}:${event.targetIndex}`;
      pendingDamage.set(key, (pendingDamage.get(key) ?? 0) + event.damage);
    } else if (event.kind === 'destroyed') {
      pendingDestroyed.add(`${event.side}:${event.shipIndex}`);
    }
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
          incomingFire={showTelegraph ? incomingByTarget : undefined}
          incomingFlakNote={
            showTelegraph && firePreview?.phase === 'missile' && firePreview.flakCancels > 0
              ? `Your flak downs the first ${firePreview.flakCancels} missile ${firePreview.flakCancels === 1 ? 'die' : 'dice'}.`
              : undefined
          }
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

      {/* Iteration: pinned to the bottom of the viewport on mobile (see
          .combat-command-bar's ≤720px rule) so the hand/actives stay
          reachable without scrolling past the log. */}
      {!finished && (
      <div className={`combat-command-bar${handCollapsed ? ' combat-command-bar--collapsed' : ''}`}>
      <button
        type="button"
        className="combat-command-bar__toggle"
        aria-expanded={!handCollapsed}
        aria-controls="combat-command-bar-body"
        onClick={() => setHandCollapsed((v) => !v)}
      >
        {handCollapsed ? `Show actives (${activeAbilities.length})` : 'Hide actives'}
      </button>
      <div className="combat-command-bar__body" id="combat-command-bar-body">
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
                    <span className="card-tile__ship">{playerLabels[shipIndex] ?? 'your ship'}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      </div>
      )}
      {!finished && !canWithdraw && (
        <p className="hint">No line of retreat here — this fight must be finished.</p>
      )}
      {onboardingPopup && <OnboardingPopup topic={onboardingPopup} onClose={dismissOnboardingPopup} />}
    </div>
  );
}
