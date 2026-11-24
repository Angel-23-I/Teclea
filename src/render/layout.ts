import { KEY_MAX, KEY_MIN, isBlackKey } from '../core/music/notes';
import type { SongNote } from '../core/song/types';

export interface KeyRect {
  pitch: number;
  x: number;
  width: number;
  black: boolean;
}

/** Proporción de una tecla negra respecto a una blanca. */
export const BLACK_KEY_WIDTH = 0.6;
export const BLACK_KEY_HEIGHT = 0.62;

/** Posición horizontal de cada tecla para un ancho dado. Indexado por número MIDI. */
export function keyboardLayout(width: number, min = KEY_MIN, max = KEY_MAX): KeyRect[] {
  let whites = 0;
  for (let p = min; p <= max; p++) if (!isBlackKey(p)) whites++;
  const ww = width / whites;
  const bw = ww * BLACK_KEY_WIDTH;
  const keys: KeyRect[] = [];
  let wi = 0;
  for (let p = min; p <= max; p++) {
    if (isBlackKey(p)) keys[p] = { pitch: p, x: wi * ww - bw / 2, width: bw, black: true };
    else keys[p] = { pitch: p, x: wi++ * ww, width: ww, black: false };
  }
  return keys;
}

export interface StageMetrics {
  width: number;
  height: number;
  /** Línea donde las notas tocan el teclado. */
  hitY: number;
  keyboardHeight: number;
  /** Píxeles por segundo de canción. */
  pxPerSecond: number;
}

/**
 * Reparte el alto: el teclado ocupa ~20 % (entre 80 y 160 px) y encima caen las notas.
 * `lookahead` son los segundos de canción visibles entre el borde superior y la línea.
 */
export function stageMetrics(width: number, height: number, lookahead: number): StageMetrics {
  const keyboardHeight = Math.round(Math.max(80, Math.min(160, height * 0.2)));
  const hitY = Math.max(40, height - keyboardHeight);
  return { width, height, hitY, keyboardHeight, pxPerSecond: hitY / lookahead };
}

/** Altura en pantalla de un instante de la canción (la línea de impacto es "ahora"). */
export function timeToY(t: number, now: number, m: StageMetrics): number {
  return m.hitY - (t - now) * m.pxPerSecond;
}

export interface NoteRect {
  x: number;
  y: number;
  width: number;
  height: number;
  /** El extremo inferior ya ha llegado a la línea y se está "metiendo" en la tecla. */
  clipped: boolean;
}

/**
 * Rectángulo de una nota en el instante `now`, recortado a la zona de caída.
 * Devuelve null si no se ve.
 */
export function noteRect(note: SongNote, now: number, m: StageMetrics, keys: KeyRect[]): NoteRect | null {
  const key = keys[note.pitch];
  if (!key) return null;
  const bottom = timeToY(note.start, now, m);
  const top = timeToY(note.start + note.duration, now, m);
  if (bottom < 0 || top >= m.hitY) return null;
  const pad = key.black ? 1 : Math.max(1.5, key.width * 0.1);
  const y = Math.max(top, -2);
  const clippedBottom = Math.min(bottom, m.hitY);
  return {
    x: key.x + pad,
    y,
    width: Math.max(2, key.width - pad * 2),
    height: Math.max(3, clippedBottom - y),
    clipped: bottom > m.hitY,
  };
}

/**
 * Índices [desde, hasta) de las notas que pueden verse entre `now - maxDuration` y `now + lookahead`.
 * Las notas deben estar ordenadas por inicio.
 */
export function visibleRange(
  notes: readonly SongNote[],
  now: number,
  lookahead: number,
  maxDuration = 8,
): [number, number] {
  const lower = (t: number) => {
    let lo = 0;
    let hi = notes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (notes[mid]!.start < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  return [lower(now - maxDuration), lower(now + lookahead + 0.05)];
}
