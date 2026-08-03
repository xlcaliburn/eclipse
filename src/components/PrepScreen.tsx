import { useMemo, useState } from 'react';
import { deriveFleetStats, fleetHasOnlyMissiles, fleetHasWeapon } from '../game/ship';
import { actColumns, CARGO_DESCRIPTION, CARGO_LABEL, getNode } from '../game/map';
import { BOUNTY_BONUS_CREDITS, hasLineOfRetreat } from '../game/reducer';
import type { RunAction } from '../game/reducer';
import type { RunState } from '../game/types';
import { EnemyPanel } from './EnemyPanel';
import { FleetPanel } from './FleetPanel';

interface PrepScreenProps {
  state: RunState;
  dispatch: React.Dispatch<RunAction>;
}

export function PrepScreen({ state, dispatch }: PrepScreenProps) {
  const enemy = state.currentEnemy;
  const [selectedShipIndex, setSelectedShipIndex] = useState(0);
  const safeSelectedIndex = Math.min(selectedShipIndex, state.fleet.length - 1);

  const fleetStats = useMemo(() => deriveFleetStats(state.fleet), [state.fleet]);
  // Iteration 17: the enemy's fastest raw initiative, for the FleetPanel's
  // per-ship Outspeed badge — computed once here rather than duplicated
  // inside FleetPanel, which has no reason to know about EnemyDef shapes.
  const enemyFastestInitiative = enemy
    ? enemy.groups.reduce((best, g) => Math.max(best, g.stats.initiative), -Infinity)
    : undefined;

  const canEngage = fleetHasWeapon(fleetStats);
  const missileOnlyWarning = fleetHasOnlyMissiles(fleetStats);
  const retreatable = hasLineOfRetreat(state);
  const isBountyFight =
    state.activeQuest?.archetype === 'bounty' &&
    !!state.position &&
    state.activeQuest.target.col === state.position.col &&
    state.activeQuest.target.row === state.position.row;
  // 15.1: state it plainly — the same fog rule that lets the starchart show
  // the glyph already means the player is standing on the node, so there's
  // nothing left to hide here.
  const cargo = state.position ? getNode(actColumns(state.map, state.act), state.position).cargo : undefined;

  if (!enemy) return null;

  return (
    <div className="prep-screen">
      {/* Your fleet left, the enemy right — the same side-by-side reading
          order the combat theater uses, so the two screens line up. */}
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
          outspeedFastestEnemyInitiative={enemyFastestInitiative}
        />
      </div>

      {/* Credits/intel live in the persistent HUD bar — no per-screen copy. */}
      <div className="prep-screen__enemy">
        <EnemyPanel enemy={enemy} fleetStats={fleetStats} fleet={state.fleet} />
      </div>

      <div className="prep-screen__center">
        {isBountyFight && (
          <p className="hint">
            Bounty target — win for +{BOUNTY_BONUS_CREDITS} credits and an upgrade pick, on top of the usual reward.
          </p>
        )}
        {cargo && (
          <p className="hint">
            {CARGO_LABEL[cargo]} — {CARGO_DESCRIPTION[cargo]}
          </p>
        )}
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
    </div>
  );
}
