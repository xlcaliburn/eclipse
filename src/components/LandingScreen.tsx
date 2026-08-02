interface LandingScreenProps {
  hasSave: boolean;
  onContinue: () => void;
  onNewRun: () => void;
}

// Shown at every boot, whether or not a save exists (previously this only
// appeared for returning players — a brand-new player got no context at all
// and landed straight on commander pick). `hasSave` decides which buttons
// show; the pitch paragraph is the same either way.
export function LandingScreen({ hasSave, onContinue, onNewRun }: LandingScreenProps) {
  return (
    <div className="landing-screen">
      <h1>Eclipse Roguelike</h1>
      <p className="landing-screen__pitch">
        Command a small fleet through a two-act star sector. Fit your ships,
        fight enemy formations in transparent dice combat, and choose your
        route between fights, trade stations, and unknown signals — every
        stop costs something. Reach the sector's boss before your hull runs
        out.
      </p>
      {hasSave && <p className="hint">A saved run was found.</p>}
      <div className="landing-screen__choices">
        {hasSave && (
          <button type="button" className="continue-button" onClick={onContinue}>
            Continue run
          </button>
        )}
        <button type="button" className={hasSave ? 'shop-button' : 'continue-button'} onClick={onNewRun}>
          {hasSave ? 'New run' : 'Start run'}
        </button>
      </div>
    </div>
  );
}
