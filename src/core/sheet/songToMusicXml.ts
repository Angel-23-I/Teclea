import { activeNotes, type Song, type SongNote } from '../song/types';

/**
 * Convierte una canción (MIDI o incluida) en una partitura MusicXML sencilla para dibujarla:
 * dos pentagramas (mano derecha arriba, izquierda abajo), notas cuantizadas a semicorcheas o a
 * tresillos de corchea según cada compás, acordes por pentagrama y ligaduras entre compases.
 * Mantiene un compás de partitura por cada `song.measures`, para poder seguir la reproducción.
 */

/** Divisiones por negra: permite semicorcheas (3) y tresillos de corchea (4). */
export const DIVISIONS = 12;

type Grid = 'binary' | 'triplet';
const GRID_STEP: Record<Grid, number> = { binary: 3, triplet: 4 };

interface Piece {
  div: number;
  type: string;
  dots: number;
  triplet: boolean;
}

const BINARY_PIECES: Piece[] = [
  { div: 72, type: 'whole', dots: 1, triplet: false },
  { div: 48, type: 'whole', dots: 0, triplet: false },
  { div: 36, type: 'half', dots: 1, triplet: false },
  { div: 24, type: 'half', dots: 0, triplet: false },
  { div: 18, type: 'quarter', dots: 1, triplet: false },
  { div: 12, type: 'quarter', dots: 0, triplet: false },
  { div: 9, type: 'eighth', dots: 1, triplet: false },
  { div: 6, type: 'eighth', dots: 0, triplet: false },
  { div: 3, type: '16th', dots: 0, triplet: false },
];
const TRIPLET_PIECES: Piece[] = [
  { div: 48, type: 'whole', dots: 0, triplet: false },
  { div: 24, type: 'half', dots: 0, triplet: false },
  { div: 12, type: 'quarter', dots: 0, triplet: false },
  { div: 8, type: 'quarter', dots: 0, triplet: true },
  { div: 4, type: 'eighth', dots: 0, triplet: true },
  { div: 2, type: '16th', dots: 0, triplet: true },
];

/** Reparte una duración en figuras escribibles (ligadas entre sí). */
export function splitDuration(div: number, grid: Grid): Piece[] {
  const pieces = grid === 'binary' ? BINARY_PIECES : TRIPLET_PIECES;
  const out: Piece[] = [];
  let left = div;
  while (left > 0) {
    const p = pieces.find((x) => x.div <= left);
    if (!p) break; // resto menor que la figura más pequeña: se descarta
    out.push(p);
    left -= p.div;
  }
  return out;
}

/** Convierte segundos a negras con el mapa de tempo de la canción. */
export function secondsToQuarters(song: Song): (sec: number) => number {
  const tempo = song.tempo.length ? [...song.tempo].sort((a, b) => a.time - b.time) : [{ time: 0, bpm: 120 }];
  const startQ: number[] = [0];
  for (let i = 1; i < tempo.length; i++) {
    startQ[i] = startQ[i - 1]! + ((tempo[i]!.time - tempo[i - 1]!.time) * tempo[i - 1]!.bpm) / 60;
  }
  return (sec) => {
    let i = tempo.length - 1;
    while (i > 0 && tempo[i]!.time > sec) i--;
    return startQ[i]! + ((sec - tempo[i]!.time) * tempo[i]!.bpm) / 60;
  };
}

const SHARP_NAMES: [string, number][] = [
  ['C', 0],
  ['C', 1],
  ['D', 0],
  ['D', 1],
  ['E', 0],
  ['F', 0],
  ['F', 1],
  ['G', 0],
  ['G', 1],
  ['A', 0],
  ['A', 1],
  ['B', 0],
];
const FLAT_NAMES: [string, number][] = [
  ['C', 0],
  ['D', -1],
  ['D', 0],
  ['E', -1],
  ['E', 0],
  ['F', 0],
  ['G', -1],
  ['G', 0],
  ['A', -1],
  ['A', 0],
  ['B', -1],
  ['B', 0],
];

/** Armadura más probable (quintas, de −6 a 6) según qué notas suenan más tiempo. */
export function guessFifths(notes: readonly SongNote[]): number {
  const weight = new Array<number>(12).fill(0);
  for (const n of notes) weight[n.pitch % 12]! += n.duration;
  // Cada alteración de la armadura debe ganarse: en fragmentos cortos, unas pocas notas cromáticas
  // repetidas (el Re# de Para Elisa) no deben cambiar la tonalidad.
  const total = weight.reduce((t, w) => t + w, 0);
  let best = 0;
  let bestScore = -Infinity;
  for (let f = -6; f <= 6; f++) {
    const tonic = (((7 * f) % 12) + 12) % 12;
    const score =
      [0, 2, 4, 5, 7, 9, 11].reduce((s, d) => s + weight[(tonic + d) % 12]!, 0) - Math.abs(f) * total * 0.04;
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }
  return best;
}

interface QNote {
  pitch: number;
  /** Divisiones desde el inicio del compás. */
  onset: number;
  /** Fin en divisiones desde el inicio del compás (puede pasar del compás). */
  end: number;
  finger: number | null;
  tieStop: boolean;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function timeFor(lenQ: number, preferred: [number, number]): [number, number] {
  const [b, t] = preferred;
  if (Math.abs((b * 4) / t - lenQ) < 1e-6) return preferred;
  if (Number.isInteger(lenQ)) return [lenQ, 4];
  if (Number.isInteger(lenQ * 2)) return [lenQ * 2, 8];
  return [Math.max(1, Math.round(lenQ * 4)), 16];
}

export function songToMusicXml(song: Song): string {
  const notes = activeNotes(song);
  const toQ = secondsToQuarters(song);
  const fifths = guessFifths(notes);
  const names = fifths < 0 ? FLAT_NAMES : SHARP_NAMES;
  const barQ = (song.timeSignature[0] * 4) / song.timeSignature[1];

  // Inicio y longitud (en divisiones, a la semicorchea) de cada compás.
  const starts = (song.measures.length ? song.measures : [0]).map(toQ);
  const lastNoteEnd = Math.max(0, ...notes.map((n) => toQ(n.start + n.duration)));
  while (starts[starts.length - 1]! + barQ < lastNoteEnd - 1e-3)
    starts.push(starts[starts.length - 1]! + barQ);
  const lens = starts.map((s, i) => {
    const next = starts[i + 1];
    const q = next != null ? next - s : starts.length > 1 ? s - starts[i - 1]! : barQ;
    return Math.max(GRID_STEP.binary, Math.round(q * 4) * 3);
  });
  // El último compás: completo, como los demás de su compás.
  if (starts.length > 1) lens[lens.length - 1] = Math.max(lens[lens.length - 1]!, Math.round(barQ * 4) * 3);

  const measureOf = (q: number) => {
    let i = 0;
    while (i + 1 < starts.length && starts[i + 1]! <= q + 1 / 24) i++;
    return i;
  };

  // Notas por compás y pentagrama, con la posición aún sin cuantizar (en negras dentro del compás).
  const hands = { right: [] as SongNote[], left: [] as SongNote[] };
  for (const n of notes) hands[n.hand].push(n);
  const staves: ('right' | 'left')[] = (['right', 'left'] as const).filter((h) => hands[h].length);
  if (!staves.length) staves.push('right');

  const raw: { staff: number; pitch: number; relQ: number; endQ: number; finger: number | null }[][] =
    starts.map(() => []);
  staves.forEach((hand, si) => {
    for (const n of hands[hand]) {
      const qs = toQ(n.start);
      const m = measureOf(qs);
      raw[m]!.push({
        staff: si + 1,
        pitch: n.pitch,
        relQ: Math.max(0, qs - starts[m]!),
        endQ: toQ(n.start + n.duration) - starts[m]!,
        finger: n.finger,
      });
    }
  });

  // Rejilla de cada compás: tresillos solo si encajan claramente mejor.
  const grids: Grid[] = raw.map((list) => {
    if (list.length < 2) return 'binary';
    const err = (step: number) =>
      list.reduce((s, n) => {
        const x = n.relQ * DIVISIONS;
        return s + Math.abs(x - Math.round(x / step) * step);
      }, 0);
    return err(GRID_STEP.triplet) < err(GRID_STEP.binary) * 0.5 ? 'triplet' : 'binary';
  });

  const quantized: QNote[][][] = starts.map(() => staves.map(() => []));
  raw.forEach((list, m) => {
    const step = GRID_STEP[grids[m]!];
    for (const n of list) {
      const onset = Math.min(lens[m]! - step, Math.round((n.relQ * DIVISIONS) / step) * step);
      const end = Math.max(onset + step, Math.round((n.endQ * DIVISIONS) / step) * step);
      quantized[m]![n.staff - 1]!.push({
        pitch: n.pitch,
        onset: Math.max(0, onset),
        end,
        finger: n.finger,
        tieStop: false,
      });
    }
  });

  const pitchXml = (pitch: number) => {
    const [step, alter] = names[pitch % 12]!;
    const octave = Math.floor(pitch / 12) - 1;
    return `<pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>${octave}</octave></pitch>`;
  };

  const voiceOf = (staff: number) => (staff === 1 ? 1 : 5);

  const noteXml = (
    content: string,
    piece: Piece,
    staff: number,
    opts: { chord?: boolean; tieStop?: boolean; tieStart?: boolean; finger?: number | null } = {},
  ) => {
    const ties = `${opts.tieStop ? '<tie type="stop"/>' : ''}${opts.tieStart ? '<tie type="start"/>' : ''}`;
    const tied = `${opts.tieStop ? '<tied type="stop"/>' : ''}${opts.tieStart ? '<tied type="start"/>' : ''}`;
    const technical = opts.finger ? `<technical><fingering>${opts.finger}</fingering></technical>` : '';
    const notations = tied || technical ? `<notations>${tied}${technical}</notations>` : '';
    return (
      `<note>${opts.chord ? '<chord/>' : ''}${content}<duration>${piece.div}</duration>${ties}` +
      `<voice>${voiceOf(staff)}</voice><type>${piece.type}</type>${'<dot/>'.repeat(piece.dots)}` +
      (piece.triplet
        ? '<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>'
        : '') +
      `<staff>${staff}</staff>${notations}</note>`
    );
  };

  const restXml = (div: number, grid: Grid, staff: number) =>
    splitDuration(div, grid)
      .map((p) => noteXml('<rest/>', p, staff))
      .join('');

  const out: string[] = [];
  const bpm = Math.round(song.tempo[0]?.bpm ?? 120);
  let currentTime: [number, number] | null = null;
  const firstIsPickup = starts.length > 1 && lens[0]! / DIVISIONS < barQ - 1e-6;

  for (let m = 0; m < starts.length; m++) {
    const len = lens[m]!;
    const grid = grids[m]!;
    const lenQ = len / DIVISIONS;
    const pickup = m === 0 && firstIsPickup;
    const parts: string[] = [];

    let attributes = '';
    const time = pickup ? song.timeSignature : timeFor(lenQ, song.timeSignature);
    const timeChanged = !currentTime || currentTime[0] !== time[0] || currentTime[1] !== time[1];
    if (m === 0) {
      const clefs = staves
        .map((hand, si) => {
          const avg = hands[hand].reduce((s, n) => s + n.pitch, 0) / Math.max(1, hands[hand].length);
          const bass = hand === 'left' ? avg < 64 : avg < 52;
          return `<clef number="${si + 1}"><sign>${bass ? 'F' : 'G'}</sign><line>${bass ? 4 : 2}</line></clef>`;
        })
        .join('');
      attributes =
        `<attributes><divisions>${DIVISIONS}</divisions><key><fifths>${fifths}</fifths></key>` +
        `<time><beats>${time[0]}</beats><beat-type>${time[1]}</beat-type></time>` +
        `<staves>${staves.length}</staves>${clefs}</attributes>`;
      parts.push(attributes);
      parts.push(
        `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit>` +
          `<per-minute>${bpm}</per-minute></metronome></direction-type><sound tempo="${bpm}"/></direction>`,
      );
      currentTime = time;
    } else if (timeChanged && !(m === starts.length - 1)) {
      parts.push(
        `<attributes><time><beats>${time[0]}</beats><beat-type>${time[1]}</beat-type></time></attributes>`,
      );
      currentTime = time;
    }

    staves.forEach((_, si) => {
      const staff = si + 1;
      if (si > 0) parts.push(`<backup><duration>${len}</duration></backup>`);
      const list = quantized[m]![si]!;
      if (!list.length) {
        parts.push(
          `<note><rest measure="yes"/><duration>${len}</duration><voice>${voiceOf(staff)}</voice><staff>${staff}</staff></note>`,
        );
        return;
      }
      const onsets = [...new Set(list.map((n) => n.onset))].sort((a, b) => a - b);
      let pos = 0;
      onsets.forEach((onset, j) => {
        const chord = list.filter((n) => n.onset === onset).sort((a, b) => a.pitch - b.pitch);
        if (onset > pos) parts.push(restXml(onset - pos, grid, staff));
        const naturalEnd = Math.max(...chord.map((n) => n.end));
        const limit = onsets[j + 1] ?? len;
        const end = Math.min(naturalEnd, limit);
        // Lo que sigue sonando al acabar el compás continúa, ligado, en el siguiente.
        const carries = j === onsets.length - 1 && naturalEnd > len && m + 1 < starts.length;
        if (carries) {
          for (const n of chord) {
            if (n.end > len) {
              quantized[m + 1]![si]!.push({
                pitch: n.pitch,
                onset: 0,
                end: n.end - len,
                finger: null,
                tieStop: true,
              });
            }
          }
        }
        const pieces = splitDuration(end - onset, grid);
        pieces.forEach((piece, pi) => {
          const last = pi === pieces.length - 1;
          chord.forEach((n, ci) => {
            parts.push(
              noteXml(pitchXml(n.pitch), piece, staff, {
                chord: ci > 0,
                tieStop: pi > 0 || n.tieStop,
                tieStart: !last || (carries && n.end > len),
                finger: pi === 0 && !n.tieStop ? n.finger : null,
              }),
            );
          });
        });
        pos = onset + pieces.reduce((s, p) => s + p.div, 0);
      });
      if (pos < len) parts.push(restXml(len - pos, grid, staff));
    });

    out.push(
      `<measure number="${firstIsPickup ? m : m + 1}"${pickup ? ' implicit="yes"' : ''}>${parts.join('')}</measure>`,
    );
  }

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<score-partwise version="4.0">` +
    `<work><work-title>${esc(song.title)}</work-title></work>` +
    (song.composer
      ? `<identification><creator type="composer">${esc(song.composer)}</creator></identification>`
      : '') +
    `<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>` +
    `<part id="P1">${out.join('')}</part></score-partwise>`
  );
}
