import { useState } from 'react';
import { usePracticeSettings } from '../state/practice';
import { useProgress } from '../state/progress';
import { useSoundSettings } from '../state/soundSettings';
import { Card, Modal, PercentSlider, Switch, secondaryButton } from './controls';
import { useDialog } from './useDialog';

const SHORTCUTS: [string, string][] = [
  ['Espacio', 'Reproducir o pausar'],
  ['Inicio', 'Volver al principio'],
  ['[ y ]', 'Bajar o subir la octava del teclado del ordenador'],
  ['Z X C V B N M', 'Teclas blancas desde Do (las negras: S D G H J)'],
  ['Q W E R T Y U', 'Lo mismo una octava más arriba (las negras: 2 3 5 6 7)'],
  ['Esc', 'Cerrar ventanas'],
];

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useSoundSettings();
  const [confirming, setConfirming] = useState(false);
  const [cleared, setCleared] = useState(false);
  const closeRef = useDialog(open, () => {
    setConfirming(false);
    setCleared(false);
    onClose();
  });
  if (!open) return null;

  const clearProgress = async () => {
    await useProgress.getState().clear();
    usePracticeSettings.getState().clearBest();
    setConfirming(false);
    setCleared(true);
  };

  return (
    <Modal titleId="settings-title" title="Ajustes" onClose={onClose} closeRef={closeRef} width={560}>
      <Card title="Sonido">
        <PercentSlider id="volume" label="Volumen del piano" value={s.volume} onChange={s.setVolume} />
        <div className="flex items-center justify-between gap-3">
          <div>
            <div id="countin-label">Clics en la cuenta atrás</div>
            <p className="text-[12.5px] text-muted">Marcan el pulso antes de la primera nota.</p>
          </div>
          <Switch checked={s.countIn} onChange={s.setCountIn} labelId="countin-label" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div id="metronome-label">Metrónomo</div>
            <p className="text-[12.5px] text-muted">
              Un clic en cada pulso, más fuerte en el primero del compás.
            </p>
          </div>
          <Switch checked={s.metronome} onChange={s.setMetronome} labelId="metronome-label" />
        </div>
        {(s.metronome || s.countIn) && (
          <PercentSlider
            id="metronome-volume"
            label="Volumen de los clics"
            value={s.metronomeVolume}
            onChange={s.setMetronomeVolume}
          />
        )}
        <p className="text-[12.5px] text-muted">
          Si escuchas tu PSR-E283 por micrófono, usa auriculares en el ordenador: así Teclea no confunde su
          propio sonido con lo que tocas.
        </p>
      </Card>

      <Card title="Atajos de teclado">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
          {SHORTCUTS.map(([k, v]) => (
            <div key={k} className="contents">
              <dt>
                <kbd className="rounded border border-[#34405f] bg-panel-3 px-1.5 font-mono text-[12px]">
                  {k}
                </kbd>
              </dt>
              <dd className="text-muted">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card title="Tus datos">
        <p className="text-[12.5px] text-muted">
          Las canciones importadas, el progreso y la calibración se guardan solo en este ordenador.
        </p>
        {confirming ? (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-2 rounded-lg border border-bad/50 bg-bad/10 p-3"
          >
            <p className="min-w-0 flex-1 text-[13px]">
              Se borrarán la racha, el historial y las mejores marcas. No se puede deshacer.
            </p>
            <button
              type="button"
              onClick={() => void clearProgress()}
              className="rounded-[9px] bg-bad px-3 py-[7px] text-[13px] font-semibold text-[#1d0a0c]"
            >
              Borrar progreso
            </button>
            <button type="button" onClick={() => setConfirming(false)} className={secondaryButton}>
              Cancelar
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setCleared(false);
                setConfirming(true);
              }}
              className={secondaryButton}
            >
              Borrar progreso y marcas…
            </button>
            {cleared && (
              <span role="status" className="text-[12.5px] text-ok">
                Progreso borrado.
              </span>
            )}
          </div>
        )}
      </Card>
      <p className="text-center text-[12px] text-muted">Teclea {__APP_VERSION__}</p>
    </Modal>
  );
}
