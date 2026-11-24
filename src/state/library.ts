import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { BUILTIN_SONGS } from '../core/song/builtin';
import { ImportError } from '../core/song/importError';
import { importSongFile, musicXmlOf } from '../core/song/importSong';
import { setTrackRole, type Song, type TrackRole } from '../core/song/types';
import { db } from '../storage/db';

export type ImportStatus =
  | { kind: 'idle' }
  | { kind: 'working'; fileName: string }
  | { kind: 'done'; song: Song }
  | { kind: 'error'; fileName: string; message: string };

const DEFAULT_ID = BUILTIN_SONGS[2]!.id;

interface LibraryState {
  songs: Song[];
  currentId: string;
  /** Papel de cada pista elegido por la persona, por canción (se aplica al cargar). */
  roles: Record<string, TrackRole[]>;
  importStatus: ImportStatus;
  /** Si se pudo abrir la base de datos local; si no, lo importado solo dura hasta cerrar. */
  storage: 'loading' | 'ok' | 'unavailable';
  /** Lee de la base de datos las canciones importadas. */
  hydrate(): Promise<void>;
  select(id: string): void;
  importFile(file: File): Promise<Song | null>;
  removeSong(id: string): Promise<void>;
  setTrackRole(track: number, role: TrackRole): void;
  clearImportStatus(): void;
}

function applyRoles(song: Song, roles: TrackRole[] | undefined): Song {
  if (!roles || roles.length !== song.tracks.length) return song;
  return roles.reduce((s, role, i) => (s.tracks[i]!.role === role ? s : setTrackRole(s, i, role)), song);
}

/** Biblioteca: las canciones incluidas más las importadas, que se guardan en IndexedDB. */
export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => ({
      songs: [...BUILTIN_SONGS],
      currentId: DEFAULT_ID,
      roles: {},
      importStatus: { kind: 'idle' },
      storage: 'loading',

      hydrate: async () => {
        try {
          const stored = await db.songs.orderBy('addedAt').toArray();
          const { roles } = get();
          const imported = stored.map((r) => applyRoles(r.song, roles[r.id]));
          const builtins = BUILTIN_SONGS.map((s) => applyRoles(s, roles[s.id]));
          const ids = new Set(imported.map((s) => s.id));
          const songs = [...builtins.filter((s) => !ids.has(s.id)), ...imported];
          set({
            songs,
            storage: 'ok',
            currentId: songs.some((s) => s.id === get().currentId) ? get().currentId : DEFAULT_ID,
          });
        } catch (e) {
          console.error('No se pudo abrir la biblioteca guardada', e);
          set({ storage: 'unavailable', songs: BUILTIN_SONGS.map((s) => applyRoles(s, get().roles[s.id])) });
        }
      },

      select: (id) => set({ currentId: id }),

      importFile: async (file) => {
        set({ importStatus: { kind: 'working', fileName: file.name } });
        let song: Song;
        let bytes: Uint8Array;
        try {
          bytes = new Uint8Array(await file.arrayBuffer());
          song = importSongFile(file.name, bytes);
        } catch (e) {
          const message =
            e instanceof ImportError
              ? e.message
              : 'No se pudo leer el archivo. Comprueba que no esté dañado.';
          if (!(e instanceof ImportError)) console.error(e);
          set({ importStatus: { kind: 'error', fileName: file.name, message } });
          return null;
        }
        const roles = { ...get().roles };
        delete roles[song.id];
        const others = get().songs.filter((s) => s.id !== song.id);
        set({ songs: [...others, song], currentId: song.id, roles, importStatus: { kind: 'done', song } });
        if (get().storage === 'ok') {
          await db.songs
            .put({ id: song.id, song, fileName: file.name, file: bytes, addedAt: Date.now() })
            .catch((e: unknown) => console.error('No se pudo guardar la canción', e));
        }
        return song;
      },

      removeSong: async (id) => {
        if (BUILTIN_SONGS.some((s) => s.id === id)) return;
        const roles = { ...get().roles };
        delete roles[id];
        set((s) => ({
          songs: s.songs.filter((x) => x.id !== id),
          currentId: s.currentId === id ? DEFAULT_ID : s.currentId,
          roles,
        }));
        await db.songs.delete(id).catch((e: unknown) => console.error('No se pudo borrar la canción', e));
      },

      setTrackRole: (track, role) => {
        const { songs, currentId } = get();
        const song = songs.find((s) => s.id === currentId);
        if (!song) return;
        const updated = setTrackRole(song, track, role);
        set({
          songs: songs.map((s) => (s.id === currentId ? updated : s)),
          roles: { ...get().roles, [currentId]: updated.tracks.map((t) => t.role) },
        });
      },

      clearImportStatus: () => set({ importStatus: { kind: 'idle' } }),
    }),
    {
      name: 'teclea-biblioteca',
      partialize: (s) => ({ currentId: s.currentId, roles: s.roles }),
    },
  ),
);

export const isBuiltin = (id: string) => BUILTIN_SONGS.some((s) => s.id === id);

/** MusicXML original de una canción importada desde MusicXML, o null. */
export async function storedMusicXml(id: string): Promise<string | null> {
  try {
    const rec = await db.songs.get(id);
    return rec ? musicXmlOf(rec.fileName, rec.file) : null;
  } catch {
    return null;
  }
}

export const useCurrentSong = (): Song =>
  useLibrary(
    (s) =>
      s.songs.find((x) => x.id === s.currentId) ?? s.songs.find((x) => x.id === DEFAULT_ID) ?? s.songs[0]!,
  );
