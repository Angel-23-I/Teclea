import type { InputSourceKind, NoteEvent, NoteInputProvider, NoteListener } from './types';

/**
 * Junta todas las entradas en un único flujo de notas y sabe qué teclas están pulsadas.
 * Si dos fuentes pulsan la misma nota, se suelta cuando la sueltan las dos.
 */
export class InputHub {
  private providers = new Map<InputSourceKind, { provider: NoteInputProvider; unsubscribe: () => void }>();
  private held = new Map<number, Set<InputSourceKind>>();
  private listeners = new Set<NoteListener>();

  add(provider: NoteInputProvider): void {
    this.remove(provider.kind);
    const unsubscribe = provider.subscribe(this.handle);
    this.providers.set(provider.kind, { provider, unsubscribe });
  }

  remove(kind: InputSourceKind): void {
    const entry = this.providers.get(kind);
    if (!entry) return;
    entry.unsubscribe();
    this.providers.delete(kind);
    // Suelta lo que esa fuente tuviera pulsado.
    for (const [pitch, sources] of this.held) {
      if (sources.delete(kind) && sources.size === 0) {
        this.held.delete(pitch);
        this.notify({ type: 'off', pitch, velocity: 0, time: performance.now(), source: kind });
      }
    }
  }

  /** Notas pulsadas ahora mismo. */
  pressed(): ReadonlySet<number> {
    return new Set(this.held.keys());
  }

  subscribe(listener: NoteListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  handle = (e: NoteEvent): void => {
    const sources = this.held.get(e.pitch);
    if (e.type === 'on') {
      if (sources?.has(e.source)) return;
      const first = !sources || sources.size === 0;
      this.held.set(e.pitch, new Set([...(sources ?? []), e.source]));
      if (first) this.notify(e);
    } else {
      if (!sources?.delete(e.source)) return;
      if (sources.size === 0) {
        this.held.delete(e.pitch);
        this.notify(e);
      }
    }
  };

  private notify(e: NoteEvent): void {
    this.listeners.forEach((l) => l(e));
  }
}
