import type { CSSProperties } from 'react';
import type { Side } from '../game/types';
import { DieFace } from './Die';

// Iteration 12.2: transient combat-theater visuals. Each FxItem is spawned
// by CombatScreen when the replay reveals an event, positioned from the
// *measured* centers of the ship cards involved, and removed on a timer.
// Pure presentation: nothing here reads engine state.

export type FxItem =
  | { key: number; kind: 'tracer'; x1: number; y1: number; x2: number; y2: number; side: Side; missile: boolean; veer: boolean }
  | { key: number; kind: 'ripple'; x: number; y: number }
  | { key: number; kind: 'shards'; x: number; y: number }
  | { key: number; kind: 'die'; x: number; y: number; raw: number; hit: boolean }
  | { key: number; kind: 'banner'; text: string };

// Omit that distributes over the union, so spawn-site literals keep their
// per-kind field checking (a plain Omit collapses the discriminated union).
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type FxSpawn = DistributiveOmit<FxItem, 'key'>;

function tracerPath(fx: Extract<FxItem, { kind: 'tracer' }>): { d: string; approxLen: number } {
  const dx = fx.x2 - fx.x1;
  const dy = fx.y2 - fx.y1;
  const dist = Math.hypot(dx, dy);
  if (fx.missile) {
    // Arced missile flight: control point lifted above the midpoint.
    const mx = (fx.x1 + fx.x2) / 2;
    const my = (fx.y1 + fx.y2) / 2 - Math.min(90, dist * 0.35);
    return { d: `M ${fx.x1} ${fx.y1} Q ${mx} ${my} ${fx.x2} ${fx.y2}`, approxLen: dist * 1.2 };
  }
  return { d: `M ${fx.x1} ${fx.y1} L ${fx.x2} ${fx.y2}`, approxLen: dist };
}

export function TheaterFxLayer({ fx }: { fx: FxItem[] }) {
  if (fx.length === 0) return null;
  return (
    <>
      <svg className="theater-fx" aria-hidden="true">
        {fx.map((item) => {
          if (item.kind === 'tracer') {
            const { d, approxLen } = tracerPath(item);
            const cls = [
              'fx-tracer',
              item.side === 'player' ? 'fx-tracer--player' : 'fx-tracer--enemy',
              item.missile ? 'fx-tracer--missile' : '',
              item.veer ? 'fx-tracer--veer' : '',
            ]
              .filter(Boolean)
              .join(' ');
            const style = { '--fx-len': `${approxLen}px`, strokeDasharray: `${approxLen}px` } as CSSProperties;
            return <path key={item.key} className={cls} d={d} style={style} />;
          }
          if (item.kind === 'ripple') {
            return <circle key={item.key} className="fx-ripple" cx={item.x} cy={item.y} r={10} />;
          }
          if (item.kind === 'shards') {
            return (
              <g key={item.key} transform={`translate(${item.x} ${item.y})`}>
                <polygon className="fx-shard fx-shard--left" points="-4,-18 6,0 -10,14" />
                <polygon className="fx-shard fx-shard--right" points="8,-12 16,6 -2,16" />
                <circle className="fx-blast" cx={0} cy={0} r={6} />
              </g>
            );
          }
          return null;
        })}
      </svg>
      {fx.map((item) => {
        if (item.kind === 'die') {
          return (
            <span
              key={item.key}
              className={`fx-die ${item.hit ? 'fx-die--hit' : 'fx-die--miss'}`}
              style={{ left: item.x, top: item.y }}
            >
              <DieFace value={item.raw} size={26} />
            </span>
          );
        }
        if (item.kind === 'banner') {
          return (
            <div key={item.key} className="fx-banner">
              {item.text}
            </div>
          );
        }
        return null;
      })}
    </>
  );
}
