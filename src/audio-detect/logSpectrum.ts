/**
 * Espectro en escala de semitonos: pasa la FFT (frecuencias lineales) a casillas de 1/3 de semitono,
 * que es como "oye" la música un teclado. Las huellas de las teclas y el detector trabajan aquí.
 */

/** Casillas por semitono. */
export const BINS_PER_SEMITONE = 3;
/** Nota (MIDI, decimal) de la primera casilla: un poco por debajo de Do2 para dejar margen. */
export const LOG_MIN_PITCH = 34;
/** Hasta Do9 aprox. (8,4 kHz): ahí llegan los armónicos de las notas agudas. */
export const LOG_MAX_PITCH = 120;
export const LOG_BINS = (LOG_MAX_PITCH - LOG_MIN_PITCH) * BINS_PER_SEMITONE;

/** Nota (MIDI, decimal) del centro de una casilla. */
export const binPitch = (j: number) => LOG_MIN_PITCH + j / BINS_PER_SEMITONE;
/** Casilla (decimal) de una nota. */
export const pitchBin = (pitch: number) => (pitch - LOG_MIN_PITCH) * BINS_PER_SEMITONE;

export class LogSpectrum {
  /** Para cada casilla: primera y última casilla FFT que la forman (o -1 si se interpola). */
  private readonly lo: Int32Array;
  private readonly hi: Int32Array;
  /** Posición (decimal) en la FFT del centro de cada casilla, para interpolar en graves. */
  private readonly center: Float64Array;

  constructor(
    readonly sampleRate: number,
    readonly fftSize: number,
    readonly a4 = 440,
  ) {
    this.lo = new Int32Array(LOG_BINS);
    this.hi = new Int32Array(LOG_BINS);
    this.center = new Float64Array(LOG_BINS);
    const hzPerBin = sampleRate / fftSize;
    const freq = (p: number) => a4 * Math.pow(2, (p - 69) / 12);
    const half = 0.5 / BINS_PER_SEMITONE;
    const nyquistBin = fftSize / 2;
    for (let j = 0; j < LOG_BINS; j++) {
      const p = binPitch(j);
      const c = freq(p) / hzPerBin;
      const from = Math.ceil(freq(p - half) / hzPerBin);
      const to = Math.floor(freq(p + half) / hzPerBin);
      this.center[j] = Math.min(c, nyquistBin);
      if (to >= from) {
        this.lo[j] = Math.min(from, nyquistBin);
        this.hi[j] = Math.min(to, nyquistBin);
      } else {
        this.lo[j] = -1;
        this.hi[j] = -1;
      }
    }
  }

  /**
   * Convierte magnitudes FFT en el espectro de semitonos. Se comprime con raíz cuadrada para que
   * un armónico muy fuerte no tape a los demás.
   */
  compute(mags: Float64Array, out: Float64Array): Float64Array {
    for (let j = 0; j < LOG_BINS; j++) {
      let v: number;
      if (this.lo[j]! >= 0) {
        v = 0;
        for (let k = this.lo[j]!; k <= this.hi[j]!; k++) if (mags[k]! > v) v = mags[k]!;
      } else {
        const c = this.center[j]!;
        const k = Math.floor(c);
        const t = c - k;
        v = (mags[k] ?? 0) * (1 - t) + (mags[k + 1] ?? 0) * t;
      }
      out[j] = Math.sqrt(v);
    }
    return out;
  }
}
