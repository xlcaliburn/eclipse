import type { Part, PartId } from './types';

// Iteration 40 weapon repricing: the Ion cannon (1 cannon die, 1 damage,
// 3cr) is the price anchor for every other weapon in the roster — 3cr per
// point of total damage-per-activation for a cannon (so a plain 2-damage
// cannon prices at 6cr, a plain 3-damage cannon at 9cr, a plain 4-damage
// cannon at 12cr — landing rare/epic/legendary respectively, a clean fit
// with the existing common(3-4)/rare(5-6)/epic(7-9)/legendary(12) price
// bands from iteration 36's rarity system). Missiles anchor slightly
// cheaper (they fire once, in the opening volley only, with no return
// fire that phase — real less-flexibility, priced in). Utility (pierce,
// AOE, always-hits-a-die-more, etc.) adds a premium above the raw-damage
// price; a real drawback (the Rift cannon's self-damage) discounts below
// it. See plans/iteration-40.md... actually no plan file for this one —
// scoped and shipped directly per user direction, 2026-08-07.
export const PARTS: Part[] = [
  {
    id: 'ion',
    name: 'Ion cannon',
    type: 'weapon',
    rarity: 'common',
    description: '1 cannon die, 1 damage',
    cost: 3, // the price anchor — 3cr per point of cannon damage
    weapon: { kind: 'cannon', diceCount: 1, damage: 1 },
  },
  // Iteration 41: the common tier's first missile — the Missile rack (rare,
  // 5cr) had no cheaper on-ramp below it. Priced under the missile discount
  // same as every other missile, just at the 1-damage floor.
  {
    id: 'light-missile',
    name: 'Light missile',
    type: 'weapon',
    rarity: 'common',
    description: '1 missile die, 1 damage (fires once, before cannons)',
    cost: 2,
    weapon: { kind: 'missile', diceCount: 1, damage: 1 },
  },
  {
    id: 'plasma',
    name: 'Plasma cannon',
    type: 'weapon',
    rarity: 'rare',
    description: '1 cannon die, 2 damage',
    cost: 6, // 2 dmg x 3cr/dmg (was 5cr)
    weapon: { kind: 'cannon', diceCount: 1, damage: 2 },
  },
  {
    id: 'missile',
    name: 'Missile rack',
    type: 'weapon',
    rarity: 'rare',
    description: '2 missile dice, 1 damage each (fires once, before cannons)',
    cost: 5, // missile discount off the 2-dmg cannon-equivalent price (6cr)
    weapon: { kind: 'missile', diceCount: 2, damage: 1 },
  },
  {
    id: 'comp1',
    name: 'Electron computer',
    type: 'computer',
    rarity: 'common',
    description: '+1 computer',
    cost: 3,
    computer: 1,
  },
  {
    id: 'comp2',
    name: 'Positron computer',
    type: 'computer',
    rarity: 'rare',
    description: '+2 computer',
    cost: 5,
    computer: 2,
  },
  // Iteration 36: reprice 7 -> 9cr to sit on the stat-item ladder (the +3
  // tier is common/rare/epic-priced at 3/5/9, gap-widened rare->epic vs.
  // common->rare per the user's spec).
  {
    id: 'comp3',
    name: 'Gluon computer',
    type: 'computer',
    rarity: 'epic',
    description: '+3 computer',
    cost: 9,
    computer: 3,
  },
  // 2026-08-07: "Gauss/Phase/Absorption shield" renamed off "shield" —
  // the underlying stat has been "Piloting" since iteration 29 (a pilot's
  // evasive skill, not a physical barrier), so the name kept implying a
  // mechanic the game no longer has. New suffix "coils" (maneuvering
  // coils) reads as piloting/evasion hardware instead. `type: 'shield'`
  // (the PartType enum value / shop-pool category) is untouched — this is
  // a display-text-only rename, same scope as 29's own stat rename.
  {
    id: 'shield1',
    name: 'Gauss coils',
    type: 'shield',
    rarity: 'common',
    description: '+1 piloting',
    cost: 3,
    shield: 1,
  },
  {
    id: 'shield2',
    name: 'Phase coils',
    type: 'shield',
    rarity: 'rare',
    description: '+2 piloting',
    cost: 5,
    shield: 2,
  },
  {
    id: 'hull1',
    name: 'Hull plating',
    type: 'hull',
    rarity: 'common',
    description: '+1 HP',
    cost: 3,
    hull: 1,
  },
  {
    id: 'hull2',
    name: 'Improved hull',
    type: 'hull',
    rarity: 'rare',
    description: '+2 HP',
    cost: 5,
    hull: 2,
  },
  {
    id: 'init1',
    name: 'Ion thruster',
    type: 'drive',
    rarity: 'common',
    description: '+1 initiative',
    cost: 3,
    initiative: 1,
  },
  // Iteration 36 (the stat-item ladder): fills the +2 initiative rung that
  // used to be missing between Ion thruster (+1) and Fusion drive (+3).
  {
    id: 'init2',
    name: 'Plasma thruster',
    type: 'drive',
    rarity: 'rare',
    description: '+2 initiative',
    cost: 5,
    initiative: 2,
  },
  // Iteration 36: reprice 7 -> 9cr — see comp3's note above.
  {
    id: 'init3',
    name: 'Fusion drive',
    type: 'drive',
    rarity: 'epic',
    description: '+3 initiative',
    cost: 9,
    initiative: 3,
  },

  // --- Exotic weapons + taunt (iteration 5) ---
  // Iteration 40: promoted to legendary — 4 dmg x 3cr/dmg = 12cr lands
  // exactly on the legendary price floor already set by shieldharmonic, no
  // fudging needed. Used to sit at epic next to the Siege cannon, where it
  // was a strictly better pick (same price, more raw damage, no drawback
  // and no restriction) — pulling it up a tier resolves that outright
  // rather than nerfing its damage to compensate.
  {
    id: 'antimatter',
    name: 'Antimatter cannon',
    type: 'weapon',
    rarity: 'legendary',
    description: '1 cannon die, 4 damage',
    cost: 12,
    weapon: { kind: 'cannon', diceCount: 1, damage: 4 },
  },
  // 2026-08-08: Rift cannon pulled from the shop pool "for now" — parked in
  // plans/parking-lot.md rather than deleted outright. The shared
  // self-damage-on-nat-1 mechanic (selfDamageOnNatOne) stays live in
  // combatEngine.ts/resolver.ts — the enemy Rift cult still uses it.
  {
    id: 'flak',
    name: 'Flak battery',
    type: 'shield',
    rarity: 'common',
    description: 'Cancels 1 enemy missile die each combat (stacks)',
    cost: 3,
    flak: 1,
  },
  // 2026-08-07: a rare-tier anti-missile option — Flak battery had no
  // on-ramp above common. Same mechanism (`flak`, a plain fleet-wide pool
  // summed across every alive ship — see combatEngine.ts's `flakState`),
  // no new engine code, just a bigger number. Priced on the common->rare
  // stat-ladder gap (+2cr per iteration 36's rule) off Flak battery's 3cr.
  {
    id: 'flak2',
    name: 'Point-defense grid',
    type: 'shield',
    rarity: 'rare',
    description: 'Cancels 2 enemy missile dice each combat (stacks with itself and Flak battery)',
    cost: 5,
    flak: 2,
  },
  {
    id: 'lure',
    name: 'Lure beacon',
    type: 'shield',
    rarity: 'rare',
    description: 'While this ship is alive, all enemy weapons target it',
    cost: 5,
    taunt: true,
  },
  {
    id: 'reactive',
    name: 'Reactive armor',
    type: 'shield',
    rarity: 'rare',
    description: 'Negates the first hit this ship takes this combat (stacks)',
    cost: 5,
    reactiveArmor: 1,
  },

  // --- Passive arsenal (iteration 7) ---
  {
    id: 'lance',
    name: 'Gauss lance',
    type: 'weapon',
    rarity: 'epic',
    description: '1 cannon die, 2 damage, ignores 2 points of enemy piloting',
    cost: 7, // 2 dmg (6cr) + a real pierce-2 premium — bumped to epic (was rare, 6cr)
    weapon: { kind: 'cannon', diceCount: 1, damage: 2, shieldPierce: 2 },
  },
  {
    id: 'torpedo',
    name: 'Heavy torpedo',
    type: 'weapon',
    rarity: 'epic',
    description: '1 missile die, 3 damage (fires once, before cannons)',
    cost: 7, // 3 dmg cannon-equivalent (9cr) minus the missile discount — bumped to epic (was rare, 5cr)
    weapon: { kind: 'missile', diceCount: 1, damage: 3 },
  },
  {
    id: 'arc',
    name: 'Arc projector',
    type: 'weapon',
    rarity: 'rare',
    description: '1 cannon die; on hit, deals 1 damage to every enemy ship',
    cost: 6, // 1 dmg base (3cr) + a flat AOE premium
    weapon: { kind: 'cannon', diceCount: 1, damage: 0, aoeDamage: 1 },
  },
  // Iteration 40: "always targets the highest-HP enemy" read as a
  // restriction, not a benefit, once it was sitting next to a strictly
  // stronger, unrestricted Antimatter cannon at the same price — dropped
  // entirely. Now a plain 3-damage cannon (9cr, matching the raw-damage
  // formula exactly) and the new top of the epic tier, since Antimatter
  // moved up to legendary.
  {
    id: 'siege',
    name: 'Siege cannon',
    type: 'weapon',
    rarity: 'epic',
    description: '1 cannon die, 3 damage',
    cost: 9,
    weapon: { kind: 'cannon', diceCount: 1, damage: 3 },
  },
  // 2026-08-07: renamed from "Ion battery" — swapped with 'twinauto' below
  // so "Twin" (2 dice) and "battery" (a bigger rack, 3 dice) actually
  // match their dice counts. Stats/rarity/cost untouched, id kept for
  // save/reference stability (same pattern as the Flagship/'cruiser' id).
  {
    id: 'battery',
    name: 'Twin autocannon',
    type: 'weapon',
    rarity: 'rare',
    description: '2 cannon dice, 1 damage each',
    cost: 6, // 2 dmg total x 3cr/dmg (was 5cr)
    weapon: { kind: 'cannon', diceCount: 2, damage: 1 },
  },

  // --- Iteration 42: eight new weapons (2026-08-07). See
  // plans/iteration-42.md for the full pricing/engine-work rationale — two
  // of the original ten (Ion disruptor cannon, Boarding torpedo) are
  // parked, not cut; see plans/parking-lot.md. ---
  // 2026-08-07: renamed from "Twin autocannon" — see 'battery' above.
  {
    id: 'twinauto',
    name: 'Ion battery',
    type: 'weapon',
    rarity: 'epic',
    description: '3 cannon dice, 1 damage each',
    cost: 9, // 3 dmg total x 3cr/dmg, same ceiling as Siege cannon — volume over punch
    weapon: { kind: 'cannon', diceCount: 3, damage: 1 },
  },
  {
    id: 'clustermissile',
    name: 'Cluster missile',
    type: 'weapon',
    rarity: 'epic',
    description: '3 missile dice, 1 damage each (fires once, before cannons)',
    cost: 8, // missile-discounted off Twin autocannon's 9cr
    weapon: { kind: 'missile', diceCount: 3, damage: 1 },
  },
  {
    id: 'protoovercharge',
    name: 'Prototype overcharge cannon',
    type: 'weapon',
    rarity: 'epic',
    description: '1 cannon die, 2 damage. Rolls on 7: a natural 7 always hits and deals +1 damage',
    cost: 8, // 2 dmg (6cr) + a permanent taste of the Overcharged rounds protocol on one weapon
    weapon: { kind: 'cannon', diceCount: 1, damage: 2, overcharge: true },
  },
  // Iteration 36's negative-shield mechanism (`shield1`/`shield2` add
  // piloting; this subtracts it) already flows through deriveStats and
  // effectiveShield's existing floor-at-0 clamp — no engine change needed.
  {
    id: 'railgun',
    name: 'Railgun',
    type: 'weapon',
    rarity: 'legendary',
    description: '1 cannon die, 5 damage. -2 piloting on this ship, for the whole fight',
    cost: 13, // 5 dmg (15cr) discounted for the real self-debuff — the hardest single hit in the game
    weapon: { kind: 'cannon', diceCount: 1, damage: 5 },
    shield: -2,
  },
  {
    id: 'gravitonbeam',
    name: 'Graviton beam',
    type: 'weapon',
    rarity: 'epic',
    description: '1 cannon die, 2 damage. A miss still deals 1 damage anyway',
    cost: 7, // 2 dmg (6cr) + a consistency premium for the guaranteed floor
    weapon: { kind: 'cannon', diceCount: 1, damage: 2, chipOnMiss: 1 },
  },
  // 2026-08-07: executeAtHp raised 1 -> 2 after a test caught the launch
  // numbers making the clause numerically inert — a target at exactly 1 HP
  // already dies to the plain 1 damage, so the override never changed an
  // actual outcome. At 2, a 2-HP target that would otherwise take two
  // hits to kill instead dies to this one, which is the whole point.
  {
    id: 'executioner',
    name: 'Executioner cannon',
    type: 'weapon',
    rarity: 'rare',
    description: '1 cannon die, 1 damage. A hit against a target at 2 HP or less deals its full remaining HP',
    cost: 5, // priced as a situational finisher, not a routine damage multiplier
    weapon: { kind: 'cannon', diceCount: 1, damage: 1, executeAtHp: 2 },
  },
  {
    id: 'flechette',
    name: 'Flechette cannon',
    type: 'weapon',
    rarity: 'rare',
    description: '1 cannon die, 1 damage; on a hit, also deals 1 damage to a second target',
    cost: 5, // cheap and shotgun-flavored — splash only lands when the primary pellet does
    weapon: { kind: 'cannon', diceCount: 1, damage: 1, cleaveDamage: 1 },
  },
  {
    id: 'homing',
    name: 'Homing missile',
    type: 'weapon',
    rarity: 'epic',
    description: '1 missile die, 2 damage. Ignores taunt and priority targeting — always finds the lowest-HP enemy',
    cost: 7, // Missile rack's 2dmg/5cr precedent + a real premium for bypassing taunt/priority entirely
    weapon: { kind: 'missile', diceCount: 1, damage: 2, bypassTaunt: true },
  },

  {
    id: 'prow',
    name: 'Ramming prow',
    type: 'hull',
    rarity: 'common',
    description: 'When this ship is destroyed, immediately deal 3 damage to the lowest-HP enemy',
    cost: 4,
    onDestroyDamage: 3,
  },
  {
    id: 'ablative',
    name: 'Ablative coating',
    type: 'hull',
    rarity: 'rare',
    description: '+2 temporary HP each combat, absorbed before real HP (does not persist between fights, stacks)',
    cost: 5,
    ablative: 2,
  },
  {
    id: 'capacitor',
    // Was +2 for 5cr, which Phase coils (+2 always, 5cr) strictly
    // dominated. Now it is the anti-alpha-strike answer instead: cheaper
    // and stronger than Phase coils while it lasts, useless once a fight
    // grinds past the opening exchange. 2026-08-07: renamed off "Shield
    // capacitor" — see shield1/shield2's note.
    name: 'Piloting capacitor',
    type: 'shield',
    rarity: 'common',
    description: '+3 piloting during the missile phase and the first cannon round only',
    cost: 4,
    capacitorShield: 3,
  },
  {
    id: 'cloak',
    name: 'Cloaking field',
    type: 'shield',
    rarity: 'rare',
    description:
      'This ship cannot be targeted while any non-cloaked player ship is alive (taunt overrides cloak)',
    cost: 6,
    cloak: true,
  },

  // --- Active parts (iteration 7): a passive line, plus a once-per-combat
  // activated ability triggered between rounds (same window as cards). ---
  // Iteration 41: redesigned — "all your ships fire first" was a flashy
  // first taste of an active part (see STARTING_LOADOUT's note below for
  // the original reasoning) but read as a confusing tutorial-moment ability
  // on the starting ship. Repairing HP is immediately legible instead: you
  // click it, the number goes down. Weaker than dcbay's repair-2 (hence
  // rare, not epic, and priced under it) — dcbay stays the bigger,
  // signature-tier version of the same idea.
  // 2026-08-07: `type` corrected 'drive' -> 'hull' — the redesign made it a
  // +HP/repair part (identical shape to dcbay, which is already type
  // 'hull'), so it belongs in the shop's defense pool now, not
  // computer-drive. Purely a shop-draw-pool classification fix; no stat or
  // behavior change.
  {
    id: 'injector',
    name: 'Overdrive injector',
    type: 'hull',
    rarity: 'rare',
    description: '+1 HP. Active (1/combat): repair 1 HP on this ship immediately.',
    cost: 5,
    hull: 1,
    active: true,
  },
  {
    id: 'uplink2',
    name: 'Targeting uplink',
    type: 'computer',
    rarity: 'epic',
    description: '+1 computer. Active (1/combat): this round, all your ships gain +2 computer.',
    cost: 8,
    computer: 1,
    active: true,
  },
  {
    id: 'dcbay',
    name: 'Damage control bay',
    type: 'hull',
    rarity: 'epic',
    description: '+1 HP. Active (1/combat): repair 2 damage on this ship immediately.',
    cost: 7,
    hull: 1,
    active: true,
  },
  {
    id: 'override',
    name: 'Fire-control override',
    type: 'computer',
    rarity: 'epic',
    description: '+1 computer. Active (1/combat): this round, each missed die from this ship is rerolled once.',
    cost: 8,
    computer: 1,
    active: true,
  },
  {
    id: 'thrusters',
    name: 'Emergency thrusters',
    type: 'drive',
    rarity: 'rare',
    description:
      '+1 initiative. Active (1/combat): evasive burn — this round, this ship cannot be targeted and does not fire.',
    cost: 6,
    initiative: 1,
    active: true,
  },
  // 2026-08-07: renamed off "Shield modulator" — see shield1/shield2's note.
  {
    id: 'modulator',
    name: 'Piloting modulator',
    type: 'shield',
    rarity: 'epic',
    description: '+1 piloting. Active (1/combat): this round, all your ships gain +2 piloting.',
    cost: 7,
    shield: 1,
    active: true,
  },
  {
    id: 'chaff',
    name: 'Chaff launcher',
    type: 'shield',
    rarity: 'epic',
    description:
      '+1 piloting. Active (1/combat): this round, natural 6s against this ship are not automatic hits — they resolve as normal rolls.',
    cost: 7,
    shield: 1,
    active: true,
  },

  // --- Support hulls' former signature parts (iteration 23) — now
  // ordinary shop-purchasable parts like everything else, since iteration
  // 36 stripped the bundle that used to tie each one to a specific frame.
  // Any hull can carry one. ---
  {
    id: 'tacrelay',
    name: 'Tactical relay',
    type: 'computer',
    rarity: 'epic',
    description: '+1 computer. Active (1/combat): this round, all allies gain +1 computer and +1 initiative.',
    cost: 8,
    computer: 1,
    active: true,
  },
  // Iteration 36: reprice 9 -> 12cr — the rarity system's launch legendary.
  // A fleet-wide always-on aura (not a once-per-combat button, not a
  // bigger stat stick) is the roster's one effect that's actually
  // legendary-grade rather than just an expensive rare.
  // 2026-08-07: renamed off "Shield harmonic" — see shield1/shield2's note.
  {
    id: 'shieldharmonic',
    name: 'Piloting harmonic',
    type: 'shield',
    rarity: 'legendary',
    description: 'While equipped, +1 piloting to every ship in the fleet, for the whole fight.',
    cost: 12,
    fleetShieldAura: 1,
  },
  {
    id: 'repairbay',
    name: 'Repair drone bay',
    type: 'hull',
    rarity: 'epic',
    description: "+1 HP. Active (1/combat): repairs 3 damage on the fleet's most-damaged ship.",
    cost: 8,
    hull: 1,
    active: true,
  },
  {
    id: 'ecm',
    name: 'ECM pod',
    type: 'computer',
    rarity: 'epic',
    description: "+1 computer. Active (1/combat): this round, the enemy fleet's computer is reduced by 2.",
    cost: 8,
    computer: 1,
    active: true,
  },
  // 2026-08-07: reworked from "Shield disruptor" (enemy piloting -2 for a
  // round) into a pure player-side piloting bonus — the "piloting &
  // defenses" category no longer touches the enemy fleet at all (see
  // modulator/shield1-3/capacitor/shieldharmonic's own renames, same
  // pass). Differentiated from Piloting modulator's fleet-wide-but-
  // 1-round spike: this is single-ship but PERMANENT for the rest of the
  // fight — a genuinely different shape, not a reskin. Mutates this
  // ship's own live stats.shield directly (a new pattern — every other
  // active either mutates .damage or a 1-round roundModifier; see
  // combatEngine.ts's 'disruptor' case).
  {
    id: 'disruptor',
    name: 'Evasion suite',
    type: 'shield',
    rarity: 'epic',
    description: '+1 piloting. Active (1/combat): this ship gains +3 piloting for the rest of the fight.',
    cost: 8,
    shield: 1,
    active: true,
  },

  // --- The stat-item ladder (iteration 36): full +1/+2/+3 coverage for
  // every flat stat, common/rare/epic at 3/5/9cr — the rare->epic gap (+4)
  // deliberately wider than common->rare (+2), so the +3 tier reads as a
  // real find, priced AND rarity-gated as one. ---
  // 2026-08-07: renamed off "Absorption shield" — see shield1/shield2's
  // note; "Vector" completes the coils family instead of "Absorption"
  // (which implied tanking a hit, not evading it).
  {
    id: 'shield3',
    name: 'Vector coils',
    type: 'shield',
    rarity: 'epic',
    description: '+3 piloting',
    cost: 9,
    shield: 3,
  },
  {
    id: 'hull3',
    name: 'Adamantine hull',
    type: 'hull',
    rarity: 'epic',
    description: '+3 HP',
    cost: 9,
    hull: 3,
  },
];

// The commodity lot (iteration 20): a pseudo-part that occupies a slot like
// any other, but is never sold to the shop's random offer draw and never
// unequips to inventory — bought and sold for real credits via
// BUY_COMMODITY_LOT/SELL_COMMODITY_LOT instead. Kept out of `PARTS` so the
// shop's random draw (`PARTS[i]`) never offers it for sale.
export const COMMODITY_LOT_PART_ID: PartId = 'commodity-lot';

const COMMODITY_LOT_PART: Part = {
  id: COMMODITY_LOT_PART_ID,
  name: 'Commodity lot',
  type: 'cargo',
  rarity: 'common',
  description: 'Bought low, sold high at a later station. Occupies a slot; lost if the carrying ship is.',
  cost: 0,
};

// Iteration 34 (the relic chain): the quest capstone — assembled from
// three relic fragments found at different event nodes (see events.ts's
// relic-signal/relic-vault/relic-core), never sold in any shop. Kept out
// of `PARTS` for the same reason as the commodity lot above: every shop
// offer pool filters from that array, so absence there is the only gate
// this part needs — no special-case exclusion logic anywhere else.
// Otherwise a completely normal part: equips/unequips freely, salvages to
// inventory if its ship is scuttled, lost with the ship if it's destroyed
// while equipped, sellable (badly — floor(12/2) = 6cr against parts of
// comparable power costing 5-7cr to begin with).
export const ANCIENT_ARTIFACT_PART_ID: PartId = 'ancient-artifact';

const ANCIENT_ARTIFACT_PART: Part = {
  id: ANCIENT_ARTIFACT_PART_ID,
  name: 'Ancient artifact',
  type: 'computer',
  rarity: 'legendary',
  description: '+4 computer, +4 piloting. Assembled from three relic fragments — irreplaceable.',
  cost: 12,
  computer: 4,
  shield: 4,
};

// Iteration 40 ("Captured schematic"): an elite-kill-exclusive weapon —
// "essentially a slightly stronger rare tier weapon" than anything sold in
// a shop, since it's loot, not a purchase. A modified Plasma cannon that
// deals 3 damage instead of 2, with none of the Rift cannon's self-damage
// risk — priced at the Rift's 6cr for sell-value purposes only (it's never
// actually offered for sale; see CAPTURED_SCHEMATIC_PART_ID's use in
// reducer.ts's CONTINUE case, granted straight to inventory on every elite
// kill). Kept out of `PARTS` for the same reason as the commodity lot and
// Ancient artifact above.
export const CAPTURED_SCHEMATIC_PART_ID: PartId = 'captured-plasma';

const CAPTURED_SCHEMATIC_PART: Part = {
  id: CAPTURED_SCHEMATIC_PART_ID,
  name: 'Captured plasma cannon',
  type: 'weapon',
  rarity: 'rare',
  description: '1 cannon die, 3 damage. A modified plasma cannon salvaged from an elite kill — never sold.',
  cost: 6,
  weapon: { kind: 'cannon', diceCount: 1, damage: 3 },
};

const PARTS_BY_ID: Record<PartId, Part> = Object.fromEntries(
  [...PARTS, COMMODITY_LOT_PART, ANCIENT_ARTIFACT_PART, CAPTURED_SCHEMATIC_PART].map((p) => [p.id, p]),
);

export function getPart(id: PartId): Part {
  const part = PARTS_BY_ID[id];
  if (!part) throw new Error(`Unknown part id: ${id}`);
  return part;
}

// Two ion cannons: softened from one in iteration 2 so fight 1 is a friendly
// opener rather than a coin flip.
// Iteration 35: gained the Overdrive injector as a 5th part (the Flagship
// has 6 slots, only 4 spoken for) — compensation for the reaction-card
// system's removal. Injector, not one of the roster's other unclaimed
// actives (override, thrusters, modulator): it's the one active whose
// effect a first-time player can read on sight (iteration 41: now a self-
// heal, previously "fire first this round" — both are immediately legible
// without decoding a round-modifier). The other active parts are left
// alone deliberately — several are commander/support-hull signature parts
// (uplink2, dcbay, chaff, tacrelay, repairbay, ecm, disruptor), and handing
// one out for free to everyone would blunt exactly the thing that makes
// drafting that commander or hull feel distinct.
// 2026-08-08: dropped hull1 from the starting fit — a starting stat item
// occupying a slot read as "the reference build already needs upgrading."
// The +1 HP it granted moved to the Flagship's own base stats instead (see
// frames.ts's cruiser entry) — same net HP, one fewer part cluttering the
// first loadout, and the fitting budget the item cost is simply gone.
export const STARTING_LOADOUT: PartId[] = ['ion', 'ion', 'comp1', 'injector'];
