import { KEY_MAX, KEY_MIN } from '../music/notes';
import { sortNotes, type Song } from './types';

/** Mueve una nota por octavas hasta que quepa en [min, max]. */
export function fitPitch(pitch: number, min = KEY_MIN, max = KEY_MAX): number {
  if (max - min < 11) throw new Error('El rango debe cubrir al menos una octava.');
  let p = pitch;
  while (p < min) p += 12;
  while (p > max) p -= 12;
  return p;
}

export interface RangeFitResult {
  song: Song;
  /** Cuántas notas se han movido de octava. */
  shifted: number;
}

/**
 * Ajusta una canción al teclado de 61 teclas. Las notas fuera de rango se trasladan de octava
 * y se quitan los duplicados que eso pueda crear (misma nota, mismo inicio).
 */
export function fitSongToRange(song: Song, min = KEY_MIN, max = KEY_MAX): RangeFitResult {
  let shifted = 0;
  const seen = new Set<string>();
  const notes = [];
  for (const n of sortNotes(song.notes)) {
    const pitch = fitPitch(n.pitch, min, max);
    if (pitch !== n.pitch) shifted++;
    const key = `${pitch}@${n.start.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    notes.push(pitch === n.pitch ? n : { ...n, pitch });
  }
  return { song: { ...song, notes }, shifted };
}
