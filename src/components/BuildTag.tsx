// 2026-08-12: a faded commit hash in the corner, purely for bug reports —
// "what build were you on when X happened" is otherwise unanswerable once
// a player's on a deployed build. `__COMMIT_HASH__` is injected by
// vite.config.ts's `define` (short hash, or 'dev' outside a git checkout).
// Rendered on every screen from App.tsx's three return paths; fixed +
// pointer-events:none so it never intercepts a click or sits in tab order.
export function BuildTag() {
  return (
    <div className="build-tag" aria-hidden="true">
      {__COMMIT_HASH__}
    </div>
  );
}
