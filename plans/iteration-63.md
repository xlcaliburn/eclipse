# Iteration 63 — The synergy pass: legendaries everywhere, honest actives, six named builds, restrictive hulls

> **Status: implemented and verified (2026-08-13).** `npx tsc -b --force`
> clean project-wide, `npx vitest run` 943/944 green (the one failure is
> `difficultyCurve.test.ts`, a file/gate the concurrent session is
> actively mid-tuning — confirmed unrelated: it never reads
> `FRAMES`/`slotLayout`/frame power, and it improved 2→1 failures on its
> own mid-session while untouched by this work), `npx vite build` clean.
> Staged balance measurement (63.5): **stage (a) — parts/valuation
> (63.1–63.3) — is measurably byte-identical to the true pre-63 baseline**
> across every commander (confirmed by an isolated true-baseline re-run,
> not just inference); **all movement comes from stage (b), layouts
> (63.4)**, and it's small — merchant −0.6pp, spymaster −0.2pp, everyone
> else 0pp. No loosen trigger fires. Full tables and the reasoning are in
> the status notes at the end of this file.

## Implementer's summary

Implemented directly in this session (no sub-agent dispatch). All four
asks landed as specced, with a handful of grounded judgment calls (Sloop's
price was already bumped by a concurrent commit for the same reason this
spec asked for — left alone rather than double-priced; a persistent
per-combat flak pool had to be added to make Reload drones' flak
interaction correct rather than just "automatic" as originally assumed —
see the deviations section). See the full status notes at the end of this
file for the file-by-file breakdown, the balance tables, and every
deviation from the spec's literal text.

## Motivation (user direction, 2026-08-12, all four approved in chat)

1. *"each category should have at least 1 legendary"*
2. *"computers are currently oddly valued, target uplink is a +1 with a 1
   turn +2 bonus, making it way worse than gluon computer which is +3 all
   the time."*
3. Distinct playstyles with visible synergy — driven by player feedback:
   *"I think one thing all the good ones (slay the spire, ftl, etc) is an
   obvious synergy between the equipment or items you gather along the
   run... I don't understand how my choices affect the outcome of the
   battles. i feel like I'm just picking a path and praying lol"*
4. *"hulls especially starting tiers should be much more restrictive in
   general. universal slots should be treated as premium, and should be
   the minority in most cases. flag ship should be no exception, it should
   also have at least 1 defense and 1 system slot mandatory"*

Approved decision points: Sloop keeps `U U U` as the roster's one
flex-identity exception (repriced up); Reload drones (the missile-build
enabler, the one non-trivial engine hook) is IN; build-tag chips are IN.

## Grounding (audited 2026-08-12 against the committed tree)

- `src/game/parts.ts`: `PART_DEFS` → `PARTS` (power derived), `PartId`
  union, the 3cr/damage weapon anchor comment, `STARTING_LOADOUT =
  ['ion','ion','comp1','injector']`. Category × rarity census: weapons
  have 2 legendaries (antimatter, railgun), shield/piloting 1
  (shieldharmonic), reactor 1 (reactor4); **computer, hull, and drive
  have zero** (the Ancient artifact is legendary computer-type but
  quest-only, outside `PARTS`).
- The epic-active family, all `+1 base stat + once-per-combat button`:
  uplink2/override/tacrelay/ecm (+1 computer, 8cr), modulator/chaff/
  disruptor (+1 piloting, 7-8cr), dcbay/repairbay (+1 HP, 7-8cr) — each
  priced at or near its category's +3 flat epic (comp3/shield3/hull3,
  9cr). Rare actives: injector (+1 HP, 5cr), thrusters (+1 init, 6cr).
- `src/game/ship.ts`: `fleetShieldAuraBonus` — sums `Part.fleetShieldAura`
  across the whole fleet at derive time, applied to every ship, NOT
  removed if the carrier dies mid-fight (documented trade, iteration 23).
  The two new auras follow this exact pattern.
- `src/game/frames.ts`: current `slotLayout` per frame (see 63.4's table
  for the full before/after). `Frame.power` = slots + tierIndex (58.1) —
  **layout KIND changes don't move slot counts, so no power value
  changes anywhere in this iteration.**
- Slot rules (52.1): weapon→W, shield/hull→D, computer/drive→S,
  reactor→S (58.2), cargo→U only; overflow spills into universal;
  weapon ceiling = `count(W) + count(U)`. Every frame keeps ≥1 universal
  (Bastion the documented exception). Marks (59) add universal slots.
- `drawShopOffers` strata filter by `Part.type`, so new parts join their
  pools automatically (computer/drive/reactor → systems stratum,
  hull/shield → defense, weapon → weapon).
- SAVE_VERSION precedent: 52.1 bumped it for layout changes because an
  existing save can hold a loadout legal under old layouts and illegal
  under new ones, stranding EQUIP/UNEQUIP. **63.4 has the same hazard —
  bump SAVE_VERSION once for this iteration.**
- Baseline for measurement: iteration 62's recorded `balance:full` table
  (in `plans/iteration-62.md`'s status notes) — the latest authoritative
  numbers.
- Concurrency: a separate session works in this tree (it landed
  iteration 56 mid-conversation; `plans/iteration-55.md` is dirty).
  Re-read files immediately before editing; never revert others' work.

## 63.1 Three new legendaries — every category covered

| id | Name | Category | Effect | Cost | Engine |
|---|---|---|---|---|---|
| `commandmatrix` | Command matrix | computer | +2 computer; while equipped, +1 computer to every ship in the fleet | 13cr | new `Part.fleetComputerAura` + derive fold-in |
| `vectorsync` | Vector sync array | drive | +2 initiative; while equipped, +1 initiative to every ship in the fleet | 12cr | new `Part.fleetInitAura` + derive fold-in |
| `citadelplating` | Citadel plating | hull | +4 HP, +2 ablative each combat | 13cr | **zero** — both fields exist |

- The two auras copy `fleetShieldAura`'s exact shape: summed across the
  fleet at derive time (`ship.ts`, next to `fleetShieldAuraBonus` —
  consider generalizing the three into one aura summer rather than three
  near-identical functions), applied to every ship including the carrier,
  stacking if multiple are carried, deliberately NOT removed if the
  carrier dies mid-fight (same documented trade as iteration 23's
  harmonic — restate it in the comment).
- **The init aura must flow through derived stats** so Outspeed
  qualification, activation order, and every UI readout pick it up
  automatically — folding in at fleet-derive time (like the ace bonus)
  gives this for free; do NOT special-case the combat engine.
- Command matrix priced highest deliberately: computer is the strongest
  stat per point (iteration 26/31's boss-tuning findings), and a
  fleet-wide computer aura scales with fleet size.
- All three are ordinary `PARTS` members: shop-drawn (their type routes
  them to the right stratum automatically), sellable, salvageable. Add
  ids to the `PartId` union.
- Resulting legendary census: weapons 2, piloting 1, computer 1, drive 1,
  hull 1, reactor 1 — every category ≥1. Legendary pool grows 4 → 7 at
  unchanged 2% draw odds (each individual legendary gets rarer —
  intended; note it, don't touch weights).

## 63.2 The active-part valuation rule

New anchor, recorded as a comment in `parts.ts` next to the 3cr/damage
weapon anchor: **an epic active carries +2 of its base stat; a rare
active carries +1 — the once-per-combat button is worth roughly one flat
stat point.** (Today every epic active carries +1, making comp3/shield3/
hull3 strictly better buys — the user's Targeting-uplink-vs-Gluon
report, which generalizes to all nine.)

Changes (base stat only; costs, actives, rarities unchanged):

| Part | Base stat now → new |
|---|---|
| uplink2 (Targeting uplink) | +1 → **+2 computer** |
| override (Fire-control override) | +1 → **+2 computer** |
| tacrelay (Tactical relay) | +1 → **+2 computer** |
| ecm (ECM pod) | +1 → **+2 computer** |
| modulator (Piloting modulator) | +1 → **+2 piloting** |
| chaff (Chaff launcher) | +1 → **+2 piloting** |
| disruptor (Evasion suite) | +1 → **+2 piloting** |
| dcbay (Damage control bay) | +1 → **+2 HP** |
| repairbay (Repair drone bay) | +1 → **+2 HP** |

Rare actives (injector +1 HP, thrusters +1 init) stay as-is — already
fair against the +2 rare flat items. Update each description's leading
stat text. Balance fixtures that equip any of these nine will move the
`npm run balance` matchup table — expected, record before/after.

## 63.3 Six named builds: one enabler, one ladder rung, and visible tags

### New parts

| id | Name | Rarity | Type | Effect | Cost | Engine |
|---|---|---|---|---|---|---|
| `reloaddrones` | Reload drones | epic | hull | +2 HP (per 63.2's rule). Active (1/combat): this round, at the end of the round, every one of your ships fires its missile weapons once more | 8cr | **medium** — a missiles-only bonus activation at end of round, parallel to Outspeed's existing cannons-only bonus-activation machinery; implement as a round modifier armed by the active |
| `ablativemesh` | Ablative mesh | epic | hull | +4 ablative each combat | 8cr | zero |

Reload drones notes: the natural play is arming it round 1 (missiles
normally fire only in the opening volley), but it works any round — no
special-casing. Enemy flak still draws from the same per-combat
`flakState` pool against the extra volley (automatic; pin with a test).
Ablative mesh forms a ladder with Ablative coating (rare, +2, 5cr) —
epic +4 at 8cr, priced on the rare→epic stat-ladder gap; it must NOT
price-dominate the coating.

### Build tags (the visibility half — this is what the player quote is about)

New optional field on `Part`:

```ts
export type BuildTag = 'alpha' | 'speed' | 'tank' | 'swarm' | 'pierce' | 'attrition';
// on Part: buildTags?: BuildTag[];  // max 2 per part
```

Assignments (max 2 tags per part; untagged parts are generically good —
that's fine, don't force-tag everything):

- **alpha** (win the opening volley): light-missile, missile, torpedo,
  clustermissile, homing, reloaddrones, override (its reroll covers the
  volley)
- **speed** (deny return fire via Outspeed): init1, init2, init3,
  thrusters, vectorsync
- **tank** (one ship soaks everything): shield1, shield2, shield3, lure,
  reactive, ablative, ablativemesh, citadelplating, capacitor, hull3
- **swarm** (value scales with fleet size): shieldharmonic,
  commandmatrix, vectorsync, arc, tacrelay
- **pierce** (beat piloting stacks): lance, railgun, ecm, executioner
- **attrition** (guaranteed chip + repairs): gravitonbeam, flechette,
  arc, dcbay, repairbay, injector

(arc and vectorsync legitimately carry 2 tags; nothing carries 3.)

UI: a small tag chip row on `PartCard` (shop offers, inventory, reward
cards all render through it) — one word per chip, subtle, colorblind-safe
(text, not color-only). Adapt to whatever PartCard looks like when you
start (the concurrent session touches UI). Add the chip legend once in
the wiki, not on every card.

Wiki: a new **"Builds"** section (+ nav entry, after Additional rules):
six short entries — name, one-sentence game plan, key parts (rendered
data-driven from `buildTags` so the list can't drift), and the natural
hull/commander pairings as prose (alpha ↔ Gunboat/Frigate + Spymaster's
Forewarned; speed ↔ Interceptor/Destroyer/Valkyrie + Ace pipeline; tank
↔ Bastion/Aegis + Warlord + marks; swarm ↔ Admiral + cheap commons;
pierce/attrition ↔ any hull, Engineer favors attrition).

## 63.4 Restrictive layouts — universal as the premium minority

Every changed frame, with starting-fit legality pre-checked (61.3's fits:
ion everywhere except Interceptor/Destroyer/Valkyrie carrying
light-missile):

| Frame | Now | New | Fit check |
|---|---|---|---|
| Flagship (`cruiser`) | `W W U U U U` | **`W W D S U U`** | STARTING_LOADOUT: ion,ion→W,W; comp1→S; injector (hull type)→D ✓. The heaviest balance fixture (plasma, plasma, comp3, hull2, init3, shield1) also fits: W,W + S(comp3) + D(hull2) + U(init3) + U(shield1) ✓ — no fixture rewrite |
| Derelict | `U U` | **`W U`** | ion→W ✓ |
| Corvette | `U U S` | **`D S U`** | ion→U ✓ |
| Sloop (`tender`) | `U U U` | **unchanged** — THE flex exception; cost 9 → **10cr** | — |
| Freighter | `W U U U S` | **`W D S U U`** | ion→W ✓ |
| Cruiser (`light-cruiser`) | `W W U U` | **`W W D U`** | ion→W, shield1→D ✓ |
| Destroyer | `W W S U U` | **`W W S S U`** | light-missile→W ✓ |
| Valkyrie | `W W W S U U` | **`W W W S S U`** | light-missile→W ✓ |
| Aegis | `D D D W U U S` | **`D D D W S S U`** | ion→W, shield1→D ✓ |
| Titan | `W W W W D D U U U` | **`W W W W D D S U U`** | ion,ion→W; shield1→D ✓ |

Unchanged (already ≤⅓ universal): Interceptor `W S U`, Frigate `W W U`,
Picket `S S U`, Bastion `W D D`, Disruptor `S S D U`, Gunboat `W W W U`,
Battleship `W W W D D U`, Dreadnought `W W W W D D U U`.

Invariants and knock-ons:

- **≥1 universal everywhere** (cargo-lot invariant) holds in every new
  layout; Bastion stays the one documented zero-universal exception.
- **Power values change nowhere** — slot counts are identical, only
  kinds changed; the 58.1 formula test must pass untouched.
- **Weapon ceilings drop** wherever U count fell (Flagship 6 → 4, Sloop
  stays 3, Freighter 4 → 3, …) — update any test asserting the old
  ceilings; this is intended (all-weapon stuffing was exactly the
  non-build the restrictive pass is against).
- **Systems slots become contested** (computer vs drive vs reactor) —
  the intended 58 interplay; Destroyer/Valkyrie gaining a second S is
  deliberate speed-build support.
- **Marks become the only way to buy a universal slot** — exactly what
  "universal is premium" should mean; note it in the marks comment.
- **SAVE_VERSION bump** (the 52.1 precedent): an old save's loadout can
  be illegal under the new layouts.
- **Fixture audit, 52.6-style**: hand-built `PlayerShipState` fixtures
  are inert unless an EQUIP/BUY_SHIP exercises them — audit the ones
  that are exercised; `scripts/sim` builds everything through `canEquip`
  so it adapts, but run the agent sim smoke (`scripts/sim/agent.test.ts`)
  and check zero `rejectedDispatch` before the full measurement.
  `policy.ts` `partPriority` lists may under-build on hulls that lost
  universal room (e.g. comp-heavy lists on the Flagship) — check, and
  record any reordering as a deviation.

## 63.5 Staged measurement

Two attributable stages (52.7 discipline):

**(a) Parts + valuation (63.1–63.3).** Net buff (nine actives get +1
stat; new parts widen the pool). `npm run balance` (fixtures using the
nine actives WILL move — record per matchup) + `npm run balance:full`
vs iteration 62's table.

**(b) Layouts (63.4).** The risky half — a real flexibility nerf.
Measure again. Loosen trigger: any commander >2pp below the stage-(a)
figure or under ~7% act-1 clear; first lever is reverting a specific
frame's layout toward one more U (record which), NOT touching the new
parts.

`npx tsx scripts/enemyValue.ts` recorded per convention at the end.

## 63.6 Tests

- Aura fold-ins: computer/init auras reach every ship (carrier included),
  stack across multiple carriers, and the init aura moves Outspeed
  qualification + activation order (assert via a fleet that crosses the
  ≥4 gap only with the aura).
- Table-driven: every epic active's base stat is exactly 2; both rare
  actives stay 1 (pins 63.2's rule against future drift).
- Reload drones: missiles refire at end of the armed round, cannons
  don't, once per combat, enemy flak still cancels dice from the extra
  volley.
- Citadel plating / Ablative mesh: fields land in derived stats;
  ablative still doesn't persist between fights.
- Build tags: every tag has ≥2 members, no part has >2 tags, every
  tagged id exists (table-driven over `PARTS`).
- Layouts: every new layout keeps ≥1 U (Bastion excepted); every
  STARTING_FIT and STARTING_LOADOUT legal against the new layouts
  (existing guard test — it must pass WITHOUT fit changes); power
  unchanged for all 18 frames; updated weapon ceilings (Flagship 4).
- Legendary census: table-driven — every `PartType` except `cargo` has
  ≥1 legendary in `PARTS`.

## 63.7 Verification bar

`npx tsc -b --force` clean project-wide, `npx vitest run` green (report
count; 883+ as of iteration 62 — re-read the actual number at HEAD),
`npx vite build` clean, both 63.5 measurement stages recorded, agent sim
smoke clean. No browser passes (CLAUDE.md). Do not commit or push.

## Open questions / recorded judgment calls

1. Reload drones' exact trigger timing (end of armed round) is the
   simplest honest reading — if the engine's activation machinery makes
   "immediately after the missile phase" cleaner, that's acceptable;
   record the choice.
2. Tag chip visual treatment is implementer's judgment against the
   current (moving) PartCard — the requirement is legible + not
   color-only, nothing more specific.
3. If stage (b)'s dip concentrates on one commander, prefer the
   per-frame layout revert lever over global loosening.

## Status notes (implementer, 2026-08-13)

### Summary

Implemented directly in the main conversation (no sub-agent dispatch),
in the order the spec lays out: 63.1 (parts + auras) → 63.2 (active
reprice) → 63.3 (Reload drones + build tags) → 63.4 (layouts +
SAVE_VERSION) → UI (PartCard chips, wiki Builds section) → tests (63.6)
→ staged measurement (63.5). `npx tsc -b --force` clean at every
checkpoint; `npx vitest run` **943/944 green** (up from 915 pre-63 — 28
new tests; the one remaining failure, `difficultyCurve.test.ts`'s T2
act-1 slope gate, is the concurrent session's own in-progress tuning
work — verified unrelated by inspection: that file/gate never imports
`FRAMES` or reads `slotLayout`/frame `power`, and its failure count
dropped from 2→1 mid-session while completely untouched by this work);
`npx vite build` clean.

### Files changed

Core: `src/game/types.ts` (`BuildTag` type, `Part.buildTags`/
`fleetComputerAura`/`fleetInitAura`), `src/game/parts.ts` (`PartId`
union +5, 9 actives repriced +1 base stat with a new anchor comment, 5
new parts: `commandmatrix`/`vectorsync`/`citadelplating`/`reloaddrones`/
`ablativemesh`, `buildTags` added across ~35 existing parts),
`src/game/ship.ts` (`fleetShieldAuraBonus` generalized into
`fleetAuraBonus(fleet, field)`, reused for all three auras;
`deriveFleetStats` folds in the computer/init auras alongside the
existing shield one), `src/game/combatEngine.ts` (`RoundModifiers.
reloadDronesArmed`; `CombatState.flakRemaining` — see the deviation
below for why this was necessary; `useActive`'s `'reloaddrones'` case;
`advanceRound`'s new missile-refire block, placed after Outspeed and
before the stalemate check, same reasoning as Outspeed's own comment),
`src/game/frames.ts` (9 frame `slotLayout`s rewritten: cruiser,
light-cruiser, freighter, derelict, corvette, aegis, destroyer,
valkyrie, titan — each with an inline comment recording the old layout
and the starting-fit fit-check; Sloop's comment updated to record it as
the deliberate, already-priced exception rather than an oversight),
`src/game/persistence.ts` (`SAVE_VERSION` 8 → 9, for both the layout
hazard and `CombatState.flakRemaining` becoming a new always-read
field).

UI: `src/components/PartCard.tsx` (`BUILD_TAG_LABEL`, a
`.part-card__tags` chip row, rendered only when a part has tags),
`src/styles.css` (`.part-card__tags`/`.part-card__tag` — text chips, not
color-only, per the spec's colorblind-safe requirement), `src/wiki/
Wiki.tsx` (`BUILD_INFO`/`BUILD_TAG_ORDER`, a new "Builds" section between
Parts and Hulls with a nav entry — each build's part list renders FROM
`Part.buildTags`, not a second hand-typed id list).

Tests: `src/game/ship.test.ts` (+23: fleet computer/init aura fold-ins
incl. Outspeed qualification, the 63.2 active-stat table check, the
63.1 legendary-census + new-legendary-shape checks, Citadel
plating/Ablative mesh landing in `deriveStats`, the 63.3 build-tag
table checks, the 63.4 layout/universal-count/weapon-ceiling checks),
`src/game/combatEngine.test.ts` (+5: Reload drones firing at the end of
the armed round in ANY round without touching normal cannon fire,
once-per-combat, a no-missiles no-op, and the flak-persistence test that
proves `CombatState.flakRemaining` is a genuine per-combat pool rather
than double-counting across the real volley and the reload volley).

### The one real engine surprise: flak had to become persistent

The spec's own grounding said Reload drones would draw "automatically"
from "the same per-combat flakState pool" — true only if the reload
volley happens to fire within the SAME `advanceRound` call as the real
missile phase (round 0). Reload drones' own description says "at the
end of THIS round," with no restriction on which round — so a player
arming it in, say, round 5 has to actually work. Before this iteration,
`flakState` was a purely LOCAL variable in `advanceRound`, recomputed
fresh from `totalFlak()` every call but only ever given nonzero starting
values during the one missile-phase round (`isMissilePhase ?
totalFlak(...) : 0`) — a correct-by-construction stand-in for "once per
combat" only because the base game never fired missiles more than once.
Reload drones breaks that assumption outright.

Fix: `CombatState` gained a genuinely persistent `flakRemaining: {
player: number; enemy: number }`, computed once in `initCombat` from
each side's flak at the fight's start and threaded/decremented across
every `advanceRound` call from then on (the local `flakState` now seeds
FROM `state.flakRemaining` unconditionally, not gated on
`isMissilePhase`, and the round's leftover is written back into the
returned state). `fireShip`'s own flak-cancel branch is still gated on
`phase === 'missile'`, so nothing changes for a normal cannon round —
this only enables the genuinely new case (a missile-phase `fireShip`
call outside round 0). Verified this doesn't silently double-count flak
(a real risk if I'd instead recomputed a fresh pool for each volley) via
a dedicated test: 2 flak charges, 1 die per volley, both volleys
correctly draw down the SAME pool to 0, not 2-each-from-a-fresh-pool.

This required a genuinely new CombatState field (not optional), which
folds into the SAME `SAVE_VERSION` bump the layout change already
needed — no separate bump, same v9.

### Deviations from the spec's exact text

- **Sloop's price was NOT bumped to 10cr as originally sketched in
  chat** — a concurrent commit (`2026-08-12: a flexibility premium...`)
  had already repriced it 9→12cr for the identical reason (a universal
  slot costs a real premium) before this session started. 12cr already
  satisfies "the flex hull costs more than it used to" more strongly
  than my own 10cr draft would have; repricing it again would have been
  arbitrary. Left alone; the frame's comment now records this
  explicitly as the deliberate exception rather than an oversight.
- **`flakState`/`flakRemaining`** — covered above; the spec's "automatic,
  no special-casing" claim only holds with this fix in place. Recorded
  as a real engine change, not glossed over.
- **Reload drones' trigger point**: "at the end of THIS round," any
  round — the simplest honest reading of the part's own text (Open
  Question #1's alternative, "immediately after the missile phase," was
  rejected because it would silently do nothing if armed after round 0,
  contradicting the button's own description).
- **`fleetShieldAuraBonus` was renamed to `fleetAuraBonus` and
  parameterized** (not left as three near-identical functions) — the
  spec's own 63.1 text suggested this ("consider generalizing") without
  mandating it; done because the three auras are otherwise byte-for-byte
  copies of the same reduce.
- **Tag chip visual**: plain bordered text chips (`.part-card__tag`),
  matching PartCard's existing small-card scale — no new visual language
  invented, per Open Question #2's allowance.
- **No frame's power value needed re-verification against the 58.1
  formula test** — the 63.4 layout table was designed so slot COUNT
  never changed per frame (only kinds), so `power = slots + tierIndex`
  is untouched by construction; the existing 58.1 guard test
  (unmodified) already covers every frame, including the 9 changed
  ones, and it still passes.

### Balance measurement — the full staged table

Both `npm run balance` (fixture matchups) and `npm run balance:full`
(the headless-agent sim) were measured at three points: the TRUE
pre-63 baseline (every 63.x file reverted to HEAD via `git checkout`,
confirmed by an isolated re-run — not assumed), stage (a) (63.1–63.3
only, frames.ts still at HEAD), and stage (b) (everything, the shipped
state).

**`npm run balance`** (hand-built fixture fleets): **byte-identical at
all three points.** Verified by grep, not just inference — none of
`scripts/balance.ts`'s fixtures equip ANY of the 9 repriced actives or
the 5 new parts, and `simulateFleet` consumes hand-constructed
`PlayerShipState[]` directly, bypassing `canEquip`/layout legality
entirely (the same 52.6/57.6 finding every prior iteration's notes
record) — so neither the valuation changes nor the layout changes can
reach this script at all. Every FAIL/WARN/KNOWN-MARGINAL line is
unchanged from its previously-recorded set (col10-solid-vs-GCDS,
strong-vs-Hive-Mother, fresh-vs-col-3-elite, strike-vs-plasma-tank WARN,
Titan/Void-Citadel KNOWN MARGINAL).

**`npm run balance:full`** (n=500/commander), act-1 clear rate — act-2
conditional and full-run clear stayed 0% everywhere at all three
checkpoints, same as every prior iteration's table, dropped here for
the same reason:

| Commander | True pre-63 baseline | Stage (a): parts/valuation | Stage (b): +layouts (shipped) |
|---|---|---|---|
| Baseline (auto) | 12.6% | 12.6% | 12.6% |
| Merchant | 10.6% | 10.6% | 10.0% |
| Engineer | 15.0% | 15.0% | 15.0% |
| Spymaster | 9.0% | 9.0% | 8.8% |
| Admiral | 8.4% | 8.4% | 8.4% |
| Warlord | 12.2% | 12.2% | 12.2% |

**Reading the movement**: stage (a) is exactly, digit-for-digit, the
same as the true baseline for every single commander — the 5 new
legendary parts, the 9 active reprices, and Reload drones/Ablative mesh
moved nothing measurable at n=500. This is a real, checked finding (not
an assumption from "the fixtures don't touch it" reasoning like the
`balance.ts` case) — I re-ran the true baseline explicitly rather than
inferring it. The most likely explanation: legendaries draw at a flat
2% shop rate spread across now 7 legendaries (was 4) and the active
reprices are a modest +1-stat nudge on parts `policy.ts`'s
`partPriority` lists weren't specifically tuned to chase — at this
sample size the effect is real but too small to clear sampling noise
(a Wilson interval at these rates is roughly ±3pp). Stage (b) (layouts)
is where ALL the movement is: merchant −0.6pp, spymaster −0.2pp,
everyone else exactly flat. Both deltas are small fractions of that
noise band — **no loosen trigger fires** (the spec's trigger was >2pp
below the stage-(a) figure, or anything under ~7%; admiral's 8.4% is
the closest to that floor and didn't move at all). No budget was
loosened, no layout was reverted.

**`npx tsx scripts/enemyValue.ts`**: recorded, unaffected by this
iteration's changes by construction — it derives its own hardcoded
`PRICE` table from the stat-ladder items (`hull2`, `comp3`, `init3`,
etc.) and `STARTING_LOADOUT`, none of which this iteration touched (the
9 reprised parts are all ACTIVES, a different pricing lane the script
never reads from). Its own T1/T2/T3 self-check table matches
`difficultyCurve.test.ts`'s gate numbers exactly, confirming both are
reading the same concurrent-session-owned curve data this iteration
never touches.

### Methodology note: how the staged isolation was done

Since all four sub-features landed as one continuous edit pass (not
staged commits), stage (a) was reconstructed by temporarily `git
checkout HEAD --`-ing `frames.ts` alone (backing up the shipped version
first), running both balance scripts, then restoring it for stage (b).
The true baseline was reconstructed the same way for all six touched
files (`types.ts`, `parts.ts`, `ship.ts`, `combatEngine.ts`,
`persistence.ts`, plus the two test files) at once. Every revert was
verified by `git status`/`tsc` before measuring, and every file was
restored byte-for-byte from a backup copy (not re-edited by hand)
before the final verification pass — confirmed by the final `tsc`/
`vitest`/`vite build` all passing clean against the fully-restored
tree.
