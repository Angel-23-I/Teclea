import type { Instrument } from '../audio/pianoSynth';
import { activeNotes, type Song } from '../core/song/types';
import { NoteScheduler } from '../core/transport/scheduler';
import { Transport, type Clock, type LoopRange, type TransportState } from '../core/transport/transport';

/** Segundos de cuenta atrás antes de la primera nota (darán sitio a las notas que caen). */
export const LEAD_IN = 1.5;
const TICK_MS = 25;

const performanceClock: Clock = { now: () => performance.now() / 1000 };

export interface PlaybackSnapshot {
  state: TransportState;
  speed: number;
  loop: LoopRange | null;
  /** Cambia cada vez que se carga una canción o se salta (para que la UI se entere). */
  revision: number;
}

/** Une transporte, programador de notas e instrumento. Una sola instancia para toda la app. */
export class PlaybackEngine {
  private transport: Transport | null = null;
  private scheduler: NoteScheduler | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<() => void>();
  private snapshot: PlaybackSnapshot = { state: 'stopped', speed: 1, loop: null, revision: 0 };
  private song: Song | null = null;

  constructor(
    private readonly instrument: Instrument,
    private readonly clock: Clock = performanceClock,
  ) {}

  get time(): number {
    return this.transport?.time ?? 0;
  }

  get currentSong(): Song | null {
    return this.song;
  }

  /** Carga una canción nueva desde el principio. */
  load(song: Song): void {
    const speed = this.transport?.speed ?? 1;
    this.halt();
    this.song = song;
    this.transport = new Transport(
      this.clock,
      Math.min(0, song.notes[0]?.start ?? 0) - LEAD_IN,
      song.duration,
    );
    this.transport.setSpeed(speed);
    this.rebuildScheduler();
    this.emit();
  }

  /** Actualiza la canción actual (p. ej. al desactivar una pista) sin perder la posición. */
  update(song: Song): void {
    if (!this.transport || song.id !== this.song?.id) return this.load(song);
    this.song = song;
    this.instrument.releaseAll();
    this.rebuildScheduler();
    this.emit();
  }

  async play(): Promise<void> {
    if (!this.transport) return;
    await this.instrument.unlock();
    this.transport.play();
    this.scheduler?.reset(this.transport.time);
    this.timer ??= setInterval(this.tick, TICK_MS);
    this.tick();
    this.emit();
  }

  pause(): void {
    this.transport?.pause();
    this.halt();
    this.emit();
  }

  togglePlay(): void {
    if (this.transport?.state === 'playing') this.pause();
    else void this.play();
  }

  /** Vuelve a la cuenta atrás del principio. */
  restart(): void {
    if (!this.transport) return;
    this.seek(this.transport.startTime);
  }

  seek(time: number): void {
    if (!this.transport) return;
    this.transport.seek(time);
    this.instrument.releaseAll();
    this.scheduler?.reset(this.transport.time);
    this.emit();
  }

  setSpeed(speed: number): void {
    this.transport?.setSpeed(speed);
    this.emit();
  }

  setLoop(loop: LoopRange | null): void {
    this.transport?.setLoop(loop);
    this.emit();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): PlaybackSnapshot => this.snapshot;

  private rebuildScheduler(): void {
    if (!this.song || !this.transport) return;
    this.scheduler = new NoteScheduler(activeNotes(this.song), this.instrument);
    this.scheduler.reset(this.transport.time);
  }

  private halt(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.instrument.releaseAll();
  }

  private tick = (): void => {
    const tr = this.transport;
    if (!tr) return;
    const result = tr.update();
    if (result === 'looped') {
      this.instrument.releaseAll();
      // Desde el inicio del tramo, no desde la posición actual: si no, se pierden las notas
      // que caen justo en el inicio (el salto siempre llega unos milisegundos tarde).
      this.scheduler?.reset(tr.loop?.start ?? tr.time);
      this.emit();
    } else if (result === 'ended') {
      this.halt();
      this.emit();
      return;
    }
    this.scheduler?.tick(tr.time, tr.speed, tr.loop?.end);
  };

  private emit(): void {
    const tr = this.transport;
    this.snapshot = {
      state: tr?.state ?? 'stopped',
      speed: tr?.speed ?? 1,
      loop: tr?.loop ?? null,
      revision: this.snapshot.revision + 1,
    };
    this.listeners.forEach((l) => l());
  }
}
