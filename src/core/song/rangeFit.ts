import { KEY_MAX, KEY_MIN } from '../music/notes';
import { sortNotes, type Song, type SongNote } from './types';

/** Mueve una nota por octavas hasta que quepa en [min, max]. */
export function fitPitch(pitch: number, min = KEY_MIN, max = KEY_MAX): number {
  if (max - min < 11) throw new Error('El rango debe cubrir al menos una octava.');
  let p = pitch;
  while (p < min) p += 12;
  while (p > max) p -= 12;
  return p;
}

export interface FitNotesResult {
  notes: SongNote[];
  /** Cuántas notas se han movido de octava. */
  shifted: number;
}

/**
 * Ajusta notas al teclado de 61 teclas. Las que quedan fuera se trasladan de octava
 * y se quitan los duplicados que eso pueda crear (misma nota, mismo inicio).
 */
export function fitNotesToRange(input: readonly SongNote[], min = KEY_MIN, max = KEY_MAX): FitNotesResult {
  let shifted = 0;
  const seen = new Set<string>();
  const notes: SongNote[] = [];
  for (const n of sortNotes([...input])) {
    const pitch = fitPitch(n.pitch, min, max);
    if (pitch !== n.pitch) shifted++;
    const key = `${pitch}@${n.start.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    notes.push(pitch === n.pitch ? n : { ...n, pitch });
  }
  return { notes, shifted };
}

export function fitSongToRange(song: Song, min = KEY_MIN, max = KEY_MAX): Song {
  const { notes, shifted } = fitNotesToRange(song.notes, min, max);
  return { ...song, notes, shiftedNotes: song.shiftedNotes + shifted };
}
