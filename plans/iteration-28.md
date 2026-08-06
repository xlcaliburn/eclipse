# Iteration 28 — Protocols: the boss-draft augment (specced + implemented 2026-08-06)

> **Status: implemented.** Scope decisions below were made with the user
> on 2026-08-06: boss-rewards-only (no new map moments, no wager/contract
> mechanics — those are deferred to the parking lot), and the prismatic
> tier ships in this first pass (small pool of 4). See "Implementation
> notes" at the end for what changed from the spec during grounding, and
> the full touched-files list.

Player request, in two parts: "other ways to get stronger (at a risk),"
and — from LoL Arena — tiered augments (silver / gold / prismatic) that
"completely change each game." The chosen scope fuses them into one
moment: **the act-1 boss reward becomes a 1-of-3 draft that always spans
all three tiers**, and the risk lives *inside* the prismatic options as
visible structural costs, not in a separate wager system. Once per run —
act 2 ends at the final boss, so there is no second draft.

Why this scope is well-placed:

- The draft lands **after** the act-1 boss, so every protocol's power
  flows into act 2 only. Iteration 26's freshly calibrated `col10 solid
  fleet` boss gates are untouched by construction.
- Act 2 is where clear rates have historically struggled (iterations
  20–22's 40%-gate saga) — extra player power lands where the difficulty
  curve has headroom, and if it overshoots, tuning act-2 pools *up* is a
  healthier lever than nerfing the new toy.
- Same seed → same three offers (drawn from the run's rng stream), so
  iteration 27's seed sharing gets a free upgrade: two players racing a
  seed now diverge on draft picks, not luck.

## 28.1 Framework

New `src/game/protocols.ts`: `ProtocolId` union, `ProtocolDef` (`id`,
`tier: 'silver' | 'gold' | 'prismatic'`, `name`, `blurb`, and for
prismatics a `cost` line — the teeth, stated in data so the UI can never
omit it), per-tier pools, and `drawProtocolOffers(rng, commanderId)`
returning exactly `[oneSilver, oneGold, onePrismatic]`. Offers that are
redundant for the active commander are filtered before the draw (Ace
pipeline is dead weight for the Admiral — precedent: iteration 21's
signature shop stock is already commander-conditional).

Reducer flow, following iteration 24's established interlude order:

1. Act-1 boss `CONTINUE` branch (already: auto-heal → flagship-recovery
   gate → interlude) draws the three offers **at the transition into the
   interlude** via `runRng` and stores them in state — same 9.1
   discipline as combat seeds: a reload can never reroll the offers.
2. `INTERLUDE_CHOOSE` (the iteration-24 guaranteed upgrade, unchanged)
   now advances to a new phase `'protocol-draft'` instead of the map.
   The draft is *in addition to* the upgrade, deliberately: 24.2's
   guaranteed upgrade stays exactly as shipped, and the boss moment
   becomes the run's single biggest payoff. (This touches iteration 24's
   simplified interlude knowingly — it adds a second step, it does not
   reintroduce the removed heal/credits chore-choice.)
3. New action `PROTOCOL_CHOOSE { index: 0 | 1 | 2 }`: appends the chosen
   id to `state.protocols`, applies any immediate effects (Lone Flagship's
   scrap, see below), clears the offers, returns to the map.

State: `RunState.protocols?: ProtocolId[]` (array, though v1 can only
ever hold one — future drafts shouldn't need a shape change) and
`RunState.protocolOffers?: ProtocolId[]` while the draft is pending.
A `hasProtocol(state, id)` helper for hook sites. New phase follows the
`'flagship-recovery'` precedent everywhere (`Phase` union,
`isValidRunState`, App.tsx wiring). Persistence: optional additive
fields, mirrored in the save validator — iteration 21 precedent says no
`SAVE_VERSION` bump for purely-optional additions.

Passive effects hook in at the places that already exist for exactly
this: derived stats fold in at `deriveFleetStats`/`deriveFleetForCombat`
(the ship.ts comment block on `withAceBonus` names this the one shared
place doctrine-like effects reach stats — protocols join `commanderId`
as a param there), shop pricing where Merchant discounts hook, rewards
where `winReward` pays out, repair pricing at the yard sites.

## 28.2 The pools

Numbers below are starting points for the balance pass, not laws.

**Silver — clean stat value, all on existing hooks (pool of 4):**

- *Reinforced bulkheads* — +1 max HP on every current and future hull
  (derive-time, same fold as iteration 23's Aegis Relay).
- *Munitions contracts* — parts cost −2cr in shops (floor 1cr; stacks
  with Merchant multiplicatively-last, like existing discounts).
- *Salvage rigs* — +2cr per combat victory.
- *Rapid drydocks* — repair costs halved at yards (Engineer over-repair
  unaffected and stacks).

**Gold — build-arounds (pool of 5):**

- *Overspeed protocols* — the player's Outspeed threshold drops 4 → 3.
  NOTE for implementer: `OUTSPEED_GAP` (combatEngine.ts:14) is shared by
  both sides via `qualifiesForOutspeed` — the hook must be a player-side
  parameter, not the constant, or enemies get faster too.
- *Ace pipeline* — the Admiral's 3-kill ace bonus (+1 initiative) applies
  under every commander. Filtered out of the Admiral's own offers.
- *Twin-linked mounts* — each ship's **first equipped weapon** gains +1
  die (derive-time weapon transform). Slot order becomes a build decision;
  FleetPanel needs a small "twin-linked" tag on the affected slot.
- *Bastion doctrine* — taunting ships get +1 shield while taunting
  (iteration 5's taunt machinery).
- *Deep-space relays* — act-2 fog fully lifted: every node's type visible
  from the interlude onward (iteration 6's fog machinery). The utility
  pick.

**Prismatic — rule-breakers, every card states its cost (pool of 4):**

- *Ghost fleet protocol* — ships that would be destroyed withdraw instead
  (out of the fight, alive for the run). **Cost: all repairs cost double
  for the rest of the run.** Interaction: the Flagship can no longer die,
  so 24.3's recovery gate simply never fires while this is active.
- *Lone flagship* — immediate: scrap every owned escort for half its
  frame value in credits; the Flagship permanently gains +2 slots and
  +2 max HP. **Cost: fleet cap becomes 1 for the rest of the run.** The
  tall pivot. (Legal-but-contrarian under the Admiral — an anti-pick
  offer is acceptable draft variance, do not filter it.)
- *Armada mandate* — fleet cap +2 (on top of commander cap), frames cost
  −50%. **Cost: every shop stocks one fewer part.** The wide pivot.
- *Alpha doctrine* — round 1 of every fight, your cannons fire in the
  missile phase (a true alpha strike). **Cost: your ships count shield 0
  during round 1.** The one protocol needing real combatEngine work —
  and it must flow through `incomingFirePreview` (iteration 19) and the
  round-order copy so telegraphs never lie.

Mercenary escorts: not scrapped by Lone Flagship, not counted by any cap
change — reducer already documents mercs as cap-exempt; keep them exempt.

## 28.3 UI

- `ProtocolDraftScreen` — mirrors `InterludeScreen`/
  `FlagshipRecoveryScreen` structurally: three cards, tier-accented
  (silver/gold/prismatic border + label), prismatic cards render their
  `cost` line in warning color. Transparency law: the downside is on the
  card, always, before the click.
- Active protocol visible for the rest of the run: a small HUD chip with
  tooltip (the `.hud-bar__daily-chip` pattern), plus a line in the Fleet
  panel where it changes a stat (twin-linked tag, ace status reuses
  iteration 21's ace visibility).

## 28.4 Balance + verification

- `actRun.ts` needs a pick policy. V1: simulate two bounds — "always
  silver" and "always gold" — plus targeted runs per prismatic. Gate:
  overall clear rate must not fall (protocols are pure player power), and
  if it rises past the existing band's ceiling, re-tune **act-2 pools
  upward** rather than nerfing protocols (see scope rationale above).
- `scripts/balance.ts` gates are per-fight and act-1-shaped —
  structurally unaffected; no changes required there. State this in the
  status notes rather than silently skipping it.
- Tests: `protocols.test.ts` (draw determinism from a fixed seed, tier
  composition always 1/1/1, Admiral filtering); reducer tests (offers
  drawn at interlude entry and stable across save/load, draft flow,
  Lone Flagship scrap math, Ghost Fleet death-to-withdrawal conversion,
  Alpha round-1 shield/phase behavior); persistence round-trip with the
  new phase and fields.
- Standard bar: `tsc -b` clean, `npm test` green, `vite build` clean,
  plus a browser pass over the boss → recovery-gate → interlude → draft →
  map flow.

## Explicitly out of scope (recorded, not rejected)

Combat wagers, elite contracts, and the "stakes raise the draft tier"
gating model were the other half of the 2026-08-06 design discussion —
deferred by scope choice, parked in `plans/parking-lot.md`. If protocols
land well, that bundle is the natural iteration 29: it reuses this
iteration's tier machinery and turns draft quality into something bought
with risk.

## Milestones

- **28-M1** — framework + silver/gold: `protocols.ts`, draft flow
  (phase, actions, persistence), derive/shop/reward/repair hooks, unit
  tests. Done.
- **28-M2** — prismatics: the four effects (combatEngine work for Alpha
  doctrine, ghost withdrawal, scrap/cap immediates), telegraph
  integration, unit tests. Done.
- **28-M3** — UI + balance: `ProtocolDraftScreen`, protocol visibility,
  balance-gate check, browser pass, status notes here and in `PLAN.md`.
  Done.

## Implementation notes (2026-08-06)

Grounded three spec details against the actual codebase; all three are
deliberate, documented deviations, not oversights:

- **Rapid drydocks** (silver): the spec assumed repairs are credit-priced
  ("repair costs halved"). They aren't — a repair yard's full heal is
  free (`RepairScreen.tsx`'s own comment: "no auto-heal on arrival any
  more... the player chooses full repair vs. overhaul"). Reworked to grant
  the same flat +1 over-repair bank the Engineer doctrine already gets on
  a full heal (`applyRepairBanking`'s `flatBank` path) — a real, existing
  mechanism, generalized off one commander the same way Ace pipeline
  generalizes the Admiral's bonus.
- **Ghost fleet protocol's cost** ("repairs cost double"): same root
  issue — nothing to double when repairs are free. Reworked to double the
  pursuit-heat cost of a repair-yard *visit* instead (+1 heat on top of
  the arrival cost every dock node already charges) — repairs are the
  one thing in this game that IS priced, just in heat, not credits.
- **actRun.ts "pick policy"** (28.4): dropped, not built. `actRun.ts`'s
  `simulateRun` returns the moment the act-1 boss is beaten — it never
  simulates act 2 at all, and the protocol draft only ever happens
  *after* that return. There's no act-2 simulation surface in this
  codebase for a protocol pick policy to hook into (building one from
  scratch would be a new script, not an addition to this one). Verified
  by running `npx tsx scripts/actRun.ts` unmodified after the full
  implementation: clear rates are bit-for-bit identical to the
  pre-iteration-28 baseline, confirming the sim is structurally
  untouched — exactly as expected, and consistent with `balance.ts` being
  unaffected for the same reason (per-fight, act-1-shaped).
- **HUD chip → Settings row**: the spec's "small HUD chip" became a
  `ProtocolRow` in `SettingsScreen`/`SettingsOverlay` instead — the HUD
  bar is reserved for live run state (credits, heat), and Settings
  already hosts the run's other "set once, check occasionally" facts
  (the seed). Reuses the draft card's own tier-accent colors
  (`.protocol-row--{tier}`) so the two surfaces read as the same system.
  A dedicated FleetPanel tag for twin-linked/lone-flagship's *specific*
  stat deltas (the spec's other UI ask) was not built — the stat changes
  already surface correctly through the existing HP/slot/weapon-dice
  readouts (verified live: a Lone-flagship Flagship showed HP 5/5 with 8
  total slots, i.e. base 3+2 and 6+2, with zero extra wiring needed,
  since every stat-deriving call site already threads `protocols`
  through).

Live browser verification (real dev server, not just unit tests): played
a fresh run to a real autosaved `map`-phase state, then hand-edited the
saved `RunState` (every field it didn't need to touch left exactly as
the app generated it) into a `protocol-draft` moment with one offer per
tier. Confirmed: all three tier accents render distinctly (silver #8b96ad
/ gold `--warning` / prismatic #c792ea), the prismatic's cost line is
visible on the card before any click, picking Lone flagship immediately
scrapped the one escort for its correct half-frame-value credit payout
(Interceptor cost 6 -> +3cr), left only the Flagship in the fleet,
returned to the act-2 map, and the Flagship's derived stats (HP 5/5 = base
3 + 2; 8 total slots = base 6 + 2) were correct with no additional code
needed beyond the derive-time hooks. Zero console errors at any point.
The Settings "Protocol: Lone flagship (Prismatic)" readout was then
confirmed live in the same session. `tsc -b --force`, `npx vitest run`
(546/546 — was 508 before this iteration), and `npx vite build` all
clean; `npx tsx scripts/balance.ts` and `npx tsx scripts/actRun.ts` both
confirmed unaffected (only the pre-existing, documented Hive-Mother
KNOWN FAIL remains in balance.ts's output).

## Touched files

- `src/game/protocols.ts` — new: `ProtocolId`, `ProtocolDef`, the 4/5/4
  tier pools, `drawProtocolOffers`, `getProtocol`, `hasProtocol`.
- `src/game/protocols.test.ts` — new.
- `src/game/types.ts` — `Phase` +`'protocol-draft'`; `RunState`
  +`protocolOffers`/+`protocols`.
- `src/game/ship.ts` — `deriveStats`/`deriveFleetStats`/
  `deriveFleetForCombat`/`effectiveSlots`/`withAceBonus` all take an
  optional `protocols` param; folds in Reinforced bulkheads, Twin-linked
  mounts, Bastion doctrine, Ace pipeline, Lone flagship's HP/slot bonus.
- `src/game/ship.test.ts` — new `describe('protocols — stat and build
  hooks')` block.
- `src/game/combatEngine.ts` — `CombatState` +`playerOutspeedGap`/
  +`alphaDoctrineActive`; `RoundModifiers` +`playerBaseShieldZeroed`;
  `initCombat` takes an optional `CombatProtocolFlags`; `advanceRound`
  fires player cannons during the missile phase and zeroes the player
  base shield for the opening exchange when Alpha doctrine is active;
  `qualifiesForOutspeed`/`computeOutspeedShips` take an optional player
  gap override (Overspeed protocols).
- `src/game/combatEngine.test.ts` — new `describe` blocks for both.
- `src/game/reducer.ts` — `PROTOCOL_CHOOSE` action + case; offers drawn
  in `CONTINUE`'s act-1-boss branch; `INTERLUDE_CHOOSE` now advances to
  `'protocol-draft'` instead of `'map'`; `fleetCap`/`frameCost`/
  `partCost`/`drawShopOffers` take an optional `protocols` param
  (Armada mandate, Munitions contracts, Lone flagship's cap); Salvage
  rigs folded into both win-reward branches; Rapid drydocks/Ghost fleet
  folded into the repair-yard and boss-fight branches respectively.
- `src/game/reducer.test.ts` — new `describe('iteration 28: Protocols')`
  block; 2 pre-existing interlude tests updated for the new
  `protocol-draft` hop.
- `src/game/events.ts` — `applyCappedDamage`/`meetsRequirement` thread
  `protocols` through to `deriveStats`/`deriveFleetStats` so an event's
  damage cap and stat-gated requirements see a protocol-boosted max HP.
- `src/game/persistence.ts` — `isValidRunState` case for
  `'protocol-draft'`.
- `src/game/persistence.test.ts` — 2 new round-trip/rejection tests.
- `src/components/ProtocolDraftScreen.tsx` — new.
- `src/components/SettingsScreen.tsx` — `ProtocolRow`; both exports take
  an optional `protocols` param.
- `src/components/EnemyPanel.tsx`, `FleetPanel.tsx`, `FleetOverlay.tsx`,
  `PrepScreen.tsx`, `ShopScreen.tsx` — threaded `protocols` through to
  every derive/cost/cap call already threading `commanderId`, so every
  existing display (Outspeed threshold, empty-slot count, shop prices,
  fleet cap) reflects a held protocol with no separate readout needed.
- `src/App.tsx` — `PROTOCOL_CHOOSE` dispatch wiring; `protocols` threaded
  to `ShopScreen`/`FleetOverlay`/`FleetScreen`/`SettingsScreen`/
  `SettingsOverlay`.
- `src/styles.css` — `.protocol-draft-screen`/`.protocol-card*` (tier
  accents), `.protocol-row*` (Settings readout, same accents).
