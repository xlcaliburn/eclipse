// Iteration 29: which of the three contextual first-run popups (dice roll,
// missiles, piloting — see components/OnboardingPopup.tsx) a player has
// already seen, so each shows exactly once per browser rather than every
// time its trigger condition recurs. Same shape as motionPreference.ts/
// soundPreference.ts (module-level state seeded from localStorage) minus
// the subscriber-set plumbing those two need — nothing else in the UI
// needs to react live to this changing, only CombatScreen's own mount-time
// check, so a plain read/write pair is enough here.
export type OnboardingKey = 'diceRoll' | 'missiles' | 'piloting';

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
