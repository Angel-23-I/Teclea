import type { CalibrationData, FromWorker, ToWorker } from '../audio-detect/workerProtocol';
import { BaseProvider, type InputSourceKind } from './types';

export type AudioMode = 'line' | 'mic';

export interface AudioDevice {
  id: string;
  label: string;
}

export type AudioStatus =
  | { kind: 'off' }
  | { kind: 'starting' }
  | { kind: 'listening'; deviceLabel: string; sampleRate: number }
  | { kind: 'denied' }
  | { kind: 'unsupported' }
  | { kind: 'error'; message: string };

export interface AudioLevel {
  /** RMS de 0 a 1. */
  rms: number;
  /** Activación de cada una de las 61 teclas según el detector. */
  activations: number[];
  /** Notas que el detector da por sonando. */
  active: number[];
}

export interface AudioStartOptions {
  mode: AudioMode;
  deviceId: string | null;
  calibration: CalibrationData | null;
  sensitivity: number;
}

/**
 * Escucha tu teclado por la entrada de línea o el micrófono y convierte el sonido en notas.
 * El audio se captura con un AudioWorklet y se analiza en un Web Worker.
 */
export class AudioInputProvider extends BaseProvider {
  kind: InputSourceKind = 'audio-line';
  label = 'Audio';
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private worker: Worker | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private monitorGain: GainNode | null = null;
  private latencyMs = 0;
  private status: AudioStatus = { kind: 'off' };
  private statusListeners = new Set<(s: AudioStatus) => void>();
  private levelListeners = new Set<(l: AudioLevel) => void>();
  private onsetListeners = new Set<(time: number, pitch: number) => void>();
  private recordId = 0;
  private recordWaiters = new Map<number, (s: Float32Array) => void>();
  private sounding = new Set<number>();

  get currentStatus(): AudioStatus {
    return this.status;
  }

  get sampleRate(): number {
    return this.ctx?.sampleRate ?? 48000;
  }

  onStatus(l: (s: AudioStatus) => void): () => void {
    this.statusListeners.add(l);
    return () => this.statusListeners.delete(l);
  }

  onLevel(l: (level: AudioLevel) => void): () => void {
    this.levelListeners.add(l);
    return () => this.levelListeners.delete(l);
  }

  /** Avisa de cada inicio de nota con su instante sin compensar (para medir la latencia). */
  onRawOnset(l: (time: number, pitch: number) => void): () => void {
    this.onsetListeners.add(l);
    return () => this.onsetListeners.delete(l);
  }

  /** Entradas de audio del sistema. Los nombres solo aparecen después de dar permiso. */
  static async listDevices(): Promise<AudioDevice[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const all = await navigator.mediaDevices.enumerateDevices();
    return all
      .filter((d) => d.kind === 'audioinput')
      .map((d, i) => ({ id: d.deviceId, label: d.label || `Entrada de audio ${i + 1}` }));
  }

  /** Sin opciones de start() no se puede arrancar: usa `startWith`. */
  async start(): Promise<void> {}

  async startWith(opts: AudioStartOptions): Promise<void> {
    this.stop();
    this.kind = opts.mode === 'line' ? 'audio-line' : 'audio-mic';
    this.latencyMs = opts.calibration?.latencyMs ?? 0;
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === 'undefined') {
      this.setStatus({ kind: 'unsupported' });
      return;
    }
    this.setStatus({ kind: 'starting' });
    try {
      // Sin cancelación de eco, supresión de ruido ni control de ganancia: deforman las notas.
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: opts.deviceId ? { exact: opts.deviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
    } catch (e) {
      const name = (e as DOMException)?.name;
      this.setStatus(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? { kind: 'denied' }
          : {
              kind: 'error',
              message:
                name === 'NotFoundError'
                  ? 'No se encuentra esa entrada de audio.'
                  : 'No se pudo abrir la entrada de audio.',
            },
      );
      return;
    }
    try {
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      this.ctx = ctx;
      await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}audio/capture-worklet.js`);
      const source = ctx.createMediaStreamSource(this.stream);
      this.source = source;
      const node = new AudioWorkletNode(ctx, 'teclea-capture', { numberOfInputs: 1, numberOfOutputs: 1 });
      // Algunos navegadores solo procesan nodos conectados a la salida: se conecta en silencio.
      const mute = ctx.createGain();
      mute.gain.value = 0;
      source.connect(node).connect(mute).connect(ctx.destination);
      this.monitorGain = ctx.createGain();
      this.monitorGain.gain.value = 0;
      source.connect(this.monitorGain).connect(ctx.destination);

      const worker = new Worker(new URL('../audio-detect/analysis.worker.ts', import.meta.url), {
        type: 'module',
      });
      this.worker = worker;
      worker.onmessage = (ev: MessageEvent<FromWorker>) => this.onWorker(ev.data);
      const channel = new MessageChannel();
      this.post(
        {
          type: 'init',
          sampleRate: ctx.sampleRate,
          port: channel.port1,
          calibration: opts.calibration,
          sensitivity: opts.sensitivity,
        },
        [channel.port1],
      );
      node.port.postMessage({ port: channel.port2 }, [channel.port2]);
      if (ctx.state === 'suspended') await ctx.resume();

      const track = this.stream.getAudioTracks()[0];
      this.label = `${opts.mode === 'line' ? 'Cable' : 'Micrófono'} · ${track?.label || 'entrada de audio'}`;
      this.setStatus({
        kind: 'listening',
        deviceLabel: track?.label || 'Entrada de audio',
        sampleRate: ctx.sampleRate,
      });
    } catch (e) {
      console.error(e);
      this.stop();
      this.setStatus({ kind: 'error', message: 'No se pudo preparar el análisis de audio.' });
    }
  }

  stop(): void {
    for (const pitch of this.sounding) this.emit('off', pitch, 0);
    this.sounding.clear();
    this.worker?.terminate();
    this.worker = null;
    this.source?.disconnect();
    this.source = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    for (const resolve of this.recordWaiters.values()) resolve(new Float32Array(0));
    this.recordWaiters.clear();
    if (this.status.kind !== 'off') this.setStatus({ kind: 'off' });
  }

  /** Reenvía el sonido de la entrada a los altavoces del PC (útil con cable: el teclado se queda mudo). */
  setMonitor(volume: number): void {
    if (this.monitorGain && this.ctx)
      this.monitorGain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.02);
  }

  setCalibration(calibration: CalibrationData | null): void {
    this.latencyMs = calibration?.latencyMs ?? 0;
    this.post({ type: 'calibration', calibration });
  }

  setSensitivity(value: number): void {
    this.post({ type: 'sensitivity', value });
  }

  /** Notas que la canción espera ahora: el detector las encuentra antes y se confunde menos. */
  setExpected(pitches: number[] | null): void {
    this.post({ type: 'expected', pitches });
  }

  /** Graba audio sin procesar (para la calibración). */
  record(seconds: number): Promise<Float32Array> {
    if (!this.worker) return Promise.resolve(new Float32Array(0));
    const id = ++this.recordId;
    return new Promise((resolve) => {
      this.recordWaiters.set(id, resolve);
      this.post({ type: 'record', id, seconds });
    });
  }

  /** Reproduce un clic por los altavoces dentro de `delay` segundos; devuelve su instante en ms. */
  click(delay: number, accent = false): number {
    const ctx = this.ctx;
    if (!ctx) return performance.now() + delay * 1000;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = accent ? 1760 : 1320;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.08);
    return performance.now() + (delay + (ctx.outputLatency || 0)) * 1000;
  }

  private onWorker(msg: FromWorker): void {
    if (msg.type === 'notes') {
      const now = performance.now();
      for (const e of msg.events) {
        if (e.type === 'on') {
          this.sounding.add(e.pitch);
          this.onsetListeners.forEach((l) => l(now, e.pitch));
        } else this.sounding.delete(e.pitch);
        this.emit(e.type, e.pitch, e.velocity || 1, now - this.latencyMs);
      }
    } else if (msg.type === 'level') {
      const level = { rms: msg.rms, activations: msg.activations, active: msg.active };
      this.levelListeners.forEach((l) => l(level));
    } else if (msg.type === 'recording') {
      this.recordWaiters.get(msg.id)?.(msg.samples);
      this.recordWaiters.delete(msg.id);
    }
  }

  private post(msg: ToWorker, transfer: Transferable[] = []): void {
    this.worker?.postMessage(msg, transfer);
  }

  private setStatus(s: AudioStatus): void {
    this.status = s;
    this.statusListeners.forEach((l) => l(s));
  }
}
