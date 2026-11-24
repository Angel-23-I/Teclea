import { describe, expect, it } from 'vitest';
import { QUICK_PITCHES, TemplateRecorder, latencyFromTaps, measureA4, measureNoise } from './calibration';
import { TEMPLATE_PITCHES, buildTemplateSet, type Template } from './templates';
import { renderNotes, runDetector, scoreDetection } from './testSignals';

const SR = 48000;

function recordTemplates(pitches: readonly number[]): Map<number, Template> {
  const measured = new Map<number, Template>();
  for (const p of pitches) {
    const rec = new TemplateRecorder(SR);
    rec.push(renderNotes([{ pitch: p, start: 0.1, duration: 0.8 }], SR, 1, { seed: p }));
    expect(rec.done).toBe(true);
    measured.set(p, rec.result()!);
  }
  return measured;
}

// Acordes con octavas dentro: lo más difícil para el detector.
const CHORDS = [
  [60, 64, 67],
  [57, 60, 64],
  [53, 57, 60, 65],
  [55, 59, 62, 67],
  [45, 57],
  [48, 60, 72],
];
const chordNotes = CHORDS.flatMap((c, i) =>
  c.map((pitch) => ({ pitch, start: 0.2 + i * 0.7, duration: 0.6 })),
);
const chordSignal = renderNotes(chordNotes, SR, 4.6, { seed: 99 });

describe('calibración', () => {
  it('mide el ruido de fondo', () => {
    const noise = measureNoise(renderNotes([], SR, 1.5, { noise: 0.003 }), SR);
    expect(noise.rms).toBeGreaterThan(0.001);
    expect(noise.rms).toBeLessThan(0.003);
    expect(noise.spectrum.some((v) => v > 0)).toBe(true);
  });

  it('mide la afinación del La4 del teclado', () => {
    const a4 = measureA4(renderNotes([{ pitch: 69, start: 0.2, duration: 0.8 }], SR, 1.2, { a4: 444 }), SR);
    expect(a4).not.toBeNull();
    expect(Math.abs(1200 * Math.log2(a4! / 444))).toBeLessThan(3);
    expect(measureA4(renderNotes([], SR, 1), SR)).toBeNull(); // sin nota
  });

  it('calcula la latencia con la mediana de los golpes', () => {
    const clicks = [1, 2, 3, 4, 5, 6, 7, 8];
    const taps = [1.04, 2.05, 3.03, 4.9, 5.045, 6.04, 7.06, 8.04]; // un golpe despistado
    expect(latencyFromTaps(clicks, taps)!.ms).toBe(40);
    expect(latencyFromTaps(clicks, [1.04])).toBeNull();
  });

  it('la calibración rápida graba 21 teclas', () => {
    expect(QUICK_PITCHES).toHaveLength(21);
    expect(QUICK_PITCHES[0]).toBe(36);
    expect(QUICK_PITCHES[20]).toBe(96);
  });

  it('con todas las huellas medidas separa también las octavas de un acorde', () => {
    const templates = buildTemplateSet(recordTemplates(TEMPLATE_PITCHES));
    const s = scoreDetection(chordNotes, runDetector(chordSignal, { templates }));
    expect(s.hits / chordNotes.length).toBeGreaterThanOrEqual(0.9);
    expect(s.extra.length).toBeLessThanOrEqual(1);
  });

  it('la calibración rápida da casi el mismo resultado', () => {
    const templates = buildTemplateSet(recordTemplates(QUICK_PITCHES));
    const s = scoreDetection(chordNotes, runDetector(chordSignal, { templates }));
    expect(s.hits / chordNotes.length).toBeGreaterThanOrEqual(0.9);
    expect(s.extra.length).toBeLessThanOrEqual(2);
  });
});

describe('comprobación de la tecla grabada', () => {
  it('acepta la tecla correcta y detecta si se tocó otra', async () => {
    const { templateMatchesPitch } = await import('./calibration');
    const rec = new TemplateRecorder(SR);
    rec.push(renderNotes([{ pitch: 62, start: 0.1, duration: 0.8 }], SR, 1));
    expect(templateMatchesPitch(rec.result()!, 62)).toBe(true);
    expect(templateMatchesPitch(rec.result()!, 60)).toBe(false);
    expect(templateMatchesPitch(rec.result()!, 65)).toBe(false);
  });
});
