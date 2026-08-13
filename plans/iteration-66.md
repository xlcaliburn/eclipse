# Iteration 66 — Fleet doctrine progression: earnable, upgradable fleet orders (specced 2026-08-13)

> **Status: implemented and verified (2026-08-13).** `tsc -b --force`
> clean, `vitest run` 992/992 green (35 new tests: every new order's
> effect + drawback, draft-trigger-at-exactly-4/8/12, offers-never-
> known, reload-can't-reroll, decline path, plus 4 persistence tests
> below), `vite build` clean, `npm run balance:full` numerically
> matches the pre-66 baseline pattern (sim declines every draft by
> construction — no wiring leak). All 10 new orders implemented per
> the catalog exactly (Focused barrage as a real per-ship damage-bonus
> hook in the roll pipeline, not the fallback; Bulwark as its own
> ship-index list, distinct from bracingShipIndices, so it fires
> normally). Stage D wiki section added (`#fleet-orders`, sourced live
> from `ORDER_RARITY`/`ORDER_INFO` — never hand-duplicated).
>
> **Bug found + fixed during this pass, unrelated to 66's own new
> code but caught by it**: `persistence.ts`'s `isValidRunState` switch
> was not exhaustive over two real `Phase` values —
> `'interlude-reinforcement'` (existed since iteration 64, no case
> here) and this iteration's own `'order-draft'`. Both silently fell
> to `default: false`, meaning a page reload while a player sat on
> either screen would discard their save outright ("act as if there
> is no save") rather than resuming it. Found via this iteration's
> required mobile verification (a hand-constructed save landed on
> `'order-draft'` and the landing screen offered "New run" instead of
> "Continue run"). Fixed by adding both cases (interlude-reinforcement
> requires a nonempty `pendingReinforcementOptions`; order-draft
> requires a nonempty `orderDraftOffers` — deliberately >0 rather than
> ===3 like protocol-draft, since a near-complete catalog can
> legitimately draw fewer than 3 offers). 4 new persistence.test.ts
> cases cover both (roundtrip + missing-field-discards).
>
> **Mobile (≤720px) verification, per CLAUDE.md's exception — done
> via DOM/layout assertions** (the sandboxed browser pane couldn't
> composite frames for pixel screenshots in this environment; used
> `getBoundingClientRect`/`scrollWidth`/`scrollIntoView` checks
> instead, which is the load-bearing question — "does everything
> fit/reach, not just render as text" — same as a screenshot would
> answer): at 375×812, a synthetic 14-known-order stress case (every
> order simultaneously, including both halves of every II-mark pair —
> 2.3× the documented realistic worst case of 6) rendered as a
> 2-column grid, zero tiles clipped or positioned outside the
> viewport, zero page-level horizontal overflow, and `scrollIntoView`
> on the last tile confirmed the container scrolls to reach it. The
> command-draft screen (3 offer cards + Decline) fit entirely within
> the viewport with no scrolling needed at all. No layout bugs found
> on either screen.
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

**Rarity is a drawback gradient** (user direction, verbatim: "common
should have a clear drawback, rare should have a slight drawback,
epic+ no drawback"). Power scales with rarity twice over: the effect
gets bigger AND the cost attached to it shrinks to zero. The two
baseline orders are symmetric 1-for-1 trades, consistent with the
common end of that gradient.

| Order | Rarity | Effect | Drawback | Notes |
|---|---|---|---|---|
| Attack run | baseline | +1 computer, fleet, 1 round | −1 piloting | unchanged |
| Evasive pattern | baseline | +1 piloting, fleet, 1 round | −1 computer | unchanged |
| **Brace** | common | pick a ship: +1 piloting (missile phase) / +2 (cannon round) | holds all fire | today's order, moved into the pool |
| **Patch crews** | common | pick a ship: repair 1 hull damage, instantly | that ship holds fire this round (crews swarming the hull) | needs a held-fire ship list separate from bracing (no piloting bonus rides along) |
| **Countermeasures** | common | +1 to the fleet's `flakRemaining` pool | fleet −1 computer this round (sensors devoted to intercept) | both halves ride existing surfaces |
| **Attack run II** | rare | +2 computer, fleet, 1 round | −1 piloting | **replaces** the Attack run tile; drawback now half the upside |
| **Evasive pattern II** | rare | +2 piloting, fleet, 1 round | −1 computer | **replaces** the Evasive pattern tile |
| **Focus fire** | rare | pick an enemy: your dice gain +1 computer against it this round | −1 computer against every other enemy (tunnel vision) | magnitude-1 cousin of Exploit weakness — keeps D3's exclusivity intact (+2, no drawback, stays Spymaster's) |
| **Jamming sweep** | rare | enemy fleet −1 computer this round | your fleet −1 initiative this round | rides `enemyComputerPenalty` + a negative `initiativeBonus` — zero new engine surface; NOT named "ECM" (ECM pod is a part) |
| **Point-defense screen** | epic | +3 to the fleet's `flakRemaining` pool | none | counterplay vs missile alphas and Reload-drone enemies; rides the 63.3 persistent pool, so "this combat's remaining missiles", not "this round" |
| **Focused barrage** | epic | pick a ship: its dice deal +1 damage this round | none | the self-damage variant died to the no-drawback rule — the hook is now just a per-ship damage bonus modifier, simpler than the post-fire version |
| **All ahead full** | legendary | fleet +1 initiative this round | none | feeds the existing `initiativeBonus` round modifier (already consumed by the outspeed recheck) |
| **Bulwark** | legendary | pick a ship: +2 piloting in any phase AND it keeps firing | none | Brace II — **replaces** the Brace tile; the "no downside" version returns as a legendary payoff, honestly priced |

Naming constraint: no order may collide with a part / innate /
counter-protocol display name (the exact confusion the ablative-log
fix just cleaned up). Checked today: "ECM pod" (part) forced the
Jamming sweep rename; "Damage control bay" (part) is why it's Patch
crews, not Damage control; "Overdrive", "Flak battery", "Ablative
anything" are taken. Implementer re-checks every name at build time.

**Improved marks replace, never coexist** (see D4): earning Attack
run II swaps the tile in place. Menu size is bounded by *drafts*, not
the catalog: 2 baseline + at most 3 drafted (+ Exploit weakness for
the Spymaster) = **6 visible tiles worst case**, typically 4–5.
Mobile fit: the command bar is pinned ≤720px — **this iteration
touches mobile layout, so the CLAUDE.md mobile exception applies:
live browser verification at ≤720px is REQUIRED for the command-bar
change**, screenshots included.

Draft pools by rarity: common `[brace, patch-crews,
countermeasures]`, rare `[attack-run-2, evasive-pattern-2,
focus-fire, jamming-sweep]`, epic `[pd-screen, focused-barrage]` (+
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
- `FleetOrderId` grows 9 new ids. `TargetedOrderId` gains
  `patch-crews`, `focus-fire`, `focused-barrage`, and `bulwark`.
  `ORDER_INFO` / `ORDER_DISPLAY_ORDER` / `ORDER_NEEDS_TARGET` grow to
  match — the existing exhaustive `Record<FleetOrderId, ...>` types
  make missing one a compile error, which is exactly why they're
  shaped that way.
- New `RoundModifiers` surfaces, kept minimal: a held-fire ship list
  (Patch crews — bracing's list grants piloting, so it can't be
  reused), a per-ship damage-bonus entry (Focused barrage), a
  marked-enemy magnitude or second mark field (Focus fire's +1 vs
  Exploit weakness's +2 — implementer picks the smaller diff), and
  the ability for `initiativeBonus` to go negative (Jamming sweep —
  verify the outspeed/activation reads clamp sanely).

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
- **Focused barrage** needs the largest engine addition (a per-ship
  damage bonus applied in the roll pipeline — the roll log's damage
  math must show the boosted number, same rule iteration 62 followed
  for convergenceBonus). If it turns out to need more than a small,
  contained addition, swap it for "the fleet's dice gain +1 damage
  against the marked ship this round" (rides `markedEnemyIndex`)
  rather than deep-plumbing.
- **The drawback gradient is the balance mechanism.** Commons are
  deliberately close to the baseline orders in net power (real cost
  attached); rares trade 2-for-1; epic+ is where drafted power is
  simply free. If any common/rare playtests as an always-press
  button, the first lever is its drawback's size, not its effect's.
- No CP changes, no enemy changes, no baseline-power change for a
  player who declines every draft (they play exactly today's game
  minus default Brace — see D2's honest cost accounting).

## 66.6 Out of scope

- Persistent meta-progression across runs (orders reset every run).
- Selling/buying orders in shops (drafts only, this pass — a shop
  surface can come later if drafts feel too scarce).
- Any CP economy change, including per-order CP costs ≠ 1.
- Commander-specific order pools beyond the Spymaster's D3 carve-out.

## User decisions — all CONFIRMED 2026-08-13 ("i like it spec it out")

- **D1 — CONFIRMED**: acquisition is milestone command drafts at
  4/8/12 fleet wins, 1-of-3 pick, declinable. (Alternatives —
  elite/event rewards, automatic unlocks — rejected as specced.)
- **D2 — CONFIRMED**: Brace leaves the default kit; new runs start
  with Attack run + Evasive pattern only. The first ~4 fights having
  one fewer defensive lever is accepted.
- **D3 — CONFIRMED**: Exploit weakness stays Spymaster-exclusive
  (+2, no drawback). Focus fire (rare, +1, with drawback) is the
  everyone-else cousin. Revisit only after iteration 65 lands.
- **D4 — CONFIRMED**: II marks replace their base tile, never
  coexist.

Also locked in the same conversation: the rarity-drawback gradient
(common clear / rare slight / epic+ none) is a design LAW for this
catalog and any future order, not a tendency.

## Implementation plan (staged — verify the bar after each stage)

### Stage A — engine: known orders + the five new effects
`src/game/combatEngine.ts`, `combatEngine.test.ts`.
- `FleetOrderId` + 9 ids; `TargetedOrderId` + 4 (`patch-crews`,
  `focus-fire`, `focused-barrage`, `bulwark`);
  `ORDER_NEEDS_TARGET` rows for all 9.
- `CombatState.knownOrders?: FleetOrderId[]`, set once at initCombat
  from a new `CombatOrderOptions.knownOrders`. Read ONLY as
  `(state.knownOrders ?? DEFAULT_KNOWN_ORDERS)` at the consuming
  sites (canIssueOrder, the command bar) — the `??` degrade means an
  old mid-fight save loads as baseline-kit, and NO SAVE_VERSION bump
  is needed (the iteration-48 bracingShipIndices lesson: `.includes`
  on undefined throws, so the default must be applied at every read,
  never assumed present). `DEFAULT_KNOWN_ORDERS` exported from
  combatEngine.ts; reducer imports it.
- `canIssueOrder`: refuse an unknown order (same early-return shape
  as the exploitEnabled gate). `exploit-weakness` keeps its existing
  separate gate — exploitEnabled is a commander fact, not a draft
  fact, and the two compose (Spymaster must hold both).
- New `RoundModifiers` fields (all wiped by freshRoundModifiers, all
  save-safe via the same defaults-at-read discipline):
  `heldFireShipIndices: number[]` (Patch crews — fireShip skips these
  exactly like bracingShipIndices but grants no piloting),
  `damageBoostShipIndex?: number` (Focused barrage: +1 damage per die
  fired BY that player ship — applied where weapon.damage is read so
  the roll-log math shows the boosted number, the iteration-62
  convergence rule), and `markedEnemyBonus?: number` (Focus fire vs
  Exploit weakness: same `markedEnemyIndex` field, magnitude now
  carried alongside — Exploit weakness sets 2, Focus fire sets 1;
  Focus fire ADDITIONALLY applies −1 computer to player dice landing
  on any OTHER enemy, a new term next to exploitBonus's).
- `issueOrder` cases for all 9 (Patch crews mutates the target
  player ship's damage −1 immediately, floor 0, and no-ops→refuses
  via canIssueOrder if the ship is undamaged; Countermeasures/PD
  screen add to `flakRemaining.player` immediately; Jamming sweep
  sets enemyComputerPenalty +1 AND initiativeBonus −1 — verify the
  outspeed/activation-order reads tolerate a negative bonus;
  All-ahead-full sets initiativeBonus +1; Bulwark reuses
  bracingShipIndices' +2 WITHOUT the fires-nothing skip — needs its
  own list or a flag, implementer picks the smaller diff). Every
  case logs its real numbers, phase-aware where relevant (the Brace
  precedent).
- UNISSUE_ORDER must cleanly reverse every new case (instant effects
  — Patch crews' heal, the flak adds — must either be reversed
  exactly or made un-cancellable; RECOMMENDED: reverse exactly, the
  misclick-refund rule is load-bearing UX).

### Stage B — run state: wins counter + command drafts
`src/game/reducer.ts`, `types.ts`, `reducer.test.ts`.
- `RunState.combatsWon?: number` (`?? 0`; first CHECK whether a
  run-level wins counter already exists before adding one),
  incremented in every win branch CONTINUE handles (combat, elite,
  boss, interception).
- `RunState.knownOrders?: FleetOrderId[]` seeded at NEW_RUN /
  CHOOSE_COMMANDER (Spymaster: + `exploit-weakness`); ENGAGE passes
  it into initCombat's orderOptions.
- `RunState.orderDraftOffers?: FleetOrderId[]`; milestone check in
  the win branch: if the NEW combatsWon ∈ {4,8,12}, draw 3 offers
  (weighted-rarity roll per 66.2's table, uniform within the pool,
  fallback down a band when empty, skip entirely when everything is
  known) from the run rng stream AT THAT MOMENT (9.1: reload can
  never reroll), store them, and set a pending flag; the draft phase
  (`phase: 'order-draft'`) is entered when the post-fight flow would
  otherwise return to the map (after reward/salvage screens resolve
  — wire it at the same seam the existing post-combat screens chain
  through, not a parallel path).
- `ORDER_DRAFT_CHOOSE` (validates the pick is in orderDraftOffers,
  appends to knownOrders — a II REPLACES its base id in the array,
  that's the whole replace mechanic) / `ORDER_DRAFT_DECLINE`. Both
  clear offers + return to map.

### Stage C — UI
`src/components/CombatCommandBar.tsx`, new `OrderDraftScreen.tsx`,
`App.tsx`, `styles.css`, `PrepScreen.tsx` (only if it names orders).
- Command bar renders `(combat.knownOrders ?? DEFAULT)` through
  ORDER_DISPLAY_ORDER's fixed ordering; ORDER_INFO copy below.
- OrderDraftScreen: 3 `card-tile`s (rarity shown the way part cards
  show it) + a Decline button; header copy: "Command draft — the
  fleet's experience unlocks a new order."
- **Mobile (≤720px) live verification REQUIRED** (CLAUDE.md
  exception): drive the real viewport with a 6-tile menu (baseline 2
  + 3 drafted + Spymaster exploit), confirm fit/scroll, screenshot.

### Stage D — wiki + the 48 comment + sim
- `src/wiki/Wiki.tsx`: orders section gains the catalog table w/
  rarities + "earned at command drafts (4/8/12 wins)".
- Rewrite combatEngine.ts's iteration-48 "closed menu" comment per
  66.0 (permanent per-run unlocks; still never a per-fight deck).
- `scripts/sim/agent.ts`: HANDLED_ACTIONS + both draft actions;
  policy always declines. Add the widened human-vs-sim-gap paragraph
  (66.5). `npm run balance:full` afterward: numbers must be
  UNCHANGED vs the pre-66 baseline — any movement is a wiring bug.

### ORDER_INFO copy (draft — implementer may tighten)
| id | name | description |
|---|---|---|
| `patch-crews` | Patch crews | Pick a ship: repair 1 hull damage now — its crews are on the hull, so it holds fire this round. |
| `countermeasures` | Countermeasures | The fleet burns a round of sensor time on intercept: +1 flak against this fight's remaining missiles, −1 computer this round. |
| `attack-run-2` | Attack run II | The fleet commits hard: +2 computer, −1 piloting this round. |
| `evasive-pattern-2` | Evasive pattern II | The fleet flies defensively: +2 piloting, −1 computer this round. |
| `focus-fire` | Focus fire | Pick an enemy ship: +1 computer against it this round, −1 against everything else. |
| `jamming-sweep` | Jamming sweep | Wide-band jamming: enemy fleet −1 computer this round, your fleet −1 initiative. |
| `pd-screen` | Point-defense screen | The escorts weave a screen: +3 flak against this fight's remaining missiles. |
| `focused-barrage` | Focused barrage | Pick a ship: its weapons hit +1 harder this round. |
| `all-ahead-full` | All ahead full | The whole fleet surges: +1 initiative this round. |
| `bulwark` | Bulwark | Pick a ship: +2 piloting this round — and it keeps firing. |

## Verification

- `npx tsc -b --force` clean, `npx vitest run` green, `npx vite
  build` clean.
- New engine tests: unknown order refused by `canIssueOrder`; each
  new order's effect AND its drawback (Brace/Patch-crews hold fire,
  Countermeasures' −1 computer, Focus fire's −1 vs unmarked enemies,
  Jamming sweep's initiative penalty and its outspeed interaction,
  PD screen pool math, Focused barrage damage bonus in the roll log,
  All-ahead-full outspeed interaction, Bulwark keeps firing +
  any-phase +2, II-tiles' numbers); draft trigger at exactly 4/8/12
  wins; offers never contain known orders; reload can't reroll
  offers; decline path.
- Sim: `HANDLED_ACTIONS` exhaustiveness stays green;
  `npm run balance:full` numbers expected **unchanged** (agent
  declines drafts) — any movement is a bug in the wiring, which makes
  this a cheap regression tripwire.
- **Mobile (≤720px) live browser verification of the command bar with
  a maxed 6–7-order menu** — CLAUDE.md's mobile exception applies.
