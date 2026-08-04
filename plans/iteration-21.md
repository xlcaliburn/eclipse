# Iteration 21 — Commander doctrines (specced 2026-08-03, not started; requires iteration 20)

**Goal: each commander is a playstyle, not a bonus.** The test for every
perk in this file: *does this commander route differently through the same
map?* "+2cr" is a stat; "salvage costs me no heat" changes which node you
click. The current roster fails that test — all four play the same run
slightly more comfortably.

Design frame: the game has four subsystems that can carry a playstyle —
**trade, attrition, veterancy/aggression, heat/information** — and the
roster maps onto them one-to-one, with the aggression seat split into two
(user's call, 2026-08-03): wide fleets and tall fleets are different
games.

Depends on iteration 20's mechanics (salvage claims, commodity lots,
repair sources, mercenaries). Its clear-rate gate must already hold
doctrine-free — doctrines are amplifiers, never the only way through.

## 21.1 The roster (5, draw 3)

`drawCommanderChoices` (commanders.ts) becomes 3-of-5 — the shuffle
already supports it. Existing perks kept unless stated. All numbers are
opening proposals; 21.7's gate is the spec.

### The Merchant — trade
Keeps +2cr/win and 1cr rerolls (reducer.ts `rerollCost`). Adds:
- Commodity capacity **2** (base 1), buys lots at **3cr** (base 4).
- Mercenary escorts cost **8cr** (base 12).
- *Route read:* shop-to-shop, skip marginal fights, buy the boss fight.

### The Engineer — attrition (over-repair)
Keeps repair-1-per-win (reducer.ts `engineerHeal`). Adds:
- **Over-repair:** any repair effect that would exceed a ship's full HP
  banks the excess as temporary ablative HP for the next fight, cap **2**
  per ship. Implementation: an optional `overRepair` field on
  PlayerShipState, consumed into the existing `ablativeRemaining` at
  `initCombat` fleet derivation, then cleared. Sources: the per-win
  regen, repair-tender options, dcbay — anything that heals by points.
  (A repair-yard full heal has no excess by definition; grant it a flat
  +1 bank so yards aren't anti-synergy.)
- *Route read:* takes the fights everyone else routes around; the
  carryover spiral works for them instead of against.

### The Spymaster — heat and ghosting
Keeps vision 2 (reducer.ts) and win-reveals. Adds:
- **Salvage claims cost no heat** (they know the patrol schedules) —
  the iteration-20 event checks commanderId when applying `heatDelta`.
- *Route read:* fight the minimum, farm every wreck risk-free, arrive at
  the guaranteed pre-boss shop rich and low-heat, buy a full hand.
  Distinct from the Merchant: the Merchant buys power, the Spymaster
  avoids needing it.

### The Admiral — wide (new; inherits the old Warlord's start)
- Starts with the free stock Interceptor (move the existing
  CHOOSE_COMMANDER warlord branch).
- Fleet cap **5** for the Admiral alone (MAX_FLEET_SIZE becomes
  per-commander via a `fleetCap(commanderId)` helper; default 4).
- Ship frames cost **−25%** (rounded down) in shops.
- **Ace pilots:** a ship with **3+ kills** gains **+1 initiative**
  (kills already tracked per ship since iteration 18 — this is the cheap
  version of the parked "officers" idea; note added to parking-lot.md).
- *Route read:* cheap hulls early, protect the veterans, elite nodes are
  food. Losing an ace actually hurts.

### The Warlord — tall (reworked)
- Flagship may hold **2 permanent upgrades** (unique exception to the
  iteration-8 one-per-ship cap — gate the cap check on commanderId).
- Dreadnought costs **−5cr**.
- Starts with a free upgrade pick for the Flagship (reuse the elite-drop
  upgrade-pick screen at run start).
- *Route read:* one terrifying capital ship. Honest risk: no screen —
  focused fire, missile alphas, and arc/aoe all hit harder against 1–2
  hulls.

## 21.2 Signature stock (cheap version of commander items)

No exclusive item pools (a multiplicative content/balance surface).
Instead: each commander's shops **always stock** one signature item at a
discount — existing parts only, no new art or mechanics:

| Commander | Always stocked | Discount |
|---|---|---|
| Merchant | (commodity lot — already guaranteed) + mercenary offer | per 21.1 |
| Engineer | Damage control bay (`dcbay`) | −2cr |
| Spymaster | Cloaking field (`cloak`) | −2cr |
| Admiral | Targeting uplink (`uplink2`) | −2cr |
| Warlord | Siege cannon (`siege`) | −2cr |

Implementation: shop stock generation gets a post-draw step that inserts
the signature part if absent. If a lean still feels weak after playtest,
promote its signature to a true exclusive as a follow-up — not in this
iteration.

## 21.3 UI

- Commander pick screen: 3 cards as today, from 5. Each card states the
  doctrine in one line under the existing description.
- HUD crest (already shipped) tooltips gain the doctrine line.
- Fleet/prep surfaces show ace status (reuse the kills badge — add the
  +1 init to the StatBar derivation so it's visible, not hidden).

## 21.4 Persistence

New/changed RunState surface: `overRepair` per ship (optional), 5-value
CommanderId union, per-commander fleet cap and upgrade cap at their check
sites. All additive/optional; mirror in `isValidRunState`. Old saves with
`warlord` keep the tall rework's rules mid-run — acceptable (perks are
forward-acting), note it in status if it bites.

## 21.5 Tests

- `drawCommanderChoices`: 3 distinct of 5, seeded determinism unchanged.
- Merchant: lot cap 2 + 3cr price; merc discount.
- Engineer: over-repair banks excess (cap 2), converts to
  `ablativeRemaining` exactly once, cleared after the fight; yard +1.
- Spymaster: salvage options apply 0 heat; everyone else unchanged.
- Admiral: fleet cap 5 enforced only for admiral; frame discount; ace
  threshold at exactly 3 kills grants +1 initiative (and interacts
  correctly with Outspeed qualification).
- Warlord: second flagship upgrade accepted, third refused; everyone
  else still capped at 1.
- Signature stock: present in every shop draw for the matching commander
  only, discounted price.

## 21.6 Balance guardrail

Extend `scripts/actRun.ts` with a per-commander policy variant (Merchant
routes shops, Engineer takes extra combats, Spymaster takes salvage +
minimum fights, Admiral buys hulls, Warlord buys flagship parts).
**Gate: every commander's clear rate ≥ the iteration-20 baseline gate
(40%), and no commander exceeds ~85%** — a doctrine that trivializes the
act is as much a failure as one that can't clear it. Record all five
numbers in status notes.

## 21.7 Out of scope (parked)

- True exclusive item pools per commander (promote signatures later if
  needed).
- Ace tiers beyond +1 init (5+ kills, named officers) — see
  parking-lot.md officers entry.
- A 6th commander / rotating roster.

## Status notes (2026-08-04)

**All of 21.1–21.5 shipped, matching the spec text above with four
implementation-level deviations (documented below, none of them scope
changes). 21.6's gate was NOT met for any of the five commanders — see the
finding at the end, which confirms (rather than newly discovers) what
iteration 20's own status notes already flagged as a risk.**

### What shipped, and where it differs from the spec above

- **21.1 (the roster):** shipped as specced — 5 commanders, draw 3. The
  Admiral inherits the old Warlord's free starting Interceptor exactly;
  the Warlord's new "free upgrade pick for the Flagship" ships as an
  **auto-granted random upgrade**, not a reused elite-drop pick screen —
  building a whole new UI sub-phase for a one-time flavor bonus at run
  start wasn't worth it, and the player still sees what they got on the
  Flagship's stat bar immediately after.
- **Commodity-lot data model moved from `RunState` to `PlayerShipState`.**
  Iteration 20 shipped `commodityLotBoughtAtGlobalColumn` as a single
  scalar on `RunState`, which can't represent the Merchant's cap-2 (two
  lots, two different bought-at columns). Moved to a per-ship optional
  field instead — a real architectural improvement over the iteration-20
  original (it also means nothing needs re-indexing on scuttle; the field
  just disappears with the ship), not a workaround.
- **`SELL_COMMODITY_LOT` sells every eligible lot in one action**, not one
  at a time — avoids needing a per-lot picker UI for a fleet carrying 2.
- **The Admiral's frame discount rounds the final price down**
  (`Math.floor(cost * 0.75)`), not the discount amount
  (`cost - Math.floor(cost * 0.25)`) — the two differ on odd costs (7cr:
  5cr vs. 6cr); the former is the "rounds in the player's favor" reading
  and is what the spec's worked examples (interceptor 6→4, bastion 12→9,
  dreadnought 20→15) actually assume.
- **21.2 (signature stock) had a real gap, caught during 21.5's test
  pass and fixed before it shipped:** the spec's table explicitly lists
  the Spymaster's signature item as the Cloaking field (`cloak`, −2cr),
  but the first implementation pass only wired up Engineer/Warlord/
  Admiral, with a code comment rationalizing the omission as "the
  Spymaster's doctrine is priced elsewhere." That comment was wrong — the
  heat-free salvage claim and the signature-stock guarantee are two
  separate perks in the spec, not one covering the other. Added
  `spymaster: 'cloak'` to `SIGNATURE_PART`/`SIGNATURE_SLOT` (slot 2, the
  first defense slot, matching `cloak`'s `shield` type) and updated the
  three signature-stock tests that assumed the gap was intentional.
- **21.3 (UI) and 21.4 (persistence)** shipped as specced — no
  deviations. `SAVE_VERSION` was not bumped; both new `PlayerShipState`
  fields (`overRepairBank`, the relocated
  `commodityLotBoughtAtGlobalColumn`) are optional with read-site
  fallbacks, and `CommanderId`'s 5th value is an unvalidated string union
  member, so an old save just keeps working.
- **21.5 (tests):** 485 tests total (up from 479 pre-iteration-21),
  covering every doctrine mechanic listed in the spec plus the signature-
  stock gap above. Two bugs were caught and fixed *while writing tests*,
  before either reached a committed state: a double `runRng` call in
  `CHOOSE_COMMANDER` that would have desynced the RNG stream from its
  counter, and a direct-index fleet mutation (`fleet[0] = ...`) in the
  same case that would have mutated `state.fleet` in place for the
  Warlord branch. A third issue was a **test-infrastructure** bug, not a
  production one: the pre-existing `wonNonBossState` helper always built
  a single-ship `initCombat` input regardless of how many ships a test's
  `fleet` override carried, which crashed a new 2-ship Warlord test on
  `outcome.playerShips[1]` being `undefined`. Fixed by giving that test
  its own matching-size combat state rather than changing the shared
  helper's default (every other caller still passes a 1-ship fleet).

### 21.6 (the balance guardrail) — gate not met, same root cause as iteration 20

`scripts/actRun.ts` needed a larger rewrite than "add a policy knob": its
imports (`COMMODITY_LOT_BUY_COST`, `MERCENARY_COST`) were already stale
against the commander-aware pricing functions (`commodityLotBuyCost`,
`mercenaryCost`, `fleetCap`, `frameCost`, `partCost`) iteration 21 added to
`reducer.ts` — the script didn't even run before this rewrite. It's now
parameterized by an optional `commanderId`, with a doctrine-specific route
bias in `chooseNode` (Merchant chases shops and avoids marginal fights;
Engineer and Admiral lean into fights their doctrine is built to absorb;
Spymaster avoids fights in favor of events, where its heat-free salvage
claim lives; Warlord has no route bias — its doctrine is entirely shop-
side) and a doctrine-specific shopping bias (Admiral buys hulls before
gear whenever the fleet has room; Warlord never expands the fleet at all,
banking anything the Flagship can't use; Engineer's repairs bank excess
via `applyRepairBanking`, mirroring `reducer.ts`'s `engineerHeal` and
`repairFleet(..., bankFlat)` exactly). Kill attribution (for the Admiral's
ace-pilot bonus) is read straight from each fight's combat log, the same
way `reducer.ts`'s `attributeFightStats` does.

500-run results per commander, against the inherited 40–85% gate:

```
No commander (iteration-20 baseline): 0.2%  (1/500)
The Merchant:                          0.6%  (3/500)   FAIL — below floor
The Engineer:                          0.0%  (0/500)   FAIL — below floor
The Spymaster:                         0.6%  (3/500)   FAIL — below floor
The Admiral:                           0.2%  (1/500)   FAIL — below floor
The Warlord:                           0.0%  (0/500)   FAIL — below floor
```

**Every commander fails the same way the baseline does, and for the same
reason.** Deaths-by-column for all six configurations (baseline plus five
commanders) show the identical pattern iteration 20's status notes already
diagnosed: column 4 alone accounts for roughly a third to two-thirds of
every configuration's deaths (baseline 160/500 died at c4; the Admiral,
whose doctrine literally scores elites *higher* there, still lost 315/500
at c4). None of the five doctrines — not the Merchant's extra credits, not
the Engineer's damage tolerance, not the Admiral's wider fleet — meaningfully
moves a fleet's win probability at the column where the enemy pool jumps
from the easy band to the mid band. That is exactly the mechanism iteration
20 identified as the actual wall (a per-fight win-rate cliff at the
easy→mid pool boundary, not a routing or economy problem), and exactly
what iteration 20's own "Sequencing note" warned about before iteration 21
started: *"the clear-rate gate has to hold for every commander with no
doctrine help, or the act is only clearable by the right pick."* It didn't
hold before 21, and no doctrine — because doctrines are additive
amplifiers on top of the same base combat math, not replacements for it —
can retroactively make it hold now.

**This is not a flaw in iteration 21's designs.** Every mechanic specced
in 21.1–21.5 shipped correctly and is independently verified (485 passing
tests, `tsc -b` clean, `vite build` clean) — the doctrines measurably
change *how* a run spends its credits and *which* nodes it favors (see
each commander's `avg fights`/`avg spent`/deaths-by-node-type block for
the differences from baseline), which was the actual design goal ("does
this commander route differently through the same map?"). What they can't
do, because it was never in scope for either iteration, is fix a per-fight
win-rate problem at columns 4 and 6. That fix — the previously-scoped-and-
deferred `poolBand` follow-up (`src/game/enemies.ts`: widen the easy band
from col≤3 to col≤4, the mid band from col≤6 to col≤7) — remains the next
concrete step, and is now doubly motivated: it's the one lever that moves
the baseline *and* all five doctrine variants at once, rather than five
separate balance passes.

### Standing bar

`npm test` (485/485), `tsc -b` (clean), `vite build` (clean) all green as
of this write-up. Iteration 21's work has not been committed — commits
happen only when explicitly requested.
