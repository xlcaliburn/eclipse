# Eclipse Roguelike — Plan Index

A single-player, browser-only roguelike inspired by Eclipse (the board game):
the player counter-builds a small fleet against telegraphed enemies across a
branching run map. React + TypeScript + Vite, no backend, Vitest.

## How the plan is organized

Specs live in `plans/`, **one file per iteration**. This file is just the
index — full specs, tests, milestones, and implementation notes live in the
iteration files.

Rules for working with these files:

- **Implementers:** read only the iteration file you are implementing (plus
  the codebase — the code and its tests, not the older plan files, are the
  source of truth for current behavior). Record your status notes,
  deviations, and verification results **in that same iteration file**, in
  the established style (status blockquote at the top, notes at the end).
- **Authority:** later iterations override earlier ones wherever they
  conflict. The older files are kept as history and rationale, not as
  current rules.
- **Planning** happens in chat and lands as a new `plans/iteration-N.md`;
  ideas that were discussed but deferred or rejected are in
  `plans/parking-lot.md` (including explicit "decided against" entries — do
  not relitigate those without new evidence).

## Status

| Iteration | Theme | Status |
|---|---|---|
| [1](plans/iteration-1.md) | MVP: core rules, resolver, forecast, 9-fight gauntlet | implemented |
| [2](plans/iteration-2.md) | Fleet building, credits + trade station | implemented |
| [3](plans/iteration-3.md) | Branching map, events, reaction cards, persistent damage | implemented |
| [4](plans/iteration-4.md) | Reward screen, ship upgrades, enemy escalation + intel | implemented |
| [5](plans/iteration-5.md) | Combat & fleet depth: retreat, exotic weapons, taunt/Bastion, boss variety | implemented |
| [6](plans/iteration-6.md) | Strategic layer: fog of war, info broker, quests, commanders | implemented |
| [7](plans/iteration-7.md) | Arsenal & tactics: new weapons/defenses, active parts, card + intel-currency reworks, shop rework | implemented |
| [8](plans/iteration-8.md) | The long war: two-act map, safe opener, veterancy scaling, act-2 roster, final bosses, Dreadnought (+ addendum: Jink, job stakes, chaff, upgrade cap) | implemented |
| [9](plans/iteration-9.md) | Persistence (localStorage saves + full-run determinism), mixed formations + targeting doctrine, Cruiser frame | implemented |
| [10](plans/iteration-10.md) | Space-game visual overhaul: design system, starchart map, ship silhouettes, animated combat theater (presentation only) | implemented (partial — see iteration-10.md deviations) |
| [11](plans/iteration-11.md) | Tempo & teeth: auto-heal interlude, initiative-as-evasion rework, act-1-late/act-2 difficulty pass tuned via the re-armed balance script | **in progress** (partial in working tree: I8-addendum items landed; evasion + tuning outstanding) |
| [12](plans/iteration-12.md) | Coordinate layer & decision support: starchart edges/trail, combat-theater fx, hit-chance matrix, forecast restore + delta preview | implemented |
| [13](plans/iteration-13.md) | Dice on the table: weapons/rolls as dice, shared stat bar, click-to-focus priority targeting, forecast removed, combat declutter, map threat-strip copy | implemented |
| [14](plans/iteration-14.md) | Events that read the run: multi-option framework, build-gated (shown-locked) choices, chosen costs, defector multi-stage chain, 3 new events | implemented |
| [15](plans/iteration-15.md) | Routing under pressure: cargo-typed combat nodes, deterministic heat/pursuit track, repair-or-overhaul yards | implemented |
| [16](plans/iteration-16.md) | Mobile shell: Mission/Chart/Fleet bottom tabs, touch polish, installable offline PWA | implemented |
| [17](plans/iteration-17.md) | Outspeed: a ≥4 initiative gap over the enemy's fastest survivor grants one extra cannon activation — initiative becomes a build-around (supersedes iteration 11's unbuilt evasion) | implemented |
| [18](plans/iteration-18.md) | The daily run (seeded one-attempt challenge + share text) & the fleet remembers (named ships, kill records, run summary) | implemented |
| [19](plans/iteration-19.md) | Telegraphs: enemy opening fire previewed before each round (engine `incomingFirePreview`, combat chips + threat lines, prep-screen volley readout) | implemented |
| [20](plans/iteration-20.md) | The economy floor: salvage claims (heat-priced income), fleet triage, commodity runs, pre-boss shop + mercenary escort | **mechanics implemented; clear-rate gate (≥40%) NOT met — see status notes, needs a user decision on scope** |
| [21](plans/iteration-21.md) | Commander doctrines: 5-commander roster (Warlord splits into wide Admiral / tall Warlord), one subsystem lean each, over-repair, aces, signature shop stock — requires 20 | **mechanics implemented; clear-rate gate (40–85%) NOT met for any commander — same root cause as 20, see status notes** |
| [22](plans/iteration-22.md) | The column-4 wall: de-stack the pool/veterancy/escalation triple cliff, guarantee the first shop, mid-pool + GCDS re-tune, then close the gap via reward economy + fight-count + policy-bug fixes — the measured fix for 20's and 21's failed clear-rate gates (supersedes the parked "poolBand" follow-up) | **implemented (baseline 0.2%→3.8%, 19×; every commander non-zero, best case 20.8%); 40% gate still NOT met but only ~2× short now (was ~6×) — see status notes for what's left** |
| [23](plans/iteration-23.md) | Support hulls: 5 new purchasable frames (buffer, passive aura, repair, 2× enemy-debuffer) — first parts to target a single other ally or affect the enemy side directly | implemented |
| [24](plans/iteration-24.md) | Boss closure + the Flagship comes back: boss fights auto-heal the fleet, the boss reward is a guaranteed upgrade (interlude simplified from a 3-way choice), and losing the Flagship while the fleet survives now offers a one-time paid recovery instead of losing it forever | implemented |
| [25](plans/iteration-25.md) | Sound effects (procedural Web Audio cues, no assets) + a how-to-play tutorial covering the dice/computer/shield/initiative math | implemented |
| [26](plans/iteration-26.md) | Act-1 mid-boss re-tune (GCDS + Dreadnought, driven by "the boss two-shots me every run" — added a `col10 solid fleet` balance.ts fixture to catch it) + fix a card-trade event that could hand back the exact card just traded in | implemented |
| [27](plans/iteration-27.md) | Seed sharing (Slay-the-Spire-style): a 7-character code round-trips a run's seed via `seedCode.ts`, enterable on the landing screen, copyable from Settings and the end screen (found + fixed a wrap-around decode bug along the way) | implemented |
| [28](plans/iteration-28.md) | Protocols: the act-1 boss reward gains a 1-of-3 augment draft spanning three tiers (silver stat value / gold build-arounds / prismatic rule-breakers with stated costs) — once per run, act-2-only power, seeded offers | implemented |
| [29](plans/iteration-29.md) | "Shield" renamed to "Piloting" (display text only), the combat log now shows the computer-vs-piloting math behind every roll (and calls out when piloting fully nullifies computer), and the on-demand tutorial is supplemented with 3 contextual first-run popups (dice roll, missiles, piloting) | implemented |
| [30](plans/iteration-30.md) | Counter-protocols: drafting a protocol gives every act-2 enemy a same-tier answer (silver stat trim / gold build-answer / prismatic rule-breaker), shown on the draft card before the pick — pure stat data on existing engine fields, no combat-engine changes | implemented |
| [31](plans/iteration-31.md) | The Foundry: fuse permanent slotless base-stat points into a hull (escalating prices — the late-run credit sink; placement moved to shipyard nodes by 33) + the act-2 final-boss trio measured against a protocols-era endgame fleet for the first time and buffed to a 25-55% band (M3 depends on 30) | implemented |
| [32](plans/iteration-32.md) | Act-2 starchart expansion: 4 rows × 12 columns, seeded warp lanes that skip a column (routes of unequal length), and a deterministic pursuit clock taxing the roundabout route with heat — FTL's fleet, on the existing heat track (implement 33 first) | implemented |
| [33](plans/iteration-33.md) | General store / shipyard split: stores sell parts + 2 second-hand hulls (discounted, arrive damaged), shipyards sell 4 pristine hulls + purchasable upgrades (and host 31's Foundry) — shops gain routing identity | implemented |
| [34](plans/iteration-34.md) | The relic chain: a three-stage event quest (fragment per event node, chosen costs) assembling the Ancient artifact — +4 computer / +4 piloting in one slot, the event pool's first run-spanning pull | implemented |
| 35 | Reaction cards/hand removed (active parts now own that role; Flagship starts with the Overdrive injector as compensation; elite/command payouts flattened to credits; card events reworked to parts) + tutorial bottom-anchored on mobile + Mission tab removed, Chart → Map | implemented directly, no plan file |
| [36](plans/iteration-36.md) | Hulls as bases: signature-part bundles stripped (support hulls retired into one Corvette), rarity tiers (common/rare/epic/legendary at 73/20/5/2% shop odds) on every part + hull, and the full +1/+2/+3 stat-item ladder (3/5/9cr) | implemented |
| 37 | Ship art pass: every active hull + enemy archetype rebuilt as a recognizable top-down spacecraft (multi-mass fuselage/wings/nacelles, canopy + engine nozzles + thrust glows; enemies get their own mandible/claw design language) — same code-authored SVG pipeline, no assets, presentation only | implemented directly, no plan file |
| — | Iterations 38-41 bundle: tutorial popup rework, act-1 credit halving + wiki navbar link + description trims, hull rarity + bonus-upgrade pool split, captured schematic + Overcharged rounds protocol + weapon repricing, reward-screen found-parts + shop starting-fit/rarity-label UI + 8-offer trader + injector redesign | implemented directly, no plan file |
| [42](plans/iteration-42.md) | Eight new weapons: Twin autocannon, Railgun, Flechette cannon, Homing missile, Cluster missile, Graviton beam, Prototype overcharge cannon, Executioner cannon (Ion disruptor cannon + Boarding torpedo parked, see parking-lot.md) | implemented |
| 43 | Naming/economy cleanup: `twinauto`/`battery` display names swapped (dice count now matches "Twin"/"battery"), Overdrive injector reclassified drive → hull, every "shield"-named part renamed off "shield" (Gauss/Phase/Vector coils, Piloting capacitor/modulator/harmonic), Evasion suite (was Shield disruptor) reworked from an enemy-piloting debuff into a permanent single-ship piloting buff, Point-defense grid added (rare-tier flak, 2x Flak battery), Piercing optics + Salvage rig removed outright (elite/boss/hull-bonus upgrade picks unified back onto one shared pool) | implemented directly, no plan file |
| — | Playtest bug fixes: EQUIP's slot-room check omitted `protocols`, silently blocking Lone flagship's +2 bonus slots even though the UI showed them as usable; the "Detour around it (-2cr)" event option had no `creditsAtLeast` requirement (every sibling costed option does) and was pickable at 0cr | implemented directly, no plan file |
| [44](plans/iteration-44.md) | Re-tune the act-1 economy: three changes this session (credit halving, weapon repricing, ship repricing) compounded into every commander failing the clear-rate gate 8-70x over — isolation sweeps (44.1) found credit halving is the dominant lever by far (weapon/ship reprices are noise), and surfaced that the 40% floor has never once been met in this project's history (iteration 22's best-ever was 20.8%); `winReward`/`eliteReward` un-halved for act 1 (44.2), landing back at 4.2%-16.4%, matching that historical band — still open: re-check the Ancient guardian hard-band elite (44.3), gate re-calibration (44.4) | **44.1-44.2 done, 44.3-44.4 not started** |
| [—](plans/parking-lot.md) | Parking lot: deferred + decided-against ideas | — |

## Standing notes

- **Balance gate suspended as of iteration 5** (`npm run balance` is not a
  merge gate; forecast bar and unit tests are NOT suspended — details in
  [iteration-5](plans/iteration-5.md)). **Partially re-armed by iteration
  11:** the script is refreshed there as the tuning instrument, with
  reference fleets, target bands, and a fight-length column — still not a
  gate, but tuning-by-eyeball is over.
- Verification bar for every milestone: `npm test` green, `tsc -b` clean,
  `vite build` clean.
