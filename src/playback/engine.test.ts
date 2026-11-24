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

describe('PlaybackEngine en modo espera', () => {
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

  it('toca solo la otra mano, se detiene en el límite y no adelanta lo que va con la nota esperada', async () => {
    const inst = new FakeInstrument();
    const engine = new PlaybackEngine(inst, clock);
    const song = BUILTIN_SONGS[0]!; // escala a dos manos
    engine.load(song);
    engine.setPlayFilter((n) => n.hand === 'left');
    engine.setLimit(0); // la primera nota de la derecha empieza en 0
    await engine.play();
    advance(3);
    expect(engine.time).toBe(0);
    expect(engine.getSnapshot().holding).toBe(true);
    expect(inst.played).toEqual([]); // el Do3 de la izquierda espera junto al Do4
    engine.setLimit(Infinity);
    advance(0.1);
    expect(inst.played.map((n) => n.pitch)).toEqual([48]);
    expect(inst.played.every((n) => n.hand === 'left')).toBe(true);
  });

  it('avisa de los saltos y calcula el instante de una nota que llegó con retraso', async () => {
    const engine = new PlaybackEngine(new FakeInstrument(), clock);
    const jumps: string[] = [];
    engine.onJump((t, reason) => jumps.push(`${reason}@${t.toFixed(1)}`));
    engine.load(BUILTIN_SONGS[0]!);
    engine.seek(2);
    await engine.play();
    advance(1);
    expect(engine.timeAt(now * 1000 - 200)).toBeCloseTo(engine.time - 0.2);
    expect(jumps).toEqual([`load@${(-LEAD_IN).toFixed(1)}`, 'seek@2.0']);
  });
});
