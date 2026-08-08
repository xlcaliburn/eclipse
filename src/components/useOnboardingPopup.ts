import { useEffect, useRef, useState } from 'react';
import type { CombatState } from '../game/combatEngine';
import { hasMissilePhase } from '../game/combatEngine';
import type { EnemyDef } from '../game/types';
import { hasSeenOnboarding, isTutorialDisabled, markOnboardingSeen } from '../onboardingProgress';
import type { OnboardingKey } from '../onboardingProgress';

// 47.4.1: extracted from CombatScreen. Iteration 29: the first-run
// onboarding sequence — dice roll, then missiles, then piloting, checked
// in that fixed priority order every time a popup closes (not just once),
// so a fight that trips two conditions at once (e.g. a first-ever fight
// that also happens to have a live missile phase) shows them back-to-back
// instead of only ever surfacing one. `hasMissilePhase`/the piloting check
// are pure functions of the fight's starting composition (neither changes
// mid-fight), so it's safe to re-derive from `combat`/`enemy` on every
// check rather than caching them.
function nextOnboardingPopup(combat: CombatState, enemy: EnemyDef): OnboardingKey | null {
  if (isTutorialDisabled()) return null;
  if (!hasSeenOnboarding('diceRoll')) return 'diceRoll';
  if (!hasSeenOnboarding('missiles') && hasMissilePhase(combat)) return 'missiles';
  if (!hasSeenOnboarding('piloting') && enemy.groups.some((g) => g.stats.shield > 0)) return 'piloting';
  return null;
}

export function useOnboardingPopup(combat: CombatState, enemy: EnemyDef) {
  // Checked once when CombatScreen first mounts for this fight (a ref, not
  // a dependency array, so it never re-fires as `combat` changes every
  // round) and again each time a popup is dismissed, so multiple
  // first-time conditions in the same fight surface one after another
  // instead of only the first.
  const [onboardingPopup, setOnboardingPopup] = useState<OnboardingKey | null>(null);
  const onboardingCheckedRef = useRef(false);
  useEffect(() => {
    if (onboardingCheckedRef.current) return;
    onboardingCheckedRef.current = true;
    setOnboardingPopup(nextOnboardingPopup(combat, enemy));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately once per mount, see comment above
  }, []);

  function dismissOnboardingPopup() {
    if (onboardingPopup) markOnboardingSeen(onboardingPopup);
    setOnboardingPopup(nextOnboardingPopup(combat, enemy));
  }

  return { onboardingPopup, dismissOnboardingPopup };
}
