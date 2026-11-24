import { describe, expect, it } from 'vitest';
import { FFT, hannWindow, nextPow2 } from './fft';
import { BINS_PER_SEMITONE, LOG_BINS, LogSpectrum, binPitch, pitchBin } from './logSpectrum';
import { midiToHz, renderNotes } from './testSignals';
import { measureFrequency, yin } from './yin';

const SR = 48000;

describe('FFT', () => {
  it('encuentra el pico de una sinusoide en su casilla', () => {
    const n = 4096;
    const fft = new FFT(n);
    const f = (100 * SR) / n; // justo en la casilla 100
    const x = Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * f * i) / SR));
    const mags = fft.magnitudes(x, new Float64Array(n / 2 + 1));
    let best = 0;
    for (let k = 0; k < mags.length; k++) if (mags[k]! > mags[best]!) best = k;
    expect(best).toBe(100);
    expect(mags[100]).toBeCloseTo(n / 2, 0);
  });

  it('rechaza tamaños que no son potencia de 2', () => {
    expect(() => new FFT(1000)).toThrow();
    expect(nextPow2(3000)).toBe(4096);
    expect(hannWindow(5)[2]).toBeCloseTo(1);
  });
});

describe('YIN', () => {
  it('mide la afinación de La4 a 440 y a 446 Hz con menos de 2 cents de error', () => {
    for (const a4 of [440, 446]) {
      const x = renderNotes([{ pitch: 69, start: 0, duration: 0.6 }], SR, 0.6, { a4 });
      const r = measureFrequency(x.subarray(2400, 2400 + 16384), SR)!;
      const cents = 1200 * Math.log2(r.frequency / a4);
      expect(Math.abs(cents)).toBeLessThan(2);
      expect(r.aperiodicity).toBeLessThan(0.2);
    }
  });

  it('acierta en graves y agudos del PSR-E283', () => {
    for (const pitch of [36, 48, 84, 96]) {
      const x = renderNotes([{ pitch, start: 0, duration: 0.5 }], SR, 0.5);
      const r = yin(x.subarray(4800, 4800 + 4096), SR, 50, 2200)!;
      expect(12 * Math.log2(r.frequency / 440) + 69).toBeCloseTo(pitch, 0);
    }
  });
});

describe('espectro en semitonos', () => {
  it('pone el pico de cada nota en su casilla', () => {
    const fftSize = 4096;
    const fft = new FFT(fftSize);
    const win = hannWindow(fftSize);
    const ls = new LogSpectrum(SR, fftSize);
    expect(LOG_BINS).toBe((120 - 34) * BINS_PER_SEMITONE);
    for (const pitch of [45, 60, 72, 88]) {
      const f = midiToHz(pitch);
      const x = Array.from({ length: fftSize }, (_, i) => win[i]! * Math.sin((2 * Math.PI * f * i) / SR));
      const v = ls.compute(fft.magnitudes(x, new Float64Array(fftSize / 2 + 1)), new Float64Array(LOG_BINS));
      let best = 0;
      for (let j = 0; j < LOG_BINS; j++) if (v[j]! > v[best]!) best = j;
      // En graves la FFT no separa tercios de semitono (los distinguen los armónicos): basta medio semitono.
      expect(Math.abs(binPitch(best) - pitch)).toBeLessThanOrEqual(pitch < 55 ? 0.7 : 0.34);
      expect(Math.abs(best - pitchBin(pitch))).toBeLessThanOrEqual(pitch < 55 ? 2 : 1);
    }
  });
});
