# Iteration 59 — Shipyard tiers up + hull marks replace the refit

> **Status: implemented and verified.** `npx tsc -b --force` clean
> project-wide, `npx vitest run` green (855, up from 852 — +3), `npx vite
> build` clean. No browser/preview passes, per repo CLAUDE.md. Both changes
> shipped together and were measured in one `npm run balance:full` pass
> (the spec's own instruction, unlike 58's two-stage protocol) — every
> commander moved UP vs iteration 58's stage-(b) table (auto +1.0pp,
> merchant +4.0pp, engineer +6.8pp, spymaster +3.4pp, warlord +4.8pp;
> admiral -1.6pp, within noise), so no loosen lever applies (it only ever
> triggers on a drop). See the status notes at the end of this file for the
> full table, the reasoning, and deviations from the spec's exact text.
>
> **Numbering note**: `plans/iteration-60.md` records that the declutter
> pass was briefly drafted as `plans/iteration-59.md` and was renumbered to
> 60 when this hull-marks spec claimed 59 — this file (the one you're
> reading) is the authoritative iteration 59. `PLAN.md`'s two "59" rows from
> that transition period are resolved: row 93 is iteration 60 (declutter),
> row 94 is this file.
>
> **Sequencing: implement AFTER iteration 58 lands.** 58 (reactors) is
> touching `reducer/shop.ts` (`canRefit`), `ship.ts`
> (`effectiveSlotLayout`), and `frames.ts` — the exact surfaces this
> iteration edits/removes. Read the code as it exists when you start, not
> as older plans describe it.

## Motivation (user direction, 2026-08-12)

> *"in the shipyard, let's make it so you only get rare or better
> options."*

> *"instead of having Refit being a tradeup which essentially is just a
> permanent shop - let's make it similar to twilight imperium's 'upgraded
> version' of the ship. naming would just be Interceptor II, or
> Interceptor III for example. goes up to 3, and each upgrade would just
> give 1 universal slot."*

## Grounding

- `drawFrameOffers(rng, act, kind)` (`reducer/shop.ts`): store filters
  out epic+legendary; shipyard draws from the full pool with legendary
  gated to act 2 (52's generalization of the old Dreadnought gate).
  Shipyard draws 5, store draws 2, via `drawRarityWeighted` (which walks
  to the nearest populated tier when the rolled tier is empty in the
  pool — so removing commons from the shipyard pool needs no weight
  changes; a rolled common simply falls up to rare).
- The refit (52.5): `REFIT_SHIP` action + `canRefit`/`refitCost` in
  `reducer/shop.ts` (re-exported via `reducer.ts`),
  `ShipyardRefitSection.tsx`, a `REFIT_SHIP` toast in
  `shopToastText.ts`, `refitHull` heuristic + `HANDLED_ACTIONS` entry in
  `scripts/sim/agent.ts`, and commander hull discounts applied to the
  refit price (commit 55e2375). All of it is removed by 59.2.
- `effectiveSlotLayout(frameId, upgrades, protocols, commanderId)`
  (`ship.ts`): frame layout + one `'universal'` per bay upgrade /
  Lone-flagship +2 / Warlord +1. **Does not currently take the ship** —
  see 59.3's signature note.
- `PlayerShipState` optional-field precedent (`mercenary`,
  `overRepairBank`, …): a new optional field needs no SAVE_VERSION bump.
- Iteration 58's rule (in flight): granted bonus slots carry **no
  power** — marks follow the same rule (59.3).
- Concurrency: a separate session is doing UI improvements
  (`FleetPanel.tsx` / `FleetOverlay.tsx` / `ShipBlueprint.tsx` /
  `styles.css` churning). Re-read UI files immediately before editing;
  targeted edits; never revert others' work.

## 59.1 Shipyard stocks rare or better

`drawFrameOffers`: the shipyard pool excludes `rarity === 'common'`
(mirror of the store's existing epic/legendary exclusion). Resulting
identities:

- **Store**: common + rare (cheap hulls, 2 offers) — unchanged.
- **Shipyard**: rare + epic, plus legendary in act 2 (quality hulls,
  5 offers). Act-1 pool = 4 rares + 4 epics = 8; act-2 adds 3
  legendaries = 11. Draw counts stay as they are.

No rarity-weight changes (52's standing rule) — `drawRarityWeighted`'s
tier-walk already handles a common roll against a common-less pool.
Update `drawFrameOffers`'s comment block and the wiki's hull-section
prose if it states the old rule.

Note for the balance read: commons vanish from shipyards, so the sim's
cheap-hull purchases shift to stores. Expect small movement; record it.

## 59.2 Remove the refit

Delete outright (superseded by 59.3 — record in `PLAN.md`'s iteration-52
row that 52.5's refit was replaced by 59's marks):

- `REFIT_SHIP` from `RunAction` and the shop action union + its case.
- `canRefit` / `refitCost` and their re-exports.
- `ShipyardRefitSection.tsx` and its `ShopScreen.tsx` wiring (the new
  mark section in 59.4 takes its place in the shipyard layout).
- The `REFIT_SHIP` toast case.
- `scripts/sim/agent.ts`'s `refitHull` heuristic + `HANDLED_ACTIONS`
  entry (59.5 adds the mark heuristic in its place).
- Refit-specific tests (replace with 59.6's).

Hull progression without the refit = buy the bigger hull (shipyards now
stock the good ones, 59.1) and scuttle or keep the old — the mark system
below is for deepening a ship you're keeping.

## 59.3 Hull marks (Twilight Imperium style)

- New optional field `PlayerShipState.mark?: 2 | 3` — absent means
  mark I (a plain ship). No SAVE_VERSION bump.
- New shop action `{ type: 'UPGRADE_MARK'; shipIndex: number }`,
  **shipyard only** (`shopKind === 'shipyard'`), mercenaries excluded
  (the standing no-permanent-investment rule). Mark I → II → III; III is
  the cap.
- **Each mark grants exactly +1 universal slot**, folded into
  `effectiveSlotLayout` alongside the bay/Lone-flagship/Warlord bonuses.
  The layout helpers currently take `(frameId, upgrades, protocols,
  commanderId)` — they need the mark too. Prefer extending to take the
  ship (or an explicit `mark` param) and update all callers; keep one
  source of truth, don't fork a second layout function.
- **Mark slots carry no power** (iteration 58's granted-slot rule) — a
  marked-up ship with a full loadout will want a reactor. Deliberate
  interplay; comment it where the bonus is granted.
- Weapon ceiling: `count('weapon') + count('universal')` — a mark
  therefore also raises the weapon ceiling by 1, same as a bay does
  today. Consistent; no special-casing.
- **The Flagship CAN be marked** ("Flagship II") — marks don't change
  `frameId`, so none of the invariants that forbade refitting it apply.
  Say so in a comment where refit's old Flagship guard used to be.

### Price

Derived from the frame's (commander-discounted) cost, escalating:

- Mark II: `ceil(discountedFrameCost * 0.5)`
- Mark III: `ceil(discountedFrameCost * 0.75)`

where `discountedFrameCost = frameCost(frame.cost, frameId, commanderId,
protocols)` (no `shopKind` — marks are shipyard-only so the store
discount never applies). This preserves commit 55e2375's precedent that
commander hull discounts reach hull-improvement prices. Examples at list
price: Interceptor 3/5cr, Cruiser 11/17cr, Titan 24/36cr — a real
late-run credit sink on big hulls, pocket change on commons. Export
`markUpgradeCost(frameId, targetMark, commanderId, protocols)` so UI and
reducer share it. Tunable; record any change.

### Display

- `frameDisplayName(frameId, mark)` helper: mark I = plain frame name;
  II/III append the numeral ("Interceptor II", "Flagship III"). Use it
  everywhere the frame designation renders (FleetPanel/FleetOverlay ship
  cards, prep screen, shop fleet panel, end screen if it names frames —
  grep for `getFrame(...).name` display call sites). Ship NAMES ("ISV
  Resolute") are untouched — the mark is part of the class designation,
  not the christening.
- A small mark chip/badge near the ship name is fine if a text suffix
  reads poorly on a given surface — adapt to the current (moving) UI.

## 59.4 UI: the mark section

Replace `ShipyardRefitSection` with a mark-upgrade section in the
shipyard: each eligible ship (non-mercenary, mark < III) as a row —
current designation, next mark, price, and "+1 universal slot" stated
plainly. Disabled-with-reason when unaffordable (no dead clicks). Toast
on success ("Interceptor upgraded to Interceptor II."). At mark III the
row shows a maxed state or drops out — implementer's call, note it.

## 59.5 `scripts/sim`

Replace `refitHull` with a mark heuristic in `agent.ts`: at a shipyard,
if at fleet cap (nothing to buy) with spare credits beyond the
archetype's reserve, upgrade the mark of the most valuable hull
(cheapest-first is also fine — keep it dumb and honest, comment the
choice). Add `UPGRADE_MARK` to `HANDLED_ACTIONS`. The extra universal
slot only helps the agent if it then buys parts to fill it — that's
already its normal behavior.

## 59.6 Tests

- Shipyard offers never include a common frame (seed sweep, both acts);
  store still offers commons; legendary still act-2-shipyard-only.
- `UPGRADE_MARK`: charges the right price (incl. commander discount),
  sets mark 2 then 3, refuses at cap, refuses in a store / on a
  mercenary / when unaffordable.
- `effectiveSlotLayout` grows by one universal per mark; stacks with
  bay/protocol/commander bonuses; weapon ceiling rises accordingly.
- Mark slots grant no power (58's budget unchanged by a mark).
- Flagship can be marked; `frameDisplayName` renders I/II/III correctly.
- `REFIT_SHIP` is gone (compile-level — no test needed beyond removing
  the old ones; make sure no orphaned exports remain).

## Verification bar

- `npx tsc -b --force` clean project-wide (scope to `tsconfig.app.json`
  only if scripts/ is broken by others' concurrent work — say so).
- `npx vitest run` green (report count).
- `npx vite build` clean.
- `npm run balance` + `npm run balance:full` — one measurement after
  both changes (they ship together); compare against iteration 58's
  final table (or 57's if 58's isn't recorded yet). The shipyard-commons
  removal and the refit→mark swap both move the sim's shopping; read
  the movement, loosen nothing without a recorded reason.
- No browser/preview passes (CLAUDE.md). Do not commit or push.

## Open questions

1. Mark price curve (0.5× / 0.75×) — first pass; the intent is "real
   sink on big hulls, accessible on small ones."
2. Should a mark also grant +1 HP for flavor ("refitted bulkheads")?
   Deliberately NOT in this iteration — one effect per mechanic; the
   slot is the identity.
3. Silhouette differentiation for marked ships — out of scope;
   the text designation carries it for now.

## Status notes (implementer, 2026-08-12)

### Summary

Both changes landed in one pass, per the spec's own framing ("they ship
together"). 59.1 (`drawFrameOffers` in `reducer/shop.ts`) now filters the
shipyard pool to `rarity !== 'common'`, mirroring the store's existing
`rarity !== 'epic' && rarity !== 'legendary'` exclusion — no
`RARITY_WEIGHTS` change, per the standing rule; `drawRarityWeighted`'s own
tier-walk falls a rolled common up to rare against the now-common-less
pool, the same mechanism that already handles the act-1 legendary
exclusion two lines above it. 59.2 removed `REFIT_SHIP`/`canRefit`/
`refitCost` outright: the action variant, the `ShopAction` union member and
its reducer case, the re-exports from `reducer.ts`, `ShipyardRefitSection
.tsx` (deleted), its `ShopScreen.tsx` wiring, the `REFIT_SHIP` toast case,
and `scripts/sim/agent.ts`'s `refitHull` heuristic + its `HANDLED_ACTIONS`
entry. 59.3 replaced it with hull marks: a new optional
`PlayerShipState.mark?: 2 | 3` (absent = mark I), a new shipyard-only
`UPGRADE_MARK` shop action, `markUpgradeCost`/`canUpgradeMark` (the shared
source of truth for both the reducer and the UI, same pattern
`canRefit`/`refitCost` used), and `effectiveSlotLayout`/`effectiveSlots`
extended with a trailing optional `mark?: 2 | 3` parameter threaded through
`layoutFeasibility`/`canEquip`/`layoutCanHold`/`equipBlockReason` — one
source of truth, every existing positional call site keeps compiling
unchanged (the param is optional and trailing), and the handful of call
sites that actually hold a marked ship (`reducer.ts`'s EQUIP,
`FleetPanel.tsx`, `FleetOverlay.tsx`, `scripts/sim/agent.ts`'s `canFit`)
now pass `ship.mark` through. A new `frameDisplayName(frameId, mark)`
helper (`frames.ts`) renders "Interceptor II"/"Flagship III"; call sites
that name a REAL ship's class (`FleetPanel`'s ship card, `ship.ts`'s
`playerShipLabel` fallback, the `UPGRADE_MARK` toast) use it — call sites
previewing a hull nobody owns yet (shop frame-purchase cards, the
commander-select starting-ship line) keep reading `getFrame(id).name`
directly, since there is no mark to show for those.

### Files changed

Core: `src/game/types.ts` (`PlayerShipState.mark?: 2 | 3`, no SAVE_VERSION
bump — same optional-field precedent as `mercenary`/`overRepairBank`),
`src/game/frames.ts` (new `frameDisplayName` export), `src/game/ship.ts`
(`effectiveSlotLayout`/`effectiveSlots`/`layoutFeasibility`/`canEquip`/
`layoutCanHold`/`equipBlockReason` all gain a trailing optional `mark`
param; `playerShipLabel`'s fallback uses `frameDisplayName`;
`layoutCanHold`'s doc comment updated now that `canRefit` is gone — its
only other caller), `src/game/reducer/shop.ts` (`drawFrameOffers`'s
shipyard branch excludes commons; `canRefit`/`refitCost` deleted;
`markUpgradeCost`/`canUpgradeMark` added; `ShopAction`'s union member and
the `handleShopAction` case swapped `REFIT_SHIP` -> `UPGRADE_MARK`; the
`deriveStats`/`layoutCanHold` imports dropped — both were refit-only),
`src/game/reducer.ts` (`RunAction`'s `REFIT_SHIP` member replaced with
`UPGRADE_MARK`; re-exports swapped `canRefit`/`refitCost` for
`canUpgradeMark`/`markUpgradeCost`; EQUIP's `canEquip` call threads
`ship.mark`; the shop-delegation case list and its comment updated).

UI: `src/components/ShipyardMarkSection.tsx` (new, replaces the deleted
`ShipyardRefitSection.tsx` — one row per eligible ship: current
designation, an arrow to the next mark, "+1 universal slot", price,
disabled-with-reason when unaffordable, an info-dot explainer matching the
old refit section's onboarding-vs-clutter pattern; a maxed ship simply
drops out of the row list rather than showing a maxed state, per the
spec's "implementer's call, note it"), `src/components/ShopScreen.tsx`
(swapped the import/JSX for `ShipyardMarkSection`; the `act` prop is gone
— it existed only for `canRefit`'s legendary-act gate, which marks have no
equivalent of, so it was dropped rather than left unused;
`onRefitShip`/`REFIT_SHIP` wiring replaced with `onUpgradeMark`/
`UPGRADE_MARK`), `src/App.tsx` (drops the now-unused `act={state.act}`
prop pass to `ShopScreen`; wires `onUpgradeMark` to dispatch
`UPGRADE_MARK`), `src/components/shopToastText.ts` (the `REFIT_SHIP` case
replaced with an `UPGRADE_MARK` one, reading the ship's pre-dispatch mark
and naming the mark it's about to become via `frameDisplayName`),
`src/components/FleetPanel.tsx` (the ship-card frame span uses
`frameDisplayName(ship.frameId, ship.mark)`; `effectiveSlots`/
`effectiveSlotLayout`/`equipBlockReason` calls thread `ship.mark`/
`selectedShip.mark`), `src/components/FleetOverlay.tsx`
(`effectiveSlotLayout` call threads `ship.mark` — both files were also
mid-edit from the concurrent declutter/60.8 session; re-read immediately
before each edit, per the concurrency discipline, and both edits applied
cleanly against that session's own already-landed changes, e.g.
`PowerPipRow`'s bolt-icon redesign), `src/styles.css` (`.shop-screen__refits`
/`.refit-row*` replaced with `.shop-screen__marks`/`.mark-row*`; two stale
comments mentioning `canRefit`/"the shop's refit explainer" updated),
`src/wiki/Wiki.tsx` (a new Core Rules bullet explaining hull marks,
matching the existing Power bullet's style).

`scripts/sim/agent.ts`: `refitHull` replaced with `upgradeMark` (same
"cheapest hull first" ordering, now via `canUpgradeMark`/`markUpgradeCost`
instead of `canRefit`/`refitCost`), `canFit` threads `ship.mark`,
`HANDLED_ACTIONS` swaps `REFIT_SHIP` for `UPGRADE_MARK`, the now-unused
`FrameId` type import dropped (its only use was `refitHull`'s local
`best` variable).

Tests: `src/game/reducer.test.ts` (the `REFIT_SHIP` describe block — 12
cases spanning `canRefit`'s 6 rejection rules, `refitCost`'s 2 pricing
cases, and 4 reducer-dispatch cases — replaced with an `UPGRADE_MARK`
describe block of 11 cases covering the same shape of ground:
`canUpgradeMark`'s three gates (shipyard-only, no mercenaries, cap at III),
`markUpgradeCost`'s formula and commander-discount behavior, and
reducer-level charge/step/refuse-at-cap/refuse-in-store/refuse-mercenary/
refuse-when-short cases plus a dedicated "the Flagship can be marked"
case; a new "a shipyard never offers a common hull" test swept across both
acts, mirroring the existing store-side epic/legendary exclusion test),
`src/game/ship.test.ts` (the one `canRefit`-based power-budget test in the
57.2 describe block and the two-test 58.3 refit describe block both
removed; a new 59.3 describe block added covering
`effectiveSlotLayout`'s cumulative +1-universal-per-mark growth, stacking
with bay/Lone-flagship/Warlord bonus slots, the weapon-ceiling rise, the
"no power" rule via a block-reason shift from `"Ship is full"` to `"Not
enough power"` once marked, and the Flagship's own markability; plus a
`frameDisplayName` describe block). Net: 852 -> 855 (+3), confirmed by
hand-counting removed vs. added cases.

### Balance measurement

Both changes shipped in one pass, so — per the spec's own instruction
("one measurement after both changes... they ship together"), unlike 58's
two-stage protocol — this is a single `npm run balance` +
`npm run balance:full` pass, compared against iteration 58's stage-(b)
table (the most recent recorded baseline).

`npm run balance` (the fixture matchup table) is **byte-identical** to
every prior iteration's recorded output — `scripts/balance.ts`'s
hand-built fleets never call `drawFrameOffers`/`canEquip`/`canUpgradeMark`
at all (the same fixture-bypasses-legality fact every power/hull iteration
since 52.6 has recorded), so neither the shipyard-tier change nor the
refit-\>mark swap can reach it. Same FAIL/WARN/KNOWN-MARGINAL lines as
every prior recorded set (col10-solid-vs-GCDS, strong-vs-Hive-Mother,
fresh-vs-col-3-elite, strike-vs-plasma-tank WARN, Titan/Void-Citadel KNOWN
MARGINAL).

`npm run balance:full` (n=500/commander), act-1 clear rate — act-2
conditional stayed a measured 0% everywhere, same as every prior
iteration's table, dropped from the table below for the same reason:

| Commander | Iteration 58 stage-(b) | Iteration 59 (both changes) | Δ |
|---|---|---|---|
| Baseline (auto) | 11.6% | 12.6% | +1.0pp |
| Merchant | 7.8% | 11.8% | +4.0pp |
| Engineer | 11.6% | 18.4% | +6.8pp |
| Spymaster | 6.8% | 10.2% | +3.4pp |
| Admiral | 11.4% | 9.8% | -1.6pp |
| Warlord | 9.0% | 13.8% | +4.8pp |

### Reading the movement

Every commander but the Admiral moved **up**, several substantially (a
500-run Wilson interval is roughly ±3pp at these rates — engineer's
+6.8pp and warlord's +4.8pp are real, attributable moves, not noise; the
Admiral's -1.6pp is within one). The spec's loosen trigger ("any commander
>2pp below its... table figure") is a one-directional check by its own
wording — it exists to catch a regression, and every commander here is
flat-or-better against it. **No loosening lever was pulled** (there is
nothing to loosen against an improvement), and no value was tightened
either — the spec asks only to read the movement and record a reason if
loosening, not to re-tighten a windfall back down.

The direction makes sense from both changes at once:

1. **59.1 (shipyard rare-or-better)** means every shipyard hull the agent's
   `buyHull` picks up is now a genuine upgrade over what a store already
   offers, not a coin-flip against a common the shipyard visit could have
   spent 5 offer-slots drawing instead. The spec's own note ("commons
   vanish from shipyards, so the sim's cheap-hull purchases shift to
   stores") plausibly frees shipyard credits for something more
   load-bearing per visit.
2. **59.2/59.3 (refit -> marks)** removes a heuristic (`refitHull`) that
   required a strictly-more-expensive target frame AND a full loadout
   re-fit-check, and replaces it with `upgradeMark` — a flat, cheap,
   always-available +1-universal-slot purchase (Interceptor II is 3cr,
   the same tier as a single common part) with no rarity/offer-stock gate
   at all. The agent's shipyard branch (`buyHull` -> `upgradeMark` ->
   `buyRepairs`) now converts "nothing left to buy this visit" into a real
   slot far more often than the old refit ever could, and per 59.5's own
   note, a filled extra slot is exactly what the agent's normal shopping
   already does with any room it's handed.

Both levers point the same direction (more real hull-building return per
shipyard visit), so a broad-based positive move across every non-Admiral
commander — several of whom (merchant, warlord) route through shops most
heavily per `COMMANDER_ROUTE_BIAS`/`routeBias` — is the expected shape,
not a surprise. The Admiral's small dip is plausibly the mirror image: the
Admiral's 25% frame discount was worth relatively more when shipyards
still stocked cheap commons a discount meaningfully shrinks further; with
commons gone, the discount now mostly applies to already-more-expensive
rare/epic/legendary stock, where a flat percentage buys proportionally
less relief — but at -1.6pp (within one Wilson interval) this reads as
noise, not a real interaction, and is recorded rather than acted on.

No band/gate/reference-fleet was touched. `npx tsx scripts/enemyValue.ts`
was not re-run — this iteration changed no part's `.cost` and no enemy
stat (only which frames a shipyard's offer pool contains and how a hull's
mark is priced/applied), so by the same "never calls
`canEquip`/`layoutCanHold`/`powerBudget`" reasoning every prior
power/hull-iteration's status notes have already established for that
script, there was no real chance of drift to check.

### Deviations from the spec's exact text

- **`ShopScreen`'s `act` prop dropped entirely**, not just its pass-through
  to the old refit section. The spec doesn't mention this prop at all; it
  existed solely to let `ShipyardRefitSection` evaluate `canRefit`'s
  legendary-act gate, which has no mark equivalent (marks have no rarity/
  offer-stock gate of any kind — see 59.3's own "no shopFrameOffers/rarity
  gate" note). Left in place, it would have been an unused prop under the
  repo's `noUnusedParameters`/`noUnusedLocals` strictness; removed instead
  of threading it through unused.
- **A maxed (mark-III) ship simply drops out of `ShipyardMarkSection`'s row
  list**, rather than showing a maxed/disabled state — the spec's own
  59.4 explicitly left this as "implementer's call, note it." Chosen over
  a maxed row because a shipyard visit already lists eligible ships only
  (mercenaries never appear either) — a permanently-maxed row would be
  dead weight with no action ever available on it, the same "no dead
  clicks" discipline the rest of the shop follows.
- **No wiki hull-table/prose change beyond one new Core Rules bullet** —
  59's own instruction was "update the wiki's hull-section prose if it
  states the old [rarity] rule"; it didn't (the table just lists rarity
  per hull with no prose asserting a store/shipyard split), so nothing
  there needed changing. The one addition (a hull-marks bullet, matching
  the existing Power bullet's style) goes beyond the letter of the spec's
  ask but was cheap and keeps the wiki's "every mechanic gets one Core
  Rules bullet" pattern consistent for a new permanent-purchase mechanic.
- **Concurrency**: `FleetPanel.tsx`, `FleetOverlay.tsx`, and `frames.ts`
  were all confirmed mid-edit by the concurrent declutter/60.8 session
  during this implementation (a `PostToolUse` file-change notification
  fired on `frames.ts` after this session's own `frameDisplayName`
  addition, showing that session's blurb-trimming pass; `FleetOverlay
  .tsx` came back "modified on disk" after this session's own targeted
  edit applied). Every touch was re-read immediately before/after editing
  per the plan's own concurrency discipline; nothing from that session was
  reverted, and this session's `frameDisplayName` addition and the
  `effectiveSlotLayout`/`effectiveSlots` mark-param threading landed
  cleanly against its already-updated (bolt-icon `PowerPipRow`,
  trimmed-blurb `frames.ts`) state.

No fixture (`scripts/balance.ts`'s hand-built fleets, `budget.ts`'s
`buildFleet`, `STARTING_FIT`/`STARTING_LOADOUT`) needed any change — none
of them touch `drawFrameOffers`, and none construct a marked
`PlayerShipState` (a mark is purely something `UPGRADE_MARK` grants
mid-run), so every existing fixture/guard test kept passing unmodified.
