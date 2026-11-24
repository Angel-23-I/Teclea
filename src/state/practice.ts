import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { HandChoice, PracticeMode, PracticeStats, PracticeSummary } from '../core/practice/session';

const emptyStats: PracticeStats = { hits: 0, misses: 0, wrong: 0, streak: 0, bestStreak: 0, offsets: [] };

interface PracticeSettings {
  mode: PracticeMode;
  hands: HandChoice;
  /** Mejor precisión por canción, modo y manos (clave `cancion|modo|manos`). */
  best: Record<string, number>;
  setMode(m: PracticeMode): void;
  setHands(h: HandChoice): void;
  /** Guarda la precisión si mejora la anterior; devuelve true solo si supera una marca previa. */
  recordBest(key: string, accuracy: number): boolean;
  clearBest(): void;
}

export const usePracticeSettings = create<PracticeSettings>()(
  persist(
    (set, get) => ({
      mode: 'wait',
      hands: 'right',
      best: {},
      setMode: (mode) => set({ mode }),
      setHands: (hands) => set({ hands }),
      recordBest: (key, accuracy) => {
        const prev = get().best[key];
        if (prev != null && prev >= accuracy) return false;
        set({ best: { ...get().best, [key]: accuracy } });
        return prev != null;
      },
      clearBest: () => set({ best: {} }),
    }),
    { name: 'teclea-practica' },
  ),
);

export const bestKey = (songId: string, mode: PracticeMode, hands: HandChoice) =>
  `${songId}|${mode}|${hands}`;

/** Estado en vivo de la práctica (no se guarda). */
interface PracticeLive {
  stats: PracticeStats;
  /** Notas que la canción espera ahora mismo (modo espera). */
  waiting: number[];
  /** Próximas notas que hay que tocar, para el panel. */
  upcoming: { pitch: number; hand: 'left' | 'right'; finger: number | null }[];
  summary: (PracticeSummary & { record: boolean }) | null;
  setStats(s: PracticeStats): void;
  setWaiting(p: number[]): void;
  setUpcoming(u: PracticeLive['upcoming']): void;
  setSummary(s: PracticeLive['summary']): void;
}

export const usePracticeLive = create<PracticeLive>()((set) => ({
  stats: emptyStats,
  waiting: [],
  upcoming: [],
  summary: null,
  setStats: (stats) => set({ stats: { ...stats, offsets: [...stats.offsets] } }),
  setWaiting: (waiting) => set({ waiting }),
  setUpcoming: (upcoming) => set({ upcoming }),
  setSummary: (summary) => set({ summary }),
}));
