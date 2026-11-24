import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  QUICK_PITCHES,
  TemplateRecorder,
  compactArray,
  latencyFromTaps,
  measureA4,
  measureNoise,
  templateMatchesPitch,
  type NoiseProfile,
} from '../audio-detect/calibration';
import { TEMPLATE_PITCHES } from '../audio-detect/templates';
import type { CalibrationData } from '../audio-detect/workerProtocol';
import { noteName } from '../core/music/notes';
import { audioInput } from '../input/setup';
import { useInputLive, useInputSettings } from '../state/inputSettings';
import { AudioMeter, AudioSourcePicker } from './AudioControls';
import { useDialog } from './useDialog';

type Step = 'connect' | 'silence' | 'tuning' | 'keys' | 'latency' | 'done';
const STEPS: { id: Step; label: string }[] = [
  { id: 'connect', label: 'Conexión' },
  { id: 'silence', label: 'Silencio' },
  { id: 'tuning', label: 'Afinación' },
  { id: 'keys', label: 'Huellas' },
  { id: 'latency', label: 'Latencia' },
  { id: 'done', label: 'Listo' },
];

/** Dónde está una tecla en el PSR-E283 (Do2 es la primera por la izquierda). */
function keyHint(pitch: number): string {
  const octave = Math.floor((pitch - 36) / 12) + 1;
  const ordinal = ['primera', 'segunda', 'tercera', 'cuarta', 'quinta', 'sexta'][octave - 1] ?? `${octave}.ª`;
  return pitch === 96
    ? 'la última tecla de la derecha'
    : `en la ${ordinal} octava empezando por la izquierda`;
}

const btn =
  'rounded-[9px] border border-line bg-panel-2 px-3 py-[7px] text-[13px] font-medium hover:bg-panel-3 disabled:cursor-not-allowed disabled:opacity-45';
const primary =
  'rounded-[9px] bg-rh px-3 py-[7px] text-[13px] font-semibold text-[#1b1206] hover:bg-[#f6b476] disabled:cursor-not-allowed disabled:opacity-45';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-display text-lg font-bold">{title}</h3>
      {children}
    </div>
  );
}

export function CalibrationDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useInputSettings();
  const status = useInputLive((l) => l.audioStatus);
  const listening = status.kind === 'listening';
  const previous = settings.calibration;

  const [step, setStep] = useState<Step>('connect');
  const [noise, setNoise] = useState<NoiseProfile | null>(null);
  const [a4, setA4] = useState<number>(previous?.a4 ?? 440);
  const [templates, setTemplates] = useState<Record<number, number[]>>({});
  const [latency, setLatency] = useState<number>(previous?.latencyMs ?? 0);
  const [mode, setMode] = useState<'quick' | 'full'>('quick');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad' | 'muted'; text: string } | null>(null);
  const [keyIndex, setKeyIndex] = useState(0);
  const running = useRef(false);
  const closeRef = useDialog(open, onClose);

  // Cada vez que se abre empieza de cero; al cerrarse se detiene la grabación en curso.
  useEffect(() => {
    if (!open) return;
    setStep('connect');
    setMessage(null);
    setKeyIndex(0);
    setTemplates({});
    setNoise(null);
    return () => {
      running.current = false;
    };
  }, [open]);

  if (!open) return null;
  const pitches = mode === 'quick' ? QUICK_PITCHES : TEMPLATE_PITCHES;
  const sr = audioInput.sampleRate;
  const go = (s: Step) => {
    setMessage(null);
    setStep(s);
  };

  const measureSilence = async () => {
    setBusy(true);
    setMessage({ tone: 'muted', text: 'Midiendo… no toques nada.' });
    const samples = await audioInput.record(2);
    const profile = measureNoise(samples, sr, a4);
    setNoise(profile);
    const db = 20 * Math.log10(Math.max(1e-6, profile.rms));
    setMessage(
      db > -35
        ? {
            tone: 'bad',
            text: `Hay bastante ruido (${db.toFixed(0)} dB). Baja el volumen de la entrada o aleja el micrófono de otros sonidos.`,
          }
        : { tone: 'ok', text: `Ruido de fondo: ${db.toFixed(0)} dB. Bien.` },
    );
    setBusy(false);
  };

  const measureTuning = async () => {
    setBusy(true);
    setMessage({ tone: 'muted', text: 'Toca La4 ahora y mantenla…' });
    const value = measureA4(await audioInput.record(1.6), sr);
    if (value) {
      setA4(value);
      const cents = Math.round(1200 * Math.log2(value / 440));
      setMessage({
        tone: 'ok',
        text: `La4 = ${value.toFixed(1).replace('.', ',')} Hz (${cents > 0 ? '+' : ''}${cents === 0 ? '0' : cents} cents respecto a 440).`,
      });
    } else {
      setMessage({
        tone: 'bad',
        text: 'No se oyó un La4 claro. Pulsa Medir y toca la tecla con fuerza durante un segundo.',
      });
    }
    setBusy(false);
  };

  /** Graba las teclas una tras otra; se para si una no se oye bien. */
  const recordKeys = async (from: number) => {
    running.current = true;
    setBusy(true);
    let finished = true;
    for (let i = from; i < pitches.length && running.current; i++) {
      const pitch = pitches[i]!;
      setKeyIndex(i);
      setMessage({ tone: 'muted', text: `Toca ${noteName(pitch)} y mantenla un segundo.` });
      const rec = new TemplateRecorder(sr, a4, noise);
      rec.push(await audioInput.record(1.4));
      const t = rec.result();
      if (!running.current) {
        finished = false;
        break;
      }
      if (!t) {
        setMessage({
          tone: 'bad',
          text: `No se oyó ${noteName(pitch)}. Pulsa «Repetir» y tócala más fuerte, o «Saltar».`,
        });
        running.current = false;
        setBusy(false);
        return;
      }
      if (!templateMatchesPitch(t, pitch)) {
        setMessage({
          tone: 'bad',
          text: `Parece que no era ${noteName(pitch)}. Pulsa «Repetir» y toca la tecla indicada.`,
        });
        running.current = false;
        setBusy(false);
        return;
      }
      setTemplates((prev) => ({ ...prev, [pitch]: compactArray(t) }));
      setKeyIndex(i + 1);
    }
    running.current = false;
    setBusy(false);
    setMessage(finished ? { tone: 'ok', text: 'Huellas grabadas. Pulsa Continuar.' } : null);
  };

  const measureLatency = async () => {
    setBusy(true);
    setMessage({ tone: 'muted', text: 'Toca Do4 a la vez que cada clic (8 clics).' });
    const onsets: number[] = [];
    const off = audioInput.onRawOnset((time) => onsets.push(time));
    const clicks = Array.from({ length: 8 }, (_, i) => audioInput.click(0.8 + i * 0.75, i === 0));
    await new Promise((r) => setTimeout(r, (0.8 + 8 * 0.75 + 0.5) * 1000));
    off();
    const result = latencyFromTaps(
      clicks.map((c) => c / 1000),
      onsets.map((o) => o / 1000),
    );
    if (result && result.ms >= 0 && result.ms < 400) {
      setLatency(result.ms);
      setMessage({
        tone: result.spread > 60 ? 'bad' : 'ok',
        text:
          result.spread > 60
            ? `Latencia: ${result.ms} ms, pero los golpes variaron mucho (±${result.spread} ms). Repite si puedes.`
            : `Latencia: ${result.ms} ms.`,
      });
    } else {
      setMessage({ tone: 'bad', text: 'No se detectaron suficientes golpes a tiempo. Repite o sáltalo.' });
    }
    setBusy(false);
  };

  const save = () => {
    const data: CalibrationData = {
      a4,
      noiseRms: noise?.rms ?? previous?.noiseRms ?? 0,
      noiseSpectrum: noise ? compactArray(noise.spectrum) : (previous?.noiseSpectrum ?? null),
      templates: Object.keys(templates).length ? templates : (previous?.templates ?? {}),
      latencyMs: latency,
      date: new Date().toISOString(),
    };
    settings.setCalibration(data);
    onClose();
  };

  const recorded = Object.keys(templates).length;
  const currentPitch = pitches[Math.min(keyIndex, pitches.length - 1)]!;

  return (
    <>
      <div className="fixed inset-0 z-30 bg-[rgba(4,6,12,0.6)]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cal-title"
        className="fixed top-1/2 left-1/2 z-31 flex max-h-[calc(100%-32px)] w-[min(720px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-line bg-panel"
      >
        <header className="flex items-center gap-3 border-b border-line px-[18px] py-4">
          <h2 id="cal-title" className="font-display text-xl font-bold">
            Calibrar el audio de tu PSR-E283
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="ml-auto size-[34px] rounded-lg border border-line bg-panel-2 text-lg leading-none"
          >
            ×
          </button>
        </header>

        <nav className="flex flex-wrap gap-1.5 px-[18px] pt-3.5" aria-label="Pasos">
          {STEPS.map((s, i) => (
            <span
              key={s.id}
              aria-current={s.id === step ? 'step' : undefined}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] ${
                s.id === step ? 'border-rh text-fg' : 'border-line text-muted'
              }`}
            >
              <b className="font-mono font-medium">{i + 1}</b>
              {s.label}
            </span>
          ))}
        </nav>

        <div className="flex flex-col gap-4 overflow-auto p-[18px]">
          {step === 'connect' && (
            <Section title="Cómo llega el sonido">
              <p className="text-[13px] text-muted">
                Con <b className="text-fg">cable</b>: de la salida PHONES/OUTPUT del teclado a la entrada de
                línea (o de micrófono) del PC, con un adaptador de jack 6,3 mm a 3,5 mm. Es lo más fiable. Con{' '}
                <b className="text-fg">micrófono</b>: el del portátil o uno USB, cerca de los altavoces del
                teclado y en una habitación tranquila.
              </p>
              <AudioSourcePicker />
              {listening && (
                <p className="text-[13px] text-muted">
                  Toca unas notas: la barra de nivel debe moverse sin llegar al rojo.
                </p>
              )}
            </Section>
          )}

          {step === 'silence' && (
            <Section title="Ruido de fondo">
              <p className="text-[13px] text-muted">
                Durante 2 segundos no toques nada. Así Teclea sabe qué es ruido y qué es una nota.
              </p>
              <AudioMeter />
              <div>
                <button type="button" className={primary} disabled={busy} onClick={measureSilence}>
                  Medir silencio
                </button>
              </div>
            </Section>
          )}

          {step === 'tuning' && (
            <Section title="Afinación">
              <p className="text-[13px] text-muted">
                El PSR-E283 se puede afinar entre 427 y 453 Hz. Cuando pulses Medir, toca{' '}
                <b className="text-fg">La4</b> (el La justo encima del Do central) y mantenla un segundo.
              </p>
              <p className="font-mono text-[13px]">
                Afinación actual: La4 = {a4.toFixed(1).replace('.', ',')} Hz
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={primary} disabled={busy} onClick={measureTuning}>
                  Medir
                </button>
                <button type="button" className={btn} disabled={busy} onClick={() => setA4(440)}>
                  Usar 440 Hz
                </button>
              </div>
            </Section>
          )}

          {step === 'keys' && (
            <Section title="Huella de cada tecla">
              <p className="text-[13px] text-muted">
                Teclea graba cómo suena cada tecla de tu teclado. Con esas huellas reconoce acordes y octavas
                mucho mejor. Toca cada nota que se pida, sola, durante un segundo.
              </p>
              <div
                className="flex gap-[3px] rounded-[10px] border border-line bg-panel-2 p-[3px]"
                role="radiogroup"
                aria-label="Tipo de calibración"
              >
                {(
                  [
                    ['quick', `Rápida · 21 teclas (≈1 min)`],
                    ['full', `Completa · 61 teclas (≈3 min)`],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={mode === value}
                    disabled={busy}
                    onClick={() => {
                      setMode(value);
                      setKeyIndex(0);
                      setTemplates({});
                    }}
                    className={`flex-1 rounded-[7px] px-2 py-1.5 text-[13px] font-medium ${
                      mode === value
                        ? 'bg-panel-3 text-fg shadow-[inset_0_0_0_1px_#3a4768]'
                        : 'text-muted hover:text-fg'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex flex-col items-center gap-1 rounded-xl border border-line bg-panel-2 p-4 text-center">
                {keyIndex < pitches.length ? (
                  <>
                    <span className="text-[12.5px] text-muted">
                      Tecla {Math.min(keyIndex + 1, pitches.length)} de {pitches.length}
                    </span>
                    <span className="font-display text-4xl font-bold">{noteName(currentPitch)}</span>
                    <span className="text-[12.5px] text-muted">{keyHint(currentPitch)}</span>
                  </>
                ) : (
                  <span className="font-display text-2xl font-bold text-ok">Todas grabadas</span>
                )}
              </div>
              <div
                className="grid grid-cols-[repeat(21,minmax(0,1fr))] gap-[2px]"
                aria-label={`${recorded} de ${pitches.length} teclas grabadas`}
              >
                {pitches.map((p, i) => (
                  <span
                    key={p}
                    title={noteName(p)}
                    className={`h-5 rounded-[3px] ${templates[p] ? 'bg-ok' : i === keyIndex && busy ? 'bg-rh' : 'bg-panel-3'}`}
                  />
                ))}
              </div>
              <AudioMeter />
              <div className="flex flex-wrap gap-2">
                {!busy && keyIndex < pitches.length && (
                  <button type="button" className={primary} onClick={() => void recordKeys(keyIndex)}>
                    {keyIndex === 0 && recorded === 0 ? 'Empezar' : 'Repetir'}
                  </button>
                )}
                {busy && (
                  <button type="button" className={btn} onClick={() => (running.current = false)}>
                    Pausar
                  </button>
                )}
                {!busy && keyIndex < pitches.length && (
                  <button type="button" className={btn} onClick={() => setKeyIndex(keyIndex + 1)}>
                    Saltar
                  </button>
                )}
              </div>
            </Section>
          )}

          {step === 'latency' && (
            <Section title="Latencia (opcional)">
              <p className="text-[13px] text-muted">
                Sonarán 8 clics por los altavoces del PC. Toca <b className="text-fg">Do4</b> exactamente a la
                vez que cada uno. Teclea mide cuánto tarda tu nota en llegar y lo compensa al puntuar el
                ritmo.
              </p>
              <p className="font-mono text-[13px]">Latencia actual: {latency} ms</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={primary} disabled={busy} onClick={measureLatency}>
                  Empezar
                </button>
              </div>
            </Section>
          )}

          {step === 'done' && (
            <Section title="Resumen">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
                <dt className="text-muted">Ruido de fondo</dt>
                <dd>
                  {noise
                    ? `${(20 * Math.log10(Math.max(1e-6, noise.rms))).toFixed(0)} dB`
                    : 'sin medir (se mantiene el anterior)'}
                </dd>
                <dt className="text-muted">Afinación</dt>
                <dd>La4 = {a4.toFixed(1).replace('.', ',')} Hz</dd>
                <dt className="text-muted">Huellas</dt>
                <dd>
                  {recorded
                    ? `${recorded} teclas grabadas; las demás se deducen`
                    : 'ninguna nueva (se usan las anteriores o las genéricas)'}
                </dd>
                <dt className="text-muted">Latencia</dt>
                <dd>{latency} ms</dd>
              </dl>
            </Section>
          )}

          {message && (
            <p
              role="status"
              className={`text-[13px] ${message.tone === 'ok' ? 'text-ok' : message.tone === 'bad' ? 'text-bad' : 'text-muted'}`}
            >
              {message.text}
            </p>
          )}
        </div>

        <footer className="flex justify-between gap-2 border-t border-line px-[18px] py-3.5">
          <button
            type="button"
            className={btn}
            disabled={busy || step === 'connect'}
            onClick={() => go(STEPS[Math.max(0, STEPS.findIndex((s) => s.id === step) - 1)]!.id)}
          >
            Atrás
          </button>
          {step === 'done' ? (
            <button type="button" className={primary} onClick={save}>
              Guardar calibración
            </button>
          ) : (
            <button
              type="button"
              className={primary}
              disabled={busy || !listening}
              onClick={() => go(STEPS[STEPS.findIndex((s) => s.id === step) + 1]!.id)}
            >
              {step === 'latency' || step === 'tuning' || step === 'silence' ? 'Siguiente' : 'Continuar'}
            </button>
          )}
        </footer>
      </div>
    </>
  );
}
