import * as Tone from 'tone';
import type { NoteSink } from '../core/transport/scheduler';
import type { SongNote } from '../core/song/types';

export interface Instrument extends NoteSink {
  /** Desbloquea el audio; los navegadores exigen hacerlo tras un clic o una tecla. */
  unlock(): Promise<void>;
  releaseAll(): void;
}

/**
 * Sonido de piano sintetizado con Tone.js. Es provisional: más adelante se puede cambiar por
 * muestras de piano reales sin tocar el resto de la app (misma interfaz `Instrument`).
 */
export class PianoSynth implements Instrument {
  private synth: Tone.PolySynth | null = null;

  private build(): Tone.PolySynth {
    const reverb = new Tone.Reverb({ decay: 1.8, wet: 0.16 }).toDestination();
    const tone = new Tone.Filter({ frequency: 3200, type: 'lowpass', rolloff: -12 }).connect(reverb);
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'fattriangle', count: 2, spread: 10 },
      envelope: { attack: 0.004, decay: 1.4, sustain: 0.1, release: 0.8 },
    }).connect(tone);
    synth.maxPolyphony = 64;
    synth.volume.value = -10;
    return synth;
  }

  async unlock(): Promise<void> {
    await Tone.start();
    this.synth ??= this.build();
  }

  scheduleNote(note: SongNote, delay: number, duration: number): void {
    if (!this.synth) return;
    const freq = Tone.Frequency(note.pitch, 'midi').toFrequency();
    this.synth.triggerAttackRelease(freq, Math.max(0.05, duration), Tone.now() + delay, 0.75);
  }

  releaseAll(): void {
    this.synth?.releaseAll();
  }
}
