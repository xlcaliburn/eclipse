import { describe, expect, it } from 'vitest';

// Iteration 9.1: persistence makes "quit -> reload -> retry" a real
// incentive unless every draw in a run flows through the seeded, resumable
// rng in RunState. Math.random()/Date.now() anywhere in src/game/ (besides
// rng.ts's own one-time NEW_RUN seed) would let a reload reroll fate — ban
// enforced here rather than by convention. Reads sibling files as raw text
// via Vite's import.meta.glob (avoids needing Node's fs/path types under
// this project's browser-oriented tsconfig).
const sourceModules = import.meta.glob('./*.ts', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;

const ALLOWED_FILES = new Set(['./rng.ts']); // the one legitimate nondeterministic call: randomSeed() at NEW_RUN

function sourceFiles(): [string, string][] {
  return Object.entries(sourceModules).filter(([path]) => !path.endsWith('.test.ts'));
}

describe('no stray nondeterminism in src/game/ (iteration 9.1)', () => {
  it('no file (other than rng.ts) calls Math.random() or Date.now()', () => {
    const offenders: string[] = [];
    for (const [path, text] of sourceFiles()) {
      if (ALLOWED_FILES.has(path)) continue;
      if (/Math\.random\s*\(|Date\.now\s*\(/.test(text)) {
        offenders.push(path);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('rng.ts itself confines Math.random() to exactly one function: randomSeed', () => {
    const text = sourceModules['./rng.ts'];
    const matches = text.match(/Math\.random\s*\(/g) ?? [];
    expect(matches).toHaveLength(1);
  });
});
