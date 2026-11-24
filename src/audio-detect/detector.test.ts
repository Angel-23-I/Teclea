import { describe, expect, it } from 'vitest';
import { BUILTIN_SONGS } from '../core/song/builtin';
import { NoteDetector } from './detector';
import { renderNotes } from './testSignals';
import { runDetector as run, scoreDetection as score } from './testSignals';

const SR = 48000;

describe('NoteDetector', () => {
  it('detecta una melodía de notas sueltas a tiempo', () => {
    const notes = [60, 62, 64, 65, 67, 69, 71, 72].map((pitch, i) => ({
      pitch,
      start: 0.2 + i * 0.35,
      duration: 0.3,
    }));
    const s = score(notes, run(renderNotes(notes, SR, 3.4)));
    expect(s.misses).toEqual([]);
    expect(s.extra).toEqual([]);
    expect(s.delay).toBeLessThan(60);
  });

  it('separa las notas de un acorde (sin calibrar, acordes sin octavas)', () => {
    // Las octavas dentro de un acorde necesitan las huellas medidas: ver calibration.test.ts.
    const chords = [
      [60, 64, 67],
      [57, 60, 64],
      [53, 57, 60],
      [55, 59, 62],
      [50, 53, 57],
    ];
    const notes = chords.flatMap((c, i) =>
      c.map((pitch) => ({ pitch, start: 0.2 + i * 0.7, duration: 0.6 })),
    );
    const s = score(notes, run(renderNotes(notes, SR, 3.9)));
    expect(s.hits / notes.length).toBeGreaterThanOrEqual(0.93);
    expect(s.extra.length).toBeLessThanOrEqual(1);
  });

  it('reconoce los extremos del teclado: graves y agudos', () => {
    const notes = [36, 40, 45, 84, 91, 96].map((pitch, i) => ({
      pitch,
      start: 0.2 + i * 0.5,
      duration: 0.45,
    }));
    const s = score(notes, run(renderNotes(notes, SR, 3.4)));
    expect(s.misses.map((n) => n.pitch)).toEqual([]);
    expect(s.extra.length).toBeLessThanOrEqual(1);
  });

  it('cuenta cada golpe de una nota repetida', () => {
    // Mi5 - Re#5 - Mi5 - Re#5 - Mi5, como el inicio de Para Elisa
    const notes = [76, 75, 76, 75, 76].map((pitch, i) => ({ pitch, start: 0.2 + i * 0.234, duration: 0.22 }));
    const s = score(notes, run(renderNotes(notes, SR, 1.6)));
    expect(s.misses).toEqual([]);
    expect(s.extra).toEqual([]);
  });

  it('toca Para Elisa con las dos manos y acierta casi todo', () => {
    const elisa = BUILTIN_SONGS.find((s) => s.id === 'builtin-para-elisa')!;
    const notes = elisa.notes.map((n) => ({ pitch: n.pitch, start: n.start + 0.3, duration: n.duration }));
    const s = score(notes, run(renderNotes(notes, SR, elisa.duration + 1)));
    expect(s.hits / notes.length).toBeGreaterThanOrEqual(0.9);
    expect(s.extra.length / notes.length).toBeLessThanOrEqual(0.1);
  });

  it('funciona con el teclado desafinado si se le indica la afinación', () => {
    const notes = [57, 60, 64, 69].map((pitch, i) => ({ pitch, start: 0.2 + i * 0.4, duration: 0.35 }));
    const s = score(notes, run(renderNotes(notes, SR, 2, { a4: 449 }), { a4: 449 }));
    expect(s.misses).toEqual([]);
    expect(s.extra).toEqual([]);
  });

  it('no se inventa notas con ruido o silencio', () => {
    expect(run(renderNotes([], SR, 2, { noise: 0.0003 }))).toEqual([]);
    expect(run(renderNotes([], SR, 2, { noise: 0.01 }), { noiseRms: 0.006 })).toEqual([]);
  });

  it('suelta las notas al terminar', () => {
    const events = run(renderNotes([{ pitch: 64, start: 0.2, duration: 0.4 }], SR, 1.2));
    const off = events.find((e) => e.type === 'off' && e.pitch === 64);
    expect(off).toBeDefined();
    expect(off!.time).toBeGreaterThan(0.55);
    expect(off!.time).toBeLessThan(0.8);
  });

  it('va mucho más rápido que el tiempo real', () => {
    const notes = Array.from({ length: 40 }, (_, i) => ({
      pitch: 48 + (i % 24),
      start: i * 0.25,
      duration: 0.4,
    }));
    const signal = renderNotes(notes, SR, 10);
    const t0 = performance.now();
    run(signal);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(2500); // 10 s de audio en menos de 2,5 s
  });
});

describe('NoteDetector: otros casos', () => {
  it('funciona igual a 44,1 kHz', () => {
    const sr = 44100;
    const notes = [48, 55, 60, 64, 67, 72].map((pitch, i) => ({
      pitch,
      start: 0.2 + i * 0.35,
      duration: 0.3,
    }));
    const s = score(notes, run(renderNotes(notes, sr, 2.5), { sampleRate: sr }, sr));
    expect(s.misses).toEqual([]);
    expect(s.extra).toEqual([]);
  });

  it('las notas esperadas por la canción ayudan a encontrar una octava escondida', () => {
    const notes = [53, 65].map((pitch) => ({ pitch, start: 0.2, duration: 0.6 }));
    const signal = renderNotes(notes, SR, 1);
    const without = score(notes, run(signal));
    const det = new NoteDetector({ sampleRate: SR });
    det.setExpected([53, 65]);
    const events = [];
    for (let i = 0; i < signal.length; i += 128) events.push(...det.push(signal.subarray(i, i + 128)));
    const withHint = score(notes, events);
    expect(withHint.hits).toBeGreaterThanOrEqual(without.hits);
    expect(withHint.hits).toBe(2);
  });
});
