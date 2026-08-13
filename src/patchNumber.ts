// 2026-08-13: the player-facing patch number shown in the corner
// (BuildTag) — bumped by hand exactly once per patch-notes batch handed
// to the user, never per-commit (dailies of small fixes between patch
// notes don't get their own number; the commit hash in BuildTag's hover
// tooltip covers "which exact build" if a patch number alone isn't
// precise enough for a bug report). Keep this in sync with whatever
// number heads the patch notes given in chat — they're the same count.
export const PATCH_NUMBER = 1;
