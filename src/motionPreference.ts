// A user-overridable motion setting. The OS `prefers-reduced-motion` is the
// default, but it is only a default — a player on a machine with animations
// switched off system-wide can still opt back into the game's motion here,
// without touching an OS accessibility setting.
//
// The resolved value is stamped on <html data-motion="..."> so CSS can key
// off it. Every animation-suppressing rule in styles.css uses that attribute
// rather than an @media query, precisely so this override actually wins.
export type MotionSetting = 'full' | 'reduced';

const KEY = 'eclipse.motion';

function systemPrefersReduced(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function storedSetting(): MotionSetting | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === 'full' || raw === 'reduced' ? raw : null;
  } catch {
    return null;
  }
}

let current: MotionSetting = storedSetting() ?? (systemPrefersReduced() ? 'reduced' : 'full');
const listeners = new Set<() => void>();

function apply(): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.motion = current;
}

apply();

// Follow the OS if the player has never expressed a preference; an explicit
// choice always wins over a later system change.
try {
  window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
    if (storedSetting() !== null) return;
    current = e.matches ? 'reduced' : 'full';
    apply();
    listeners.forEach((fn) => fn());
  });
} catch {
  // no matchMedia — the default stands
}

export function getMotionSetting(): MotionSetting {
  return current;
}

export function isReducedMotion(): boolean {
  return current === 'reduced';
}

export function setMotionSetting(next: MotionSetting): void {
  if (next === current) return;
  current = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // fail soft — the setting just won't persist across reloads
  }
  apply();
  listeners.forEach((fn) => fn());
}

export function subscribeMotion(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
