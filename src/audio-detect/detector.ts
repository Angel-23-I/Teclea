import { FFT, hannWindow, nextPow2 } from './fft';
import { LOG_BINS, LogSpectrum, pitchBin } from './logSpectrum';
import { TemplateNmf } from './nmf';
import { TEMPLATE_PITCHES, buildTemplateSet, sparsify, type Template } from './templates';

export interface DetectorOptions {
  sampleRate: number;
  /** Afinación del teclado (el PSR-E283 permite de 427 a 453 Hz). */
  a4?: number;
  /** Huellas medidas de las 61 teclas; si faltan, se usan las genéricas. */
  templates?: Template[];
  /** Espectro medio del ruido de fondo (de la calibración), para restarlo. */
  noiseSpectrum?: Float64Array;
  /** Nivel RMS del silencio; por debajo de ~3 veces este valor no se buscan notas. */
  noiseRms?: number;
  /** 1 = normal; más alto detecta notas más suaves pero se equivoca más. */
  sensitivity?: number;
}

export interface DetectedNote {
  type: 'on' | 'off';
  pitch: number;
  /** 0–1, aproximada a partir de la energía. */
  velocity: number;
  /** Segundos desde que empezó el flujo de audio (instante del fotograma que la detecta). */
  time: number;
}

const HISTORY = 4;
/** Fotogramas seguidos que una nota nueva debe mantenerse para darla por buena (~30 ms). */
const CONFIRM_FRAMES = 3;

/**
 * Detector de notas en tiempo real para un teclado. Recibe audio a trozos y devuelve cuándo
 * empieza y termina cada nota, también en acordes.
 *
 * Cómo funciona, por fotograma (~11 ms):
 * 1. Espectro en semitonos de los últimos ~85 ms de audio.
 * 2. Se explica como mezcla de las 61 huellas (más una de ruido) con NMF.
 * 3. Una nota empieza cuando su parte crece de golpe y es una fracción clara del total;
 *    termina cuando cae muy por debajo de su máximo. Un golpe nuevo sobre una nota que ya
 *    sonaba (notas repetidas, como en Para Elisa) se detecta por su subida brusca.
 */
export class NoteDetector {
  readonly sampleRate: number;
  readonly fftSize: number;
  readonly hop: number;
  private readonly fft: FFT;
  private readonly window: Float64Array;
  private readonly logSpec: LogSpectrum;
  private nmf!: TemplateNmf;
  /** Valor de cada huella en la casilla de su fundamental (para descartar fantasmas). */
  private fundamental = new Float64Array(TEMPLATE_PITCHES.length);
  private readonly buffer: Float32Array;
  private filled = 0;
  /** Siguiente posición de escritura del búfer circular. */
  private write = 0;
  private sinceHop = 0;
  private processed = 0;
  private readonly mags: Float64Array;
  private readonly frame: Float64Array;
  private readonly spectrum: Float64Array;
  private h: Float64Array;
  private history: Float64Array[] = [];
  private active = new Map<number, { peak: number; frames: number }>();
  /** Candidatas a nota nueva, esperando confirmación: fotogramas vistos e instante del primero. */
  private pending = new Map<number, { frames: number; time: number; peak: number }>();
  private expected: ReadonlySet<number> | null = null;
  private noiseSpectrum: Float64Array | null;
  private noiseRms: number;
  private sensitivity: number;
  private _level = 0;

  constructor(opts: DetectorOptions) {
    this.sampleRate = opts.sampleRate;
    // ~85 ms de ventana: 4096 muestras a 44,1 o 48 kHz.
    this.fftSize = nextPow2(opts.sampleRate * 0.085);
    this.hop = Math.round(this.fftSize / 8);
    this.fft = new FFT(this.fftSize);
    this.window = hannWindow(this.fftSize);
    this.logSpec = new LogSpectrum(opts.sampleRate, this.fftSize, opts.a4 ?? 440);
    this.buffer = new Float32Array(this.fftSize);
    this.mags = new Float64Array(this.fftSize / 2 + 1);
    this.frame = new Float64Array(this.fftSize);
    this.spectrum = new Float64Array(LOG_BINS);
    this.noiseSpectrum = opts.noiseSpectrum ?? null;
    this.noiseRms = opts.noiseRms ?? 0.0005;
    this.sensitivity = opts.sensitivity ?? 1;
    this.setTemplates(opts.templates);
    this.h = new Float64Array(this.nmf.size);
  }

  /** Cambia las huellas (al terminar la calibración). */
  setTemplates(templates?: Template[]): void {
    const set = templates && templates.length === TEMPLATE_PITCHES.length ? templates : buildTemplateSet();
    set.forEach((t, k) => {
      const j = Math.round(pitchBin(TEMPLATE_PITCHES[k]!));
      this.fundamental[k] = Math.max(t[j - 1] ?? 0, t[j]!, t[j + 1] ?? 0);
    });
    const sparse = set.map((t) => sparsify(t));
    // Huella plana para el ruido y los golpes sin tono, así no se los "inventa" como notas.
    const flat = new Float64Array(LOG_BINS).fill(1 / LOG_BINS);
    sparse.push(sparsify(flat, 0));
    this.nmf = new TemplateNmf(sparse, LOG_BINS, 0.06);
    this.h = new Float64Array(this.nmf.size);
    this.history = [];
  }

  setNoise(spectrum: Float64Array | null, rms: number): void {
    this.noiseSpectrum = spectrum;
    this.noiseRms = rms;
  }

  setSensitivity(s: number): void {
    this.sensitivity = Math.max(0.3, Math.min(3, s));
  }

  /** Notas que se esperan ahora (las de la canción): se detectan antes y se confunden menos. */
  setExpected(pitches: Iterable<number> | null): void {
    this.expected = pitches ? new Set(pitches) : null;
  }

  /** Nivel RMS reciente (0–1). */
  get level(): number {
    return this._level;
  }

  /** Activación de cada tecla en el último fotograma (para el monitor), en orden de TEMPLATE_PITCHES. */
  activations(): Float64Array {
    return this.h.subarray(0, TEMPLATE_PITCHES.length);
  }

  /** Último espectro en semitonos (para la calibración). */
  lastSpectrum(): Float64Array {
    return this.spectrum;
  }

  /** Notas que suenan según el detector. */
  activeNotes(): number[] {
    return [...this.active.keys()];
  }

  /** Procesa un trozo de audio y devuelve las notas que empiezan o terminan en él. */
  push(samples: ArrayLike<number>): DetectedNote[] {
    const events: DetectedNote[] = [];
    const n = this.fftSize;
    for (let i = 0; i < samples.length; i++) {
      // Búfer circular: las últimas `fftSize` muestras, empezando en `write`.
      this.buffer[this.write] = samples[i]!;
      this.write = (this.write + 1) % n;
      if (this.filled < n) this.filled++;
      this.processed++;
      if (this.filled === n && ++this.sinceHop >= this.hop) {
        this.sinceHop = 0;
        this.analyze(events);
      }
    }
    return events;
  }

  private analyze(events: DetectedNote[]): void {
    const time = this.processed / this.sampleRate;
    const n = this.fftSize;
    // Ordena el búfer circular (de la muestra más antigua a la más reciente) aplicando la ventana.
    for (let i = 0; i < n; i++) this.frame[i] = this.buffer[(this.write + i) % n]!;
    let sum = 0;
    for (let i = n - this.hop; i < n; i++) sum += this.frame[i]! * this.frame[i]!;
    const rms = Math.sqrt(sum / this.hop);
    this._level = rms;

    // Silencio: suelta todo y no gasta tiempo en el análisis.
    if (rms < this.noiseRms * 3) {
      this.h.fill(0);
      this.history = [];
      this.pending.clear();
      for (const pitch of [...this.active.keys()]) this.release(pitch, time, events);
      return;
    }

    for (let i = 0; i < n; i++) this.frame[i] = this.frame[i]! * this.window[i]!;
    this.logSpec.compute(this.fft.magnitudes(this.frame, this.mags), this.spectrum);
    const v = this.spectrum;
    if (this.noiseSpectrum)
      for (let j = 0; j < LOG_BINS; j++) v[j] = Math.max(0, v[j]! - this.noiseSpectrum[j]! * 1.2);
    let energy = 0;
    for (let j = 0; j < LOG_BINS; j++) energy += v[j]!;
    if (energy <= 0) return;

    // Parte de la solución anterior (las notas cambian poco entre fotogramas) y le deja margen
    // para que aparezcan notas nuevas.
    const K = this.nmf.size;
    const seed = energy / K;
    for (let k = 0; k < K; k++) this.h[k] = this.h[k]! * 0.6 + seed * 0.15;
    this.nmf.solve(v, this.h, 24);

    const keys = TEMPLATE_PITCHES.length;
    let strongest = 0;
    for (let k = 0; k < keys; k++) if (this.h[k]! > strongest) strongest = this.h[k]!;

    const act = (k: number) => (k >= 0 && k < keys ? this.h[k]! : 0);

    for (let k = 0; k < keys; k++) {
      const pitch = TEMPLATE_PITCHES[k]!;
      const a = this.h[k]!;
      const share = a / energy;
      let recentMin = Infinity;
      for (const past of this.history) recentMin = Math.min(recentMin, past[k]!);
      if (!Number.isFinite(recentMin)) recentMin = 0;

      let onShare = 0.07 / this.sensitivity;
      // En graves los restos de otras notas (sobre todo al soltarlas) se parecen más a una nota.
      if (pitch < 50) onShare *= 1.6;
      if (this.expected) onShare *= this.expected.has(pitch) ? 0.6 : 1.5;

      const state = this.active.get(pitch);
      if (!state) {
        const candidate = this.pending.get(pitch);
        const strong = share > onShare && a > strongest * 0.25 && !this.isGhost(k, a, act);
        if (candidate) {
          // Sigue siendo clara: se confirma con el instante en que empezó.
          if (strong || (share > onShare * 0.8 && !this.isGhost(k, a, act))) {
            candidate.frames++;
            candidate.peak = Math.max(candidate.peak, a);
            if (candidate.frames >= CONFIRM_FRAMES) {
              this.pending.delete(pitch);
              this.active.set(pitch, { peak: candidate.peak, frames: candidate.frames });
              events.push({
                type: 'on',
                pitch,
                velocity: Math.min(1, Math.sqrt(rms) * 4),
                time: candidate.time,
              });
            }
          } else this.pending.delete(pitch);
        } else if (strong && a > recentMin * 1.8 + energy * 0.01) {
          this.pending.set(pitch, { frames: 1, time, peak: a });
        }
      } else {
        state.frames++;
        // Golpe nuevo sobre una nota que ya sonaba.
        if (
          state.frames > 12 &&
          a > recentMin * 1.7 &&
          a > state.peak * 0.5 &&
          recentMin < state.peak * 0.7
        ) {
          events.push({ type: 'off', pitch, velocity: 0, time });
          events.push({ type: 'on', pitch, velocity: Math.min(1, Math.sqrt(rms) * 4), time });
          state.peak = a;
          state.frames = 0;
        } else {
          state.peak = Math.max(state.peak, a);
          if (a < state.peak * 0.12 || share < onShare * 0.3) this.release(pitch, time, events);
        }
      }
    }

    this.history.push(Float64Array.from(this.h.subarray(0, keys)));
    if (this.history.length > HISTORY) this.history.shift();
  }

  /**
   * ¿Es un eco de otra nota más fuerte? Dos casos típicos:
   * - una vecina a 1 o 2 semitonos (en graves la FFT reparte la energía entre teclas contiguas);
   * - la misma nota una o dos octavas por debajo, o una doceava (sus armónicos coinciden con los de
   *   la nota real).
   * Las notas que la canción espera no se descartan nunca.
   */
  private isGhost(k: number, a: number, act: (k: number) => number): boolean {
    if (this.expected?.has(TEMPLATE_PITCHES[k]!)) return false;
    // En graves la FFT es menos precisa: basta con que la vecina sea algo más fuerte.
    const ratio = TEMPLATE_PITCHES[k]! < 52 ? 1.15 : 1.5;
    for (const d of [1, 2]) if (act(k + d) > a * ratio || act(k - d) > a * ratio) return true;
    for (const d of [12, 19, 24]) if (act(k + d) > a) return true;
    // Una nota de verdad tiene energía en su fundamental, en la proporción que dice su huella.
    const j = Math.round(pitchBin(TEMPLATE_PITCHES[k]!));
    const v = this.spectrum;
    const observed = Math.max(v[j - 1] ?? 0, v[j]!, v[j + 1] ?? 0);
    if (observed < a * this.fundamental[k]! * 0.35) return true;
    return false;
  }

  private release(pitch: number, time: number, events: DetectedNote[]): void {
    if (!this.active.delete(pitch)) return;
    events.push({ type: 'off', pitch, velocity: 0, time });
  }
}
