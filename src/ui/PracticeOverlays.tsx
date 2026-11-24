import { noteName } from '../core/music/notes';
import { engine, usePlaybackState } from '../playback/usePlayback';
import { usePracticeLive, usePracticeSettings } from '../state/practice';
import { useViewSettings } from '../state/viewSettings';

/** "Esperando: Mi5" encima del teclado mientras la canción espera a que toques. */
export function WaitBadge() {
  const { holding, state } = usePlaybackState();
  const waiting = usePracticeLive((l) => l.waiting);
  const mode = usePracticeSettings((s) => s.mode);
  const naming = useViewSettings((v) => (v.noteLabels === 'english' ? 'english' : 'latin'));
  if (mode !== 'wait' || state !== 'playing' || !holding || waiting.length === 0) return null;
  return (
    <div
      role="status"
      className="pointer-events-none absolute bottom-[calc(20%+14px)] left-1/2 -translate-x-1/2 rounded-full border border-line bg-panel/90 px-3.5 py-1.5 text-[13px] whitespace-nowrap text-muted"
    >
      Esperando:{' '}
      <b className="font-semibold text-fg">{waiting.map((p) => noteName(p, naming)).join(' + ')}</b>
    </div>
  );
}

function Star({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-9" aria-hidden="true">
      <path
        d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"
        fill={on ? 'var(--color-rh)' : 'none'}
        stroke={on ? 'var(--color-rh)' : 'var(--color-line)'}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const HEADLINE = ['Sigue practicando', 'Vas por buen camino', 'Muy bien tocada', '¡Impecable!'];

/** Resultados al terminar la canción. */
export function ResultsOverlay({ onChooseSong }: { onChooseSong: () => void }) {
  const summary = usePracticeLive((l) => l.summary);
  const mode = usePracticeSettings((s) => s.mode);
  const { speed } = usePlaybackState();
  if (!summary) return null;
  const rows: [string, string | number][] = [
    ['Aciertos', `${summary.hits} de ${summary.total}`],
    ['Fallos', summary.misses],
    ['Notas falsas', summary.wrong],
    ['Mejor racha', summary.bestStreak],
    ...(mode === 'rhythm'
      ? ([['Desvío medio', summary.meanOffsetMs == null ? '—' : `${summary.meanOffsetMs} ms`]] as [
          string,
          string,
        ][])
      : []),
    ['Velocidad', `${Math.round(speed * 100)} %`],
  ];
  return (
    <div className="absolute inset-0 grid place-items-center bg-[rgba(7,10,18,0.78)] p-4 backdrop-blur-[3px]">
      <div
        role="dialog"
        aria-labelledby="res-title"
        className="flex w-[min(400px,100%)] flex-col gap-4 rounded-2xl border border-line bg-panel p-[22px] text-center"
      >
        <h2 id="res-title" className="font-display text-[22px] font-bold text-balance">
          {HEADLINE[summary.stars]}
        </h2>
        <div className="flex justify-center gap-2" aria-label={`${summary.stars} de 3 estrellas`}>
          {[0, 1, 2].map((i) => (
            <Star key={i} on={i < summary.stars} />
          ))}
        </div>
        <div>
          <div className="font-display text-5xl leading-none font-bold tabular-nums">
            {summary.accuracy} %
          </div>
          <div className="text-[12.5px] text-muted">precisión{summary.record ? ' · ¡nuevo récord!' : ''}</div>
        </div>
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-left text-[13px]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="font-mono tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              engine.restart();
              void engine.play();
            }}
            className="rounded-[9px] bg-rh px-4 py-2 text-[13px] font-semibold text-[#1b1206] hover:bg-[#f6b476]"
          >
            Repetir
          </button>
          <button
            type="button"
            onClick={() => {
              usePracticeLive.getState().setSummary(null);
              onChooseSong();
            }}
            className="rounded-[9px] border border-line bg-panel-2 px-4 py-2 text-[13px] font-medium hover:bg-panel-3"
          >
            Elegir otra canción
          </button>
        </div>
      </div>
    </div>
  );
}
