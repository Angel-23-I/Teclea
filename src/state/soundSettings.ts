import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SoundSettings {
  /** Volumen del piano de la app (canción y tus notas), 0–1. */
  volume: number;
  /** Clics en cada pulso durante la canción. */
  metronome: boolean;
  /** Clics durante la cuenta atrás antes de empezar. */
  countIn: boolean;
  metronomeVolume: number;
  setVolume(v: number): void;
  setMetronome(v: boolean): void;
  setCountIn(v: boolean): void;
  setMetronomeVolume(v: number): void;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export const useSoundSettings = create<SoundSettings>()(
  persist(
    (set) => ({
      volume: 0.8,
      metronome: false,
      countIn: true,
      metronomeVolume: 0.6,
      setVolume: (v) => set({ volume: clamp01(v) }),
      setMetronome: (metronome) => set({ metronome }),
      setCountIn: (countIn) => set({ countIn }),
      setMetronomeVolume: (v) => set({ metronomeVolume: clamp01(v) }),
    }),
    { name: 'teclea-sonido' },
  ),
);
