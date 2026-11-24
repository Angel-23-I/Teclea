import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App';
import { setupInputs } from './input/setup';
import { setupSound } from './playback/sound';
import { practice } from './practice/controller';
import { progressTracker } from './progress/tracker';
import { useLibrary } from './state/library';
import { useProgress } from './state/progress';

// En la app de escritorio, que no parezca una página web: sin el menú del botón derecho del navegador
// (salvo en los campos de texto) ni Ctrl+R / F5, que recargarían y cortarían lo que suena.
if (import.meta.env.PROD && '__TAURI_INTERNALS__' in window) {
  window.addEventListener('contextmenu', (e) => {
    const t = e.target as HTMLElement | null;
    if (!t?.closest('input, textarea')) e.preventDefault();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R'))) e.preventDefault();
  });
}

setupInputs();
practice.start();
progressTracker.start();
setupSound();

const render = () =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

// Antes de pintar, lee la biblioteca guardada (para abrir la última canción); si tarda, no espera.
const timeout = new Promise((resolve) => setTimeout(resolve, 1500));
void Promise.race([
  Promise.all([useLibrary.getState().hydrate(), useProgress.getState().load()]),
  timeout,
]).finally(render);
