/**
 * Modelo interno de canción. Los importadores (MIDI, MusicXML) convierten a este formato
 * y el resto de la app (visualización, práctica, puntuación) solo trabaja con él.
 * Todos los tiempos van en segundos desde el primer compás.
 */

export type Hand = 'left' | 'right';
export type Finger = 1 | 2 | 3 | 4 | 5;

export interface SongNote {
  /** Número MIDI (Do4 = 60). */
  pitch: number;
  /** Inicio en segundos. */
  start: number;
  /** Duración en segundos. */
  duration: number;
  hand: Hand;
  /** Digitación si la partitura la trae (MusicXML); null si no. */
  finger: Finger | null;
}

export interface TempoPoint {
  /** Segundo en el que empieza este tempo. */
  time: number;
  /** Negras por minuto. */
  bpm: number;
}

export type SongSource = 'builtin' | 'midi' | 'musicxml';

export interface Song {
  id: string;
  title: string;
  composer: string | null;
  source: SongSource;
  /** Ordenadas por inicio y luego por altura. */
  notes: SongNote[];
  /** Segundo en el que empieza cada compás. */
  measures: number[];
  /** Por ejemplo [3, 8] para 3/8. */
  timeSignature: [number, number];
  tempo: TempoPoint[];
  /** Segundo en el que termina la última nota. */
  duration: number;
}

export function sortNotes(notes: SongNote[]): SongNote[] {
  return [...notes].sort((a, b) => a.start - b.start || a.pitch - b.pitch);
}
