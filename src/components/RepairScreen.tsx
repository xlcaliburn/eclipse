interface RepairScreenProps {
  summary: string;
  onContinue: () => void;
}

export function RepairScreen({ summary, onContinue }: RepairScreenProps) {
  return (
    <div className="repair-screen">
      <h2>Repair yard</h2>
      <p className="hint">{summary}</p>
      <button type="button" className="continue-button" onClick={onContinue}>
        Back to map
      </button>
    </div>
  );
}
