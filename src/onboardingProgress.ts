// Iteration 29: which of the contextual first-run popups (dice roll,
// missiles, piloting — see components/OnboardingPopup.tsx) a player has
// already seen, so each shows exactly once per browser rather than every
// time its trigger condition recurs. Same shape as motionPreference.ts/
// soundPreference.ts (module-level state seeded from localStorage) minus
// the subscriber-set plumbing those two need — nothing else in the UI
// needs to react live to this changing, only CombatScreen's own mount-time
// check, so a plain read/write pair is enough here.
// Iteration 48: 'orders' added — fires the first time the fleet-orders row
// is visible (every fight, every commander), same one-shot mechanism.
export type OnboardingKey = 'diceRoll' | 'missiles' | 'piloting' | 'orders';

const KEY = 'eclipse.onboardingSeen';

function readSeen(): Partial<Record<OnboardingKey, boolean>> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {}; // corrupt JSON, storage disabled, or private browsing — just replay every popup
  }
}

let seen: Partial<Record<OnboardingKey, boolean>> = readSeen();

export function hasSeenOnboarding(key: OnboardingKey): boolean {
  return !!seen[key];
}

export function markOnboardingSeen(key: OnboardingKey): void {
  if (seen[key]) return;
  seen = { ...seen, [key]: true };
  try {
    localStorage.setItem(KEY, JSON.stringify(seen));
  } catch {
    // fail soft — the popup just replays next session instead of persisting
  }
}

// A settings-level opt-out, separate from per-topic `seen` tracking above —
// unchecking "Tutorial popups" in Settings suppresses every future
// contextual popup outright, rather than requiring each of the three
// topics to be dismissed once first. Same plain-read/write module pattern
// as `seen` (no live-subscriber plumbing needed: only nextOnboardingPopup's
// mount-time check in CombatScreen reads it, and SettingsScreen's own
// checkbox keeps its own local state for the toggle to re-render on).
// Does NOT affect the on-demand "How to play" TutorialOverlay (the "?"
// button) — that stays available regardless, since it's opened on purpose.
const DISABLED_KEY = 'eclipse.tutorialsDisabled';

export function isTutorialDisabled(): boolean {
  try {
    return localStorage.getItem(DISABLED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setTutorialDisabled(disabled: boolean): void {
  try {
    if (disabled) localStorage.setItem(DISABLED_KEY, '1');
    else localStorage.removeItem(DISABLED_KEY);
  } catch {
    // fail soft — the checkbox just won't stick across reloads
  }
}
