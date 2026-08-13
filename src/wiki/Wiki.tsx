// The player wiki: a reference page for playtesters, rendered ENTIRELY from
// the live game data modules — every table below imports the same arrays the
// game itself plays from, so a balance retune in enemies.ts or parts.ts shows
// up here on the next build with no manual upkeep. Prose is kept to rules the
// data can't express (the hit formula, phase order); anything that could
// drift is computed, not written.
import { CONVERGENCE_ONSET_ROUND, convergenceBonus, OUTSPEED_GAP } from '../game/combatEngine';
import { COMMANDERS } from '../game/commanders';
import { COUNTER_PROTOCOLS } from '../game/counterProtocols';
import type { CounterProtocolDef } from '../game/counterProtocols';
import {
  BOSS_IDS,
  BOSSES,
  EASY_POOL,
  EASY_POOL_ACT2,
  FINAL_BOSS_IDS,
  FINAL_BOSSES,
  HARD_POOL,
  HARD_POOL_ACT2,
  MID_POOL,
  MID_POOL_ACT2,
  OPENER,
  veterancyBonus,
} from '../game/enemies';
import { getEnemyLore } from '../game/enemyLore';
import { ESCALATIONS } from '../game/escalations';
import { EVENTS } from '../game/events';
import { FRAMES, MAX_FLEET_SIZE, PURCHASABLE_FRAME_IDS } from '../game/frames';
import { heatTier, MAX_HEAT } from '../game/heat';
import { PARTS } from '../game/parts';
import { PROTOCOLS } from '../game/protocols';
import type { ProtocolDef } from '../game/protocols';
import { effectiveSlotLayout, weaponCeiling } from '../game/ship';
import { UPGRADES } from '../game/upgrades';
import type { EnemyDef, Part, Rarity, WeaponStats } from '../game/types';
// Reused straight from the game's own presentation layer — same code-
// authored inline-SVG ship/enemy art and commander crests the game itself
// renders, so the wiki never needs its own art asset pipeline or drifts
// from what a playtester actually sees in a run.
import { CommanderCrest } from '../components/CommanderCrest';
import { classifyArchetype, EnemySilhouette, FrameSilhouette } from '../components/ShipSilhouette';
import { SlotRow } from '../components/SlotRow';

// ---------------------------------------------------------------------------
// Formatting helpers — the display vocabulary matches the game's UI
// (iteration 29: the `shield` stat reads "Piloting" everywhere).

function weaponText(w: WeaponStats, kind: 'cannon' | 'missile'): string {
  const dice = `${w.diceCount} ${kind} ${w.diceCount === 1 ? 'die' : 'dice'} × ${w.damage} dmg`;
  const notes: string[] = [];
  if (w.shieldPierce) notes.push(`pierces ${w.shieldPierce} piloting`);
  if (w.selfDamageOnNatOne) notes.push(`natural 1 backfires for ${w.selfDamageOnNatOne}`);
  if (w.aoeDamage) notes.push(`on hit: ${w.aoeDamage} dmg to every ship`);
  if (w.targetHighest) notes.push('targets highest HP');
  return notes.length > 0 ? `${dice} (${notes.join('; ')})` : dice;
}

function totalHp(enemy: EnemyDef): number {
  return enemy.groups.reduce((sum, g) => sum + g.stats.hp * g.count, 0);
}

// ---------------------------------------------------------------------------
// Building blocks

function EnemyCard({ enemy, tag }: { enemy: EnemyDef; tag?: string }) {
  const lore = getEnemyLore(enemy.id);
  // Same heuristic the combat theater itself uses to pick a silhouette —
  // group 0 is always the centerpiece (enemies.ts's own convention), so
  // this reads as the same ship a player would see fighting it.
  const archetype = classifyArchetype(enemy.id, enemy.groups[0], 0);
  return (
    <article className="wiki-enemy">
      <div className="wiki-enemy__art">
        <EnemySilhouette archetype={archetype} size={40} />
      </div>
      <h4>
        {enemy.name}
        {tag && <span className="wiki-tag">{tag}</span>}
        <span className="wiki-enemy__hp">{totalHp(enemy)} total HP</span>
      </h4>
      <p className="wiki-enemy__blurb">{enemy.blurb}</p>
      {lore && <p className="wiki-enemy__lore">{lore}</p>}
      <ul className="wiki-enemy__groups">
        {enemy.groups.map((g) => (
          <li key={g.label}>
            <strong>
              {g.count} × {g.label}
            </strong>{' '}
            — HP {g.stats.hp} · INIT {g.stats.initiative} · COMP {g.stats.computer} · PLT {g.stats.shield}
            {g.stats.flak ? ` · FLAK ${g.stats.flak}` : ''}
            <ul>
              {g.stats.missiles.map((w, i) => (
                <li key={`m${i}`}>{weaponText(w, 'missile')}</li>
              ))}
              {g.stats.cannons.map((w, i) => (
                <li key={`c${i}`}>{weaponText(w, 'cannon')}</li>
              ))}
              {g.stats.missiles.length === 0 && g.stats.cannons.length === 0 && <li>unarmed</li>}
            </ul>
          </li>
        ))}
      </ul>
    </article>
  );
}

function EnemyPool({ title, note, enemies }: { title: string; note?: string; enemies: EnemyDef[] }) {
  return (
    <div className="wiki-pool">
      <h3>{title}</h3>
      {note && <p className="wiki-note">{note}</p>}
      <div className="wiki-enemy-grid">
        {enemies.map((e) => (
          <EnemyCard key={e.id} enemy={e} />
        ))}
      </div>
    </div>
  );
}

// Iteration 34 (mobile responsiveness pass): every table on the page is
// wide enough (7 columns for Hulls, 10+ for the veterancy scaling table)
// to overflow a phone viewport. Rather than shrink text until it's
// unreadable, each table gets its own horizontally-scrollable lane — the
// standard responsive-table pattern — so the page itself never scrolls
// sideways; only the table does, and only if it needs to.
function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="wiki-table-wrap">{children}</div>;
}

// Iteration 39: every rarity-bearing table on the page sorts ascending by
// this order (common -> legendary) — a player scanning for "what's the good
// stuff" reads top-to-bottom the same way everywhere.
const RARITY_ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

function byRarity<T extends { rarity: Rarity }>(items: T[]): T[] {
  return [...items].sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity));
}

function PartsTable({ parts }: { parts: Part[] }) {
  const sorted = byRarity(parts);
  return (
    <TableWrap>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Part</th>
            <th>Rarity</th>
            <th>Cost</th>
            <th>Power</th>
            <th>Effect</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.id}>
              <td>
                {p.name}
                {p.active && <span className="wiki-tag">active</span>}
              </td>
              <td>
                <span className={`wiki-rarity wiki-rarity--${p.rarity}`}>{p.rarity}</span>
              </td>
              <td className="wiki-num">{p.cost}cr</td>
              {/* Iteration 57.1: rarity-derived (common 1 / rare 2 / epic 3
                  / legendary 4) — shown alongside cost, same pairing
                  PartCard uses in the shop. Iteration 58.2: a reactor
                  GENERATES rather than draws (its own `power` is an
                  explicit 0 override) — shown as "+N" here too, same
                  distinction PartCard's price row makes. */}
              <td className="wiki-num">{p.type === 'reactor' ? `+${p.powerGen}` : p.power}</td>
              <td>{p.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

function ProtocolTable({ defs }: { defs: (ProtocolDef | CounterProtocolDef)[] }) {
  const tiers: ('silver' | 'gold' | 'prismatic')[] = ['silver', 'gold', 'prismatic'];
  return (
    <TableWrap>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Tier</th>
            <th>Name</th>
            <th>Effect</th>
          </tr>
        </thead>
        <tbody>
          {tiers.flatMap((tier) =>
            defs
              .filter((p) => p.tier === tier)
              .map((p) => (
                <tr key={p.id}>
                  <td>
                    <span className={`wiki-tier wiki-tier--${tier}`}>{tier}</span>
                  </td>
                  <td>{p.name}</td>
                  <td>
                    {p.blurb}
                    {'cost' in p && p.cost && <em className="wiki-cost"> Cost: {p.cost}</em>}
                  </td>
                </tr>
              )),
          )}
        </tbody>
      </table>
    </TableWrap>
  );
}

// ---------------------------------------------------------------------------

const NAV = [
  ['rules', 'Core rules'],
  ['additional-rules', 'Additional rules'],
  ['parts', 'Parts'],
  ['hulls', 'Hulls'],
  ['upgrades', 'Upgrades'],
  ['commanders', 'Commanders'],
  ['protocols', 'Protocols'],
  ['enemies-act1', 'Act 1 enemies'],
  ['enemies-act2', 'Act 2 enemies'],
  ['bosses', 'Bosses'],
  ['scaling', 'Scaling'],
  ['events', 'Events'],
] as const;

const PART_TYPE_SECTIONS: { title: string; types: Part['type'][] }[] = [
  { title: 'Weapons', types: ['weapon'] },
  { title: 'Computers', types: ['computer'] },
  { title: 'Piloting & defenses', types: ['shield'] },
  { title: 'Hull', types: ['hull'] },
  { title: 'Drives', types: ['drive'] },
  // Iteration 58.2: reactors — the shop's systems stratum, generation not
  // draw (see PartsTable's own comment on the Power column above).
  { title: 'Reactors', types: ['reactor'] },
];

export function Wiki() {
  const veterancyCols = Array.from({ length: 10 }, (_, col) => col);
  return (
    <div className="wiki">
      {/* A sidebar on desktop (sticky, left column via wiki.css's default
          flex layout), a wrapped quick-jump bar at the very top on mobile
          (see wiki.css's max-width:720px override) — one nav, two layouts,
          rather than rendering the link list twice. */}
      <nav className="wiki-sidebar" aria-label="Table of contents">
        {NAV.map(([id, label]) => (
          <a key={id} href={`#${id}`}>
            {label}
          </a>
        ))}
      </nav>

      <div className="wiki-content">
        <header className="wiki-header">
          <h1>Eclipse Roguelike — Player Wiki</h1>
          <p>
            Every number on this page is generated from the game's own data files at build time — it always
            matches the deployed version. Spoilers for everything, on purpose: this exists so playtesters can name
            exactly what felt wrong ("Lance frigate at column 6", "Antimatter cannon is overpriced") instead of
            guessing.
          </p>
          <p>
            <a href="./index.html">← Back to the game</a>
          </p>
        </header>

        <section id="rules">
          <h2>Core rules</h2>
          <p className="wiki-note">
            The mechanics behind every single fight, no exceptions. Situational and build-dependent rules — the
            ones that only come up sometimes — are in{' '}
            <a href="#additional-rules">Additional rules</a> below.
          </p>
          <ul className="wiki-rules">
            <li>
              <strong>Hit rule:</strong> a die hits when <code>roll + computer − target's piloting ≥ 6</code>. A
              natural 6 always hits; a natural 1 always misses. Each point of computer or piloting is worth exactly
              one die face.
            </li>
            <li>
              <strong>Phase order:</strong> every fight opens with one missile phase (all missiles fire once), then
              repeating cannon rounds until one side is destroyed. Within a phase, ships act in initiative order.
            </li>
            <li>
              <strong>Enemy targeting:</strong> by default, enemies shoot your lowest-remaining-HP ship.
            </li>
          </ul>
        </section>

        <section id="additional-rules">
          <h2>Additional rules</h2>
          <p className="wiki-note">
            Mechanics that only apply under specific conditions — a long fight, a particular build, or a specific
            part or upgrade — plus the fleet-building rules that shape what you bring INTO a fight rather than what
            happens during one.
          </p>
          <ul className="wiki-rules">
            <li>
              <strong>Fire-control convergence:</strong> from round {CONVERGENCE_ONSET_ROUND} on, every ship on both
              sides gains a cumulative +1 computer each round (round {CONVERGENCE_ONSET_ROUND} is +{convergenceBonus(CONVERGENCE_ONSET_ROUND)},
              round {CONVERGENCE_ONSET_ROUND + 1} is +{convergenceBonus(CONVERGENCE_ONSET_ROUND + 1)}, and so on,
              uncapped) — a fight that would otherwise stall on bare natural-6 hits converges on a result instead of
              running forever. Only matters once a fight actually runs that long.
            </li>
            <li>
              <strong>Outspeed:</strong> a ship whose initiative beats the fastest surviving enemy by{' '}
              <strong>{OUTSPEED_GAP}+</strong> fires one extra cannons-only activation at the end of each round.
              Works both ways — fast enemies can outspeed you.
            </li>
            <li>
              <strong>Targeting overrides:</strong> Taunt (Lure beacon) forces every enemy die onto the taunting ship,
              overriding the default lowest-HP pick entirely; a cloaked ship can't be targeted at all while a
              non-cloaked ally is still alive.
            </li>
            <li>
              <strong>Power:</strong> every equipped part except a reactor draws power (rarity-derived: common 1 /
              rare 2 / epic 3 / legendary 4); a loadout is legal only while its total draw stays within the hull's
              budget. That budget starts at the hull's own innate generation (the Hulls table's "Power (innate)"
              column) and grows by whatever's equipped in a systems or universal slot from the Reactors section
              below — a reactor is a slot that isn't a gun, not a separate mandatory fitting.
            </li>
            <li>
              <strong>Hull marks:</strong> at a shipyard, a ship (any hull, including the Flagship — mercenaries
              excluded) can be permanently upgraded a mark, I to II to III, each step granting +1 universal slot (no
              extra power — bring a reactor to actually fill it). Priced off the hull's own cost, escalating: mark
              II costs half, mark III three-quarters.
            </li>
            <li>
              <strong>Fleet cap:</strong> {MAX_FLEET_SIZE} ships. Your starting Flagship is the only hull that can
              never be re-bought — protect it (if it dies while the fleet survives, one paid recovery is offered).
            </li>
          </ul>
        </section>

        <section id="parts">
          <h2>Parts — the shop pool</h2>
          <p className="wiki-note">
            Any part can appear in any shop's random offer. Prices below are base; commanders, protocols, and shop
            identity can shift them.
          </p>
          {PART_TYPE_SECTIONS.map(({ title, types }) => (
            <div key={title}>
              <h3>{title}</h3>
              <PartsTable parts={PARTS.filter((p) => types.includes(p.type))} />
            </div>
          ))}
        </section>
  
        <section id="hulls">
          <h2>Hulls — the shipyard pool</h2>
          <TableWrap>
            <table className="wiki-table">
              <thead>
                <tr>
                  <th>Hull</th>
                  <th>Rarity</th>
                  <th>Cost</th>
                  <th>Slots</th>
                  <th>Power (innate)</th>
                  <th>HP</th>
                  <th>INIT</th>
                  <th>Weapon cap</th>
                  <th>Innate</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {[FRAMES.cruiser, ...byRarity(PURCHASABLE_FRAME_IDS.map((id) => FRAMES[id]))].map((f) => {
                  const id = f.id;
                  return (
                    <tr key={f.id}>
                      <td className="wiki-hull-name">
                        <FrameSilhouette frameId={f.id} size={28} />
                        {f.name}
                        {id === 'cruiser' && <span className="wiki-tag">start only</span>}
                      </td>
                      <td className="wiki-nowrap">
                        {id === 'cruiser' ? (
                          '—'
                        ) : (
                          <span className={`wiki-rarity wiki-rarity--${f.rarity}`}>{f.rarity}</span>
                        )}
                      </td>
                      <td className="wiki-num">{f.cost}cr</td>
                      {/* Iteration 52.1: typed slots, not a bare count — the
                          layout itself IS the identity now. `wiki-nowrap`
                          keeps the chip row on one line (see wiki.css's
                          duplicated .slot-row for why it needs a forced
                          `flex-wrap: nowrap` here specifically). */}
                      <td className="wiki-nowrap">
                        <SlotRow layout={f.slotLayout} size={18} />
                      </td>
                      {/* Iteration 57.1: the hull's own power budget — a
                          bare number here (not the pip meter, which reads
                          as "used/budget" for a specific loadout) since
                          there's no specific build to show usage against
                          in a reference table. Iteration 58.1: relabeled
                          "Power (innate)" — this column is now only HALF
                          the story (a reactor in a systems/universal slot
                          adds to it, see the Reactors section and the note
                          below), so the header says so explicitly. */}
                      <td className="wiki-num">{f.power}</td>
                      <td className="wiki-num">{f.baseHp}</td>
                      <td className="wiki-num">{f.baseInitiative}</td>
                      <td className="wiki-num">{weaponCeiling(effectiveSlotLayout(f.id, []))}</td>
                      <td>{f.innate ? `${f.innate.name} — ${f.innate.description}` : '—'}</td>
                      <td>{f.blurb}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        </section>
  
        <section id="upgrades">
          <h2>Upgrades</h2>
          <p className="wiki-note">
            Slotless and permanent, attached to one ship. Lost only if that ship is destroyed. Elites and the
            act-1 boss draw from the same list below, without duplicates.
          </p>
          <TableWrap>
            <table className="wiki-table">
              <tbody>
                {UPGRADES.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </section>

        <section id="commanders">
          <h2>Commanders</h2>
          <p className="wiki-note">Pick 1 of 3 (seeded) at the start of each run.</p>
          <div className="wiki-commander-grid">
            {Object.values(COMMANDERS).map((c) => (
              <article key={c.id} className="wiki-commander">
                <div className="wiki-commander__art">
                  <CommanderCrest commanderId={c.id} size={48} />
                </div>
                <h4>{c.name}</h4>
                <p>{c.description}</p>
              </article>
            ))}
          </div>
        </section>
  
        <section id="protocols">
          <h2>Protocols — the act-1 boss draft</h2>
          <p className="wiki-note">
            After the act-1 boss: draft 1 of 3 offers, always one per tier. Prismatics state a structural cost.
          </p>
          <ProtocolTable defs={Object.values(PROTOCOLS)} />
          <h3>Counter-protocols — the enemy's answer</h3>
          <p className="wiki-note">
            Whatever tier you draft, every act-2 enemy gains a same-tier counter — shown on the draft card before
            you pick.
          </p>
          <ProtocolTable defs={Object.values(COUNTER_PROTOCOLS)} />
        </section>
  
        <section id="enemies-act1">
          <h2>Act 1 enemies</h2>
          <EnemyPool title="The opener (column 0)" enemies={[OPENER]} />
          <EnemyPool title="Easy pool (columns 1–4)" enemies={EASY_POOL} />
          <EnemyPool title="Mid pool (columns 5–7)" enemies={MID_POOL} />
          <EnemyPool title="Hard pool (columns 8–9)" enemies={HARD_POOL} />
        </section>
  
        <section id="enemies-act2">
          <h2>Act 2 enemies</h2>
          <EnemyPool title="Easy pool (columns 1–4)" enemies={EASY_POOL_ACT2} />
          <EnemyPool title="Mid pool (columns 5–7)" enemies={MID_POOL_ACT2} />
          <EnemyPool title="Hard pool (columns 8–9)" enemies={HARD_POOL_ACT2} />
        </section>
  
        <section id="bosses">
          <h2>Bosses</h2>
          <h3>Act 1 — one of three, chosen by your seed</h3>
          <div className="wiki-enemy-grid">
            {BOSS_IDS.map((id) => (
              <EnemyCard key={id} enemy={BOSSES[id]} tag="mid-boss" />
            ))}
          </div>
          <h3>Act 2 — the final boss trio</h3>
          <div className="wiki-enemy-grid">
            {FINAL_BOSS_IDS.map((id) => (
              <EnemyCard key={id} enemy={FINAL_BOSSES[id]} tag="final boss" />
            ))}
          </div>
        </section>
  
        <section id="scaling">
          <h2>How fights scale</h2>
          <ul className="wiki-rules">
            <li>
              <strong>Veterancy</strong> — flat bonus HP on every enemy ship, by column within each act:
              <TableWrap>
                <table className="wiki-table wiki-table--inline">
                  <tbody>
                    <tr>
                      <th>Column</th>
                      {veterancyCols.map((c) => (
                        <td key={c} className="wiki-num">
                          {c}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <th>+HP</th>
                      {veterancyCols.map((c) => (
                        <td key={c} className="wiki-num">
                          {veterancyBonus(c)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </TableWrap>
            </li>
            <li>
              <strong>Escalations</strong> — 4 per run (2 per act, landing after columns 4 and 7), drawn without
              replacement from:{' '}
              {ESCALATIONS.map((e) => `${e.name} (${e.description})`).join('; ')}.
            </li>
            <li>
              <strong>Elites</strong> — pool enemies with +2 HP per ship, carrying an upgrade as the reward.
            </li>
            <li>
              <strong>Heat</strong> — 0–{MAX_HEAT}:{' '}
              {Array.from({ length: MAX_HEAT + 1 }, (_, h) => `${h} ${heatTier(h)}`).join(' · ')}. Higher heat
              means harder ambushes when you linger.
            </li>
          </ul>
        </section>
  
        <section id="events">
          <h2>Events</h2>
          <p className="wiki-note">
            Options shown in brackets need a build or resource to unlock. Outcomes are deterministic from your seed.
          </p>
          <TableWrap>
            <table className="wiki-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Stage</th>
                  <th>Options</th>
                </tr>
              </thead>
              <tbody>
                {EVENTS.map((e) => (
                  <tr key={e.id}>
                    <td>{e.title}</td>
                    <td>{e.stages.join(', ')}</td>
                    <td>
                      <ul className="wiki-options">
                        {e.options.map((o, i) => (
                          <li key={i}>
                            {o.label}
                            {o.reqText && <span className="wiki-req"> [{o.reqText}]</span>}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </section>

        <footer className="wiki-footer">
          <a href="./index.html">← Back to the game</a>
        </footer>
      </div>
    </div>
  );
}
