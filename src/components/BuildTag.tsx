import { PATCH_NUMBER } from '../patchNumber';

// 2026-08-12/13: a faded "Patch N" in the corner — the player-facing
// version a bug report should reference ("what patch were you on when X
// happened"), otherwise unanswerable once a player's on a deployed
// build. PATCH_NUMBER (patchNumber.ts) is bumped by hand once per
// patch-notes batch; the exact commit hash (`__COMMIT_HASH__`, injected
// by vite.config.ts's `define` — short hash, or 'dev' outside a git
// checkout) rides along in the hover tooltip for pinning a report to a
// specific build within a patch, if the patch number alone isn't
// precise enough. Rendered on every screen from App.tsx's three return
// paths; fixed + pointer-events:none so it never intercepts a click or
// sits in tab order.
export function BuildTag() {
  return (
    <div className="build-tag" aria-hidden="true" title={`Build ${__COMMIT_HASH__}`}>
      Patch {PATCH_NUMBER}
    </div>
  );
}
