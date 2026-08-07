import type { Part, PartId } from './types';

export const PARTS: Part[] = [
  {
    id: 'ion',
    name: 'Ion cannon',
    type: 'weapon',
    description: '1 cannon die, 1 damage',
    cost: 3,
    weapon: { kind: 'cannon', diceCount: 1, damage: 1 },
  },
  {
    id: 'plasma',
    name: 'Plasma cannon',
    type: 'weapon',
    description: '1 cannon die, 2 damage',
    cost: 5,
    weapon: { kind: 'cannon', diceCount: 1, damage: 2 },
  },
  {
    id: 'missile',
    name: 'Missile rack',
    type: 'weapon',
    description: '2 missile dice, 1 damage each (fires once, before cannons)',
    cost: 5,
    weapon: { kind: 'missile', diceCount: 2, damage: 1 },
  },
  {
    id: 'comp1',
    name: 'Electron computer',
    type: 'computer',
    description: '+1 computer',
    cost: 3,
    computer: 1,
  },
  {
    id: 'comp2',
    name: 'Positron computer',
    type: 'computer',
    description: '+2 computer',
    cost: 5,
    computer: 2,
  },
  {
    id: 'comp3',
    name: 'Gluon computer',
    type: 'computer',
    description: '+3 computer',
    cost: 7,
    computer: 3,
  },
  {
    id: 'shield1',
    name: 'Gauss shield',
    type: 'shield',
    description: '+1 piloting',
    cost: 3,
    shield: 1,
  },
  {
    id: 'shield2',
    name: 'Phase shield',
    type: 'shield',
    description: '+2 piloting',
    cost: 5,
    shield: 2,
  },
  {
    id: 'hull1',
    name: 'Hull plating',
    type: 'hull',
    description: '+1 HP',
    cost: 3,
    hull: 1,
  },
  {
    id: 'hull2',
    name: 'Improved hull',
    type: 'hull',
    description: '+2 HP',
    cost: 5,
    hull: 2,
  },
  {
    id: 'init1',
    name: 'Ion thruster',
    type: 'drive',
    description: '+1 initiative',
    cost: 3,
    initiative: 1,
  },
  {
    id: 'init3',
    name: 'Fusion drive',
    type: 'drive',
    description: '+3 initiative',
    cost: 7,
    initiative: 3,
  },

  // --- Exotic weapons + taunt (iteration 5) ---
  {
    id: 'antimatter',
    name: 'Antimatter cannon',
    type: 'weapon',
    description: '1 cannon die, 4 damage',
    cost: 7,
    weapon: { kind: 'cannon', diceCount: 1, damage: 4 },
  },
  {
    id: 'rift',
    name: 'Rift cannon',
    type: 'weapon',
    description: '1 cannon die, 3 damage. Natural 1 backfires: 1 damage to this ship instead of missing.',
    cost: 5,
    weapon: { kind: 'cannon', diceCount: 1, damage: 3, selfDamageOnNatOne: 1 },
  },
  {
    id: 'flak',
    name: 'Flak battery',
    type: 'shield',
    description: 'Cancels 1 enemy missile die each combat (stacks)',
    cost: 3,
    flak: 1,
  },
  {
    id: 'lure',
    name: 'Lure beacon',
    type: 'shield',
    description: 'While this ship is alive, all enemy weapons target it',
    cost: 5,
    taunt: true,
  },
  {
    id: 'reactive',
    name: 'Reactive armor',
    type: 'shield',
    description: 'Negates the first hit this ship takes this combat (stacks)',
    cost: 5,
    reactiveArmor: 1,
  },

  // --- Passive arsenal (iteration 7) ---
  {
    id: 'lance',
    name: 'Gauss lance',
    type: 'weapon',
    description: '1 cannon die, 2 damage, ignores 2 points of enemy piloting',
    cost: 6,
    weapon: { kind: 'cannon', diceCount: 1, damage: 2, shieldPierce: 2 },
  },
  {
    id: 'torpedo',
    name: 'Heavy torpedo',
    type: 'weapon',
    description: '1 missile die, 3 damage (fires once, before cannons)',
    cost: 5,
    weapon: { kind: 'missile', diceCount: 1, damage: 3 },
  },
  {
    id: 'arc',
    name: 'Arc projector',
    type: 'weapon',
    description: '1 cannon die; on hit, deals 1 damage to every enemy ship',
    cost: 6,
    weapon: { kind: 'cannon', diceCount: 1, damage: 0, aoeDamage: 1 },
  },
  {
    id: 'siege',
    name: 'Siege cannon',
    type: 'weapon',
    description: '1 cannon die, 3 damage, always targets the highest-HP enemy',
    cost: 7,
    weapon: { kind: 'cannon', diceCount: 1, damage: 3, targetHighest: true },
  },
  {
    id: 'battery',
    name: 'Ion battery',
    type: 'weapon',
    description: '2 cannon dice, 1 damage each',
    cost: 5,
    weapon: { kind: 'cannon', diceCount: 2, damage: 1 },
  },
  {
    id: 'prow',
    name: 'Ramming prow',
    type: 'hull',
    description: 'When this ship is destroyed, immediately deal 3 damage to the lowest-HP enemy',
    cost: 4,
    onDestroyDamage: 3,
  },
  {
    id: 'ablative',
    name: 'Ablative coating',
    type: 'hull',
    description: '+2 temporary HP each combat, absorbed before real HP (does not persist between fights, stacks)',
    cost: 5,
    ablative: 2,
  },
  {
    id: 'capacitor',
    // Was +2 for 5cr, which the Phase shield (+2 always, 5cr) strictly
    // dominated. Now it is the anti-alpha-strike answer instead: cheaper and
    // stronger than a Phase shield while it lasts, useless once a fight
    // grinds past the opening exchange.
    name: 'Shield capacitor',
    type: 'shield',
    description: '+3 piloting during the missile phase and the first cannon round only',
    cost: 4,
    capacitorShield: 3,
  },
  {
    id: 'cloak',
    name: 'Cloaking field',
    type: 'shield',
    description:
      'This ship cannot be targeted while any non-cloaked player ship is alive (taunt overrides cloak)',
    cost: 6,
    cloak: true,
  },

  // --- Active parts (iteration 7): a passive line, plus a once-per-combat
  // activated ability triggered between rounds (same window as cards). ---
  {
    id: 'injector',
    name: 'Overdrive injector',
    type: 'drive',
    description: '+1 initiative. Active (1/combat): this round, all your ships fire first.',
    cost: 7,
    initiative: 1,
    active: true,
  },
  {
    id: 'uplink2',
    name: 'Targeting uplink',
    type: 'computer',
    description: '+1 computer. Active (1/combat): this round, all your ships gain +2 computer.',
    cost: 8,
    computer: 1,
    active: true,
  },
  {
    id: 'dcbay',
    name: 'Damage control bay',
    type: 'hull',
    description: '+1 HP. Active (1/combat): repair 2 damage on this ship immediately.',
    cost: 7,
    hull: 1,
    active: true,
  },
  {
    id: 'override',
    name: 'Fire-control override',
    type: 'computer',
    description: '+1 computer. Active (1/combat): this round, each missed die from this ship is rerolled once.',
    cost: 8,
    computer: 1,
    active: true,
  },
  {
    id: 'thrusters',
    name: 'Emergency thrusters',
    type: 'drive',
    description:
      '+1 initiative. Active (1/combat): evasive burn — this round, this ship cannot be targeted and does not fire.',
    cost: 6,
    initiative: 1,
    active: true,
  },
  {
    id: 'modulator',
    name: 'Shield modulator',
    type: 'shield',
    description: '+1 piloting. Active (1/combat): this round, all your ships gain +2 piloting.',
    cost: 7,
    shield: 1,
    active: true,
  },
  {
    id: 'chaff',
    name: 'Chaff launcher',
    type: 'shield',
    description:
      '+1 piloting. Active (1/combat): this round, natural 6s against this ship are not automatic hits — they resolve as normal rolls.',
    cost: 7,
    shield: 1,
    active: true,
  },

  // --- Support hulls (iteration 23): signature parts for five new frames.
  // Each is also an ordinary shop-purchasable part, same as Bastion's lure
  // — the frame just arrives pre-fitted with one. ---
  {
    id: 'tacrelay',
    name: 'Tactical relay',
    type: 'computer',
    description: '+1 computer. Active (1/combat): this round, all allies gain +1 computer and +1 initiative.',
    cost: 8,
    computer: 1,
    active: true,
  },
  {
    id: 'shieldharmonic',
    name: 'Shield harmonic',
    type: 'shield',
    description: 'While equipped, +1 piloting to every ship in the fleet, for the whole fight.',
    cost: 9,
    fleetShieldAura: 1,
  },
  {
    id: 'repairbay',
    name: 'Repair drone bay',
    type: 'hull',
    description: "+1 HP. Active (1/combat): repairs 3 damage on the fleet's most-damaged ship.",
    cost: 8,
    hull: 1,
    active: true,
  },
  {
    id: 'ecm',
    name: 'ECM pod',
    type: 'computer',
    description: "+1 computer. Active (1/combat): this round, the enemy fleet's computer is reduced by 2.",
    cost: 8,
    computer: 1,
    active: true,
  },
  {
    id: 'disruptor',
    name: 'Shield disruptor',
    type: 'shield',
    description: "+1 piloting. Active (1/combat): this round, the enemy fleet's piloting is reduced by 2.",
    cost: 8,
    shield: 1,
    active: true,
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
  description: 'Bought low, sold high at a later station. Occupies a slot; lost if the carrying ship is.',
  cost: 0,
};

const PARTS_BY_ID: Record<PartId, Part> = Object.fromEntries([...PARTS, COMMODITY_LOT_PART].map((p) => [p.id, p]));

export function getPart(id: PartId): Part {
  const part = PARTS_BY_ID[id];
  if (!part) throw new Error(`Unknown part id: ${id}`);
  return part;
}

// Two ion cannons: softened from one in iteration 2 so fight 1 is a friendly
// opener rather than a coin flip.
export const STARTING_LOADOUT: PartId[] = ['ion', 'ion', 'comp1', 'hull1'];
