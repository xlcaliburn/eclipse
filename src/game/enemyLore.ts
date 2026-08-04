// Flavor text, kept apart from enemies.ts on purpose: that file is stat
// blocks and pool arithmetic, and every line in it is load-bearing. This is
// the opposite — nothing here affects a single roll.
//
// EnemyDef.blurb is *tactical* ("Computers beat shields") and stays where it
// is. These are the story lines: who this is and why they're in your way.
// Keyed by enemy id.

export const ENEMY_LORE: Record<string, string> = {
  // --- Act 1 pool ---------------------------------------------------------
  'scout-pack': 'Border pickets flying decade-old hulls. They radioed for help before they closed — someone, somewhere, now knows your heading.',
  'missile-frigate': 'A cheap hull built around an expensive launcher. Its crew knows the first salvo is the only one that matters.',
  'shield-cruiser': 'Corporate security, still wearing the livery of whatever firm stopped paying them. The shields were the last upgrade they could afford.',
  'interceptor-swarm': 'Single-seat hulls with no life support to speak of. They are flown by pilots who were promised the salvage rights.',
  'plasma-tank': 'A mining rig with its cutting array pointed outward. Slow, patient, and carrying enough armor to outlast an argument.',
  sniper: 'It has been holding this position for eleven days, waiting for exactly one target to drift into its firing solution.',
  'sniper-pair': 'The second one arrived after the first stopped missing. Now they take turns, so neither has to reload alone.',
  'missile-swarm': 'A launch cordon left over from a war nobody won. The tubes still cycle; the crews stopped asking why.',
  'ancient-guardian': 'It predates the shipping lanes it guards. Nothing aboard has spoken in centuries, and it has never once let anyone pass.',
  gcds: 'A Galactic Center Defense System, still executing standing orders from a government that dissolved generations ago.',

  // --- Act 2 pool ---------------------------------------------------------
  'raider-wing': 'They work this stretch of the sector on a schedule, and they have never needed a second pass.',
  'torpedo-boats': 'Barely more than engines strapped to warheads. The crews are paid per launch, not per return.',
  'lance-frigate': 'Their lances were built to open mining shafts. They cut through a shield array just as cleanly.',
  'rift-cult': 'They believe the rift speaks, and that its dice are more honest than yours. They may be right about the dice.',
  'flak-fortress': 'A static gun platform towed into the lane at enormous cost, purely to make missiles a waste of money.',
  'antimatter-battery': 'One shot, containment-fed, ruinously expensive. They will spend it on whichever of your ships looks most loved.',
  'guardian-pair': 'Two of the old sentinels, running the same silent protocol in perfect step. Nobody knows what woke the second one.',
  warden: 'It boards, it inventories, it confiscates. The wardens stopped filing reports a long time ago and simply kept the habit.',
  'swarm-armada': 'Not a fleet so much as a weather system with intent. Individually trivial, collectively a wall of dice.',
  'escorted-sniper': 'The screens are paid to die slowly. The gun behind them is paid to only need a moment.',
  'carrier-group': 'A tender with a full rack and the patience to launch on its own timetable. Kill it early or fight everything it carries.',
  'command-wing': 'A flag officer who has not personally been in range of enemy fire in years, and does not intend to start now.',

  // --- Bosses -------------------------------------------------------------
  hive: 'The armada has a center, and this is it. Every small thing you have been killing came from here.',
  dread: 'A capital hull from the last real war, kept alive by a crew that refuses to admit the war ended.',
  titan: 'It does not come alone, and it has never had to. Whole systems have surrendered at the sight of its transponder.',
  empress: 'She commands the swarm the way a storm commands rain — not by orders, but by being the reason it moves at all.',
  citadel: 'The last fixed point in the sector. Everything that has fought you so far was, in some sense, an outwork of this.',

  // --- Special encounters -------------------------------------------------
  pickets: 'Automated watchposts running their morning sweep. They are not expecting you, and it will not help them.',
};

// An ambush variant reuses a base enemy's stat block under a new id (see
// enemies.ts's `hunterKillerForAmbush`), so strip the suffix before looking
// the flavor up.
const ID_SUFFIXES = ['-hunter'];

export function getEnemyLore(id: string): string | undefined {
  for (const suffix of ID_SUFFIXES) {
    if (id.endsWith(suffix)) return ENEMY_LORE[id.slice(0, -suffix.length)];
  }
  return ENEMY_LORE[id];
}
