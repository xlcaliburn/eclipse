// Iteration 18 ("the fleet remembers"): seeded ship names, so combat logs
// read like stories ("ISV Resolute jinks aside") instead of spreadsheets
// ("Interceptor #2"). Pure and deterministic — names derive from the map
// seed plus a per-run commission counter, never from the rng stream, so
// naming can never perturb an existing draw sequence.

const NAMES = [
  'Resolute', 'Dauntless', 'Vigilant', 'Tempest', 'Aurora', 'Meridian',
  'Onyx', 'Pathfinder', 'Ardent', 'Bastille', 'Corsair', 'Defiant',
  'Eclipse', 'Falchion', 'Gallant', 'Harbinger', 'Intrepid', 'Javelin',
  'Kestrel', 'Longbow', 'Mistral', 'Nomad', 'Orion', 'Paragon',
  'Quasar', 'Reliant', 'Sovereign', 'Talon', 'Umbra', 'Valiant',
  'Warden', 'Zenith', 'Argent', 'Bulwark', 'Cinder', 'Drake',
  'Ember', 'Fathom', 'Gryphon', 'Horizon', 'Ironside', 'Lodestar',
  'Marauder', 'Nightfall', 'Osprey', 'Pyre', 'Solace', 'Vantage',
] as const;

// 7919 is prime and coprime with NAMES.length (48), so 48 consecutive
// counters from any seed produce 48 distinct names — more ships than a
// run can ever commission (fleet cap 4, plus replacements).
export function shipName(seed: number, counter: number): string {
  const index = (((seed % NAMES.length) + counter * 7919) % NAMES.length + NAMES.length) % NAMES.length;
  return `ISV ${NAMES[index]}`;
}
