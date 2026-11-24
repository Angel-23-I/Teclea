import { Midi } from '@tonejs/midi';
import { ImportError, baseName, hashBytes } from './importError';
import { measureStartsInQuarters } from './measures';
import { fitNotesToRange } from './rangeFit';
import {
  averagePitch,
  guessRoles,
  sortNotes,
  type Song,
  type SongNote,
  type SongTrack,
  type TempoPoint,
} from './types';

const DRUM_CHANNEL = 9;
const MIN_DURATION = 0.05;
/** Altura que separa las manos cuando todo el piano viene en una sola pista. */
const SPLIT_PITCH = 60;

interface RawTrack {
  name: string;
  notes: Omit<SongNote, 'hand' | 'track'>[];
}

export function importMidi(data: Uint8Array, fileName: string): Song {
  let midi: Midi;
  try {
    midi = new Midi(data);
  } catch {
    throw new ImportError('El archivo no es un MIDI válido o está dañado.');
  }

  const sources = midi.tracks.filter(
    (t) => t.notes.length > 0 && t.channel !== DRUM_CHANNEL && !t.instrument.percussion,
  );
  if (!sources.length) throw new ImportError('El archivo MIDI no tiene notas que se puedan tocar.');

  let raw: RawTrack[] = sources.map((t, i) => ({
    name: t.name.trim() || t.instrument.name || `Pista ${i + 1}`,
    notes: t.notes.map((n) => ({
      pitch: n.midi,
      start: n.time,
      duration: Math.max(MIN_DURATION, n.duration),
      finger: null,
    })),
  }));

  // Un piano grabado en una sola pista: se separa en agudos y graves para tener dos manos.
  let fixedRoles: SongTrack['role'][] | null = null;
  if (raw.length === 1) {
    const only = raw[0]!;
    const high = only.notes.filter((n) => n.pitch >= SPLIT_PITCH);
    const low = only.notes.filter((n) => n.pitch < SPLIT_PITCH);
    if (high.length && low.length) {
      raw = [
        { name: `${only.name} · agudos`, notes: high },
        { name: `${only.name} · graves`, notes: low },
      ];
      fixedRoles = ['right', 'left'];
    }
  }

  const trackInfo: SongTrack[] = raw.map((t) => ({
    name: t.name,
    role: 'right',
    noteCount: t.notes.length,
    averagePitch: averagePitch(t.notes as SongNote[]),
  }));
  const roles = fixedRoles ?? guessRoles(trackInfo);
  const tracks = trackInfo.map((t, i) => ({ ...t, role: roles[i]! }));

  const allNotes: SongNote[] = [];
  raw.forEach((t, ti) => {
    const hand = tracks[ti]!.role === 'left' ? 'left' : 'right';
    for (const n of t.notes) allNotes.push({ ...n, hand, track: ti });
  });
  const { notes, shifted } = fitNotesToRange(sortNotes(allNotes));
  const duration = Math.max(...notes.map((n) => n.start + n.duration));

  const h = midi.header;
  const ppq = h.ppq || 480;
  const tempo: TempoPoint[] = h.tempos.length
    ? h.tempos.map((t) => ({ time: h.ticksToSeconds(t.ticks), bpm: t.bpm }))
    : [{ time: 0, bpm: 120 }];
  const signatures = h.timeSignatures.map((s) => ({
    quarter: s.ticks / ppq,
    beats: s.timeSignature[0] ?? 4,
    beatType: s.timeSignature[1] ?? 4,
  }));
  const lastTick = Math.max(...sources.flatMap((t) => t.notes.map((n) => n.ticks + n.durationTicks)));
  const measures = measureStartsInQuarters(signatures, lastTick / ppq)
    .map((q) => h.ticksToSeconds(q * ppq))
    .filter((t) => t <= duration + 1e-6);
  const first = h.timeSignatures[0]?.timeSignature;

  return {
    id: `midi-${hashBytes(data)}`,
    title: h.name.trim() || baseName(fileName),
    composer: null,
    source: 'midi',
    tracks,
    notes,
    measures: measures.length ? measures : [0],
    timeSignature: [first?.[0] ?? 4, first?.[1] ?? 4],
    tempo,
    duration,
    shiftedNotes: shifted,
    warnings: [],
  };
}
