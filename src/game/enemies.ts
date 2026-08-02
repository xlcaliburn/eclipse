import type { EscalationId, ScheduledEscalation } from './escalations';
import type { EnemyDef, EnemyGroup, ShipStats } from './types';

// A one-entry composition — the vast majority of enemies are a single
// uniform group; only formation enemies (iteration 9) have more than one.
function solo(label: string, count: number, stats: ShipStats): EnemyGroup[] {
  return [{ label, count, stats }];
}

// The fixed 9-fight gauntlet, in order. Stats are starting points — tune only
// via `npm run balance` and record changes in PLAN.md.
export const GAUNTLET: EnemyDef[] = [
  {
    id: 'scout-pack',
    name: 'Scout pack',
    blurb: 'Basics — just bring guns.',
    groups: solo('scout', 2, {
      initiative: 0,
      hp: 1,
      computer: 0,
      shield: 0,
      cannons: [{ diceCount: 1, damage: 1 }],
      missiles: [],
    }),
  },
  {
    id: 'missile-frigate',
    name: 'Missile frigate',
    blurb: 'Hull survives the alpha strike.',
    groups: solo('frigate', 1, {
      initiative: 1,
      hp: 2,
      computer: 1,
      shield: 0,
      cannons: [{ diceCount: 1, damage: 1 }],
      missiles: [{ diceCount: 2, damage: 1 }],
    }),
  },
  {
    id: 'shield-cruiser',
    name: 'Shield cruiser',
    blurb: 'Computers beat shields.',
    groups: solo('cruiser', 1, {
      initiative: 1,
      hp: 3,
      computer: 0,
      shield: 2,
      cannons: [{ diceCount: 2, damage: 2 }],
      missiles: [],
    }),
  },
  {
    id: 'interceptor-swarm',
    name: 'Interceptor swarm',
    blurb: 'Many dice beat many small ships.',
    groups: solo('interceptor', 4, {
      initiative: 3,
      hp: 1,
      computer: 1,
      shield: 0,
      cannons: [{ diceCount: 1, damage: 1 }],
      missiles: [],
    }),
  },
  {
    id: 'plasma-tank',
    name: 'Plasma tank',
    blurb: 'Out-tempo it or out-tank it.',
    groups: solo('tank', 1, {
      initiative: 0,
      hp: 5,
      computer: 1,
      shield: 1,
      cannons: [{ diceCount: 2, damage: 2 }],
      missiles: [],
    }),
  },
  {
    id: 'sniper',
    name: 'Sniper',
    blurb: 'Shields blunt high computers.',
    groups: solo('sniper', 1, {
      initiative: 2,
      hp: 2,
      computer: 3,
      shield: 0,
      cannons: [{ diceCount: 1, damage: 2 }],
      missiles: [],
    }),
  },
  {
    id: 'missile-swarm',
    name: 'Missile swarm',
    blurb: 'Win initiative, kill before launch.',
    groups: solo('swarm', 3, {
      initiative: 2,
      hp: 1,
      computer: 0,
      shield: 0,
      cannons: [],
      missiles: [{ diceCount: 2, damage: 1 }],
    }),
  },
  {
    id: 'ancient-guardian',
    name: 'Ancient guardian',
    blurb: 'A balanced check of everything.',
    groups: solo('guardian', 1, {
      initiative: 2,
      hp: 4,
      computer: 2,
      shield: 2,
      cannons: [{ diceCount: 3, damage: 1 }],
      missiles: [],
    }),
  },
  {
    id: 'gcds',
    name: 'GCDS',
    blurb: 'The final stat wall.',
    groups: solo('gcds', 1, {
      initiative: 0,
      hp: 7,
      computer: 2,
      shield: 2,
      cannons: [{ diceCount: 4, damage: 2 }],
      missiles: [{ diceCount: 2, damage: 1 }],
    }),
  },
];

export const BOSS_INDEX = GAUNTLET.length - 1;

// --- Map-oriented lookups (iteration 3) ----------------------------------
// GAUNTLET's order/indices are load-bearing for the resolver/forecast test
// suites (they reference GAUNTLET[0], GAUNTLET[2], etc. by index) and are
// left untouched. These pools reference the same objects for the map's
// depth-based enemy selection.

const byId = (id: string): EnemyDef => {
  const found = GAUNTLET.find((e) => e.id === id);
  if (!found) throw new Error(`Unknown enemy id: ${id}`);
  return found;
};

export const EASY_POOL: EnemyDef[] = [byId('scout-pack'), byId('missile-frigate'), byId('missile-swarm')];
export const MID_POOL: EnemyDef[] = [byId('shield-cruiser'), byId('interceptor-swarm'), byId('sniper')];
export const HARD_POOL: EnemyDef[] = [byId('plasma-tank'), byId('ancient-guardian')];
export const BOSS: EnemyDef = byId('gcds');

// --- Act-2 roster (iteration 8) ---------------------------------------------
// Built largely on iteration 5/7 weapon tech: the first enemy-side flak
// (Flak fortress — resolver support in combatEngine.ts), the first enemy
// lance (Lance frigate, shield-pierce), and a rift cannon (Rift cult,
// self-damage on a natural 1) mirroring the player's own exotic kit.

const RAIDER_WING: EnemyDef = {
  id: 'raider-wing',
  name: 'Raider wing',
  blurb: 'The act-2 baseline damage check.',
  groups: solo('raider', 3, { initiative: 3, hp: 2, computer: 1, shield: 0, cannons: [{ diceCount: 2, damage: 2 }], missiles: [] }),
};

const TORPEDO_BOATS: EnemyDef = {
  id: 'torpedo-boats',
  name: 'Torpedo boats',
  blurb: 'Kill before launch, or armor through it.',
  groups: solo('boat', 2, {
    initiative: 2,
    hp: 2,
    computer: 1,
    shield: 0,
    cannons: [{ diceCount: 1, damage: 2 }],
    missiles: [{ diceCount: 1, damage: 3 }],
  }),
};

const LANCE_FRIGATE: EnemyDef = {
  id: 'lance-frigate',
  name: 'Lance frigate',
  blurb: "Your shields don't work here.",
  groups: solo('frigate', 1, {
    initiative: 1,
    hp: 5,
    computer: 1,
    shield: 2,
    cannons: [{ diceCount: 2, damage: 2, shieldPierce: 2 }],
    missiles: [],
  }),
};

const RIFT_CULT: EnemyDef = {
  id: 'rift-cult',
  name: 'Rift cult',
  blurb: 'Swingy — punish their bad rounds.',
  groups: solo('cultist', 2, {
    initiative: 2,
    hp: 3,
    computer: 1,
    shield: 0,
    cannons: [{ diceCount: 2, damage: 3, selfDamageOnNatOne: 1 }],
    missiles: [],
  }),
};

const FLAK_FORTRESS: EnemyDef = {
  id: 'flak-fortress',
  name: 'Flak fortress',
  blurb: 'Missile alphas bounce; bring cannons.',
  groups: solo('fortress', 1, { initiative: 0, hp: 8, computer: 1, shield: 2, cannons: [{ diceCount: 2, damage: 2 }], missiles: [], flak: 2 }),
};

const ANTIMATTER_BATTERY: EnemyDef = {
  id: 'antimatter-battery',
  name: 'Antimatter battery',
  blurb: "Reactive armor's showcase.",
  groups: solo('battery', 1, { initiative: 1, hp: 6, computer: 2, shield: 1, cannons: [{ diceCount: 1, damage: 4 }], missiles: [] }),
};

const GUARDIAN_PAIR: EnemyDef = {
  id: 'guardian-pair',
  name: 'Guardian pair',
  blurb: 'The old endgame, doubled.',
  groups: solo('guardian', 2, { initiative: 2, hp: 4, computer: 2, shield: 2, cannons: [{ diceCount: 2, damage: 2 }], missiles: [] }),
};

const WARDEN: EnemyDef = {
  id: 'warden',
  name: 'Warden',
  blurb: 'The pre-boss wall.',
  groups: solo('warden', 1, {
    initiative: 2,
    hp: 10,
    computer: 3,
    shield: 3,
    cannons: [
      { diceCount: 2, damage: 2 },
      { diceCount: 1, damage: 4 },
    ],
    missiles: [],
  }),
};

const SWARM_ARMADA: EnemyDef = {
  id: 'swarm-armada',
  name: 'Swarm armada',
  blurb: 'Arc projectors earn their keep.',
  groups: solo('drone', 5, {
    initiative: 3,
    hp: 2,
    computer: 0,
    shield: 0,
    cannons: [{ diceCount: 1, damage: 2 }],
    missiles: [{ diceCount: 1, damage: 1 }],
  }),
};

export const EASY_POOL_ACT2: EnemyDef[] = [RAIDER_WING, TORPEDO_BOATS, LANCE_FRIGATE];
export const MID_POOL_ACT2: EnemyDef[] = [RIFT_CULT, FLAK_FORTRESS, ANTIMATTER_BATTERY];
export const HARD_POOL_ACT2: EnemyDef[] = [GUARDIAN_PAIR, WARDEN, SWARM_ARMADA];

// --- Mixed formations (iteration 9) -----------------------------------------
// EnemyDef generalizes to a composition of sub-groups so a fight can pair a
// real threat with a screen that exploits greedy targeting — the doctrine
// stance (9.4) is the player's counter-tool. Elite/veterancy bonuses apply
// to every group (see eliteVariant/applyVeterancy below); each group
// activates at its own initiative via the existing activation machinery.

const ESCORTED_SNIPER: EnemyDef = {
  id: 'escorted-sniper',
  name: 'Escorted sniper',
  blurb: 'Greedy targeting shoots the screens while the sniper shoots you.',
  groups: [
    { label: 'sniper', count: 1, stats: { initiative: 2, hp: 2, computer: 3, shield: 0, cannons: [{ diceCount: 1, damage: 2 }], missiles: [] } },
    { label: 'screen', count: 2, stats: { initiative: 1, hp: 1, computer: 0, shield: 0, cannons: [{ diceCount: 1, damage: 1 }], missiles: [] } },
  ],
};

const CARRIER_GROUP: EnemyDef = {
  id: 'carrier-group',
  name: 'Carrier group',
  blurb: 'Kill the tender before its alpha, through a drone screen.',
  groups: [
    { label: 'tender', count: 1, stats: { initiative: 0, hp: 6, computer: 1, shield: 0, cannons: [], missiles: [{ diceCount: 2, damage: 1 }] } },
    { label: 'drone', count: 3, stats: { initiative: 3, hp: 1, computer: 0, shield: 0, cannons: [{ diceCount: 1, damage: 2 }], missiles: [] } },
  ],
};

const COMMAND_WING: EnemyDef = {
  id: 'command-wing',
  name: 'Command wing',
  blurb: 'The commander hides behind lancers that pierce your shields.',
  groups: [
    {
      label: 'commander',
      count: 1,
      stats: { initiative: 3, hp: 5, computer: 2, shield: 2, cannons: [{ diceCount: 2, damage: 2 }], missiles: [] },
    },
    {
      label: 'lancer',
      count: 2,
      stats: { initiative: 2, hp: 3, computer: 0, shield: 0, cannons: [{ diceCount: 1, damage: 2, shieldPierce: 2 }], missiles: [] },
    },
  ],
};

HARD_POOL.push(ESCORTED_SNIPER); // act-1 hard
MID_POOL_ACT2.push(CARRIER_GROUP); // act-2 mid
HARD_POOL_ACT2.push(COMMAND_WING); // act-2 hard

// An elite variant of an enemy: extra HP per ship in every group (default
// +2), same everything else.
export function eliteVariant(enemy: EnemyDef, hpBonus = 2): EnemyDef {
  return {
    ...enemy,
    id: `${enemy.id}-elite`,
    name: `${enemy.name} (elite)`,
    groups: enemy.groups.map((g) => ({ ...g, stats: { ...g.stats, hp: g.stats.hp + hpBonus } })),
  };
}

// Total HP across every ship in every group — the "how hard is this
// composition, overall" comparator used to find the hardest entry of a pool
// (a single group's HP alone would misjudge multi-group formations).
function totalHp(enemy: EnemyDef): number {
  return enemy.groups.reduce((sum, g) => sum + g.stats.hp * g.count, 0);
}

// Depth band within a single act's 10-column trellis, re-banded for
// iteration 8's longer acts: easy 0-3, mid 4-6, hard 7-9 (act 1's column 0
// is the opener and never queries this).
function poolBand(col: number): 'easy' | 'mid' | 'hard' {
  if (col <= 3) return 'easy';
  if (col <= 6) return 'mid';
  return 'hard';
}

function hardestInPool(pool: EnemyDef[]): EnemyDef {
  return pool.reduce((best, e) => (totalHp(e) > totalHp(best) ? e : best), pool[0]);
}

// Enemy pool for a combat node at the given act + column.
export function combatEnemyPool(act: 1 | 2, col: number): EnemyDef[] {
  const band = poolBand(col);
  if (act === 1) {
    return band === 'easy' ? EASY_POOL : band === 'mid' ? MID_POOL : HARD_POOL;
  }
  return band === 'easy' ? EASY_POOL_ACT2 : band === 'mid' ? MID_POOL_ACT2 : HARD_POOL_ACT2;
}

// The elite enemy for an elite node at the given act + column. Act 1 keeps
// its fixed per-column assignment in PLAN.md (col 3 -> sniper+, col 5 ->
// plasma tank+ or ancient guardian+ 50/50, else -> ancient guardian+); act 2
// has no hand-tuned exceptions yet, so it's simply the hardest entry of the
// column's pool, elite-strength — "existing eliteVariant(+2 HP) on the
// hardest entry of the column's pool, as today."
//
// Column 3's sniper uses a +1 HP bonus instead of the standard +2: sniper's
// own kit (high computer, 2 damage/hit) is already efficient, and the extra
// HP compounded into a much harsher difficulty spike than the other two
// elites at their columns (a fresh fleet's win rate fell from 37% vs. the
// plain sniper to 6% vs. the +2 elite — nerfed to a fairer ~14% at +1).
export function eliteEnemyForColumn(act: 1 | 2, col: number, rng: () => number): EnemyDef {
  if (act === 1) {
    if (col === 3) return eliteVariant(byId('sniper'), 1);
    if (col === 5) return eliteVariant(rng() < 0.5 ? byId('plasma-tank') : byId('ancient-guardian'));
    return eliteVariant(byId('ancient-guardian'));
  }
  return eliteVariant(hardestInPool(combatEnemyPool(2, col)));
}

// The named elite variant placed at a bounty quest's target combat node
// (iteration 6): the hardest enemy in that column's normal pool, at elite
// (+2 HP) strength — "the Pirate Captain."
export function bountyEnemyForColumn(act: 1 | 2, col: number): EnemyDef {
  const hardest = hardestInPool(combatEnemyPool(act, col));
  const elite = eliteVariant(hardest);
  return { ...elite, id: `${hardest.id}-bounty`, name: `The Pirate Captain (${hardest.name})` };
}

// The enemy an `ancient-cache` ambush attracts, scaled to the current
// column's depth band — exactly as hard as a normal fight there, never a
// spike the player had no way to prepare for. Act 1 keeps its hand-picked
// representative per band (re-banded to match `poolBand`'s iteration-8
// shift); act 2 uses the hardest entry of the band's pool.
export function hardestEnemyForAmbush(act: 1 | 2, col: number): EnemyDef {
  if (act === 1) {
    const band = poolBand(col);
    if (band === 'easy') return byId('missile-frigate');
    if (band === 'mid') return byId('sniper');
    return byId('ancient-guardian');
  }
  return hardestInPool(combatEnemyPool(2, col));
}

// Iteration 15.2: the fight that replaces a shop/repair/event node's content
// when heat is armed (4, "Hunted") — same difficulty as `hardestEnemyForAmbush`
// at this spot, reflavored as the pursuit finally catching up. The id suffix
// is deliberately not '-elite' (no elite reward pipeline here) and not
// '-bounty' (no bounty bonus) — just a normal winReward(col) fight wearing a
// different face.
export function hunterKillerForAmbush(act: 1 | 2, col: number): EnemyDef {
  const base = hardestEnemyForAmbush(act, col);
  return {
    ...base,
    id: `${base.id}-hunter`,
    name: `Hunter-killer squad (${base.name})`,
    blurb: 'They tracked your heat signature across the sector and finally ran you down.',
  };
}

// --- Veterancy (iteration 8) -------------------------------------------------
// A per-column HP modifier applied at PICK_NODE, on top of any escalations —
// difficulty climbs every few columns instead of only in three pool-band
// steps. Never applied to the opener or bosses (bosses are hand-tuned).
export function veterancyBonus(col: number): number {
  if (col <= 3) return 0;
  if (col <= 6) return 1;
  return 2; // cols 7-9
}

export function applyVeterancy(enemy: EnemyDef, col: number): EnemyDef {
  const bonus = veterancyBonus(col);
  if (bonus === 0) return enemy;
  return {
    ...enemy,
    groups: enemy.groups.map((g) => ({ ...g, stats: { ...g.stats, hp: g.stats.hp + bonus } })),
    veterancyBonus: bonus,
  };
}

// Folds a run's scheduled escalations into an enemy instance, for whichever
// escalations have already "landed" by this column (col > landsAfterColumn).
// Escalations apply regardless of whether the player has been told about
// them via an intel event — being informed doesn't change the fight, it
// changes what you can do about it beforehand. Applies to every group
// (iteration 9) — a formation's screen gets exactly as hardened as its
// centerpiece.
// A boss's own hull is always group 0 (see the boss/final-boss definitions);
// later groups are its escorts. Ids here are the hand-tuned boss trios,
// which are never elite- or bounty-suffixed.
function isBossCenterpiece(enemyId: string, groupIndex: number): boolean {
  if (groupIndex !== 0) return false;
  return (BOSS_IDS as readonly string[]).includes(enemyId) || (FINAL_BOSS_IDS as readonly string[]).includes(enemyId);
}

export function applyEscalations(enemy: EnemyDef, col: number, escalations: ScheduledEscalation[]): EnemyDef {
  const active = escalations.filter((e) => col > e.landsAfterColumn);
  if (active.length === 0) return enemy;

  const appliedIds: EscalationId[] = [];
  const groups = enemy.groups.map((g) => ({ ...g, stats: { ...g.stats }, count: g.count }));

  for (const esc of active) {
    // Only badge an escalation that actually changed this enemy — advertising
    // one that did nothing promises a fight the player never gets.
    let changed = false;
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      switch (esc.id) {
        case 'hardened':
          g.stats.hp += 1;
          changed = true;
          break;
        case 'deflectors':
          g.stats.shield += 1;
          changed = true;
          break;
        case 'firecontrol':
          g.stats.computer += 1;
          changed = true;
          break;
        case 'overdrive':
          g.stats.initiative += 1;
          changed = true;
          break;
        case 'squadrons': {
          // Reinforced squadrons always leaves a real squadron behind: a
          // lone ship gains a wingman rather than being skipped, so the
          // badge never appears over a single hull. The one exception is a
          // boss's centerpiece (always group 0) — two Titans is a different
          // fight, not an escalated one; its escorts still reinforce.
          if (isBossCenterpiece(enemy.id, i)) break;
          const reinforced = Math.max(2, g.count + 1);
          if (reinforced !== g.count) {
            g.count = reinforced;
            changed = true;
          }
          break;
        }
        default:
          break;
      }
    }
    if (changed) appliedIds.push(esc.id);
  }

  return {
    ...enemy,
    groups,
    appliedEscalations: appliedIds.length > 0 ? appliedIds : undefined,
  };
}

// --- Boss variety (iteration 5) -------------------------------------------
// Three bosses with strongly divergent counters, chosen once per run,
// seeded at map generation (see map.ts). Kept separate from GAUNTLET so
// GAUNTLET's indices — load-bearing for the resolver/forecast test suites —
// never shift.

export type BossId = 'gcds' | 'hive' | 'dread';

export const BOSS_IDS: BossId[] = ['gcds', 'hive', 'dread'];

const HIVE_MOTHER: EnemyDef = {
  id: 'hive',
  name: 'Hive Mother',
  blurb: 'Demands initiative, flak or point-defense, and a taunt-decoy — many small dice.',
  groups: solo('hive', 4, {
    initiative: 3,
    hp: 2,
    computer: 1,
    shield: 0,
    cannons: [{ diceCount: 1, damage: 1 }],
    missiles: [{ diceCount: 2, damage: 1 }],
  }),
};

const DREADNOUGHT: EnemyDef = {
  id: 'dread',
  name: 'Dreadnought',
  blurb: 'Demands computer 5+ (or optics), and answers big dice with reactive armor.',
  groups: solo('dreadnought', 1, {
    initiative: 1,
    hp: 9,
    computer: 3,
    shield: 4,
    cannons: [
      { diceCount: 2, damage: 2 },
      { diceCount: 1, damage: 4 },
    ],
    missiles: [],
  }),
};

export const BOSSES: Record<BossId, EnemyDef> = {
  gcds: byId('gcds'),
  hive: HIVE_MOTHER,
  dread: DREADNOUGHT,
};

export function getBoss(id: BossId): EnemyDef {
  return BOSSES[id];
}

// --- Final boss trio (iteration 8) -----------------------------------------
// The act-1 boss trio above stays the mid-boss; these three end act 2,
// picked seeded (same seed → same final boss) alongside the act-1 pick.

export type FinalBossId = 'titan' | 'empress' | 'citadel';

export const FINAL_BOSS_IDS: FinalBossId[] = ['titan', 'empress', 'citadel'];

// A final boss's centerpiece is always group 0 — the silhouette heuristic
// in ShipSilhouette.tsx relies on that ordering to tell a flagship from
// its escorts.
const TITAN: EnemyDef = {
  id: 'titan',
  name: 'Titan',
  blurb: 'Demands maximum sustained damage and real defense — no shortcuts, and it does not come alone.',
  groups: [
    {
      label: 'titan',
      count: 1,
      stats: {
        initiative: 1,
        hp: 16,
        computer: 3,
        shield: 3,
        cannons: [
          { diceCount: 4, damage: 2 },
          { diceCount: 2, damage: 4 },
        ],
        missiles: [],
      },
    },
    {
      label: 'honor guard',
      count: 2,
      stats: {
        initiative: 2,
        hp: 4,
        computer: 2,
        shield: 1,
        cannons: [{ diceCount: 1, damage: 2 }],
        missiles: [],
      },
    },
  ],
};

const HIVE_EMPRESS: EnemyDef = {
  id: 'empress',
  name: 'Hive Empress',
  blurb: 'Demands flak walls, arc projectors, and initiative — many small dice, doubled.',
  groups: solo('empress', 6, {
    initiative: 4,
    hp: 2,
    computer: 1,
    shield: 0,
    cannons: [{ diceCount: 1, damage: 2 }],
    missiles: [{ diceCount: 2, damage: 1 }],
  }),
};

const VOID_CITADEL: EnemyDef = {
  id: 'citadel',
  name: 'Void Citadel',
  blurb:
    'Demands lances, optics, or computer 6 — shield 5 is a statement — and cannons, not missiles. Its pickets you can actually hit.',
  groups: [
    {
      label: 'citadel',
      count: 1,
      stats: {
        initiative: 0,
        hp: 20,
        computer: 2,
        shield: 5,
        cannons: [
          { diceCount: 2, damage: 4 },
          { diceCount: 2, damage: 2 },
        ],
        missiles: [],
        flak: 3,
      },
    },
    {
      // Deliberately low-shield: something the player's dice can kill
      // without the pierce tech the citadel itself demands.
      label: 'picket',
      count: 2,
      stats: {
        initiative: 2,
        hp: 4,
        computer: 2,
        shield: 1,
        cannons: [{ diceCount: 1, damage: 2 }],
        missiles: [],
      },
    },
  ],
};

export const FINAL_BOSSES: Record<FinalBossId, EnemyDef> = {
  titan: TITAN,
  empress: HIVE_EMPRESS,
  citadel: VOID_CITADEL,
};

export function getFinalBoss(id: FinalBossId): EnemyDef {
  return FINAL_BOSSES[id];
}

// --- The opener (iteration 8, act-1 column 0) ------------------------------
// Missile-only, by design: the fight's total possible damage is hard-capped
// at count * diceCount * damage = 2, less than any possible starting
// Flagship HP (frame base 3, even with zero hull parts) — a mathematical
// invariant, not a tuning hope. Pin the "no cannons" fact in a test so a
// future edit can't silently break it.
export const OPENER: EnemyDef = {
  id: 'pickets',
  name: 'Picket drones',
  blurb: 'Automated pickets — a warm-up.',
  groups: solo('picket', 2, {
    initiative: 0,
    hp: 1,
    computer: 0,
    shield: 0,
    cannons: [],
    missiles: [{ diceCount: 1, damage: 1 }],
  }),
};
