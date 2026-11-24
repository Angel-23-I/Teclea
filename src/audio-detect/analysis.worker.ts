/// <reference lib="webworker" />
import { NoteDetector } from './detector';
import { buildTemplateSet } from './templates';
import type { CalibrationData, FromWorker, ToWorker } from './workerProtocol';

/**
 * Hilo de análisis: recibe el audio del procesador de captura y ejecuta el detector sin frenar
 * la interfaz. Envía las notas detectadas y, unas 20 veces por segundo, el nivel para el monitor.
 */
declare const self: DedicatedWorkerGlobalScope;

let detector: NoteDetector | null = null;
let sampleRate = 48000;
let sensitivity = 1;
let a4 = 440;
let lastLevel = 0;
const recordings: { id: number; remaining: number; chunks: Float32Array[] }[] = [];

const send = (msg: FromWorker, transfer: Transferable[] = []) => self.postMessage(msg, transfer);

function build(calibration: CalibrationData | null): void {
  a4 = calibration?.a4 ?? 440;
  const measured = new Map<number, Float64Array>();
  for (const [pitch, values] of Object.entries(calibration?.templates ?? {})) {
    measured.set(Number(pitch), Float64Array.from(values));
  }
  detector = new NoteDetector({
    sampleRate,
    a4,
    templates: buildTemplateSet(measured),
    noiseSpectrum: calibration?.noiseSpectrum ? Float64Array.from(calibration.noiseSpectrum) : undefined,
    noiseRms: calibration?.noiseRms || undefined,
    sensitivity,
  });
}

function onAudio(samples: Float32Array): void {
  for (const r of recordings) {
    r.chunks.push(samples.slice(0, Math.min(samples.length, r.remaining)));
    r.remaining -= samples.length;
  }
  for (let i = recordings.length - 1; i >= 0; i--) {
    const r = recordings[i]!;
    if (r.remaining > 0) continue;
    recordings.splice(i, 1);
    const total = r.chunks.reduce((s, c) => s + c.length, 0);
    const out = new Float32Array(total);
    let o = 0;
    for (const c of r.chunks) {
      out.set(c, o);
      o += c.length;
    }
    send({ type: 'recording', id: r.id, samples: out }, [out.buffer]);
  }

  if (!detector) return;
  const events = detector.push(samples);
  if (events.length) send({ type: 'notes', events });
  const now = performance.now();
  if (now - lastLevel > 50) {
    lastLevel = now;
    send({
      type: 'level',
      rms: detector.level,
      activations: Array.from(detector.activations(), (v) => Math.round(v * 1000) / 1000),
      active: detector.activeNotes(),
    });
  }
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'init':
      sampleRate = msg.sampleRate;
      sensitivity = msg.sensitivity;
      build(msg.calibration);
      msg.port.onmessage = (ev: MessageEvent<Float32Array>) => onAudio(ev.data);
      break;
    case 'calibration':
      build(msg.calibration);
      break;
    case 'sensitivity':
      sensitivity = msg.value;
      detector?.setSensitivity(msg.value);
      break;
    case 'expected':
      detector?.setExpected(msg.pitches);
      break;
    case 'record':
      recordings.push({ id: msg.id, remaining: Math.round(msg.seconds * sampleRate), chunks: [] });
      break;
  }
};
