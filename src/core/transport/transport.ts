/** Reloj en segundos (en la app: el reloj de Web Audio; en los tests: uno falso). */
export interface Clock {
  now(): number;
}

export type TransportState = 'stopped' | 'playing' | 'paused';

export interface LoopRange {
  start: number;
  end: number;
}

export const MIN_SPEED = 0.25;
export const MAX_SPEED = 1.5;

/**
 * Posición de reproducción de una canción. No hace sonar nada: solo sabe en qué segundo de la
 * canción estamos, a qué velocidad y si hay un tramo en bucle.
 */
export class Transport {
  private anchorClock = 0;
  private anchorSong = 0;
  private _state: TransportState = 'stopped';
  private _speed = 1;
  private _loop: LoopRange | null = null;

  /**
   * @param startTime segundo de canción donde empieza (negativo = cuenta atrás antes de la primera nota)
   * @param duration fin de la canción en segundos
   */
  constructor(
    private readonly clock: Clock,
    readonly startTime: number,
    readonly duration: number,
  ) {
    this.anchorSong = startTime;
  }

  get state(): TransportState {
    return this._state;
  }

  get speed(): number {
    return this._speed;
  }

  get loop(): LoopRange | null {
    return this._loop;
  }

  /** Segundo actual de la canción. */
  get time(): number {
    if (this._state !== 'playing') return this.anchorSong;
    return this.anchorSong + (this.clock.now() - this.anchorClock) * this._speed;
  }

  get ended(): boolean {
    return this.time >= this.duration;
  }

  play(): void {
    if (this._state === 'playing') return;
    if (this.anchorSong >= this.duration) this.anchorSong = this._loop?.start ?? this.startTime;
    this.anchorClock = this.clock.now();
    this._state = 'playing';
  }

  pause(): void {
    if (this._state !== 'playing') return;
    this.anchorSong = this.time;
    this._state = 'paused';
  }

  stop(): void {
    this._state = 'stopped';
    this.anchorSong = this.startTime;
  }

  seek(time: number): void {
    this.anchorSong = Math.max(this.startTime, Math.min(this.duration, time));
    this.anchorClock = this.clock.now();
  }

  setSpeed(speed: number): void {
    const t = this.time;
    this._speed = Math.max(MIN_SPEED, Math.min(MAX_SPEED, speed));
    this.anchorSong = t;
    this.anchorClock = this.clock.now();
  }

  setLoop(loop: LoopRange | null): void {
    if (loop && loop.end - loop.start < 0.05) throw new Error('El tramo del bucle es demasiado corto.');
    this._loop = loop;
  }

  /**
   * Hay que llamarlo a menudo mientras suena. Aplica el bucle y la pausa al final.
   * Devuelve 'looped' cuando ha saltado al principio del tramo y 'ended' al terminar la canción.
   */
  update(): 'looped' | 'ended' | null {
    if (this._state !== 'playing') return null;
    const t = this.time;
    if (this._loop && t >= this._loop.end) {
      this.seek(this._loop.start + (t - this._loop.end));
      return 'looped';
    }
    if (t >= this.duration) {
      this.anchorSong = this.duration;
      this._state = 'paused';
      return 'ended';
    }
    return null;
  }
}
