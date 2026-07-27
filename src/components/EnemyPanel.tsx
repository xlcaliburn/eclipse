import { openingTargetIndex } from '../game/combatEngine';
import { getEscalation } from '../game/escalations';
import type { EnemyDef, EnemyGroup, ShipStats } from '../game/types';
import { classifyArchetype, EnemySilhouette } from './ShipSilhouette';

interface EnemyPanelProps {
  enemy: EnemyDef;
  fleetStats?: ShipStats[];
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

function weaponSummary(stats: ShipStats): string[] {
  const lines: string[] = [];
  for (const w of stats.missiles) {
    lines.push(`${w.diceCount}× missile (${w.damage} dmg)`);
  }
  for (const w of stats.cannons) {
    lines.push(`${w.diceCount}× cannon (${w.damage} dmg)`);
  }
  return lines;
}

// Each point of computer (or shield-piercing) is worth exactly one die face
// against a given shield value — see the hit formula
// `roll + computer - shield >= 6`. This finds the best any-single-ship value
// in the fleet, since only one ship needs to land hits to matter for a kill.
function bestEffectiveComputer(fleetStats: ShipStats[]): number {
  return fleetStats.reduce((best, s) => Math.max(best, s.computer + (s.shieldPierce ?? 0)), 0);
}

// Iteration 8 (8.6): the highest raw computer in the fleet, ignoring
// shield-pierce — used to tell whether pierce is actually carrying the
// fleet's answer to a high-shield wall (like the Void Citadel's shield 5),
// so the readout can recommend it explicitly instead of just reporting a
// combined number that quietly hides the dependency.
function bestRawComputer(fleetStats: ShipStats[]): number {
  return fleetStats.reduce((best, s) => Math.max(best, s.computer), 0);
}

function highestShield(groups: EnemyGroup[]): number {
  return groups.reduce((best, g) => Math.max(best, g.stats.shield), 0);
}

export function EnemyPanel({ enemy, fleetStats }: EnemyPanelProps) {
  const enemyShield = highestShield(enemy.groups);
  const requiredComputer = enemyShield + 1;
  const bestComputer = fleetStats ? bestEffectiveComputer(fleetStats) : undefined;
  const rawComputer = fleetStats ? bestRawComputer(fleetStats) : undefined;
  const short = bestComputer !== undefined && bestComputer < requiredComputer;
  // Raw computer alone doesn't clear the bar — shield pierce is the other
  // tool that does (optics upgrade, the Gauss lance's per-die pierce).
  const pierceRecommended = rawComputer !== undefined && rawComputer < requiredComputer;

  // Where the fleet's opening dice land, so the formation can point at it
  // instead of the player having to work it out from the stat blocks.
  const targetIndex = openingTargetIndex(enemy);
  const groupStarts = groupStartIndices(enemy.groups);
  const totalShips = enemy.groups.reduce((n, g) => n + g.count, 0);

  return (
    <section className="enemy-panel">
      <h2 className="enemy-panel__name">{enemy.name}</h2>
      <p className="enemy-panel__blurb">{enemy.blurb}</p>

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
          <div className="enemy-panel__count">
            {group.count} ship{group.count > 1 ? 's' : ''} per side
          </div>
          <dl className="stat-grid">
            <dt>HP</dt>
            <dd>{group.stats.hp}</dd>
            <dt>Initiative</dt>
            <dd>{group.stats.initiative}</dd>
            <dt>Computer</dt>
            <dd>{group.stats.computer}</dd>
            <dt>Shield</dt>
            <dd>{group.stats.shield}</dd>
          </dl>
          <ul className="weapon-list">
            {weaponSummary(group.stats).map((line, j) => (
              <li key={j}>{line}</li>
            ))}
          </ul>
        </div>
      ))}

      {totalShips > 1 && targetIndex >= 0 && (
        <p className="hint">Highlighted — where your fire opens: the weakest hull first.</p>
      )}

      {enemyShield > 0 && (
        <p className={short ? 'warning' : 'hint'}>
          Shield {enemyShield} — needs computer <strong>{requiredComputer}+</strong>
          {pierceRecommended ? ' — or shield pierce' : ''} to hit on anything but a natural 6.
          {bestComputer !== undefined && ` Your best ship: computer ${bestComputer}.`}
        </p>
      )}

      {((enemy.appliedEscalations && enemy.appliedEscalations.length > 0) || !!enemy.veterancyBonus) && (
        <div className="enemy-panel__escalations">
          {!!enemy.veterancyBonus && (
            <span className="escalation-badge" title="Iteration 8: scales with map depth within the act">
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
        </div>
      )}
    </section>
  );
}
