interface LandingScreenProps {
  onContinue: () => void;
  onNewRun: () => void;
}

// Iteration 9.2: shown only when a valid save exists at boot — otherwise
// the app skips straight to commander pick/setup as before.
export function LandingScreen({ onContinue, onNewRun }: LandingScreenProps) {
  return (
    <div className="landing-screen">
      <h1>Eclipse Roguelike</h1>
      <p className="hint">A saved run was found.</p>
      <div className="landing-screen__choices">
        <button type="button" className="continue-button" onClick={onContinue}>
          Continue run
        </button>
        <button type="button" className="shop-button" onClick={onNewRun}>
          New run
        </button>
      </div>
    </div>
  );
}
