import { useSyncExternalStore } from 'react';
import { getMotionSetting, isReducedMotion, subscribeMotion } from '../motionPreference';
import type { MotionSetting } from '../motionPreference';

// Iteration 10.7: a JS-level read of the motion preference for the places
// CSS can't cover — the combat theater's replay timing and the fx spawner.
// Reads the resolved setting (OS preference, unless the player overrode it),
// so an in-app override reaches the JS-timed animations too.
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeMotion, isReducedMotion, () => true);
}

// The raw setting, for the UI control that changes it.
export function useMotionSetting(): MotionSetting {
  return useSyncExternalStore(subscribeMotion, getMotionSetting, () => 'reduced' as const);
}
