import { describe, expect, it } from 'vitest';
import { fitNotesToRange, fitPitch } from './rangeFit';
import type { SongNote } from './types';

const note = (pitch: number, start: number): SongNote => ({
  pitch,
  start,
  duration: 0.5,
  hand: 'right',
  track: 0,
  finger: null,
});

describe('fitPitch', () => {
  it('deja igual las notas dentro del teclado', () => {
    expect(fitPitch(60)).toBe(60);
    expect(fitPitch(36)).toBe(36);
    expect(fitPitch(96)).toBe(96);
  });

  it('mueve por octavas las notas fuera de rango', () => {
    expect(fitPitch(21)).toBe(45); // La0 → La2
    expect(fitPitch(108)).toBe(96); // Do8 → Do7
    expect(fitPitch(100)).toBe(88);
  });

  it('rechaza rangos menores de una octava', () => {
    expect(() => fitPitch(60, 60, 65)).toThrow();
  });
});

describe('fitNotesToRange', () => {
  it('cuenta las notas movidas y elimina duplicados', () => {
    const { notes, shifted } = fitNotesToRange([note(28, 0), note(40, 0), note(60, 1)]);
    expect(shifted).toBe(1);
    // 28 (Mi1) pasa a 40 (Mi2), que ya existía en el mismo instante: queda una sola.
    expect(notes.map((n) => n.pitch)).toEqual([40, 60]);
  });
});
