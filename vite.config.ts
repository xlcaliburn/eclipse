import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths so the build works at any URL depth —
  // GitHub Pages project sites (/<repo>/), Netlify, itch.io, or file://.
  base: './',
  plugins: [react()],
})
