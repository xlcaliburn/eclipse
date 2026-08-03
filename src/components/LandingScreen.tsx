import { useState } from 'react';
import type { DailyRecord } from '../game/persistence';

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
}: LandingScreenProps) {
  const [copied, setCopied] = useState(false);

  function copyResult() {
    if (!dailyResult?.shareText) return;
    navigator.clipboard
      ?.writeText(dailyResult.shareText)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  }

  return (
    <div className="landing-screen">
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
