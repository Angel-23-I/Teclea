// @vitest-environment happy-dom
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { ImportError } from './importError';
import { importMusicXml, importMxl } from './musicxmlImporter';

const n = (step: string, octave: number, dur: number, extra = '') =>
  `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${dur}</duration>${extra}</note>`;

// 3/4 a 90 ppm, divisions = 2 (una negra = 2). Dos pentagramas de piano.
const SCORE = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>Vals de prueba</work-title></work>
  <identification><creator type="composer">Ana Compositora</creator></identification>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>2</divisions><time><beats>3</beats><beat-type>4</beat-type></time><staves>2</staves></attributes>
      <direction><sound tempo="90"/></direction>
      ${n('C', 4, 2, '<voice>1</voice><staff>1</staff><notations><technical><fingering>1</fingering></technical></notations>')}
      ${n('E', 4, 2, '<voice>1</voice><staff>1</staff>')}
      <note><chord/><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff></note>
      <note><rest/><duration>2</duration><voice>1</voice><staff>1</staff></note>
      <backup><duration>6</duration></backup>
      ${n('C', 3, 6, '<tie type="start"/><voice>5</voice><staff>2</staff>')}
    </measure>
    <measure number="2">
      <barline location="right"><repeat direction="backward"/></barline>
      ${n('D', 4, 4, '<voice>1</voice><staff>1</staff>')}
      <note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff></note>
      <backup><duration>6</duration></backup>
      ${n('C', 3, 2, '<tie type="stop"/><voice>5</voice><staff>2</staff>')}
      <note><grace/><pitch><step>B</step><octave>3</octave></pitch><voice>5</voice><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>`;

const Q = 60 / 90; // segundos por negra

describe('importMusicXml', () => {
  const song = importMusicXml(SCORE, 'vals.musicxml');

  it('lee título, compositor, compás y tempo', () => {
    expect(song.title).toBe('Vals de prueba');
    expect(song.composer).toBe('Ana Compositora');
    expect(song.timeSignature).toEqual([3, 4]);
    expect(song.tempo).toEqual([{ time: 0, bpm: 90 }]);
    expect(song.measures).toHaveLength(2);
    expect(song.measures[1]).toBeCloseTo(3 * Q);
  });

  it('separa los pentagramas en mano derecha e izquierda', () => {
    expect(song.tracks.map((t) => [t.name, t.role])).toEqual([
      ['Piano · pentagrama superior', 'right'],
      ['Piano · pentagrama inferior', 'left'],
    ]);
  });

  it('coloca acordes, silencios, alteraciones, ligaduras y digitación', () => {
    const at = (p: number) => song.notes.filter((x) => x.pitch === p);
    expect(at(60)[0]).toMatchObject({ start: 0, finger: 1, hand: 'right' });
    expect(at(60)[0]!.duration).toBeCloseTo(Q);
    expect(at(64)[0]!.start).toBeCloseTo(Q);
    expect(at(67)[0]!.start).toBeCloseTo(Q); // acorde con Mi4
    expect(at(62)[0]!.start).toBeCloseTo(3 * Q); // después del silencio
    expect(at(66)[0]!.start).toBeCloseTo(5 * Q); // Fa#4
    // Do3 ligado: blanca con puntillo + negra = 4 negras, una sola nota.
    expect(at(48)).toHaveLength(1);
    expect(at(48)[0]!.duration).toBeCloseTo(4 * Q);
    expect(at(48)[0]!.hand).toBe('left');
    // La nota de adorno (Si3) se ignora.
    expect(at(59)).toHaveLength(0);
    expect(song.notes).toHaveLength(6);
  });

  it('avisa de las repeticiones', () => {
    expect(song.warnings).toContain('Las repeticiones de la partitura se tocan una sola vez.');
  });

  it('rechaza XML no válido o que no es una partitura', () => {
    expect(() => importMusicXml('<score-partwise><part>', 'roto.xml')).toThrow(ImportError);
    expect(() => importMusicXml('<html></html>', 'web.xml')).toThrow(ImportError);
  });
});

describe('importMxl', () => {
  it('abre el zip y lee la partitura indicada en container.xml', () => {
    const zip = zipSync({
      'META-INF/container.xml': strToU8(
        '<container><rootfiles><rootfile full-path="score/vals.musicxml"/></rootfiles></container>',
      ),
      'score/vals.musicxml': strToU8(SCORE),
    });
    const song = importMxl(zip, 'vals.mxl');
    expect(song.title).toBe('Vals de prueba');
    expect(song.notes).toHaveLength(6);
  });
});
