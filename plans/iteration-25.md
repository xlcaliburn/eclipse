# Iteration 25 — Sound effects + a how-to-play tutorial (specced + implemented 2026-08-05)

Two independent, purely presentational additions — neither touches `game/`
or the reducer, so nothing here affects determinism/saves/tests.

## 25.1 Procedural sound effects

No audio assets — every cue is synthesized on the fly with the Web Audio
API (`src/audio.ts`), matching the project's existing code-drawn visual
language (dice, tracers, silhouettes are all inline SVG/canvas, not art
assets). Two primitives (`tone` — an oscillator with an optional frequency
sweep and decay envelope; `noiseBurst` — a shared white-noise buffer
through a bandpass filter) compose 11 short cues:

`hitDealt` / `hitTaken` (a landed hit, from each side), `miss`, `dodge`,
`block` (shield/evasion absorbed a hit), `kill` / `shipLost` (a ship
destroyed, from each side), `outspeed`, `effect` (card/passive-part
trigger), `victory`, `defeat`.

Hooked into `CombatScreen.tsx`'s existing fx-spawning `useEffect` — the one
already gated by `replayStepRef` so it fires exactly once per revealed
step, already discriminates hit/dodge/miss/blocked and every `CombatEvent`
kind. A `playSfx(kind)` call sits next to each existing `push(...)` visual
fx call; no new event-discrimination logic needed. `EndScreen.tsx` plays
`victory`/`defeat` once on mount.

A `soundPreference.ts` + `useSoundSetting.ts` pair, structurally identical
to the existing `motionPreference.ts`/`useReducedMotion.ts` (module-level
singleton, `localStorage`, a subscriber set) — sound is deliberately a
separate preference from Motion, not folded into it, since a player might
reasonably want one without the other. A `Sound` row was added to
`SettingsScreen.tsx` right under `Motion`, on/off, defaults on.

## 25.2 How-to-play tutorial

`TutorialOverlay.tsx` — five short static sections (dice roll math,
Computer, Shield, Initiative/Outspeed, HP & round structure), every number
quoted straight from the engine (`resolver.ts`'s `resolveHit`,
`combatEngine.ts`'s `OUTSPEED_GAP = 4`) rather than re-derived, so it can't
drift out of sync with what a fight actually does.

Reachable two ways: a "How to play" text link on the landing screen (works
before a run even starts), and a `?` button in the HUD next to the
existing settings gear (mid-run reference). Deliberately NOT routed
through the `Surface` state machine like Settings/Fleet/Chart — it's a
dismiss-and-forget reference, not a persistent tab, and it needs to work
from the landing screen too (before the phase machine exists) — so it's a
plain `tutorialOpen` boolean in `App.tsx`, rendered as a `.modal-backdrop`/
`.modal-panel` overlay (reusing `SettingsOverlay`'s exact chrome) from
every one of App's three return points.

## Touched files

- `src/audio.ts` — new, the synth engine.
- `src/soundPreference.ts` — new, mirrors `motionPreference.ts`.
- `src/components/useSoundSetting.ts` — new, mirrors `useReducedMotion.ts`.
- `src/components/CombatScreen.tsx` — `playSfx` calls added to the
  existing fx-spawning effect.
- `src/components/EndScreen.tsx` — victory/defeat cue on mount.
- `src/components/SettingsScreen.tsx` — new `Sound` row.
- `src/components/TutorialOverlay.tsx` — new.
- `src/components/HudBar.tsx` — new `onOpenTutorial` prop + `?` button.
- `src/components/LandingScreen.tsx` — new `onOpenTutorial` prop + link.
- `src/App.tsx` — `tutorialOpen` state, wired at all three return points.
- `src/styles.css` — `.tutorial-*` rules (mirrors `.settings-row`),
  `.landing-screen__tutorial-link` (mirrors `.setup-screen__customize-link`).

## Verification

`tsc -b`, `npm test` (496/496 — no new tests; this is UI-presentational
work with no reducer/state surface, consistent with how other
presentation-only features like TheaterFx and the silhouettes aren't
reducer-tested either), `vite build` all clean. Live browser pass: all 11
sound cues synthesize with zero thrown errors (direct module exercise);
the Sound toggle persists to `localStorage` and confirms itself audibly on
re-enable; a real combat round (hits, misses, a kill, victory) played
through the actual `CombatScreen` reveal loop with zero console errors;
the tutorial opens correctly from both the landing-screen link and the HUD
`?` button, renders all five sections with correct copy, and closes
cleanly.
