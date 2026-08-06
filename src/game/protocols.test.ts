import { describe, expect, it } from 'vitest';
import { drawProtocolOffers, getProtocol, hasProtocol, PROTOCOLS } from './protocols';
import { mulberry32 } from './rng';
import type { PlayerShipState } from './types';

function flagship(overrides: Partial<PlayerShipState> = {}): PlayerShipState {
  return { frameId: 'cruiser', equipped: [], damage: 0, upgrades: [], ...overrides };
}

describe('protocols (iteration 28)', () => {
  it('every protocol id in PROTOCOLS resolves via getProtocol with a matching id', () => {
    for (const id of Object.keys(PROTOCOLS) as (keyof typeof PROTOCOLS)[]) {
      expect(getProtocol(id).id).toBe(id);
    }
  });

  it('hasProtocol is false for undefined/empty arrays and true only for a present id', () => {
    expect(hasProtocol(undefined, 'reinforced-bulkheads')).toBe(false);
    expect(hasProtocol([], 'reinforced-bulkheads')).toBe(false);
    expect(hasProtocol(['ace-pipeline'], 'reinforced-bulkheads')).toBe(false);
    expect(hasProtocol(['ace-pipeline', 'reinforced-bulkheads'], 'reinforced-bulkheads')).toBe(true);
  });

  it('draws exactly one silver, one gold, one prismatic offer, in that order', () => {
    const offers = drawProtocolOffers(mulberry32(1), undefined, [flagship()]);
    expect(offers).toHaveLength(3);
    expect(getProtocol(offers[0]).tier).toBe('silver');
    expect(getProtocol(offers[1]).tier).toBe('gold');
    expect(getProtocol(offers[2]).tier).toBe('prismatic');
  });

  it('is deterministic for a fixed rng stream', () => {
    const a = drawProtocolOffers(mulberry32(42), undefined, [flagship()]);
    const b = drawProtocolOffers(mulberry32(42), undefined, [flagship()]);
    expect(a).toEqual(b);
  });

  it('never offers Ace pipeline to the Admiral (already has the effect innately)', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const offers = drawProtocolOffers(mulberry32(seed), 'admiral', [flagship()]);
      expect(offers).not.toContain('ace-pipeline');
    }
  });

  it('can still offer Ace pipeline to a non-Admiral commander', () => {
    const seeds = Array.from({ length: 200 }, (_, i) => i + 1);
    const anyAcePipeline = seeds.some((seed) => drawProtocolOffers(mulberry32(seed), 'merchant', [flagship()]).includes('ace-pipeline'));
    expect(anyAcePipeline).toBe(true);
  });

  it('never offers Lone flagship when the fleet has no Flagship (cruiser frame)', () => {
    const noFlagshipFleet: PlayerShipState[] = [{ frameId: 'interceptor', equipped: [], damage: 0, upgrades: [] }];
    for (let seed = 1; seed <= 100; seed++) {
      const offers = drawProtocolOffers(mulberry32(seed), undefined, noFlagshipFleet);
      expect(offers).not.toContain('lone-flagship');
    }
  });

  it('can still offer Lone flagship when a Flagship is present', () => {
    const seeds = Array.from({ length: 200 }, (_, i) => i + 1);
    const anyLoneFlagship = seeds.some((seed) => drawProtocolOffers(mulberry32(seed), undefined, [flagship()]).includes('lone-flagship'));
    expect(anyLoneFlagship).toBe(true);
  });

  it('every prismatic protocol states a cost; no silver or gold protocol does', () => {
    for (const def of Object.values(PROTOCOLS)) {
      if (def.tier === 'prismatic') expect(def.cost).toBeTruthy();
      else expect(def.cost).toBeUndefined();
    }
  });
});
