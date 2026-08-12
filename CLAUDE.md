# Eclipse Roguelike — project conventions

## Verification

- Bar for every change: `npx tsc -b --force` clean, `npx vitest run` green,
  `npx vite build` clean.
- **Do NOT run live browser verification passes for general UI work** — no
  `preview_start`, no in-browser click-throughs, no screenshot/computed-style
  checks. The user verifies those manually. (Policy set 2026-08-07.)
- **Exception, added 2026-08-12: mobile UI work.** Live browser verification
  IS expected when the change targets the mobile layout (≤720px) — drive the
  real viewport, confirm the behaviour, and screenshot the result. Reason:
  two mobile passes (iterations 48 and 53) shipped layout bugs that were
  invisible in the CSS but obvious in the hand — a 232px reflow on every
  order tap, and an orders row whose tiles could never fit the viewport.
  Feel and fit can't be verified by reading a stylesheet.

## Workflow

- Plan first: specs live in `plans/iteration-N.md`; `PLAN.md` is only the
  index table. Feature work gets a plan file before implementation.
- Never commit or push unless explicitly asked ("commit and push").
