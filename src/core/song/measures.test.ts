import { describe, expect, it } from 'vitest';
import { barLengthInQuarters, makeQuarterToSeconds, measureStartsInQuarters } from './measures';

describe('measures', () => {
  it('calcula la longitud del compás en negras', () => {
    expect(barLengthInQuarters(4, 4)).toBe(4);
    expect(barLengthInQuarters(3, 8)).toBe(1.5);
    expect(barLengthInQuarters(6, 8)).toBe(3);
  });

  it('genera inicios de compás con cambio de compás', () => {
    const starts = measureStartsInQuarters(
      [
        { quarter: 0, beats: 4, beatType: 4 },
        { quarter: 8, beats: 3, beatType: 4 },
      ],
      14,
    );
    expect(starts).toEqual([0, 4, 8, 11, 14]);
  });

  it('usa 4/4 si no hay compás', () => {
    expect(measureStartsInQuarters([], 8)).toEqual([0, 4, 8]);
  });

  it('convierte negras a segundos con cambios de tempo', () => {
    const toSec = makeQuarterToSeconds([
      { quarter: 0, bpm: 120 },
      { quarter: 4, bpm: 60 },
    ]);
    expect(toSec(0)).toBe(0);
    expect(toSec(4)).toBe(2);
    expect(toSec(5)).toBe(3);
    expect(makeQuarterToSeconds([])(2)).toBe(1);
  });
});
