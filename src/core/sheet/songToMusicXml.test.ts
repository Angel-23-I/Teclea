// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { BUILTIN_SONGS } from '../song/builtin';
import { importMusicXml } from '../song/musicxmlImporter';
import type { Song, SongNote } from '../song/types';
import { guessFifths, secondsToQuarters, songToMusicXml, splitDuration } from './songToMusicXml';

const sig = (n: SongNote) => `${n.pitch}@${n.start.toFixed(3)}:${n.hand}`;

describe('songToMusicXml', () => {
  it.each(BUILTIN_SONGS.map((s) => [s.title, s] as const))(
    'al volver a leer «%s» salen las mismas notas, manos y compases',
    (_, song) => {
      const back = importMusicXml(songToMusicXml(song), 'x.musicxml');
      expect(back.notes.map(sig)).toEqual(song.notes.map(sig));
      expect(back.measures.length).toBe(song.measures.length);
      back.measures.forEach((t, i) => expect(t).toBeCloseTo(song.measures[i]!, 3));
      // Los dedos se conservan.
      expect(back.notes.map((n) => n.finger)).toEqual(song.notes.map((n) => n.finger));
    },
  );

  it('cuantiza un MIDI tocado con pequeñas imprecisiones', () => {
    const bpm = 100;
    const q = 60 / bpm;
    const jitter = [0.012, -0.018, 0.007, -0.01, 0.015, -0.004, 0.009, -0.016];
    const notes: SongNote[] = jitter.map((j, i) => ({
      pitch: 60 + i,
      start: i * q * 0.5 + j,
      duration: q * 0.45,
      hand: 'right',
      track: 0,
      finger: null,
    }));
    const song: Song = {
      id: 't',
      title: 'Corcheas & ruido',
      composer: null,
      source: 'midi',
      tracks: [{ name: 'Piano', role: 'right', noteCount: notes.length, averagePitch: 63 }],
      notes,
      measures: [0, 4 * q],
      timeSignature: [4, 4],
      tempo: [{ time: 0, bpm }],
      duration: 4 * q,
      shiftedNotes: 0,
      warnings: [],
    };
    const xml = songToMusicXml(song);
    expect(xml).toContain('Corcheas &amp; ruido');
    const back = importMusicXml(xml, 'x.musicxml');
    back.notes.forEach((n, i) => expect(n.start).toBeCloseTo(i * q * 0.5, 6));
    expect(back.notes).toHaveLength(8);
  });

  it('liga las notas que cruzan la barra de compás', () => {
    const song: Song = {
      ...BUILTIN_SONGS[1]!,
      notes: [{ pitch: 67, start: 1.5, duration: 1, hand: 'right', track: 0, finger: null }],
      measures: [0, 2],
      timeSignature: [4, 4],
      tempo: [{ time: 0, bpm: 120 }],
      duration: 2.5,
    };
    const xml = songToMusicXml(song);
    expect(xml.match(/<tie type="start"\/>/g)).toHaveLength(1);
    const back = importMusicXml(xml, 'x.musicxml');
    expect(back.notes).toHaveLength(1);
    expect(back.notes[0]!.duration).toBeCloseTo(1, 6);
  });

  it('elige la armadura por las notas que más suenan', () => {
    const scale = (pcs: number[]): SongNote[] =>
      pcs.map((pc, i) => ({ pitch: 60 + pc, start: i, duration: 1, hand: 'right', track: 0, finger: null }));
    expect(guessFifths(scale([0, 2, 4, 5, 7, 9, 11]))).toBe(0);
    expect(guessFifths(scale([7, 9, 11, 0, 2, 4, 6]))).toBe(1); // Sol mayor
    expect(guessFifths(scale([5, 7, 9, 10, 0, 2, 4]))).toBe(-1); // Fa mayor
  });

  it('reparte duraciones en figuras escribibles', () => {
    expect(splitDuration(30, 'binary').map((p) => p.div)).toEqual([24, 6]);
    expect(splitDuration(18, 'binary')).toEqual([expect.objectContaining({ type: 'quarter', dots: 1 })]);
    expect(splitDuration(4, 'triplet')).toEqual([expect.objectContaining({ type: 'eighth', triplet: true })]);
  });

  it('convierte segundos a negras con cambios de tempo', () => {
    const toQ = secondsToQuarters({
      ...BUILTIN_SONGS[0]!,
      tempo: [
        { time: 0, bpm: 60 },
        { time: 2, bpm: 120 },
      ],
    });
    expect(toQ(1)).toBeCloseTo(1);
    expect(toQ(3)).toBeCloseTo(4);
  });
});

describe('armadura de las canciones incluidas', () => {
  it('Para Elisa va sin alteraciones (la menor), no en Mi mayor por sus Re#', () => {
    expect(guessFifths(BUILTIN_SONGS[2]!.notes)).toBe(0);
    expect(guessFifths(BUILTIN_SONGS[1]!.notes)).toBe(0);
  });
});
