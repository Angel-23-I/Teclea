import type { SongNote } from '../song/types';

/** Lo que hace sonar las notas programadas (en la app, el sintetizador de Tone.js). */
export interface NoteSink {
  /**
   * @param delay segundos de reloj real desde ahora hasta que debe sonar (≥ 0)
   * @param duration segundos de reloj real que debe durar
   */
  scheduleNote(note: SongNote, delay: number, duration: number): void;
}

/**
 * Programa con un poco de antelación las notas que van a sonar, como hace cualquier secuenciador
 * en Web Audio: llamando a `tick` cada ~25 ms con la posición actual, cada nota se envía una sola vez.
 */
export class NoteScheduler {
  private next = 0;

  /**
   * @param notes ordenadas por inicio
   * @param lookahead segundos de canción que se programan por adelantado
   */
  constructor(
    private readonly notes: readonly SongNote[],
    private readonly sink: NoteSink,
    private readonly lookahead = 0.12,
  ) {}

  /** Coloca el cursor en la primera nota que empieza en `time` o después (tras un salto o bucle). */
  reset(time: number): void {
    let lo = 0;
    let hi = this.notes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.notes[mid]!.start < time - 1e-6) lo = mid + 1;
      else hi = mid;
    }
    this.next = lo;
  }

  /** Programa las notas que empiezan antes de `time + lookahead`. Devuelve cuántas ha enviado. */
  tick(time: number, speed: number, limit = Infinity): number {
    const horizon = Math.min(time + this.lookahead * speed, limit);
    let sent = 0;
    while (this.next < this.notes.length) {
      const n = this.notes[this.next]!;
      if (n.start >= horizon) break;
      this.next++;
      // Si nos hemos quedado muy atrás (pestaña dormida), no suelta un montón de notas a la vez.
      if (n.start < time - 0.25) continue;
      this.sink.scheduleNote(n, Math.max(0, (n.start - time) / speed), n.duration / speed);
      sent++;
    }
    return sent;
  }
}

/** Notas que están sonando en `time` (para iluminar el teclado). */
export function soundingAt(notes: readonly SongNote[], time: number, maxDuration = 8): SongNote[] {
  const out: SongNote[] = [];
  // Búsqueda binaria de la primera nota que empieza después de `time`, y hacia atrás.
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid]!.start <= time) lo = mid + 1;
    else hi = mid;
  }
  for (let i = lo - 1; i >= 0; i--) {
    const n = notes[i]!;
    if (n.start < time - maxDuration) break;
    if (n.start + n.duration > time) out.push(n);
  }
  return out;
}
