import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Instrument } from '../audio/pianoSynth';
import { BUILTIN_SONGS } from '../core/song/builtin';
import { setTrackRole, type SongNote } from '../core/song/types';
import { LEAD_IN, PlaybackEngine } from './engine';

class FakeInstrument implements Instrument {
  played: SongNote[] = [];
  releases = 0;
  async unlock() {}
  scheduleNote(n: SongNote) {
    this.played.push(n);
  }
  releaseAll() {
    this.releases++;
  }
}

describe('PlaybackEngine', () => {
  let now = 0;
  const clock = { now: () => now };
  beforeEach(() => {
    vi.useFakeTimers();
    now = 0;
  });
  afterEach(() => vi.useRealTimers());

  const advance = (sec: number) => {
    for (let i = 0; i < sec * 40; i++) {
      now += 0.025;
      vi.advanceTimersByTime(25);
    }
  };

  it('toca la canción entera desde la cuenta atrás y se para al final', async () => {
    const inst = new FakeInstrument();
    const engine = new PlaybackEngine(inst, clock);
    const song = BUILTIN_SONGS[1]!; // Himno de la alegría
    engine.load(song);
    expect(engine.time).toBe(-LEAD_IN);
    await engine.play();
    advance(song.duration + LEAD_IN + 0.5);
    expect(inst.played).toHaveLength(song.notes.length);
    expect(engine.getSnapshot().state).toBe('paused');
  });

  it('no toca las pistas desactivadas', async () => {
    const inst = new FakeInstrument();
    const engine = new PlaybackEngine(inst, clock);
    const song = setTrackRole(BUILTIN_SONGS[1]!, 1, 'off');
    engine.load(song);
    await engine.play();
    advance(song.duration + LEAD_IN + 0.5);
    expect(inst.played.every((n) => n.track === 0)).toBe(true);
    expect(inst.played.length).toBe(song.notes.filter((n) => n.track === 0).length);
  });

  it('repite el tramo en bucle', async () => {
    const inst = new FakeInstrument();
    const engine = new PlaybackEngine(inst, clock);
    const song = BUILTIN_SONGS[0]!; // escala, una nota por mano cada 60/76 s
    engine.load(song);
    const spq = 60 / 76;
    engine.setLoop({ start: 0, end: 2 * spq });
    engine.seek(0);
    await engine.play();
    advance(4 * spq - 0.2); // casi dos vueltas completas
    // 2 notas por vuelta y por mano = 8 notas
    expect(inst.played).toHaveLength(8);
    expect(engine.getSnapshot().state).toBe('playing');
  });
});
