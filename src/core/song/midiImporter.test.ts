import { Midi } from '@tonejs/midi';
import { describe, expect, it } from 'vitest';
import { ImportError } from './importError';
import { importMidi } from './midiImporter';

function buildMidi(setup: (m: Midi) => void): Uint8Array {
  const m = new Midi();
  m.header.setTempo(120);
  setup(m);
  return m.toArray();
}

describe('importMidi', () => {
  it('importa dos pistas, asigna manos y calcula compases', () => {
    const data = buildMidi((m) => {
      m.header.timeSignatures.push({ ticks: 0, timeSignature: [3, 4] });
      m.header.update();
      const rh = m.addTrack();
      rh.name = 'Derecha';
      rh.addNote({ midi: 72, time: 0, duration: 0.5 });
      rh.addNote({ midi: 76, time: 0.5, duration: 0.5 });
      rh.addNote({ midi: 108, time: 1.5, duration: 0.5 }); // Do8: fuera del teclado
      const lh = m.addTrack();
      lh.name = 'Izquierda';
      lh.addNote({ midi: 48, time: 0, duration: 1.5 });
      const drums = m.addTrack();
      drums.channel = 9;
      drums.addNote({ midi: 36, time: 0, duration: 0.1 });
    });

    const song = importMidi(data, 'C:\\musica\\vals.mid');
    expect(song.source).toBe('midi');
    expect(song.title).toBe('vals');
    expect(song.tracks.map((t) => [t.name, t.role])).toEqual([
      ['Derecha', 'right'],
      ['Izquierda', 'left'],
    ]);
    expect(song.notes).toHaveLength(4);
    expect(song.shiftedNotes).toBe(1);
    expect(song.notes.map((n) => n.pitch).sort((a, b) => a - b)).toEqual([48, 72, 76, 96]);
    expect(song.notes.find((n) => n.pitch === 48)?.hand).toBe('left');
    expect(song.timeSignature).toEqual([3, 4]);
    expect(song.measures[0]).toBe(0);
    expect(song.measures[1]).toBeCloseTo(1.5); // 3/4 a 120 ppm
    expect(song.tempo[0]?.bpm).toBeCloseTo(120);
    expect(song.duration).toBeCloseTo(2);
  });

  it('separa en dos manos un piano grabado en una sola pista', () => {
    const data = buildMidi((m) => {
      const t = m.addTrack();
      t.addNote({ midi: 67, time: 0, duration: 1 });
      t.addNote({ midi: 43, time: 0, duration: 1 });
    });
    const song = importMidi(data, 'uno.mid');
    expect(song.tracks.map((t) => t.role)).toEqual(['right', 'left']);
    expect(song.notes.find((n) => n.pitch === 43)?.track).toBe(1);
  });

  it('da el mismo id al mismo archivo', () => {
    const data = buildMidi((m) => m.addTrack().addNote({ midi: 60, time: 0, duration: 1 }));
    expect(importMidi(data, 'a.mid').id).toBe(importMidi(data, 'b.mid').id);
  });

  it('rechaza archivos sin notas o dañados', () => {
    expect(() =>
      importMidi(
        buildMidi(() => {}),
        'vacio.mid',
      ),
    ).toThrow(ImportError);
    expect(() => importMidi(new Uint8Array([1, 2, 3]), 'roto.mid')).toThrow(ImportError);
  });
});
