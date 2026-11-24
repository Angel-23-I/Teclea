import * as Tone from 'tone';
import { ACCENT } from '../core/song/beats';
import type { SongNote } from '../core/song/types';
import type { NoteSink } from '../core/transport/scheduler';

/** Convierte un volumen 0–1 en decibelios (0 = silencio). */
export const toDb = (v: number) => (v <= 0.001 ? -Infinity : 20 * Math.log10(v));

/** Clic de metrónomo: corto y agudo, más alto en el primer tiempo. Suena aparte del piano. */
export class MetronomeClick implements NoteSink {
  private synth: Tone.Synth | null = null;
  private volume = 0.6;

  private ensure(): Tone.Synth | null {
    if (this.synth) return this.synth;
    if (Tone.getContext().state !== 'running') return null;
    this.synth = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.001, decay: 0.035, sustain: 0, release: 0.01 },
    }).toDestination();
    this.synth.volume.value = toDb(this.volume) - 14;
    return this.synth;
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.synth) this.synth.volume.value = toDb(v) - 14;
  }

  scheduleNote(note: SongNote, delay: number): void {
    const s = this.ensure();
    if (!s || this.volume <= 0) return;
    s.triggerAttackRelease(
      note.pitch === ACCENT ? 1760 : 1175,
      0.03,
      Tone.now() + delay,
      note.pitch === ACCENT ? 1 : 0.6,
    );
  }
}
