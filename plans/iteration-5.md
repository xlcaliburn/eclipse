## Iteration 5 (planned — for implementation)

Design-session outcomes (2026-07-26). Iterations 5 and 6 were specced
together: **iteration 5 changes what happens in and around fights** (retreat,
exotic weapons, taunt/tanking, boss variety); **iteration 6 changes what the
map means** (fog of war, info broker, quests, commanders). Where anything
below conflicts with earlier scope lines, this section wins.

> **Balance gate suspended.** From this iteration until further notice the
> balance script's sanity targets are NOT a milestone gate. All numbers below
> are eyeballed starting points; tuning happens through live play testing.
> Keep `scripts/balance.ts` *compiling* (fix any enemy/part references it
> breaks on) but do not tune against it, and treat the I2/I3 target bands as
> stale. Two things are explicitly NOT suspended: the in-game **forecast bar**
> (player-facing feature — it must simulate every new mechanic below
> correctly), and the **deterministic unit tests** (still mandatory, still
> green at every milestone).

### 5.1 Flagship rename

The Cruiser frame is renamed **Flagship** everywhere the player can see it
(frame label, fleet panel, combat log — "Flagship #1", setup screen copy).
Internal ids may stay `cruiser` if renaming them churns tests — display
strings are what matter. Rationale: it is the one-per-fleet ship the run's
upgrades accrete onto; the name should say so. (The class name "capital ship"
was considered and rejected because future big frames — dreadnought, carrier
— are also capital-class; "Flagship" stays unique forever.)

### 5.2 Retreat (Withdraw)

The missing verb in stepped combat: a fight going badly is currently a
run-ender with extra steps. New combat action **Withdraw**, a third button
beside "Next round" / "Auto-resolve".

- **Available** between rounds, only after at least one round has resolved
  (round ≥ 1 — you cannot back out before the missile phase), only while
  `winner` is undecided, and only if a **line of retreat** exists (below).
- **Effect:** the fight ends with no winner. Surviving ships persist their
  accumulated damage (same as a win); ships destroyed during the fight are
  lost with their parts salvaged and upgrades destroyed (existing rules); no
  credits, no reward screen. Cards already consumed stay consumed; an
  untriggered `bulkheads` returns to hand (the existing "fight ends
  untriggered" rule now also covers withdrawal). Back to the map.
- **The node is not cleared.** It is added to a new `fled: {col,row}[]` list,
  rendered distinctly on the map, and can never be picked again this run.
  `position` reverts to the node the fight was entered from (remove the fled
  node from `visited`; reverting to "before column 0" is legal when fleeing a
  column-0 fight).
- **Line of retreat** = at least one other pickable node in the fled node's
  column: connected from the reverted position (any column-0 node when
  position reverts to null), not itself fled. The **boss has no line of
  retreat** (only node in its column) — Withdraw is disabled there, you are
  committed. Same for **ambush fights** (`ancient-cache`): you were jumped;
  no line of retreat, thematically and mechanically.
- **UI:** the prep screen shows "Line of retreat: yes/no" before Engage, so
  committing to the boss or a must-win lane is a visible decision. The
  Withdraw button carries a one-line cost summary ("keep damage, forfeit
  reward, node is lost").

Withdrawal deliberately has no extra parting-shot penalty: you withdraw
*after* an enemy activation has already resolved, damage persists, the node's
reward is forfeit, and your routing options shrink. That is cost enough.
The forecast stays retreat-blind (like cards): it predicts fights to the
death.

### 5.3 Exotic weapons (catalog additions)

Three new parts. The design goal is that "many small dice vs. few big dice"
becomes a per-enemy decision (greedy targeting + overkill waste already make
this matter; these parts widen the spread).

| id | Name | Type | Cost | Effect |
|----|------|------|------|--------|
| `antimatter` | Antimatter cannon | weapon | 7 cr | 1 cannon die, **4 damage**. Monstrous vs. tanks; wasteful vs. swarms (overkill is lost). |
| `rift` | Rift cannon | weapon | 5 cr | 1 cannon die, **3 damage**; on a **natural 1** it does not miss — the **firing ship takes 1 damage** instead. |
| `flak` | Flak battery | shield | 3 cr | Each combat, cancels **1 enemy missile die** (before it is rolled), at the start of the missile phase. Stacks: total cancellations = flak batteries on alive player ships. |

Rules pinned:

- **Rift self-hit** is direct damage: it ignores shields and does NOT count
  as a "hit" for reactive armor (5.4). It CAN destroy the firing ship; a ship
  destroyed by its own rift loses its remaining dice this activation (log
  it — it's dramatic). Natural 6 still auto-hits as usual on other rolls.
  The rift's home is a disposable ship, not the upgrade-laden Flagship —
  that tension is the point.
- **Flak** cancels dice from the earliest-firing enemy ships first; each
  cancellation is a log event ("Flak battery shoots down a missile"). Player
  parts only — no enemy has flak.
- Shop price tiers: `flak` joins the 3 cr tier, `rift` the 5 cr tier,
  `antimatter` the 7 cr tier. None of the new parts join
  `SETUP_ALLOWED_PARTS` — setup stays tier-1 basics.

### 5.4 Taunt: Lure beacon, Bastion frame, Reactive armor

Today the only tanking is sacrificial (enemies greedily hit the
lowest-remaining-HP ship, i.e. the cheap interceptor). A ship built to
*absorb and survive* is impossible — durability makes enemies ignore you.
Taunt inverts that, and gives the player a way to protect the two things
worth protecting: the upgrade-laden Flagship, and (iteration 6) a quest
cargo pod.

**Taunt rule (absolute, legible):** while any player ship with a taunt
source is alive, **all enemy dice — missiles included — must target a
taunting ship**; among multiple taunters, the lowest-remaining-HP one
(consistent with the base rule). Dice are assigned one at a time, so when
the last taunter dies mid-activation, remaining dice revert to normal greedy
targeting immediately. No probabilistic or "smart" targeting — the forecast
and the combat log must make taunt's effect obvious.

| id | Name | Type | Cost | Effect |
|----|------|------|------|--------|
| `lure` | Lure beacon | shield | 5 cr | While this ship is alive, all enemy weapons target it (taunt). |
| `reactive` | Reactive armor | shield | 5 cr | The **first hit** this ship takes **each round** is fully negated (missile phase counts as a round). Stacks: N armors negate the first N hits per round. |

The throwaway-decoy tactic (lure on a cheap interceptor to eat the missile
phase) is **legal and intended** — it costs a purchase and a fleet slot, and
rewarding that kind of creativity is the design goal. Reactive armor's shape
is deliberate: it counters *few-big-dice* enemies (a sniper loses its whole
round, a swarm loses 1 die of many), completing a defensive triangle —
shields counter low-computer enemies, reactive armor counters few-big-dice,
hull counters everything linearly. Rift self-damage does not trigger it.

**Bastion frame** (new purchasable frame):

- **5 slots, at most 1 weapon part**, base HP **6**, base initiative 0,
  **12 cr**, arrives with a Lure beacon pre-fitted (same pattern as the
  interceptor's free ion). Frames gain a `maxWeapons?: number` field;
  `EQUIP` rejects a second weapon on a Bastion.
- Frame identities: Flagship = the one capital (slots + upgrades),
  Interceptor = cheap dice / sacrificial screen, Bastion = durable protector
  with near-zero damage output. The weapon cap is what keeps it honest.
- `BUY_SHIP` takes a `frameId` again (`interceptor | bastion`); the Flagship
  remains non-purchasable. Fleet cap stays 4.

**Interceptor price: 8 → 6 cr.** Economy math: shops sit at columns 2/4/6
and combat pays 4+col, so at 8 cr the second hull consumed the entire
column-2 budget and a moderately-armed 3-ship fleet only existed by column
5–6. At 6 cr, ship #2 at the column-2 shop leaves change for a part, pulling
fleet-command into the mid-game where it belongs.

**Known degenerate case to watch (play testing, not a gate):** absolute
taunt + stacked shields on a Bastion vs. low-computer enemies approaches
unhittable (natural 6s only) — the shield dead zone weaponized in reverse.
Natural predators: high-computer enemies (sniper, GCDS) and the
`firecontrol` escalation, which is now also anti-turtle tech. If play
testing shows turtling trivializes stat-wall enemies, the tuning knob is the
Bastion's slot count (5 → 4), NOT the taunt rule. When the balance gate is
re-armed, add a "taunt turtle" reference fleet to the script.

### 5.5 Boss variety + the dossier

One fixed boss means every run converges on the same final exam. Three
bosses with strongly divergent counters, chosen **seeded at map generation**
(same map seed → same boss):

| id | Name | count | init | HP | comp | shield | Weapons (per ship) | The counter it demands |
|----|------|-------|------|----|------|--------|--------------------|------------------------|
| `gcds` | GCDS | 1 | 0 | 7 | 2 | 2 | 4×ion(2dmg), 2×missile | raw damage + computers (the existing stat wall, unchanged) |
| `hive` | Hive Mother | 4 | 3 | 2 | 1 | 0 | 2×missile, 1×ion | initiative, flak/PDS, taunt-decoy, many small dice |
| `dread` | Dreadnought | 1 | 1 | 9 | 3 | 4 | 2×plasma, 1×antimatter(4dmg) | computer 5+/`optics`, big dice, reactive armor |

Divergence is the point: a build that beats GCDS should genuinely struggle
against the Dreadnought. Numbers are eyeballed (gate suspended).

**Hidden identity + the Boss dossier** (the first, deliberately minimal
slice of iteration 6's information economy — one hidden fact, one way to buy
it):

- The map's boss node reads **"Boss — unknown"** until revealed. State:
  `bossId` (set at generation) + `bossRevealed: boolean`.
- Every shop gains a one-item **Intel** row: **Boss dossier, 8 cr** — sets
  `bossRevealed`, after which the map and a tooltip show the boss's name and
  full stat card. Disabled once bought. Not affected by reroll.
- Prep-screen behavior is unchanged: once you PICK the boss node you always
  see the real enemy and forecast (existing rule). The dossier's value is
  knowing **columns earlier**, while you can still shop for the counter —
  revealing it at column 1 shapes eight purchases, at column 7 one. The
  value curve tunes itself.
- The 4.4 required-computer readout must account for the Dreadnought
  (shield 4 → "needs computer 5+") — that readout is why the dossier is
  worth money.

### 5.6 Expansion bay (elite upgrade pool addition)

8 flagship slots as a flat change would blow past every tuning band and,
worse, dissolve the slot pressure that makes shopping a decision. Instead,
slot growth is **earned**:

| id | Name | Effect |
|----|------|--------|
| `bay` | Expansion bay | +1 part slot on this ship. Stackable. Hard cap: **8 effective slots**. |

Joins the elite upgrade pool (now 9 entries). Effective slots =
`frame.slots + count('bay')`, capped at 8; the slot grid renders
dynamically. Lost with the ship like every upgrade — a 8-slot Flagship is
the run's crown jewel, which is exactly what the Bastion exists to protect.
(An 8-slot Bastion is legal, still capped at 1 weapon, and hilarious.)

### 5.7 Tests

- Withdraw: persists survivor damage; salvages/loses destroyed ships; pays
  nothing; marks the node fled and unpickable; reverts position (column-0
  case included); disabled before round 1, at the boss, in ambushes, and
  when every sibling is fled; untriggered `bulkheads` returns to hand.
- Antimatter: a 4-damage die kills a 1-HP ship with 3 damage wasted (no
  carryover — existing rule holds for big dice).
- Rift: natural 1 → 1 self-damage ignoring shields; can destroy the firer;
  a rift-suicided ship loses its remaining dice; natural 6 still auto-hits.
- Flak: N batteries cancel exactly N enemy missile dice before rolling;
  cancellations from earliest-firing enemies first; dead ships' flak counts
  for nothing.
- Taunt: all enemy dice (missile + cannon) hit the taunter while alive;
  ties among taunters go to lowest remaining HP; mid-activation taunter
  death reverts remaining dice to greedy; forecast reflects taunt.
- Reactive armor: negates the first hit per round including the missile
  phase; stacks; does not trigger on rift self-damage.
- Bastion: second weapon rejected; arrives with lure equipped; `BUY_SHIP`
  handles both frames; interceptor costs 6.
- Boss: same seed → same boss; `bossRevealed` flips on dossier purchase and
  the label switches from unknown; dossier disabled once bought.
- Expansion bay: 7th part equips after one bay; stacks to 8 and hard-caps
  there; destroyed ship's bays die with it.

### 5.8 Milestones

- **I5-M1 — rename + retreat:** Flagship labels, `WITHDRAW` action +
  `fled` state + line-of-retreat rule, prep-screen retreat indicator.
  Tests green.
- **I5-M2 — parts + frames:** the 5 new parts, taunt targeting, reactive
  armor, rift/flak resolver rules, Bastion frame + weapon cap, interceptor
  at 6 cr, price tiers. Tests green.
- **I5-M3 — bosses + bay:** three bosses seeded, hidden identity, shop
  dossier row, expansion bay + dynamic slots, browser pass (a withdrawal
  that saves a run; a lure-decoy eating a missile alpha; buying the dossier
  and seeing the boss flip from unknown).

**Definition of done:** a losing fight can be walked away from, at visible
cost, and the map shows the scar; a 1 HP decoy interceptor with a lure
beacon eats an entire missile phase and the log narrates it; the shop
presents a real "many small dice vs. few big dice" decision against a known
enemy; the boss is a rumor until paid for; and a Flagship can visibly
outgrow its own hull.

### Status (implemented)

All three milestones (I5-M1, I5-M2, I5-M3) are implemented and verified:
`npm test` green (123 tests), `tsc -b` clean, `vite build` clean, plus a
browser pass covering withdraw, Bastion + weapon-cap, the boss dossier flip
("Boss — unknown" → "Boss: GCDS" on the map), and expansion-bay slot growth.
One small deviation caught during the browser pass and fixed: the setup
screen's heading ("Fit out your starting cruiser") had been missed during
the 5.1 rename — now reads the frame's display name dynamically.
