import Dexie, { type EntityTable } from 'dexie';
import type { HandChoice, PracticeMode } from '../core/practice/session';
import type { Song } from '../core/song/types';

/** Canción importada: el resultado ya leído y el archivo original (para la partitura o reimportar). */
export interface StoredSong {
  id: string;
  song: Song;
  fileName: string;
  file: Uint8Array;
  /** Date.now() al importarla. */
  addedAt: number;
}

/** Una canción tocada de principio a fin en modo espera o ritmo. */
export interface PracticeRecord {
  id?: number;
  songId: string;
  songTitle: string;
  mode: Exclude<PracticeMode, 'listen'>;
  hands: HandChoice;
  speed: number;
  accuracy: number;
  stars: 0 | 1 | 2 | 3;
  hits: number;
  misses: number;
  wrong: number;
  total: number;
  bestStreak: number;
  meanOffsetMs: number | null;
  /** Date.now() al terminar. */
  date: number;
}

/** Lo practicado en un día (fecha local AAAA-MM-DD). */
export interface PracticeDay {
  date: string;
  /** Segundos con la canción en marcha. */
  seconds: number;
  /** Notas acertadas. */
  hits: number;
}

class TecleaDb extends Dexie {
  songs!: EntityTable<StoredSong, 'id'>;
  sessions!: EntityTable<PracticeRecord, 'id'>;
  days!: EntityTable<PracticeDay, 'date'>;

  constructor() {
    super('teclea');
    this.version(1).stores({
      songs: 'id, addedAt',
      sessions: '++id, songId, date',
      days: 'date',
    });
  }
}

/** Base de datos local (IndexedDB). En la app de escritorio vive en la carpeta de datos de Teclea. */
export const db = new TecleaDb();
