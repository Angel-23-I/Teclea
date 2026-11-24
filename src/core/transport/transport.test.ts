import { describe, expect, it } from 'vitest';
import type { SongNote } from '../song/types';
import { NoteScheduler, soundingAt } from './scheduler';
import { Transport } from './transport';

class FakeClock {
  t = 100;
  now() {
    return this.t;
  }
}

const note = (pitch: number, start: number, duration = 0.5): SongNote => ({
  pitch,
  start,
  duration,
  hand: 'right',
  track: 0,
  finger: null,
});

describe('Transport', () => {
  it('avanza con el reloj, pausa y reanuda', () => {
    const clock = new FakeClock();
    const tr = new Transport(clock, -1, 10);
    expect(tr.time).toBe(-1);
    tr.play();
    clock.t += 2;
    expect(tr.time).toBeCloseTo(1);
    tr.pause();
    clock.t += 5;
    expect(tr.time).toBeCloseTo(1);
    tr.play();
    clock.t += 1;
    expect(tr.time).toBeCloseTo(2);
  });

  it('respeta la velocidad y la cambia sin saltos', () => {
    const clock = new FakeClock();
    const tr = new Transport(clock, 0, 10);
    tr.play();
    clock.t += 2;
    tr.setSpeed(0.5);
    expect(tr.time).toBeCloseTo(2);
    clock.t += 2;
    expect(tr.time).toBeCloseTo(3);
    tr.setSpeed(9);
    expect(tr.speed).toBe(1.5);
  });

  it('salta al inicio del bucle y se para al final', () => {
    const clock = new FakeClock();
    const tr = new Transport(clock, 0, 10);
    tr.setLoop({ start: 2, end: 4 });
    tr.seek(3);
    tr.play();
    clock.t += 1.5;
    expect(tr.update()).toBe('looped');
    expect(tr.time).toBeCloseTo(2.5);

    tr.setLoop(null);
    tr.seek(9.5);
    clock.t += 1;
    expect(tr.update()).toBe('ended');
    expect(tr.state).toBe('paused');
    expect(tr.time).toBe(10);
    tr.play(); // volver a reproducir desde el principio
    expect(tr.time).toBe(0);
  });

  it('no deja buscar fuera de la canción', () => {
    const tr = new Transport(new FakeClock(), -1.5, 10);
    tr.seek(-20);
    expect(tr.time).toBe(-1.5);
    tr.seek(50);
    expect(tr.time).toBe(10);
  });
});

describe('Transport con límite (modo espera)', () => {
  it('se detiene en el límite y sigue desde ahí al moverlo, sin saltar', () => {
    const clock = new FakeClock();
    const tr = new Transport(clock, 0, 10);
    tr.setLimit(1);
    tr.play();
    clock.t += 0.5;
    expect(tr.time).toBeCloseTo(0.5);
    expect(tr.holding).toBe(false);
    clock.t += 3; // la persona tarda 2,5 s en tocar
    expect(tr.time).toBe(1);
    expect(tr.holding).toBe(true);
    tr.setLimit(2);
    expect(tr.time).toBe(1);
    clock.t += 0.25;
    expect(tr.time).toBeCloseTo(1.25);
    tr.setLimit(Infinity);
    clock.t += 2;
    expect(tr.time).toBeCloseTo(3.25);
  });

  it('nunca retrocede si el límite queda atrás', () => {
    const clock = new FakeClock();
    const tr = new Transport(clock, 0, 10);
    tr.seek(3);
    tr.play();
    tr.setLimit(2);
    clock.t += 1;
    expect(tr.time).toBe(3);
  });
});

describe('NoteScheduler', () => {
  const notes = [note(60, 0), note(64, 0), note(67, 0.5), note(72, 1)];

  it('envía cada nota una vez, con antelación y ajustada a la velocidad', () => {
    const sent: [number, number, number][] = [];
    const s = new NoteScheduler(notes, { scheduleNote: (n, d, dur) => sent.push([n.pitch, d, dur]) }, 0.1);
    s.reset(-0.05);
    expect(s.tick(-0.05, 1)).toBe(2);
    expect(s.tick(0, 1)).toBe(0);
    expect(s.tick(0.46, 0.5)).toBe(1); // horizonte 0.46 + 0.1 × 0.5
    expect(sent[2]![1]).toBeCloseTo(0.08); // (0.5 - 0.46) / 0.5
    expect(sent[2]![2]).toBeCloseTo(1); // 0.5 / 0.5
  });

  it('se recoloca tras un salto y no suelta notas atrasadas', () => {
    const sent: number[] = [];
    const s = new NoteScheduler(notes, { scheduleNote: (n) => sent.push(n.pitch) }, 0.1);
    s.reset(0.5);
    s.tick(0.5, 1);
    expect(sent).toEqual([67]);
    s.reset(0);
    s.tick(0.95, 1); // las de 0 y 0.5 ya pasaron hace más de 0.25 s
    expect(sent).toEqual([67, 72]);
  });
});

describe('soundingAt', () => {
  it('devuelve las notas que suenan en un instante', () => {
    const ns = [note(60, 0, 2), note(62, 0.5, 0.2), note(64, 1, 1)];
    expect(
      soundingAt(ns, 1.2)
        .map((n) => n.pitch)
        .sort(),
    ).toEqual([60, 64]);
    expect(
      soundingAt(ns, 0.6)
        .map((n) => n.pitch)
        .sort(),
    ).toEqual([60, 62]);
    expect(soundingAt(ns, 3)).toEqual([]);
  });
});
