import { useMemo, useState } from 'react';
import { fastestInitiative } from '../game/enemies';
import { deriveFleetStats, fleetHasOnlyMissiles, fleetHasWeapon } from '../game/ship';
import { actColumns, CARGO_DESCRIPTION, CARGO_LABEL, getNode } from '../game/map';
import { BASE_COMMAND_POINTS, SPYMASTER_COMMAND_POINTS } from '../game/reducer';
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

  const fleetStats = useMemo(
    () => deriveFleetStats(state.fleet, state.commanderId, state.protocols),
    [state.fleet, state.commanderId, state.protocols],
  );
  // Iteration 17: the enemy's fastest raw initiative, for the FleetPanel's
  // per-ship Outspeed badge — FleetPanel has no reason to know about
  // EnemyDef shapes, so this is computed here (and, identically, by
  // EnemyPanel right beside it — see enemies.ts's fastestInitiative, 47.3i).
  const enemyFastestInitiative = enemy ? fastestInitiative(enemy.groups) : undefined;

  const canEngage = fleetHasWeapon(fleetStats);
  const missileOnlyWarning = fleetHasOnlyMissiles(fleetStats);
  // Iteration 48 (fleet orders): a one-line preview so the resource is
  // visible before ENGAGE, not a surprise once the fight opens.
  const commandPoints = state.commanderId === 'spymaster' ? SPYMASTER_COMMAND_POINTS : BASE_COMMAND_POINTS;
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
          outspeedFastestEnemyInitiative={enemyFastestInitiative}
          collapsibleParts
          commanderId={state.commanderId}
          protocols={state.protocols}
          counterProtocol={state.counterProtocol}
        />
      </div>

      {/* Credits/intel live in the persistent HUD bar — no per-screen copy. */}
      <div className="prep-screen__enemy">
        <EnemyPanel
          enemy={enemy}
          fleetStats={fleetStats}
          fleet={state.fleet}
          commanderId={state.commanderId}
          protocols={state.protocols}
        />
      </div>

      <div className="prep-screen__center">
        {/* Patrol carries no modifier — "Standard payout" told the player
            nothing they could act on, so it's the one tag left unstated. */}
        {cargo && cargo !== 'patrol' && (
          <p className="hint">
            {CARGO_LABEL[cargo]} — {CARGO_DESCRIPTION[cargo]}
          </p>
        )}
        <p className="hint">
          Command points: {commandPoints}
          {state.commanderId === 'spymaster' && ' — including Exploit weakness'}
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
