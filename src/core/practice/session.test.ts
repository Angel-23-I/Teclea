import { describe, expect, it } from 'vitest';
import type { Hand, SongNote } from '../song/types';
import { PracticeSession } from './session';

const note = (pitch: number, start: number, hand: Hand = 'right'): SongNote => ({
  pitch,
  start,
  duration: 0.4,
  hand,
  track: hand === 'right' ? 0 : 1,
  finger: null,
});

// Do4 (derecha) con Do3 (izquierda), luego un acorde Mi4+Sol4, luego Re4.
const song = () => [note(48, 0, 'left'), note(60, 0), note(64, 1), note(67, 1), note(62, 2)];

describe('modo espera', () => {
  it('espera en cada nota de la mano elegida y avanza al acertar', () => {
    const notes = song();
    const s = new PracticeSession(notes, { mode: 'wait', hands: 'right' });
    expect(s.statusOf(notes[0]!)).toBe('auto'); // la izquierda la toca la app
    expect(s.nextPendingTime()).toBe(0);
    expect(s.waitingGroup(0).map((n) => n.pitch)).toEqual([60]);
    expect(s.onNoteOn(60, 0)).toMatchObject({ kind: 'hit', pitch: 60 });
    expect(s.nextPendingTime()).toBe(1);
    expect(s.waitingGroup(0.5)).toEqual([]); // aún no ha llegado
    expect(s.waitingGroup(1).map((n) => n.pitch)).toEqual([64, 67]);
  });

  it('un acorde se completa nota a nota y una tecla equivocada cuenta como fallo', () => {
    const s = new PracticeSession(song(), { mode: 'wait', hands: 'right' });
    s.onNoteOn(60, 0);
    expect(s.onNoteOn(65, 1)?.kind).toBe('wrong');
    expect(s.stats.streak).toBe(0);
    s.onNoteOn(67, 1);
    expect(s.waitingGroup(1).map((n) => n.pitch)).toEqual([64]);
    s.onNoteOn(64, 1);
    expect(s.nextPendingTime()).toBe(2);
  });

  it('acepta el siguiente acorde aunque se toque antes de tiempo', () => {
    const s = new PracticeSession(song(), { mode: 'wait', hands: 'right' });
    s.onNoteOn(60, 0);
    expect(s.onNoteOn(64, 0.2)?.kind).toBe('hit'); // la canción aún va por 0,2 s
  });

  it('con las dos manos espera también a la izquierda', () => {
    const s = new PracticeSession(song(), { mode: 'wait', hands: 'both' });
    expect(s.waitingGroup(0).map((n) => n.pitch)).toEqual([48, 60]);
  });
});

describe('modo ritmo', () => {
  it('puntúa la precisión de cada nota', () => {
    const s = new PracticeSession(song(), { mode: 'rhythm', hands: 'right' });
    expect(s.onNoteOn(60, 0.03)).toMatchObject({ kind: 'hit', quality: 'perfect' });
    expect(s.onNoteOn(64, 0.92)).toMatchObject({ kind: 'hit', quality: 'good' });
    expect(s.onNoteOn(67, 1.15)).toMatchObject({ kind: 'hit', quality: 'late' });
    expect(s.onNoteOn(62, 1.6)?.kind).toBe('wrong'); // demasiado pronto: fuera del margen
  });

  it('cuenta como fallo la nota que pasa sin tocarse', () => {
    const s = new PracticeSession(song(), { mode: 'rhythm', hands: 'right' });
    s.onNoteOn(60, 0);
    expect(s.collectMisses(1.1)).toEqual([]); // aún dentro del margen
    expect(s.collectMisses(1.25).map((j) => j.pitch)).toEqual([64, 67]);
    expect(s.stats.misses).toBe(2);
    expect(s.collectMisses(1.3)).toEqual([]); // no se cuentan dos veces
  });

  it('resume la práctica con precisión, estrellas y desvío', () => {
    const s = new PracticeSession(song(), { mode: 'rhythm', hands: 'right' });
    s.onNoteOn(60, 0.04);
    s.onNoteOn(64, 1.02);
    s.onNoteOn(67, 0.98);
    s.onNoteOn(62, 2.06);
    const sum = s.summary(0.5);
    expect(sum).toMatchObject({ accuracy: 100, stars: 3, hits: 4, total: 4 });
    expect(sum.meanOffsetMs).toBe(70); // 0,035 s de canción a media velocidad
  });
});

describe('sesión', () => {
  it('al saltar atrás vuelve a dejar las notas pendientes; hacia delante las da por saltadas', () => {
    const notes = song();
    const s = new PracticeSession(notes, { mode: 'wait', hands: 'right' });
    s.onNoteOn(60, 0);
    s.reset(0);
    expect(s.statusOf(notes[1]!)).toBe('pending');
    s.reset(1.5);
    expect(s.statusOf(notes[2]!)).toBe('skip');
    expect(s.nextPendingTime()).toBe(2);
  });

  it('da las notas esperadas al detector', () => {
    const s = new PracticeSession(song(), { mode: 'rhythm', hands: 'both' });
    expect(s.expectedPitches(-0.1)).toEqual([48, 60]);
    expect(s.expectedPitches(0.8)).toEqual([64, 67]);
  });

  it('en modo escuchar no se practica nada', () => {
    const notes = song();
    const s = new PracticeSession(notes, { mode: 'listen', hands: 'both' });
    expect(s.statusOf(notes[1]!)).toBe('auto');
    expect(s.onNoteOn(60, 0)).toBeNull();
    expect(s.total).toBe(0);
  });
});
