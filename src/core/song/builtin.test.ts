import { describe, expect, it } from 'vitest';
import { KEY_MAX, KEY_MIN } from '../music/notes';
import { BUILTIN_SONGS } from './builtin';

describe('canciones incluidas', () => {
  it('todas caben en el teclado y tienen las dos manos', () => {
    for (const song of BUILTIN_SONGS) {
      expect(song.notes.every((n) => n.pitch >= KEY_MIN && n.pitch <= KEY_MAX)).toBe(true);
      expect(song.tracks.map((t) => t.role)).toEqual(['right', 'left']);
      expect(song.notes.some((n) => n.hand === 'left')).toBe(true);
    }
  });

  it('Para Elisa empieza con anacrusa y compases de 3/8', () => {
    const elisa = BUILTIN_SONGS.find((s) => s.id === 'builtin-para-elisa')!;
    const spq = 60 / 64;
    expect(elisa.measures[0]).toBe(0);
    expect(elisa.measures[1]).toBeCloseTo(0.5 * spq);
    expect(elisa.measures[2]).toBeCloseTo(2 * spq);
    expect(elisa.measures).toHaveLength(9); // anacrusa + 8 compases
  });

  it('el Himno tiene 8 compases de 4/4', () => {
    const ode = BUILTIN_SONGS.find((s) => s.id === 'builtin-himno-alegria')!;
    expect(ode.measures).toHaveLength(8);
    expect(ode.measures[1]).toBeCloseTo(4 * 0.6);
  });
});
