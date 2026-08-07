import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Same fonts + tokens as the game, so the wiki reads as the same product.
import '@fontsource/orbitron/500.css';
import '@fontsource/orbitron/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import '../tokens.css';
import './wiki.css';
import { Wiki } from './Wiki.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Wiki />
  </StrictMode>,
);
