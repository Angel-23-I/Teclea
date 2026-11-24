import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CalibrationData } from '../audio-detect/workerProtocol';
import type { AudioDevice, AudioLevel, AudioMode, AudioStatus } from '../input/audioInput';
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
  /** Escuchar el teclado por audio (el PSR-E283 no tiene MIDI). */
  audioEnabled: boolean;
  /** Cable a la entrada de línea o micrófono. */
  audioMode: AudioMode;
  /** Entrada de audio elegida; null = la predeterminada del sistema. */
  audioDevice: string | null;
  /** Volumen con el que el PC reproduce lo que entra por el cable (0 = no se oye). */
  monitorVolume: number;
  /** Sensibilidad del detector: 1 normal, más alto detecta notas más suaves. */
  sensitivity: number;
  calibration: CalibrationData | null;
  setPcKeyboard(v: boolean): void;
  setPcOctave(v: number): void;
  setShowPcKeys(v: boolean): void;
  setMidiEnabled(v: boolean): void;
  setMidiDevice(id: string): void;
  setPlaySound(v: boolean): void;
  setAudioEnabled(v: boolean): void;
  setAudioMode(v: AudioMode): void;
  setAudioDevice(id: string | null): void;
  setMonitorVolume(v: number): void;
  setSensitivity(v: number): void;
  setCalibration(c: CalibrationData | null): void;
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
      audioEnabled: false,
      audioMode: 'line',
      audioDevice: null,
      monitorVolume: 0.8,
      sensitivity: 1,
      calibration: null,
      setAudioEnabled: (audioEnabled) => set({ audioEnabled }),
      // Con cable, el teclado se queda mudo y conviene oírlo por el PC; con micrófono no (haría eco).
      setAudioMode: (audioMode) => set({ audioMode, monitorVolume: audioMode === 'line' ? 0.8 : 0 }),
      setAudioDevice: (audioDevice) => set({ audioDevice }),
      setMonitorVolume: (v) => set({ monitorVolume: Math.max(0, Math.min(1, v)) }),
      setSensitivity: (v) => set({ sensitivity: Math.max(0.5, Math.min(2, v)) }),
      setCalibration: (calibration) => set({ calibration }),
    }),
    { name: 'teclea-entradas' },
  ),
);

/** Estado en vivo de las entradas (no se guarda). */
interface InputLive {
  midiStatus: MidiStatus;
  audioStatus: AudioStatus;
  audioLevel: AudioLevel;
  audioDevices: AudioDevice[];
  setAudioStatus(s: AudioStatus): void;
  setAudioLevel(l: AudioLevel): void;
  setAudioDevices(d: AudioDevice[]): void;
  /** Últimas notas tocadas, de la más reciente a la más antigua. */
  recent: number[];
  setMidiStatus(s: MidiStatus): void;
  pushRecent(pitch: number): void;
}

export const useInputLive = create<InputLive>()((set) => ({
  midiStatus: { kind: 'idle' },
  audioStatus: { kind: 'off' },
  audioLevel: { rms: 0, activations: [], active: [] },
  audioDevices: [],
  setAudioStatus: (audioStatus) => set({ audioStatus }),
  setAudioLevel: (audioLevel) => set({ audioLevel }),
  setAudioDevices: (audioDevices) => set({ audioDevices }),
  recent: [],
  setMidiStatus: (midiStatus) => set({ midiStatus }),
  pushRecent: (pitch) => set((s) => ({ recent: [pitch, ...s.recent].slice(0, 8) })),
}));
