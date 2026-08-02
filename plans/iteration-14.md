# Iteration 14 — complete

> **Status:** implemented and browser-verified 2026-08-02. All three
> milestones (framework, content, defector chain) landed in one pass
> rather than sequentially — the scope was small enough that splitting
> verification between M1/M2/M3 would have meant re-testing the same
> option-list machinery three times. `npx vitest run` 328/328 (was
> 286/286 pre-iteration; 42 new tests: predicate-library unit tests, one
> resolution test per 14.2 table option, EVENT_CHOOSE framework
> validation, the defector chain, and two persistence roundtrips),
> `npx tsc -b` clean, `npx vite build` clean. SAVE_VERSION is now 4.
>
> Live-browser-verified via the localStorage-injection technique
> (real generated map + fleet from an actual New run, then patching
> `phase`/`currentEvent`/`credits`/`hand` before reload, mirroring the
> save envelope): a locked option (Repair tender's "Pay for repairs"
> at 2 credits) rendered grayed (`opacity: 0.5`, `cursor: not-allowed`)
> with its `reqText` visible, and unlocked correctly once credits rose
> to 10; the ship picker (Repair tender) and card picker (Militia
> requisition) both expanded inline and dispatched the right
> `shipIndex`/`cardId`; an ambush (Distress beacon's "Drive the raiders
> off") routed into `prep` with an easy-pool enemy and
> `pendingAmbushBonus: { credits: 6, partId: 'plasma' }` attached, and
> winning that fight paid out base-reward-plus-bonus (+10 credits at
> column 0: `winReward(0)=4` + the 6-credit bonus) and dropped the
> Plasma cannon into inventory, clearing the pending field; the full
> defector chain fired end-to-end — "take them aboard" set
> `pendingEventId`, the next event node drew "The pursuit" with its
> Cloaking-field option correctly locked, and the field was cleared on
> consumption.
>
> Deviations from the letter of the spec, all judgment calls made to
> keep the smallest reasonable footprint on the existing engine — see
> "Implementation notes" at the end of this file for the reasoning
> behind each:
> - Added `RunState.pendingAmbushBonus` / `EventResolution.ambushBonus`
>   (not in 14.1's literal shape) so the two "win → +N credits [and a
>   part]" table rows (defector-pursuit, distress-beacon) could pay
>   exactly what the table says instead of just riding the standard
>   per-column combat reward.
> - Repair tender's "spread across chosen ships" is a single chosen
>   ship (the framework's `chooseShip` is one index, not a set).
> - The requirement predicate library omits `commanderIs` — the 14.2
>   table never uses it, and the spec said to keep the library to what
>   the table actually needs.
> - defector-pursuit's "hard-pool pick for the column" is a random pick
>   from the act's `HARD_POOL`/`HARD_POOL_ACT2`, not scaled down for an
>   early column — the old wing hunts you at full strength regardless
>   of when the chain fires.
> - Dropped `CurrentEventState.offeredPartId`, an unused field from a
>   "wandering-trader" event that was never implemented.



**Thesis.** Iteration 13's intel removal deleted the game's only
accumulate-then-spend loop outside credits; the remaining between-fight
verbs are route-picking, shopping, and equipping. Rather than invent a new
resource, this iteration deepens the surface we already have: events. Today
all 8 events share one template — *flat credits* vs *the actual event* —
with three structural faults: the right answer rarely depends on the run,
costs are random rather than chosen, and nothing reads the fleet the player
spent the whole game assembling. This iteration makes events the place
where builds pay off outside combat.

Decisions taken in planning chat (2026-08-02, all four confirmed):

- **Scope: events only.** Combat objectives stay in the parking lot for
  their own iteration.
- **Gated options are shown locked** when unmet — grayed, with the
  requirement visible ("requires Cloaking field"). Parts become
  aspirational; the shop gains event value.
- **Odds stay fictional.** No percentages anywhere in event copy — flavor
  signals risk ("the reactor looks unstable"), consistent with iterations
  13's numbers-stripping. This extends the parking lot's "no
  further random-outcome dice" spirit to presentation.
- **Chosen costs are events-only** this iteration. Withdraw/quests
  untouched.

**The one design law: costs are chosen, accidents are random.** If an
option's *price* is hull damage or a discarded card, the player picks the
ship or the card. If a *gamble* goes wrong, the victim may still be random
(the player chose to gamble; that was the decision). No event may ever
randomly damage a fleet whose owner picked a deterministic option.

## 14.1 Event framework

Replace the fixed A/B shape with a data-driven option list.

```ts
interface EventOption {
  label: string;                    // includes any deterministic cost in text
  requirement?: EventRequirement;   // unmet -> shown locked with reqText
  reqText?: string;                 // "requires Cloaking field"
  chooseShip?: boolean;             // UI collects a ship index before dispatch
  chooseCard?: boolean;             // UI collects a card from hand
}
```

- Events carry 2–4 options. Not every event needs 3+; two is fine where
  the third would be filler.
- **Requirements are a small reusable predicate library**, not ad-hoc
  closures per event. Needed kinds (derive from real fleet state via
  existing helpers): part equipped anywhere (`cloak`, `lure`, `dcbay`),
  every-ship initiative ≥ N, any-ship computer ≥ N, frame present
  (`bastion`, `interceptor`), hand size ≥ 1 / < MAX, credits ≥ N,
  commander is X. Keep it to what 14.2's table actually uses.
- `EVENT_CHOOSE` becomes
  `{ type: 'EVENT_CHOOSE'; choiceIndex: number; shipIndex?: number; cardId?: CardId }`
  (precedent: `ACCEPT_QUEST`'s `carrierShipIndex`). The **reducer
  re-validates** requirement, affordability, and sub-selection — the UI is
  never trusted; an invalid dispatch is a no-op.
- Resolver stays pure and rng-injected (`resolveEventChoice`), all draws
  through the run stream. Determinism from the run seed is preserved.
- `EventScreen` renders the option list; locked options grayed with
  `reqText`; `chooseShip` options expand an inline ship picker (reuse the
  delivery-carrier picker pattern), `chooseCard` an inline hand picker.
  Chosen-damage previews stay honest: "Sabotage the yard — a ship of your
  choice takes 2 damage."

## 14.2 Content — every event rewritten

Rules for the pass: at most **one** flat-credits option per event; at
least one option whose value depends on run state; damage-as-cost is
always chosen-ship (capped at hp−1 as today); hand-full is handled by an
option, never by a silent dead outcome.

| Event | Options (⚿ = gated, shown locked) |
|---|---|
| **Derelict cruiser** | Salvage (+4 cr) · Crack the reactor — *pick the boarding ship first*; risky: part (5cr pool) or that ship takes 2 · ⚿ *Damage control bay*: restore its systems — part + 2 cr, no risk |
| **Asteroid field** | Detour (−2 cr) · Thread it — risky: +5 cr or chosen ship takes 2 (ship picked up front, as above) · ⚿ *every ship initiative ≥ 2*: full burn — +5 cr, clean |
| **Ancient cache** | Leave it · Force it open — part (7cr pool) + patrol ambush · ⚿ *Cloaking field equipped*: slip in quietly — part, no ambush |
| **Abandoned arsenal** | Sell the scrap (+3 cr) · Take a crate (random card) ⚿ *hand has space* · Restock — discard a **chosen** card, then take the crate ⚿ *hand ≥ 1* |
| **Intercepted signal** | Sell the codes (+5 cr) · Decrypt — reveal next escalation · ⚿ *any ship computer ≥ 3*: deep-decrypt — reveal the next **two** |
| **Recon probe** | Strip it (+4 cr) · Launch it — next column's enemy pool + node types · ⚿ *Interceptor in fleet*: pace it in — pool + node types for the next **two** columns |
| **Shipyard raid** | Move on (+3 cr) · Hit the yard — cancel next unlanded escalation, **chosen** ship takes 2 escaping · ⚿ *Bastion in fleet*: the Bastion breaches — cancel it, its armor shrugs off the point-defense (no damage) |
| **Defector** *(multi-stage — see 14.3)* | Turn them in (+6 cr) · Take them aboard — reveal **all** escalations, and their old wing starts hunting you |
| **Distress beacon** *(new)* | Ignore it · Drive the raiders off — ambush vs an easy-pool enemy; win → +6 cr and a part in thanks · ⚿ *Lure beacon equipped*: draw them off — no fight, +4 cr gratitude |
| **Repair tender** *(new)* | Move on · Pay 4 cr — repair 3 damage, spread across **chosen** ships ⚿ *credits ≥ 4* · ⚿ *Damage control bay*: trade techniques — repair 3, free |
| **Militia requisition** *(new)* | Refuse · Donate a **chosen** reaction card — +7 cr ⚿ *hand ≥ 1* |

Interplay note, tuned knowingly: the info-flavored events are now the
**only** information access for non-Spymaster commanders — that's their
consolation prize, keep it. For the Spymaster several info payoffs are
partially redundant with the post-fight perk; that's acceptable (the
credits options are still live for them), no special-casing beyond what
the table shows.

## 14.3 Multi-stage: the defector chain

The single deliberately multi-stage event, proving the mechanism without
committing to a web of them.

- Taking the defector aboard sets `pendingEventId: 'defector-pursuit'` on
  RunState (new optional field — **SAVE_VERSION → 4**).
- The next event node the player enters draws `defector-pursuit` instead
  of rolling the pool, then clears the field. If the run ends first, it
  simply never fires.
- **The pursuit** ("Their old wing has tracked you down"): Stand and
  fight — ambush vs a hunt squad (hard-pool pick for the column); win →
  +8 cr, the bounty on their own hunters · ⚿ *Cloaking field*: slip away
  clean · Pay them off (−6 cr) ⚿ *credits ≥ 6*.
- Escalations revealed at stage 1 are **never** un-revealed — no takebacks
  on information, whatever happens in the pursuit.

## 14.4 Tests

- Framework: locked option dispatch is a no-op; requirement predicates
  against constructed fleets; chosen-ship damage capped at hp−1; chosen
  card actually leaves the hand; credits never go negative.
- Per-event: each row of the 14.2 table gets at least one resolution test
  per option (deterministic options exact; risky options pinned by seed).
- Defector chain: aboard → `pendingEventId` set → next event node is the
  pursuit → field cleared; turn-in never sets it; save/load roundtrip
  mid-chain (v4).
- Determinism: two identical runs make identical event resolutions.

## 14.5 Milestones

- **I14-M1 — framework:** option list + predicate library + reducer
  validation + EventScreen (locked display, ship/card pickers). Existing
  8 events ported *behaviorally unchanged* where possible so this
  milestone is mostly mechanical; suite green.
- **I14-M2 — content:** the 14.2 table in full — rewrites, gated options,
  chosen costs, three new events, copy pass (fictional odds language).
- **I14-M3 — the chain:** defector multi-stage, `pendingEventId`,
  SAVE_VERSION 4, full test pass, browser verification of the event
  screen (lock styling, pickers) now that browser passes are re-enabled.

**Definition of done:** no event has a random cost attached to a
deterministic choice; every gated option renders locked with its
requirement when unmet and works when met; the defector chain fires
across a save/reload; `npm test`, `tsc -b`, `vite build` green; the
event screen verified in-browser.

## Implementation notes (2026-08-02)

Read `src/game/events.ts`, `reducer.ts`, `types.ts`, `persistence.ts`,
`EventScreen.tsx`, and the existing test files before touching anything,
per the project rules — the code and its tests were the source of truth
for conventions (comment density, `runRng`/`nextCounter` pattern, the
`ACCEPT_QUEST` sub-selection precedent, `applyCappedDamage`'s hp−1 cap).

**Framework (`src/game/events.ts`).** `EventDef` now carries an
`options: EventOption[]` list instead of the old fixed A/B labels.
`EventRequirement` is a small tagged union
(`partEquipped`/`everyShipInitiativeAtLeast`/`anyShipComputerAtLeast`/
`framePresent`/`handAtLeast`/`handBelowMax`/`creditsAtLeast`) checked by
`meetsRequirement`, deliberately missing `commanderIs` since nothing in
the 14.2 table needs it. `resolveEventChoice` gained a `choiceIndex:
number` (was `0 | 1`) and a `selection: { shipIndex?; cardId? }` parameter
— still pure and rng-injected, still trusts nothing it wasn't handed
(falls back to index 0 if a chooseShip selection is somehow missing,
though the reducer never lets that happen for real).

**Reducer (`reducer.ts`).** `EVENT_CHOOSE` re-validates, in order:
already-decided (no double-dispatch), option exists, requirement met,
`chooseShip`/`chooseCard` selection present and valid against the current
fleet/hand — any failure is a no-op returning `state` unchanged, matching
every other reducer case's style (`ACCEPT_QUEST`'s stake check,
`EQUIP`'s slot check). `PICK_NODE`'s event branch now checks
`state.pendingEventId` before rolling `drawEvent`, and always clears it.

**The ambush win-bonus plumbing.** 14.2's table pays some ambush "stand
and fight" options a bonus *conditional on winning* (defector-pursuit:
+8cr; distress-beacon: +6cr and a part) — `resolveEventChoice` can't know
the fight's outcome at choice time, so this couldn't be a plain state
mutation the way ancient-cache's ambush always was. Added
`AmbushBonus`/`RunState.pendingAmbushBonus`: `EVENT_CONTINUE` copies a
resolved `ambushBonus` onto RunState when it sends the player into
`prep`; `CONTINUE` (the combat-win handler) folds `pendingAmbushBonus`
into `creditsEarned` and drops any `partId` into inventory, then clears
the field in every branch (win, boss win, defeat) so it can never leak
into an unrelated later fight; `WITHDRAW` also clears it (forfeited, not
paid). This is the one place the implementation added state 14.1 didn't
literally spec — without it, "+8 cr" would have meant either lying in the
outcome text or silently downgrading to whatever `winReward(col)`
happened to be at that column.

**Content (`EVENTS` in `events.ts`).** All 8 existing events rewritten to
the option-list shape with gated third options; 3 new events (Distress
beacon, Repair tender, Militia requisition); the defector chain
(`defector` → `pendingEventId: 'defector-pursuit'` → `defector-pursuit`).
Every damage-as-cost option is `chooseShip`; the only remaining risky
(rng-branched) options are ones where the player already chose to gamble
(derelict-cruiser's reactor, asteroid-field's threading) — the victim in
those is the ship the player picked, never a random one. Recon-probe now
actually mutates state (reveals node types via `revealedNodes`, a new
column-based reveal alongside the existing lane-based deep scan) instead
of being pure flavor text, since the 14.2 rule requires every event to
have at least one state-dependent option.

**EventScreen.tsx.** Rewritten to take the whole `RunState` (needed for
`meetsRequirement` and for the ship/card picker lists) instead of just
`CurrentEventState`. Locked options render as a disabled `.shop-button`
plus a visible `.event-screen__reqtext` line (not just a title tooltip —
the spec asked for the requirement to be visible, not discoverable).
`chooseShip`/`chooseCard` options expand an inline picker in local
component state (`pickingIndex`), reusing `InterludeScreen`'s ship-picker
markup and `CombatScreen`'s hand-card-tile markup rather than inventing a
third pattern.

**Deviations** (see the status block at the top for the summary; detail
here):
- Repair tender's "spread across chosen ships" — the framework's
  `chooseShip` is one index, not a set, so this is a single chosen ship
  taking the full 3-point repair. Extending the framework to multi-ship
  selection for one event's flavor text felt like scope creep against
  14.1's explicit shape.
- Shipyard raid's "next unlanded escalation" reuses `nextUnrevealedIndex`
  (the same helper Intercepted signal's decrypt uses) rather than
  inventing a "landed" concept RunState doesn't track — matches the
  pre-existing `sabotage-raid` code's own convention.
- defector-pursuit's hunt squad is a random pick from the act's hard pool
  regardless of the column the chain happens to resolve at (read literally
  as "hard-pool pick", not scaled down the way `hardestEnemyForAmbush`
  scales ancient-cache's patrol to the column band).
- Dropped the dead `CurrentEventState.offeredPartId` field (an unused
  leftover from a never-built "wandering-trader" event) while touching
  the type anyway.

Nothing outstanding for this iteration.
