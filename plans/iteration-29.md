# Iteration 29 — Piloting rename, roll legibility, and progressive onboarding (specced 2026-08-06)

> **Status: specced, not implemented.**

Three related asks from the same player-feedback thread that led to
iteration 26's boss re-tune. The bug report investigation ("Cybernetic
uplink doesn't seem to work") found the mechanism working correctly but
completely invisible to the player — nothing in the combat UI ever shows
the computer/shield numbers behind a roll, so a working +2 computer active
can look broken. The user's read: "the computer was being countered by the
shield... we should make that more clear when they're being nullified,"
plus two follow-on requests — replace the on-demand tutorial with
contextual first-run popups, and rename "Shield" to "Piloting" since the
stat is really about evasion, not absorption.

Design decisions locked with the user on 2026-08-06:
- New stat name: **Piloting**.
- Rename scope: **display text only** — every player-facing label,
  tooltip, description, and log line that names the stat changes; the
  underlying code (`ShipStats.shield`, `PartType: 'shield'`, `RoundModifiers.playerShieldBonus`,
  etc.) keeps its current identifiers, and so do the shield-*themed* part/
  enemy/upgrade names ("Gauss shield," "Shield modulator," "Shield
  cruiser," "Deflector lattice," …) — only the STAT quantity they grant is
  relabeled ("+1 shield" → "+1 piloting"), not their flavor names.

## 29.1 Rename "Shield" → "Piloting" (display text only)

Every occurrence below is a string literal shown to the player (JSX text,
a `description`/`blurb` field, or armed-active log text) — not a code
identifier, not a code comment. Comments and internal names are
deliberately left alone; only what a player actually reads changes.

**Stat labels / readouts:**
- `src/components/PartCard.tsx:14` — `shield: 'Shield'` → `'Piloting'`.
- `src/components/StatBar.tsx:28-29` — tooltip text + the `SHD` abbreviation
  (→ something like `PLT`).
- `src/components/EnemyPanel.tsx:200-203` — "Shield {n} — needs computer
  X+ ... or shield pierce to hit..." → "Piloting {n}..." / "...or a part
  that ignores piloting...".
- `src/components/FleetOverlay.tsx:32` — "Shield {stats.shield}" →
  "Piloting {stats.shield}".
- `src/components/ShipSetupScreen.tsx:47,82` — same "Shield {n}" → "Piloting {n}".
- `src/components/Die.tsx:60` — weapon-die tooltip "pierces N shield" →
  "ignores N piloting".
- `src/components/LandingScreen.tsx:156` — "How to play — dice, computers,
  shields" → "...dice, computers, piloting" (this link's destination is
  also touched by 29.3 below).

**Part descriptions** (`src/game/parts.ts`) — names unchanged, only the
stat wording in `description`:
- `shield1`/`shield2` ("Gauss shield"/"Phase shield"): "+1 shield" / "+2
  shield" → "+1 piloting" / "+2 piloting".
- The Gauss-lance-style weapon at line 148: "ignores 2 points of enemy
  shield" → "...enemy piloting".
- "Shield capacitor": "+3 shield during the missile phase..." → "+3
  piloting during...".
- "Shield modulator": "+1 shield. Active...+2 shield." → "+1
  piloting...+2 piloting."
- "Shield harmonic": "+1 shield to every ship..." → "+1 piloting to every
  ship...".
- "Shield disruptor": "+1 shield. Active...enemy fleet's shield is reduced
  by 2." → "...enemy fleet's piloting is reduced by 2."

**Upgrades / escalations / protocols** (names unchanged):
- `src/game/upgrades.ts` — "Deflector lattice": "+1 shield" → "+1
  piloting"; "Piercing optics": "Ignores 1 point of enemy shield" →
  "...enemy piloting".
- `src/game/escalations.ts` — "Deflector refit": "+1 shield" → "+1
  piloting".
- `src/game/protocols.ts` — "Bastion doctrine": "+1 shield" → "+1
  piloting"; Alpha doctrine's cost line: "count shield 0" → "count
  piloting 0".

**Combat log text** (`src/game/combatEngine.ts`'s `useActive` armed-text,
shown to the player mid-fight) — internal field names (`playerShieldBonus`,
`enemyShieldPenalty`, etc.) stay:
- "Shield modulator armed — +2 shield for your fleet this round." → "+2
  piloting...".
- "Shield disruptor armed — the enemy fleet's shield is reduced by 2 this
  round." → "...enemy fleet's piloting is reduced by 2...".

**Enemy blurbs** (`src/game/enemies.ts`, `EnemyDef.blurb` — names like
"Shield cruiser" stay, the blurb sentences change):
- 'shield-cruiser': "Computers beat shields." → "Computers beat piloting."
- (the Void-Citadel-style entry): "Your shields don't work here." →
  "Your piloting doesn't work here."
- Two "Shields blunt high computers[.../— twice over.]" blurbs → "Piloting
  blunts high computers...".
- "...lancers that pierce your shields." → "...pierce your piloting."
- "...computer 6 — shield 5 is a statement..." → "...piloting 5 is a
  statement...".

**`TutorialOverlay.tsx`**: superseded by 29.3 below, not independently
find-replaced — its content is being restructured anyway, so the Piloting
name just gets built into the new copy from the start (see 29.3's content
outline, which keeps the on-demand full reference alive alongside the new
contextual popups).

Verification for this section: `grep -rn` for the now-stale word "shield"
restricted to quoted strings/JSX text (not comments, not identifiers)
across `src/` should come back empty except deliberately-kept part/enemy/
upgrade flavor names.

## 29.2 Roll legibility: show the computer-vs-piloting math

Root cause of the bug report: `DieRollEvent` already carries `computer`
and `shield` per roll (`src/game/types.ts`), and the engine math is
correct (verified live in the browser during the original investigation —
see the conversation this plan follows from) — but `CombatScreen.tsx`'s
`describeEvent` renders a roll as just `"{attacker} rolls {raw} — hits/
misses {target}[, for N damage]."` The numbers behind the outcome are
never shown anywhere in the UI. A working +2 computer active is
indistinguishable, from the log alone, from a dead click.

**Fix** (`describeEvent`'s `'roll'` case, `CombatScreen.tsx` — pure
presentation change, no engine/reducer touch):
- Compute `neededRoll = clamp(1, 6, 6 - event.computer + event.shield)`
  (the discrete threshold `resolver.ts`'s `resolveHit` already applies;
  this just surfaces it) and append it to the line: `"...rolls 4 (needs
  5+) — misses..."` / `"...rolls 6 (needs 5+) — hits..."` (a natural 6
  still always hits regardless of the needed number — keep that
  distinction legible too, e.g. by only showing "(needs N+)" when the roll
  wasn't a natural 6, since a natural 6's hit had nothing to do with the
  threshold).
- When `event.computer <= event.shield` (piloting fully offsets computer —
  `neededRoll` clamps to 6, i.e. only a natural 6 can ever hit), call it
  out explicitly and distinctly rather than leaving it implicit in a
  number the player has to do math on: `"...rolls 4 — misses (piloting
  nullifies your computer; only a natural 6 gets through)."` This is the
  exact case from the bug report and the one worth a plain-English
  sentence, not just a smaller number.
- Apply the same treatment to both sides' rolls (an enemy nullifying the
  player's computer is the case that matters most, but the reverse — the
  player's own piloting nullifying an attacker's computer — is equally
  worth surfacing, symmetric with how the rest of the log already treats
  both sides' rolls the same way).

Optional, smaller stretch scoped to the same milestone if it reads well
once the log-line fix is in: a `cardBadge`-style flash (the existing
per-ship "−3" / "DODGED" badge system already spawns off specific log
events) reading something like "NULLIFIED" on a defender's card when this
condition fires, mirroring how "DODGED" already works for jink. Not
required for the fix to land — the log-line change is the real fix; this
is a nice-to-have if it doesn't complicate the badge-spawn logic.

Tests: `CombatScreen`'s presentation logic isn't currently unit-tested
directly (no existing test file for it — the project's convention has
been to keep this component's rendering logic verified via live browser
passes rather than a component-test harness). Follow that precedent:
verify via a live browser pass (construct a fight via a hand-edited save,
same technique used to verify the boss re-tune and Protocols features)
rather than introducing a new test layer for one string-formatting
function. If `describeEvent`'s roll-formatting logic gets extracted to a
small pure function (recommended, so the "needs N+"/nullified logic is
directly testable), add a focused unit test file for exactly that
function.

## 29.3 Progressive first-run onboarding

Replaces "a tutorial link you have to remember to open" with three short,
contextual popups that surface themselves the first time each mechanic
actually matters, during a player's very first run only. The existing
on-demand "How to play" full reference (`TutorialOverlay`, reachable from
the landing screen and the HUD `?` button) stays — this doesn't remove a
player's ability to re-check the full math later, it just stops requiring
them to go looking for it before they've even seen why they'd need to.

**Three popups, each shown once per browser (not once per run):**

1. **"The dice roll"** — natural 6/1 rule + the `roll + Computer −
   Piloting ≥ 6` formula. Trigger: the first time `CombatScreen` ever
   mounts for this player (their very first `ENGAGE`, any fight,
   including the act-1 opener) — shown before the player interacts with
   anything, so they know what they're about to watch happen.
2. **"Missiles"** — the missile phase fires before cannons, with no
   counter-fire that phase; flak can shoot missile dice down before they
   land. New content — the current `TutorialOverlay` has no dedicated
   missile section (only a passing mention inside "HP & round structure");
   this popup is genuinely new copy, not a relocation. Trigger: the first
   time the player's own fight actually has a live missile phase
   (`hasMissilePhase(combat)` true for a fight of theirs — reuses the
   existing export from `combatEngine.ts` rather than re-deriving it).
3. **"Piloting"** (the renamed Shield section, folded into new framing —
   subtracted from the attacker's roll, but a natural 6 ignores it
   completely, so it's never a perfect wall) — trigger: the first time the
   player faces an enemy with `Piloting > 0` (`enemy.groups.some(g =>
   g.stats.shield > 0)`).

**Sequencing:** all three conditions can be independently true in the same
fight (e.g. the act-1 opener could plausibly have missiles AND a
piloting>0 enemy on a player's very first-ever combat). Show at most one
popup at a time, in the fixed priority order above (dice roll, then
missiles, then piloting) — checked again once the current popup is
dismissed, so a fight that trips two conditions shows them back-to-back
rather than stacked or silently dropping the second.

**Persistence:** a new small module, `src/onboardingProgress.ts`, mirrors
the existing `motionPreference.ts`/`soundPreference.ts` shape exactly
(module-level state seeded from `localStorage`, a subscriber set, a
`markSeen(key)` + `hasSeen(key)` pair) rather than inventing a different
pattern for the third preference-like piece of state this app persists.
Keys: `'diceRoll' | 'missiles' | 'piloting'`. Read/write failures (private
browsing, storage disabled) fail soft exactly like the two existing
modules — the popups just replay every session rather than crashing
anything.

**Where the check lives:** `CombatScreen.tsx` already receives `combat`
and `enemy` as props every render, which is everything both trigger
conditions need — a `useEffect` there (gated so it only evaluates once per
combat-mount, not every re-render) computing "first not-yet-seen,
now-applicable popup" and rendering it as a `modal-backdrop`-style overlay
(same visual language as `TutorialOverlay`) is the natural home, rather
than threading this state up through `App.tsx`.

**Content parity:** update `TutorialOverlay.tsx`'s existing "Shield"
section to "Piloting" (29.1 already covers this file, called out here only
to confirm it's in scope) and add a "Missiles" section there too, so the
on-demand full reference covers the same three topics as the new popups —
a player who dismissed a popup without reading it, or who wants to
re-check later, finds the same information in one place.

## Files touched (anticipated)

- `src/components/PartCard.tsx`, `StatBar.tsx`, `EnemyPanel.tsx`,
  `FleetOverlay.tsx`, `ShipSetupScreen.tsx`, `Die.tsx`,
  `LandingScreen.tsx` — display-text rename (29.1).
- `src/game/parts.ts`, `upgrades.ts`, `escalations.ts`, `protocols.ts`,
  `enemies.ts`, `combatEngine.ts` — description/blurb/log-text rename
  (29.1).
- `src/components/CombatScreen.tsx` — `describeEvent`'s roll case (29.2);
  the new popup-sequencing `useEffect` + overlay render (29.3).
- `src/onboardingProgress.ts` — new (29.3).
- `src/components/TutorialOverlay.tsx` — Piloting rename + new "Missiles"
  section (29.1 content, 29.3 parity).
- `src/styles.css` — whatever the new popup's markup needs (likely
  reuses `.modal-backdrop`/`.tutorial-row` almost as-is).
- Possibly a small `describeEvent`-adjacent pure-function extraction for
  the "needs N+"/nullified text, plus a unit test file for it (29.2).

## Verification

Standard bar: `tsc -b --force`, `npx vitest run`, `npx vite build`, plus a
live browser pass — construct a first fight with a hand-edited save (same
technique used for the iteration-26/28 verification passes) to confirm:
the dice-roll popup fires on first ever `ENGAGE`; a missile-phase fight
triggers the missiles popup (and not before one is actually encountered);
a piloting>0 enemy triggers the piloting popup; none of the three replay
on a second fight/second run once dismissed; the roll log correctly shows
"(needs N+)" and the nullified callout when a defender's piloting fully
offsets the attacker's computer — including a case built specifically to
reproduce the original bug report's shape (a computer-boosting active used
against a piloting stat that fully absorbs it).
