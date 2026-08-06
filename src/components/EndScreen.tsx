import { useEffect, useState } from 'react';
import { playSfx } from '../audio';
import { playerShipLabel } from '../game/ship';
import { seedToCode } from '../game/seedCode';
import type { PlayerShipState, RunStats } from '../game/types';
import { FrameSilhouette } from './ShipSilhouette';

interface EndScreenProps {
  outcome: 'victory' | 'defeat';
  column: number;
  act: 1 | 2;
  credits: number;
  visitedCount: number;
  fleet: PlayerShipState[];
  // Iteration 18: the run's cumulative record (optional — a resumed pre-18
  // save has none) and, for dailies, the copyable result.
  runStats?: RunStats;
  dailyShare?: string;
  // Iteration 27: the run's seed, so a loss (the moment a player most wants
  // to "run it back") can be replayed exactly — null for a daily run, same
  // suppression reasoning as SettingsScreen's SeedRow (today's seed is
  // shared by every player attempting today's daily; surfacing it here
  // would let a defeated player peek at it before a possible second visit
  // to the landing screen's daily section).
  seed: number | null;
  onNewRun: () => void;
}

export function EndScreen({
  outcome,
  column,
  act,
  credits,
  visitedCount,
  fleet,
  runStats,
  dailyShare,
  seed,
  onNewRun,
}: EndScreenProps) {
  const won = outcome === 'victory';
  const [copied, setCopied] = useState(false);
  const [seedCopied, setSeedCopied] = useState(false);

  // Once per mount — this screen only ever renders once per run's end, so
  // there's no risk of the cue re-firing on an unrelated re-render.
  useEffect(() => {
    playSfx(won ? 'victory' : 'defeat');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- fires exactly once, on mount

  // The run's most decorated surviving hull — no MVP line when nothing
  // survived or nobody scored a kill.
  const mvpIndex = fleet.reduce(
    (best, ship, i) => ((ship.kills ?? 0) > (fleet[best]?.kills ?? 0) ? i : best),
    0,
  );
  const mvp = (fleet[mvpIndex]?.kills ?? 0) > 0 ? fleet[mvpIndex] : undefined;

  function copyShare() {
    if (!dailyShare) return;
    navigator.clipboard
      ?.writeText(dailyShare)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  }

  function copySeed() {
    if (seed === null) return;
    navigator.clipboard
      ?.writeText(seedToCode(seed))
      .then(() => setSeedCopied(true))
      .catch(() => setSeedCopied(false));
  }

  return (
    <div className={`end-screen${won ? ' end-screen--victory' : ' end-screen--defeat'}`}>
      <h2 className={won ? 'verdict verdict--win' : 'verdict verdict--loss'}>
        {won ? 'Victory' : 'Defeat'}
      </h2>
      <p>
        {won
          ? 'The final boss falls — the long war is won.'
          : `Your fleet was destroyed in act ${act}, column ${column + 1}.`}
      </p>

      {won && (
        <div className="end-screen__fleet">
          {fleet.map((ship, i) => (
            <FrameSilhouette key={i} frameId={ship.frameId} size={64} />
          ))}
        </div>
      )}

      <dl className="end-screen__stats stat-grid">
        <dt>Systems explored</dt>
        <dd>{visitedCount}</dd>
        <dt>Credits</dt>
        <dd>{credits}</dd>
        <dt>Ships remaining</dt>
        <dd>{fleet.length}</dd>
        {runStats && (
          <>
            <dt>Fights won</dt>
            <dd>{runStats.fightsWon}</dd>
            {runStats.fightsWithdrawn > 0 && (
              <>
                <dt>Withdrawals</dt>
                <dd>{runStats.fightsWithdrawn}</dd>
              </>
            )}
            <dt>Damage dealt / taken</dt>
            <dd>
              {runStats.damageDealt} / {runStats.damageTaken}
            </dd>
            {runStats.shipsLost.length > 0 && (
              <>
                <dt>Ships lost</dt>
                <dd>{runStats.shipsLost.join(', ')}</dd>
              </>
            )}
            {mvp && (
              <>
                <dt>Most kills</dt>
                <dd>
                  {playerShipLabel(fleet, mvpIndex)} — {mvp.kills}
                </dd>
              </>
            )}
          </>
        )}
      </dl>

      {dailyShare && (
        <div className="end-screen__daily">
          <pre className="daily-share">{dailyShare}</pre>
          <button type="button" className="shop-button" onClick={copyShare}>
            {copied ? 'Copied!' : 'Copy result'}
          </button>
        </div>
      )}

      {seed !== null && (
        <div className="end-screen__seed">
          <p className="hint">
            {won ? 'Run it back, or hand this sector to someone else:' : 'Want another shot at this exact sector?'}
          </p>
          <p className="settings-row__seed-code">{seedToCode(seed)}</p>
          <button type="button" className="shop-button" onClick={copySeed}>
            {seedCopied ? 'Copied!' : 'Copy seed'}
          </button>
        </div>
      )}

      <button type="button" className="continue-button" onClick={onNewRun}>
        New run
      </button>
    </div>
  );
}
