import { KEY_MAX, KEY_MIN } from '../core/music/notes';
import { BaseProvider } from './types';

/** Fila inferior (Z…) desde Do; las teclas de la fila de en medio son las negras. */
const LOWER_ROW = [
  'KeyZ',
  'KeyS',
  'KeyX',
  'KeyD',
  'KeyC',
  'KeyV',
  'KeyG',
  'KeyB',
  'KeyH',
  'KeyN',
  'KeyJ',
  'KeyM',
  'Comma',
  'KeyL',
  'Period',
];
/** Fila superior (Q…) una octava más arriba; los números son las negras. */
const UPPER_ROW = [
  'KeyQ',
  'Digit2',
  'KeyW',
  'Digit3',
  'KeyE',
  'KeyR',
  'Digit5',
  'KeyT',
  'Digit6',
  'KeyY',
  'Digit7',
  'KeyU',
  'KeyI',
  'Digit9',
  'KeyO',
  'Digit0',
  'KeyP',
];

export const MIN_PC_OCTAVE = -1;
export const MAX_PC_OCTAVE = 2;

/** Nota más grave del teclado del ordenador: Do3 (48) con desplazamiento 0. */
export function pcBasePitch(octave: number): number {
  return 48 + 12 * octave;
}

/** Código de tecla física → nota MIDI. Usa posiciones físicas, así funciona igual en teclados españoles. */
export function pcKeyMap(octave: number): Map<string, number> {
  const base = pcBasePitch(octave);
  const map = new Map<string, number>();
  LOWER_ROW.forEach((code, i) => map.set(code, base + i));
  UPPER_ROW.forEach((code, i) => map.set(code, base + 12 + i));
  for (const [code, pitch] of map) if (pitch < KEY_MIN || pitch > KEY_MAX) map.delete(code);
  return map;
}

const codeLabel = (code: string) =>
  code.startsWith('Key')
    ? code.slice(3)
    : code.startsWith('Digit')
      ? code.slice(5)
      : code === 'Comma'
        ? ','
        : code === 'Period'
          ? '.'
          : code;

/** Nota → letra que hay que pulsar (la fila superior gana cuando dos teclas dan la misma nota). */
export function pcKeyLabels(octave: number): Map<number, string> {
  const labels = new Map<number, string>();
  for (const [code, pitch] of pcKeyMap(octave)) {
    if (!labels.has(pitch) || UPPER_ROW.includes(code)) labels.set(pitch, codeLabel(code));
  }
  return labels;
}

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return (
    !!el &&
    (el.isContentEditable ||
      el.tagName === 'TEXTAREA' ||
      (el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'range'))
  );
};

/** Toca notas con el teclado del ordenador: útil para probar sin instrumento. */
export class PcKeyboardProvider extends BaseProvider {
  readonly kind = 'pc-keyboard' as const;
  readonly label = 'Teclado del ordenador';
  private map = pcKeyMap(0);
  /** Tecla física pulsada → nota que sonó (por si cambia la octava con la tecla pulsada). */
  private down = new Map<string, number>();
  private running = false;

  setOctave(octave: number): void {
    this.releaseAll();
    this.map = pcKeyMap(octave);
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
    window.addEventListener('blur', this.releaseAll);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.releaseAll();
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    window.removeEventListener('blur', this.releaseAll);
  }

  private onDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
    const pitch = this.map.get(e.code);
    if (pitch == null) return;
    e.preventDefault();
    if (e.repeat || this.down.has(e.code)) return;
    this.down.set(e.code, pitch);
    this.emit('on', pitch, 1, e.timeStamp || performance.now());
  };

  private onUp = (e: KeyboardEvent): void => {
    const pitch = this.down.get(e.code);
    if (pitch == null) return;
    this.down.delete(e.code);
    this.emit('off', pitch, 0, e.timeStamp || performance.now());
  };

  private releaseAll = (): void => {
    for (const pitch of this.down.values()) this.emit('off', pitch, 0);
    this.down.clear();
  };
}
