import { MAX_SPEED, MIN_SPEED } from '../core/transport/transport';
import type { Song } from '../core/song/types';
import { LEAD_IN } from '../playback/engine';
import { engine, useFrameValue, usePlaybackState } from '../playback/usePlayback';
import { useViewSettings, type StageView } from '../state/viewSettings';
import { formatTime, measureAt } from './format';

const VIEWS: { value: StageView; label: string }[] = [
  { value: 'notes', label: 'Notas' },
  { value: 'split', label: 'Las dos' },
  { value: 'sheet', label: 'Partitura' },
];

/** Elige qué se ve en el escenario. */
function ViewToggle() {
  const view = useViewSettings((v) => v.stageView);
  const setView = useViewSettings((v) => v.setStageView);
  return (
    <div
      className="flex gap-[3px] rounded-[10px] border border-line bg-panel-2 p-[3px]"
      role="radiogroup"
      aria-label="Vista"
    >
      {VIEWS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={view === o.value}
          onClick={() => setView(o.value)}
          className={`rounded-[7px] px-2.5 py-1 text-[12.5px] font-medium ${
            view === o.value
              ? 'bg-panel-3 text-fg shadow-[inset_0_0_0_1px_#3a4768]'
              : 'text-muted hover:text-fg'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-[18px]" aria-hidden="true">
      <path d="M6 4l10 6-10 6z" fill="currentColor" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-[18px]" aria-hidden="true">
      <rect x="5" y="4" width="3.5" height="12" rx="1" fill="currentColor" />
      <rect x="11.5" y="4" width="3.5" height="12" rx="1" fill="currentColor" />
    </svg>
  );
}
function RestartIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-[18px]" aria-hidden="true">
      <path
        d="M4 4v5h5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.6 12.5A6 6 0 1 0 5 7l-1 2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function TransportBar({ song }: { song: Song }) {
  const { state } = usePlaybackState();
  const time = useFrameValue(
    () => engine.time,
    (t) => t.toFixed(1),
  );
  const playing = state === 'playing';
  const measure = measureAt(song.measures, time);
  const start = Math.min(0, song.notes[0]?.start ?? 0) - LEAD_IN;

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-line bg-panel px-3 py-2.5">
      <button
        type="button"
        onClick={() => engine.restart()}
        aria-label="Volver al inicio"
        className="grid size-[38px] place-items-center rounded-full border border-line bg-panel-2 hover:bg-panel-3"
      >
        <RestartIcon />
      </button>
      <button
        type="button"
        onClick={() => engine.togglePlay()}
        aria-label={playing ? 'Pausar' : 'Reproducir'}
        className="grid size-11 place-items-center rounded-full bg-rh text-[#1b1206] hover:bg-[#f6b476]"
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <span className="font-mono text-[12.5px] whitespace-nowrap text-muted tabular-nums">
        {formatTime(Math.min(time, song.duration))} / {formatTime(song.duration)}
      </span>
      <input
        type="range"
        aria-label="Posición en la canción"
        className="min-w-[120px] flex-1 accent-rh"
        min={start}
        max={song.duration}
        step={0.01}
        value={Math.min(time, song.duration)}
        onChange={(e) => engine.seek(Number(e.target.value))}
      />
      <span className="text-xs whitespace-nowrap text-muted tabular-nums">
        {measure ? `Compás ${measure} de ${song.measures.length}` : 'Cuenta atrás'} ·{' '}
        {song.timeSignature.join('/')}
      </span>
      <ViewToggle />
    </div>
  );
}

export function SpeedControl() {
  const { speed } = usePlaybackState();
  const pct = Math.round(speed * 100);
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="speed" className="text-[11px] font-semibold tracking-[0.09em] text-muted uppercase">
        Velocidad
      </label>
      <div className="flex items-center gap-3">
        <input
          id="speed"
          type="range"
          className="flex-1 accent-rh"
          min={MIN_SPEED * 100}
          max={MAX_SPEED * 100}
          step={5}
          value={pct}
          onChange={(e) => engine.setSpeed(Number(e.target.value) / 100)}
        />
        <output htmlFor="speed" className="min-w-11 text-right font-mono text-[13px] tabular-nums">
          {pct} %
        </output>
      </div>
    </div>
  );
}

export function LoopControl({ song }: { song: Song }) {
  const { loop } = usePlaybackState();
  const m = song.measures;
  const markStart = () => {
    const t = engine.time;
    let a = m[0] ?? 0;
    for (const s of m) if (s <= t + 0.05) a = s;
    const end = loop && loop.end > a + 0.05 ? loop.end : (m.find((s) => s > a + 0.05) ?? song.duration);
    engine.setLoop({ start: a, end });
  };
  const markEnd = () => {
    const t = engine.time;
    const start = loop?.start ?? m[0] ?? 0;
    let b = m.find((s) => s >= t - 0.05 && s > start + 0.05) ?? song.duration;
    if (b <= start + 0.05) b = song.duration;
    engine.setLoop({ start, end: b });
  };
  const btn =
    'rounded-[9px] border border-line bg-panel-2 px-3 py-[7px] text-[13px] font-medium hover:bg-panel-3';
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] font-semibold tracking-[0.09em] text-muted uppercase">Repetir un tramo</div>
      <div className="grid grid-cols-3 gap-1.5">
        <button type="button" className={btn} onClick={markStart}>
          Inicio A
        </button>
        <button type="button" className={btn} onClick={markEnd}>
          Fin B
        </button>
        <button
          type="button"
          className={`${btn} disabled:cursor-not-allowed disabled:opacity-45`}
          disabled={!loop}
          onClick={() => engine.setLoop(null)}
        >
          Quitar
        </button>
      </div>
      <p className="text-[12.5px] text-muted">
        {loop
          ? `Repitiendo compases ${measureAt(m, loop.start)}–${measureAt(m, loop.end - 0.01)}.`
          : 'Marca A y B mientras suena; se ajustan al compás.'}
      </p>
    </div>
  );
}
