import type { Song, SongNote } from './types';

/** Tono de los clics del metrónomo: 1 = primer tiempo del compás, 0 = los demás. */
export const ACCENT = 1;

function bpmAt(song: Song, time: number): number {
  let bpm = song.tempo[0]?.bpm ?? 120;
  for (const t of song.tempo) if (t.time <= time + 1e-6) bpm = t.bpm;
  return bpm;
}

const click = (start: number, accent: boolean): SongNote => ({
  pitch: accent ? ACCENT : 0,
  start,
  duration: 0.05,
  hand: 'right',
  track: -1,
  finger: null,
});

/**
 * Clics del metrónomo: uno por pulso (según el denominador del compás), con acento en el primero.
 * @param countIn clics durante la cuenta atrás antes de la primera nota
 * @param all clics durante toda la canción
 * @param leadIn segundos de cuenta atrás antes del segundo 0
 */
export function beatClicks(song: Song, opts: { countIn: boolean; all: boolean; leadIn: number }): SongNote[] {
  const out: SongNote[] = [];
  const [beats, beatType] = song.timeSignature;
  const period = (t: number) => (60 / bpmAt(song, t)) * (4 / beatType);
  const measures = song.measures.length ? song.measures : [0];

  if (opts.countIn) {
    const first = measures[0]!;
    const p = period(first);
    const lead: SongNote[] = [];
    for (let t = first - p; t >= -opts.leadIn - 1e-6; t -= p) lead.unshift(click(t, false));
    out.push(...lead);
  }
  if (opts.all) {
    measures.forEach((start, i) => {
      if (start > song.duration) return;
      const p = period(start);
      const end = measures[i + 1] ?? start + beats * p;
      const n = Math.max(1, Math.round((end - start) / p));
      for (let k = 0; k < n; k++) out.push(click(start + (k * (end - start)) / n, k === 0));
    });
  }
  return out;
}
