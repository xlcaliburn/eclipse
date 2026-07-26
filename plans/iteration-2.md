## Iteration 2 (implemented)

Player feedback after iteration 1: fight 1 failed too often (68%), the player
wanted more meaningful choices, the play-by-play should be open by default, and
there should be a way to buy more ships or upgrades. That last item overrides
iteration 1's "no economy" constraint — a credits economy is now in scope
because it's what makes ships-vs-upgrades a real decision.

### Fleet system

- The player now commands a **fleet** of up to **4 ships** instead of one cruiser.
- Ship **frames**: Cruiser (6 slots, base initiative 0, base HP 1, 14 cr) and
  Interceptor (3 slots, base initiative 2, base HP 1, 8 cr). Start: 1 Cruiser.
- Every ship acts on its **own initiative** in combat (descending; player wins
  ties, then by fleet order). Each ship defends with its **own shield** value.
  Enemy targeting is unchanged (greedy lowest-remaining-HP), which means
  enemies naturally focus fragile escorts first — a cheap interceptor is a
  legal and sometimes smart meat shield (the engage guard is fleet-level:
  at least one weapon anywhere in the fleet).
- The prep screen shows the whole fleet; click a ship to select it, click
  inventory parts to equip to the selected ship.

### Credits + trade station (replaces the free draft)

- Winning fight N (0-based index) awards **5 + N credits** (5, 6, 7, … 12 —
  ~68 over a full run). Losing still ends the run; the boss awards nothing.
- After each win (fights 1-8) the player visits the **trade station**:
  - **4 part offers**, drawn uniformly from the 12-part catalog. Part prices:
    3 cr (ion, comp1, shield1, hull1, init1), 5 cr (plasma, missile, comp2,
    shield2, hull2), 7 cr (comp3, init3).
  - **Ship purchases** (both frames always available, subject to the fleet cap).
  - **Reroll stock: 2 cr** (redraws the 4 part offers).
  - Buy any number of things while credits last; unspent credits bank.
- This replaces the pick-1-of-3 draft entirely (DraftScreen deleted).

### Fight 1 softening

- Starting loadout buffed to **2× ion cannon** + electron computer + hull
  plating (4 of 6 slots). Fight 1 win rate: 68% → **89%**.

### UI

- Combat play-by-play details element is **open by default**.
- Combat log labels player ships ("Cruiser #1", "Interceptor #2").
- Credits shown on the prep screen and trade station.

### Balance results (1000 sims each; `npm run balance`)

Reference fleets: starting = cruiser with starting loadout; mid = one cruiser,
6 parts (~17 cr of upgrades); strong = realistic end-of-run fleet spending ~66
of the ~68 earnable credits (upgraded cruiser + 2 interceptors).

| Enemy | Starting fleet | Mid fleet | Strong fleet |
|---|---|---|---|
| Scout pack | 89% | 97% | 100% |
| Missile frigate | 48% | 89% | 100% |
| Shield cruiser | 24% | 35% | 100% |
| Interceptor swarm | 5% | 46% | 100% |
| Plasma tank | 0% | 13% | 98% |
| Sniper | 8% | 28% | 100% |
| Missile swarm | 74% | 74% | 100% |
| Ancient guardian | 0% | 1% | 93% |
| GCDS (boss) | 0% | 0% | 37% |

All four sanity checks pass: fight 1 ≥ 85%, fight 3 < 40% for the starting
fleet, ancient guardian ≥ 60% for the strong fleet, GCDS in the 20-60%
"hard but winnable" band (37%).

### Still out of scope

Map/branching paths, events, species, persistent damage/repairs, discovery
relics, meta-progression, art, sound, manual targeting, saves.

