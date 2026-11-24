import type { HandChoice, PracticeMode } from '../core/practice/session';
import { noteName } from '../core/music/notes';
import { usePracticeLive, usePracticeSettings } from '../state/practice';
import { useViewSettings } from '../state/viewSettings';

const MODES: { value: PracticeMode; label: string; help: string }[] = [
  {
    value: 'wait',
    label: 'Espera',
    help: 'La canción se detiene en cada nota hasta que la tocas. Ideal para aprender.',
  },
  { value: 'rhythm', label: 'Ritmo', help: 'La canción no se para: se puntúa si tocas a tiempo (±200 ms).' },
  { value: 'listen', label: 'Escuchar', help: 'Escucha y mira la canción entera antes de tocarla.' },
];
const HANDS: { value: HandChoice; label: string; swatch?: string }[] = [
  { value: 'left', label: 'Izquierda', swatch: 'bg-lh' },
  { value: 'both', label: 'Ambas' },
  { value: 'right', label: 'Derecha', swatch: 'bg-rh' },
];

const title = 'text-[11px] font-semibold tracking-[0.09em] text-muted uppercase';

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string; swatch?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      className="flex gap-[3px] rounded-[10px] border border-line bg-panel-2 p-[3px]"
      role="radiogroup"
      aria-label={label}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-[7px] px-1.5 py-1.5 text-[13px] font-medium ${
            value === o.value
              ? 'bg-panel-3 text-fg shadow-[inset_0_0_0_1px_#3a4768]'
              : 'text-muted hover:text-fg'
          }`}
        >
          {o.swatch && <span className={`size-2 rounded-sm ${o.swatch}`} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Modo, manos, puntuación en vivo y siguiente nota. */
export function PracticePanel() {
  const { mode, hands, setMode, setHands } = usePracticeSettings();
  const stats = usePracticeLive((l) => l.stats);
  const upcoming = usePracticeLive((l) => l.upcoming);
  const naming = useViewSettings((v) => (v.noteLabels === 'english' ? 'english' : 'latin'));
  const attempts = stats.hits + stats.misses + stats.wrong;
  const accuracy = attempts ? Math.round((stats.hits / attempts) * 100) : null;
  const meanOffset = stats.offsets.length
    ? Math.round((stats.offsets.reduce((s, o) => s + Math.abs(o), 0) / stats.offsets.length) * 1000)
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className={title}>Modo</div>
        <Segmented label="Modo de práctica" options={MODES} value={mode} onChange={setMode} />
        <p className="text-[12.5px] text-muted">{MODES.find((m) => m.value === mode)!.help}</p>
      </div>

      {mode !== 'listen' && (
        <>
          <div className="flex flex-col gap-2">
            <div className={title}>Manos que practicas</div>
            <Segmented label="Manos que practicas" options={HANDS} value={hands} onChange={setHands} />
            <p className="text-[12.5px] text-muted">
              {hands === 'both' ? 'Tocas las dos manos.' : 'La otra mano la toca la app como acompañamiento.'}
            </p>
          </div>

          <div className="rounded-xl border border-line bg-panel p-3.5" aria-live="polite">
            <div className="flex items-baseline gap-2.5">
              <span className="font-display text-4xl leading-none font-bold tracking-tight tabular-nums">
                {accuracy == null ? '—' : `${accuracy} %`}
              </span>
              <span className="text-[12.5px] text-muted">precisión</span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-3.5 gap-y-2.5">
              {[
                ['Aciertos', stats.hits],
                ['Racha', stats.streak],
                ['Fallos', stats.misses],
                ['Notas falsas', stats.wrong],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11.5px] text-muted">{k}</dt>
                  <dd className="font-mono text-base tabular-nums">{v}</dd>
                </div>
              ))}
              {mode === 'rhythm' && (
                <div className="col-span-2">
                  <dt className="text-[11.5px] text-muted">Desvío medio</dt>
                  <dd className="font-mono text-base tabular-nums">
                    {meanOffset == null ? '—' : `${meanOffset} ms`}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <div className="flex flex-col gap-2">
            <div className={title}>Siguiente</div>
            <div className="flex flex-wrap items-center gap-2">
              {upcoming.length === 0 ? (
                <span className="text-[12.5px] text-muted">Nada pendiente.</span>
              ) : (
                <>
                  {upcoming.slice(0, 5).map((u) => (
                    <span
                      key={u.pitch}
                      className={`rounded-md border bg-panel-3 px-2 py-1 font-mono text-[13px] ${
                        u.hand === 'left' ? 'border-lh/60' : 'border-rh/60'
                      }`}
                    >
                      {noteName(u.pitch, naming)}
                      {u.finger ? ` · dedo ${u.finger}` : ''}
                    </span>
                  ))}
                  <span className="text-[12.5px] text-muted">
                    {upcoming.every((u) => u.hand === 'left')
                      ? 'mano izquierda'
                      : upcoming.every((u) => u.hand === 'right')
                        ? 'mano derecha'
                        : 'dos manos'}
                  </span>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
