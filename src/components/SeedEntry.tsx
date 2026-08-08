import { useState } from 'react';
import { codeToSeed } from '../game/seedCode';

// Iteration 47.2, decision point A: extracted out of LandingScreen so the
// dormant SHOW_SEED_ENTRY flag doesn't keep this feature's state/handler/
// JSX (plus LandingScreen's own onNewRunFromSeed prop, and App.tsx's
// handleNewRunFromSeed all the way up) alive in a component that mostly
// doesn't render it. Flipping the feature back on is still a one-line
// change — SHOW_SEED_ENTRY here instead of in LandingScreen.
//
// 2026-08-08: hidden while seed sharing gets re-evaluated — not a code
// problem, just not ready to advertise on the front door yet.
const SHOW_SEED_ENTRY = false;

interface SeedEntryProps {
  // Iteration 26: Slay-the-Spire-style seed sharing — a run's seed (see
  // seedCode.ts) is a shareable 7-character code; entering someone else's
  // code (or your own from a past run) starts an identical sector: same
  // map, bosses, shops, and events, iteration 9's determinism guarantee.
  onNewRunFromSeed: (seed: number) => void;
}

export function SeedEntry({ onNewRunFromSeed }: SeedEntryProps) {
  const [seedInput, setSeedInput] = useState('');
  const [seedError, setSeedError] = useState(false);

  if (!SHOW_SEED_ENTRY) return null;

  function submitSeed() {
    const seed = codeToSeed(seedInput);
    if (seed === null) {
      setSeedError(true);
      return;
    }
    setSeedError(false);
    onNewRunFromSeed(seed);
  }

  return (
    // Iteration 26 (placeholder + input fixed in 27): replay a specific
    // sector — the same seed always generates the same map, bosses, shops,
    // and events (iteration 9's determinism), so a code shared by another
    // player (or saved from your own past run) reproduces it exactly. No
    // maxLength here — codeToSeed does its own length/range validation,
    // and truncating a pasted code on the way in would just turn a valid
    // code into an invalid one before it's ever checked.
    <div className="landing-screen__seed">
      <label htmlFor="seed-input" className="landing-screen__seed-label">
        Have a run seed? Start that exact sector:
      </label>
      <div className="landing-screen__seed-row">
        <input
          id="seed-input"
          type="text"
          className="landing-screen__seed-input"
          placeholder="e.g. 2K9X4QM"
          value={seedInput}
          onChange={(e) => {
            setSeedInput(e.target.value);
            setSeedError(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitSeed();
          }}
        />
        <button type="button" className="shop-button" onClick={submitSeed} disabled={!seedInput.trim()}>
          Go
        </button>
      </div>
      {seedError && <p className="landing-screen__seed-error">Not a valid seed code — check for typos.</p>}
    </div>
  );
}
