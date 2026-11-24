import type { DetectedNote } from './detector';

/** Calibración guardada, en un formato que se puede enviar al hilo de análisis y guardar en disco. */
export interface CalibrationData {
  a4: number;
  noiseRms: number;
  noiseSpectrum: number[] | null;
  /** Huellas medidas por nota MIDI. */
  templates: Record<number, number[]>;
  latencyMs: number;
  /** Fecha ISO de la última calibración. */
  date: string | null;
}

export type ToWorker =
  | {
      type: 'init';
      sampleRate: number;
      port: MessagePort;
      calibration: CalibrationData | null;
      sensitivity: number;
    }
  | { type: 'calibration'; calibration: CalibrationData | null }
  | { type: 'sensitivity'; value: number }
  | { type: 'expected'; pitches: number[] | null }
  /** Grabar audio sin procesar durante unos segundos (para medir ruido, afinación y huellas). */
  | { type: 'record'; id: number; seconds: number };

export type FromWorker =
  | { type: 'notes'; events: DetectedNote[] }
  /** ~20 veces por segundo: nivel y activación de las 61 teclas (para el monitor). */
  | { type: 'level'; rms: number; activations: number[]; active: number[] }
  | { type: 'recording'; id: number; samples: Float32Array };
