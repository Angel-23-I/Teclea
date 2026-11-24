import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { NamingStyle } from '../core/music/notes';

export type NoteLabels = NamingStyle | 'none';

/** Qué se ve en el escenario: notas que caen, partitura o las dos (partitura arriba). */
export type StageView = 'notes' | 'sheet' | 'split';

export const MIN_LOOKAHEAD = 1.5;
export const MAX_LOOKAHEAD = 6;

interface ViewSettings {
  /** Nombre dentro de cada nota que cae. */
  noteLabels: NoteLabels;
  /** Número de dedo, si la partitura lo trae. */
  showFingers: boolean;
  /** Segundos de canción visibles por encima del teclado: menos = notas más rápidas y largas. */
  lookahead: number;
  stageView: StageView;
  /** Tamaño de la partitura (1 = normal). */
  sheetZoom: number;
  setNoteLabels(v: NoteLabels): void;
  setShowFingers(v: boolean): void;
  setLookahead(v: number): void;
  setStageView(v: StageView): void;
  setSheetZoom(v: number): void;
}

export const useViewSettings = create<ViewSettings>()(
  persist(
    (set) => ({
      noteLabels: 'latin',
      showFingers: true,
      lookahead: 3,
      stageView: 'notes',
      sheetZoom: 0.8,
      setNoteLabels: (noteLabels) => set({ noteLabels }),
      setShowFingers: (showFingers) => set({ showFingers }),
      setStageView: (stageView) => set({ stageView }),
      setSheetZoom: (v) => set({ sheetZoom: Math.max(0.5, Math.min(1.6, Math.round(v * 10) / 10)) }),
      setLookahead: (v) => set({ lookahead: Math.max(MIN_LOOKAHEAD, Math.min(MAX_LOOKAHEAD, v)) }),
    }),
    { name: 'teclea-vista' },
  ),
);
