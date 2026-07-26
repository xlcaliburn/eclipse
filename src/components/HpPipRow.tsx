interface HpPipRowProps {
  hp: number; // remaining
  maxHp: number;
  pipCount?: number;
}

// Iteration 10.3: HP as segmented pips under each silhouette, matching the
// forecast bar's "armor pip" treatment (10.1) rather than a smooth bar.
export function HpPipRow({ hp, maxHp, pipCount = 10 }: HpPipRowProps) {
  const fraction = maxHp > 0 ? Math.max(0, hp) / maxHp : 0;
  const lit = Math.round(fraction * pipCount);
  const tier = fraction <= 0 ? 'dead' : fraction < 0.5 ? 'low' : 'ok';
  return (
    <div className="hp-pips">
      {Array.from({ length: pipCount }, (_, i) => (
        <div key={i} className={`hp-pips__pip${i < lit ? ` hp-pips__pip--${tier}` : ''}`} />
      ))}
    </div>
  );
}
