import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fonts + tokens first (iteration 10): bundled via npm, never a CDN fetch.
import '@fontsource/orbitron/500.css'
import '@fontsource/orbitron/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/600.css'
import './tokens.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
