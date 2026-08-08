// 47.5h: small array helpers shared between reducer.ts and events.ts, both
// of which had their own byte-identical (or structurally identical) copies.

// Removes the first occurrence of `item` from `list`, returning a new
// array. A no-op (returns `list` itself) if `item` isn't present.
export function removeOnce<T>(list: T[], item: T): T[] {
  const index = list.indexOf(item);
  if (index === -1) return list;
  const copy = [...list];
  copy.splice(index, 1);
  return copy;
}

// Replaces the fleet entry at `index` with `fn(ship)`, leaving every other
// ship untouched — the single most repeated shape in reducer.ts (every
// action that mutates one ship by its index did this by hand).
export function mapShip<T>(fleet: T[], index: number, fn: (ship: T) => T): T[] {
  return fleet.map((s, i) => (i === index ? fn(s) : s));
}
