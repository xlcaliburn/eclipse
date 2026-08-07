# Iteration 36 — Hulls as bases, rarity tiers, and the stat-item ladder (specced 2026-08-07)

> **Status: specced, not implemented.**
> Depends on nothing pending. Iteration 35 (cards/hand removal, uncommitted
> as of this spec) should land first — this iteration edits the same files
> (`parts.ts`, `reducer.ts`, `Wiki.tsx`).

User direction: "move the 'special ships' (eg bastion's lure beacon and the
shield harmonic, etc) into items, and keep ships as just the base, so that
they're more independent — each ship could in theory serve that basis; this
should open up design space to make each ship base be more unique in a
different way. Add rarity for each ship and part
(common grey / rare blue / epic purple / legendary gold) corresponding to
shop appearance odds — legendary 2%, epic 5%, rare 20%. There should be an
item for +1/+2/+3 of each of initiative, hull, piloting, computer, with
corresponding rarity; the pricing gap between rare/epic should be greater
than common/rare."

Three connected changes, one theme: **identity lives on parts; hulls are
chassis.** Today five of the eleven purchasable hulls exist only to carry a
bundled signature part (the Aegis Relay *is* the shield harmonic with a
2-slot shell around it), which means the interesting thing about the ship
isn't the ship. Stripping the bundles frees the parts to live anywhere,
frees the hull roster to differentiate on genuinely hull-shaped axes
(slots, HP, weapon caps, innate quirks like the Interceptor's jink), and —
with rarity governing how often the strong parts even show up — turns the
shop from a flat catalog into a slot machine with a visible pity floor.

## 36.1 De-gimmick the hulls

The signature parts already ARE ordinary shop-purchasable parts (`lure`,
`tacrelay`, `shieldharmonic`, `repairbay`, `ecm`, `disruptor` all sit in
`PARTS` and the shop pools today). The only coupling is `STARTING_FIT` in
reducer.ts pre-fitting them, so this milestone is mostly deletion:

- `STARTING_FIT` drops every *identity* part. Pure stat fits stay — they're
  "arrives combat-ready" QoL, not identity: `interceptor: ['ion']`,
  `light-cruiser: ['ion','shield1']`, `dreadnought: ['ion','ion','shield1']`.
  `bastion: ['lure']` → `[]`.
- **Bastion reprice 12 → 9cr** (it no longer includes a 5cr part, but its
  6-HP base is still the roster's best wall — don't refund the full 5).
  Blurb rewritten: durability is the identity now, "pair with a lure
  beacon" is a suggestion, not a bundle.
- **Retire the five support hulls as purchasable frames**: `frigate`,
  `aegis`, `tender`, `ew-cutter`, `disruptor-cutter`. Once stripped,
  frigate/ew-cutter/disruptor-cutter are stat-identical (3 slots, 2 HP,
  init 1, 1 weapon, ~8cr) and aegis is a worse Derelict at 3× the price —
  they have no base identity to keep. In their place, **one new hull**:
  - **Corvette** (`corvette`): 3 slots, 2 HP, init 1, max 1 weapon, 6cr,
    rarity common. The cheap utility carrier — the natural home for
    exactly the aura/active parts the old support hulls bundled, now
    player-assembled ("each ship could in theory serve that basis").
- **Save compatibility**: keep the retired `FrameId` values in the union
  and their entries in `FRAMES` (marked with a `legacy` comment), remove
  them only from `PURCHASABLE_FRAME_IDS`. Old saves with an Aegis in the
  fleet keep flying it; shops just never sell one again. No SAVE_VERSION
  bump. The wiki's hull table lists Flagship + purchasable frames only.
- Audit for retired-id references before deleting anything (92 grep hits
  across 13 files, most of them false friends): enemy names containing
  "frigate", the `repair-tender` event id, and `shipNames.ts` prefixes all
  match the strings without touching the frames. Real touchpoints:
  `ShipSilhouette.tsx` (keep the art — legacy fleets still render),
  `shipNames.ts` (retired ids can keep entries), `scripts/actRun.ts` policy
  tables, and test fixtures.
- The commander `SIGNATURE_PART` shop-discount system is orthogonal and
  untouched.
- **Deferred deliberately**: giving each surviving hull a new innate quirk
  (jink-alikes). This iteration opens the design space; filling it is a
  future content pass. Park it.

Surviving roster, each unique on a base axis:

| Hull | Base identity | Rarity |
|---|---|---|
| Flagship | 6 slots, the starting ship (never sold) | — |
| Derelict | 2 slots, 3cr — the beater | common |
| Interceptor | init 2 + innate jink | common |
| Corvette (new) | 3-slot / 1-weapon cheap utility carrier | common |
| Bastion | 6 HP wall, 1 weapon, 9cr | rare |
| Freighter | 5 slots / 2 weapons — the utility bus | rare |
| Cruiser | 4 slots, uncapped — no gimmick | epic |
| Dreadnought | 8 slots / 4 weapons capital (act-2 shipyard) | legendary |

## 36.2 Rarity tiers

- New shared type in types.ts: `Rarity = 'common' | 'rare' | 'epic' |
  'legendary'`. **Required** `rarity` field on both `Part` and `Frame` — a
  compile error on every unassigned item beats a silent default.
- **Shop odds per offer slot: common 73% / rare 20% / epic 5% / legendary
  2%** (sums to 100).
- **Part draw** keeps the 6-slot type-stratified layout in
  `drawShopOffers` (one weapon, one defense, etc.). Within each slot: roll
  the tier by the weights above, then draw uniformly from (slot's type
  pool ∩ tier ∖ taken); if that intersection is empty, fall back one tier
  at a time (legendary→epic→rare→common), and if even common is exhausted
  walk back up — the slot must always fill. One helper,
  `drawRarityWeighted(pool, taken, rng)`, used by every slot.
- **Frame draw** (`drawFrameOffers`) rolls the same tier weights per offer
  slot with the same fallback. Existing gates stack on top: the
  Dreadnought stays act-2 + shipyard only, so a legendary roll in an act-1
  store falls back to epic (Cruiser) rather than leaking a capital ship.
- Commander signature-part force-insertion and the Armada-mandate slot trim
  behave exactly as today (they operate on the drawn array, not the draw).
- **Determinism note**: the tier roll consumes one extra rng draw per offer
  slot, so existing seed codes produce different shops after this lands.
  Acceptable — seeds aren't versioned — but say so in the commit message.
- **UI**: four CSS variables (`--rarity-common` grey, `--rarity-rare` blue,
  `--rarity-epic` purple, `--rarity-legendary` gold). PartCard tints the
  part name and border; shop hull cards do the same; the wiki adds a
  rarity column with colored labels. No layout changes.
- Persistence: rarity derives from the id — no save shape change.

Part rarity assignments (cost stays as-is unless 36.3 says otherwise):

| Tier | Parts |
|---|---|
| common | ion, comp1, shield1, hull1, init1, flak, capacitor, prow |
| rare | plasma, missile, battery, rift, torpedo, lance, arc, reactive, lure, cloak, thrusters, comp2, shield2, hull2, init2 (new) |
| epic | antimatter, siege, injector, uplink2, dcbay, override, modulator, chaff, tacrelay, repairbay, ecm, disruptor, comp3, shield3 (new), hull3 (new), init3 |
| legendary | shieldharmonic (reprice 9 → 12cr — a fleet-wide always-on aura is the roster's only current legendary-grade effect) |

- The Ancient artifact and commodity lot stay out of `PARTS` (never shop
  stock) but get `rarity: 'legendary'` / `'common'` for display tinting.
- A one-part legendary tier is thin but honest — the 2% roll always finds
  the gold part. Seeding 1–2 more legendaries is parked for a content
  pass, not padded here with rebranded epics.

## 36.3 The stat-item ladder

Full +1/+2/+3 coverage for all four flat stats. Nine of twelve already
exist; three are new:

| Stat | +1 (common, 3cr) | +2 (rare, 5cr) | +3 (epic, 9cr) |
|---|---|---|---|
| computer | Electron computer | Positron computer | Gluon computer (7→**9cr**) |
| piloting | Gauss shield | Phase shield | **Absorption shield (new)** |
| hull | Hull plating | Improved hull | **Adamantine hull (new)** |
| initiative | Ion thruster | **Plasma thruster (new)** | Fusion drive (7→**9cr**) |

- Pricing rule (user-specified): common→rare gap +2cr, rare→epic gap +4cr
  — the +3 tier is priced (9cr) *and* gated (5% epic) as a real find, not
  a routine upgrade.
- The two existing +3 parts (comp3, init3) reprice 7 → 9cr to sit on the
  ladder; everything else keeps its price.
- New ids: `shield3`, `hull3`, `init2` — same shape as their siblings, no
  engine changes (all four stats already flow through `deriveStats`).
- Balance watch: `hull3` at +3 HP is the strongest single defensive part in
  the game and epic-gated; if actRun shows HP stacking dominating, the
  lever is its price (9 → 11), not its rarity.

## 36.4 Wiki, scripts, and tests

- **Wiki**: hull table reflects the new roster (+ rarity column); parts
  tables gain rarity tinting/column; the three new parts and the Corvette
  appear via the existing data-generated tables for free.
- **Scripts**: `actRun.ts` buy policies audit — anything that hardcodes
  support-hull purchases or old prices gets updated; `balance.ts` fixtures
  re-checked for retired frames and repriced parts.
- **Tests** (new/updated):
  - `STARTING_FIT` no longer contains identity parts; Bastion arrives
    empty at 9cr.
  - Retired frames absent from `PURCHASABLE_FRAME_IDS` /
    `drawFrameOffers`; a fixture save carrying an `aegis` still loads and
    derives stats.
  - Rarity: every part/frame has a tier; tier-roll boundaries (rng at
    .729/.731, .929/.931, .979/.981, .999) select the right tier; empty
    tiers fall back down; a Dreadnought-ineligible legendary roll falls
    back rather than leaking.
  - Ladder: 12 stat items exist at 3/5/9cr with common/rare/epic tiers;
    `shield3`/`hull3`/`init2` derive correctly.
- **Verification bar**: `tsc -b` clean, `vitest run` green, `vite build`
  clean. **No browser pass** — per the standing policy in CLAUDE.md
  (2026-08-07), the user verifies UI manually.

## Decision points (defaults chosen, flag if wrong)

1. **Support-hull cull**: retire all five + add the Corvette (recommended —
   stripped, three of them are stat-identical). Alternative: keep them and
   differentiate bases now, which drags the deferred "unique base quirks"
   pass into this iteration.
2. **Bastion 12 → 9cr** after losing the bundled lure.
3. **Legendary tier launches with one part** (shieldharmonic, 9→12cr);
   more legendaries are a parked content pass.
4. **Seed-stream break** from the extra rarity rng draws — accepted.

## Milestones

- **36.1** Hull roster: STARTING_FIT strip, Bastion reprice, retire five
  frames (legacy-kept), add Corvette, blurbs, audit.
- **36.2** Rarity core: type + fields on every part/frame, weighted
  tier-roll draw for parts and frames, UI tinting, wiki column.
- **36.3** Stat ladder: `shield3`, `hull3`, `init2`; reprice comp3/init3.
- **36.4** Scripts + tests + full verification bar.
