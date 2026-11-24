import { useEffect } from 'react';
import type { AudioStatus } from '../input/audioInput';
import { refreshAudioDevices } from '../input/setup';
import { useInputLive, useInputSettings } from '../state/inputSettings';

/** Barra de nivel de la entrada de audio, en dB (verde, amarillo cerca del máximo, rojo saturado). */
export function AudioMeter() {
  const rms = useInputLive((l) => l.audioLevel.rms);
  const listening = useInputLive((l) => l.audioStatus.kind === 'listening');
  const db = 20 * Math.log10(Math.max(1e-5, rms));
  const pct = listening ? Math.max(0, Math.min(100, ((db + 70) / 70) * 100)) : 0;
  return (
    <div className="flex items-center gap-3">
      <div
        className="h-2 flex-1 overflow-hidden rounded-full border border-line bg-[#0b101c]"
        role="meter"
        aria-label="Nivel de entrada"
        aria-valuemin={-70}
        aria-valuemax={0}
        aria-valuenow={Math.round(db)}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-75 ${db > -3 ? 'bg-bad' : db > -12 ? 'bg-[#e5d36a]' : 'bg-ok'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-14 text-right font-mono text-xs text-muted tabular-nums">
        {listening ? `${Math.max(-70, db).toFixed(0)} dB` : '—'}
      </span>
    </div>
  );
}

function statusText(s: AudioStatus): { tone: 'ok' | 'bad' | 'muted'; text: string } {
  switch (s.kind) {
    case 'off':
      return { tone: 'muted', text: 'Desactivado.' };
    case 'starting':
      return { tone: 'muted', text: 'Abriendo la entrada de audio…' };
    case 'listening':
      return {
        tone: 'ok',
        text: `Escuchando: ${s.deviceLabel} (${(s.sampleRate / 1000).toFixed(1).replace('.', ',')} kHz).`,
      };
    case 'denied':
      return {
        tone: 'bad',
        text: 'No hay permiso para usar el audio. En Windows: Configuración › Privacidad y seguridad › Micrófono, y permite el acceso a las aplicaciones de escritorio.',
      };
    case 'unsupported':
      return {
        tone: 'bad',
        text: 'Este navegador no permite capturar audio. Usa la app de escritorio, Chrome o Edge.',
      };
    case 'error':
      return { tone: 'bad', text: s.message };
  }
}

/** Activar la escucha, elegir cable o micrófono, la entrada y el volumen de escucha por el PC. */
export function AudioSourcePicker() {
  const s = useInputSettings();
  const audioStatus = useInputLive((l) => l.audioStatus);
  const audioDevices = useInputLive((l) => l.audioDevices);
  const status = statusText(audioStatus);

  useEffect(() => {
    void refreshAudioDevices();
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span id="audio-on">Escuchar mi teclado por audio</span>
        <button
          type="button"
          role="switch"
          aria-checked={s.audioEnabled}
          aria-labelledby="audio-on"
          onClick={() => s.setAudioEnabled(!s.audioEnabled)}
          className={`relative h-[22px] w-[38px] shrink-0 rounded-full border p-0 transition-colors ${
            s.audioEnabled ? 'border-rh bg-rh/30' : 'border-line bg-panel-3'
          }`}
        >
          <span
            className={`absolute top-[2px] left-[2px] size-4 rounded-full transition-transform ${
              s.audioEnabled ? 'translate-x-4 bg-rh' : 'bg-muted'
            }`}
          />
        </button>
      </div>

      <div
        className="flex gap-[3px] rounded-[10px] border border-line bg-panel-2 p-[3px]"
        role="radiogroup"
        aria-label="Cómo llega el sonido"
      >
        {(
          [
            ['line', 'Cable (recomendado)'],
            ['mic', 'Micrófono'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={s.audioMode === value}
            onClick={() => s.setAudioMode(value)}
            className={`flex-1 rounded-[7px] px-2 py-1.5 text-[13px] font-medium ${
              s.audioMode === value
                ? 'bg-panel-3 text-fg shadow-[inset_0_0_0_1px_#3a4768]'
                : 'text-muted hover:text-fg'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <label className="flex flex-wrap items-center justify-between gap-3">
        <span>Entrada de audio</span>
        <select
          value={s.audioDevice ?? ''}
          onChange={(e) => s.setAudioDevice(e.target.value || null)}
          className="max-w-full min-w-0 rounded-lg border border-line bg-panel px-2 py-1.5"
        >
          <option value="">Predeterminada del sistema</option>
          {audioDevices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </label>

      <p
        role="status"
        className={`text-[12.5px] ${status.tone === 'ok' ? 'text-ok' : status.tone === 'bad' ? 'text-bad' : 'text-muted'}`}
      >
        {status.text}
      </p>
      <AudioMeter />

      {s.audioMode === 'line' && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="monitor" className="flex items-center justify-between gap-3">
            <span>Oír el teclado por el PC</span>
            <output htmlFor="monitor" className="font-mono text-[13px] tabular-nums">
              {Math.round(s.monitorVolume * 100)} %
            </output>
          </label>
          <input
            id="monitor"
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(s.monitorVolume * 100)}
            onChange={(e) => s.setMonitorVolume(Number(e.target.value) / 100)}
            className="accent-rh"
          />
          <p className="text-[12.5px] text-muted">
            Al enchufar el cable, los altavoces del teclado se apagan: Teclea reenvía el sonido a los del PC.
          </p>
        </div>
      )}
    </div>
  );
}
