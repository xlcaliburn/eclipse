# Iteration 15 — complete

> **Status:** implemented and browser-verified 2026-08-02. All three
> milestones (cargo, heat, repair choice + save v5) landed in one pass —
> the three systems share almost no code, so there was no benefit to
> re-verifying the suite between them. `npx vitest run` 372/372 (43 new
> tests over the pre-iteration baseline of 329: cargo-tag generation and
> determinism in `map.test.ts`, `heat.test.ts` for the tier/arithmetic
> unit, and reducer suites for cargo reward payouts, heat arithmetic,
> heat-4 interception, and the repair-choice flow including the
> save/reload regression), `npx tsc -b` clean, `npx vite build` clean.
> `SAVE_VERSION` is now 5.
>
> Fixing 4 pre-existing reward-math tests that broke as a side effect of
> 15.1 turned up a latent test-hygiene issue worth flagging: several
> `reducer.test.ts` fixtures read a node's reward straight off a
> *non-overridden* position in a randomly-seeded map (`initialRunState()`
> draws a real `Math.random()` seed, never mocked in these tests). Before
> cargo, a node's type/position never affected reward math, so this was
> harmless; now it can silently roll a cargo tag into the expected value.
> Fixed by extending the existing `forceNodeType` test helper to also
> accept (and always explicitly set, defaulting to `undefined`) a cargo
> override, and using it at every position a reward assertion reads from.
>
> Live-browser-verified via the localStorage-injection technique (a real
> generated map + fleet from an actual New run, commander = Merchant,
> then patching `heat`/`position`/`visited` directly before reload,
> mirroring the save envelope): cargo glyphs (`·`/`$`/`⚙`/`♦`) rendered on
> the starchart exactly where the node's type was already fog-visible,
> with the matching label/description tooltip, and the prep screen stated
> the tag plainly ("Patrol — Standard payout."); the HUD heat track
> showed 4 empty pips at "Cold", ticked to 1 filled pip on a repair-node
> entry (tooltip "Heat: Watched"), and dropped back on a combat win;
> forcing `heat: 4` and walking into an event node produced "Hunted — the
> next stop you make, they find you." on the HUD and, on arrival, replaced
> the event entirely with a `prep` screen against "Hunter-killer squad
> (Missile frigate)" (flavor: "They tracked your heat signature across the
> sector and finally ran you down.") — the event's own options never
> rendered; winning it paid `winReward(2) + the Merchant's +2` (8 credits)
> and reset heat to 0 (pips confirmed empty, tier back to "Cold"). The
> repair yard's choice screen rendered both branches ("Full repair" /
> "Overhaul" with its 3 upgrade tiles); overhaul attached the chosen
> upgrade with no healing and set `repairSummary`; a full reload
> mid-choice (`repairUpgradeOptions` set, `repairSummary` still undefined)
> came back to the exact same choosing screen rather than blanking — the
> regression the plan called out by name; a second repair visit with the
> fleet's only ship already carrying an upgrade rendered "Locked — every
> ship already carries an upgrade." instead of the picker, and "Full
> repair" there still worked normally.
>
> Deviations from the letter of the spec, all judgment calls made to keep
> the smallest reasonable footprint on the existing engine:
> - **`REPAIR_CHOOSE`'s exact shape** differs from the spec's illustrative
>   `{ overhaul: { shipIndex, upgradeId } }` (explicitly implementer's
>   latitude): it's `{ choice: 'full' } | { choice: 'overhaul'; shipIndex;
>   upgradeId }`, a discriminated union on one `choice` field rather than
>   an optional nested object.
> - **The overhaul's 3 upgrade options are drawn once, at arrival**
>   (`PICK_NODE`), not lazily when "Overhaul" is clicked — regardless of
>   which branch the player ends up taking. This is what makes a single
>   `REPAIR_CHOOSE` dispatch enough for the overhaul branch (no second rng
>   step needed mid-choice) and is also what the choosing sub-state's
>   `repairUpgradeOptions` field persists across a save/reload. Costs one
>   harmless unused rng draw on the "Full repair" branch.
> - **"Every ship at the upgrade cap"** (15.3's overhaul lock condition)
>   is read as "every ship already carries a (permanent, at-most-1)
>   upgrade" — addendum A.4's existing cap, not a new concept. The spec
>   didn't define the phrase itself.
> - **`hasLineOfRetreat`** gained one bypass: an interception is exempted
>   from the pre-existing "no retreat once jumped from an event" rule,
>   since an interception can land on an event-typed node too but (unlike
>   an in-event ambush choice) must "follow normal retreat rules" per
>   15.2. Gated on the new `RunState.interceptionActive` flag.
> - **Cargo tags are not excluded from bounty-target fights.** The spec's
>   exclusion list is "elites, bosses, the opener"; a bounty node is a
>   plain 'combat' node with a renamed enemy (id suffix `-bounty`, not
>   `-elite`), so it was never structurally excluded from the `isElite`
>   guard either. Cargo and the bounty bonus can now both apply to the
>   same fight; not explicitly discussed in planning, called the
>   permissive way as the smaller diff.
> - **The wreck-field part pool** is `PARTS.filter(p => p.cost === 5)`
>   rather than a bespoke list — this happens to be exactly the same 5
>   ids as `events.ts`'s private `FIVE_CREDIT_PARTS`, derived instead of
>   duplicated so it can't drift from `parts.ts`.
> - **Cargo glyphs**: patrol (the baseline, no-op tag) still gets a glyph
>   (`·`) and tooltip rather than no badge at all, on the reading that
>   "wherever the node's type is visible, its cargo glyph... [is] too"
>   applies uniformly across all 4 tags, patrol included.

# Iteration 15 (planned) — Routing under pressure

**Thesis.** Playtesting shows the run's routing policy has collapsed to a
single threshold check: fight while healthy, then coast through
events/shops/yards when hull runs low. Three causes: combat nodes are
homogeneous (nothing to route *toward*), avoidance is free (its cost —
arriving at the boss poorer — is invisible and diffuse), and the safe
nodes contain no decisions. This iteration attacks all three with
mechanisms proven elsewhere in the genre: reward-typed nodes (Hades door
previews / Void Bastards manifests), a pursuit track that prices
avoidance (FTL's rebel fleet), and repair yards that offer power instead
of healing (Slay the Spire's rest-or-smith).

Decisions taken in planning chat (2026-08-02):

- Anchor mechanisms: **typed combat rewards + heat track + repair
  choice**. Sparser map edges were considered and deliberately skipped —
  commitment-based routing and pursuit-based routing compete for the same
  slot, and heat won.
- Parking-lot note: **hazard tags on combat nodes stay parked
  indefinitely** — heat now occupies the "second map-pressure system"
  slot they were being held for.
- All chances roll through the run rng stream; all player-facing risk
  language stays fictional/tiered (iteration 14's law), and heat is
  deliberately **deterministic** — a visible track, not a hidden roll.

**Sequencing: implement only after iteration 14 lands.** Both iterations
touch reducer.ts, types.ts, persistence.ts, and App.tsx; 14 claims
SAVE_VERSION 4, this iteration claims **SAVE_VERSION 5**.

## 15.1 Typed combat rewards — cargo tags

Every non-elite combat node gets a **cargo tag** assigned at map
generation (seeded, stored on the node — `MapNode.cargo`):

| Tag | Weight | On win, replaces the plain payout |
|---|---|---|
| **Patrol** | 3 | Baseline — `winReward(col)` exactly as today |
| **Convoy** | 2 | `winReward(col) + 4` credits |
| **Wreck field** | 2 | `winReward(col) − 2` credits (floor 1) **+ a random part from the 5-cr pool** into inventory |
| **Command ship** | 1 | `winReward(col)` **+ a random reaction card**; hand full → +4 cr instead (mirrors the elite fallback) |

- Enemy draws are **unchanged** — the tag types the reward, not the
  fight. (If a later pass wants convoys to feel like convoys, that's
  enemy-roster work, not this iteration.)
- Elites, bosses, and the opener are untagged and unchanged.
- Visibility follows the existing fog rules exactly: wherever the node's
  *type* is visible, its cargo glyph + tooltip are too (starchart), and
  the prep screen states it plainly ("Convoy — pays +4 credits").
- `CONTINUE`'s reward path reads the tag from the node at
  `state.position`. Nothing else in the reward pipeline moves.

## 15.2 The heat track — pursuit that prices avoidance

New RunState field `heat: number` (0–4), shown as a 4-pip track in the
HUD with tier words, never percentages: **0 Cold · 1–2 Watched ·
3 Tracked · 4 Hunted**.

- **+1 heat**: entering a shop, repair, or event node. **+1**: winning by
  Withdraw (they watched you run).
- **−1 heat** (floor 0): winning any combat, elite, or boss fight — won
  fights leave no one to report your position; docking and lingering
  does.
- **At heat 4** the track is armed ("Hunted — the next stop you make,
  they find you"): the next non-combat node the player enters is
  **intercepted**. The node's content is *replaced* — you never reach the
  dock — by a hunter ambush: prep → combat against
  `hardestEnemyForAmbush(act, col)`, flavored as a hunter-killer squad,
  paying a normal `winReward(col)`. Afterwards heat resets to 0 and play
  returns to the map. Losing the stop you routed for **is** the
  punishment; no content is stashed or deferred (deliberately simpler
  than an FTL-style delay — decision, not oversight).
- Withdrawal from an interception follows normal retreat rules; heat
  still resets (they found you either way — the track restarts).
- **Heat resets to 0 at the interlude** (crossing the sector border
  shakes pursuit), matching the existing position/fog reset.
- Determinism: no rolls at all — the entire mechanism is counter
  arithmetic, fully plannable from the HUD. This is the legible,
  numbers-stripped version of FTL's fleet.
- Emergent note, accepted: an event node costs +1 on entry, and an event
  ambush won inside it vents −1 — net 0. Fine; fighting is fighting.

## 15.3 Repair yards become a choice

On arriving at a repair node the player chooses one (two options, both
strong — no mushy third):

- **Full repair** — exactly today's behavior.
- **Overhaul** — no healing; pick one ship, then pick 1 of 3 upgrades
  (the same 3-choice draw and picker flow elites use). Locked (grayed,
  with reason) when every ship is at the upgrade cap.

This cuts both ways deliberately: wounded fleets still get their heal,
but *healthy* fleets now have a reason to route through yards — and
doing so ticks heat (+1), so the greedy detour carries the new pressure.

**Plumbing warning (blank-screen class of bug — be careful):** the
'repair' phase gains a *choosing* sub-state before `repairSummary`
exists. Both `App.tsx`'s phase render guard (`phase === 'repair' &&
repairSummary`) and `persistence.ts`'s `isValidRunState` (which currently
requires `repairSummary` for the repair phase) MUST be updated to accept
the choosing sub-state, or a mid-choice save will reload to a blank
screen. Add an explicit regression test for a save/reload mid-choice.

New action shape (implementer's latitude on exact form):
`REPAIR_CHOOSE` with either the repair choice or
`{ overhaul: { shipIndex, upgradeId } }`, validated in the reducer;
`LEAVE_REPAIR` unchanged.

## 15.4 Save + integration

- **SAVE_VERSION → 5** (after 14's 4): `heat`, `MapNode.cargo`, and the
  repair-phase relaxation all change the shape.
- HUD: heat pips join the bar (credits | heat); keep it quiet — the tier
  word appears in the tooltip, "Hunted" state gets a subtle warning tint.
- Starchart: cargo glyphs on combat nodes; interception has no map
  presence (it happens on entry).

## 15.5 Tests

- Cargo: seeded generation is deterministic; each tag pays its table row
  exactly; wreck-field floor at 1 cr; command-ship hand-full fallback;
  elites/boss/opener never tagged.
- Heat: +1/−1 arithmetic per node type; floor 0 / cap 4; withdraw +1;
  armed-at-4 → next non-combat entry becomes prep-vs-hunter and the
  node's own content never fires; reset after interception (win *or*
  withdraw) and at the interlude; boss/combat entries never intercepted.
- Repair: both choices; overhaul locked at upgrade cap; validator +
  App guard accept the choosing sub-state; save/reload mid-choice
  regression test.
- Determinism: identical seeds → identical cargo maps and identical
  interception timing.

## 15.6 Milestones

- **I15-M1 — cargo:** map-gen tags + reward wiring + starchart/prep
  display. Suite green; existing reward tests untouched except where the
  table deliberately changes payouts.
- **I15-M2 — heat:** state + arithmetic + interception flow + HUD track.
- **I15-M3 — repair choice + save v5:** the rest-site rework, validator/
  guard updates, full test pass, browser verification (cargo glyphs
  visible under fog rules, heat pips ticking, an interception firing, an
  overhaul picked end to end).

**Definition of done:** a healthy fleet has a reason to visit a yard; a
wounded fleet dodging fights can see exactly when the dodge will stop
working; two players with the same seed see the same cargo map and get
intercepted at the same moment; `npm test`, `tsc -b`, `vite build`
green; browser-verified.
