/**
 * Modelo interno de canción. Los importadores (MIDI, MusicXML) convierten a este formato
 * y el resto de la app (visualización, práctica, puntuación) solo trabaja con él.
 * Todos los tiempos van en segundos desde el inicio de la canción.
 */

export type Hand = 'left' | 'right';
export type Finger = 1 | 2 | 3 | 4 | 5;
/** Qué hace la app con una pista: la toca una mano o se ignora. */
export type TrackRole = Hand | 'off';

export interface SongNote {
  /** Número MIDI (Do4 = 60). */
  pitch: number;
  /** Inicio en segundos. */
  start: number;
  /** Duración en segundos. */
  duration: number;
  hand: Hand;
  /** Índice en `Song.tracks`. */
  track: number;
  /** Digitación si la partitura la trae (MusicXML); null si no. */
  finger: Finger | null;
}

export interface SongTrack {
  name: string;
  role: TrackRole;
  noteCount: number;
  /** Altura media, para decidir mano derecha o izquierda. */
  averagePitch: number;
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
  tracks: SongTrack[];
  /** Ordenadas por inicio y luego por altura. */
  notes: SongNote[];
  /** Segundo en el que empieza cada compás. */
  measures: number[];
  /** Por ejemplo [3, 8] para 3/8 (el primero de la canción). */
  timeSignature: [number, number];
  tempo: TempoPoint[];
  /** Segundo en el que termina la última nota. */
  duration: number;
  /** Notas que se movieron de octava para caber en el teclado. */
  shiftedNotes: number;
  /** Avisos del importador para mostrar al usuario (repeticiones ignoradas, etc.). */
  warnings: string[];
}

export function sortNotes(notes: SongNote[]): SongNote[] {
  return [...notes].sort((a, b) => a.start - b.start || a.pitch - b.pitch);
}

export function averagePitch(notes: readonly SongNote[]): number {
  return notes.length ? notes.reduce((s, n) => s + n.pitch, 0) / notes.length : 60;
}

/** Notas que suenan o se practican: las de pistas no desactivadas. */
export function activeNotes(song: Song): SongNote[] {
  return song.notes.filter((n) => song.tracks[n.track]?.role !== 'off');
}

/** Cambia el papel de una pista y actualiza la mano de sus notas. */
export function setTrackRole(song: Song, track: number, role: TrackRole): Song {
  const tracks = song.tracks.map((t, i) => (i === track ? { ...t, role } : t));
  const notes =
    role === 'off' ? song.notes : song.notes.map((n) => (n.track === track ? { ...n, hand: role } : n));
  return { ...song, tracks, notes };
}

/** Bpm al principio de la canción (para mostrar). */
export function initialBpm(song: Song): number {
  return Math.round(song.tempo[0]?.bpm ?? 120);
}

/**
 * Reparte manos por altura media cuando la fuente no lo dice: la pista más aguda es la derecha,
 * la más grave la izquierda, y las demás según queden por encima o por debajo de Do4.
 */
export function guessRoles(tracks: SongTrack[]): TrackRole[] {
  if (tracks.length === 0) return [];
  if (tracks.length === 1) return [tracks[0]!.averagePitch >= 55 ? 'right' : 'left'];
  const order = tracks.map((t, i) => [t.averagePitch, i] as const).sort((a, b) => b[0] - a[0]);
  const roles: TrackRole[] = tracks.map((t) => (t.averagePitch >= 60 ? 'right' : 'left'));
  roles[order[0]![1]] = 'right';
  roles[order[order.length - 1]![1]] = 'left';
  return roles;
}
