/** Cálculos de progreso: rachas, días practicados y resumen por canción. Sin estado ni base de datos. */

export interface DayTotal {
  /** Fecha local AAAA-MM-DD. */
  date: string;
  seconds: number;
  hits: number;
}

export interface SessionLike {
  songId: string;
  songTitle: string;
  accuracy: number;
  stars: number;
  date: number;
}

/** Segundos mínimos para que un día cuente en la racha. */
export const STREAK_MIN_SECONDS = 60;

const pad = (n: number) => String(n).padStart(2, '0');

/** Fecha local AAAA-MM-DD de un instante. */
export function dayKey(d: Date | number): string {
  const date = typeof d === 'number' ? new Date(d) : d;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** El día `offset` días antes (negativo) o después de `d`, a mediodía para esquivar cambios de hora. */
function shiftDay(d: Date, offset: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset, 12);
}

/**
 * Días seguidos practicados (al menos un minuto) hasta hoy. Si hoy aún no has practicado,
 * la racha de ayer sigue viva.
 */
export function currentStreak(days: readonly DayTotal[], today: Date = new Date()): number {
  const practiced = new Set(days.filter((d) => d.seconds >= STREAK_MIN_SECONDS).map((d) => d.date));
  let offset = practiced.has(dayKey(today)) ? 0 : -1;
  let streak = 0;
  while (practiced.has(dayKey(shiftDay(today, offset)))) {
    streak++;
    offset--;
  }
  return streak;
}

/** La racha más larga de toda la historia. */
export function longestStreak(days: readonly DayTotal[]): number {
  const keys = days
    .filter((d) => d.seconds >= STREAK_MIN_SECONDS)
    .map((d) => d.date)
    .sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const k of keys) {
    const [y, m, d] = k.split('-').map(Number) as [number, number, number];
    const yesterday = dayKey(shiftDay(new Date(y, m - 1, d, 12), -1));
    run = prev === yesterday ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  return best;
}

/** Los últimos `n` días hasta hoy, con cero en los que no se practicó. */
export function lastDays(days: readonly DayTotal[], n: number, today: Date = new Date()): DayTotal[] {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const out: DayTotal[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const date = dayKey(shiftDay(today, -i));
    out.push(byDate.get(date) ?? { date, seconds: 0, hits: 0 });
  }
  return out;
}

export interface SongProgress {
  songId: string;
  title: string;
  plays: number;
  best: number;
  last: number;
  lastDate: number;
  /** Diferencia entre la media de las 3 últimas y la de las 3 anteriores (null si no hay bastantes). */
  trend: number | null;
}

/** Resumen por canción, la tocada más recientemente primero. */
export function songProgress(sessions: readonly SessionLike[]): SongProgress[] {
  const bySong = new Map<string, SessionLike[]>();
  for (const s of [...sessions].sort((a, b) => a.date - b.date)) {
    const list = bySong.get(s.songId) ?? [];
    list.push(s);
    bySong.set(s.songId, list);
  }
  const mean = (xs: SessionLike[]) => xs.reduce((t, s) => t + s.accuracy, 0) / xs.length;
  return [...bySong.entries()]
    .map(([songId, list]) => {
      const last = list[list.length - 1]!;
      const recent = list.slice(-3);
      const before = list.slice(-6, -3);
      return {
        songId,
        title: last.songTitle,
        plays: list.length,
        best: Math.max(...list.map((s) => s.accuracy)),
        last: last.accuracy,
        lastDate: last.date,
        trend: before.length ? Math.round(mean(recent) - mean(before)) : null,
      };
    })
    .sort((a, b) => b.lastDate - a.lastDate);
}

/** "1 h 05 min", "12 min", "40 s". */
export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${pad(m % 60)} min`;
}
