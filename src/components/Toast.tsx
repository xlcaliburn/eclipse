import { useEffect, useState } from 'react';

// 2026-08-08: lightweight purchase/install feedback — "bought X", "fused Y
// into Z" — anything that changes state via a shop action but previously
// had no visible confirmation beyond the state just... changing. Local
// component state only, never RunState: a toast is presentation, not game
// state, and baking it into RunState would need to reason about it for
// save/reload and determinism for no reason at all.
export interface ToastMessage {
  id: number;
  text: string;
}

const TOAST_DURATION_MS = 2600;

export function Toast({ toast }: { toast: ToastMessage | null }) {
  const [visible, setVisible] = useState<ToastMessage | null>(null);

  useEffect(() => {
    if (!toast) return;
    setVisible(toast);
    const timer = setTimeout(() => setVisible(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
    // Keyed on toast.id, not the object itself — dispatching the exact same
    // message text twice in a row (e.g. two Ion cannon buys back to back)
    // still needs to reset the dismiss timer and replay the entrance, which
    // a same-text object comparison would miss.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast?.id]);

  if (!visible) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      {visible.text}
    </div>
  );
}
