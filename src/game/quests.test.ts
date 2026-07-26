import { describe, expect, it } from 'vitest';
import { actColumns, generateMap, LANE_COLUMNS, nodesConnect } from './map';
import { mulberry32 } from './rng';
import { generateQuestOffer } from './quests';

describe('generateQuestOffer', () => {
  it('is deterministic for the same columns/node/rng seed', () => {
    const columns = actColumns(generateMap(1, mulberry32(1)), 2);
    const node = columns[1][0];
    const a = generateQuestOffer(columns, node, mulberry32(7));
    const b = generateQuestOffer(columns, node, mulberry32(7));
    expect(a).toEqual(b);
  });

  it('always offers a target at least 2 columns beyond the offering node', () => {
    const columns = actColumns(generateMap(2, mulberry32(2)), 2);
    for (let col = 0; col <= 4; col++) {
      const node = columns[col][0];
      for (let seed = 1; seed <= 20; seed++) {
        const offer = generateQuestOffer(columns, node, mulberry32(seed));
        if (offer) expect(offer.target.col).toBeGreaterThanOrEqual(col + 2);
      }
    }
  });

  it('the target is always reachable from the offering node (2+ columns of slack covers the full row spread)', () => {
    const columns = actColumns(generateMap(3, mulberry32(3)), 2);
    for (let col = 0; col <= 4; col++) {
      for (let row = 0; row <= 2; row++) {
        const from = { col, row };
        for (let seed = 1; seed <= 20; seed++) {
          const offer = generateQuestOffer(columns, columns[col][row], mulberry32(seed));
          if (!offer) continue;
          // Walk column by column, always able to shift row by at most 1,
          // and confirm the target row is reachable by the time we arrive.
          let reachableRows = new Set([from.row]);
          for (let c = col + 1; c <= offer.target.col; c++) {
            const next = new Set<number>();
            for (const r of reachableRows) {
              for (const cand of [r - 1, r, r + 1]) {
                if (cand >= 0 && cand <= 2 && nodesConnect({ col: c - 1, row: r }, { col: c, row: cand })) {
                  next.add(cand);
                }
              }
            }
            reachableRows = next;
          }
          expect(reachableRows.has(offer.target.row)).toBe(true);
        }
      }
    }
  });

  it('returns null when the offering column is too close to the end of the act (no eligible target)', () => {
    const columns = actColumns(generateMap(4, mulberry32(4)), 2);
    const node = columns[LANE_COLUMNS - 1][0]; // column 9 — c+2 = 11, out of range
    const offer = generateQuestOffer(columns, node, mulberry32(1));
    expect(offer).toBeNull();
  });

  it('bounty targets are always combat-type nodes', () => {
    const columns = actColumns(generateMap(5, mulberry32(5)), 2);
    const node = columns[0][0];
    let foundBounty = false;
    for (let seed = 1; seed <= 100; seed++) {
      const offer = generateQuestOffer(columns, node, mulberry32(seed));
      if (offer?.archetype === 'bounty') {
        foundBounty = true;
        const targetNode = columns[offer.target.col][offer.target.row];
        expect(targetNode.type).toBe('combat');
      }
    }
    expect(foundBounty).toBe(true);
  });
});
