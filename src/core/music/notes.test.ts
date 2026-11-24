import { describe, expect, it } from 'vitest';
import {
  KEYBOARD_61,
  KEY_COUNT,
  WHITE_KEY_COUNT,
  frequencyToMidi,
  isBlackKey,
  midiToFrequency,
  noteName,
} from './notes';

describe('notes', () => {
  it('nombra las notas en latino e inglés con Do4 = 60', () => {
    expect(noteName(60)).toBe('Do4');
    expect(noteName(61, 'latin')).toBe('Do#4');
    expect(noteName(69, 'english')).toBe('A4');
    expect(noteName(36)).toBe('Do2');
    expect(noteName(96)).toBe('Do7');
  });

  it('reconoce teclas negras', () => {
    expect(isBlackKey(60)).toBe(false);
    expect(isBlackKey(61)).toBe(true);
    expect(isBlackKey(70)).toBe(true);
    expect(isBlackKey(71)).toBe(false);
  });

  it('describe el teclado de 61 teclas del PSR-E283', () => {
    expect(KEY_COUNT).toBe(61);
    expect(KEYBOARD_61).toHaveLength(61);
    expect(WHITE_KEY_COUNT).toBe(36);
  });

  it('convierte entre frecuencia y nota', () => {
    expect(midiToFrequency(69)).toBeCloseTo(440);
    expect(midiToFrequency(60)).toBeCloseTo(261.63, 1);
    expect(frequencyToMidi(440)).toEqual({ midi: 69, cents: 0 });
    expect(frequencyToMidi(446).midi).toBe(69);
    expect(frequencyToMidi(446).cents).toBe(23);
    // Con el teclado afinado a 453 Hz, 453 Hz sigue siendo La4.
    expect(frequencyToMidi(453, 453)).toEqual({ midi: 69, cents: 0 });
  });
});
