import { getPart } from '../game/parts';
import type { SlotKind } from '../game/frames';
import { slotKindForPartType } from '../game/ship';
import type { PartId } from '../game/types';
import { PartIcon, SlotKindIcon } from './PartIcon';

const SLOT_KIND_LETTER: Record<SlotKind, string> = {
  weapon: 'W',
  defense: 'D',
  systems: 'S',
  universal: '•', // bullet — the fourth "reads at a glance" cue from 52.2's own letter list
};

const SLOT_KIND_LABEL: Record<SlotKind, string> = {
  weapon: 'weapon slot',
  defense: 'defense slot (piloting/hull)',
  systems: 'systems slot (computer/drive)',
  universal: 'universal slot (anything)',
};

// Greedy left-to-right assignment of equipped parts to slots, for DISPLAY
// only — `equipped` is a flat, unindexed array (52.1: parts are never
// actually assigned to slot indices, only checked for feasibility), so this
// just picks a plausible-looking arrangement: each non-universal slot
// claims the first not-yet-placed part of its own matching kind, then
// whatever's left (including any part whose own kind already filled up)
// spills into the universal slots in order. A legally-equipped ship (the
// only kind this ever renders) always places every part somewhere.
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

interface SlotRowProps {
  layout: SlotKind[];
  // Omitted entirely for a pre-purchase preview (shop frame cards) — every
  // slot then renders in its empty state, showing the hull's shape before
  // it's bought.
  equipped?: PartId[];
  size?: number;
}

// Iteration 52.2: three redundant cues per slot — colour, icon, and a
// letter — so a hull's weapon/defense/systems/universal shape reads at a
// glance and survives colourblindness (see plans/iteration-52.md's 52.2).
// Filled vs. empty is its own visual state, not just "has an icon or
// doesn't" — an empty weapon-only slot should look like it's WAITING for a
// weapon. Shared across the shop's frame cards, FleetPanel/FleetOverlay
// ship cards (prep screen included, via FleetPanel), and the shipyard
// refit rows (52.5).
export function SlotRow({ layout, equipped = [], size = 22 }: SlotRowProps) {
  const assigned = assignPartsToSlots(layout, equipped);
  return (
    <div className="slot-row">
      {layout.map((kind, i) => {
        const partId = assigned[i];
        const part = partId ? getPart(partId) : null;
        return (
          <span
            key={i}
            className={`slot-chip slot-chip--${kind}${part ? ' slot-chip--filled' : ' slot-chip--empty'}`}
            title={part ? `${part.name} (${SLOT_KIND_LABEL[kind]})` : `Empty ${SLOT_KIND_LABEL[kind]}`}
          >
            {part ? <PartIcon part={part} size={size} /> : <SlotKindIcon kind={kind} size={size} />}
            <span className="slot-chip__letter">{SLOT_KIND_LETTER[kind]}</span>
          </span>
        );
      })}
    </div>
  );
}
