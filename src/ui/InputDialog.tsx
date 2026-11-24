import { useState, type ReactNode } from 'react';
import { noteName } from '../core/music/notes';
import { ALL_DEVICES, type MidiStatus } from '../input/midi';
import { MAX_PC_OCTAVE, MIN_PC_OCTAVE, pcBasePitch } from '../input/pcKeyboard';
import { inputHub } from '../input/setup';
import { useFrameValue } from '../playback/usePlayback';
import { useInputLive, useInputSettings } from '../state/inputSettings';
import { useViewSettings } from '../state/viewSettings';
import { AudioSourcePicker } from './AudioControls';
import { CalibrationDialog } from './CalibrationDialog';
import { useDialog } from './useDialog';

function Switch({
  checked,
  onChange,
  labelId,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  labelId: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelId}
      onClick={() => onChange(!checked)}
      className={`relative h-[22px] w-[38px] shrink-0 rounded-full border p-0 transition-colors ${
        checked ? 'border-rh bg-rh/30' : 'border-line bg-panel-3'
      }`}
    >
      <span
        className={`absolute top-[2px] left-[2px] size-4 rounded-full transition-transform ${
          checked ? 'translate-x-4 bg-rh' : 'bg-muted'
        }`}
      />
    </button>
  );
}

function Card({ title, badge, children }: { title: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 rounded-xl border border-line bg-panel-2 p-3.5">
      <h3 className="flex flex-wrap items-center gap-2 font-semibold">
        {title}
        {badge}
      </h3>
      {children}
    </section>
  );
}

const Badge = ({ tone, children }: { tone: 'ok' | 'muted' | 'lh'; children: ReactNode }) => (
  <span
    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
      tone === 'ok' ? 'bg-ok/15 text-ok' : tone === 'lh' ? 'bg-lh/15 text-lh' : 'bg-panel-3 text-muted'
    }`}
  >
    {children}
  </span>
);

function midiMessage(s: MidiStatus, enabled: boolean): string {
  if (!enabled) return 'Desactivado. Actívalo si conectas un teclado con USB TO HOST o MIDI.';
  switch (s.kind) {
    case 'unsupported':
      return 'Este navegador no permite MIDI. Usa la app de escritorio, Chrome o Edge.';
    case 'requesting':
      return 'Pidiendo permiso para usar MIDI…';
    case 'denied':
      return 'No se ha dado permiso para usar MIDI. Revisa los permisos del sitio y vuelve a activarlo.';
    case 'ready':
      return s.devices.length
        ? `${s.devices.length === 1 ? 'Teclado conectado' : `${s.devices.length} teclados conectados`}.`
        : 'No hay ningún teclado MIDI conectado. Conéctalo por USB y aparecerá aquí.';
    default:
      return 'Preparando…';
  }
}

export function InputDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useInputSettings();
  const midiStatus = useInputLive((l) => l.midiStatus);
  const recent = useInputLive((l) => l.recent);
  const naming = useViewSettings((v) => (v.noteLabels === 'english' ? 'english' : 'latin'));
  const [calOpen, setCalOpen] = useState(false);
  const closeRef = useDialog(open, onClose, !calOpen);
  const audioListening = useInputLive((l) => l.audioStatus.kind === 'listening');
  const pressed = useFrameValue(
    () => [...inputHub.pressed()].sort((a, b) => a - b),
    (p) => p.join(),
  );

  if (!open) return null;
  const base = pcBasePitch(s.pcOctave);
  const devices = midiStatus.kind === 'ready' ? midiStatus.devices : [];

  return (
    <>
      <div className="fixed inset-0 z-20 bg-[rgba(4,6,12,0.6)]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="inputs-title"
        className="fixed top-1/2 left-1/2 z-21 flex max-h-[calc(100%-32px)] w-[min(640px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-line bg-panel"
      >
        <header className="flex items-center gap-3 border-b border-line px-[18px] py-4">
          <h2 id="inputs-title" className="font-display text-xl font-bold">
            Entradas de notas
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

        <div className="flex flex-col gap-3 overflow-auto p-[18px]">
          <Card
            title="Tu Yamaha PSR-E283 (por audio)"
            badge={audioListening ? <Badge tone="ok">Escuchando</Badge> : null}
          >
            <p className="text-[12.5px] text-muted">
              No tiene USB ni MIDI: Teclea reconoce las notas escuchando su sonido, por cable o por micrófono.
            </p>
            <AudioSourcePicker />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="sensitivity" className="flex items-center justify-between gap-3">
                <span>Sensibilidad</span>
                <output htmlFor="sensitivity" className="font-mono text-[13px] tabular-nums">
                  {s.sensitivity.toFixed(1).replace('.', ',')}
                </output>
              </label>
              <input
                id="sensitivity"
                type="range"
                min={0.5}
                max={2}
                step={0.1}
                value={s.sensitivity}
                onChange={(e) => s.setSensitivity(Number(e.target.value))}
                className="accent-rh"
              />
              <p className="text-[12.5px] text-muted">
                Súbela si no detecta notas suaves; bájala si aparecen notas que no has tocado.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-panel p-3">
              <p className="min-w-0 text-[12.5px]">
                {s.calibration?.date ? (
                  <>
                    <span className="text-ok">Calibrado</span>{' '}
                    <span className="text-muted">
                      el {new Date(s.calibration.date).toLocaleDateString('es')} ·{' '}
                      {Object.keys(s.calibration.templates).length} huellas · La4{' '}
                      {s.calibration.a4.toFixed(1).replace('.', ',')} Hz · {s.calibration.latencyMs} ms
                    </span>
                  </>
                ) : (
                  <span className="text-muted">
                    Sin calibrar: usa huellas genéricas. Calibrar mejora mucho los acordes y las octavas.
                  </span>
                )}
              </p>
              <button
                type="button"
                onClick={() => setCalOpen(true)}
                className="rounded-[9px] bg-rh px-3 py-[7px] text-[13px] font-semibold text-[#1b1206] hover:bg-[#f6b476]"
              >
                {s.calibration?.date ? 'Volver a calibrar' : 'Calibrar'}
              </button>
            </div>
          </Card>

          <Card title="Teclado del ordenador" badge={s.pcKeyboard ? <Badge tone="ok">Activo</Badge> : null}>
            <div className="flex items-center justify-between gap-3">
              <span id="pc-on">Tocar con el teclado del ordenador</span>
              <Switch checked={s.pcKeyboard} onChange={s.setPcKeyboard} labelId="pc-on" />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>
                Octava: <span className="font-mono text-[13px]">Z = {noteName(base, naming)}</span> ·{' '}
                <span className="font-mono text-[13px]">Q = {noteName(base + 12, naming)}</span>
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label="Bajar una octava"
                  disabled={s.pcOctave <= MIN_PC_OCTAVE}
                  onClick={() => s.setPcOctave(s.pcOctave - 1)}
                  className="size-8 rounded-lg border border-line bg-panel disabled:opacity-40"
                >
                  −
                </button>
                <button
                  type="button"
                  aria-label="Subir una octava"
                  disabled={s.pcOctave >= MAX_PC_OCTAVE}
                  onClick={() => s.setPcOctave(s.pcOctave + 1)}
                  className="size-8 rounded-lg border border-line bg-panel disabled:opacity-40"
                >
                  +
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span id="pc-labels">Mostrar las letras sobre el teclado</span>
              <Switch checked={s.showPcKeys} onChange={s.setShowPcKeys} labelId="pc-labels" />
            </div>
            <p className="text-[12.5px] text-muted">
              Fila de abajo (Z, X, C…) y fila de arriba (Q, W, E…) son teclas blancas; las de en medio y los
              números, negras. También puedes cambiar de octava con <kbd className="font-mono">[</kbd> y{' '}
              <kbd className="font-mono">]</kbd>.
            </p>
          </Card>

          <Card
            title="Teclado MIDI (USB o Bluetooth)"
            badge={s.midiEnabled && devices.length ? <Badge tone="ok">Conectado</Badge> : null}
          >
            <div className="flex items-center justify-between gap-3">
              <span id="midi-on">Escuchar teclados MIDI</span>
              <Switch checked={s.midiEnabled} onChange={s.setMidiEnabled} labelId="midi-on" />
            </div>
            <p className="text-[12.5px] text-muted" role="status">
              {midiMessage(midiStatus, s.midiEnabled)}
            </p>
            {s.midiEnabled && devices.length > 0 && (
              <label className="flex flex-wrap items-center justify-between gap-3">
                <span>Usar</span>
                <select
                  value={devices.some((d) => d.id === s.midiDevice) ? s.midiDevice : ALL_DEVICES}
                  onChange={(e) => s.setMidiDevice(e.target.value)}
                  className="min-w-0 rounded-lg border border-line bg-panel px-2 py-1.5"
                >
                  <option value={ALL_DEVICES}>Todos los teclados</option>
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </Card>

          <Card title="Ratón o pantalla táctil" badge={<Badge tone="ok">Activo</Badge>}>
            <p className="text-[12.5px] text-muted">
              Haz clic o toca las teclas de la pantalla. Arrastra para tocar varias seguidas.
            </p>
          </Card>

          <div className="flex items-center justify-between gap-3 px-1">
            <span id="play-sound">
              Sonido de la app al tocar
              <span className="block text-[12.5px] text-muted">
                Desactívalo si tu teclado MIDI ya suena por sus altavoces.
              </span>
            </span>
            <Switch checked={s.playSound} onChange={s.setPlaySound} labelId="play-sound" />
          </div>

          <div
            className="flex flex-col gap-1.5 rounded-xl border border-dashed border-[#3a4566] p-3.5"
            aria-live="polite"
          >
            <div className="text-[11px] font-semibold tracking-[0.09em] text-muted uppercase">Prueba</div>
            <p className="text-[12.5px] text-muted">Toca algo para comprobar que llega.</p>
            <div className="flex flex-wrap gap-1.5 font-mono text-[13px]">
              {recent.length === 0 && <span className="text-muted">Todavía no has tocado nada.</span>}
              {recent.map((p, i) => (
                <span
                  key={`${p}-${i}`}
                  className={`rounded-md border px-2 py-0.5 ${
                    pressed.includes(p) && i === recent.indexOf(p)
                      ? 'border-rh bg-rh/15 text-fg'
                      : 'border-line text-muted'
                  }`}
                >
                  {noteName(p, naming)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
      <CalibrationDialog open={calOpen} onClose={() => setCalOpen(false)} />
    </>
  );
}
