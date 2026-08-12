/// <reference types="vite/client" />

// Injected by vite.config.ts's `define` at build time — the short git
// commit hash of the build, or 'dev' outside a git checkout / in a
// sandboxed CI clone. See BuildTag.tsx for where it's shown.
declare const __COMMIT_HASH__: string;
