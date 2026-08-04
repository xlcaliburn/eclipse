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
