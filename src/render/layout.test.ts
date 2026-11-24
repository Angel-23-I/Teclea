import { describe, expect, it } from 'vitest';
import type { SongNote } from '../core/song/types';
import { keyAt, keyboardLayout, noteRect, stageMetrics, timeToY, visibleRange } from './layout';

const note = (pitch: number, start: number, duration = 0.5): SongNote => ({
  pitch,
  start,
  duration,
  hand: 'right',
  track: 0,
  finger: null,
});

describe('keyboardLayout', () => {
  const keys = keyboardLayout(720);

  it('reparte 36 teclas blancas en todo el ancho', () => {
    expect(keys[36]).toMatchObject({ x: 0, width: 20, black: false });
    expect(keys[96]!.x + keys[96]!.width).toBeCloseTo(720);
  });

  it('centra las negras entre dos blancas', () => {
    const cs = keys[37]!; // Do#2, entre Do2 y Re2
    expect(cs.black).toBe(true);
    expect(cs.x + cs.width / 2).toBeCloseTo(20);
    expect(cs.width).toBeCloseTo(12);
  });
});

describe('stageMetrics', () => {
  it('limita la altura del teclado', () => {
    expect(stageMetrics(800, 300, 3).keyboardHeight).toBe(80);
    expect(stageMetrics(800, 1200, 3).keyboardHeight).toBe(160);
    const m = stageMetrics(800, 600, 3);
    expect(m.keyboardHeight).toBe(120);
    expect(m.hitY).toBe(480);
    expect(m.pxPerSecond).toBe(160);
  });
});

describe('noteRect', () => {
  const keys = keyboardLayout(720);
  const m = stageMetrics(720, 600, 3); // hitY 480, 160 px/s

  it('la nota toca la línea justo cuando empieza a sonar', () => {
    const r = noteRect(note(60, 2, 0.5), 2, m, keys)!;
    expect(r.y + r.height).toBeCloseTo(480);
    expect(r.height).toBeCloseTo(80); // 0.5 s × 160 px/s
    expect(timeToY(2, 2, m)).toBe(480);
  });

  it('cae desde arriba y se recorta al entrar en la tecla', () => {
    const before = noteRect(note(60, 3, 0.5), 1, m, keys)!;
    expect(before.y + before.height).toBeCloseTo(480 - 2 * 160);
    expect(before.clipped).toBe(false);
    const during = noteRect(note(60, 2, 0.5), 2.25, m, keys)!;
    expect(during.clipped).toBe(true);
    expect(during.y + during.height).toBe(480);
    expect(during.height).toBeCloseTo(40);
  });

  it('no dibuja notas que ya pasaron o aún no se ven', () => {
    expect(noteRect(note(60, 0, 0.5), 1, m, keys)).toBeNull();
    expect(noteRect(note(60, 10, 0.5), 1, m, keys)).toBeNull();
    expect(noteRect(note(20, 1, 0.5), 1, m, keys)).toBeNull(); // fuera del teclado
  });
});

describe('visibleRange', () => {
  it('encuentra las notas cercanas al instante actual', () => {
    const ns = [0, 1, 2, 3, 4, 5, 6, 20].map((t) => note(60, t));
    expect(visibleRange(ns, 3, 2, 1)).toEqual([2, 6]);
    expect(visibleRange(ns, -5, 2)).toEqual([0, 0]);
  });
});

describe('keyAt', () => {
  const keys = keyboardLayout(720);
  const m = stageMetrics(720, 600, 3); // teclado de y = 480 a 600

  it('da prioridad a las negras en su parte alta y a las blancas abajo', () => {
    expect(keyAt(20, 500, m, keys)).toBe(37); // Do#2, zona de negras
    expect(keyAt(20, 590, m, keys)).toBe(38); // Re2: por debajo de las negras
    expect(keyAt(5, 500, m, keys)).toBe(36); // Do2
  });

  it('no devuelve tecla fuera del teclado', () => {
    expect(keyAt(100, 300, m, keys)).toBeNull();
    expect(keyAt(100, 700, m, keys)).toBeNull();
  });
});
