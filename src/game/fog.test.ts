import { describe, expect, it } from 'vitest';
import { isNodeRevealed, visibleNodeType } from './fog';
import type { MapNode } from './map';

function node(col: number, row: number, type: MapNode['type']): MapNode {
  return { col, row, type };
}

describe('isNodeRevealed / visibleNodeType', () => {
  it('before the first pick (visionCol 0), only column 0 is proximity-visible', () => {
    const state = { visited: [], revealedNodes: [], visionCol: 0 };
    expect(isNodeRevealed(state, node(0, 1, 'combat'))).toBe(true);
    expect(isNodeRevealed(state, node(1, 0, 'combat'))).toBe(false);
    expect(visibleNodeType(state, node(1, 0, 'combat'))).toBeNull();
  });

  it('visionCol grows by 1 as the player advances (simulated by bumping it directly)', () => {
    const state = { visited: [], revealedNodes: [], visionCol: 2 };
    expect(isNodeRevealed(state, node(2, 0, 'combat'))).toBe(true);
    expect(isNodeRevealed(state, node(3, 0, 'combat'))).toBe(false);
  });

  it('repair yards and the boss node are always visible regardless of vision', () => {
    const state = { visited: [], revealedNodes: [], visionCol: 0 };
    expect(isNodeRevealed(state, node(6, 1, 'repair'))).toBe(true);
    expect(isNodeRevealed(state, node(8, 0, 'boss'))).toBe(true);
    expect(visibleNodeType(state, node(6, 1, 'repair'))).toBe('repair');
  });

  it('visited nodes stay revealed even outside current vision (monotonic)', () => {
    const state = { visited: [{ col: 0, row: 0 }], revealedNodes: [], visionCol: 0 };
    expect(isNodeRevealed(state, node(0, 0, 'combat'))).toBe(true);
  });

  it('explicitly revealed nodes (deep scan) are visible outside vision and proximity', () => {
    const state = { visited: [], revealedNodes: [{ col: 5, row: 2 }], visionCol: 0 };
    expect(isNodeRevealed(state, node(5, 2, 'elite'))).toBe(true);
    expect(isNodeRevealed(state, node(5, 1, 'elite'))).toBe(false);
  });

  it('hidden nodes expose no type to the caller', () => {
    const state = { visited: [], revealedNodes: [], visionCol: 0 };
    expect(visibleNodeType(state, node(4, 0, 'elite'))).toBeNull();
  });
});
