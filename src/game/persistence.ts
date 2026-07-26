import type { RunState } from './types';

// Bump whenever RunState's shape changes incompatibly — no migrations at
// this stage (post-1.0 problem); a version mismatch just discards the old
// save silently and offers a new run instead.
export const SAVE_VERSION = 1;
const SAVE_KEY = 'eclipse.save.v1';

interface SaveEnvelope {
  version: number;
  state: RunState;
}

// The subset of the Web Storage API this module needs. Accepting it as a
// parameter (defaulting to the real localStorage) lets tests inject an
// in-memory fake instead of requiring a DOM environment, and lets the app
// degrade gracefully wherever localStorage itself throws just being touched
// (some sandboxed/private-browsing contexts) rather than only on use.
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

// Never throws — localStorage being unavailable or quota-full (private
// mode) means the run simply proceeds save-less. Returns whether the save
// actually happened, so the caller can show a one-line "saving unavailable"
// banner the first time it fails.
export function saveRun(state: RunState, storage: StorageLike | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    const envelope: SaveEnvelope = { version: SAVE_VERSION, state };
    storage.setItem(SAVE_KEY, JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

// Never throws. Returns null on: no storage, no save, corrupt JSON, or a
// version mismatch — every one of those cases means "act as if there is no
// save" (offer only New run).
export function loadRun(storage: StorageLike | null = defaultStorage()): RunState | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SaveEnvelope>;
    if (parsed.version !== SAVE_VERSION || !parsed.state) return null;
    return parsed.state;
  } catch {
    return null;
  }
}

export function clearRun(storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(SAVE_KEY);
  } catch {
    // fail soft
  }
}
