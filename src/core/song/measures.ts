export interface TimeSignatureAt {
  /** Posición en negras desde el inicio. */
  quarter: number;
  beats: number;
  beatType: number;
}

/** Longitud de un compás en negras: 3/8 → 1.5, 4/4 → 4. */
export function barLengthInQuarters(beats: number, beatType: number): number {
  return (beats * 4) / beatType;
}

/**
 * Inicio (en negras) de cada compás hasta `endQuarter`, respetando cambios de compás.
 * Los cambios se aplican en el primer compás que empiece en o después de su posición.
 */
export function measureStartsInQuarters(signatures: TimeSignatureAt[], endQuarter: number): number[] {
  const sigs = [...signatures].sort((a, b) => a.quarter - b.quarter);
  if (!sigs.length || sigs[0]!.quarter > 0) sigs.unshift({ quarter: 0, beats: 4, beatType: 4 });
  const starts: number[] = [];
  let q = 0;
  let si = 0;
  for (let guard = 0; q <= endQuarter + 1e-6 && guard < 100_000; guard++) {
    while (si + 1 < sigs.length && sigs[si + 1]!.quarter <= q + 1e-6) si++;
    starts.push(q);
    const s = sigs[si]!;
    q += barLengthInQuarters(s.beats, s.beatType);
  }
  return starts;
}

export interface TempoAt {
  quarter: number;
  bpm: number;
}

/** Convierte posiciones en negras a segundos con un mapa de tempo por tramos. */
export function makeQuarterToSeconds(tempos: TempoAt[]): (quarter: number) => number {
  const ts = [...tempos].sort((a, b) => a.quarter - b.quarter);
  if (!ts.length || ts[0]!.quarter > 0) ts.unshift({ quarter: 0, bpm: ts[0]?.bpm ?? 120 });
  // Segundos acumulados al inicio de cada tramo.
  const startSec: number[] = [0];
  for (let i = 1; i < ts.length; i++) {
    startSec[i] = startSec[i - 1]! + ((ts[i]!.quarter - ts[i - 1]!.quarter) * 60) / ts[i - 1]!.bpm;
  }
  return (quarter: number) => {
    let i = ts.length - 1;
    while (i > 0 && ts[i]!.quarter > quarter) i--;
    return startSec[i]! + ((quarter - ts[i]!.quarter) * 60) / ts[i]!.bpm;
  };
}
