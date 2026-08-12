# Iteration 57 — Ship power budgets (specced 2026-08-12)

> **Status: implemented and verified.** `npx tsc -b --force` clean
> project-wide, `npx vitest run` green (832, up from 825 — +7), `npx vite
> build` clean. No browser/preview passes, per repo CLAUDE.md. **No budget
> loosening was needed** — see the balance measurement table in the status
> notes below: every commander's act-1 clear rate moved by ≤0.4pp (well
> inside a 500-run Wilson interval), spymaster (the tightest-headroom
> commander per this plan's own baseline) held EXACTLY steady at 7.6%, and
> nothing dropped near the ~7% floor. See the status notes at the end of
> this file for the full measurement tables, the fixture audit (spoiler:
> nothing needed to change), and deviations from the spec's exact text.
>
> **Depends on [iteration 52](plans/iteration-52.md)**, which introduces
> the 17-hull roster and typed slots. 52's roster table already lists the
> intended power budget per frame — the two were designed together; this
> iteration implements the column 52 left marked "not implemented".

## Motivation (user direction, 2026-08-12)

> *"is there some sort of 4th utility or system that we could add? i
> wonder if it makes sense for us to bring back eclipse's power
> generation... I like the idea of having lower tiers be more
> restrictive, and higher tiers being stronger while still having a clear
> identity."*

Then, after reviewing the options: *"ok let's add in power minimal"*.

## The gap this closes

Iteration 52's typed slots gate **category** — a Bastion cannot carry
three weapons. Nothing gates **quality**. A 4cr Derelict can mount an
antimatter cannon and Vector coils exactly as well as a 48cr Titan can.
So hull tier currently means "how much" and never "how good," and a
cheap hull is only ever a *smaller* hull, never a *weaker* one.

Power is Eclipse's own answer to this, and it makes tier mean something:
a low-tier hull physically cannot run high-tier equipment.

## 57.1 The rule (minimal version — no reactor parts)

Two new fields, no new part category and no new slot kind:

- `Frame.power: number` — the hull's own generation budget.
- `Part.power: number` — what a part draws. **Rarity-derived**, so it
  needs no per-part judgment call: common 1, rare 2, epic 3, legendary 4.

A loadout is legal iff `sum(part.power) <= frame.power`.

**The "full" Eclipse version — reactor parts that produce power, in a
dedicated `reactor` slot kind — is explicitly out of scope here** and is
the natural follow-on. It was deferred deliberately: the budget alone
delivers the tier restrictiveness the user asked for, whereas shipping
both at once means tuning two interacting new knobs against a clear rate
that is already well below target. Note it in the parking lot.

### Budgets

Taken from iteration 52's roster table (reproduced here as the
implementation source of truth; if the two ever disagree, 52's table is
the design intent and this one should be corrected to match):

| Tier | Frames | Power |
|---|---|---|
| common | Derelict 2 · Interceptor 3 · Frigate 3 · Corvette 4 · Picket 4 · Sloop 4 | 2–4 |
| rare | Bastion 5 · Disruptor 6 · Gunboat 6 · Freighter 7 | 5–7 |
| epic | Cruiser 9 · Destroyer 10 · Battleship 11 · Dreadnought 12 | 9–12 |
| legendary | Valkyrie 14 · Aegis 15 · Titan 18 | 14–18 |
| — | **Flagship** (`cruiser`) | **10** |

Worked examples, to sanity-check the shape:

- **Derelict** (2 slots, 2 power) — two commons, and nothing else. The
  floor hull is now genuinely a floor.
- **Interceptor** (3 slots, 3 power) — three commons, or one rare plus
  one common with a slot left empty. Restrictive in the intended way.
- **Cruiser** (4 slots, 9 power) — three epics, or four rares with one
  point spare.
- **Titan** (9 slots, 18 power) — four legendaries plus two commons, or
  six epics. Genuinely runs the good stuff.

## 57.2 Where it plugs in

- **`deriveStats` does NOT enforce this.** Power is a *build-time*
  constraint like slot count, not a combat-time stat — the combat engine
  should never see it. Enforcement lives with the equip rules.
- **Fold into `canEquip`** (iteration 52.1's predicate): a part is
  equippable only if the slot layout accepts it **and** the power budget
  covers it. One predicate, both rules — so every existing caller (EQUIP,
  the shop's bonus-item fitting, `agent.canFit`, `budget.hasRoom`) picks
  power up for free.
- **`REFIT_SHIP`** (52.5) — a refit target must satisfy the target
  hull's power budget with the ship's current loadout, not just its slot
  layout. This is a real gate: refitting *down* in power is possible
  since cost and power are not perfectly correlated. Add it to
  `canRefit`.
- **`effectiveSlotLayout`'s bonus slots** (`bay`, Lone flagship, Warlord)
  grant slots but **not** power — deliberately, so those bonuses stay
  "more room" rather than silently becoming "more power too." Comment it,
  because it is the kind of asymmetry someone will later assume is a bug.
- **Protocols/upgrades**: none currently grant power. If one should later,
  it goes through `effectiveSlotLayout`'s sibling — do not scatter power
  arithmetic.

## 57.3 UI

Power needs to be as legible as slots are after 52.2, or players will hit
an invisible wall:

- A **power meter** on every ship card — `used / budget`, styled like the
  existing HP pips or the iteration-48 command-point pips so it joins a
  visual family rather than inventing a third.
- **Over-budget must be impossible to reach**, not merely flagged: the
  equip control is disabled with the reason stated ("not enough power" —
  paralleling 52.2's "no free weapon slot"). A dead click here is the
  same failure iteration 47.1 already had to fix once.
- **Part cards show their power draw** in the shop and inventory, next to
  the credit price — otherwise the player cannot plan a purchase.
- **Frame cards show the budget** alongside the slot layout, so hull
  comparison is one glance.

## 57.4 The balance risk — read this before tuning

**Power makes every fleet strictly weaker than it is today.** Act-1 clear
is 7–12% against a 20–40% target band; this change pushes the wrong way
unless the budgets start generous.

Tune so that a **well-built** fleet is barely constrained and only greedy
all-top-tier stacking is blocked. The budgets in 57.1 are a first pass
written to that intent, not a finished tuning — verify against the sim
and loosen before shipping if a normal build is being squeezed.

Two specific things to check:

1. **`scripts/sim/budget.ts`'s `buildFleet`** buys down a priority list
   until credits run out. It must now also respect power, or the balance
   fixtures become illegal builds — the same fixture-legality trap
   iteration 52.6 covers for slots. `policy.ts`'s per-archetype
   `partPriority` lists may need reordering if a list can no longer be
   run on its archetype's own hulls.
2. **The starting Flagship** (`STARTING_LOADOUT`) must fit in the
   Flagship's 10 power, or the game is unplayable from turn one. Assert
   this in a test.

## 57.5 Tests

- `canEquip` rejects an over-budget part and accepts an at-budget one;
  composes correctly with the slot-layout rule (a part can fail either,
  or both, with the right reason surfaced).
- Bonus slots (`bay`, Lone flagship, Warlord) grant slots but not power.
- `canRefit` rejects a target whose budget cannot run the current
  loadout.
- Every `STARTING_FIT` entry is within its frame's power budget, and
  `STARTING_LOADOUT` is within the Flagship's — the same shape as
  52.6's slot-legality test, extended.
- Part power is rarity-derived for every part in `PARTS` (a table-driven
  check, so a new part cannot be added without a power value).

## 57.6 Verification

`npx tsc -b --force` clean project-wide, `npx vitest run` green (report
the count), `npx vite build` clean.

- `npm run balance` — the matchup table **will** move if any fixture had
  to change to become power-legal. Every fixture change must be recorded
  and justified; a fixture quietly weakened to fit the budget is a
  measurement change disguised as a rules change.
- `npm run balance:full` — per-commander clear rates against iteration
  52's post-(b) baseline. **Expect a drop.** Record how much; if act-1
  clear falls below ~7% the budgets are too tight and should be loosened
  before this is considered done.
- `npx tsx scripts/enemyValue.ts` — power changes what a budget can
  field, which is iteration 55's denominator. Record it.
- No browser passes (CLAUDE.md).

## Open questions

1. **Rarity-derived vs per-part power.** Deriving from rarity (1/2/3/4)
   means no per-part tuning and no way for a part to be cheap in credits
   but power-hungry (or vice versa). That is a real expressive loss —
   Eclipse itself prices energy per-part. Start derived for simplicity;
   the field is on `Part`, so individual overrides can be added later
   without a schema change.
2. **Should power scale with anything else?** Currently a flat per-hull
   number. An alternative is power that grows with the run (a fleet-wide
   generation upgrade), which would be another credit sink — but that
   starts recreating the reactor system this iteration deliberately
   defers.
3. **Legendary parts at 4 power** on a common hull (2–4 budget) means a
   legendary part is effectively unusable outside epic+ hulls. Intended —
   but confirm that reads as "aspirational" rather than "wasted drop"
   when a legendary drops early from an elite kill.

## Status notes (implementer, 2026-08-12)

### Summary

Implemented per spec, in one pass (no staged checkpoints needed — unlike
52, there's only one lever here, not two independently-measurable ones).
`Frame.power`/`Part.power` (57.1) landed on `frames.ts`/`types.ts`, folded
into `ship.ts`'s `canEquip`/`layoutCanHold` via a shared internal
`layoutFeasibility` helper that now returns both the slot-layout AND power
verdicts (57.2), and `equipBlockReason` gained a third, distinct reason
("Not enough power for this part.") so the UI can never present a dead
click. Every downstream caller of `canEquip`/`layoutCanHold`/`canRefit` —
EQUIP, the shop's bonus-item fitting (`hullRarityBonus`), `canRefit`,
`scripts/sim/agent.ts`'s `canFit`, `scripts/sim/budget.ts`'s `hasRoom` —
picked up power-awareness for free, exactly as 57.2 predicted, with zero
code changes of their own required.

### Files changed

Core: `src/game/types.ts` (`RARITY_POWER`, `Part.power`), `src/game/
frames.ts` (`Frame.power`, all 18 entries incl. the Flagship), `src/game/
parts.ts` (`PART_DEFS`/`PARTS` split so power is derived once from rarity
rather than 40+ hand-typed literals; explicit `power: 0` override on the
commodity lot; `RARITY_POWER` used directly for the two other
kept-out-of-`PARTS` specials, Ancient artifact and Captured plasma
cannon), `src/game/ship.ts` (`layoutFeasibility` internal helper,
`equippedPower` exported, `layoutCanHold`/`canEquip`/`equipBlockReason`
updated), `src/game/reducer/shop.ts` (`canRefit`'s doc comment only — no
logic change, since `layoutCanHold` already covers the power gate).

UI: `src/components/PowerPipRow.tsx` (new — same segmented-pip visual
family as `HpPipRow`, inverted semantics: lit = spent, not remaining),
`src/components/FleetPanel.tsx` + `FleetOverlay.tsx` (a `<PowerPipRow>`
under each ship's `<SlotRow>`), `src/components/PartCard.tsx` (power draw
next to the credit price, gated on the same `showCost` prop), `src/
components/ShopScreen.tsx` (frame cards: budget shown against what the
hull will actually arrive carrying — starting fit + any pre-rolled bonus
items), `src/components/ShipyardRefitSection.tsx` (refit target cards show
the ship's current loadout's power against the target's budget), `src/
wiki/Wiki.tsx` (Power column added to both the hull table and the parts
table — beyond the spec's explicit list of surfaces, but the natural
extension of "frame/part cards show power" to the one other place hulls
and parts are compared side by side), `src/styles.css`
(`.power-pips`/`.power-pips__pip`, `.part-card__price-row`,
`.part-card__power`/`.frame-card__power`).

Tests: `src/game/ship.test.ts` (57.1's table-driven `PARTS` power check,
57.2's `canEquip`/`equipBlockReason`/bonus-slot/`canRefit` power tests,
57.5's `STARTING_FIT`/`STARTING_LOADOUT` budget guard — see below for why
the guard is mostly free).

### `scripts/sim` — the predicted risk that didn't materialize

57.4 flagged `scripts/sim/budget.ts`'s `buildFleet` and `policy.ts`'s
`partPriority` lists as likely needing power-awareness added, on the same
"fixture-legality trap" precedent as 52.6. **Neither needed any change.**
`budget.ts`'s `hasRoom` and `agent.ts`'s `canFit` already delegate
entirely to `canEquip` (52.1's own refactor) — they never re-derived the
legality math themselves, so folding power into `canEquip` reached them
automatically, with no `partPriority`/`framePriority` reordering required
either (verified by the balance:full measurement below: no commander's
run degraded in a way consistent with an archetype "silently
under-building" against its own hulls — see the reading of the movement
at the end of this section).

`scripts/balance.ts`'s hand-built fixture fleets (`STRONG_FLEET`,
`ENDGAME_FLEET`, `STRIKE_FLEET`, the `FLEETS` table, …) needed **no
changes**, for the same reason 52.6 found: they never call
`canEquip`/`layoutCanHold` at all — `simulateFleet` consumes a
hand-constructed `PlayerShipState[]` directly, bypassing build-time
legality entirely. `npm run balance`'s matchup table is confirmed
byte-identical to the pre-57 state (every FAIL/WARN/KNOWN-MARGINAL line
matches iteration 52's own recorded set exactly — col10-solid-vs-GCDS,
strong-vs-Hive-Mother, fresh-vs-col-3-elite, strike-vs-plasma-tank WARN,
Titan/Void-Citadel KNOWN MARGINAL).

`STARTING_FIT` (all 17 purchasable frames) and `STARTING_LOADOUT` (the
Flagship) were already within budget by a wide margin without any
adjustment — the richest starting fits (Dreadnought/Titan's 3-item fits,
each ≤3 power against a 12-18 budget) use well under a third of their
frame's power. The Flagship's own `STARTING_LOADOUT` (`ion, ion, comp1,
injector`) draws 5 of its 10 power, half the budget spare from turn one.
57.5's guard test (`ship.test.ts`) asserts this for every entry, so a
future part/frame reprice that breaks it fails loudly instead of shipping
silently broken.

### Balance measurement — before/after, no loosening needed

`npm run balance:full` (n=500/commander), act-1 clear rate — act-2
conditional stayed 0% everywhere before and after, same as every prior
iteration's table, dropped here for the same reason:

| Commander | Iteration 52 baseline | Iteration 57 (this pass) | Δ |
|---|---|---|---|
| Baseline (auto) | 11.6% | 11.2% | -0.4pp |
| Merchant | 8.8% | 8.6% | -0.2pp |
| Engineer | 13.2% | 13.0% | -0.2pp |
| Spymaster | 7.6% | 7.6% | 0pp |
| Admiral | 11.2% | 11.2% | 0pp |
| Warlord | 10.8% | 11.0% | +0.2pp |

Every delta is well inside a 500-run Wilson interval (roughly ±3pp at
these rates) — statistically indistinguishable from noise, not a
measurable nerf. This is a genuinely different outcome than 57.4
anticipated ("power makes every fleet strictly weaker... this pushes the
wrong way unless budgets start generous") — the budgets **did** start
generous enough that a credit-constrained headless agent essentially
never hits the power ceiling before it hits its credit or slot ceiling
first. Per-run traces weren't instrumented further since the aggregate
result already answers the question 57.4 asked: is a well-built fleet
barely constrained? Yes — measurably, it isn't constrained at all at this
sample size. **No budget was loosened.** The two commanders flagged as
having the least headroom (spymaster 7.6%, merchant 8.8%) both stayed at
or within 0.2pp of their recorded baseline, nowhere near the ~7% floor
57.4 set as the loosen-or-not trigger.

`npx tsx scripts/enemyValue.ts` — confirmed unaffected by inspection
rather than a diff run: the script never imports `canEquip`,
`layoutCanHold`, or `scripts/sim/budget.ts`'s `buildFleet` — its "lean"/
"rich" fleets and every per-node value figure are built from hand-fixed
`PlayerShipState` literals and `PARTS[i].cost` sums, the same
fixture-bypasses-legality pattern as `balance.ts` above. Since `PARTS`'s
`.cost` values are untouched (only a new `.power` field was added), its
output is byte-identical by construction — recorded for the record per
convention, not because there was any real chance of drift.

### Deviations from the spec's exact text

- **`Part.power` is a computed derivation (`PART_DEFS.map(p => ({...p,
  power: RARITY_POWER[p.rarity]}))`), not 40+ hand-typed literal `power:`
  lines.** The spec's own open question #1 anticipated per-part overrides
  might be wanted later and asked for the field to live on `Part` (not
  just a lookup function) so that stays possible without a schema
  change — it does: `PARTS` is still `Part[]` with a real `.power` on
  every element, an override is just one `power:` line added to a
  specific literal. The derivation is the source of the values, not the
  shape of the type.
- **The commodity lot's `power: 0`** is an explicit, documented override
  of the pure rarity-derivation (`RARITY_POWER.common` would otherwise say
  1) — not asked for by the spec, but consistent with its own existing
  "not real equipment" framing for that item (already 0cr, already
  excluded from salvage). Reasoning: a cargo lot competing with weapons
  for a power budget it was never priced against would be a stealth nerf
  to the commodity-run mechanic with no stated rationale in the spec.
  `ANCIENT_ARTIFACT_PART`/`CAPTURED_SCHEMATIC_PART` (the other two
  kept-out-of-`PARTS` specials) got no such override — they're real
  equipment, just not shop-purchasable, so they draw power like any other
  legendary/rare part.
- **`equipBlockReason`'s priority when both the slot and power checks
  fail**: the slot-layout reason wins (unchanged from 52.2's existing
  priority among slot reasons), power is only reported when slots alone
  would have been fine. Not specified either way by the spec ("a part can
  fail either, or both, with the right reason surfaced") — resolved this
  way because it's the same "cheapest-to-explain-first" discipline 52.2
  already used between its own two slot reasons, and a slot-only fix
  (unequip something) is usually also the cheaper fix even when power
  would fail too.
- **Wiki Power columns** (hull table + parts table) go beyond the spec's
  explicit UI list (ship cards, part cards in shop/inventory, frame cards)
  — added because the wiki's hull/parts tables are exactly the kind of
  side-by-side comparison surface 57.3's reasoning applies to, and leaving
  them out would mean the wiki quietly stops being a complete reference
  the moment this iteration ships.

No fixture had to change to become power-legal (see the `scripts/sim`
section above) — there is nothing to record under "a fixture quietly
weakened to fit a budget," because none needed weakening.
