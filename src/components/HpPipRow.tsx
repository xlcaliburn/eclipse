interface HpPipRowProps {
  hp: number; // remaining
  maxHp: number;
}

// Iteration 10.3: HP as segmented pips. One pip per point of HP — a 1/3
// ship shows three blocks with one lit, so the row is countable rather
// than a proportional bar you have to eyeball. Wraps in CSS, since a late
// boss can carry 20+ hull.
export function HpPipRow({ hp, maxHp }: HpPipRowProps) {
  const total = Math.max(1, maxHp);
  const lit = Math.max(0, Math.min(hp, total));
  const fraction = lit / total;
  const tier = lit <= 0 ? 'dead' : fraction < 0.5 ? 'low' : 'ok';
  return (
    <div className="hp-pips" title={`HP ${lit}/${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className={`hp-pips__pip${i < lit ? ` hp-pips__pip--${tier}` : ''}`} />
      ))}
    </div>
  );
}
