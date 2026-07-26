import { useMemo, useState } from 'react';
import { forecastWinRate } from '../game/forecast';
import { deriveFleetStats, fleetHasOnlyMissiles, fleetHasWeapon } from '../game/ship';
import { BOUNTY_BONUS_CREDITS, hasLineOfRetreat } from '../game/reducer';
import type { RunAction } from '../game/reducer';
import type { RunState } from '../game/types';
import { EnemyPanel } from './EnemyPanel';
import { FleetPanel } from './FleetPanel';
import { ForecastBar } from './ForecastBar';

interface PrepScreenProps {
  state: RunState;
  dispatch: React.Dispatch<RunAction>;
}

export function PrepScreen({ state, dispatch }: PrepScreenProps) {
  const enemy = state.currentEnemy;
  const [selectedShipIndex, setSelectedShipIndex] = useState(0);
  const safeSelectedIndex = Math.min(selectedShipIndex, state.fleet.length - 1);

  const fleetStats = useMemo(() => deriveFleetStats(state.fleet), [state.fleet]);
  // 9.4: both stances' win rates, so the readout itself teaches what the
  // doctrine is for — against a screened formation the two numbers diverge.
  const weakestWinRate = useMemo(
    () => (enemy ? forecastWinRate(state.fleet, enemy, undefined, 'weakest') : 0),
    [state.fleet, enemy],
  );
  const strongestWinRate = useMemo(
    () => (enemy ? forecastWinRate(state.fleet, enemy, undefined, 'strongest') : 0),
    [state.fleet, enemy],
  );

  const canEngage = fleetHasWeapon(fleetStats);
  const missileOnlyWarning = fleetHasOnlyMissiles(fleetStats);
  const retreatable = hasLineOfRetreat(state);
  const isBountyFight =
    state.activeQuest?.archetype === 'bounty' &&
    !!state.position &&
    state.activeQuest.target.col === state.position.col &&
    state.activeQuest.target.row === state.position.row;

  if (!enemy) return null;

  return (
    <div className="prep-screen">
      <div className="prep-screen__enemy">
        <EnemyPanel enemy={enemy} fleetStats={fleetStats} />
        <div className="credits-badge credits-badge--floating">{state.credits} credits banked</div>
        <div className="credits-badge credits-badge--floating credits-badge--intel">{state.intel} intel banked</div>
      </div>

      <div className="prep-screen__center">
        {isBountyFight && (
          <p className="hint">
            Bounty target — win for +{BOUNTY_BONUS_CREDITS} credits and an upgrade pick, on top of the usual reward.
          </p>
        )}
        <div className="prep-screen__stances">
          <ForecastBar label="Focus weakest" winRate={weakestWinRate} active={state.targetingStance === 'weakest'} />
          <ForecastBar
            label="Focus strongest"
            winRate={strongestWinRate}
            active={state.targetingStance === 'strongest'}
          />
        </div>
        <div className="prep-screen__stance-picker">
          <button
            type="button"
            className={`shop-button${state.targetingStance === 'weakest' ? ' shop-button--active' : ''}`}
            onClick={() => dispatch({ type: 'SET_TARGETING_STANCE', stance: 'weakest' })}
          >
            Focus weakest
          </button>
          <button
            type="button"
            className={`shop-button${state.targetingStance === 'strongest' ? ' shop-button--active' : ''}`}
            onClick={() => dispatch({ type: 'SET_TARGETING_STANCE', stance: 'strongest' })}
          >
            Focus strongest
          </button>
        </div>
        <p className="hint">Forecast excludes reaction cards — they're your edge over the odds.</p>
        <p className={retreatable ? 'hint' : 'warning'}>
          Line of retreat: <strong>{retreatable ? 'yes' : 'no'}</strong>
          {!retreatable && ' — you must finish this fight once it starts.'}
        </p>
        <button
          type="button"
          className="engage-button"
          disabled={!canEngage}
          onClick={() => dispatch({ type: 'ENGAGE' })}
        >
          Engage
        </button>
        {!canEngage && <p className="warning">Equip at least one weapon somewhere in the fleet.</p>}
        {canEngage && missileOnlyWarning && (
          <p className="warning">Missile-only fleet — no cannons for extended fights.</p>
        )}
      </div>

      <div className="prep-screen__blueprint">
        <FleetPanel
          fleet={state.fleet}
          inventory={state.inventory}
          selectedShipIndex={safeSelectedIndex}
          onSelectShip={setSelectedShipIndex}
          onEquip={(shipIndex, partId) => dispatch({ type: 'EQUIP', shipIndex, partId })}
          onUnequip={(shipIndex, partId) => dispatch({ type: 'UNEQUIP', shipIndex, partId })}
          cargoCarrierIndex={
            state.activeQuest?.archetype === 'delivery' ? state.activeQuest.carrierShipIndex : undefined
          }
          onMoveCargoPod={(toShipIndex) => dispatch({ type: 'MOVE_CARGO_POD', toShipIndex })}
        />
      </div>
    </div>
  );
}
