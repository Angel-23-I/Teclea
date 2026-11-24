import { BaseProvider } from './types';

/** Notas tocadas con el ratón o el dedo sobre el teclado de la pantalla. */
export class PointerProvider extends BaseProvider {
  readonly kind = 'pointer' as const;
  readonly label = 'Ratón o pantalla táctil';
  private down = new Map<number, number>(); // puntero → nota

  async start(): Promise<void> {}

  stop(): void {
    for (const id of [...this.down.keys()]) this.release(id);
  }

  /** El puntero `pointerId` pasa a tocar `pitch` (o ninguna nota si es null). */
  move(pointerId: number, pitch: number | null): void {
    const current = this.down.get(pointerId);
    if (current === pitch) return;
    if (current != null) this.emit('off', current, 0);
    if (pitch == null) {
      this.down.delete(pointerId);
      return;
    }
    this.down.set(pointerId, pitch);
    this.emit('on', pitch, 0.8);
  }

  release(pointerId: number): void {
    this.move(pointerId, null);
  }
}
