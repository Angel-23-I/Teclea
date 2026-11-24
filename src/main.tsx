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
