import type { Instrument } from '../audio/pianoSynth';
import { activeNotes, type Song, type SongNote } from '../core/song/types';
import { NoteScheduler, type NoteSink } from '../core/transport/scheduler';
import { Transport, type Clock, type LoopRange, type TransportState } from '../core/transport/transport';

/** Segundos de cuenta atrás antes de la primera nota (darán sitio a las notas que caen). */
export const LEAD_IN = 1.5;
const TICK_MS = 25;

const performanceClock: Clock = { now: () => performance.now() / 1000 };

/** Por qué ha cambiado la posición de golpe: lo usa la práctica para volver a dejar notas pendientes. */
export type JumpReason = 'load' | 'seek' | 'loop';

export interface PlaybackSnapshot {
  state: TransportState;
  /** Detenida en una nota esperando a que la toques (modo espera). */
  holding: boolean;
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
  private snapshot: PlaybackSnapshot = {
    state: 'stopped',
    holding: false,
    speed: 1,
    loop: null,
    revision: 0,
  };
  private song: Song | null = null;
  /** Qué notas toca la app (en práctica, solo las de la otra mano). */
  private playFilter: (n: SongNote) => boolean = () => true;
  private tickListeners = new Set<(time: number) => void>();
  private jumpListeners = new Set<(time: number, reason: JumpReason) => void>();
  private wasHolding = false;
  private clicks: SongNote[] = [];
  private clickSink: NoteSink | null = null;
  private clickScheduler: NoteScheduler | null = null;

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

  get speed(): number {
    return this.transport?.speed ?? 1;
  }

  get playing(): boolean {
    return this.transport?.state === 'playing';
  }

  /**
   * Segundo de canción que correspondía a un instante pasado (`performance.now()` en ms).
   * Sirve para saber cuándo se tocó una nota que llega con algo de retraso.
   */
  timeAt(perfMs: number): number {
    const tr = this.transport;
    if (!tr) return 0;
    if (tr.state !== 'playing' || tr.holding) return tr.time;
    const ago = (this.clock.now() * 1000 - perfMs) / 1000;
    return tr.time - Math.max(0, ago) * tr.speed;
  }

  /** Elige qué notas toca la app. Se vuelve a programar desde la posición actual. */
  setPlayFilter(filter: (n: SongNote) => boolean): void {
    this.playFilter = filter;
    this.instrument.releaseAll();
    this.rebuildScheduler();
  }

  /** Clics del metrónomo de la canción actual (vacío = sin metrónomo). */
  setClicks(clicks: SongNote[], sink: NoteSink): void {
    this.clicks = clicks;
    this.clickSink = sink;
    this.rebuildClicks();
  }

  /** Modo espera: la canción no pasa de este segundo hasta que se mueva el límite. */
  setLimit(limit: number): void {
    this.transport?.setLimit(limit);
    const holding = this.transport?.holding ?? false;
    if (holding !== this.wasHolding) {
      this.wasHolding = holding;
      this.emit();
    }
  }

  /** Se llama en cada paso del reloj interno (~40 veces por segundo) mientras suena. */
  onTick(listener: (time: number) => void): () => void {
    this.tickListeners.add(listener);
    return () => this.tickListeners.delete(listener);
  }

  /** Se llama al cargar una canción, saltar a otra posición o repetir el tramo. */
  onJump(listener: (time: number, reason: JumpReason) => void): () => void {
    this.jumpListeners.add(listener);
    return () => this.jumpListeners.delete(listener);
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
    this.jumped('load');
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
    this.clickScheduler?.reset(this.transport.time);
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
    this.clickScheduler?.reset(this.transport.time);
    this.jumped('seek');
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
    this.scheduler = new NoteScheduler(activeNotes(this.song).filter(this.playFilter), this.instrument);
    this.scheduler.reset(this.transport.time);
  }

  private rebuildClicks(): void {
    this.clickScheduler =
      this.clickSink && this.clicks.length ? new NoteScheduler(this.clicks, this.clickSink) : null;
    this.clickScheduler?.reset(this.transport?.time ?? 0);
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
      this.clickScheduler?.reset(tr.loop?.start ?? tr.time);
      this.jumped('loop');
      this.emit();
    } else if (result === 'ended') {
      this.halt();
      this.emit();
      return;
    }
    this.tickListeners.forEach((l) => l(tr.time));
    if (tr.holding !== this.wasHolding) {
      this.wasHolding = tr.holding;
      this.emit();
    }
    // Lo que empieza en el límite (junto a la nota que esperamos) o después aún no suena: sonará
    // a la vez que la toques.
    const horizon = Math.min(tr.loop?.end ?? Infinity, tr.limit - 1e-4);
    this.scheduler?.tick(tr.time, tr.speed, horizon);
    this.clickScheduler?.tick(tr.time, tr.speed, horizon);
  };

  private jumped(reason: JumpReason): void {
    const t = this.transport?.time ?? 0;
    this.jumpListeners.forEach((l) => l(t, reason));
  }

  private emit(): void {
    const tr = this.transport;
    this.snapshot = {
      state: tr?.state ?? 'stopped',
      holding: tr?.holding ?? false,
      speed: tr?.speed ?? 1,
      loop: tr?.loop ?? null,
      revision: this.snapshot.revision + 1,
    };
    this.listeners.forEach((l) => l());
  }
}
