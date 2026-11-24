import { create } from 'zustand';
import { BUILTIN_SONGS } from '../core/song/builtin';
import { ImportError } from '../core/song/importError';
import { importSongFile } from '../core/song/importSong';
import { setTrackRole, type Song, type TrackRole } from '../core/song/types';

export type ImportStatus =
  | { kind: 'idle' }
  | { kind: 'working'; fileName: string }
  | { kind: 'done'; song: Song }
  | { kind: 'error'; fileName: string; message: string };

interface LibraryState {
  songs: Song[];
  currentId: string;
  importStatus: ImportStatus;
  select(id: string): void;
  importFile(file: File): Promise<Song | null>;
  setTrackRole(track: number, role: TrackRole): void;
  clearImportStatus(): void;
}

/** Biblioteca de canciones. Por ahora vive en memoria; en la fase 6 se guardará en IndexedDB. */
export const useLibrary = create<LibraryState>()((set, get) => ({
  songs: [...BUILTIN_SONGS],
  currentId: BUILTIN_SONGS[2]!.id,
  importStatus: { kind: 'idle' },

  select: (id) => set({ currentId: id }),

  importFile: async (file) => {
    set({ importStatus: { kind: 'working', fileName: file.name } });
    try {
      const song = importSongFile(file.name, new Uint8Array(await file.arrayBuffer()));
      const others = get().songs.filter((s) => s.id !== song.id);
      set({ songs: [...others, song], currentId: song.id, importStatus: { kind: 'done', song } });
      return song;
    } catch (e) {
      const message =
        e instanceof ImportError ? e.message : 'No se pudo leer el archivo. Comprueba que no esté dañado.';
      if (!(e instanceof ImportError)) console.error(e);
      set({ importStatus: { kind: 'error', fileName: file.name, message } });
      return null;
    }
  },

  setTrackRole: (track, role) =>
    set((s) => ({
      songs: s.songs.map((song) => (song.id === s.currentId ? setTrackRole(song, track, role) : song)),
    })),

  clearImportStatus: () => set({ importStatus: { kind: 'idle' } }),
}));

export const useCurrentSong = (): Song =>
  useLibrary((s) => s.songs.find((x) => x.id === s.currentId) ?? s.songs[0]!);
