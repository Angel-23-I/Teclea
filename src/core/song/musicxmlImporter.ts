import { unzipSync } from 'fflate';
import { ImportError, baseName, hashBytes } from './importError';
import { barLengthInQuarters, makeQuarterToSeconds, type TempoAt, type TimeSignatureAt } from './measures';
import { fitNotesToRange } from './rangeFit';
import {
  averagePitch,
  guessRoles,
  sortNotes,
  type Finger,
  type Song,
  type SongNote,
  type SongTrack,
  type TrackRole,
} from './types';

const STEP: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const BEAT_UNIT_QUARTERS: Record<string, number> = {
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 0.5,
  '16th': 0.25,
};

const kids = (el: Element, tag?: string): Element[] =>
  Array.from(el.children).filter((c) => !tag || c.tagName === tag);
const kid = (el: Element | null | undefined, tag: string): Element | null =>
  el ? (kids(el, tag)[0] ?? null) : null;
const text = (el: Element | null | undefined, tag: string): string | null => {
  const k = kid(el, tag);
  return k?.textContent?.trim() || null;
};
const num = (el: Element | null | undefined, tag: string): number | null => {
  const t = text(el, tag);
  const n = t == null ? NaN : Number(t);
  return Number.isFinite(n) ? n : null;
};

interface RawNote {
  pitch: number;
  startQ: number;
  durQ: number;
  trackKey: string;
  voice: string;
  finger: Finger | null;
  tieStart: boolean;
  tieStop: boolean;
}

/** Importa MusicXML sin comprimir (score-partwise, el que exportan MuseScore, Finale, Sibelius...). */
export function importMusicXml(xml: string, fileName: string, idBytes?: Uint8Array): Song {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) {
    throw new ImportError('El archivo MusicXML está dañado o no es válido.');
  }
  const root = doc.documentElement;
  if (root.tagName === 'score-timewise') {
    throw new ImportError(
      'Este MusicXML usa el formato "timewise". Expórtalo de nuevo como MusicXML normal.',
    );
  }
  if (root.tagName !== 'score-partwise') {
    throw new ImportError('El archivo no parece una partitura MusicXML.');
  }

  const warnings = new Set<string>();
  const title = text(kid(root, 'work'), 'work-title') ?? text(root, 'movement-title') ?? baseName(fileName);
  const composer =
    kids(kid(root, 'identification') ?? root, 'creator')
      .find((c) => c.getAttribute('type') === 'composer')
      ?.textContent?.trim() || null;

  const partNames = new Map<string, string>();
  for (const sp of kids(kid(root, 'part-list') ?? root, 'score-part')) {
    partNames.set(sp.getAttribute('id') ?? '', text(sp, 'part-name') ?? '');
  }

  const tempos: TempoAt[] = [];
  const signatures: TimeSignatureAt[] = [];
  const measureStartsQ: number[] = [];
  const raw: RawNote[] = [];
  const partStaves = new Map<number, number>();

  kids(root, 'part').forEach((part, pi) => {
    let divisions = 1;
    let barQ = 4; // longitud del compás según el último compás indicado
    let measureStartQ = 0;
    let staves = 1;

    for (const measure of kids(part, 'measure')) {
      let pos = 0;
      let maxPos = 0;
      let lastStart = 0;
      const at = () => measureStartQ + pos / divisions;

      for (const el of kids(measure)) {
        switch (el.tagName) {
          case 'attributes': {
            divisions = num(el, 'divisions') ?? divisions;
            staves = Math.max(staves, num(el, 'staves') ?? 1);
            const time = kid(el, 'time');
            const beats = num(time, 'beats');
            const beatType = num(time, 'beat-type');
            if (beats && beatType) {
              barQ = barLengthInQuarters(beats, beatType);
              if (pi === 0) signatures.push({ quarter: at(), beats, beatType });
            }
            break;
          }
          case 'direction': {
            const sound = kid(el, 'sound');
            const t = Number(sound?.getAttribute('tempo'));
            if (Number.isFinite(t) && t > 0) {
              tempos.push({ quarter: at(), bpm: t });
              break;
            }
            const metro = kid(kid(el, 'direction-type'), 'metronome');
            const unit = BEAT_UNIT_QUARTERS[text(metro, 'beat-unit') ?? ''];
            const perMinute = num(metro, 'per-minute');
            if (unit && perMinute) {
              const dotted = kid(metro, 'beat-unit-dot') ? 1.5 : 1;
              tempos.push({ quarter: at(), bpm: perMinute * unit * dotted });
            }
            break;
          }
          case 'sound': {
            const t = Number(el.getAttribute('tempo'));
            if (Number.isFinite(t) && t > 0) tempos.push({ quarter: at(), bpm: t });
            break;
          }
          case 'backup':
            pos = Math.max(0, pos - (num(el, 'duration') ?? 0));
            break;
          case 'forward':
            pos += num(el, 'duration') ?? 0;
            maxPos = Math.max(maxPos, pos);
            break;
          case 'barline':
            if (kid(el, 'repeat') || kid(el, 'ending')) {
              warnings.add('Las repeticiones de la partitura se tocan una sola vez.');
            }
            break;
          case 'note': {
            if (kid(el, 'grace') || kid(el, 'cue')) break;
            const dur = num(el, 'duration') ?? 0;
            const isChord = !!kid(el, 'chord');
            const start = isChord ? lastStart : pos;
            if (!isChord) {
              lastStart = pos;
              pos += dur;
              maxPos = Math.max(maxPos, pos);
            }
            const pitchEl = kid(el, 'pitch');
            if (kid(el, 'rest') || !pitchEl) break;
            const step = STEP[text(pitchEl, 'step') ?? ''];
            const octave = num(pitchEl, 'octave');
            if (step == null || octave == null) break;
            const alter = Math.round(num(pitchEl, 'alter') ?? 0);
            const ties = kids(el, 'tie').map((t) => t.getAttribute('type'));
            const fingerText = text(kid(kid(el, 'notations'), 'technical'), 'fingering');
            const f = Number(fingerText);
            raw.push({
              pitch: (octave + 1) * 12 + step + alter,
              startQ: measureStartQ + start / divisions,
              durQ: dur / divisions,
              trackKey: `${pi}:${num(el, 'staff') ?? 1}`,
              voice: text(el, 'voice') ?? '1',
              finger: f >= 1 && f <= 5 ? (f as Finger) : null,
              tieStart: ties.includes('start'),
              tieStop: ties.includes('stop'),
            });
            break;
          }
        }
      }

      if (pi === 0) measureStartsQ.push(measureStartQ);
      const lenQ = maxPos / divisions;
      measureStartQ += lenQ > 0 ? lenQ : barQ;
    }
    partStaves.set(pi, staves);
  });

  if (!raw.length) throw new ImportError('La partitura no tiene notas.');

  // Une las notas ligadas en una sola nota larga.
  const merged: RawNote[] = [];
  const open = new Map<string, RawNote>();
  for (const n of [...raw].sort((a, b) => a.startQ - b.startQ)) {
    const key = `${n.trackKey}|${n.pitch}`;
    const prev = open.get(key);
    if (n.tieStop && prev && Math.abs(prev.startQ + prev.durQ - n.startQ) < 1e-3) {
      prev.durQ += n.durQ;
      if (!n.tieStart) open.delete(key);
      continue;
    }
    merged.push(n);
    if (n.tieStart) open.set(key, n);
    else open.delete(key);
  }

  // Pistas: una por pentagrama de cada parte.
  const trackKeys = [...new Set(merged.map((n) => n.trackKey))].sort((a, b) => {
    const [pa, sa] = a.split(':').map(Number);
    const [pb, sb] = b.split(':').map(Number);
    return pa! - pb! || sa! - sb!;
  });
  const partIds = kids(root, 'part').map((p) => p.getAttribute('id') ?? '');
  const tracks: SongTrack[] = trackKeys.map((key) => {
    const [pi, staff] = key.split(':').map(Number) as [number, number];
    const partName = partNames.get(partIds[pi] ?? '') || `Parte ${pi + 1}`;
    const two = (partStaves.get(pi) ?? 1) > 1;
    const notes = merged.filter((n) => n.trackKey === key);
    return {
      name: two ? `${partName} · ${staff === 1 ? 'pentagrama superior' : 'pentagrama inferior'}` : partName,
      role: 'right',
      noteCount: notes.length,
      averagePitch: averagePitch(notes as unknown as SongNote[]),
    };
  });
  const guessed = guessRoles(tracks);
  const roles: TrackRole[] = trackKeys.map((key, i) => {
    const [pi, staff] = key.split(':').map(Number) as [number, number];
    // En una parte de piano, el pentagrama superior es la mano derecha y el inferior la izquierda.
    if ((partStaves.get(pi) ?? 1) > 1) return staff === 1 ? 'right' : 'left';
    return guessed[i]!;
  });
  tracks.forEach((t, i) => (t.role = roles[i]!));

  const toSec = makeQuarterToSeconds(tempos.length ? tempos : [{ quarter: 0, bpm: 120 }]);
  const songNotes: SongNote[] = merged.map((n) => {
    const track = trackKeys.indexOf(n.trackKey);
    const start = toSec(n.startQ);
    return {
      pitch: n.pitch,
      start,
      duration: Math.max(0.05, toSec(n.startQ + n.durQ) - start),
      hand: roles[track] === 'left' ? 'left' : 'right',
      track,
      finger: n.finger,
    };
  });
  const { notes, shifted } = fitNotesToRange(sortNotes(songNotes));
  const duration = Math.max(...notes.map((n) => n.start + n.duration));

  const tempo = (
    tempos.length ? [...tempos].sort((a, b) => a.quarter - b.quarter) : [{ quarter: 0, bpm: 120 }]
  )
    .map((t) => ({ time: toSec(t.quarter), bpm: t.bpm }))
    .filter((t, i, arr) => i === 0 || t.bpm !== arr[i - 1]!.bpm);
  const firstSig = signatures[0];

  return {
    id: `musicxml-${hashBytes(idBytes ?? new TextEncoder().encode(xml))}`,
    title,
    composer,
    source: 'musicxml',
    tracks,
    notes,
    measures: measureStartsQ.map(toSec).filter((t) => t <= duration + 1e-6),
    timeSignature: [firstSig?.beats ?? 4, firstSig?.beatType ?? 4],
    tempo,
    duration,
    shiftedNotes: shifted,
    warnings: [...warnings],
  };
}

/** Texto de un archivo XML respetando su BOM (MuseScore antiguo puede exportar UTF-16). */
export function decodeXml(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  return new TextDecoder('utf-8').decode(bytes);
}

/** Importa MusicXML comprimido (.mxl), que es un zip con la partitura dentro. */
export function importMxl(bytes: Uint8Array, fileName: string): Song {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new ImportError('El archivo .mxl está dañado.');
  }
  let path: string | undefined;
  const container = files['META-INF/container.xml'];
  if (container) {
    const doc = new DOMParser().parseFromString(decodeXml(container), 'application/xml');
    path = doc.getElementsByTagName('rootfile')[0]?.getAttribute('full-path') ?? undefined;
  }
  path ??= Object.keys(files).find((f) => !f.startsWith('META-INF/') && /\.(musicxml|xml)$/i.test(f));
  const score = path ? files[path] : undefined;
  if (!score) throw new ImportError('El archivo .mxl no contiene ninguna partitura.');
  return importMusicXml(decodeXml(score), fileName, bytes);
}
