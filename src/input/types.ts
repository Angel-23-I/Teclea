/**
 * Contrato común para todas las fuentes de notas: audio (cable o micrófono), MIDI, teclado del PC
 * y ratón o pantalla táctil. La práctica y la puntuación solo escuchan eventos `NoteEvent`,
 * sin saber de dónde vienen.
 */

export type InputSourceKind = 'audio-line' | 'audio-mic' | 'midi' | 'pc-keyboard' | 'pointer';

export interface NoteEvent {
  type: 'on' | 'off';
  pitch: number;
  /** Fuerza de 0 a 1 (1 si la fuente no la distingue, como el PSR-E283). */
  velocity: number;
  /** Instante en ms (reloj de `performance.now()`), ya compensado con la latencia medida. */
  time: number;
  source: InputSourceKind;
}

export type NoteListener = (event: NoteEvent) => void;

export interface NoteInputProvider {
  readonly kind: InputSourceKind;
  /** Nombre para mostrar, p. ej. "Cable · Entrada de línea (Realtek)". */
  readonly label: string;
  start(): Promise<void>;
  stop(): void;
  /** Devuelve la función para darse de baja. */
  subscribe(listener: NoteListener): () => void;
}

/** Base con la gestión de suscriptores, común a todos los proveedores. */
export abstract class BaseProvider implements NoteInputProvider {
  abstract readonly kind: InputSourceKind;
  abstract readonly label: string;
  private listeners = new Set<NoteListener>();

  abstract start(): Promise<void>;
  abstract stop(): void;

  subscribe(listener: NoteListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  protected emit(type: NoteEvent['type'], pitch: number, velocity = 1, time = performance.now()): void {
    const event: NoteEvent = { type, pitch, velocity, time, source: this.kind };
    this.listeners.forEach((l) => l(event));
  }
}
