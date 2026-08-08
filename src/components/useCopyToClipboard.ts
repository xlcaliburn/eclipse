import { useState } from 'react';

// 47.3d: the same copy-to-clipboard handler + `copied` boolean was written
// 4 times by hand (EndScreen's share text AND its seed code, LandingScreen's
// daily result, SettingsScreen's SeedRow) — all four render the identical
// `{copied ? 'Copied!' : '…'}` button label off it. `copy` is a no-op when
// `text` is null/undefined, mirroring each site's own pre-existing guard
// (no dailyShare, no seed).
export function useCopyToClipboard(): [boolean, (text: string | null | undefined) => void] {
  const [copied, setCopied] = useState(false);

  function copy(text: string | null | undefined) {
    if (text === null || text === undefined) return;
    navigator.clipboard
      ?.writeText(text)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  }

  return [copied, copy];
}
