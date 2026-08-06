// Iteration 26 (fixed in 27): Slay-the-Spire-style seed sharing.
// `RunState.map.seed` (see rng.ts) is already the single number the entire
// run — map, escalations, commander draw, every shop/event/combat roll
// after it — is deterministic from (iteration 9). This module just converts
// that uint32 to and from a short string a player can read aloud, type, or
// paste, so two players (or the same player twice) can start from the exact
// same run.
//
// Crockford's Base32 alphabet: 32 symbols, digits 0-9 then letters with I,
// L, O, U dropped (I/L/O look like 1/1/0 at a glance; U is dropped by the
// original spec to avoid accidental words). Decoding folds O back to 0 and
// I/L back to 1, so a misread character still resolves correctly rather
// than rejecting a seed a player copied down slightly wrong.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

// 32^6 (1,073,741,824) is short of the full uint32 range (4,294,967,296);
// 32^7 (34,359,738,368) covers it — every seed this app generates round-
// trips through exactly 7 characters. But 7 base32 digits can ALSO express
// values from 32^6 up to 32^7-1 (~34.4 billion) — well past 0xFFFFFFFF
// (~4.3 billion) — so a hand-typed 7-character code isn't automatically a
// valid seed the way a generated one always is. `MAX_SEED` is the ceiling
// `codeToSeed` checks against (see its comment — this was iteration 26's
// actual shipped bug: it used `>>> 0` instead of this check, so an
// out-of-range code silently wrapped into an unrelated valid-looking seed
// instead of being rejected).
const CODE_LENGTH = 7;
const MAX_SEED = 0xffffffff;

const DECODE: Record<string, number> = {};
for (let i = 0; i < ALPHABET.length; i++) DECODE[ALPHABET[i]] = i;

// Encodes a uint32 seed as a fixed 7-character, zero-padded code.
export function seedToCode(seed: number): string {
  let n = seed >>> 0;
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out = ALPHABET[n % 32] + out;
    n = Math.floor(n / 32);
  }
  return out;
}

// Parses a player-typed code back into a uint32 seed, or null if it can't
// be read as one. Case-insensitive; tolerates surrounding whitespace and
// stray separators (a player might paste "ABC-1234"); folds O->0, I/L->1.
// Requires exactly 7 significant characters — anything shorter or longer
// isn't a code this app could have generated. Critically, also rejects any
// 7-character code that decodes past `MAX_SEED`: 7 base32 digits can
// address ~34.4 billion values but a seed is only a uint32 (~4.3 billion),
// so most 7-char strings are NOT valid codes even though they're the right
// length — decoding them anyway (the iteration-26 bug: `n >>> 0` silently
// wrapped mod 2^32) would hand back a real-looking seed that has nothing
// to do with what was typed. A code that can't be read exactly must fail
// loudly, not "succeed" into the wrong sector.
export function codeToSeed(code: string): number | null {
  const cleaned = code
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '');
  if (cleaned.length !== CODE_LENGTH) return null;
  let n = 0;
  for (const rawCh of cleaned) {
    const ch = rawCh === 'O' ? '0' : rawCh === 'I' || rawCh === 'L' ? '1' : rawCh;
    const digit = DECODE[ch];
    if (digit === undefined) return null;
    n = n * 32 + digit;
  }
  return n > MAX_SEED ? null : n;
}
