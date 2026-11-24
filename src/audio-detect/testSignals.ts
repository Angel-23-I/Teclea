import { NoteDetector, type DetectedNote, type DetectorOptions } from './detector';

/**
 * Señales sintéticas para los tests del detector: notas parecidas a un teclado digital
 * (armónicos que se apagan, un poco de inarmonicidad y ruido). No se usa en la app.
 */
export interface SynthNote {
  pitch: number;
  start: number;
  duration: number;
  gain?: number;
}

export function midiToHz(pitch: number, a4 = 440): number {
  return a4 * Math.pow(2, (pitch - 69) / 12);
}

/** Generador de números pseudoaleatorios reproducible (los tests no deben variar). */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function renderNotes(
  notes: SynthNote[],
  sampleRate: number,
  length: number,
  { a4 = 440, noise = 0.002, seed = 7 } = {},
): Float32Array {
  const out = new Float32Array(Math.round(length * sampleRate));
  const rand = seededRandom(seed);
  for (const n of notes) {
    const f0 = midiToHz(n.pitch, a4);
    const gain = n.gain ?? 0.25;
    const startI = Math.round(n.start * sampleRate);
    const endI = Math.min(out.length, Math.round((n.start + n.duration + 0.08) * sampleRate));
    // Perfil distinto al de las huellas por defecto, para que el test no sea circular.
    const harmonics: { f: number; a: number; decay: number; phase: number }[] = [];
    for (let k = 1; k <= 14; k++) {
      const f = f0 * k * Math.sqrt(1 + 0.0004 * k * k);
      if (f > sampleRate / 2 - 200) break;
      const a = (k === 1 ? 1 : 0.85 / Math.pow(k, 0.9)) * (n.pitch < 48 && k === 1 ? 0.45 : 1);
      harmonics.push({ f, a, decay: 1.2 + k * 0.5, phase: rand() * Math.PI * 2 });
    }
    for (let i = startI; i < endI; i++) {
      const t = (i - startI) / sampleRate;
      const attack = Math.min(1, t / 0.004);
      const release =
        i / sampleRate > n.start + n.duration ? Math.exp(-(i / sampleRate - n.start - n.duration) / 0.02) : 1;
      let v = 0;
      for (const h of harmonics)
        v += h.a * Math.exp(-h.decay * t) * Math.sin(2 * Math.PI * h.f * t + h.phase);
      out[i] = out[i]! + gain * attack * release * v;
    }
  }
  for (let i = 0; i < out.length; i++) out[i] = out[i]! + (rand() * 2 - 1) * noise;
  return out;
}

/** Pasa una señal por el detector en trozos de 128 muestras, como llega del micrófono. */
export function runDetector(
  signal: Float32Array,
  opts: Partial<DetectorOptions> = {},
  sampleRate = 48000,
): DetectedNote[] {
  const det = new NoteDetector({ sampleRate, ...opts });
  const events: DetectedNote[] = [];
  for (let i = 0; i < signal.length; i += 128) events.push(...det.push(signal.subarray(i, i + 128)));
  return events;
}

export interface DetectionScore {
  hits: number;
  misses: SynthNote[];
  extra: DetectedNote[];
  /** Retraso medio de detección en ms. */
  delay: number;
}

/** Empareja cada nota esperada con un inicio detectado de la misma altura poco después. */
export function scoreDetection(notes: SynthNote[], events: DetectedNote[], maxDelay = 0.12): DetectionScore {
  const ons = events.filter((e) => e.type === 'on');
  const used = new Set<DetectedNote>();
  const misses: SynthNote[] = [];
  let delaySum = 0;
  for (const n of notes) {
    const match = ons.find(
      (e) => !used.has(e) && e.pitch === n.pitch && e.time >= n.start - 0.02 && e.time <= n.start + maxDelay,
    );
    if (match) {
      used.add(match);
      delaySum += match.time - n.start;
    } else misses.push(n);
  }
  const hits = notes.length - misses.length;
  return { hits, misses, extra: ons.filter((e) => !used.has(e)), delay: hits ? (delaySum / hits) * 1000 : 0 };
}
