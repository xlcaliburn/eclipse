import type { RefObject } from 'react';
import type { CombatEvent, EnemyDef } from '../game/types';
import { describeEvent, eventClassName } from './combatLogText';

// 47.4.1: the play-by-play list itself, extracted out of CombatScreen.
// Open by default — the log is the fight, not an appendix. React only
// patches `open` when the prop itself changes, so collapsing it by hand
// survives the re-render on every revealed event.
interface CombatLogProps {
  visibleLog: CombatEvent[];
  enemy: EnemyDef;
  playerLabels: string[];
  logRef: RefObject<HTMLOListElement | null>;
}

export function CombatLog({ visibleLog, enemy, playerLabels, logRef }: CombatLogProps) {
  return (
    <details className="combat-log" open>
      <summary>Play-by-play</summary>
      <ol className="combat-log__list" ref={logRef}>
        {visibleLog.map((event, i) => {
          const text = describeEvent(event, enemy, playerLabels);
          if (!text) return null;
          return (
            <li key={i} className={eventClassName(event)}>
              {text}
            </li>
          );
        })}
      </ol>
    </details>
  );
}
