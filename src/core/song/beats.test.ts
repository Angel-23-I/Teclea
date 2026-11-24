import { describe, expect, it } from 'vitest';
import { ACCENT, beatClicks } from './beats';
import { BUILTIN_SONGS } from './builtin';

describe('beatClicks', () => {
  const himno = BUILTIN_SONGS[1]!; // 4/4
  const elisa = BUILTIN_SONGS[2]!; // 3/8 con anacrusa

  it('da un clic por pulso con acento en el primer tiempo', () => {
    const clicks = beatClicks(himno, { countIn: false, all: true, leadIn: 1.5 });
    const p = 60 / himno.tempo[0]!.bpm;
    expect(clicks[0]).toMatchObject({ start: 0, pitch: ACCENT });
    expect(clicks[1]!.start).toBeCloseTo(p);
    expect(clicks.slice(0, 8).map((c) => c.pitch)).toEqual([1, 0, 0, 0, 1, 0, 0, 0]);
  });

  it('en la cuenta atrás solo suena antes de empezar', () => {
    const clicks = beatClicks(himno, { countIn: true, all: false, leadIn: 1.5 });
    expect(clicks.length).toBeGreaterThan(0);
    expect(clicks.every((c) => c.start < 0 && c.start >= -1.5 - 1e-6)).toBe(true);
  });

  it('respeta la anacrusa y los pulsos de corchea en 3/8', () => {
    const clicks = beatClicks(elisa, { countIn: false, all: true, leadIn: 1.5 });
    const eighth = 60 / elisa.tempo[0]!.bpm / 2;
    const pickupLen = elisa.measures[1]! - elisa.measures[0]!;
    expect(clicks.filter((c) => c.start < elisa.measures[1]! - 1e-6)).toHaveLength(
      Math.round(pickupLen / eighth),
    );
    const second = clicks.filter(
      (c) => c.start >= elisa.measures[1]! - 1e-6 && c.start < elisa.measures[2]! - 1e-6,
    );
    expect(second.map((c) => c.pitch)).toEqual([1, 0, 0]);
  });
});
