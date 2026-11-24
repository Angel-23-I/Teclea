import { create } from 'zustand';
import { dayKey } from '../core/progress/stats';
import { db, type PracticeDay, type PracticeRecord } from '../storage/db';

interface ProgressState {
  days: PracticeDay[];
  sessions: PracticeRecord[];
  loaded: boolean;
  load(): Promise<void>;
  /** Suma tiempo y aciertos al día de hoy (en memoria y en la base de datos). */
  addTime(seconds: number, hits: number, at?: number): Promise<void>;
  addSession(record: Omit<PracticeRecord, 'id'>): Promise<void>;
  /** Borra todo el historial (días y canciones tocadas). */
  clear(): Promise<void>;
}

export const useProgress = create<ProgressState>()((set, get) => ({
  days: [],
  sessions: [],
  loaded: false,

  load: async () => {
    try {
      const [days, sessions] = await Promise.all([db.days.toArray(), db.sessions.orderBy('date').toArray()]);
      set({ days, sessions, loaded: true });
    } catch (e) {
      console.error('No se pudo leer el progreso', e);
      set({ loaded: true });
    }
  },

  addTime: async (seconds, hits, at = Date.now()) => {
    if (seconds <= 0 && hits <= 0) return;
    const date = dayKey(at);
    const prev = get().days.find((d) => d.date === date);
    const day: PracticeDay = {
      date,
      seconds: (prev?.seconds ?? 0) + seconds,
      hits: (prev?.hits ?? 0) + hits,
    };
    set({ days: [...get().days.filter((d) => d.date !== date), day] });
    try {
      await db.transaction('rw', db.days, async () => {
        const stored = await db.days.get(date);
        await db.days.put({
          date,
          seconds: (stored?.seconds ?? 0) + seconds,
          hits: (stored?.hits ?? 0) + hits,
        });
      });
    } catch (e) {
      console.error('No se pudo guardar el tiempo practicado', e);
    }
  },

  addSession: async (record) => {
    let id: number | undefined;
    try {
      id = await db.sessions.add(record);
    } catch (e) {
      console.error('No se pudo guardar la sesión', e);
    }
    set({ sessions: [...get().sessions, { ...record, id }] });
  },

  clear: async () => {
    set({ days: [], sessions: [] });
    try {
      await Promise.all([db.days.clear(), db.sessions.clear()]);
    } catch (e) {
      console.error('No se pudo borrar el progreso', e);
    }
  },
}));
