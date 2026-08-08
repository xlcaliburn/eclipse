import type { ReactNode } from 'react';

// 47.3g: the mobile-tab / desktop-modal shell pattern was hand-duplicated
// in two places — FleetOverlay.tsx (FleetOverlay/FleetScreen) and
// SettingsScreen.tsx (SettingsOverlay/SettingsScreen) — both with the
// exact same two shapes: a compact full-screen panel with a "Back" button
// in a screen-header, or a desktop modal-backdrop/modal-panel with a
// "Close" button at the bottom. `screenClassName` is the one thing that
// actually differed between the two (`fleet-screen` vs `settings-screen`
// — same CSS rules, grouped together in styles.css, just named per
// screen for any screen-specific rules layered on top).
interface AdaptivePanelProps {
  title: string;
  isCompact: boolean;
  screenClassName: string;
  onClose?: () => void;
  children: ReactNode;
}

export function AdaptivePanel({ title, isCompact, screenClassName, onClose, children }: AdaptivePanelProps) {
  if (isCompact) {
    return (
      <div className={screenClassName}>
        <div className="screen-header">
          <h2>{title}</h2>
          {onClose && (
            <button type="button" className="shop-button" onClick={onClose}>
              Back
            </button>
          )}
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-panel__header">
          <h2>{title}</h2>
        </div>
        {children}
        {onClose && (
          <button type="button" className="continue-button" onClick={onClose}>
            Close
          </button>
        )}
      </div>
    </div>
  );
}
