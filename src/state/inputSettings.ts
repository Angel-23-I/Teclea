import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ALL_DEVICES, type MidiStatus } from '../input/midi';
import { MAX_PC_OCTAVE, MIN_PC_OCTAVE } from '../input/pcKeyboard';

interface InputSettings {
  /** Tocar con el teclado del ordenador. */
  pcKeyboard: boolean;
  /** Desplazamiento de octava del teclado del ordenador (0 = Z es Do3). */
  pcOctave: number;
  /** Mostrar sobre el teclado de la pantalla qué tecla del ordenador corresponde a cada nota. */
  showPcKeys: boolean;
  /** Escuchar teclados MIDI (USB o Bluetooth). */
  midiEnabled: boolean;
  midiDevice: string;
  /** Que la app haga sonar lo que tocas (desactívalo si tu teclado MIDI ya suena). */
  playSound: boolean;
  setPcKeyboard(v: boolean): void;
  setPcOctave(v: number): void;
  setShowPcKeys(v: boolean): void;
  setMidiEnabled(v: boolean): void;
  setMidiDevice(id: string): void;
  setPlaySound(v: boolean): void;
}

export const useInputSettings = create<InputSettings>()(
  persist(
    (set) => ({
      pcKeyboard: true,
      pcOctave: 0,
      showPcKeys: true,
      midiEnabled: false,
      midiDevice: ALL_DEVICES,
      playSound: true,
      setPcKeyboard: (pcKeyboard) => set({ pcKeyboard }),
      setPcOctave: (v) => set({ pcOctave: Math.max(MIN_PC_OCTAVE, Math.min(MAX_PC_OCTAVE, v)) }),
      setShowPcKeys: (showPcKeys) => set({ showPcKeys }),
      setMidiEnabled: (midiEnabled) => set({ midiEnabled }),
      setMidiDevice: (midiDevice) => set({ midiDevice }),
      setPlaySound: (playSound) => set({ playSound }),
    }),
    { name: 'teclea-entradas' },
  ),
);

/** Estado en vivo de las entradas (no se guarda). */
interface InputLive {
  midiStatus: MidiStatus;
  /** Últimas notas tocadas, de la más reciente a la más antigua. */
  recent: number[];
  setMidiStatus(s: MidiStatus): void;
  pushRecent(pitch: number): void;
}

export const useInputLive = create<InputLive>()((set) => ({
  midiStatus: { kind: 'idle' },
  recent: [],
  setMidiStatus: (midiStatus) => set({ midiStatus }),
  pushRecent: (pitch) => set((s) => ({ recent: [pitch, ...s.recent].slice(0, 8) })),
}));
