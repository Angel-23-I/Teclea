import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { NamingStyle } from '../core/music/notes';

export type NoteLabels = NamingStyle | 'none';

export const MIN_LOOKAHEAD = 1.5;
export const MAX_LOOKAHEAD = 6;

interface ViewSettings {
  /** Nombre dentro de cada nota que cae. */
  noteLabels: NoteLabels;
  /** Número de dedo, si la partitura lo trae. */
  showFingers: boolean;
  /** Segundos de canción visibles por encima del teclado: menos = notas más rápidas y largas. */
  lookahead: number;
  setNoteLabels(v: NoteLabels): void;
  setShowFingers(v: boolean): void;
  setLookahead(v: number): void;
}

export const useViewSettings = create<ViewSettings>()(
  persist(
    (set) => ({
      noteLabels: 'latin',
      showFingers: true,
      lookahead: 3,
      setNoteLabels: (noteLabels) => set({ noteLabels }),
      setShowFingers: (showFingers) => set({ showFingers }),
      setLookahead: (v) => set({ lookahead: Math.max(MIN_LOOKAHEAD, Math.min(MAX_LOOKAHEAD, v)) }),
    }),
    { name: 'teclea-vista' },
  ),
);
