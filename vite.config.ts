import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths so the build works at any URL depth —
  // GitHub Pages project sites (/<repo>/), Netlify, itch.io, or file://.
  base: './',
  // Second page: the player wiki (wiki.html), a reference rendered from the
  // live game data — deployed alongside the game at <game-url>/wiki.html.
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        wiki: fileURLToPath(new URL('./wiki.html', import.meta.url)),
      },
    },
  },
  plugins: [
    react(),
    // Iteration 16.3: full offline PWA — manifest + icons + a precaching
    // service worker. `base` above is relative ('./'), not an absolute
    // '/<repo>/' path, specifically so the same build works at any URL
    // depth (GitHub Pages project site, Netlify, itch.io, file://).
    // vite-plugin-pwa reads that same `base` for the manifest's
    // start_url/scope and the SW's registration scope by default, so a
    // relative './' flows through untouched — confirmed by inspecting
    // dist/manifest.webmanifest and dist/sw.js after a build (both use
    // './' rather than a hardcoded path), which is what makes the same
    // dist/ output installable from any subpath without a repo-specific
    // config value here.
    VitePWA({
      registerType: 'autoUpdate',
      // The default auto-injected script only calls register() once on
      // page load, which a resumed (not reloaded) home-screen app may
      // never do again — src/pwaUpdate.ts registers manually so it can
      // also poll on visibility change and reload once an update lands.
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icon.svg', 'icons.svg'],
      manifest: {
        name: 'Eclipse Roguelike',
        short_name: 'Eclipse',
        description: 'A single-player, browser-only roguelike inspired by Eclipse.',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#05070d',
        background_color: '#05070d',
        icons: [
          { src: 'icons/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // Default generateSW precache — the whole app is static hashed
      // assets (fonts included via @fontsource, bundled not CDN-fetched),
      // so the defaults already cover full offline play after first load.
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2}'],
      },
    }),
  ],
})
