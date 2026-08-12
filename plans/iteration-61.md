# Iteration 61 — Bonus removal, Emergency Vectoring, starting-weapon defaults (specced 2026-08-12)

> **Status: implemented and verified** (tsc/vitest/build clean, 861/861 —
> 855 baseline + 6 new: 3 for `deriveStats`/`upgradeRedundantOn`/
> `withUpgrade` in `ship.test.ts`, 3 for the `PICK_UPGRADE`/`REPAIR_CHOOSE`
> reducer-side reject in `reducer.test.ts`). Sim smoke
> (`scripts/sim/agent.test.ts`, 7/7) confirms zero `rejectedDispatch`
> across every archetype/commander/seed. `npm run balance:full`
> (report-only, n=500/commander): every commander moved DOWN vs iteration
> 59's table, as expected (auto -1.2pp, merchant -0.6pp, engineer -3.6pp,
> spymaster -1.0pp, admiral -0.4pp, warlord -1.2pp) — no tuning applied,
> per the spec. See status notes at the end for the full table, deviations,
> and judgment calls.
>
> **Concurrency warning**: the working tree carries UNCOMMITTED work from
> iterations 58 (reactors), 59 (hull marks — `UPGRADE_MARK`,
> `ShipyardMarkSection.tsx`, shipyard stocks rare+), and 60 (declutter —
> trimmed blurbs, folds, `PowerBoltIcon`). All three are implemented and
> verified; the CURRENT TREE is authoritative. Re-read every file
> immediately before editing it and never revert a hunk you didn't write.

## Motivation (user direction, 2026-08-12)

Three confirmed decisions, one review cycle each:

> *"now that we've made quite a few changes to the tier system, i'm not
> sure the random bonus still makes sense for us to keep. i'm leaning
> towards removing it altogether"* → confirmed: **remove it**.
>
> *(on standardizing the dodge)* → confirmed name: **"Emergency
> Vectoring"**. And: *"i want interceptors to keep this free bonus, as
> other ships don't have that ignore the first hit ability"* — the
> Interceptor (and Valkyrie) **keep their innate Jink**; the augment is a
> way for OTHER ships to acquire it, not a replacement.
>
> *"i think everything should default to ion, however the speed-biased
> ships like interceptor should be missile based"*.

Context that led here: the user reported a shipyard Bastion apparently
carrying a Cloaking field. The data has no such innate — it was
`hullRarityBonus`'s random rare-item roll, which filters by slot fit only,
not identity fit (a cloaked Bastion hides while its escorts get shot —
exactly backwards). Removing the bonus kills that whole bug class.

## 61.1 Remove the shipyard random bonus item

The bonus existed (iteration 39) to differentiate pristine-shipyard from
second-hand-store purchases when both sold the same hulls. Iteration 59
made shipyards stock rare-or-better hulls and added marks — the bonus is
now a third overlapping tier-flavor system, and the random one. Iteration
52's measurement notes also flagged bonus compounding as the most
plausible economy over-correction.

Delete, in `src/game/reducer/shop.ts`:

- `hullRarityBonus` and `RARE_PARTS_POOL` (~lines 197–240) and every
  comment referencing them (there is one near line 271 and a block near
  601–615).
- The `BUY_SHIP` branch's bonus consumption AND its no-preview fallback
  roll (~601–615). After this, `BUY_SHIP` grants exactly the frame +
  `STARTING_FIT` and nothing else.
- The `LEAVE_SHOP` clear of `shopFrameBonusPreview` (~774).

Delete elsewhere:

- The `PICK_NODE` pre-roll in `src/game/reducer.ts` (~857–867) that
  builds `shopFrameBonusPreview` for shipyard offers.
- `RunState.shopFrameBonusPreview` (`src/game/types.ts:448`).
- The `frameBonusPreview` prop: `src/App.tsx:359` → `ShopScreen.tsx`
  (prop, its render of included bonus items, and the comment near line
  221 that references `hullRarityBonus`).
- Check `src/wiki/Wiki.tsx` for any bonus-item mention and remove it.

Care points:

- **Save compat**: `shopFrameBonusPreview` is optional on `RunState`.
  Verify `persistence.ts` load validation tolerates its absence AND its
  presence on a stale save (it should simply be dropped/ignored). Only
  bump `SAVE_VERSION` if the validator actually requires it — expected
  answer: no bump.
- **RNG stream**: `PICK_NODE` at shipyards now consumes fewer `rng`
  draws, so seeds diverge from previous builds' runs. Expected and fine;
  determinism *within* a build is unaffected.
- **Tests**: rewrite the `hullRarityBonus`/`shopFrameBonusPreview` tests
  in `reducer.test.ts` (and any in `ship.test.ts`) into the new
  invariant: a bought hull arrives with exactly `STARTING_FIT[frameId]`.
- Do NOT touch mark or reactor logic living in the same files.
- Knock-on recorded, not solved here: epic/legendary hulls lose 2–3 free
  rare items of value; prices may deserve a look at the next balance
  pass. **Do not reprice hulls in this iteration.**

## 61.2 Emergency Vectoring — the dodge as an earnable augment

New augment in `src/game/upgrades.ts` (pool grows 7 → 8):

```ts
{ id: 'vectoring', name: 'Emergency Vectoring', description: 'Once per combat, the first hit that would land on this ship misses instead.' }
```

- `deriveStats` (`src/game/ship.ts`, the upgrade loop at ~line 156):
  `'vectoring'` sets `stats.jink = true`. The combat engine already
  consumes `jink` (Interceptor/Valkyrie innates) — zero engine changes.
- **Innates stay**: Interceptor and Valkyrie keep innate Jink verbatim.
  Naming note (deliberate, decided in chat): "Emergency Vectoring" was
  chosen over "Evasive Maneuvers" to avoid blurring with the existing
  *Evasive pattern* (fleet order), *Evasion suite* (part), and *Evasive
  doctrine* (counter-protocol).
- **Redundancy guard** — `jink` is a boolean, so Vectoring on an
  innate-jink hull is a dead pick:
  - Reducer-side: reject applying `'vectoring'` to a ship whose frame
    innate already grants `jink` (guard in the `PICK_UPGRADE` /
    `REPAIR_CHOOSE`-overhaul / any `withUpgrade` path — put the check in
    ONE shared place, not three). Warlord's random starting augment rolls
    onto the Flagship (no innate jink) — unaffected, but make the random
    draw respect the guard anyway if it can ever hit a jink hull.
  - UI-side: wherever the player picks the target ship for an augment
    (RewardScreen, RepairScreen overhaul), disable innate-jink ships for
    this augment with a `title` like "Already dodges the first hit".
    Follow whatever per-ship disable pattern those pickers already have;
    if none exists, add the minimal one.
  - **Sim agent**: `scripts/sim/agent.ts` dispatches `PICK_UPGRADE`
    against the real reducer, and a rejected dispatch trips the
    `rejectedDispatch` liveness guard. Update its upgrade/target policy
    to never aim `'vectoring'` at an innate-jink ship (pick another
    target or another upgrade). Run a short sim smoke
    (`npm run balance` or a reduced-N invocation) to prove no rejected
    dispatches before the full pass.
- Wiki: confirm the augment list auto-renders the new entry.
- Tests: `deriveStats` grants jink from `'vectoring'`; the reducer guard
  rejects vectoring onto an Interceptor and accepts it onto (say) a
  Frigate; existing pool-size expectations updated if any assert 7.

## 61.3 Starting weapons — ion by default, missiles on the fast hulls

Rule: every hull's `STARTING_FIT` weapon defaults to `'ion'`;
**speed-biased hulls carry `'light-missile'` instead**. Speed-biased =
`baseInitiative >= 2`: **Interceptor (2), Destroyer (3), Valkyrie (4)**.

Judgment call, recorded: the Corvette (init 1) is a *utility* hull — its
capacitor innate is evasion flavor, not speed — so it flips to ion with
the rest. If the user disagrees it's a one-line revert.

Changes in `src/game/reducer/shop.ts` `STARTING_FIT`:

| frame | now | becomes |
|---|---|---|
| interceptor | `['ion']` | `['light-missile']` |
| destroyer | `['ion']` | `['light-missile']` |
| valkyrie | `['ion']` | `['light-missile']` |
| derelict | `['light-missile']` | `['ion']` |
| corvette | `['light-missile']` | `['ion']` |
| ew-cutter | `['light-missile']` | `['ion']` |
| tender | `['light-missile']` | `['ion']` |

Everything else (incl. `MERCENARY_FIT = ['ion']`) unchanged.

Knock-ons:

- **Admiral**: the `CHOOSE_COMMANDER` branch equips his free
  Interceptors `['ion']` — must match the new fit (`['light-missile']`),
  and `src/game/commanders.ts`'s "two free, ion-fitted Interceptors"
  bullet becomes "missile-fitted". Grep for other "ion-fitted" strings.
- **Blurbs/copy**: the Corvette blurb's "Arrives fitted with a light
  missile." sentence goes (60's trim left flavour lines — keep those).
  Grep blurbs/tooltips for other starting-weapon mentions and align.
- The prep screen's missile-only warning is now reachable from an
  Admiral start (all-Interceptor fleet = all missiles). That warning is
  correct and stays; just confirm it reads sensibly there.
- **No reprice**: light-missile is 2cr vs ion's 3cr — within noise;
  hull costs stay put (see 61.1's recorded knock-on).
- Tests: update any `STARTING_FIT` expectations.

## 61.4 Verification

- `npx tsc -b --force` clean, `npx vitest run` green, `npx vite build`
  clean. No browser passes (this is game data + minor desktop UI, not
  mobile work).
- `npm run balance:full`, **report-only**: record the per-commander table
  in this file's status notes next to iteration 59's table (in
  `plans/iteration-59.md`'s status notes) and call out deltas. Expected
  direction: slightly DOWN (hulls lose free bonus items). **Do not tune
  anything** — the difficulty-curve work is iteration 55's, already
  specced.
- Record status notes, deviations, and the balance table at the top/end
  of this file in the established style.

## Status notes (implementation, 2026-08-12)

### 61.1 — bonus removal

Deleted exactly what the spec named: `hullRarityBonus`, `RARE_PARTS_POOL`,
and every comment referencing them in `src/game/reducer/shop.ts`; the
`BUY_SHIP` bonus-consumption/no-preview-fallback block (now `equipped:
[...STARTING_FIT[action.frameId]]`, nothing else); the `PICK_NODE`
pre-roll in `src/game/reducer.ts`; `RunState.shopFrameBonusPreview` in
`src/game/types.ts`; the `frameBonusPreview` prop end-to-end
(`src/App.tsx` → `src/components/ShopScreen.tsx`, including its bonus-item
render block and the `bonusLevel`/bonus-count fallback text). `RARITY_ORDER`
and the frame's rarity label stay — they're now a pure tier indicator, not
a promise of bonus gear. Removed the now-dead `.frame-card__bonus` CSS
rule (`src/styles.css`) and the unused `canEquip`/`runRng` imports left
behind in `reducer/shop.ts`. `src/wiki/Wiki.tsx` had no bonus-item mention
to begin with — confirmed, not touched. `persistence.ts`'s
`isValidRunState` never referenced `shopFrameBonusPreview` — no save-compat
code needed; **no `SAVE_VERSION` bump**, as expected (an old save carrying
the stale field simply carries dead, never-read data forever).

Tests: `reducer.test.ts`'s `BUY_SHIP` describe blocks rewritten around the
new invariant — a bought hull's `equipped` equals `STARTING_FIT[frameId]`
exactly, store or shipyard, any rarity tier. `ship.test.ts` had no
`hullRarityBonus` references to begin with.

### 61.2 — Emergency Vectoring

Added `{ id: 'vectoring', name: 'Emergency Vectoring', ... }` to
`src/game/upgrades.ts` (pool 7 → 8) and a `case 'vectoring': stats.jink =
true;` to `deriveStats`'s upgrade loop (`src/game/ship.ts`) — zero combat-
engine changes, exactly as specced.

**Redundancy guard, one shared place**: added
`upgradeRedundantOn(ship, upgradeId)` next to `withUpgrade` in
`ship.ts` (`upgradeId === 'vectoring' && getFrame(ship.frameId).innate
?.grants.jink === true`). Two things read from it, not three
reimplementations:
1. `withUpgrade` itself no-ops (returns the ship unchanged) when the guard
   fires — this alone covers every random-draw path (`INTERLUDE_CHOOSE`,
   the Warlord's `CHOOSE_COMMANDER` pick) automatically, including the
   spec's "make the random draw respect the guard anyway if it can ever
   hit a jink hull" ask, with no extra code at those call sites.
2. `PICK_UPGRADE` and `REPAIR_CHOOSE`'s overhaul branch (`reducer.ts`)
   each call the same predicate *before* mutating and `return state;` on a
   hit — a real rejected dispatch (same reference-equality convention
   every other reducer guard uses), not a silent no-op dressed as success.

UI: `RewardScreen.tsx` and `RepairScreen.tsx`'s `ShipPickRow` calls both
gained `disabledFor={(ship) => upgradeRedundantOn(ship, selectedUpgrade)}`
and a `title="Already dodges the first hit"` on the disabled case —
`ShipPickRow` already had a `disabledFor`/`titleFor` pattern from its
47.3a extraction, so no new prop plumbing was needed.

**Sim agent**: `PICK_UPGRADE` in `scripts/sim/agent.ts`'s `step()` always
targets `flagshipIndex(state.fleet)` (the Flagship, `'cruiser'`), which
has no innate at all — so the redundancy guard was already unreachable in
practice before any change. Filtered the offered options against
`upgradeRedundantOn` anyway (falling back to the unfiltered list only if
every option is somehow redundant) so this policy can't start silently
tripping `rejectedDispatch` if the target ever stops being flagship-only.
`REPAIR_CHOOSE`'s overhaul branch and `INTERLUDE_CHOOSE` are both already
safe by construction (the agent never dispatches an overhaul, and
`INTERLUDE_CHOOSE`'s random upgrade is applied through the now-guarded
`withUpgrade`, which no-ops rather than rejects). Sim smoke:
`scripts/sim/agent.test.ts`, 7/7 green, zero `rejectedDispatch` across
every archetype/commander/seed.

Wiki: `UPGRADES.map(...)` already renders the augment table generically —
confirmed the new entry shows up with no template change needed.

### 61.3 — starting weapons

`STARTING_FIT` (`src/game/reducer/shop.ts`) changed exactly per the
spec's table: interceptor/destroyer/valkyrie → `light-missile`;
derelict/corvette/ew-cutter/tender → `ion`. `MERCENARY_FIT` untouched.

**Judgment call (recorded, as the spec pre-authorized)**: kept the
Corvette on the `ion` default rather than treating it as speed-biased,
per the spec's own reasoning (baseInitiative 1, and its capacitor innate
is evasion flavor, not speed) — no deviation, this was already the
spec's stated call, just confirmed against `frames.ts`'s actual
`baseInitiative: 1`.

**Spec-table vs. spec-rule mismatch, worth flagging**: the spec states the
general rule as "speed-biased = baseInitiative >= 2: Interceptor (2),
Destroyer (3), Valkyrie (4)," but `frames.ts` shows `ew-cutter` (Picket)
also has `baseInitiative: 2` — under the stated rule alone it would
qualify as speed-biased too, yet the spec's own explicit table puts it on
`ion`. Followed the literal table (authoritative, names all 7 frames
explicitly) rather than the general-rule sentence — no code ambiguity, but
noting the inconsistency in case it wasn't intentional.

Knock-ons: `CHOOSE_COMMANDER`'s Admiral branch (`reducer.ts`) now equips
his two free Interceptors with `[...STARTING_FIT.interceptor]` instead of
a hardcoded `['ion']` (one source of truth, not a second copy of the
fit — also required adding `STARTING_FIT` to `reducer.ts`'s own import
from `reducer/shop.ts`, since it was previously only re-exported, not
imported into local scope). `commanders.ts`'s Admiral bullet: "two free,
ion-fitted Interceptors" → "two free, missile-fitted Interceptors". Grepped
for other "ion-fitted"/"arrives fitted"/"light missile" mentions:
`frames.ts`'s Derelict blurb ("Arrives fitted with a light missile.") →
"...with an ion cannon."; the Corvette blurb's weapon-mention sentence was
dropped entirely per the spec's explicit instruction (60's declutter left
flavor-only lines; the starting fit is already previewed by the shop
card's own `FitChips`). Freighter's "Arrives fitted with an ion cannon."
was already correct (unchanged fit) — left alone. The prep screen's
missile-only warning (`PrepScreen.tsx`) reads sensibly from an
all-Interceptor Admiral start — confirmed, no change needed. No repricing
touched, as instructed.

Tests: `reducer.test.ts`'s Interceptor/Corvette `BUY_SHIP` tests updated
to the new fits (light-missile / ion respectively); the Admiral
`CHOOSE_COMMANDER` test updated to expect `STARTING_FIT.interceptor`
instead of a hardcoded `['ion']`. `ship.test.ts`'s two `STARTING_FIT`
legality/power-budget guard tests iterate the record generically — no
changes needed, they picked up the new fits automatically.

### Balance: `npm run balance:full` (n=500/commander, report-only)

Act-1 clear rate, vs. iteration 59's table
(`plans/iteration-59.md`'s status notes):

| Commander | Iteration 59 | Iteration 61 | Δ |
|---|---|---|---|
| Baseline (auto) | 12.6% | 11.4% | -1.2pp |
| Merchant | 11.8% | 11.2% | -0.6pp |
| Engineer | 18.4% | 14.8% | -3.6pp |
| Spymaster | 10.2% | 9.2% | -1.0pp |
| Admiral | 9.8% | 9.4% | -0.4pp |
| Warlord | 13.8% | 12.6% | -1.2pp |

Full-run clear stayed 0.0% everywhere (act-2 conditional 0%, the same
`KNOWN GAP` referenced by every prior iteration's table — unaffected by
this pass, consistent with 61 touching only act-1-reachable systems).

Every commander moved DOWN, exactly the spec's predicted direction — a
purchased hull losing its rarity-scaled bonus item(s) is a real, if small,
power loss across the board, and it lands hardest on the commanders whose
policy routes through shipyards most (Engineer's -3.6pp is the largest
single move; a 500-run Wilson interval is roughly ±3pp at these rates, so
this one is a plausible real effect rather than pure noise, though nothing
close to alarming). No loosening or tightening lever was pulled — the spec
is explicit that this is report-only and that difficulty-curve
compensation is iteration 55's job, not this one's.
