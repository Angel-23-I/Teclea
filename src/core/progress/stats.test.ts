import { describe, expect, it } from 'vitest';
import { currentStreak, dayKey, formatDuration, lastDays, longestStreak, songProgress } from './stats';

const day = (date: string, seconds = 120) => ({ date, seconds, hits: 0 });
const today = new Date(2026, 10, 24, 18); // 24 de noviembre de 2026

describe('progreso', () => {
  it('usa la fecha local', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('cuenta la racha hasta hoy, o hasta ayer si hoy aún no has practicado', () => {
    const days = [day('2026-11-21'), day('2026-11-22'), day('2026-11-23')];
    expect(currentStreak(days, today)).toBe(3);
    expect(currentStreak([...days, day('2026-11-24')], today)).toBe(4);
    expect(currentStreak([day('2026-11-22')], today)).toBe(0);
  });

  it('no cuenta los días de menos de un minuto', () => {
    expect(currentStreak([day('2026-11-23'), day('2026-11-24', 20)], today)).toBe(1);
  });

  it('la racha cruza cambios de mes', () => {
    const t = new Date(2026, 11, 2, 9);
    expect(currentStreak([day('2026-11-30'), day('2026-12-01'), day('2026-12-02')], t)).toBe(3);
  });

  it('encuentra la racha más larga', () => {
    const days = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-10', '2026-10-11'].map((d) => day(d));
    expect(longestStreak(days)).toBe(3);
    expect(longestStreak([])).toBe(0);
  });

  it('rellena los últimos días con ceros', () => {
    const out = lastDays([day('2026-11-23', 300)], 3, today);
    expect(out.map((d) => [d.date, d.seconds])).toEqual([
      ['2026-11-22', 0],
      ['2026-11-23', 300],
      ['2026-11-24', 0],
    ]);
  });

  it('resume cada canción con su mejor marca y la tendencia', () => {
    const s = (songId: string, accuracy: number, date: number) => ({
      songId,
      songTitle: songId.toUpperCase(),
      accuracy,
      stars: 0,
      date,
    });
    const out = songProgress([
      s('a', 50, 1),
      s('a', 60, 2),
      s('a', 70, 3),
      s('a', 80, 4),
      s('a', 90, 5),
      s('a', 85, 6),
      s('b', 40, 7),
    ]);
    expect(out.map((p) => p.songId)).toEqual(['b', 'a']);
    const a = out[1]!;
    expect(a).toMatchObject({ plays: 6, best: 90, last: 85, title: 'A' });
    expect(a.trend).toBe(25); // (80+90+85)/3 − (50+60+70)/3
    expect(out[0]!.trend).toBeNull();
  });

  it('formatea duraciones', () => {
    expect(formatDuration(42)).toBe('42 s');
    expect(formatDuration(12 * 60 + 10)).toBe('12 min');
    expect(formatDuration(65 * 60)).toBe('1 h 05 min');
  });
});
