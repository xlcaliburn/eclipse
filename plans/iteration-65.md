# Iteration 65 — The commander roster rework: two generalists, two new champions (specced 2026-08-13)

> **Status: specced, not started.**
>
> **Concurrency warning**: a separate session works in this tree in real
> time (iteration 64 is theirs, as is the in-flight difficulty-curve
> work in `enemies.ts`/`difficultyCurve.ts`/`Wiki.tsx`). Re-read every
> file immediately before editing it, keep edits targeted, and never fix
> or revert a hunk you didn't write — transient compile errors in files
> you haven't touched are usually their mid-write; re-run `tsc` and check
> `git status` before reacting.

## Motivation (user direction, 2026-08-13)

The iteration-63 builds pass (alpha/speed/tank/swarm/pierce/attrition)
raised the question of whether commanders map onto builds the way Slay
the Spire characters map onto archetypes. A roster audit found: speed
and pierce have no champion, alpha's only champion is the Spymaster,
and the Merchant/Spymaster are one-note. User direction, verbatim:

> *"let's add two new commanders. i actually like merchant the way it
> is, currently the shop does have two things built more so for the
> merchant's playstyle (we could flesh it out a bit more, eg allow them
> to keep hired guns for more multiple fights incentivizing them to go
> to more shops than others. i'm actually thinking spymaster should be
> reworked to one that has a bonus for events in the same way that
> merchants has a bias towards shops. both the spymaster and the
> merchant should end up becoming more of a 'general' playstyle where
> players can go either way."*

Approved roster (7 commanders, pick screen draws 3):

| Commander | Role | Builds |
|---|---|---|
| Merchant | generalist — shop bias | any |
| Spymaster | generalist — event bias (reworked) | any |
| Engineer | champion | attrition, tank |
| Warlord | champion | tank |
| Admiral | champion | swarm, speed-lite |
| **The Corsair** (new) | champion | alpha + speed (tempo) |
| **The Breaker** (new) | champion | pierce |

The design knock-on, approved in chat: generalizing the Spymaster
orphans the alpha build (Forewarned was its champion hook), so
**Forewarned transfers to the Corsair** verbatim.

## Grounding (verified 2026-08-13; line refs approximate — re-read first)

- `commanders.ts`: `CommanderId` union, `COMMANDERS` record with
  `bullets: string[]`, `COMMANDER_IDS` shuffle pool,
  `drawCommanderChoices` (shuffle + `.slice(0, 3)` — 3-of-7 needs no
  code change, only the "3 of the 5" comment).
- Mercenaries: `PlayerShipState.mercenary?: boolean` (`types.ts:266`);
  hired in `reducer/shop.ts` `BUY_MERCENARY` (~662, fit =
  `MERCENARY_FIT`); expire in `reducer.ts`'s combat-outcome fold (~477:
  "good for exactly this one fight", silently dropped from
  `survivingFleet`, no salvage, no lost-ships entry); repairs/upgrades
  refused on mercs (~984); WARP/act transition keeps mercs (~1494).
- Spymaster hooks today: vision (`visionStep`, `reducer.ts:565` — keep),
  free intel (`grantCommanderIntel` + the whole "Intelligence" section
  `reducer.ts:~570-646`, granted at ~1333, displayed via
  `intelText` — **remove entirely**, see 65.3), heat-free salvage claims
  (`events.ts:1179-1191` — generalize), 3 CP + `exploitEnabled`
  (`reducer.ts:~1053` / `combatEngine.ts:149` — keep), Forewarned
  (`CombatState.openingComputerBonus`, set from
  `CombatOrderOptions.openingComputerBonus` at `initCombat:856`, derived
  from commanderId in reducer's ENGAGE — **transfer to Corsair**).
- `events.ts`: `resolveEventChoice(eventId, choiceIndex, state, rng,
  {shipIndex, partId}): EventResolution` is pure (912-935); the reducer's
  `EVENT_CHOOSE` (~1632) draws `runRng(state)` and only commits
  `nextCounter()` on dispatch — so an outcome can be **previewed** by
  running the same call and discarding it: same seed + counter ⇒
  identical result to the eventual dispatch. `addHeat` appears at 8
  effect sites: positive deltas at 1182, 1190, 1203, 1254, 1267, 1418;
  **negative (heat-reducing) deltas at 1452 and 1463 — these must NOT
  be suppressed** by the new never-costs-heat rule.
- Fleet-stat commander folds (the pattern both new champions reuse):
  `ship.ts` `withAceBonus` (~204, `commanderId === 'admiral'`) inside
  `deriveFleetStats` (~243), shared with `deriveFleetForCombat` (~263
  comment). The engine already consumes `ship.stats.shieldPierce` in
  `fireShip`'s `effectiveShield` (`combatEngine.ts:526-529`) — so the
  Breaker's pierce perk is a stats fold, **zero engine change**.
- Signature stock: `SIGNATURE_PART` / `SIGNATURE_SLOT` /
  `SIGNATURE_DISCOUNT` (`reducer/shop.ts:291-310`); offer layout is 3
  weapon (slots 0-2) / 3 defense / 1 computer-drive / 1 active.
- `CommanderCrest.tsx`: one SVG per commander keyed off commanderId.
- Wiki: `BUILD_INFO.alpha.pairing` names "the Spymaster's Forewarned"
  and `.speed.pairing` names hulls/Ace pipeline (`Wiki.tsx:~249-280`) —
  both need updating; the Commanders section renders name + description
  + full `bullets` (added 2026-08-13), all data-driven — no wiki content
  to hand-write beyond the pairing strings.
- Sim: `scripts/sim/agent.ts` `COMMANDER_ROUTE_BIAS` (~214) per-node-type
  route weights; `commanderChoices` is seeded so a requested commander
  not offered ⇒ skipped run (~117-121). `scripts/sim/stats.ts`/`table.ts`
  render per-commander rows; `baseline.json` exists for gates.
- `persistence.ts`: `SAVE_VERSION = 9`.

## 65.1 Roster surgery (`commanders.ts`)

- `CommanderId` grows: `... | 'corsair' | 'breaker'`. `COMMANDER_IDS`
  lists all 7; `drawCommanderChoices` unchanged (now 3-of-7 — update the
  stale "3 of the 5" comment).
- Kits below are authoritative for `COMMANDERS` entries (descriptions:
  match the existing one-sentence flavor voice; bullets: exact
  mechanics, ≤4 per commander — the roster's new discipline). Where a
  bullet names a part, use the part's real display name from
  `parts.ts` (`getPart('homing').name`, `getPart('lance').name`) — do
  not trust the names written here.

### The Merchant (unchanged + one enriched bullet)

1. Cargo costs 3cr instead of 4cr
2. Mercenary hires cost 3cr instead of 5cr — **and stay for 3 fights
   instead of 1** (new, see 65.2)
3. +1 credit on every fight won

### The Spymaster (reworked — the event generalist)

Description rework: drop "every wreck along the way is free money"
(that was the free-intel line); the new identity is *knowing what's
behind every door* — vision, foreknowledge, and clean hands.

1. Sees 2 columns ahead on the map instead of 1 (kept)
2. **Foreknowledge: risky event options reveal their outcome before you
   commit** (new, see 65.3)
3. **Event choices never raise heat** (generalizes the salvage-claims
   perk, see 65.3)
4. 3 command points per fight instead of 2, and unlocks the Exploit
   weakness order (kept, folded into one bullet)

Removed: free intel after every fight won (the whole feature, see
65.3); Forewarned (→ Corsair, see 65.4).

### The Corsair (new — tempo champion: alpha + speed)

Flavor direction: a raider who wins the fight in the first exchange.

1. +1 initiative on every ship in the fleet
2. Forewarned: +1 computer for the whole fleet during the missile phase
   and the first cannon round (transferred verbatim from the Spymaster)
3. [Homing array] always in stock at shops, 2cr off (signature part)

### The Breaker (new — pierce champion)

Flavor direction: armor means nothing; every hull opens eventually.

1. Enemy piloting counts as 1 lower against your whole fleet
2. [Lance] always in stock at shops, 2cr off (signature part)
3. +1 credit for every enemy ship destroyed

Judgment call, recorded: the Breaker's third perk was left open in the
approved proposal ("kill bounty vs a hull discount"); kill bounty wins
because a Dreadnought discount would overlap the Warlord's and a bounty
pairs with pierce's reliable-damage identity. One-line revert if the
user disagrees.

## 65.2 Merchant — mercenaries persist 3 fights

Replace `PlayerShipState.mercenary?: boolean` with
`mercenaryFightsLeft?: number` (presence ⇒ this ship is a mercenary).
Add an exported helper `isMercenary(ship)` next to the type (or in
`ship.ts` — wherever avoids an import cycle) and sweep EVERY
`.mercenary` read through it: reducer ~477/~481 (combat-outcome fold),
~984/~989 (repair/upgrade refusal), ~1494/~1496 (WARP), `shop.ts`
~539/~681, plus any UI reads (FleetPanel/FleetOverlay badge — grep
`mercenary` across `src/`).

- `BUY_MERCENARY` sets `mercenaryFightsLeft: commanderId === 'merchant'
  ? MERCHANT_MERC_FIGHTS : 1` with `export const MERCHANT_MERC_FIGHTS =
  3` beside the other Merchant constants in `shop.ts`.
- Combat-outcome fold (reducer ~477): a surviving merc with
  `mercenaryFightsLeft > 1` now stays in `survivingFleet` with the
  counter decremented (damage persists like any ship — it fought, it's
  dented); at 1, it leaves exactly as today (no salvage, no lost-ships
  entry). A destroyed merc is simply gone either way, as today.
- Post-fight healing (Engineer / Regenerative plating) applies to a
  persisting merc like any surviving ship — no special-casing; the
  existing per-ship heal path just sees one more ship.
- Repairs/upgrades/marks stay refused on mercs (the ~984 guard's
  comment needs its "after one fight" wording updated, not its logic —
  a 3-fight rental is still a rental).
- UI: the mercenary badge (grep for where "Mercenary"/"Hired" renders)
  shows fights remaining when > 1 — e.g. "Hired — 2 fights left".
  Keep it to the existing badge, no new surface.

## 65.3 Spymaster rework

### Remove the free-intel feature entirely

`grantCommanderIntel` and the whole "Intelligence" section
(`reducer.ts:~570-646`), the grant site (~1333-1348), the `intelText`
field (`types.ts:429`) and its display surface (grep `intelText` —
RewardScreen or wherever it renders), and their tests. `visionStep`
(2-column vision) is separate machinery and stays. If `persistence.ts`
mirrors `intelText`, drop it there too (the SAVE_VERSION bump in 65.6
covers the shape change regardless).

### Events never raise heat

In `resolveEventChoice`, add one helper:

```ts
// Spymaster: event choices never RAISE heat (reductions still apply).
function eventHeat(state: RunState, delta: number): number {
  if (delta > 0 && state.commanderId === 'spymaster') return state.heat;
  return addHeat(state.heat, delta);
}
```

Sweep the positive `addHeat` sites (1182, 1190, 1203, 1254, 1267, 1418)
through it; the two negative sites (1452, 1463 — heat *reductions*)
must keep calling `addHeat` unconditionally. The salvage-claim options'
existing bespoke spymaster branching (1179-1191, including its
outcomeText fork) collapses into this helper — keep the spymaster
flavor text if it reads well, but one mechanism.

### Foreknowledge — risky options show their outcome

New selector in `reducer.ts` (NOT events.ts — it needs `runRng`, and
events.ts importing reducer would cycle):

```ts
// Spymaster Foreknowledge: what WOULD this option do? Pure preview —
// runs resolveEventChoice against the same rng the dispatch would use
// (runRng does not advance state.rngCounter until a dispatch commits
// nextCounter()), so the preview is exactly the outcome the player
// gets if they commit. Returns null when there is nothing to show.
export function previewEventOutcome(
  state: RunState,
  choiceIndex: number,
  opts: { shipIndex?: number; partId?: PartId } = {},
): string | null
```

Guards mirror `EVENT_CHOOSE` exactly (phase, unresolved, option exists,
requirement met); for `chooseShip`/`choosePart` options return null
until `opts` carries a selection. Return the resolution's
`outcomeText`.

UI (`EventScreen.tsx`): when `commanderId === 'spymaster'`, render the
preview under each enabled option — small, dim, prefixed so it reads as
espionage, e.g. `Foreknowledge: {text}`. For chooseShip/choosePart
options, the preview appears once the screen's existing ship/part
picker has a selection (re-derive per selection — outcomes can depend
on the chosen ship). No preview for other commanders, no layout
rework — a one-line addendum per option.

Correctness pin (test, 65.7): for a seeded event state, the previewed
text for option N must equal `currentEvent.outcomeText` after actually
dispatching `EVENT_CHOOSE` with N. This is the whole feature's
contract; if a future event resolution ever draws rng differently in
preview vs dispatch, this test is what catches it.

### Forewarned + intel bullets leave the select screen

Covered by the kit in 65.1 — `commanders.ts` bullets are the display.
Sweep any other surface that attributes Forewarned to the Spymaster:
`combatEngine.ts` comments (149, 156, 788, 913 mention "Spymaster
Forewarned" — update the attribution), any combat-log or HUD copy
(grep `Forewarned` across `src/`), and `BUILD_INFO.alpha.pairing` in
`Wiki.tsx` (see 65.5).

## 65.4 The Corsair — engine wiring

- **+1 fleet initiative**: fold in `deriveFleetStats`'s shared per-ship
  path (same spot as `withAceBonus` / the iteration-63 auras — verify
  `deriveFleetForCombat` shares it, per the ~263 comment):
  `commanderId === 'corsair'` ⇒ `initiative + 1` on every ship. It must
  reach `qualifiesForOutspeed` for free (test pins it, same as
  63.6's Vector sync test).
- **Forewarned**: in reducer's ENGAGE (and any other `initCombat` call
  site that passes `CombatOrderOptions` — grep `openingComputerBonus`),
  the commanderId that derives `openingComputerBonus: 1` flips
  `'spymaster'` → `'corsair'`. `exploitEnabled` stays spymaster-only.
  The combat-log/telegraph copy already reads the number, not the
  commander — verify no hardcoded "Spymaster" string in the round-1
  announcement.
- **Signature part**: `SIGNATURE_PART.corsair = 'homing'`,
  `SIGNATURE_SLOT.corsair = 1` (a weapon slot; warlord holds 0 — only
  one commander is active per run so collisions are impossible, distinct
  indices are just tidiness).
- Crest (`CommanderCrest.tsx`): new SVG — swept-wing / forward-arrow
  motif (speed), same stroke style and palette hooks as the existing
  five.

## 65.5 The Breaker — engine wiring

- **Enemy piloting −1**: fold in the same `deriveFleetStats` shared
  path: `commanderId === 'breaker'` ⇒ `shieldPierce: (stats.shieldPierce
  ?? 0) + 1` on every player ship. `fireShip` already subtracts
  `ship.stats.shieldPierce` from the target's shield
  (`combatEngine.ts:528`), floored at 0 — **zero engine change**, and it
  stacks with weapon-level pierce exactly like the existing part-level
  pierce does. Enemy fleets derive without a commanderId, so it is
  player-only by construction.
- **Kill bounty**: +1cr per destroyed enemy ship, credited where the
  Merchant's +1cr-per-win already lands in the combat-resolution path
  (grep for the merchant win-credit in reducer's CONTINUE fold) — count
  destroyed ships from the same per-ship outcome the fold already
  walks. Applies on any combat resolution (a loss that took two enemies
  down still pays 2cr — the bounty is per kill, not per win).
- **Signature part**: `SIGNATURE_PART.breaker = 'lance'`,
  `SIGNATURE_SLOT.breaker = 2` (weapon slot).
- Crest: cracked-shield / wedge-splitting-a-ring motif.
- Wiki `BUILD_INFO` pairing strings (`Wiki.tsx` ~249): `alpha.pairing`
  replaces "the Spymaster's Forewarned" with the Corsair; `speed.pairing`
  adds the Corsair; `pierce.pairing` replaces "Any weapon-heavy hull"
  with the Breaker + weapon-heavy hulls. Keep them one clause each.

## 65.6 Persistence

- `SAVE_VERSION` 9 → 10. Two shape changes force it regardless of
  validator tolerance: `mercenary: boolean` → `mercenaryFightsLeft:
  number` (a v9 merc would load as a permanent free ship — the exact
  hazard class the version gate exists for), and the `intelText`
  removal. The bump also moots any mid-run spymaster-semantics
  migration questions — old saves are simply invalid.
- `commanderId` validation (if persistence enumerates the union) learns
  the two new ids.

## 65.7 Sim (`scripts/sim/`)

- `COMMANDER_ROUTE_BIAS`: spymaster gains an event-node bias (mirror
  the magnitude of whatever merchant's shop bias is — read it, don't
  guess); corsair/breaker get no route bias (their perks are
  route-neutral).
- Agent liveness: the new commanders must survive full runs with zero
  `rejectedDispatch` (the reducer perks are all passive, so the
  existing generic policy should just work — the smoke test in
  `agent.test.ts` extends its archetype/commander matrix to cover both
  new ids).
- `runSim`/stats/table: the per-commander loop picks up the new ids
  from wherever it sources the list (verify it reads `COMMANDER_IDS`
  or extend its literal list); n=500 rows grow 6 → 8 (auto + 7).
  Foreknowledge/preview is UI-only and invisible to the sim; merc
  persistence and the Corsair/Breaker stat folds DO move sim outcomes.
- `baseline.json` / gates: check whether gates diff per-commander rows;
  if so, regenerate the baseline as part of the measurement step and
  say so in status notes.

## 65.8 Tests

- `commanders.test.ts`: 7 ids; `drawCommanderChoices` returns 3
  distinct; every kit has ≤4 bullets (pin the new discipline).
- Mercs (reducer tests): non-merchant hire still leaves after 1 fight;
  merchant hire survives 2 resolutions with the counter walking 3→2→1
  and leaves after the 3rd; a destroyed merc is gone mid-contract;
  repair/upgrade refusal unchanged; WARP keeps a mid-contract merc.
- Spymaster: each positive-heat event site is heat-free for spymaster
  and unchanged for others; the negative sites (1452/1463) still reduce
  heat FOR the spymaster (regression-pin the delta>0 guard); intel is
  gone (no `intelText` on a spymaster win).
- Foreknowledge: the preview-equals-dispatch parity pin (65.3);
  preview returns null for unmet requirements and for
  chooseShip options with no selection; `state.rngCounter` unchanged
  by preview.
- Corsair: fleet stats +1 initiative (and reaches
  `qualifiesForOutspeed`); ENGAGE sets `openingComputerBonus: 1` for
  corsair and 0 for spymaster now; `exploitEnabled` still
  spymaster-only.
- Breaker: fleet stats +1 shieldPierce; an engine fixture shows
  `effectiveShield` down 1 vs the same fight without the commander;
  kill bounty pays per destroyed enemy ship.
- Signature stock: corsair/breaker offers always contain their part at
  the discounted price (mirror the existing signature tests).

## 65.9 Measurement

`npm run balance` (fixture matchups — expect: byte-identical, fixtures
carry no commanderId) and `npm run balance:full` (n=500/commander)
before/after, report-only. Expected movement: merchant up a little
(3-fight mercs are a real buff), spymaster mixed (loses Forewarned,
gains heat-freedom the sim may not exploit), corsair/breaker land
somewhere sane against the existing spread. No tuning in this
iteration — record the table and stop. Note in status notes whether
the sim's generic policy visibly under-uses Foreknowledge (it will —
it's UI-only) so the row isn't over-read.

## Verification bar

`npx tsc -b --force` clean; `npx vitest run` green; `npx vite build`
clean; sim smoke (`agent.test.ts`) zero rejectedDispatch including the
two new commanders. General UI (select screen, event screen, wiki,
fleet badges) — no live browser pass per standing policy; nothing here
is mobile-specific.

## Open questions / parked

- The 2026-08-13 select-screen trim (top-3 bullets for
  Warlord/Admiral, removing the starting-ship section) was proposed
  separately and is NOT part of this spec — the Spymaster rework and
  the ≤4-bullet kit discipline land here, the rest still awaits the
  user's call.
- Merc repairs stay blocked for a 3-fight contract (recorded above);
  if playtests say a dented merc feels bad, a paid "re-arm" at shops is
  the natural follow-up, not a change here.
- The Breaker kill bounty vs hull-discount judgment call (65.1) — one
  line to swap if disliked.
