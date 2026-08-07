# Iteration 34 — The relic chain: a three-event artifact quest (specced 2026-08-07)

> **Status: specced, not implemented.** Independent of iterations 30–33 —
> implementable in any order relative to them.

User direction: "i want to add a event to the rotation where you could
have the option to get 3 parts (1 from 3 different event nodes), and
completing it gives a very powerful artifact (+4/4 shield and computer)
as an item."

The event pool today is memoryless — every event node is a self-contained
transaction (the one exception, the defector's pursuit, proves how well a
chain can land). This adds a run-spanning collection quest: three relic
fragments, each from a *different* event node, assembling into a single
build-defining part. It gives event nodes something no other node type
has — long-term routing pull ("I'm two fragments in, I want every event
node I can reach") — which compounds with iteration 33's goal of making
non-combat routing worth planning.

## 34.1 The three stages

Three new `EventId`s, one per fragment — distinct stages rather than one
repeatable event, which guarantees the "3 different event nodes" shape by
construction (an event node resolves once; you cannot double-collect):

- **`relic-signal`** (stage 1) — *"Ancient beacon"*: a repeating signal
  from a dead hulk, older than the war. Options:
  - Walk away — sell the coordinates (+4 credits).
  - **Take the fragment** (+1 heat — prying it loose lights up every
    scanner in the sector).
- **`relic-vault`** (stage 2) — *"The sealed vault"*: the fragment
  resonates near a derelict vault. Options:
  - Strip the vault's fittings instead (+5 credits).
  - **Cut your way in — pick a ship to force the lock; the vault's
    defenses score its hull** (chosen ship takes 2 damage, capped
    survivable via the existing `applyCappedDamage` — iteration 14's
    chosen-costs law, nothing random).
  - *Cloaking field: slip through the dead defenses* (fragment, no
    damage) — `partEquipped: cloak` requirement, same build-gated
    third-option pattern every 14.2 event uses.
- **`relic-core`** (stage 3) — *"The reliquary"*: the final piece, held
  in a collector's automated reliquary. Options:
  - Sell your two fragments to the reliquary (+10 credits, **resets
    `relicFragments` to 0** — a real exit ramp, priced above what the
    fragments cost to get, for a run that needs money more than power).
  - **Buy the final fragment** (−8 credits, `creditsAtLeast: 8`).
  - **Take it by force** (+2 heat) — the broke player's path; heat is
    the currency the rich player's option doesn't spend.

Completing stage 3 immediately assembles the artifact (no fourth event):
the outcome text announces it, and the part lands in inventory.

## 34.2 The draw machinery: findable, not farmable

- `RunState.relicFragments?: 0 | 1 | 2 | 3` — optional-additive, absent
  ⇒ 0. Set to 1/2/3 by the stage outcomes above; 3 means done forever
  (the artifact exists; no stage ever enters the pool again).
- **Stage 1 sits in the normal random pool** alongside the other events,
  drawn uniformly — starting the chain is luck, like meeting the
  defector.
- **Stages 2 and 3 are never in the base pool** (defector-pursuit
  precedent, `RANDOM_EVENTS` filter). Instead, once the chain has started
  and isn't complete, each event-node draw first rolls the *continuation
  check*: `rng() < 0.5` ⇒ the next stage fires; otherwise the normal
  pool draw proceeds (with stage 1 also excluded once taken). Seeded rng,
  same stream — deterministic and seed-shareable like everything else.
  - Why 50% rather than pool membership: a run has ~9 reachable event
    nodes across both acts; three uniform draws from a 14-event pool
    would complete the chain roughly never. The continuation check makes
    an event-node-seeking player complete it *most* runs where they start
    it early, while still allowing it to slip away — measured
    expectation: 2 more stages at p=.5 per event node needs ~4 more
    event visits, which is exactly the routing pull this exists to
    create. (If playtesting says too tight/loose, this one number is the
    knob.)
- Implementation point: `drawEvent(rng, excludeId)` grows to
  `drawEvent(rng, state)`-shaped or gains params for the continuation
  check + exclusions — reducer's `PICK_NODE` event branch is the single
  call site, plus the `pendingEventId` defector path which bypasses the
  draw entirely (unchanged, and a pending pursuit correctly outranks a
  relic continuation since it never calls the draw).
- Walking away from stage 1 (selling the coordinates) leaves
  `relicFragments` at 0 — stage 1 can be drawn again later; declining
  the chain isn't refusing it forever. Declining stage 2/3's fragment
  options (taking the credits instead) similarly leaves the count where
  it was, except the reliquary's sell-out which zeroes it by design.

## 34.3 The artifact

New part in `parts.ts` (in `PARTS` for `getPart`, in **no** shop draw
pool — the pools are explicit lists, so like the commodity lot it can
never be bought):

```ts
{
  id: 'ancient-artifact',
  name: 'Ancient artifact',
  type: 'computer',
  description: '+4 computer, +4 piloting. Assembled from three relic fragments — irreplaceable.',
  cost: 12, // sells for floor(12/2) = 6 — a legal but deliberately bad trade
  computer: 4,
  shield: 4,
}
```

- One slot, +4/+4 — strictly best-in-slot (comp3 is +3 for 7cr; this is
  both a comp3 and a shield2-plus in one slot). That's the assignment:
  a quest capstone, not a shop item. The costs on the way in (heat,
  chosen damage, credits, 3+ event nodes routed) are the price tag.
- Normal part physics apply, deliberately: equips/unequips freely,
  salvages to inventory if the carrying ship is scuttled, **lost if the
  carrying ship is destroyed with it equipped** (it's powerful, not
  safe), sellable for a bad price. No special cases beyond pool
  exclusion — the fewer exceptions the artifact needs, the more the
  existing rules make it legible.
- Balance spot-check (not a gate): add the artifact to a mid fixture in
  `scripts/balance.ts` for one measurement run and record the win-rate
  delta in this file's status notes — we should *know* what +4/+4 does
  to the mid pool, even though a 3-event-gated once-per-run part isn't
  tuned like a shop part.

## 34.4 UI

- Event screen: stages 2 and 3's flavor text states progress in-fiction
  ("Two fragments hum in your hold…") — no new UI surface needed; the
  event system's existing title/flavor/options rendering carries it.
- The fragment count between events: one line in the Settings/fleet
  readout territory is tempting but unnecessary v1 — the chain is short
  and the events themselves narrate it. Revisit only if playtests show
  players forgetting they're mid-chain.
- The artifact itself renders through the existing PartCard machinery
  (type 'computer', so it gets the computer icon — acceptable; a bespoke
  relic icon in `PartIcon.tsx` is a nice-to-have if cheap).

## Verification

- Unit tests (`events.test.ts` pattern + reducer tests): stage-1-only in
  the base pool; continuation check fires stages 2/3 in order, seeded-
  deterministically, never after completion, never in act-1-vs-act-2
  special cases (there are none — both acts eligible); each stage's costs
  apply exactly (heat, capped damage, credits); the reliquary sell-out
  zeroes the count and stage 1 becomes drawable again; artifact granted
  exactly once, to inventory, on stage-3 completion; persistence
  round-trips `relicFragments`; defector-pursuit's pendingEventId still
  outranks the continuation check.
- Standard bar + browser pass via hand-edited saves at each stage:
  fragment options show their costs, the chain progresses, the artifact
  lands in inventory with correct stats, equipping it moves a ship's
  COMP/PLT readouts by 4 each (derive-time fold — should be automatic,
  verify anyway).

## Files touched (anticipated)

- `src/game/events.ts` — three EventDefs, resolution cases, draw-machinery
  rework.
- `src/game/types.ts` — `RunState.relicFragments`; `PartId` union.
- `src/game/parts.ts` — the artifact.
- `src/game/reducer.ts` — PICK_NODE event-branch draw call.
- `src/game/persistence.ts` — nothing structural (optional-additive), but
  mirror in any field lists if present.
- `src/components/PartIcon.tsx` — optional relic icon.
- Tests: `events.test.ts` / `reducer.test.ts` / `persistence.test.ts`;
  `scripts/balance.ts` one-off measurement fixture.

## Milestones

- **34-M1** — state + draw machinery + the three events with costs/
  outcomes, unit tests.
- **34-M2** — the artifact part + grant path + balance spot-check
  measurement recorded.
- **34-M3** — browser pass end-to-end (start → 3 fragments → artifact →
  equipped and swinging fights), status notes here and in PLAN.md.
