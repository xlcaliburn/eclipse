import { useSyncExternalStore } from 'react';

// Iteration 16.1: the single JS-level signal for "tab-shell mode" — mirrors
// the ≤720px breakpoint already used throughout styles.css (see
// `@media (max-width: 720px)`). Almost everything mobile needs is pure CSS
// (the existing convention throughout this file), but a few things are
// actual *composition* changes, not just re-styling — whether the bottom
// tab bar exists at all, whether the Fleet tab renders as a full screen
// instead of a modal, whether the Chart tab hides its Close button and pick
// affordances outside the map phase. Those need a real JS boolean; this
// hook is that boolean, kept to one definition so it can't drift from the
// CSS breakpoint it mirrors.
const QUERY = '(max-width: 720px)';

function getMedia(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  try {
    return window.matchMedia(QUERY);
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void): () => void {
  const mql = getMedia();
  if (!mql) return () => {};
  // Safari < 14 only has the deprecated addListener/removeListener pair;
  // everything else has addEventListener. Try the modern API first.
  let unsubscribeMql: () => void;
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', onChange);
    unsubscribeMql = () => mql.removeEventListener('change', onChange);
  } else {
    mql.addListener(onChange);
    unsubscribeMql = () => mql.removeListener(onChange);
  }
  // Belt-and-suspenders: some automated/embedded viewport-resize paths
  // (devtools device toolbars, WebView host resizes) change window size
  // without reliably firing the MediaQueryList 'change' event. A plain
  // resize listener costs nothing and guarantees getSnapshot gets
  // re-checked whenever the viewport actually changes.
  window.addEventListener('resize', onChange);
  return () => {
    unsubscribeMql();
    window.removeEventListener('resize', onChange);
  };
}

function getSnapshot(): boolean {
  return getMedia()?.matches ?? false;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useIsCompact(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
