import { FFT, hannWindow, nextPow2 } from './fft';
import { LOG_BINS, LogSpectrum } from './logSpectrum';
import { normalize, syntheticTemplate, type Template } from './templates';
import { measureFrequency } from './yin';

/**
 * Teclas que se graban en la calibración rápida: una de cada tres (Do, Re#, Fa#, La…), 21 en total.
 * Las demás se deducen desplazando la vecina un semitono, que apenas cambia el sonido.
 */
export const QUICK_PITCHES: readonly number[] = Array.from({ length: 21 }, (_, i) => 36 + i * 3);

/**
 * Corta el audio en fotogramas de ~85 ms (cada ~11 ms) y da su nivel y su espectro en semitonos,
 * con los mismos ajustes que el detector para que las huellas encajen.
 */
export class SpectrumFrames {
  readonly fftSize: number;
  readonly hop: number;
  private readonly fft: FFT;
  private readonly win: Float64Array;
  private readonly log: LogSpectrum;
  private readonly ring: Float32Array;
  private write = 0;
  private filled = 0;
  private since = 0;
  private readonly frame: Float64Array;
  private readonly mags: Float64Array;

  constructor(
    readonly sampleRate: number,
    a4 = 440,
  ) {
    this.fftSize = nextPow2(sampleRate * 0.085);
    this.hop = Math.round(this.fftSize / 8);
    this.fft = new FFT(this.fftSize);
    this.win = hannWindow(this.fftSize);
    this.log = new LogSpectrum(sampleRate, this.fftSize, a4);
    this.ring = new Float32Array(this.fftSize);
    this.frame = new Float64Array(this.fftSize);
    this.mags = new Float64Array(this.fftSize / 2 + 1);
  }

  /** Llama a `onFrame` por cada fotograma completo con el RMS del último salto y el espectro. */
  push(samples: ArrayLike<number>, onFrame: (rms: number, spectrum: Float64Array) => void): void {
    const n = this.fftSize;
    for (let i = 0; i < samples.length; i++) {
      this.ring[this.write] = samples[i]!;
      this.write = (this.write + 1) % n;
      if (this.filled < n) this.filled++;
      if (this.filled === n && ++this.since >= this.hop) {
        this.since = 0;
        let sum = 0;
        for (let j = 0; j < n; j++) {
          const s = this.ring[(this.write + j) % n]!;
          if (j >= n - this.hop) sum += s * s;
          this.frame[j] = s * this.win[j]!;
        }
        const spectrum = this.log.compute(
          this.fft.magnitudes(this.frame, this.mags),
          new Float64Array(LOG_BINS),
        );
        onFrame(Math.sqrt(sum / this.hop), spectrum);
      }
    }
  }
}

export interface NoiseProfile {
  rms: number;
  spectrum: Float64Array;
}

/** Ruido de fondo: nivel y espectro medios de unos segundos de silencio. */
export function measureNoise(samples: ArrayLike<number>, sampleRate: number, a4 = 440): NoiseProfile {
  const frames = new SpectrumFrames(sampleRate, a4);
  const spectrum = new Float64Array(LOG_BINS);
  let rmsSum = 0;
  let count = 0;
  frames.push(samples, (rms, s) => {
    rmsSum += rms;
    count++;
    for (let j = 0; j < LOG_BINS; j++) spectrum[j] = spectrum[j]! + s[j]!;
  });
  if (count) for (let j = 0; j < LOG_BINS; j++) spectrum[j] = spectrum[j]! / count;
  return { rms: count ? rmsSum / count : 0, spectrum };
}

/**
 * Graba la huella de una tecla: espera al golpe (el nivel sube muy por encima del ruido) y promedia
 * el espectro entre 80 y 500 ms después, cuando el sonido ya es estable.
 */
export class TemplateRecorder {
  private frames: SpectrumFrames;
  private onsetFrame = -1;
  private frame = 0;
  private sum = new Float64Array(LOG_BINS);
  private count = 0;
  /** Nivel de pico durante la grabación, para avisar si suena muy flojo. */
  peak = 0;

  constructor(
    sampleRate: number,
    a4 = 440,
    private readonly noise: NoiseProfile | null = null,
  ) {
    this.frames = new SpectrumFrames(sampleRate, a4);
  }

  get started(): boolean {
    return this.onsetFrame >= 0;
  }

  /** Ya hay suficiente sonido estable para la huella. */
  get done(): boolean {
    return this.count >= 30;
  }

  push(samples: ArrayLike<number>): void {
    const threshold = Math.max(0.004, (this.noise?.rms ?? 0) * 6);
    const hopSec = this.frames.hop / this.frames.sampleRate;
    this.frames.push(samples, (rms, spectrum) => {
      this.frame++;
      this.peak = Math.max(this.peak, rms);
      if (this.onsetFrame < 0) {
        if (rms > threshold) this.onsetFrame = this.frame;
        return;
      }
      const t = (this.frame - this.onsetFrame) * hopSec;
      if (t < 0.08 || t > 0.5 || this.done) return;
      for (let j = 0; j < LOG_BINS; j++) {
        const clean = Math.max(0, spectrum[j]! - (this.noise ? this.noise.spectrum[j]! * 1.2 : 0));
        this.sum[j] = this.sum[j]! + clean;
      }
      this.count++;
    });
  }

  result(): Template | null {
    if (!this.done) return null;
    return normalize(Float64Array.from(this.sum));
  }
}

/** Afinación del teclado: frecuencia de La4 medida en un trozo estable de la nota. */
export function measureA4(samples: Float32Array, sampleRate: number): number | null {
  // Busca el golpe y analiza desde 100 ms después durante ~350 ms.
  let onset = -1;
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]!) > 0.02) {
      onset = i;
      break;
    }
  }
  if (onset < 0) return null;
  const from = onset + Math.round(sampleRate * 0.1);
  const len = Math.min(16384, samples.length - from);
  if (len < 4096) return null;
  const r = measureFrequency(samples.subarray(from, from + len), sampleRate, 300, 600);
  if (!r || r.aperiodicity > 0.25) return null;
  // Debe estar dentro del margen de afinación del PSR-E283 (427–453 Hz) con un poco de holgura.
  return r.frequency >= 420 && r.frequency <= 460 ? r.frequency : null;
}

/**
 * Latencia a partir de golpes al ritmo de un clic: mediana de (golpe detectado − clic), en ms.
 * Se usa la mediana para que un golpe despistado no estropee la medida.
 */
export function latencyFromTaps(
  clickTimes: number[],
  onsetTimes: number[],
): { ms: number; spread: number } | null {
  const diffs: number[] = [];
  for (const c of clickTimes) {
    const near = onsetTimes.filter((o) => o > c - 0.15 && o < c + 0.4);
    if (near.length) diffs.push(Math.min(...near.map((o) => o - c)));
  }
  if (diffs.length < Math.max(3, Math.ceil(clickTimes.length / 2))) return null;
  diffs.sort((a, b) => a - b);
  const median = diffs[Math.floor(diffs.length / 2)]!;
  const spread = diffs[Math.floor(diffs.length * 0.8)]! - diffs[Math.floor(diffs.length * 0.2)]!;
  return { ms: Math.round(median * 1000), spread: Math.round(spread * 1000) };
}

/** Redondea para guardar las huellas sin ocupar de más (5 cifras significativas bastan). */
export function compactArray(values: ArrayLike<number>): number[] {
  return Array.from(values, (v) => (v === 0 ? 0 : Number(v.toPrecision(5))));
}

/**
 * ¿La huella grabada corresponde a la tecla pedida? Se compara con las huellas genéricas de las
 * notas cercanas: si otra encaja claramente mejor, probablemente se tocó otra tecla.
 */
export function templateMatchesPitch(template: Template, pitch: number): boolean {
  const cos = (a: Template, b: Template) => {
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i]! * b[i]!;
      na += a[i]! * a[i]!;
      nb += b[i]! * b[i]!;
    }
    return na && nb ? dot / Math.sqrt(na * nb) : 0;
  };
  const own = cos(template, syntheticTemplate(pitch));
  for (let d = -5; d <= 5; d++) {
    if (d === 0) continue;
    if (cos(template, syntheticTemplate(pitch + d)) > own * 1.15) return false;
  }
  return own > 0.3;
}
