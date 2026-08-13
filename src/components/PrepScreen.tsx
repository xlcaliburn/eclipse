import { useMemo } from 'react';
import { playerOutspeedGap, qualifiesForOutspeed } from '../game/combatEngine';
import { fastestInitiative } from '../game/enemies';
import {
  deriveFleetStats,
  deriveStats,
  flagshipMissingRequiredParts,
  fleetHasOnlyMissiles,
  fleetHasWeapon,
  formatStatLine,
  playerShipLabel,
} from '../game/ship';
import { actColumns, CARGO_DESCRIPTION, CARGO_LABEL, getNode } from '../game/map';
import type { RunAction } from '../game/reducer';
import type { RunState } from '../game/types';
import { EnemyPanel } from './EnemyPanel';

interface PrepScreenProps {
  state: RunState;
  dispatch: React.Dispatch<RunAction>;
  // 2026-08-12: equipping is now done exclusively through the Fleet modal
  // (FleetOverlay) — this screen used to embed its own always-open
  // FleetPanel, which meant two different equip experiences depending on
  // where you started from. Opens the same "Your fleet" surface the map/
  // event/HUD Fleet button already use.
  onViewFleet: () => void;
}

export function PrepScreen({ state, dispatch, onViewFleet }: PrepScreenProps) {
  const enemy = state.currentEnemy;

  const fleetStats = useMemo(
    () => deriveFleetStats(state.fleet, state.commanderId, state.protocols),
    [state.fleet, state.commanderId, state.protocols],
  );
  // Iteration 17: the enemy's fastest raw initiative, for the outspeed mark
  // below — identically computed by EnemyPanel right beside it (47.3i).
  const enemyFastestInitiative = enemy ? fastestInitiative(enemy.groups) : undefined;
  const outspeedGap = playerOutspeedGap(state.protocols);

  const missingFlagshipParts = flagshipMissingRequiredParts(state.fleet);
  const canEngage = fleetHasWeapon(fleetStats) && missingFlagshipParts === null;
  const missileOnlyWarning = fleetHasOnlyMissiles(fleetStats);
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
        {/* 2026-08-12: a glance list, not the old always-open blueprint —
            name, stats, and the outspeed mark are the one thing this
            screen needs that the general Fleet modal doesn't know about
            (which enemy you're about to fight); everything else (items,
            power, augments) lives in the modal now. */}
        <div className="prep-fleet-summary">
          {state.fleet.map((ship, shipIndex) => {
            const stats = deriveStats(ship.frameId, ship.equipped, ship.upgrades, state.protocols);
            const outspeeding =
              enemyFastestInitiative !== undefined &&
              qualifiesForOutspeed(stats.initiative, enemyFastestInitiative, outspeedGap);
            return (
              <div key={shipIndex} className="ship-card">
                <div className="ship-card__header">
                  <span className="ship-card__name">
                    {outspeeding && (
                      <span
                        className="combat-ship__outspeed-mark"
                        aria-label="outspeeds the current enemy"
                        title={`Outspeeds this enemy — init ${stats.initiative} vs their fastest ${enemyFastestInitiative}. Strikes twice each round.`}
                      >
                        ⚡×2{' '}
                      </span>
                    )}
                    {playerShipLabel(state.fleet, shipIndex)}
                  </span>
                  <span className="ship-card__stats">{formatStatLine(stats, ship.damage)}</span>
                </div>
              </div>
            );
          })}
        </div>
        <button type="button" className="shop-button" onClick={onViewFleet}>
          Manage fleet
        </button>
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
        <button
          type="button"
          className="engage-button"
          disabled={!canEngage}
          onClick={() => dispatch({ type: 'ENGAGE' })}
        >
          Engage
        </button>
        {!fleetHasWeapon(fleetStats) && <p className="warning">Equip at least one weapon somewhere in the fleet.</p>}
        {/* 2026-08-12: the Flagship needs a computer part and a hull part
            equipped before it can engage — see flagshipMissingRequiredParts's
            own comment for why. Independent of the weapon check above; both
            can show at once if the fleet fails both. */}
        {missingFlagshipParts !== null && (
          <p className="warning">
            The Flagship needs{' '}
            {missingFlagshipParts === 'both' ? 'a computer part and a hull part' : `a ${missingFlagshipParts} part`}{' '}
            equipped.
          </p>
        )}
        {canEngage && missileOnlyWarning && (
          <p className="warning">Missile-only fleet — no cannons for extended fights.</p>
        )}
        {/* 2026-08-12: non-blocking — unlike the two warnings above, having
            spare parts sitting in inventory doesn't stop Engage, it's just
            easy to forget about. Dismissing it records the inventory count
            so it doesn't reappear every visit — only once a genuinely new
            item pushes the count past what was last dismissed. */}
        {state.inventory.length > 0 && state.inventory.length > (state.inventoryWarningDismissedAt ?? 0) && (
          <p className="hint prep-screen__inventory-hint">
            {state.inventory.length} unequipped item{state.inventory.length === 1 ? '' : 's'} in inventory.
            <button
              type="button"
              className="prep-screen__inventory-hint-dismiss"
              onClick={() => dispatch({ type: 'DISMISS_INVENTORY_WARNING' })}
            >
              Dismiss
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
