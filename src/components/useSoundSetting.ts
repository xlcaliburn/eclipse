import { useSyncExternalStore } from 'react';
import { getSoundSetting, isSoundOn, subscribeSound } from '../soundPreference';
import type { SoundSetting } from '../soundPreference';

export function useSoundOn(): boolean {
  return useSyncExternalStore(subscribeSound, isSoundOn, () => true);
}

export function useSoundSetting(): SoundSetting {
  return useSyncExternalStore(subscribeSound, getSoundSetting, () => 'on' as const);
}
