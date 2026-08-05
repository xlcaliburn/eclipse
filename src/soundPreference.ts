// The game's sound setting — same shape as motionPreference.ts (module-level
// singleton + localStorage + a subscriber set), kept as a fully separate
// preference rather than folded into motion: a player can reasonably want
// combat sound with animations off (or vice versa), so tying them together
// would take away a real choice for a false simplicity.
export type SoundSetting = 'on' | 'off';

const KEY = 'eclipse.sound';

function storedSetting(): SoundSetting | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === 'on' || raw === 'off' ? raw : null;
  } catch {
    return null;
  }
}

// On by default — same reasoning as motion defaulting to 'full': it's a
// deliberate part of the combat feedback here, and there's a one-click
// toggle in Settings for anyone who'd rather play silent.
let current: SoundSetting = storedSetting() ?? 'on';
const listeners = new Set<() => void>();

export function getSoundSetting(): SoundSetting {
  return current;
}

export function isSoundOn(): boolean {
  return current === 'on';
}

export function setSoundSetting(next: SoundSetting): void {
  if (next === current) return;
  current = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // fail soft — the setting just won't persist across reloads
  }
  listeners.forEach((fn) => fn());
}

export function subscribeSound(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
