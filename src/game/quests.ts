import { LANE_COLUMNS } from './map';
import type { MapNode, MapPosition } from './map';
import type { RngFn } from './rng';

export type QuestArchetype = 'bounty' | 'delivery' | 'recon';

// A quest marks a single future node. `carrierShipIndex` is delivery-only,
// set once a carrier ship is chosen at accept time.
export interface ActiveQuest {
  archetype: QuestArchetype;
  target: MapPosition;
  carrierShipIndex?: number;
}

const ARCHETYPES: QuestArchetype[] = ['bounty', 'delivery', 'recon'];

// Bounty targets must be combat nodes (that's where the named elite is
// placed); delivery/recon can target any node type. Columns c+2..7 are
// always reachable from column c in a 3-lane +/-1 trellis — two columns of
// slack fully covers the row spread — so a non-empty pool here is never
// actually dead-on-arrival, it's just possibly empty if the offer column
// is too close to the end of the map (col 6 or 7).
function eligibleTargets(columns: MapNode[][], fromCol: number, archetype: QuestArchetype): MapPosition[] {
  const targets: MapPosition[] = [];
  for (let col = fromCol + 2; col <= LANE_COLUMNS - 1; col++) {
    for (const node of columns[col]) {
      if (archetype === 'bounty' && node.type !== 'combat') continue;
      targets.push({ col: node.col, row: node.row });
    }
  }
  return targets;
}

// Pure quest-offer generator for a shop's job board. `columns` is the
// current act's columns (see `actColumns`) — quest targets never cross the
// act boundary. Returns null when no eligible target exists (offer column
// too close to the act's end) — per spec, no eligible target means no offer
// at all.
export function generateQuestOffer(columns: MapNode[][], node: MapNode, rng: RngFn): ActiveQuest | null {
  const archetype = ARCHETYPES[Math.floor(rng() * ARCHETYPES.length)];
  const targets = eligibleTargets(columns, node.col, archetype);
  if (targets.length === 0) return null;
  const target = targets[Math.floor(rng() * targets.length)];
  return { archetype, target };
}
