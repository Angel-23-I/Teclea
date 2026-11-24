// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { BUILTIN_SONGS } from '../core/song/builtin';
import { db } from '../storage/db';
import { storedMusicXml, useLibrary } from './library';
import { useProgress } from './progress';

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><work><work-title>Prueba</work-title></work>
<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes>
<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note>
<note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration></note>
</measure></part></score-partwise>`;

const file = (name: string, text: string) => new File([text], name);

describe('biblioteca guardada', () => {
  beforeEach(async () => {
    await db.songs.clear();
    useLibrary.setState({ songs: [...BUILTIN_SONGS], roles: {}, storage: 'loading' });
    await useLibrary.getState().hydrate();
  });

  it('guarda lo importado y lo recupera al volver a abrir', async () => {
    const song = await useLibrary.getState().importFile(file('prueba.musicxml', XML));
    expect(song?.title).toBe('Prueba');
    // Simula reiniciar la app.
    useLibrary.setState({ songs: [...BUILTIN_SONGS], storage: 'loading' });
    await useLibrary.getState().hydrate();
    const { songs, currentId } = useLibrary.getState();
    expect(songs.map((s) => s.title)).toContain('Prueba');
    expect(currentId).toBe(song!.id);
    expect(await storedMusicXml(song!.id)).toContain('<work-title>Prueba</work-title>');
  });

  it('recuerda el papel de las pistas', async () => {
    const id = BUILTIN_SONGS[0]!.id;
    useLibrary.getState().select(id);
    useLibrary.getState().setTrackRole(1, 'off');
    useLibrary.setState({ songs: [...BUILTIN_SONGS] });
    await useLibrary.getState().hydrate();
    expect(useLibrary.getState().songs.find((s) => s.id === id)!.tracks[1]!.role).toBe('off');
  });

  it('borra una canción importada pero no las incluidas', async () => {
    const song = await useLibrary.getState().importFile(file('prueba.musicxml', XML));
    await useLibrary.getState().removeSong(song!.id);
    await useLibrary.getState().removeSong(BUILTIN_SONGS[0]!.id);
    expect(await db.songs.count()).toBe(0);
    const { songs, currentId } = useLibrary.getState();
    expect(songs).toHaveLength(BUILTIN_SONGS.length);
    expect(currentId).not.toBe(song!.id);
  });
});

describe('progreso guardado', () => {
  it('suma el tiempo del día y guarda las sesiones', async () => {
    const p = useProgress.getState();
    await p.clear();
    const at = new Date(2026, 10, 24, 10).getTime();
    await p.addTime(30, 5, at);
    await p.addTime(45, 2, at);
    await p.addSession({
      songId: 'x',
      songTitle: 'X',
      mode: 'wait',
      hands: 'right',
      speed: 1,
      accuracy: 90,
      stars: 2,
      hits: 9,
      misses: 1,
      wrong: 0,
      total: 10,
      bestStreak: 9,
      meanOffsetMs: null,
      date: at,
    });
    useProgress.setState({ days: [], sessions: [], loaded: false });
    await useProgress.getState().load();
    const { days, sessions } = useProgress.getState();
    expect(days).toEqual([{ date: '2026-11-24', seconds: 75, hits: 7 }]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.accuracy).toBe(90);
  });
});
