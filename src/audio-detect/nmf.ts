import type { SparseTemplate } from './templates';

/**
 * Separa un espectro en la suma de huellas conocidas (NMF con diccionario fijo y divergencia KL).
 * El resultado `h[k]` es cuánta energía del espectro explica la huella k: si suena un acorde de
 * Do-Mi-Sol, las tres huellas reciben casi toda la energía y las demás casi nada.
 */
export class TemplateNmf {
  private readonly wh: Float64Array;
  private readonly ratio: Float64Array;

  /**
   * @param templates huellas dispersas, cada una normalizada a suma 1
   * @param bins longitud del espectro
   * @param sparsity penalización L1: favorece explicar el sonido con pocas teclas
   */
  constructor(
    private readonly templates: readonly SparseTemplate[],
    readonly bins: number,
    private readonly sparsity = 0.04,
  ) {
    this.wh = new Float64Array(bins);
    this.ratio = new Float64Array(bins);
  }

  get size(): number {
    return this.templates.length;
  }

  /** Resuelve las activaciones `h` (entrada: estimación inicial, salida: resultado). */
  solve(v: Float64Array, h: Float64Array, iterations = 24): Float64Array {
    const { templates, wh, ratio } = this;
    const eps = 1e-12;
    for (let it = 0; it < iterations; it++) {
      wh.fill(0);
      for (let k = 0; k < templates.length; k++) {
        const hk = h[k]!;
        if (hk <= eps) continue;
        const t = templates[k]!;
        for (let i = 0; i < t.index.length; i++) {
          const b = t.index[i]!;
          wh[b] = wh[b]! + t.value[i]! * hk;
        }
      }
      for (let b = 0; b < this.bins; b++) ratio[b] = v[b]! / (wh[b]! + eps);
      for (let k = 0; k < templates.length; k++) {
        const t = templates[k]!;
        let num = 0;
        for (let i = 0; i < t.index.length; i++) num += t.value[i]! * ratio[t.index[i]!]!;
        // Las huellas suman 1, así que el denominador es 1 + la penalización.
        h[k] = h[k]! * (num / (1 + this.sparsity));
      }
    }
    return h;
  }
}
