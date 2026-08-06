import { useState } from 'react';
import type { DailyRecord } from '../game/persistence';
import { codeToSeed } from '../game/seedCode';
import { useIsCompact } from './useIsCompact';

// Iteration 25: a phone browser tab is not the same thing as an installed
// app — no offline play, no home-screen icon, no full-screen chrome — even
// though the PWA machinery for all of that has been in place since
// iteration 16.3. Neither mobile OS exposes a one-tap install trigger to a
// web page (iOS Safari has no `beforeinstallprompt` at all; Android Chrome's
// version is real but unreliable enough not to build a whole flow around),
// so this is just the plain-text instructions for both platforms — shown
// once per browser, on phone-width viewports only (`useIsCompact` mirrors
// the same ≤720px breakpoint the rest of the mobile shell uses), and never
// once the page is already running installed.
const INSTALL_HINT_DISMISSED_KEY = 'eclipse.installHintDismissed.v1';

function isRunningInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  // Android/desktop PWAs report this via the standard media query; iOS
  // Safari never matches it and instead sets `navigator.standalone` once
  // launched from a home-screen icon.
  const standaloneMedia = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standaloneMedia || iosStandalone;
}

function wasInstallHintDismissed(): boolean {
  try {
    return localStorage.getItem(INSTALL_HINT_DISMISSED_KEY) === '1';
  } catch {
    return false; // privacy mode / storage disabled — just show it every time rather than crash
  }
}

interface LandingScreenProps {
  hasSave: boolean;
  onContinue: () => void;
  onNewRun: () => void;
  // Iteration 18: the daily run. Exactly one of these three states holds:
  // playable (no attempt today), resumable (started, unfinished, save
  // intact), or finished (result shown, locked until tomorrow).
  dailyDate: string;
  dailyPlayable: boolean;
  dailyResumable: boolean;
  dailyResult: DailyRecord | null;
  onStartDaily: () => void;
  onContinueDaily: () => void;
  onOpenTutorial: () => void;
  // Iteration 26: Slay-the-Spire-style seed sharing — a run's seed (see
  // seedCode.ts) is a shareable 7-character code; entering someone else's
  // code (or your own from a past run) starts an identical sector: same
  // map, bosses, shops, and events, iteration 9's determinism guarantee.
  onNewRunFromSeed: (seed: number) => void;
}

const OUTCOME_LABEL: Record<string, string> = {
  victory: '🏆 Victory',
  defeat: '💥 Defeat',
  abandoned: '🏳️ Abandoned',
};

// Shown at every boot, whether or not a save exists (previously this only
// appeared for returning players — a brand-new player got no context at all
// and landed straight on commander pick). `hasSave` decides which buttons
// show; the pitch paragraph is the same either way.
export function LandingScreen({
  hasSave,
  onContinue,
  onNewRun,
  dailyDate,
  dailyPlayable,
  dailyResumable,
  dailyResult,
  onStartDaily,
  onContinueDaily,
  onOpenTutorial,
  onNewRunFromSeed,
}: LandingScreenProps) {
  const [copied, setCopied] = useState(false);
  const [installHintDismissed, setInstallHintDismissed] = useState(
    () => isRunningInstalled() || wasInstallHintDismissed(),
  );
  const [seedInput, setSeedInput] = useState('');
  const [seedError, setSeedError] = useState(false);
  const isCompact = useIsCompact();

  function submitSeed() {
    const seed = codeToSeed(seedInput);
    if (seed === null) {
      setSeedError(true);
      return;
    }
    setSeedError(false);
    onNewRunFromSeed(seed);
  }

  function copyResult() {
    if (!dailyResult?.shareText) return;
    navigator.clipboard
      ?.writeText(dailyResult.shareText)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  }

  function dismissInstallHint() {
    setInstallHintDismissed(true);
    try {
      localStorage.setItem(INSTALL_HINT_DISMISSED_KEY, '1');
    } catch {
      // privacy mode / storage disabled — the dismissal just won't stick between visits
    }
  }

  return (
    <div className="landing-screen">
      {isCompact && !installHintDismissed && (
        <div className="install-hint">
          <button
            type="button"
            className="install-hint__dismiss"
            onClick={dismissInstallHint}
            aria-label="Dismiss install instructions"
          >
            ×
          </button>
          <p className="install-hint__title">📱 Play as an app — works offline, no browser chrome</p>
          <p className="install-hint__body">
            <strong>iPhone/iPad:</strong> tap Share <span aria-hidden="true">⬆️</span>, then "Add to Home Screen".
            <br />
            <strong>Android:</strong> tap the menu <span aria-hidden="true">⋮</span>, then "Install app" (or "Add to
            Home screen").
          </p>
        </div>
      )}
      <h1>Eclipse Roguelike</h1>
      <p className="landing-screen__pitch">
        Command a small fleet through a two-act star sector. Fit your ships,
        fight enemy formations in transparent dice combat, and choose your
        route between fights, trade stations, and unknown signals — every
        stop costs something. Reach the sector's boss before your hull runs
        out.
      </p>
      {hasSave && <p className="hint">A saved run was found.</p>}
      <div className="landing-screen__choices">
        {hasSave && (
          <button type="button" className="continue-button" onClick={onContinue}>
            Continue run
          </button>
        )}
        <button type="button" className={hasSave ? 'shop-button' : 'continue-button'} onClick={onNewRun}>
          {hasSave ? 'New run' : 'Start run'}
        </button>
      </div>
      <button type="button" className="landing-screen__tutorial-link" onClick={onOpenTutorial}>
        How to play — dice, computers, shields
      </button>

      {/* Iteration 26 (placeholder + input fixed in 27): replay a specific
          sector — the same seed always generates the same map, bosses,
          shops, and events (iteration 9's determinism), so a code shared by
          another player (or saved from your own past run) reproduces it
          exactly. No maxLength here — codeToSeed does its own length/range
          validation, and truncating a pasted code on the way in would just
          turn a valid code into an invalid one before it's ever checked. */}
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

      {/* Iteration 18: the daily — same sector for everyone today, one
          attempt. Starting it consumes the attempt even if abandoned. */}
      <div className="landing-screen__daily">
        <h2 className="landing-screen__daily-title">Daily run — {dailyDate}</h2>
        {dailyPlayable && (
          <>
            <p className="hint">
              One attempt. Everyone flying today gets the identical sector — same map, same enemies, same
              shops. Only your choices differ.
            </p>
            <button type="button" className="continue-button" onClick={onStartDaily}>
              Fly today's daily
            </button>
          </>
        )}
        {dailyResumable && (
          <button type="button" className="continue-button" onClick={onContinueDaily}>
            Continue today's daily
          </button>
        )}
        {!dailyPlayable && !dailyResumable && !dailyResult?.outcome && (
          <p className="hint">Today's attempt is already underway or lost — back tomorrow.</p>
        )}
        {dailyResult?.outcome && (
          <div className="landing-screen__daily-result">
            <p>{OUTCOME_LABEL[dailyResult.outcome] ?? dailyResult.outcome} — come back tomorrow for a new sector.</p>
            {dailyResult.shareText && (
              <>
                <pre className="daily-share">{dailyResult.shareText}</pre>
                <button type="button" className="shop-button" onClick={copyResult}>
                  {copied ? 'Copied!' : 'Copy result'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
