import type { FrameId } from './frames';

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

// Hull-class codes for escorts. The Flagship deliberately has no code — it
// carries the bare fleet prefix instead (see designation below), so the one
// ship that matters reads as a name while the rest read as numbered assets.
const HULL_CODE: Record<Exclude<FrameId, 'cruiser'>, string> = {
  dreadnought: 'DRD',
  'light-cruiser': 'CRU',
  interceptor: 'INT',
  bastion: 'BAS',
  freighter: 'FRT',
  derelict: 'DER',
  frigate: 'SIG',
  aegis: 'AEG',
  tender: 'TDR',
  'ew-cutter': 'ECM',
  'disruptor-cutter': 'DIS',
};

// The Flagship's frame. Named 'cruiser' for historical reasons — the frame
// whose display name is "Flagship" (see frames.ts).
const FLAGSHIP_FRAME: FrameId = 'cruiser';

// The fleet prefix, worn only by the Flagship.
const FLEET_PREFIX = 'ISV';

// 7919 is prime and coprime with NAMES.length (48), so 48 consecutive
// counters from any seed produce 48 distinct names — more ships than a
// run can ever commission (fleet cap 4, plus replacements).
export function baseShipName(seed: number, counter: number): string {
  const index = (((seed % NAMES.length) + counter * 7919) % NAMES.length + NAMES.length) % NAMES.length;
  return NAMES[index];
}

// The full designation stored on a ship at commissioning.
//
//   ISV Resolute      the Flagship — the only ship with the fleet prefix
//   DRD-02 Ironside   an escort — hull class plus a commission number
//
// The number is the commission counter, not a fleet index, so it never
// renumbers when a ship ahead of it is lost. Composed once at commissioning
// rather than at render time because the counter isn't stored on the ship;
// that also means saves made before this change keep whatever they stored.
export function shipName(seed: number, counter: number, frameId: FrameId): string {
  const base = baseShipName(seed, counter);
  // Narrows frameId out of the flagship case, so HULL_CODE's key type covers
  // exactly the remaining frames — a new frame won't compile until it has a
  // code.
  if (frameId === FLAGSHIP_FRAME) return `${FLEET_PREFIX} ${base}`;
  const hull = String(counter + 1).padStart(2, '0');
  return `${HULL_CODE[frameId as Exclude<FrameId, typeof FLAGSHIP_FRAME>]}-${hull} ${base}`;
}
