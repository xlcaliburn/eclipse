import {
  incomingFirePreview,
  initCombat,
  openingTargetIndex,
  OUTSPEED_GAP,
  playerOutspeedGap,
  qualifiesForOutspeed,
} from '../game/combatEngine';
import type { FirePreview } from '../game/combatEngine';
import type { CommanderId } from '../game/commanders';
import { getCounterProtocol } from '../game/counterProtocols';
import { fastestInitiative } from '../game/enemies';
import { getEnemyLore } from '../game/enemyLore';
import { getEscalation } from '../game/escalations';
import { hasProtocol } from '../game/protocols';
import type { ProtocolId } from '../game/protocols';
import { deriveFleetForCombat, playerShipLabel } from '../game/ship';
import type { EnemyDef, EnemyGroup, PlayerShipState, ShipStats } from '../game/types';
import { classifyArchetype, EnemySilhouette } from './ShipSilhouette';
import { StatBar } from './StatBar';

interface EnemyPanelProps {
  enemy: EnemyDef;
  fleetStats?: ShipStats[];
  // Iteration 17: only needed to NAME which player ships currently qualify
  // for Outspeed in the readout below — index-matched to fleetStats
  // (both are derived from the same fleet, in the same order).
  fleet?: PlayerShipState[];
  // Iteration 21 (the Admiral, ace pilots): so the opening-volley preview
  // below (which activation fires first, and on whom) reflects a 3+-kill
  // veteran's +1 initiative the same way the real fight will.
  commanderId?: CommanderId;
  // Iteration 28 (Protocols): Overspeed protocols loosens the player's own
  // Outspeed threshold shown below; Alpha doctrine changes the opening
  // volley preview (cannons alongside missiles, shield zeroed).
  protocols?: ProtocolId[];
}

// Flattened index of the first ship in each group, matching the per-side
// indexing initCombat builds — lets a group-shaped render address the
// engine's flat ship indices.
function groupStartIndices(groups: EnemyGroup[]): number[] {
  const starts: number[] = [];
  let n = 0;
  for (const group of groups) {
    starts.push(n);
    n += group.count;
  }
  return starts;
}

// Each point of computer is worth exactly one die face against a given
// shield value — see the hit formula `roll + computer - shield >= 6`. This
// finds the best any-single-ship value in the fleet, since only one ship
// needs to land hits to matter for a kill.
//
// 47.2g: used to be two functions (this one plus shieldPierce added in),
// with a "pierce is carrying the fleet" recommendation branch below reading
// the difference between them. Ship-level `shieldPierce` (types.ts) is a
// documented dormant hook — no part, upgrade, or protocol has ever set it
// nonzero — so the two functions were always identical and the
// recommendation branch could never actually render. Collapsed to one;
// the engine field itself stays (cheap to keep, and the hook is
// deliberate), only the unreachable UI consumer is gone.
function bestComputerInFleet(fleetStats: ShipStats[]): number {
  return fleetStats.reduce((best, s) => Math.max(best, s.computer + (s.shieldPierce ?? 0)), 0);
}

function highestShield(groups: EnemyGroup[]): number {
  return groups.reduce((best, g) => Math.max(best, g.stats.shield), 0);
}

// Replaces the old plain-name header: states what's actually in the fight
// ("Missile swarm ×3") instead of a bare label the icon row below already
// implies by count. Multi-group formations keep just the overall name here
// — each group gets its own labeled sub-heading further down.
function compositionSummary(enemy: EnemyDef): string {
  if (enemy.groups.length === 1 && enemy.groups[0].count > 1) {
    return `${enemy.name} ×${enemy.groups[0].count}`;
  }
  return enemy.name;
}

export function EnemyPanel({ enemy, fleetStats, fleet, commanderId, protocols }: EnemyPanelProps) {
  const enemyShield = highestShield(enemy.groups);
  const requiredComputer = enemyShield + 1;
  const bestComputer = fleetStats ? bestComputerInFleet(fleetStats) : undefined;
  const short = bestComputer !== undefined && bestComputer < requiredComputer;

  // Iteration 17 ("Outspeed"): both directions, right next to the
  // computer/shield readout above — the enemy panel is where the player
  // decides whether to buy drives, so this is where the number belongs.
  const enemyFastest = fastestInitiative(enemy.groups);
  const outspeedGap = playerOutspeedGap(protocols);
  const outspeedThreshold = enemyFastest + outspeedGap;
  const qualifyingPlayerShips =
    fleetStats && fleet
      ? fleetStats
          .map((s, i) => (qualifiesForOutspeed(s.initiative, enemyFastest, outspeedGap) ? playerShipLabel(fleet, i) : null))
          .filter((label): label is string => label !== null)
      : [];
  const playerFastest = fleetStats ? fleetStats.reduce((best, s) => Math.max(best, s.initiative), -Infinity) : undefined;
  const enemyGroupsThatOutspeedPlayer =
    playerFastest !== undefined
      ? enemy.groups.filter((g) => qualifiesForOutspeed(g.stats.initiative, playerFastest))
      : [];

  // Where the fleet's opening dice land, so the formation can point at it
  // instead of the player having to work it out from the stat blocks.
  const targetIndex = openingTargetIndex(enemy);
  const groupStarts = groupStartIndices(enemy.groups);
  const lore = getEnemyLore(enemy.id);

  // Iteration 19 (telegraphs): the mirror of "where your fire opens" — the
  // enemy's own opening volley, computed by building the real initCombat
  // state from the current fleet and running the same preview the combat
  // theater uses. Re-derives on every fleet edit, so re-equipping a lure
  // beacon visibly drags the telegraphed fire onto the taunter before
  // engaging.
  function volleySummary(preview: FirePreview | null) {
    if (!preview || preview.entries.length === 0 || !fleet) return null;
    const dice = preview.entries.reduce((n, e) => n + e.diceCount, 0);
    const damage = preview.entries.reduce((n, e) => n + e.maxDamage, 0);
    const targetNames = [...new Set(preview.entries.map((e) => e.targetIndex))].map((i) => playerShipLabel(fleet, i));
    return { dice, damage, targetNames, flak: preview.flakCancels, outspeed: preview.entries.some((e) => e.outspeed) };
  }
  const previewState =
    fleet && fleet.length > 0
      ? initCombat(deriveFleetForCombat(fleet, commanderId, protocols), enemy, 1, 'weakest', {
          overspeedProtocols: hasProtocol(protocols, 'overspeed-protocols'),
          alphaDoctrine: hasProtocol(protocols, 'alpha-doctrine'),
        })
      : null;
  const missileVolley = volleySummary(previewState ? incomingFirePreview(previewState) : null);
  const cannonVolley = volleySummary(previewState ? incomingFirePreview({ ...previewState, round: 1 }) : null);

  // Outspeed only earns its space when it's live in *this* fight: someone
  // already qualifies either way, or the player is one point of initiative
  // off it — which is actionable here, since parts can still be swapped on
  // this screen. Otherwise the numbers are noise against a fight they'll
  // never apply to.
  const nearlyOutspeeds = playerFastest !== undefined && playerFastest === outspeedThreshold - 1;
  const outspeedRelevant =
    qualifyingPlayerShips.length > 0 || enemyGroupsThatOutspeedPlayer.length > 0 || nearlyOutspeeds;

  return (
    <section className="enemy-panel">
      <p className="enemy-panel__blurb">{compositionSummary(enemy)}</p>
      {lore && <p className="enemy-panel__lore">{lore}</p>}

      {enemy.groups.map((group, i) => (
        <div key={i} className="enemy-panel__group">
          {/* One icon per ship, so a formation reads as a formation — with
              the ship your fire opens on marked. */}
          <div className="enemy-panel__formation">
            {Array.from({ length: group.count }, (_, s) => {
              const isTarget = groupStarts[i] + s === targetIndex;
              return (
                <span
                  key={s}
                  className={`enemy-panel__ship${isTarget ? ' enemy-panel__ship--target' : ''}`}
                  title={isTarget ? 'Your fire opens on this ship' : undefined}
                >
                  <EnemySilhouette archetype={classifyArchetype(enemy.id, group, i)} size={44} />
                </span>
              );
            })}
          </div>
          {enemy.groups.length > 1 && <h3 className="enemy-panel__group-label">{group.label}</h3>}
          {/* The old "N ships per side" line is gone — "per side" described
              nothing the player could act on, and the row of silhouettes
              above already states the count by being that many icons. */}
          {/* Iteration 13: identical stat presentation to the player's side. */}
          <StatBar stats={group.stats} />
        </div>
      ))}

      {/* Iteration 19 (telegraphs): their side of the same story. */}
      {missileVolley && (
        <p className="hint enemy-panel__volley">
          Their missiles: <strong>{missileVolley.dice}</strong> {missileVolley.dice === 1 ? 'die' : 'dice'},
          up to <strong>{missileVolley.damage}</strong> dmg — opening on {missileVolley.targetNames.join(', ')}.
          {missileVolley.flak > 0 &&
            ` Your flak downs the first ${missileVolley.flak} ${missileVolley.flak === 1 ? 'die' : 'dice'}.`}
        </p>
      )}
      {cannonVolley && (
        <p className="hint enemy-panel__volley">
          Their cannons: <strong>{cannonVolley.dice}</strong> {cannonVolley.dice === 1 ? 'die' : 'dice'}/round, up to{' '}
          <strong>{cannonVolley.damage}</strong> dmg — opening on {cannonVolley.targetNames.join(', ')}.
          {cannonVolley.outspeed && ' Includes an Outspeed double strike.'}
        </p>
      )}

      {enemyShield > 0 && (
        <p className={short ? 'warning' : 'hint'}>
          Piloting {enemyShield} — needs computer <strong>{requiredComputer}+</strong> to hit on anything but a
          natural 6.
          {bestComputer !== undefined && ` Your best ship: computer ${bestComputer}.`}
        </p>
      )}

      {/* Iteration 17 ("Outspeed"): both directions, so the enemy panel
          answers "is a drives build worth it here" before the fight, not
          after. Gated on outspeedRelevant — see above. */}
      {outspeedRelevant && (
        <p className="hint">
          Their fastest ship: init {enemyFastest}. Your ships at init <strong>{outspeedThreshold}+</strong> strike
          twice each round.
          {qualifyingPlayerShips.length > 0
            ? ` ${qualifyingPlayerShips.join(', ')} already outspeed them.`
            : nearlyOutspeeds
              ? ' One more point of initiative gets you there.'
              : ''}
        </p>
      )}
      {enemyGroupsThatOutspeedPlayer.map((group) => (
        <p key={group.label} className="warning">
          Their {group.label} (init {group.stats.initiative}) outspeeds your fleet — expect double strikes. Any
          ship at init <strong>{group.stats.initiative - OUTSPEED_GAP + 1}+</strong> denies it.
        </p>
      ))}

      {((enemy.appliedEscalations && enemy.appliedEscalations.length > 0) || !!enemy.veterancyBonus || !!enemy.appliedCounter) && (
        <div className="enemy-panel__escalations">
          {!!enemy.veterancyBonus && (
            <span className="escalation-badge" title="Scales with map depth within the act">
              Veteran: +{enemy.veterancyBonus} HP
            </span>
          )}
          {enemy.appliedEscalations?.map((id) => {
            const esc = getEscalation(id);
            return (
              <span key={id} className="escalation-badge" title={esc.description}>
                {esc.name}
              </span>
            );
          })}
          {/* Iteration 30: the enemy's answer to whatever protocol tier was
              drafted — only-if-it-changed-something honesty, same rule as
              escalations above (appliedCounter is only ever set when
              applyCounterProtocol actually ran). */}
          {enemy.appliedCounter && (
            <span className="escalation-badge" title={getCounterProtocol(enemy.appliedCounter).blurb}>
              Their answer to your protocol: {getCounterProtocol(enemy.appliedCounter).name}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
