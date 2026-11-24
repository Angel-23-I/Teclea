import { BaseProvider } from './types';

export interface ParsedMidiNote {
  type: 'on' | 'off';
  pitch: number;
  velocity: number;
  channel: number;
}

/** Interpreta un mensaje MIDI. Solo nos interesan Note On / Note Off (Note On con fuerza 0 es Off). */
export function parseMidiMessage(data: ArrayLike<number>): ParsedMidiNote | null {
  if (data.length < 3) return null;
  const status = data[0]! & 0xf0;
  const channel = data[0]! & 0x0f;
  const pitch = data[1]! & 0x7f;
  const vel = data[2]! & 0x7f;
  if (status === 0x90 && vel > 0) return { type: 'on', pitch, velocity: vel / 127, channel };
  if (status === 0x80 || (status === 0x90 && vel === 0)) return { type: 'off', pitch, velocity: 0, channel };
  return null;
}

export interface MidiDevice {
  id: string;
  name: string;
}

export type MidiStatus =
  | { kind: 'idle' }
  | { kind: 'unsupported' }
  | { kind: 'requesting' }
  | { kind: 'denied' }
  | { kind: 'ready'; devices: MidiDevice[] };

/** Ningún dispositivo concreto: escuchar todos los teclados conectados. */
export const ALL_DEVICES = 'all';

/** Teclados MIDI por USB o Bluetooth con la Web MIDI API (Chrome, Edge y WebView2). */
export class MidiInputProvider extends BaseProvider {
  readonly kind = 'midi' as const;
  label = 'MIDI';
  private access: MIDIAccess | null = null;
  private selected: string = ALL_DEVICES;
  private attached = new Set<MIDIInput>();
  private status: MidiStatus = { kind: 'idle' };
  private statusListeners = new Set<(s: MidiStatus) => void>();
  /** Notas sonando por dispositivo, para soltarlas si se desconecta. */
  private sounding = new Map<string, Set<number>>();

  get currentStatus(): MidiStatus {
    return this.status;
  }

  onStatus(listener: (s: MidiStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  select(id: string): void {
    this.selected = id;
    if (this.access) this.attach();
  }

  async start(): Promise<void> {
    if (this.access) return;
    if (!('requestMIDIAccess' in navigator)) {
      this.setStatus({ kind: 'unsupported' });
      return;
    }
    this.setStatus({ kind: 'requesting' });
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
    } catch {
      this.setStatus({ kind: 'denied' });
      return;
    }
    this.access.onstatechange = () => this.attach();
    this.attach();
  }

  stop(): void {
    this.detachAll();
    if (this.access) this.access.onstatechange = null;
    this.access = null;
    this.setStatus({ kind: 'idle' });
  }

  private attach(): void {
    if (!this.access) return;
    this.detachAll();
    const devices: MidiDevice[] = [];
    this.access.inputs.forEach((input) => {
      if (input.state !== 'connected') return;
      devices.push({ id: input.id, name: input.name || 'Teclado MIDI' });
      if (this.selected !== ALL_DEVICES && input.id !== this.selected) return;
      input.onmidimessage = (e) => this.onMessage(input.id, e);
      this.attached.add(input);
    });
    const names = [...this.attached].map((i) => i.name || 'Teclado MIDI');
    this.label = names.length ? `MIDI · ${names.join(', ')}` : 'MIDI';
    this.setStatus({ kind: 'ready', devices });
  }

  private detachAll(): void {
    for (const input of this.attached) {
      input.onmidimessage = null;
      for (const pitch of this.sounding.get(input.id) ?? []) this.emit('off', pitch, 0);
      this.sounding.delete(input.id);
    }
    this.attached.clear();
  }

  private onMessage(deviceId: string, e: MIDIMessageEvent): void {
    if (!e.data) return;
    const msg = parseMidiMessage(e.data);
    if (!msg) return;
    const set = this.sounding.get(deviceId) ?? new Set<number>();
    this.sounding.set(deviceId, set);
    if (msg.type === 'on') set.add(msg.pitch);
    else set.delete(msg.pitch);
    this.emit(msg.type, msg.pitch, msg.velocity, e.timeStamp || performance.now());
  }

  private setStatus(s: MidiStatus): void {
    this.status = s;
    this.statusListeners.forEach((l) => l(s));
  }
}
