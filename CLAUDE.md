# Eclipse Roguelike — project conventions

## Verification

- Bar for every change: `npx tsc -b --force` clean, `npx vitest run` green,
  `npx vite build` clean.
- **Do NOT run live browser verification passes** — no `preview_start`, no
  in-browser click-throughs, no screenshot/computed-style checks. The user
  verifies all UI changes manually. (Policy set 2026-08-07.)

## Workflow

- Plan first: specs live in `plans/iteration-N.md`; `PLAN.md` is only the
  index table. Feature work gets a plan file before implementation.
- Never commit or push unless explicitly asked ("commit and push").
