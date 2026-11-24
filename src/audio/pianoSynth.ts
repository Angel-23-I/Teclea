import * as Tone from 'tone';
import type { NoteSink } from '../core/transport/scheduler';
import type { SongNote } from '../core/song/types';
import { toDb } from './metronome';

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
  /** Voces de la canción. */
  private synth: Tone.PolySynth | null = null;
  /** Voces de lo que toca la persona: aparte, para que parar la canción no corte sus notas. */
  private live: Tone.PolySynth | null = null;
  private unlocking: Promise<void> | null = null;
  private volume = 0.8;

  private build(): void {
    const reverb = new Tone.Reverb({ decay: 1.8, wet: 0.16 }).toDestination();
    const tone = new Tone.Filter({ frequency: 3200, type: 'lowpass', rolloff: -12 }).connect(reverb);
    const make = () => {
      const s = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'fattriangle', count: 2, spread: 10 },
        envelope: { attack: 0.004, decay: 1.4, sustain: 0.1, release: 0.8 },
      }).connect(tone);
      s.maxPolyphony = 64;
      s.volume.value = this.db();
      return s;
    };
    this.synth = make();
    this.live = make();
  }

  private db(): number {
    return toDb(this.volume) - 8;
  }

  /** Volumen 0–1 de la canción y de tus notas. */
  setVolume(v: number): void {
    this.volume = v;
    for (const s of [this.synth, this.live]) if (s) s.volume.value = this.db();
  }

  unlock(): Promise<void> {
    this.unlocking ??= Tone.start()
      .then(() => this.build())
      .catch((e: unknown) => {
        // Sin gesto del usuario el navegador lo rechaza: se reintenta en el siguiente.
        this.unlocking = null;
        throw e;
      });
    return this.unlocking;
  }

  /** Empieza a sonar una nota tocada en directo (teclado del PC, ratón o MIDI). */
  noteOn(pitch: number, velocity = 0.8): void {
    this.unlock()
      .then(() => this.live?.triggerAttack(Tone.Frequency(pitch, 'midi').toFrequency(), Tone.now(), velocity))
      .catch(() => undefined);
  }

  noteOff(pitch: number): void {
    this.unlock()
      .then(() => this.live?.triggerRelease(Tone.Frequency(pitch, 'midi').toFrequency(), Tone.now()))
      .catch(() => undefined);
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
