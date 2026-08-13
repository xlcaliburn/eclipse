import { getPart } from '../game/parts';
import type { SlotKind } from '../game/frames';
import { slotKindForPartType } from '../game/ship';
import type { PartId } from '../game/types';
import { PartCard } from './PartCard';

// The slot kind spelled out, under each socket. 2026-08-12: this replaces
// the colour+icon+letter code the standalone SlotRow used on the fleet
// panel. A code needs a legend; a word doesn't — and the fleet panel is
// where a player is actually deciding what to fit, so the plain label
// earns its space there. SlotRow keeps the compact chips for the shop's
// frame cards, where the job is comparing many hulls at a glance rather
// than fitting one.
const SLOT_KIND_LABEL: Record<SlotKind, string> = {
  weapon: 'Weapon',
  defense: 'Defense',
  systems: 'Systems',
  universal: 'Universal',
};

const SLOT_KIND_HINT: Record<SlotKind, string> = {
  weapon: 'Weapons only',
  defense: 'Piloting or hull parts only',
  systems: 'Computer or drive parts only',
  universal: 'Any part, including cargo',
};

// Greedy left-to-right assignment of equipped parts to sockets, for
// DISPLAY only — `equipped` is a flat, unindexed array (52.1: parts are
// never actually assigned to slot indices, only checked for feasibility),
// so this picks a plausible-looking arrangement: each dedicated socket
// claims the first not-yet-placed part of its own kind, then whatever's
// left spills into the universal sockets in order. A legally-equipped ship
// (the only kind this renders) always places every part somewhere.
function assignPartsToSlots(layout: SlotKind[], equipped: PartId[]): (PartId | null)[] {
  const slots: (PartId | null)[] = layout.map(() => null);
  const remaining = [...equipped];
  layout.forEach((kind, i) => {
    if (kind === 'universal') return;
    const idx = remaining.findIndex((id) => slotKindForPartType(getPart(id).type) === kind);
    if (idx !== -1) {
      slots[i] = remaining[idx];
      remaining.splice(idx, 1);
    }
  });
  layout.forEach((kind, i) => {
    if (kind !== 'universal' || slots[i]) return;
    if (remaining.length > 0) slots[i] = remaining.shift()!;
  });
  return slots;
}

interface ShipBlueprintProps {
  layout: SlotKind[];
  equipped: PartId[];
  // Omitted on read-only surfaces (the shop's own fleet panel preview has
  // one, the combat theater doesn't) — sockets then render their contents
  // without an unequip affordance.
  onUnequip?: (partId: PartId) => void;
  // Iteration 58.3: the one genuinely new UNEQUIP guard — only ever returns
  // non-null for a reactor whose generation the rest of the loadout is
  // relying on. Same no-dead-click discipline FleetPanel's inventory grid
  // already applies to EQUIP via equipBlockReason. Only meaningful when
  // onUnequip is also passed; ignored on read-only surfaces.
  unequipBlockReason?: (partId: PartId) => string | null;
}

// 2026-08-12: one blueprint replaces the fleet panel's two separate
// loadout views — the always-visible SlotRow and the collapsed parts grid
// were the same information twice, and the always-visible half was a wall
// of colour on a screen the player is usually just passing through. Now a
// socket shows BOTH what kind of part it takes and what's currently in it,
// the way a ship board does: the part sits in the socket, the socket says
// what it accepts underneath.
export function ShipBlueprint({ layout, equipped, onUnequip, unequipBlockReason }: ShipBlueprintProps) {
  const assigned = assignPartsToSlots(layout, equipped);
  return (
    <div className="blueprint">
      {layout.map((kind, i) => {
        const partId = assigned[i];
        const part = partId ? getPart(partId) : null;
        // 58.3: null whenever there's nothing to block (no onUnequip at
        // all — a read-only surface — or this specific part isn't blocked).
        const blockReason = onUnequip && partId ? (unequipBlockReason?.(partId) ?? null) : null;
        return (
          <div key={i} className={`blueprint__slot blueprint__slot--${kind}`}>
            <div className="blueprint__socket" title={blockReason ?? SLOT_KIND_HINT[kind]}>
              {part ? (
                <PartCard
                  part={part}
                  onClick={onUnequip && partId && !blockReason ? () => onUnequip(partId) : undefined}
                  disabled={!!blockReason}
                  title={blockReason ?? undefined}
                />
              ) : (
                <div className="blueprint__empty" role="img" aria-label={`Empty ${SLOT_KIND_LABEL[kind].toLowerCase()} slot`} />
              )}
            </div>
            <span className="blueprint__label">{SLOT_KIND_LABEL[kind]}</span>
          </div>
        );
      })}
    </div>
  );
}
