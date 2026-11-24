/**
 * FFT radix-2 iterativa (Cooley-Tukey) para tamaños potencia de 2.
 * Se reutilizan los búferes entre llamadas: el detector la ejecuta unas 90 veces por segundo.
 */
export class FFT {
  readonly size: number;
  private readonly rev: Uint32Array;
  private readonly cos: Float64Array;
  private readonly sin: Float64Array;
  private readonly re: Float64Array;
  private readonly im: Float64Array;

  constructor(size: number) {
    if (size < 2 || (size & (size - 1)) !== 0) throw new Error('El tamaño de la FFT debe ser potencia de 2.');
    this.size = size;
    const bits = Math.log2(size);
    this.rev = new Uint32Array(size);
    for (let i = 0; i < size; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
    this.cos = new Float64Array(size / 2);
    this.sin = new Float64Array(size / 2);
    for (let i = 0; i < size / 2; i++) {
      this.cos[i] = Math.cos((-2 * Math.PI * i) / size);
      this.sin[i] = Math.sin((-2 * Math.PI * i) / size);
    }
    this.re = new Float64Array(size);
    this.im = new Float64Array(size);
  }

  /**
   * Magnitud del espectro de una señal real (ya enventanada).
   * Escribe `size / 2 + 1` valores en `out`.
   */
  magnitudes(input: ArrayLike<number>, out: Float64Array): Float64Array {
    const n = this.size;
    const { re, im, rev } = this;
    for (let i = 0; i < n; i++) {
      re[rev[i]!] = input[i] ?? 0;
      im[rev[i]!] = 0;
    }
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1;
      const step = n / len;
      for (let start = 0; start < n; start += len) {
        for (let k = 0; k < half; k++) {
          const c = this.cos[k * step]!;
          const s = this.sin[k * step]!;
          const a = start + k;
          const b = a + half;
          const tr = re[b]! * c - im[b]! * s;
          const ti = re[b]! * s + im[b]! * c;
          re[b] = re[a]! - tr;
          im[b] = im[a]! - ti;
          re[a] = re[a]! + tr;
          im[a] = im[a]! + ti;
        }
      }
    }
    for (let k = 0; k <= n / 2; k++) out[k] = Math.hypot(re[k]!, im[k]!);
    return out;
  }
}

/** Ventana de Hann. */
export function hannWindow(size: number): Float64Array {
  const w = new Float64Array(size);
  for (let i = 0; i < size; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  return w;
}

/** Siguiente potencia de 2 mayor o igual que `n`. */
export function nextPow2(n: number): number {
  return 2 ** Math.ceil(Math.log2(Math.max(2, n)));
}
