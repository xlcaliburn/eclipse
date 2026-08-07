import type { CounterProtocolId } from './counterProtocols';
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
    // Re-tuned 2026-08-04 (iteration 22.3): shield 2 / computer 0 was a
    // hit-math cliff, not a stat wall — the hit rule is
    // `raw + computer - shield >= 6` with natural 6s always hitting, so for
    // any fleet with computer <= 1 (i.e. every fleet actually meeting this
    // enemy at columns 5-7, per the col3-typical/mid-fleet reference
    // builds), shield 2 and shield 1 are mathematically identical: only a
    // natural 6 hits either way. Confirmed by simulation: nerfing shield
    // alone to 1 produced a byte-identical clear-rate sim result. Shield
    // 2->1 plus computer 0->1 actually changes the math for those fleets
    // (comp 1 now lets a 5 also hit): col3-typical fleet's win rate moved
    // 44% -> see scripts/balance.ts's table. See plans/iteration-22.md 22.0
    // for the full diagnosis.
    blurb: 'Computers beat piloting.',
    groups: solo('cruiser', 1, {
      initiative: 1,
      hp: 3,
      computer: 1,
      shield: 0,
      cannons: [{ diceCount: 2, damage: 2 }],
      missiles: [],
    }),
  },
  {
    id: 'interceptor-swarm',
    name: 'Interceptor swarm',
    blurb: 'Many dice beat many small ships.',
    groups: solo('interceptor', 3, {
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
    blurb: 'Piloting blunts high computers.',
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
    // Nerfed 2026-08-02: was computer 2 / shield 2 solo, which made it a
    // stat wall with nothing to focus fire onto. Softened to 1/1 and given
    // a pair of missile frigates (the exact roster enemy's own stats) as
    // escorts, so a screen exists to punch through instead.
    blurb: 'Its defenses are lighter than they look — the two frigates screening it are the real threat.',
    groups: [
      {
        label: 'guardian',
        count: 1,
        stats: {
          initiative: 2,
          hp: 4,
          computer: 1,
          shield: 1,
          cannons: [{ diceCount: 3, damage: 1 }],
          missiles: [],
        },
      },
      {
        // Same stats as the standalone Missile frigate enemy (id
        // 'missile-frigate') — an escort should be recognizably that ship,
        // not a bespoke reskin.
        label: 'frigate',
        count: 2,
        stats: {
          initiative: 1,
          hp: 2,
          computer: 1,
          shield: 0,
          cannons: [{ diceCount: 1, damage: 1 }],
          missiles: [{ diceCount: 2, damage: 1 }],
        },
      },
    ],
  },
  {
    id: 'gcds',
    name: 'GCDS',
    // Nerfed 2026-08-03, re-buffed 2026-08-04 (iteration 22.3), re-tuned
    // 2026-08-05 (iteration 26). The 22.3 pass only ever checked this boss
    // against "strong fleet" (balance.ts's near-maximum, ~67cr reference)
    // — its own comment says outright that 3 cannon dice "made every
    // below-'strong' fleet's win rate 0% pre-nerf" and kept that die cut
    // anyway, since the only gate that existed was strong-fleet-shaped.
    // Player feedback ("two cruisers with multiple weapons plus the
    // Warlord flagship — the boss two-shots me every run") is exactly that
    // gap: a solid-but-not-maxed fleet was never actually measured. Adding
    // balance.ts's "col10 solid fleet" (~31cr, one weaker step down from
    // "strong") found it at a flat 0% against this boss too, same as every
    // other non-strong reference — the whole middle of the difficulty
    // curve had a wall in it, not a slope.
    //
    // Fix, empirically tuned via repeated `npx tsx scripts/balance.ts` runs
    // (each stat changed in isolation to separate its effect — the
    // raw+computer-shield>=6 hit threshold is discrete, so shield/computer
    // swing "solid" and "strong" fleets very differently and a combined
    // change can't be read after the fact):
    //   - cannon dice 3->2: cuts the solo-target burst that was deleting a
    //     low-HP escort in one activation before the player got a real
    //     round of return fire.
    //   - shield 2->1: col10-solid fleet's average computer (~0-2) could
    //     barely scratch shield 2 at all (only natural-6 auto-hits); this
    //     is the one stat that actually opened up a hit rate for them.
    //   - computer 2->1: GCDS's own accuracy was the dominant lever for
    //     col10-solid's escorts (0 shield) — raising it even by 1 point
    //     re-created the two-shot burst; lowering it by 1 nearly doubled
    //     their win rate (12% -> 52% at otherwise-equal stats) for almost
    //     no change to strong fleet (97% -> 100%).
    // HP was tried at 7/10/14 in isolation: it barely moves strong fleet's
    // win rate at all (it wins each fight too fast/cleanly for fight-length
    // to matter) while dragging col10-solid's DOWN (more rounds for GCDS's
    // concentrated fire to chip through a small HP pool) — left at 10.
    // Verified final result (`npx tsx scripts/balance.ts`): col10 solid
    // fleet 0% -> 52%, strong fleet 55% -> 100%. Strong fleet's 100% is a
    // deliberate acceptance, not a miss: it represents a near-maximally
    // optimized end-of-act-1 build, and every lever that pulls its win rate
    // down (raising GCDS's shield or computer) pulls col10-solid's down by
    // a much larger amount — the two fleets aren't separable with this
    // boss's stats alone. The player complaint was specifically about a
    // solid-but-not-maxed build losing, not about a maxed build winning too
    // easily, so col10-solid fleet is the fixture this boss is tuned
    // against; see scripts/balance.ts's updated sanity-check gate.
    blurb: 'The final stat wall.',
    groups: solo('gcds', 1, {
      initiative: 0,
      hp: 10,
      computer: 1,
      shield: 1,
      cannons: [{ diceCount: 2, damage: 2 }],
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
// The plain 'sniper' GAUNTLET entry stays solo — it's also the base for the
// col-3 elite (eliteEnemyForColumn), which is deliberately tuned around a
// single ship (see that function's comment). The mid-pool encounter gets
// its own two-ship variant instead of reusing that entry directly, so
// buffing this doesn't also double the early col-3 elite's firepower — see
// SNIPER_PAIR, pushed in below.
export const MID_POOL: EnemyDef[] = [byId('shield-cruiser'), byId('interceptor-swarm')];
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
  blurb: "Your piloting doesn't work here.",
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

// Re-tuned 2026-08-04: the mid-pool's plain sniper (a lone computer-3 ship)
// measured too weak by column 7 — a second sniper doubles both the threat
// and the HP pool without changing the fight's shape (still "bring
// computer or eat hits"). Same per-ship stats as GAUNTLET's solo 'sniper',
// duplicated rather than shared so that entry (the col-3 elite's base) stays
// untouched.
const SNIPER_PAIR: EnemyDef = {
  id: 'sniper-pair',
  name: 'Sniper pair',
  blurb: 'Piloting blunts high computers — twice over.',
  groups: solo('sniper', 2, {
    initiative: 2,
    hp: 2,
    computer: 3,
    shield: 0,
    cannons: [{ diceCount: 1, damage: 2 }],
    missiles: [],
  }),
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
  blurb: 'The commander hides behind lancers that pierce your piloting.',
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
MID_POOL.push(SNIPER_PAIR); // act-1 mid
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

// Depth band within a single act's 10-column trellis (act 1's column 0 is
// the opener and never queries this).
//
// Iteration 22: shifted one column later (was easy 0-3, mid 4-6, hard 7-9)
// after simulation found column 4 was a *triple* cliff — this band,
// veterancyBonus below, and the first escalation (escalations.ts
// drawEscalationSchedule) all stepped up at the same column, independently
// authored, none aware of the other two. All three now move together; see
// plans/iteration-22.md 22.0 for the diagnosis and 22.1 for why they're
// pinned to the same column rather than staggered.
function poolBand(col: number): 'easy' | 'mid' | 'hard' {
  if (col <= 4) return 'easy';
  if (col <= 7) return 'mid';
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
    // Rebalanced 2026-08-03: every other column used to return an elite
    // Ancient guardian outright — the hardest enemy in the act, at column 1
    // as readily as column 9. Run simulation put ~40% of all act-1 deaths on
    // elite nodes, because no fleet a player can field mid-act beats it (0-1%
    // win for every reference fleet below "strong"). Elites now scale with
    // their column's pool, which is the rule act 2 has always used; Ancient
    // guardian still shows up as the elite once the hard band starts, where
    // it belongs.
    if (col === 5) return eliteVariant(rng() < 0.5 ? byId('plasma-tank') : hardestInPool(combatEnemyPool(1, col)));
    return eliteVariant(hardestInPool(combatEnemyPool(1, col)));
  }
  return eliteVariant(hardestInPool(combatEnemyPool(2, col)));
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
// is deliberately not '-elite' (no elite reward pipeline here) — just a
// normal winReward(col) fight wearing a different face.
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
//
// Iteration 22: shifted to stay aligned with poolBand above (see its
// comment) — both step at columns 5 and 8 now, alongside the first two
// escalations (escalations.ts drawEscalationSchedule).
export function veterancyBonus(col: number): number {
  if (col <= 4) return 0;
  if (col <= 7) return 1;
  return 2; // cols 8-9
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
// Group 0 is always the centerpiece: a boss's own hull, or the real threat a
// mixed formation screens for. Later groups are its escorts. Squadrons must
// never clone a centerpiece — see the call site for why.
//
// Two ways to qualify, and both are needed:
//   - a boss, even a solo one. GCDS and the Dreadnought have no escorts, so
//     a "multi-group only" test would let squadrons mint a second boss.
//   - group 0 of any multi-group formation. This half was added 2026-08-03:
//     the boss-only rule let squadrons double Ancient guardian's lone
//     guardian, taking the act-1 column-9 elite from 94cr / 29% win to
//     160cr / 0% against a full-budget fleet. See scripts/enemyValue.ts.
//
// Ids here are the hand-tuned boss trios, which are never elite-suffixed.
function isFormationCenterpiece(enemy: EnemyDef, groupIndex: number): boolean {
  if (groupIndex !== 0) return false;
  const isBoss =
    (BOSS_IDS as readonly string[]).includes(enemy.id) ||
    (FINAL_BOSS_IDS as readonly string[]).includes(enemy.id);
  return isBoss || enemy.groups.length > 1;
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
          // badge never appears over a single hull.
          //
          // The exception is a formation's centerpiece (always group 0).
          // The floor above *doubles* a count-1 group, and a centerpiece is
          // the most expensive ship in the fight by design — cloning it adds
          // far more than "one more ship" is worth, which is how the act-1
          // guardian elite became mathematically unwinnable. Its screen
          // still reinforces, so the escalation keeps its teeth (and its
          // badge) without minting a second boss.
          if (isFormationCenterpiece(enemy, i)) break;
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

// --- Counter-protocols (iteration 30) --------------------------------------
// Act 2's answer to the act-1 boss's protocol draft — built the same way as
// applyEscalations above (clone groups, mutate stats, badge what changed),
// applied to every group including a formation's centerpiece EXCEPT for
// 'attack-wings' (reuses applyEscalations' squadrons/centerpiece-guard logic
// so a solo boss is never doubled — see isFormationCenterpiece above). Pure
// stat data on fields the combat engine already honors on the enemy side —
// no combatEngine.ts changes, per the design's scope discipline.
export function applyCounterProtocol(enemy: EnemyDef, counterId: CounterProtocolId): EnemyDef {
  const groups = enemy.groups.map((g) => ({
    ...g,
    stats: { ...g.stats, cannons: g.stats.cannons.map((c) => ({ ...c })) },
    count: g.count,
  }));

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    switch (counterId) {
      case 'hardened-veterans':
        g.stats.hp += 1;
        break;
      case 'targeting-arrays':
        g.stats.computer += 1;
        break;
      case 'evasive-doctrine':
        g.stats.shield += 1;
        break;
      case 'flak-screens':
        g.stats.flak = (g.stats.flak ?? 0) + 1;
        break;
      case 'piercing-munitions':
        // Per-cannon (not the ship-level shieldPierce field, which would
        // also pierce missiles) — matches the counter's own "every enemy
        // cannon" wording.
        g.stats.cannons = g.stats.cannons.map((c) => ({ ...c, shieldPierce: (c.shieldPierce ?? 0) + 1 }));
        break;
      case 'overdrive-signals':
        g.stats.initiative += 2;
        break;
      case 'ablative-plating':
        g.stats.reactiveArmor = (g.stats.reactiveArmor ?? 0) + 1;
        break;
      case 'overcharged-munitions':
        g.stats.cannons = g.stats.cannons.map((c) => ({ ...c, damage: c.damage + 1 }));
        break;
      case 'attack-wings':
        if (isFormationCenterpiece(enemy, i)) break;
        g.count = Math.max(2, g.count + 1);
        break;
    }
  }

  return { ...enemy, groups, appliedCounter: counterId };
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
  // Measured, not re-tuned, 2026-08-04 (iteration 22.6): added to
  // balance.ts's matchup table for the first time (see that file's
  // comment) and found at 100% for the strong-fleet reference — a
  // pre-existing gap, not something this iteration's other changes
  // caused. Three different nerfs were tried (HP 2->3, cannon dice 1->2,
  // shield 0->1) and every one of them left the strong-fleet ceiling at
  // 100% while measurably hurting every *weaker* reference fleet (col3-
  // typical fell as low as 3% along the way) — a 3-ship fleet with 4+
  // cannon dice total one-shots a 1-2-HP target regardless of shield or
  // incremental HP, so those levers can't move the ceiling without first
  // making the weaker-fleet floor worse. Reverted to original stats
  // rather than ship a net-negative change; the strong-fleet-vs-Hive-
  // Mother gap is now visible in the table (it wasn't before) and is
  // flagged in plans/iteration-22.md's status notes as unresolved.
  //
  // Checked again 2026-08-05 (iteration 26) against the same "two-shots
  // me" player feedback that drove GCDS/Dreadnought's re-tune: col10 solid
  // fleet scores 81% here, comfortably healthy (that pass's target was
  // ~25-55%, and 81% is well clear on the easy side, not the hard side).
  // Left untouched — this boss was never the one the complaint was about,
  // and nerfing it further would only push the pre-existing strong-fleet-
  // ceiling problem noted above in the wrong direction.
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
  // Re-tuned 2026-08-04 (iteration 22.6): shield 4 was never checked
  // against the other two act-1 mid-bosses' difficulty — only GCDS had a
  // balance.ts sanity check, so Dreadnought (drawn with equal 1-in-3
  // probability at every run's boss fight) went untested at 6% for the
  // strong-fleet reference, three times harder to beat than the same
  // fleet's 55% vs GCDS. Shield 4 -> 2 brings it in line with GCDS's
  // shield 2 — "demands computer 5+" was a design idea this fleet's
  // credits could never actually reach.
  //
  // Re-tuned again 2026-08-05 (iteration 26), same pass and same root
  // cause as GCDS (see that boss's comment for the full methodology):
  // balance.ts's "col10 solid fleet" (~31cr, a solid-but-not-maxed build)
  // was still at a flat 0% here even after the 22.6 shield cut, same wall
  // as GCDS pre-fix. Applied the same three levers, isolated one at a time
  // via `npx tsx scripts/balance.ts`: shield 2->1 alone barely moved
  // col10-solid (stayed 0%, strong fleet 29%->66%) — computer 3 was still
  // one-shotting the 0-shield escort regardless of shield; computer 3->1
  // got col10-solid to 20% (strong 97%); cutting the cannons from 3 dice
  // (2d2+1d4) to 2 (1d2+1d3) — same total-dice reduction logic as GCDS's
  // 3->2 cut — got col10-solid to a healthy 50% (strong fleet 100%, same
  // deliberate acceptance as GCDS: a maxed fleet reliably beating a mid-
  // boss isn't the problem the player reported).
  // Final verified result: col10 solid fleet 0% -> 50%, strong fleet
  // 29% -> 100%.
  blurb: 'Answers big dice with reactive armor.',
  groups: solo('dreadnought', 1, {
    initiative: 1,
    hp: 9,
    computer: 1,
    shield: 1,
    cannons: [
      { diceCount: 1, damage: 2 },
      { diceCount: 1, damage: 3 },
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
//
// 2026-08-07 (iteration 31-M3): re-tuned against the "act-2 endgame fleet"
// fixture (scripts/balance.ts) — the first time the trio was measured
// against anything post-protocols/post-fusions. Baseline (pre-retune,
// hardened-veterans silver counter + twin-linked mounts, 5000 sims):
// endgame fleet 0%, even the pre-fusion "strong fleet" with no counter at
// all 0%. The `computer` stat turned out to be the dominant lever by far —
// each point is worth roughly 2x hit-chance against a shield this high
// (roll + computer − shield >= 6 is a hard threshold, not a smooth curve),
// so `shield` needed to come down before `computer`/`hp` tuning could
// move the needle at all. hp 16->12, shield 3->0, computer 3->1 (main);
// honor guard computer 2->1 (hp/shield/cannons untouched). Measured
// after: endgame fleet 54% (in the 25-55% target band), pre-fusion strong
// fleet (no counter) 15% — a real fight, not a wall, for a merely-solid
// finish.
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
        hp: 12,
        computer: 1,
        shield: 0,
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
        computer: 1,
        shield: 1,
        cannons: [{ diceCount: 1, damage: 2 }],
        missiles: [],
      },
    },
  ],
};

// 2026-08-07 (iteration 31-M3): the opposite problem from Titan/Citadel —
// baseline was already too EASY against the endgame fixture (74%, above
// the 25-55% band) despite never having been measured before. Action
// economy (ship count), not stats, is the lever per this boss's identity
// — mindful of iteration 22.3's low-HP-per-ship-formation lesson, hp/comp
// per ship are untouched; one more ship (6->7) is the entire change.
// Measured after: endgame fleet 44%, pre-fusion strong fleet 53% (both
// comfortably inside band/floor — this boss was never the hard case).
const HIVE_EMPRESS: EnemyDef = {
  id: 'empress',
  name: 'Hive Empress',
  blurb: 'Demands flak walls, arc projectors, and initiative — many small dice, doubled.',
  groups: solo('empress', 7, {
    initiative: 4,
    hp: 2,
    computer: 1,
    shield: 0,
    cannons: [{ diceCount: 1, damage: 2 }],
    missiles: [{ diceCount: 2, damage: 1 }],
  }),
};

// 2026-08-07 (iteration 31-M3): same failure mode as Titan and the same
// root cause — shield 5 put every attack roll below the hard hit
// threshold except a natural 6 (roll + computer − shield >= 6 is
// unreachable at shield 5 with any survivable computer stat), so the
// fight was unwinnable regardless of hp/damage tuning until shield came
// down. Kept strictly above the picket's shield 1 (dropping to 1 would
// have matched it exactly, erasing "its pickets you can actually hit" —
// the whole point of fielding a lower-shield screen at all; see
// enemies.test.ts's citadel screen test). flak is untouched in effect
// against this fixture (the endgame fleet carries no missiles — matches
// the boss's own blurb, "cannons, not missiles"), lowered anyway to keep
// it proportionate to the rest of the cut. Pickets fully unchanged — 2 of
// them, not 1, is what keeps the fight a real fight; a single-picket
// version tested far too easy, 78-86%. hp 20->12, shield 5->2, computer
// 2->1, flak 3->2. Measured after: endgame fleet 53%, pre-fusion strong
// fleet (no counter) 9% — the one boss of the trio that couldn't clear
// the other two's 10% floor without re-opening the shield-vs-picket
// tradeoff above; see scripts/balance.ts's floor-check comment.
const VOID_CITADEL: EnemyDef = {
  id: 'citadel',
  name: 'Void Citadel',
  blurb:
    'Demands lances, optics, or computer 6 — piloting 5 is a statement — and cannons, not missiles. Its pickets you can actually hit.',
  groups: [
    {
      label: 'citadel',
      count: 1,
      stats: {
        initiative: 0,
        hp: 12,
        computer: 1,
        shield: 2,
        cannons: [
          { diceCount: 2, damage: 4 },
          { diceCount: 2, damage: 2 },
        ],
        missiles: [],
        flak: 2,
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
