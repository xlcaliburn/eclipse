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
      // 2026-08-08: the one enemy class that keeps greedy lowest-HP
      // targeting once enemy fire went random by default — a sniper picking
      // targets at random would waste its whole reason to exist (high
      // computer, built to finish off whatever's already hurt).
      targetsLowestHp: true,
    }),
  },
  {
    id: 'missile-swarm',
    name: 'Missile swarm',
    blurb: 'Win initiative, kill before launch.',
    // 2026-08-08: gained a cannon each — an elite (or veteran-scaled) swarm
    // used to be all missile, one alpha-strike volley and then dead weight
    // for every round after (missiles fire once, in the opening volley
    // only). A plain ion-tier cannon each means a surviving swarm ship
    // keeps threatening every round instead of just soaking hits.
    groups: solo('swarm', 3, {
      initiative: 2,
      hp: 1,
      computer: 0,
      shield: 0,
      cannons: [{ diceCount: 1, damage: 1 }],
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
    //
    // Nerfed again 2026-08-07 (playtest report: "the guardian with 3
    // frigate fight is an elite fight with almost 30 points of HP, this is
    // definitely way too overpowered"). This formation stacks every HP
    // lever in the game at once by late act 1: eliteVariant (+2/ship),
    // veterancyBonus at col 8-9 (+2/ship), the 'hardened' escalation
    // (+1/ship, landed by col 2), and 'squadrons' reinforcing the escort
    // group (2 frigates -> 3, exactly the "3 frigate" the report
    // describes — group 0, the guardian itself, is exempt as the
    // formation's centerpiece). Worst case (elite + veteran + hardened +
    // squadrons, all real by late act 1) totalled exactly 30 HP across 4
    // ships before this pass:
    //   guardian:  4 + 2 + 2 + 1 = 9
    //   3 frigates: (2 + 2 + 2 + 1) x 3 = 21
    //   total: 30
    // Fix: guardian hp 4 -> 3, frigate hp 2 -> 1, frigate BASE count 2 -> 1
    // (squadrons still guarantees a real pair — "a lone ship gains a
    // wingman rather than being skipped" — so the worst case still reaches
    // 2 frigates, just never 3). Same worst-case stack now:
    //   guardian:  3 + 2 + 2 + 1 = 8
    //   2 frigates: (1 + 2 + 2 + 1) x 2 = 12
    //   total: 20 (-10, exactly the requested cut)
    blurb: 'Its defenses are lighter than they look — the frigate screening it is the real threat.',
    groups: [
      {
        label: 'guardian',
        count: 1,
        stats: {
          initiative: 2,
          hp: 3,
          computer: 1,
          shield: 1,
          cannons: [{ diceCount: 3, damage: 1 }],
          missiles: [],
        },
      },
      {
        // No longer "the exact roster enemy's own stats" as the standalone
        // Missile frigate (hp 2) — deliberately diverged 2026-08-07 (see
        // the nerf note above) since this formation's own stacking made it
        // untenable at its old numbers even though the standalone enemy is
        // fine. count 1 (not 2): 'squadrons' still reinforces to a pair
        // when it lands, this just removes the always-a-pair floor that
        // used to become a trio under 'squadrons'.
        label: 'frigate',
        count: 1,
        stats: {
          initiative: 1,
          hp: 1,
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

// --- Map-oriented lookups (iteration 3) ----------------------------------
// GAUNTLET's order/indices are load-bearing for the combat-engine/balance
// test suites (they reference GAUNTLET[0], GAUNTLET[2], etc. by index) and
// are left untouched. These pools reference the same objects for the map's
// depth-based enemy selection.

// Exported (47.7.1): scripts/balance.ts used to hand-roll a byte-identical
// private copy (`findEnemy`) purely to look up enemies by id for its own
// fixtures — one lookup, one place to get the "unknown id" error message
// right.
export const byId = (id: string): EnemyDef => {
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

// 2026-08-08 (iteration 46.3): shield 2 -> 1. The difficulty ledger found
// this arithmetically near-closed (0-13%) against a realistic act-2-hard
// budget fleet — the hit rule (roll + computer - shield >= 6) makes
// shield 2 nearly as hard to crack as GCDS's old shield 2 was for a
// comp<=1 fleet (see that boss's own comment for the same diagnosis and
// fix, iteration 22.3/26). Shield first, per that established method,
// before touching computer or dice.
//
// Second pass, same day: shield alone landed this single fight at 38%
// (a real fight, in-band on its own), but the full-run agent still
// measured a 0% act-2 conditional clear rate — the hard pool's ~4
// required wins compound multiplicatively, so even several individually
// "healthy" 30-45% fights in a row crush the overall odds far harder
// than any one fixture check shows. computer 2 -> 1 on top, matching
// Warden's own shield-then-computer sequence below.
const GUARDIAN_PAIR: EnemyDef = {
  id: 'guardian-pair',
  name: 'Guardian pair',
  blurb: 'The old endgame, doubled.',
  groups: solo('guardian', 2, { initiative: 2, hp: 4, computer: 1, shield: 1, cannons: [{ diceCount: 2, damage: 2 }], missiles: [] }),
};

// 2026-08-08 (iteration 46.3): shield 3 -> 1, THEN (measured separately,
// per the shield-first-then-computer method) computer 3 -> 2. The ledger
// found this the single hardest wall in the whole hard pool (0-1%
// against a realistic budget fleet) — shield 3 against a typical act-2
// fleet's computer (~1-2) meant only a natural 6 ever hit, same hit-math
// cliff as Guardian pair above. The shield cut alone barely moved it
// (1% -> 4%) — Warden's OWN computer 3 (the highest in the pool) was the
// dominant lever, not the player's odds against it: at comp 3 it hits a
// typical fleet on a 3+, and its 8 max dmg/round (2d2 + 1d4) ground the
// fleet down within single fights faster than the player could return
// fire. Computer 2 (matching every other hard-pool enemy) plus the
// shield cut together finally opened the fight up. hp 10 and the 3-die
// spread are untouched — "the pre-boss wall" should still be a real
// fight, not a pushover, once it's not arithmetically closed.
const WARDEN: EnemyDef = {
  id: 'warden',
  name: 'Warden',
  blurb: 'The pre-boss wall.',
  groups: solo('warden', 1, {
    initiative: 2,
    hp: 10,
    computer: 2,
    shield: 1,
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

// 2026-08-12 (iteration 55, mechanism A — act-seam trim): at act 2's own
// local cols 0-1, the easy pool drops its priciest entry (Raider wing,
// 73cr — the act's own "baseline damage check", but also the single
// biggest lever behind the act-1/act-2 seam's +43% value jump measured in
// plans/iteration-55.md's Motivation section). The cheaper two-entry pool
// (Torpedo boats / Lance frigate) is what a fresh, act-1-worn fleet
// actually meets for its first two act-2 fights; Raider wing rejoins the
// pool from local col 2 on. `withCounterProtocol` (reducer.ts) ramps in on
// the same column window — see that function's own comment — so both
// halves of the seam trim share one constant and can't drift apart.
export const ACT2_SEAM_RAMP_COLS = 1; // local cols 0..ACT2_SEAM_RAMP_COLS are ramped
const EASY_POOL_ACT2_RAMP: EnemyDef[] = [TORPEDO_BOATS, LANCE_FRIGATE];

// The 1-indexed sector-column ordinal players see in copy ("takes effect
// from the Nth sector column") — derived from ACT2_SEAM_RAMP_COLS so the UI
// copy can never silently drift from the mechanism's actual threshold.
// Ramped columns are local 0..ACT2_SEAM_RAMP_COLS (1-indexed: 1st through
// ACT2_SEAM_RAMP_COLS+1th); the mechanism activates the column after that.
function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}
export const ACT2_COUNTER_ACTIVE_FROM_COLUMN = ACT2_SEAM_RAMP_COLS + 2;
export const ACT2_COUNTER_RAMP_COPY = `(takes effect from the ${ordinal(ACT2_COUNTER_ACTIVE_FROM_COLUMN)} sector column)`;

// --- Mixed formations (iteration 9) -----------------------------------------
// EnemyDef generalizes to a composition of sub-groups so a fight can pair a
// real threat with a screen that exploits greedy targeting — the doctrine
// stance (9.4) is the player's counter-tool. Elite/veterancy bonuses apply
// to every group (see eliteVariant/applyVeterancy below); each group
// activates at its own initiative via the existing activation machinery.

// 2026-08-08 (iteration 46.2): computer 3 -> 2, same cliff and same fix as
// SNIPER_PAIR below — this sniper is a separate stat block (not shared),
// so the pair's re-tune never reached it, and it was still the ledger's
// one flagged act-1-hard-band outlier (59% at column 8) after that fix
// landed. The targeting-priority puzzle this enemy is actually built
// around ("shoot the screens or snipe the sniper") is untouched by its own
// accuracy — only the hit-math cliff was.
const ESCORTED_SNIPER: EnemyDef = {
  id: 'escorted-sniper',
  name: 'Escorted sniper',
  blurb: 'Greedy targeting shoots the screens while the sniper shoots you.',
  groups: [
    {
      label: 'sniper',
      count: 1,
      stats: { initiative: 2, hp: 2, computer: 2, shield: 0, cannons: [{ diceCount: 1, damage: 2 }], missiles: [], targetsLowestHp: true },
    },
    { label: 'screen', count: 2, stats: { initiative: 1, hp: 1, computer: 0, shield: 0, cannons: [{ diceCount: 1, damage: 1 }], missiles: [] } },
  ],
};

// Re-tuned 2026-08-04: the mid-pool's plain sniper (a lone computer-3 ship)
// measured too weak by column 7 — a second sniper doubles both the threat
// and the HP pool without changing the fight's shape (still "bring
// computer or eat hits"). Same per-ship stats as GAUNTLET's solo 'sniper',
// duplicated rather than shared so that entry (the col-3 elite's base) stays
// untouched.
//
// Re-tuned again 2026-08-08 (iteration 46.2): computer 3 -> 2. Iteration
// 46's ledger probe found this was the single biggest cliff in act 1 —
// 21-44% at columns 5-6 against a realistic budget fleet, versus 95%+ for
// its two mid-pool siblings, and (via `hardestInPool`'s raw-total-HP
// selection heuristic picking this pair as "the elite" whenever it's the
// bigger HP pool in MID_POOL — see eliteEnemyForColumn) its elite variant
// at 2-10%. Root cause is the hit formula's discreteness: comp 3 plus the
// firecontrol escalation (+1, one of two act-1 escalations, live by
// column 4) reaches comp 4 — hitting a 0-piloting midgame fleet on a
// natural 2+, ~83% per die, well past what two ships' worth of dice can
// be answered with at this point in the economy. Comp 2 (+1 from
// firecontrol = comp 3, hits on 3+, ~67%) keeps the enemy's identity
// ("piloting blunts high computers — twice over") without the cliff.
// Doubled HP (this pair, not the solo GAUNTLET sniper) still makes it the
// mid pool's tankiest entry, so it stays legitimately dangerous, not
// trivialized.
const SNIPER_PAIR: EnemyDef = {
  id: 'sniper-pair',
  name: 'Sniper pair',
  blurb: 'Piloting blunts high computers — twice over.',
  groups: solo('sniper', 2, {
    initiative: 2,
    hp: 2,
    computer: 2,
    shield: 0,
    cannons: [{ diceCount: 1, damage: 2 }],
    missiles: [],
    targetsLowestHp: true,
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

// 2026-08-08 (iteration 46.3): the commander's shield 2 -> 1, same
// hit-math-cliff fix as Guardian pair/Warden above (the ledger flagged
// this pool at 28%, the mildest of the four hard-pool outliers, but
// still below the 25-50% target's midpoint). The lancers already pierce
// player shield 2 unconditionally — untouched, that's their identity.
const COMMAND_WING: EnemyDef = {
  id: 'command-wing',
  name: 'Command wing',
  blurb: 'The commander hides behind lancers that pierce your piloting.',
  groups: [
    {
      label: 'commander',
      count: 1,
      stats: { initiative: 3, hp: 5, computer: 2, shield: 1, cannons: [{ diceCount: 2, damage: 2 }], missiles: [] },
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

// Iteration 17: the fastest ship in an enemy composition, in raw initiative
// — the "fastest surviving opposing ship" the Outspeed rule compares
// against. Static/pre-fight, so this is every group's base stat with no
// round-modifier bonuses (those only exist mid-combat). 47.3i: was defined
// identically in both EnemyPanel.tsx (its own Outspeed readout) and
// PrepScreen.tsx (feeding FleetPanel's per-ship badge) — PrepScreen's own
// comment claimed it was computed once "rather than duplicated inside
// FleetPanel," which was true of FleetPanel but not of EnemyPanel, right
// next to it on the same screen.
export function fastestInitiative(groups: EnemyGroup[]): number {
  return groups.reduce((best, g) => Math.max(best, g.stats.initiative), -Infinity);
}

// An elite variant of an enemy: extra HP per ship in every group (default
// +2), same everything else.
// 47.5j: the clone-and-bump-every-group's-HP shape, shared by eliteVariant,
// convoyEscort, and applyVeterancy below — a shallow clone (spreads `g` and
// `g.stats`, nothing deeper). Deliberately shallower than
// applyCounterProtocol's own clone further down, which also deep-clones
// `cannons` because it's the one caller that actually mutates a weapon
// array; applyEscalations never touches cannons either, so it stays
// shallow too — noted so the asymmetry reads as intentional, not a gap.
function bumpGroupHp(enemy: EnemyDef, n: number): EnemyGroup[] {
  return enemy.groups.map((g) => ({ ...g, stats: { ...g.stats, hp: g.stats.hp + n } }));
}

export function eliteVariant(enemy: EnemyDef, hpBonus = 2): EnemyDef {
  return {
    ...enemy,
    id: `${enemy.id}-elite`,
    name: `${enemy.name} (elite)`,
    groups: bumpGroupHp(enemy, hpBonus),
  };
}

// 2026-08-08: a convoy fight (CargoTag 'convoy', map.ts) pays +4 credits —
// danger money now, not a free bonus. +1 HP per ship, same shape as one
// veterancy step (see veterancyBonus below), reflecting a shipment that
// travels with a slightly hardened escort.
export function convoyEscort(enemy: EnemyDef): EnemyDef {
  return {
    ...enemy,
    groups: bumpGroupHp(enemy, 1),
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

// 2026-08-12 (iteration 55, mechanism B — band-entry ramp, act 1): the
// same pool-filter idea as mechanism A, applied to a band's OPENING column
// instead of the act seam. The band's hardest entry by `totalHp` — the
// same metric `hardestInPool` already uses for elite selection — sits out
// that one column; every other column of the band draws from the full
// pool. Excluding the totalHp-hardest entry (not the enemyValue-worst one
// enemyValue.ts's report ranks by) is deliberate: because
// `eliteEnemyForColumn`'s general branch calls `hardestInPool(
// combatEnemyPool(act, col))` internally, ramping THIS metric's hardest
// entry out of the band-entry column moves the elite pick too — at act 1
// col 5 that flips the elite from Sniper pair (the death-histogram spike
// plans/iteration-55.md's Motivation section calls out, ~119% budget
// share) to Shield cruiser (30cr/66% — a real, measured cut). `worstNodeValue`
// (difficultyCurve.ts's T1/T2/T3 measure) is enemyValue-based and untouched
// by this exclusion — confirmed by measurement, not assumed — because the
// enemyValue-worst entry at c5 (Interceptor swarm) isn't the totalHp-
// hardest one and so stays in the ramped pool either way. That's fine: act
// 1's T1 check was already passing before this stage (see the stage-A
// table) — this mechanism's job is the death-histogram/elite-difficulty
// spike, not the T1 metric.
//
// ONLY applied at act 1's MID band (col 5) — measured, not assumed: the
// same mechanism tried at the HARD band's opening column (col 8) was
// reverted after measurement showed it made things WORSE, not better —
// removing Plasma tank (the totalHp-hardest HARD_POOL entry) left Ancient
// guardian as the tie-break winner, and Ancient guardian's own elite
// (61cr/73% share) turned out to be a harder fight than Plasma tank's elite
// (37cr/44%) had been, exactly the "makes a band-entry column harder" wrong
// direction plans/iteration-55.md's "reframe" section calls out as a stop-
// and-reconsider condition. See that file's stage-B status notes for the
// full before/after numbers and the death-histogram corroboration (c8
// deaths rose, not fell, with the reverted version in place).
function bandEntryRamp(pool: EnemyDef[], col: number, bandStartCol: number): EnemyDef[] {
  if (col !== bandStartCol || pool.length <= 1) return pool;
  const hardest = hardestInPool(pool);
  const ramped = pool.filter((e) => e !== hardest);
  return ramped.length > 0 ? ramped : pool;
}

const MID_BAND_START = 5;
const HARD_BAND_START = 8;

// 2026-08-12 (iteration 55, mechanism B — a discovered extension, act 2's
// hard band): the difficulty-curve self-check instrument (55.3) built for
// this iteration found a genuine, unanticipated T1 violation at act 2's
// OWN hard-band entry — c7->c8's worst-node VALUE jumps 61.5% (Carrier
// group 76cr -> Swarm armada 122cr), the single largest band-entry jump
// measured anywhere in the game, well past even the loose 30% gate. Unlike
// act 1's ramp above, this one has to remove the enemyValue-worst entry
// specifically (Swarm armada, not the totalHp-hardest Command wing — see
// `bandEntryRamp`'s comment for why those differ) for the T1 metric to
// actually move, so it's hand-curated the same way mechanism A curated
// EASY_POOL_ACT2_RAMP rather than reusing `bandEntryRamp`. Measured
// against the post-A/B enemyValue snapshot; see plans/iteration-55.md's
// stage-B status notes for the before/after numbers.
const HARD_POOL_ACT2_RAMP: EnemyDef[] = [GUARDIAN_PAIR, WARDEN, COMMAND_WING];

// Enemy pool for a combat node at the given act + column.
export function combatEnemyPool(act: 1 | 2, col: number): EnemyDef[] {
  const band = poolBand(col);
  if (act === 1) {
    if (band === 'easy') return EASY_POOL;
    if (band === 'mid') return bandEntryRamp(MID_POOL, col, MID_BAND_START);
    return HARD_POOL; // col-8 ramp reverted — see bandEntryRamp's comment
  }
  if (band === 'easy') return col <= ACT2_SEAM_RAMP_COLS ? EASY_POOL_ACT2_RAMP : EASY_POOL_ACT2;
  if (band === 'mid') return MID_POOL_ACT2;
  return col === HARD_BAND_START ? HARD_POOL_ACT2_RAMP : HARD_POOL_ACT2;
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
// comment) — both step at columns 5 and 8, alongside the first two
// escalations (escalations.ts drawEscalationSchedule).
//
// 2026-08-13 (iteration 55, mechanism C): the 3-step function above is
// replaced by `COLUMN_SCALING`, a per-(act, col) table — pure data, same
// determinism contract (a function of (act, col) alone, iteration 9's
// rule) but continuous instead of 3 flat steps, and reaching computer at
// each act's top end rather than HP only. See plans/iteration-55.md's
// stage-C status notes for the derivation against the post-A/B budget
// snapshot. Never set at a band-entry column (5 or 8, either act) — those
// columns keep whatever mechanisms A/B already left them at; the scaling
// table's job is the BACK HALF (T2, "harder where rich"), not the
// entries (T1, already handled).
export interface ColumnScaling {
  hp: number;
  computer: number;
}

const NO_SCALING: ColumnScaling = { hp: 0, computer: 0 };

export const COLUMN_SCALING: Record<1 | 2, ColumnScaling[]> = {
  // Act 1: 10 lane columns (0-9). Ramps from column 5 (the mid-band entry
  // mechanism B already eased) through column 9 (the act's last lane
  // column, immediately before the boss). Computer only appears at column
  // 9 — the "genuinely harder, not just longer" lever the spec calls for,
  // reserved for the one column no band-entry mechanism touches.
  1: [
    NO_SCALING, // c0 (opener — never scaled anyway)
    NO_SCALING, // c1
    NO_SCALING, // c2
    NO_SCALING, // c3
    NO_SCALING, // c4
    { hp: 1, computer: 0 }, // c5 — mid-band entry, HP only (same as the old 3-step schedule)
    { hp: 1, computer: 0 }, // c6 (same as the old schedule — unchanged, avoids compounding across c6-c8)
    { hp: 1, computer: 0 }, // c7 (same as the old schedule — unchanged)
    { hp: 3, computer: 0 }, // c8 — hard-band entry, HP only (+1 over the old schedule's 2)
    { hp: 8, computer: 0 }, // c9 — act top end (concentrates the increase in the ONE column T2 measures, not spread across the whole back half)
  ],
  // Act 2: 12 lane columns (0-11). Columns 0-1 stay at NO_SCALING —
  // mechanism A's seam ramp already trims this stretch; adding a
  // COLUMN_SCALING bonus on top would reopen the exact cliff A closed.
  2: [
    NO_SCALING, // c0 — seam ramp (mechanism A)
    NO_SCALING, // c1 — seam ramp (mechanism A)
    NO_SCALING, // c2
    NO_SCALING, // c3
    NO_SCALING, // c4
    { hp: 1, computer: 0 }, // c5 — mid-band entry, HP only
    { hp: 2, computer: 0 }, // c6
    { hp: 3, computer: 0 }, // c7
    { hp: 4, computer: 0 }, // c8 — hard-band entry, HP only
    { hp: 4, computer: 0 }, // c9 (flat vs c8 — the increase concentrates at c11)
    { hp: 4, computer: 0 }, // c10 (flat)
    { hp: 7, computer: 1 }, // c11 — act top end
  ],
};

function columnScaling(act: 1 | 2, col: number): ColumnScaling {
  return COLUMN_SCALING[act][col] ?? NO_SCALING;
}

// Kept for display/wiki surfaces (per the spec's explicit instruction) —
// the HP portion of the column's scaling entry. Now act-aware, since the
// table itself is act-specific (the old function was shared because the
// 3-step schedule happened to be identical for both acts; the continuous
// table is not).
export function veterancyBonus(act: 1 | 2, col: number): number {
  return columnScaling(act, col).hp;
}

function bumpGroupHpAndComputer(enemy: EnemyDef, hp: number, computer: number): EnemyGroup[] {
  return enemy.groups.map((g) => ({
    ...g,
    stats: { ...g.stats, hp: g.stats.hp + hp, computer: g.stats.computer + computer },
  }));
}

export function applyVeterancy(enemy: EnemyDef, act: 1 | 2, col: number): EnemyDef {
  const { hp, computer } = columnScaling(act, col);
  if (hp === 0 && computer === 0) return enemy;
  return {
    ...enemy,
    groups: bumpGroupHpAndComputer(enemy, hp, computer),
    // Display field stays HP-only, matching its existing "+N HP" wording
    // on the enemy panel (EnemyPanel.tsx) — the computer bonus (when any)
    // is folded into the ship's own computer stat directly, same as every
    // other computer-affecting bonus (escalations, counter-protocols),
    // which the panel already reads off actual stats rather than a badge.
    veterancyBonus: hp,
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
// 2026-08-08 (iteration 46.3): the whole final-boss trio drifted back
// above its own iteration-31-M3 band (25-55%) without any single change
// causing it — iterations 36-44's rarity/weapon/reprice churn all landed
// after that re-tune and were never re-measured against this fixture
// (65-73% by the time iteration 46 checked). A first attempt raised
// shield (Titan's honor guard, Citadel's core) alongside HP — that
// landed the endgame-fleet band correctly but collapsed the OTHER floor
// check (the pre-fusion "strong fleet" must still beat each boss >= 9%,
// not be walled) to 2-6%, while Hive Empress — buffed via ship count
// only, no shield change — stayed comfortably at 40%. Matches this
// project's own established pattern (GCDS/Warden/Guardian pair, all
// documented elsewhere in this file): shield/computer are hit-threshold
// levers that swing a weak fleet's odds far harder than a strong one's;
// HP swings both more proportionally than shield — but not enough to
// fully separate them: hp 12->16 (61% band, floor exactly at the 9%
// edge) and 12->15 (66% band, worse) both left band over the ceiling;
// 12->19 lands the band correctly (52%) but the floor check ("strong
// fleet, pre-fusion, no counter" — a weaker build than the endgame
// fixture) drops to 4%, below its own 9% floor. Same tension Void
// Citadel's own comment below already documents and accepts for that
// boss (couldn't clear both without re-opening its shield-vs-picket
// tradeoff) — now true for Titan too. Landed on hp 19 (honor guard
// shield reverted to 1): the endgame band is what's actually tied to
// this iteration's act-2 target; the floor check is marked a known,
// accepted marginal case in balance.ts (same treatment as Hive Mother's
// pre-existing "KNOWN FAIL"), not silently ignored.
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
        hp: 19,
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
//
// 2026-08-08 (iteration 46.3): drifted back to 71% (see TITAN's comment
// for the general "36-44 churn, never re-measured" cause). Same
// discipline as before — ship count is this boss's lever, not per-ship
// hp/comp (iteration 22.3's low-HP-per-ship-formation lesson still
// applies): one more ship, 7 -> 8.
// 2026-08-08 (iteration 46, the Empress decision): opted into greedy
// lowest-HP targeting (`targetsLowestHp: true`), the sniper-class
// exception to the 2026-08-08 random-targeting default. Her whole
// designed counterplay — one fast escort denying her Outspeed gap
// measurably improves the win rate, per this file's own balance.ts
// check — depended on her fire concentrating on whoever the player
// brought as tempo-cover, which random targeting undermined as a side
// effect (the escort still denies the gap, but no longer draws the
// attention that made bringing it feel like a real tactical choice
// instead of a pure stat pick). Restores the original design outright
// rather than redesigning the check around the side effect. Thematic
// fit: "many small dice, doubled" already reads as a coordinated
// hive-mind, not scattered independent raiders — focused fire suits her
// better than most enemies' scatter.
const HIVE_EMPRESS: EnemyDef = {
  id: 'empress',
  name: 'Hive Empress',
  blurb: 'Demands flak walls, arc projectors, and initiative — many small dice, doubled.',
  groups: solo('empress', 8, {
    initiative: 4,
    hp: 2,
    computer: 1,
    shield: 0,
    cannons: [{ diceCount: 1, damage: 2 }],
    missiles: [{ diceCount: 2, damage: 1 }],
    targetsLowestHp: true,
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
// 2026-08-08 (iteration 46.3): drifted back to 65% (see TITAN's comment
// for the general cause and why the first attempt — shield 2 -> 3 —
// was reverted: it collapsed the pre-fusion floor check to 2%, the same
// discrete hit-threshold effect TITAN's comment documents). hp 12 -> 16
// landed the endgame band (53%) but the floor was still short (4% vs
// 9%, worse at 12 -> 18: 2%) — the same band-vs-floor tension this
// boss's ORIGINAL 31-M3 tuning already accepted (see this comment's own
// history above: "couldn't clear the other two's 10% floor without
// re-opening the shield-vs-picket tradeoff"). Landed on hp 18: the
// endgame band (its actual target this iteration) lands correctly; the
// floor stays the known, accepted marginal case it already was, now
// marked explicitly in balance.ts rather than left implicit. shield
// left at 2 throughout (still strictly above the picket's own shield 1
// — "its pickets you can actually hit" untouched). Pickets and the
// core's computer/dice/flak untouched.
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
        hp: 18,
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
