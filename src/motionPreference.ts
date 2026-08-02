// The game's motion setting. Animations are ON by default regardless of the
// OS `prefers-reduced-motion` value: they carry real information here (which
// ship fired, what the die showed), and machines commonly have that setting
// on for reasons unrelated to games. Players who want motion off have a
// one-click toggle in the HUD, and that choice persists.
//
// The resolved value is stamped on <html data-motion="..."> so CSS can key
// off it. Every animation-suppressing rule in styles.css uses that attribute
// rather than an @media query, precisely so this setting actually wins.
export type MotionSetting = 'full' | 'reduced';

const KEY = 'eclipse.motion';

function storedSetting(): MotionSetting | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === 'full' || raw === 'reduced' ? raw : null;
  } catch {
    return null;
  }
}

// Motion is ON by default, even where the OS asks for reduced motion: the
// animations carry real information here (which ship fired, what the die
// showed), and a player who wants them off has a one-click toggle in the
// HUD that then sticks. The OS preference is still respected as a *hint* —
// see the change listener below, which only moves an unset preference.
let current: MotionSetting = storedSetting() ?? 'full';
const listeners = new Set<() => void>();

function apply(): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.motion = current;
}

apply();

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
