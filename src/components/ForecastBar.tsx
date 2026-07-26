interface ForecastBarProps {
  winRate: number; // 0-100
  label?: string; // iteration 9.4 — e.g. "Focus weakest" when showing per-stance readouts
  active?: boolean; // highlights this bar as the fleet's current stance
}

const PIP_COUNT = 20; // iteration 10.1: segmented "armor pip" bar, 5% per pip

function tier(winRate: number): 'low' | 'mid' | 'high' {
  if (winRate < 40) return 'low';
  if (winRate <= 70) return 'mid';
  return 'high';
}

export function ForecastBar({ winRate, label, active }: ForecastBarProps) {
  const t = tier(winRate);
  const litPips = Math.round((winRate / 100) * PIP_COUNT);
  return (
    <div className={`forecast${active ? ' forecast--active' : ''}`}>
      <div className="forecast__label">
        {label ? `${label}: ` : 'Forecast win chance: '}
        <strong>{winRate}%</strong>
        {active && ' (current)'}
      </div>
      <div className="forecast__track">
        {Array.from({ length: PIP_COUNT }, (_, i) => (
          <div key={i} className={`forecast__pip${i < litPips ? ` forecast__pip--${t}` : ''}`} />
        ))}
      </div>
    </div>
  );
}
