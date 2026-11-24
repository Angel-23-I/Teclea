import { engine } from '../playback/usePlayback';
import { usePracticeLive } from '../state/practice';
import { useProgress } from '../state/progress';

const FLUSH_EVERY = 15;
/** Un hueco mayor entre dos pasos del reloj es la pestaña dormida o el equipo en suspensión: no cuenta. */
const MAX_GAP = 0.5;

/**
 * Cuenta el tiempo que pasas con una canción en marcha y las notas que aciertas, y lo guarda
 * por días (para la racha y la gráfica de progreso).
 */
class ProgressTracker {
  private pendingSeconds = 0;
  private pendingHits = 0;
  private lastTick: number | null = null;
  private lastHits = 0;
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    engine.onTick(this.onTick);
    engine.subscribe(this.onEngineChange);
    usePracticeLive.subscribe((s) => {
      const hits = s.stats.hits;
      if (hits > this.lastHits) this.pendingHits += hits - this.lastHits;
      this.lastHits = hits;
    });
    window.addEventListener('pagehide', () => this.flush());
  }

  private onTick = (): void => {
    const now = performance.now() / 1000;
    if (this.lastTick != null) {
      const dt = now - this.lastTick;
      if (dt > 0 && dt < MAX_GAP) this.pendingSeconds += dt;
    }
    this.lastTick = now;
    if (this.pendingSeconds >= FLUSH_EVERY) this.flush();
  };

  private onEngineChange = (): void => {
    if (engine.getSnapshot().state !== 'playing') {
      this.lastTick = null;
      this.flush();
    }
  };

  flush(): void {
    const seconds = Math.round(this.pendingSeconds * 10) / 10;
    const hits = this.pendingHits;
    if (seconds <= 0 && hits <= 0) return;
    this.pendingSeconds = 0;
    this.pendingHits = 0;
    void useProgress.getState().addTime(seconds, hits);
  }
}

export const progressTracker = new ProgressTracker();
