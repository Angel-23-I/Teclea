/**
 * Contrato común para todas las fuentes de notas: audio (cable o micrófono), MIDI y teclado del PC.
 * La práctica y la puntuación solo escuchan eventos `NoteEvent`, sin saber de dónde vienen.
 */

export type InputSourceKind = 'audio-line' | 'audio-mic' | 'midi' | 'pc-keyboard';

export interface NoteEvent {
  type: 'on' | 'off';
  pitch: number;
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
