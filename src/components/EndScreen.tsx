import { useState } from 'react';
import { playerShipLabel } from '../game/ship';
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
  onNewRun,
}: EndScreenProps) {
  const won = outcome === 'victory';
  const [copied, setCopied] = useState(false);

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

      <button type="button" className="continue-button" onClick={onNewRun}>
        New run
      </button>
    </div>
  );
}
