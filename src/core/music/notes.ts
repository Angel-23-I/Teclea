/**
 * Teoría básica de notas y del teclado del Yamaha PSR-E283.
 *
 * Usamos números MIDI (Do central = Do4 = 60). El PSR-E283 tiene 61 teclas,
 * de MIDI 36 a 96 (Do2 a Do7 con la convención Do4 = 60).
 */

export const KEY_MIN = 36;
export const KEY_MAX = 96;
export const KEY_COUNT = KEY_MAX - KEY_MIN + 1; // 61

export type NamingStyle = 'latin' | 'english';

const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);
const NAMES: Record<NamingStyle, readonly string[]> = {
  latin: ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'],
  english: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
};

const pitchClass = (midi: number): number => ((midi % 12) + 12) % 12;

export function isBlackKey(midi: number): boolean {
  return BLACK_PITCH_CLASSES.has(pitchClass(midi));
}

/** Nombre sin octava: "Do#", "C#". */
export function pitchName(midi: number, style: NamingStyle = 'latin'): string {
  return NAMES[style][pitchClass(midi)]!;
}

/** Nombre con octava: 60 → "Do4" o "C4". */
export function noteName(midi: number, style: NamingStyle = 'latin'): string {
  return pitchName(midi, style) + (Math.floor(midi / 12) - 1);
}

/** Frecuencia en Hz. `a4` permite seguir la afinación del teclado (427–453 Hz en el PSR-E283). */
export function midiToFrequency(midi: number, a4 = 440): number {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

/** Nota MIDI más cercana a una frecuencia y su desviación en cents. */
export function frequencyToMidi(hz: number, a4 = 440): { midi: number; cents: number } {
  const exact = 69 + 12 * Math.log2(hz / a4);
  const midi = Math.round(exact);
  return { midi, cents: Math.round((exact - midi) * 100) };
}

/** Las 61 teclas del PSR-E283 en orden. */
export const KEYBOARD_61: readonly number[] = Array.from({ length: KEY_COUNT }, (_, i) => KEY_MIN + i);

export const WHITE_KEY_COUNT = KEYBOARD_61.filter((m) => !isBlackKey(m)).length; // 36
