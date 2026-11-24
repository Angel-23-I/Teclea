import { measureStartsInQuarters } from './measures';
import { averagePitch, sortNotes, type Finger, type Hand, type Song, type SongNote } from './types';

/** [nota MIDI, inicio en negras, duración en negras, mano, dedo] */
type BeatNote = [number, number, number, Hand, Finger | null];

interface BeatSong {
  id: string;
  title: string;
  composer: string;
  bpm: number;
  timeSignature: [number, number];
  /** Negras de anacrusa antes del primer compás completo. */
  pickup: number;
  notes: BeatNote[];
}

const R: Hand = 'right';
const L: Hand = 'left';

function sequence(list: [number, number, Finger | null][], hand: Hand, start = 0): BeatNote[] {
  const out: BeatNote[] = [];
  let b = start;
  for (const [pitch, dur, finger] of list) {
    out.push([pitch, b, dur, hand, finger]);
    b += dur;
  }
  return out;
}

function buildSong(def: BeatSong): Song {
  const spq = 60 / def.bpm;
  const notes: SongNote[] = sortNotes(
    def.notes.map(([pitch, beat, dur, hand, finger]) => ({
      pitch,
      start: beat * spq,
      duration: dur * spq * 0.96,
      hand,
      track: hand === 'right' ? 0 : 1,
      finger,
    })),
  );
  const duration = Math.max(...notes.map((n) => n.start + n.duration));
  const [beats, beatType] = def.timeSignature;
  const right = notes.filter((n) => n.track === 0);
  const left = notes.filter((n) => n.track === 1);
  return {
    id: def.id,
    title: def.title,
    composer: def.composer,
    source: 'builtin',
    tracks: [
      { name: 'Mano derecha', role: 'right', noteCount: right.length, averagePitch: averagePitch(right) },
      { name: 'Mano izquierda', role: 'left', noteCount: left.length, averagePitch: averagePitch(left) },
    ],
    notes,
    measures: [
      ...(def.pickup ? [0] : []),
      ...measureStartsInQuarters([{ quarter: 0, beats, beatType }], duration / spq - def.pickup).map(
        (q) => (q + def.pickup) * spq,
      ),
    ].filter((t) => t <= duration),
    timeSignature: def.timeSignature,
    tempo: [{ time: 0, bpm: def.bpm }],
    duration,
    shiftedNotes: 0,
    warnings: [],
  };
}

const scaleUp = [60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60];
const scaleFingersR: Finger[] = [1, 2, 3, 1, 2, 3, 4, 5, 4, 3, 2, 1, 3, 2, 1];
const scaleFingersL: Finger[] = [5, 4, 3, 2, 1, 3, 2, 1, 2, 3, 1, 2, 3, 4, 5];

const SCALE: BeatSong = {
  id: 'builtin-escala-do',
  title: 'Escala de Do mayor',
  composer: 'Ejercicio a dos manos',
  bpm: 76,
  timeSignature: [4, 4],
  pickup: 0,
  notes: [
    ...sequence(
      scaleUp.map((p, i) => [p, i === 14 ? 2 : 1, scaleFingersR[i]!]),
      R,
    ),
    ...sequence(
      scaleUp.map((p, i) => [p - 12, i === 14 ? 2 : 1, scaleFingersL[i]!]),
      L,
    ),
  ],
};

const ODE: BeatSong = {
  id: 'builtin-himno-alegria',
  title: 'Himno de la alegría',
  composer: 'Ludwig van Beethoven',
  bpm: 100,
  timeSignature: [4, 4],
  pickup: 0,
  notes: [
    ...sequence(
      [
        [64, 1, 3],
        [64, 1, 3],
        [65, 1, 4],
        [67, 1, 5],
        [67, 1, 5],
        [65, 1, 4],
        [64, 1, 3],
        [62, 1, 2],
        [60, 1, 1],
        [60, 1, 1],
        [62, 1, 2],
        [64, 1, 3],
        [64, 1.5, 3],
        [62, 0.5, 2],
        [62, 2, 2],
        [64, 1, 3],
        [64, 1, 3],
        [65, 1, 4],
        [67, 1, 5],
        [67, 1, 5],
        [65, 1, 4],
        [64, 1, 3],
        [62, 1, 2],
        [60, 1, 1],
        [60, 1, 1],
        [62, 1, 2],
        [64, 1, 3],
        [62, 1.5, 2],
        [60, 0.5, 1],
        [60, 2, 1],
      ],
      R,
    ),
    [48, 0, 4, L, 5],
    [55, 4, 4, L, 1],
    [48, 8, 4, L, 5],
    [55, 12, 4, L, 1],
    [48, 16, 4, L, 5],
    [55, 20, 4, L, 1],
    [48, 24, 4, L, 5],
    [55, 28, 2, L, 1],
    [48, 30, 2, L, 5],
  ],
};

// Para Elisa, compases 1–8. En semicorcheas: [índice, nota, duración, mano, dedo].
const ELISA_16THS: [number, number, number, Hand, Finger | null][] = [
  [0, 76, 1, R, 5],
  [1, 75, 1, R, 4],
  [2, 76, 1, R, 5],
  [3, 75, 1, R, 4],
  [4, 76, 1, R, 5],
  [5, 71, 1, R, 2],
  [6, 74, 1, R, 4],
  [7, 72, 1, R, 3],
  [8, 69, 2, R, 1],
  [8, 45, 6, L, 5],
  [9, 52, 5, L, 2],
  [10, 57, 4, L, 1],
  [11, 60, 1, R, null],
  [12, 64, 1, R, null],
  [13, 69, 1, R, null],
  [14, 71, 2, R, null],
  [14, 40, 6, L, null],
  [15, 52, 5, L, null],
  [16, 56, 4, L, null],
  [17, 64, 1, R, null],
  [18, 68, 1, R, null],
  [19, 71, 1, R, null],
  [20, 72, 2, R, null],
  [20, 45, 6, L, 5],
  [21, 52, 5, L, 2],
  [22, 57, 4, L, 1],
  [23, 64, 1, R, null],
  [24, 76, 1, R, null],
  [25, 75, 1, R, null],
  [26, 76, 1, R, 5],
  [27, 75, 1, R, 4],
  [28, 76, 1, R, 5],
  [29, 71, 1, R, 2],
  [30, 74, 1, R, 4],
  [31, 72, 1, R, 3],
  [32, 69, 2, R, 1],
  [32, 45, 6, L, 5],
  [33, 52, 5, L, 2],
  [34, 57, 4, L, 1],
  [35, 60, 1, R, null],
  [36, 64, 1, R, null],
  [37, 69, 1, R, null],
  [38, 71, 2, R, null],
  [38, 40, 6, L, null],
  [39, 52, 5, L, null],
  [40, 56, 4, L, null],
  [41, 64, 1, R, null],
  [42, 72, 1, R, null],
  [43, 71, 1, R, null],
  [44, 69, 6, R, 1],
  [44, 45, 6, L, 5],
  [45, 52, 5, L, 2],
  [46, 57, 4, L, 1],
];

const ELISA: BeatSong = {
  id: 'builtin-para-elisa',
  title: 'Para Elisa (inicio)',
  composer: 'Ludwig van Beethoven',
  bpm: 64,
  timeSignature: [3, 8],
  pickup: 0.5,
  notes: ELISA_16THS.map(([i, pitch, dur, hand, finger]) => [pitch, i * 0.25, dur * 0.25, hand, finger]),
};

export const BUILTIN_SONGS: readonly Song[] = [SCALE, ODE, ELISA].map(buildSong);
