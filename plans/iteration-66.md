# Iteration 66 — Fleet doctrine progression: earnable, upgradable fleet orders (specced 2026-08-13)

> **Status: specced, awaiting decisions D1–D4 below. Not started.**
>
> **Concurrency warning**: iteration 65 (commander roster rework) is
> specced-not-started in this same tree and touches the Spymaster's
> order kit (3 CP + `exploitEnabled` survive that rework as one kept
> bullet). D3 below coordinates with it explicitly. Whichever iteration
> lands second updates the other's status notes. Also: iteration 65
> plans a SAVE_VERSION 9→10 bump; if 66 lands first and needs one (see
> 66.3 — it currently doesn't), coordinate so we don't burn two bumps
> where one would do.

## Motivation (user direction, 2026-08-13, verbatim)

> "i'm thinking that i want to expand upon fleet orders as a direction
> to expand in throughout the game. i think as the fleet gets more
> experience, there should be options to get new fleet orders, maybe
> improved versions of the ones. we may want to actually move brace
> into a card the player can earn as it currently has no 'downside'.
> we can follow a similar rarity system as everything else."

(Note: Brace's "no downside" missile-round case was separately nerfed
the same day — +1 piloting during the missile phase, +2 during cannon
rounds, `combatEngine.ts`'s braceBonus. That nerf ships regardless;
this iteration additionally moves Brace out of the default kit.)

## Grounding — what exists today

- **The order system** (iteration 48 + 62): 4 orders — Attack run /
  Evasive pattern / Brace (everyone), Exploit weakness (Spymaster
  only via `CombatState.exploitEnabled`). 1 CP each, at most one order
  per round, cancellable before the round resolves (UNISSUE_ORDER
  refunds). CP: 2 base / 3 Spymaster (`BASE_COMMAND_POINTS` /
  `SPYMASTER_COMMAND_POINTS`, reducer.ts), +1 regen every 4th round
  (iteration 62, uncapped). Orders consume no RNG and AUTO_RESOLVE /
  the balance sim never issue them ("auto presses no buttons").
- **The constraint this iteration deliberately revises**: iteration
  48's `FleetOrderId` comment reads "Deliberately a closed,
  always-the-same menu — nothing is drawn, collected, or spent from a
  deck (iteration 35 removed reaction cards for exactly that reason;
  orders must not reintroduce the shape under a new name)." The user
  direction above supersedes the *closed menu* half. The line that
  still must not be crossed: **earned orders are permanent unlocks for
  the rest of the run** — nothing is drawn per fight, nothing is
  consumed on use, the menu is fixed *within* any one fight. That is
  what separates this from iteration 35's reaction cards. The
  implementing pass must rewrite that comment to say exactly this.
- **Rarity system**: `Rarity = common | rare | epic | legendary`
  (types.ts), used by parts and frames, with `TIER_INDEX` and
  established shop/draw band logic to crib pacing from.
- **"Fleet experience"**: no run-level XP exists. Per-ship `kills` /
  `fightsSurvived` (iteration 18) exist but are per-hull and lost with
  the hull. The natural run-level currency is **fights won this run**
  — monotonic, deterministic, already implied by existing state (see
  66.3).

## 66.0 The model — known orders

`RunState.knownOrders: FleetOrderId[]` — the orders this run's fleet
has learned. ENGAGE passes it into `initCombat` (a new field on the
existing `CombatOrderOptions`, same pattern as `exploitEnabled`);
`canIssueOrder` refuses anything not known; CombatCommandBar renders
only known orders. CP economy is **unchanged** — knowing more orders
buys options, never more actions per fight. That keeps the feature's
balance footprint honest: the per-round action budget is identical at
2 known orders and at 7.

New runs start with `DEFAULT_KNOWN_ORDERS = ['attack-run',
'evasive-pattern']` (see D2). The Spymaster additionally starts
knowing `exploit-weakness` (see D3).

## 66.1 The catalog

| Order | Rarity | Effect | Notes |
|---|---|---|---|
| Attack run | baseline | +1 computer, −1 piloting, fleet, 1 round | unchanged |
| Evasive pattern | baseline | +1 piloting, −1 computer, fleet, 1 round | unchanged |
| **Brace** | **common** | pick a ship: holds all fire, +1 piloting (missile phase) / +2 (cannon round) | today's order, moved into the pool |
| **Attack run II** | rare | +2 computer, −1 piloting | **replaces** the Attack run tile |
| **Evasive pattern II** | rare | +2 piloting, −1 computer | **replaces** the Evasive pattern tile |
| **Point-defense screen** | epic | +2 to the fleet's `flakRemaining` pool, immediately | real counterplay vs missile alphas and Reload-drone enemies; rides the 63.3 persistent pool, so "this combat's remaining missiles", not "this round" |
| **Focused barrage** | epic | pick a ship: its dice deal +1 damage this round; it takes 1 hull damage after firing | the one order needing a new engine hook (post-fire self-damage) — see 66.5 |
| **All ahead full** | legendary | fleet +1 initiative this round | feeds the existing `initiativeBonus` round modifier (already consumed by the outspeed recheck) — zero new engine surface |
| **Bulwark** | legendary | pick a ship: +2 piloting in any phase AND it keeps firing | Brace II — **replaces** the Brace tile; the "no downside" version returns as a legendary payoff, honestly priced |

Naming constraint: no order may collide with a part / innate /
counter-protocol display name (the exact confusion the ablative-log
fix just cleaned up). "Overdrive", "Flak battery", "Ablative
anything" are taken — checked; the names above are clear as of
today, implementer re-checks at build time.

**Improved marks replace, never coexist** (see D4): earning Attack
run II swaps the tile in place. The menu therefore caps at 7 known
orders but **7 visible tiles never happens** — worst case visible is
baseline 2 + Brace/Bulwark + exploit + PD screen + Focused barrage +
All ahead full = 7 only if every draft hits and Spymaster; typical
end-of-run is 4–5. Mobile fit: the command bar is pinned ≤720px —
**this iteration touches mobile layout, so the CLAUDE.md mobile
exception applies: live browser verification at ≤720px is REQUIRED
for the command-bar change**, screenshots included.

Draft pools by rarity: common `[brace]`, rare `[attack-run-2,
evasive-pattern-2]`, epic `[pd-screen, focused-barrage]` (+
`exploit-weakness` per D3), legendary `[all-ahead-full, bulwark]`.
Already-known orders (and a base order whose II you already hold)
never appear in an offer.

## 66.2 Acquisition — command drafts at win milestones

The fleet "gains experience" as **fights won this run**: at **4, 8,
and 12 wins**, the next post-combat reward flow appends a **command
draft** — pick 1 of 3 orders, card-tile UI (reuse `card-tile` CSS),
skippable (a "Decline" option, same courtesy every other draft in the
game extends). Trigger is deterministic (win count); the 3 offers are
drawn from the run's seeded rng stream **at the moment the milestone
win resolves** (CONTINUE), stored in state like `repairUpgradeOptions`
— a reload can never reroll them (iteration 9.1 rule).

Rarity bands scale with the milestone, mirroring how enemy/part bands
deepen by column:

| Milestone | Offer weights |
|---|---|
| 4 wins | common 50 / rare 40 / epic 10 |
| 8 wins | rare 50 / epic 40 / legendary 10 |
| 12 wins | epic 50 / legendary 50 |

~25 possible fights in a full run means all three milestones are
reachable but the third takes real act-2 progress. If a band's pool
is exhausted (small catalog — possible by draft 3), fall through to
the nearest lower band; if literally everything is known, the draft
silently doesn't fire (no consolation prize — keep it simple).

Flow: a new `phase: 'order-draft'` + `ORDER_DRAFT_CHOOSE` /
`ORDER_DRAFT_DECLINE` actions, entered from CONTINUE after the reward
screen resolves at a milestone win, exiting to map. Mirrors the
protocol-draft plumbing rather than overloading RewardScreen. The sim
agent's `HANDLED_ACTIONS` table must add both actions (exhaustiveness
guard) — policy: **always decline** (see 66.5).

## 66.3 State, persistence, determinism

- `RunState.knownOrders?: FleetOrderId[]` — read with
  `?? DEFAULT_KNOWN_ORDERS` everywhere, so **no SAVE_VERSION bump**:
  an old save loads as a baseline-kit fleet mid-run, which is
  correct-ish and harmless (they simply draft from here on). Same for
  `RunState.combatsWon?: number` (`?? 0`) — increment in CONTINUE's
  win branch. (Implementer: first check whether a run-level win
  counter already exists — iteration 18 added profile-level stats;
  if a run-level one is already there, reuse it, don't duplicate.)
- Pending draft offers: `RunState.orderDraftOffers?: FleetOrderId[]`,
  cleared on choose/decline — same lifecycle as
  `repairUpgradeOptions`.
- Orders still consume no combat RNG; the draft draw uses the run's
  map/reward rng stream (not the combat seed), like every other
  reward draw.
- `FleetOrderId` grows 5 new ids. `TargetedOrderId` gains
  `focused-barrage` and `bulwark`. `ORDER_INFO` /
  `ORDER_DISPLAY_ORDER` / `ORDER_NEEDS_TARGET` grow to match — the
  existing exhaustive `Record<FleetOrderId, ...>` types make missing
  one a compile error, which is exactly why they're shaped that way.

## 66.4 UI surfaces

- **CombatCommandBar**: render known orders only (a II replaces its
  base tile's slot in `ORDER_DISPLAY_ORDER`). Mobile verification
  required (see 66.1).
- **Order-draft screen**: 3 card-tiles + Decline; shows rarity the
  same way part cards do.
- **PrepScreen CP preview line**: unchanged (CP didn't change), but
  if it names orders anywhere, it reads from `knownOrders`.
- **Wiki**: the combat/orders section gains the catalog table with
  rarities and "earned at command drafts (4/8/12 wins)" copy.
- **combatEngine.ts's iteration-48 "closed menu" comment**: rewritten
  per 66.0's grounding note.

## 66.5 Balance & sim implications (read before building)

- **Orders are invisible to the balance sim by construction** — the
  agent never issues them. This was fine at 4 fixed orders; a whole
  progression axis widens the human-vs-sim gap, meaning the sim
  **underestimates** real fleets more as this lands. That cuts in our
  favor for the act-2 problem (iterations 55/64: sim measures 0%
  conditional clear while real players report closer runs — part of
  that gap IS orders), but it must be written down: add a paragraph
  to `scripts/sim/` docs/comments noting the widened gap, and the
  sim's decline-all-drafts policy above keeps every existing number
  comparable to prior baselines (a drafted order the agent never uses
  is pure noise in fleet-composition stats otherwise).
- **Focused barrage** is the only order needing a real engine hook
  (self-damage after the ship's activation). If it turns out to need
  more than a small, contained addition to fireShip/advanceRound,
  swap it for a modifier-shaped alternative rather than deep-plumbing
  — candidate replacement: "Coordinated fire: the fleet's dice gain
  +1 damage against the marked ship this round" (rides
  `markedEnemyIndex`).
- No CP changes, no enemy changes, no baseline-power change for a
  player who declines every draft (they play exactly today's game
  minus default Brace — see D2's honest cost accounting).

## 66.6 Out of scope

- Persistent meta-progression across runs (orders reset every run).
- Selling/buying orders in shops (drafts only, this pass — a shop
  surface can come later if drafts feel too scarce).
- Any CP economy change, including per-order CP costs ≠ 1.
- Commander-specific order pools beyond the Spymaster's D3 carve-out.

## User decisions

- **D1 — Acquisition: milestone drafts at 4/8/12 wins (recommended
  as specced).** Alternatives considered: folding order rewards into
  elite kills/events (diffuse, competes with existing reward
  identity), or automatic unlocks at milestones (no agency — the
  1-of-3 pick is the fun part). **PENDING.**
- **D2 — Brace leaves the default kit** (per your direction): new
  runs start with Attack run + Evasive pattern only; Brace is the
  common-tier draft. Honest cost: a player's first ~4 fights have one
  fewer defensive lever than today. **PENDING.**
- **D3 — Exploit weakness stays Spymaster-exclusive** (recommended):
  iteration 65's reworked Spymaster keeps "3 CP + unlocks Exploit
  weakness" as a load-bearing bullet; putting it in the epic pool for
  everyone would dilute the rework mid-flight. Revisit after 65
  lands. Alternative: epic-pool it, Spymaster starts knowing it.
  **PENDING.**
- **D4 — Marks replace their base tile** (recommended): the menu
  stays small on mobile and a II is strictly better, so coexisting
  tiles would just be a trap option. Alternative: coexist, II costs
  the same 1 CP (rejected as UI noise). **PENDING.**

## Verification

- `npx tsc -b --force` clean, `npx vitest run` green, `npx vite
  build` clean.
- New engine tests: unknown order refused by `canIssueOrder`; each
  new order's effect (PD screen pool math, All-ahead-full outspeed
  interaction, Bulwark keeps firing + any-phase +2, Focused barrage
  self-damage timing, II-tiles' numbers); draft trigger at exactly
  4/8/12 wins; offers never contain known orders; reload can't reroll
  offers; decline path.
- Sim: `HANDLED_ACTIONS` exhaustiveness stays green;
  `npm run balance:full` numbers expected **unchanged** (agent
  declines drafts) — any movement is a bug in the wiring, which makes
  this a cheap regression tripwire.
- **Mobile (≤720px) live browser verification of the command bar with
  a maxed 6–7-order menu** — CLAUDE.md's mobile exception applies.
