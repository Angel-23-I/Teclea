import { KEY_MAX, KEY_MIN } from '../core/music/notes';
import { BINS_PER_SEMITONE, LOG_BINS, pitchBin } from './logSpectrum';

/**
 * "Huella" de una tecla: su espectro en semitonos, normalizado para que sume 1.
 * El detector explica cada instante como una mezcla de huellas (una por tecla que suena).
 */
export type Template = Float64Array;

export const TEMPLATE_PITCHES: readonly number[] = Array.from(
  { length: KEY_MAX - KEY_MIN + 1 },
  (_, i) => KEY_MIN + i,
);

export function normalize(t: Template): Template {
  let sum = 0;
  for (let i = 0; i < t.length; i++) sum += t[i]!;
  if (sum > 0) for (let i = 0; i < t.length; i++) t[i] = t[i]! / sum;
  return t;
}

/**
 * Huella genérica de una nota: armónicos que se debilitan con la altura. Sirve hasta que se calibra
 * con el teclado real (cada teclado suena distinto y la huella medida es mucho mejor).
 */
export function syntheticTemplate(pitch: number): Template {
  const t = new Float64Array(LOG_BINS);
  // Los graves de un piano tienen armónicos algo más agudos de lo ideal (inarmonicidad).
  const stretch = pitch < 60 ? 0.0003 : 0.0001;
  for (let k = 1; k <= 16; k++) {
    const p = pitch + 12 * Math.log2(k * Math.sqrt(1 + stretch * k * k));
    const center = pitchBin(p);
    if (center >= LOG_BINS - 1) break;
    // El espectro va comprimido con raíz cuadrada, así que la huella también.
    const amp = Math.sqrt((k === 1 && pitch < 48 ? 0.5 : 1) / Math.pow(k, 0.8));
    const c = Math.round(center);
    for (let d = -1; d <= 1; d++) {
      const j = c + d;
      if (j >= 0 && j < LOG_BINS) t[j] = Math.max(t[j]!, amp * (d === 0 ? 1 : 0.45));
    }
  }
  return normalize(t);
}

/** Desplaza una huella `semitones` hacia arriba o abajo (en escala de semitonos es mover casillas). */
export function shiftTemplate(t: Template, semitones: number): Template {
  const shift = Math.round(semitones * BINS_PER_SEMITONE);
  const out = new Float64Array(LOG_BINS);
  for (let j = 0; j < LOG_BINS; j++) {
    const src = j - shift;
    if (src >= 0 && src < LOG_BINS) out[j] = t[src]!;
  }
  return normalize(out);
}

/**
 * Juego completo de 61 huellas: las medidas tal cual y, para las que falten, la medida más cercana
 * desplazada (si está a menos de una octava) o la genérica.
 */
export function buildTemplateSet(measured: ReadonlyMap<number, Template> = new Map()): Template[] {
  const have = [...measured.keys()].sort((a, b) => a - b);
  return TEMPLATE_PITCHES.map((pitch) => {
    const own = measured.get(pitch);
    if (own) return normalize(Float64Array.from(own));
    let nearest: number | null = null;
    for (const p of have)
      if (nearest === null || Math.abs(p - pitch) < Math.abs(nearest - pitch)) nearest = p;
    if (nearest !== null && Math.abs(nearest - pitch) <= 12) {
      return shiftTemplate(measured.get(nearest)!, pitch - nearest);
    }
    return syntheticTemplate(pitch);
  });
}

/** Representación dispersa: solo las casillas que importan (más rápido y sin ruido de fondo). */
export interface SparseTemplate {
  index: Int32Array;
  value: Float64Array;
}

export function sparsify(t: Template, relThreshold = 0.03): SparseTemplate {
  let max = 0;
  for (let i = 0; i < t.length; i++) if (t[i]! > max) max = t[i]!;
  const idx: number[] = [];
  const val: number[] = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i]! > max * relThreshold) {
      idx.push(i);
      val.push(t[i]!);
    }
  }
  const sum = val.reduce((s, v) => s + v, 0) || 1;
  return { index: Int32Array.from(idx), value: Float64Array.from(val.map((v) => v / sum)) };
}
