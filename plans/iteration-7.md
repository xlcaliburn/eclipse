## Iteration 7 (planned — after iteration 6)

**Arsenal & tactics.** Two connected problems from play: (a) the part catalog
is too thin to support distinct builds — with "power" cut from the board
game, credits and slots are the only costs, so parts need to pay in the
*other* currencies (accuracy, timing, targeting, risk); (b) reaction cards
are economically broken as purchases — a 7 cr one-shot loses to a 5 cr
permanent every time, and consumable psychology means even owned cards get
hoarded, not played. The fix for (b) is structural: **in-fight interaction
moves into equipment** (active parts, usable every combat), and cards become
rare found miracles that are never sold.

The balance gate remains suspended (see PLAN.md standing notes). All prices
and numbers are eyeballed.

### 7.1 New passive parts (catalog additions)

Design rule: every enemy archetype gets **two different shop answers**, and
no two parts answer the same threat the same way.

| id | Name | Type | Cost | Effect |
|----|------|------|------|--------|
| `lance` | Gauss lance | weapon | 6 cr | 1 cannon die, 2 dmg, **ignores 2 points of enemy shield** (per-die shield pierce; stacks with `optics`, floor 0). The purchasable answer to shield walls — `optics` is elite-luck-gated. |
| `torpedo` | Heavy torpedo | weapon | 5 cr | Missile phase: 1 missile die, **3 dmg**. Makes an alpha-strike archetype real (vs. the rack's 2×1). |
| `arc` | Arc projector | weapon | 6 cr | 1 cannon die; on hit, deals **1 dmg to every enemy ship**. One roll decides all of it. The swarm answer that isn't "more dice". |
| `siege` | Siege cannon | weapon | 7 cr | 1 cannon die, 3 dmg, always targets the **highest**-remaining-HP enemy (overrides greedy assignment for this die only). |
| `battery` | Ion battery | weapon | 5 cr | 2 cannon dice, 1 dmg each. Slot efficiency for the many-small-dice axis. |
| `prow` | Ramming prow | hull | 4 cr | When this ship is destroyed in combat, immediately deal **3 dmg** to the lowest-remaining-HP enemy. Triggers on ANY destruction — including its own rift cannon. Deliberately classed as **hull, not weapon**: it fits a Bastion, and a lure-decoy kamikaze interceptor is legal and intended. |
| `ablative` | Ablative coating | hull | 5 cr | +2 **temporary** HP each combat, absorbed before real HP. Damage absorbed by it **does not persist** between fights — the only defense that plays the persistent-damage game, competing directly with routing to repair yards. |
| `capacitor` | Shield capacitor | shield | 5 cr | +2 shield during the missile phase and the **first cannon round only**. Anti-alpha armor that decays to nothing in long fights (no turtle abuse). |
| `cloak` | Cloaking field | shield | 6 cr | This ship **cannot be targeted** while any non-cloaked player ship is alive. The mirror of taunt (lure pulls fire, cloak pushes it) — the second way to protect a Flagship or cargo pod. Anti-degenerate rule: if every surviving player ship is cloaked, cloak stops working entirely. Taunt beats cloak: a cloaked taunter is a contradiction — lure wins, ship is targetable. |

Resolver notes: per-die `shieldPierce` generalizes the per-ship field
`optics` added (sum them). `prow` is an on-destruction trigger; it cannot
chain (enemies have no prows). `ablative` is a per-combat pool refreshed at
`initCombat`, tracked separately from damage so persistence math is
untouched. None of the new parts join `SETUP_ALLOWED_PARTS`.

### 7.2 Active parts (the interaction layer)

An active part is a normal part with a passive line **plus** a
once-per-combat activated ability. Recharges between fights (capacitors,
not ammunition) — buy once, use every combat. This reuses the card
machinery wholesale: instants go through `roundModifiers`, armed effects
through `armedEffects`; the combat screen's between-rounds pause shows
ability buttons beside the card hand (disabled once used, with the carrying
ship named).

**Activation window:** between rounds, same as cards (before the missile
phase or any cannon round). Each part's active: once per combat. State:
`usedActives: {shipIndex, slotIndex}[]` on `CombatState`.

| id | Name | Type | Cost | Passive | Active (1/combat) |
|----|------|------|------|---------|-------------------|
| `injector` | Overdrive injector | drive | 7 cr | +1 initiative | This round, all player ships gain +99 initiative (fire first). |
| `uplink2` | Targeting uplink | computer | 8 cr | +1 computer | This round, all player ships gain +2 computer. |
| `dcbay` | Damage control bay | hull | 7 cr | +1 HP | Repair 2 damage on **this ship**, immediately. |
| `override` | Fire-control override | computer | 8 cr | +1 computer | Armed before a round: this round, each missed die from **this ship** is rerolled once. Log both rolls. |
| `thrusters` | Emergency thrusters | drive | 6 cr | +1 initiative | Evasive burn: this round, **this ship** cannot be targeted and does not fire. Suppresses its own taunt for the round. Enemy dice with no legal target are not rolled ("the barrage finds nothing"). |
| `modulator` | Shield modulator | shield | 7 cr | +1 shield | This round, all player ships gain +2 shield. |

Fleet-wide actives (`injector`, `uplink2`, `modulator`) inherit the exact
semantics of the cards they replace. Per-ship actives act through the
carrying ship — which makes *which ship carries the toolkit* a build
decision, and makes the Bastion (max 1 weapon, 5 slots) the natural home
for lure + reactive + modulator + dcbay: the fleet's most *interactive*
ship, not just its wall.

Stacking is self-balancing: a second `dcbay` costs a second slot and a
second purchase. The **forecast stays active-blind**, exactly as it is
card-blind — tapping abilities well is the player's edge over the predicted
odds. Extend the existing prep-screen hint.

### 7.3 Card rework: found miracles, never sold

- **Shops no longer sell cards.** The 7 cr card row is removed. (Remove the
  bad deal; don't discount it.)
- **Pool shrinks to effects too swingy to be equipment:**

| id | Name | Effect |
|----|------|--------|
| `bulkheads` | Emergency bulkheads | Unchanged (first lethal blow → survive at 1 HP; returned if untriggered). |
| `volley` | Second volley | Play before a cannon round: this round, every player ship's cannon dice fire **twice**. |

- `overdrive`, `uplink`, `patch` are retired (migrated to actives); `ram`
  retired (the prow owns that fantasy); `pds` was already absorbed by the
  flak battery in iteration 5.
- **Acquisition channels (all free):** elite rewards (guaranteed 1, as
  today), the `abandoned-arsenal` event, the delivery quest reward. Hand
  cap stays 5; the "hand full → +4 cr" fallback stays.
- Net structure: **actives are the reliable, planned toolkit** (bought,
  always available); **cards are rare hoardable miracles** (found,
  one-shot, run-defining). Hoarding a miracle is now correct play, not a
  design bug.

### 7.4 Shop rework (the catalog is now ~30 parts)

Four uniform offers can no longer reliably surface an answer. Changes:

- **6 part offers**, drawn stratified instead of uniform:
  2× weapon, 2× defense (shield/hull types), 1× computer-or-drive,
  1× active part. Uniform within each stratum, duplicates across offers
  still allowed. Reroll (2 cr) redraws all six.
- **Selling:** any *unequipped* inventory part can be sold for
  **floor(cost/2)**. Makes salvage from dead ships liquid and lets a build
  pivot mid-run. No buyback.
- Ship section and fleet panel: unchanged from iterations 5–6. The Intel
  section is repriced — see 7.5.

### 7.5 Intel becomes a currency, not a credit purchase

Play feedback from iteration 6: intel is never worth buying over a weapon,
especially early — the same consumable-vs-permanent trap that broke card
purchases. Same structural cure: **remove the bad tradeoff.** Information
stops competing with guns for credits and is instead earned as part of
rewards, exactly as requested.

- New run resource: **intel** (`intel: number` on `RunState`, starts 0),
  displayed beside credits everywhere credits appear.
- **Income (integrated into existing rewards):**
  - +1 intel on every combat win (a line in `RewardSummary` — "flight
    recorders salvaged");
  - +2 additional intel on elite wins;
  - the recon quest and intel-flavoured events keep paying *direct
    reveals* as specced (they are already information rewards).
- **The broker reprices in intel; credits can no longer buy information:**
  Sector scan **1 intel**, Deep scan **2**, Escalation intercept **2**,
  Boss dossier **3**. The job board stays free. Reroll stays credits (it's
  shopping, not knowledge).
- **Spymaster rework:** vision 2 stays; the half-price-intel perk becomes
  **+1 intel per combat win** (double income).

The decision this creates is the right one: no longer "guns or knowledge"
(always guns), but "*which* knowledge, and now or banked" — spend 3 on the
dossier early, or drip scans ahead of each shop. Intel arrives whether or
not you fight well, so the information layer is guaranteed to be exercised
instead of theoretically purchasable and practically ignored.

### 7.6 Tests

- Lance: pierce applies per-die, stacks with `optics`, floors at 0.
- Torpedo: fires in the missile phase only, 3 dmg, cancellable by enemy…
  (n/a — enemies have no flak until iteration 8; player flak never targets
  player missiles).
- Arc: one roll, on hit damages every enemy ship once; on miss, nothing;
  kills credited correctly.
- Siege: its die targets highest-remaining-HP even when greedy would not;
  other dice unaffected.
- Prow: triggers on destruction by enemy fire AND by own rift; deals 3 to
  lowest-HP enemy; can destroy; no trigger if the fight is already over.
- Ablative: absorbs before real HP; absorbed damage not persisted;
  refreshes next combat; stacks.
- Shield capacitor: active in missile phase + first cannon round, gone in
  round 2.
- Cloak: untargetable while a non-cloaked ally lives; all-cloaked
  exception; lure overrides cloak on the same ship.
- Actives: each effect lands; once-per-combat enforced; `thrusters`
  suppresses own taunt and fizzles unrollable enemy dice; `override`
  rerolls each miss exactly once; used state resets between fights;
  forecast ignores actives.
- Cards: shop stock contains no cards; pool is exactly {bulkheads, volley};
  `volley` doubles cannon dice for one round only; retired card ids gone
  from every acquisition path.
- Shop: stratified draw fills the 2/2/1/1 quota; sell pays floor(cost/2),
  removes the part, refuses equipped parts.
- Intel currency: +1 on combat win, +3 total on elite win; broker deducts
  intel (never credits) and disables items when short; Spymaster pays +2
  per combat win total; reroll still costs credits and never touches
  intel stock.

### 7.7 Milestones

- **I7-M1 — passive arsenal:** the 9 passive parts, per-die pierce,
  on-destruction triggers, ablative pool, cloak/capacitor targeting and
  timing rules. Tests green.
- **I7-M2 — actives + cards:** active-part system on the combat screen,
  the 6 active parts, card pool cut to 2, shop card row removed. Tests
  green.
- **I7-M3 — shop + intel + polish:** 6-offer stratified stock, selling,
  the intel currency (income, broker repricing, Spymaster rework), part
  cards show active abilities distinctly, browser pass (a fight swung by a
  well-timed active; a kamikaze lure+prow interceptor; selling salvage to
  afford a lance against a shield wall; a dossier bought with intel earned
  from fighting).

**Definition of done:** a player can build a fleet whose *fights feel
different* because of what they bought, not just forecast differently;
every shop visit surfaces at least one weapon, one defense, and one active;
cards are found, never bought, and feel like miracles; and the Bastion is
the most interesting ship in the fleet, not the most boring.

### Status (I7-M1 implemented)

The 9 passive parts are implemented and verified: `npm test` green (182
tests), `tsc -b` clean, `vite build` clean. `forecast.ts` needed no changes
— it's generic over `ShipStats`/`initCombat`, so every new part is already
correctly simulated.

Implementation notes:
- `Part`/`ShipStats` gained per-die weapon fields (`shieldPierce`,
  `aoeDamage`, `targetHighest`) and per-ship fields (`onDestroyDamage`,
  `ablative`, `capacitorShield`, `cloak`); `ship.ts`'s `deriveStats` folds
  all of them in.
- `pickTarget` in `combatEngine.ts` is now the single targeting primitive
  for every case: taunt (if any taunter alive, must target one) beats cloak
  (cloaked ships excluded unless every alive defender is cloaked) beats HP
  preference (lowest by default, highest for the siege cannon's die via a
  `preferHighest` param). Reused as-is by the new `applyOnDestroyTrigger`
  (ramming prow). (`applyRam` itself was later removed in I7-M2 along with
  the `ram` card — retired in favor of the prow.)
- Arc projector's die skips the normal single-target damage path entirely:
  on a hit it loops every alive enemy ship for a flat `aoeDamage`, logging
  one roll + one part-effect line covering all of it.
- Ablative absorption sits between reactive armor and bulkheads in the hit
  pipeline (reactive negates entirely; ablative reduces `damage` before
  bulkheads' 1-HP-survival check runs on what's left); `CombatShip` gained
  `ablativeRemaining`, initialized once in `initCombat` and never reset
  mid-fight (mirrors how reactive armor was fixed to be once-per-combat).
- Shield capacitor's timing check (`phase === 'missile' || (phase ===
  'cannon' && round === 1)`) reuses the same `phase`/`round` params
  `fireShip` already threads through.

### Status (I7-M2 implemented)

Actives + the card rework are implemented and verified: `npm test` green
(183 tests), `tsc -b` clean, `vite build` clean, `npm run balance` still
runs.

- The 6 active parts (`injector`, `uplink2`, `dcbay`, `override`,
  `thrusters`, `modulator`) each have a passive line (a normal `Part` field)
  plus `active: true`; `deriveStats` folds every active part's id into a new
  `ShipStats.actives: PartId[]`. A specific ability is addressed as
  `(shipIndex, abilityIndex)` — `abilityIndex` indexes into that ship's
  `actives` array, so two copies of the same active on one ship are two
  independently-usable instances. `CombatState.usedActives` tracks spent
  ones for the whole fight; `canUseActive`/`useActive` are the public API,
  wired to a new `USE_ACTIVE` reducer action and rendered as a second
  card-hand-style row ("Ship actives") in `CombatScreen.tsx`, next to the
  reaction-card hand, each button naming its carrying ship.
- Fleet-wide actives (`injector`→initiative, `uplink2`→computer,
  `modulator`→shield) reuse `roundModifiers` exactly like the retired cards
  did. Per-ship actives needed two new round-scoped arrays on
  `RoundModifiers`: `overrideShipIndices` (fire-control override: reroll
  each missed die once, checked right after `resolveHit` in `fireShip`) and
  `evadingShipIndices` (emergency thrusters: excluded from `opponentsOf`
  before targeting via a new `legalDefenders` filter, and `fireShip` returns
  immediately for an evading shooter — so it neither fires nor can be
  targeted, and a die with zero legal defenders left simply isn't rolled,
  matching "the barrage finds nothing"). `dcbay` is the only active that
  isn't round-scoped — it repairs 2 damage on its ship instantly.
- Retired: the `overdrive`/`uplink`/`patch`/`ram`/`pds` cards and their
  standalone `apply*` functions are deleted outright (not deprecated) —
  `overdrive`/`uplink` became `injector`/`uplink2`, `patch` became `dcbay`,
  `ram` became the ramming prow, `pds` was already redundant with flak.
  `ArmedEffects.pdsActive` and `RoundModifiers.enemyComputerPenalty` (which
  powered the mid-session `jammingBurst` card, also retired here since it
  wasn't part of any iteration-7 acquisition channel) are gone with them.
  `CardId` is now exactly `'bulkheads' | 'volley'`; `Card.cost` was dropped
  from the type since cards are never purchased. `volley` is new: a
  `RoundModifiers.volleyActive` flag that doubles player cannon dice for the
  round it's played.
- **Deviation:** the two mid-session player-feedback cards (`fireControl`,
  `jammingBurst`, added between iterations 6 and 7 as a starting hand) are
  not in this spec's 2-card table and are retired along with the rest — the
  new starting hand is one `bulkheads` + one `volley` (still "two starting
  cards" per that earlier request, just drawn from the smaller canonical
  pool instead of a bespoke pair).
- Shop card row (`shopCardOffer`, `BUY_CARD`, `SHOP_CARD_COST`) is removed
  from `ShopScreen.tsx`/the reducer/`RunState` entirely — cards remain
  acquirable only via elite rewards, the `abandoned-arsenal` event, and the
  delivery quest reward, all already free and all already drawing from
  `CARDS`, so they needed no code changes beyond the pool shrinking.

**Unplanned bug fix (mid-session, reported during play):** unequipping a
hull-type part in prep/shop could drop a ship's remaining HP to 0 or below
without destroying it through combat — the next fight then started with
that ship already dead on arrival. `UNEQUIP` now recomputes max HP after
the removal and clamps carried damage to `newHp - 1`, so an equipment
change can never itself destroy a ship. `FleetPanel`/`FleetOverlay`'s HP
display also picked up the same `Math.max(0, …)` clamp `CombatFleetView`
already had, for consistency.

### Status (I7-M3 implemented)

Shop rework + the intel currency are implemented and verified: `npm test`
green (190 tests), `tsc -b` clean, `vite build` clean, `npm run balance`
still runs.

- **Stratified shop draw:** `SHOP_OFFER_COUNT` is now 6; `drawShopOffers()`
  draws 2 from a weapon-type pool, 2 from a shield-or-hull pool, 1 from a
  computer-or-drive pool, and 1 from the active-part pool (`PARTS.filter(p
  => p.active)`), each uniform within its stratum. Duplicates across or
  within strata are allowed, per spec.
- **Selling:** a new `SELL_PART` action pays `floor(cost/2)` credits for any
  inventory (i.e. unequipped) part and removes it; shop-phase only, no
  buyback. Wired into `FleetPanel` as a small "Sell (Xcr)" button next to
  each inventory `PartCard` (only rendered when the caller — currently just
  `ShopScreen` — passes `onSellPart`).
- **Intel currency:** a new `RunState.intel` counter, seeded at 0. Every
  combat win pays `WIN_INTEL` (1), elites pay `WIN_INTEL +
  ELITE_BONUS_INTEL` (3 total) — folded into the existing `CONTINUE` reward
  path as `RewardSummary.intelGained`, shown on the reward screen as
  "Flight recorders salvaged." The broker's four items (`BUY_DOSSIER`,
  `BUY_SECTOR_SCAN`, `BUY_DEEP_SCAN`, `BUY_ESCALATION_INTERCEPT`) now check
  and deduct `state.intel` instead of `state.credits`, at flat costs
  (3/1/2/2) with no commander-based discount. `intel` is displayed beside
  `credits` everywhere the latter already appeared (map header, shop
  header, prep screen, the fleet overlay).
- **Spymaster rework:** the iteration-6 "half-price intel" perk is gone
  (removed the `intelCost()` price-discount helper entirely) — replaced
  with a new `intelMultiplier()` helper that doubles `intelGained` on every
  win. Vision-extends-2 is unchanged.
- **Polish:** `PartCard` shows a small "ACTIVE" badge (plus a double-border
  accent) on any part with `active: true`, so active parts read differently
  from plain passives in both the shop and the fleet panel.

**Deviation:** per the user's explicit mid-session instruction ("skip all
browser passes"), no live browser click-through was performed for this
milestone (or the tail end of I6-M3) — verification here rests entirely on
the unit-test suite, `tsc -b`, `vite build`, and the balance script.

**Iteration 7 is now fully implemented (I7-M1, I7-M2, I7-M3).**
