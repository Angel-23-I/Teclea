/** 75.4 → "1:15". Los tiempos negativos (cuenta atrás) se muestran como 0:00. */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Número de compás (1, 2, ...) en un instante, o 0 durante la cuenta atrás. */
export function measureAt(measures: readonly number[], time: number): number {
  if (!measures.length || time < measures[0]! - 1e-6) return 0;
  let lo = 0;
  let hi = measures.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (measures[mid]! <= time + 1e-6) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/** Mensaje sobre notas movidas de octava, con singular y plural. */
export function shiftedNotesMessage(count: number): string {
  return count === 1
    ? '1 nota se ha movido de octava para caber en tu teclado.'
    : `${count} notas se han movido de octava para caber en tu teclado.`;
}
