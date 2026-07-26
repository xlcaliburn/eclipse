interface HudBarProps {
  credits: number;
  intel: number;
}

// Iteration 10.6: a persistent top-bar HUD readout, always visible once a
// run's economy is live — additive to (not a replacement for) the existing
// per-screen credit/intel badges.
export function HudBar({ credits, intel }: HudBarProps) {
  return (
    <div className="hud-bar">
      <span className="hud-bar__counter hud-bar__counter--credits">{credits} cr</span>
      <span className="hud-bar__counter hud-bar__counter--intel">{intel} intel</span>
    </div>
  );
}
