import { useSyncExternalStore } from 'react';
import { getSoundSetting, subscribeSound } from '../soundPreference';
import type { SoundSetting } from '../soundPreference';

export function useSoundSetting(): SoundSetting {
  return useSyncExternalStore(subscribeSound, getSoundSetting, () => 'on' as const);
}
