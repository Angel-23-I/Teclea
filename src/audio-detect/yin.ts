/**
 * Detección de la frecuencia de una nota sola con el algoritmo YIN (de Cheveigné y Kawahara, 2002).
 * Se usa para medir la afinación del teclado durante la calibración.
 */
export interface YinResult {
  frequency: number;
  /** 0 = periodicidad perfecta; por encima de ~0.2 la señal no es una nota clara. */
  aperiodicity: number;
}

export function yin(
  samples: ArrayLike<number>,
  sampleRate: number,
  minFreq = 50,
  maxFreq = 2000,
  threshold = 0.12,
): YinResult | null {
  const maxTau = Math.min(Math.floor(sampleRate / minFreq), Math.floor(samples.length / 2));
  const minTau = Math.max(2, Math.floor(sampleRate / maxFreq));
  if (maxTau <= minTau) return null;
  const w = samples.length - maxTau;
  const d = new Float64Array(maxTau + 1);
  for (let tau = 1; tau <= maxTau; tau++) {
    let sum = 0;
    for (let i = 0; i < w; i++) {
      const diff = samples[i]! - samples[i + tau]!;
      sum += diff * diff;
    }
    d[tau] = sum;
  }
  // Diferencia normalizada acumulada.
  const cmnd = new Float64Array(maxTau + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    running += d[tau]!;
    cmnd[tau] = running > 0 ? (d[tau]! * tau) / running : 1;
  }
  let tau = -1;
  for (let t = minTau; t <= maxTau; t++) {
    if (cmnd[t]! < threshold) {
      while (t + 1 <= maxTau && cmnd[t + 1]! < cmnd[t]!) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) {
    // Sin cruce del umbral: el mínimo global, marcado como poco fiable.
    let best = minTau;
    for (let t = minTau; t <= maxTau; t++) if (cmnd[t]! < cmnd[best]!) best = t;
    tau = best;
  }
  // Interpolación parabólica para afinar entre muestras.
  const a = cmnd[tau - 1] ?? cmnd[tau]!;
  const b = cmnd[tau]!;
  const c = cmnd[tau + 1] ?? cmnd[tau]!;
  const denom = a - 2 * b + c;
  const shift = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
  const period = tau + Math.max(-1, Math.min(1, shift));
  return { frequency: sampleRate / period, aperiodicity: b };
}

/**
 * Frecuencia fundamental precisa: YIN da la aproximación y luego se busca el pico del espectro
 * cerca de ella (con mucho relleno de ceros e interpolación parabólica). Así no la desvían los
 * armónicos algo desafinados que tienen los pianos.
 */
export function measureFrequency(
  samples: ArrayLike<number>,
  sampleRate: number,
  minFreq = 50,
  maxFreq = 2200,
): YinResult | null {
  const coarse = yin(samples, sampleRate, minFreq, maxFreq);
  if (!coarse || coarse.aperiodicity > 0.35) return coarse;
  const n = 1 << 16;
  const len = Math.min(samples.length, n);
  const re = new Float64Array(n);
  for (let i = 0; i < len; i++) re[i] = samples[i]! * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (len - 1)));
  // DFT solo en las casillas cercanas a la aproximación (±3 %), más barato que una FFT de 64k.
  const hz = sampleRate / n;
  const from = Math.floor((coarse.frequency * 0.97) / hz);
  const to = Math.ceil((coarse.frequency * 1.03) / hz);
  const mag = (k: number) => {
    let sr = 0;
    let si = 0;
    const w = (-2 * Math.PI * k) / n;
    for (let i = 0; i < len; i++) {
      sr += re[i]! * Math.cos(w * i);
      si += re[i]! * Math.sin(w * i);
    }
    return Math.log(Math.hypot(sr, si) + 1e-12);
  };
  let best = from;
  let bestMag = -Infinity;
  const mags = new Map<number, number>();
  for (let k = from; k <= to; k++) {
    const m = mag(k);
    mags.set(k, m);
    if (m > bestMag) {
      bestMag = m;
      best = k;
    }
  }
  const a = mags.get(best - 1) ?? mag(best - 1);
  const c = mags.get(best + 1) ?? mag(best + 1);
  const denom = a - 2 * bestMag + c;
  const shift = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
  return { frequency: (best + Math.max(-1, Math.min(1, shift))) * hz, aperiodicity: coarse.aperiodicity };
}
