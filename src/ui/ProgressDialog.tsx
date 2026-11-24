import { useMemo, useState } from 'react';
import {
  currentStreak,
  dayKey,
  formatDuration,
  lastDays,
  longestStreak,
  songProgress,
  type DayTotal,
} from '../core/progress/stats';
import { useProgress } from '../state/progress';
import { Modal, sectionTitle } from './controls';
import { useDialog } from './useDialog';

const MODE_LABEL = { wait: 'Espera', rhythm: 'Ritmo' } as const;
const HANDS_LABEL = { left: 'izquierda', right: 'derecha', both: 'dos manos' } as const;

const weekday = (date: string) => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, 12);
};
const shortDate = (date: string) =>
  weekday(date).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' });

function Tile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-line bg-panel-2 p-3">
      <span className="text-[12px] text-muted">{label}</span>
      <span className="font-display text-[26px] leading-none font-bold tabular-nums">{value}</span>
      {detail && <span className="text-[12px] text-muted">{detail}</span>}
    </div>
  );
}

/** Columnas de minutos por día. Una sola serie: sin leyenda, el título dice qué es. */
function MinutesChart({ days }: { days: DayTotal[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = 190;
  const pad = { l: 34, r: 8, t: 12, b: 26 };
  const minutes = days.map((d) => d.seconds / 60);
  const rawMax = Math.max(...minutes, 1);
  const step = rawMax <= 5 ? 1 : rawMax <= 15 ? 5 : rawMax <= 40 ? 10 : rawMax <= 90 ? 20 : 30;
  const max = Math.ceil(rawMax / step) * step;
  const ticks = Array.from({ length: max / step + 1 }, (_, i) => i * step);
  const band = (W - pad.l - pad.r) / days.length;
  const barW = Math.min(24, band - 2);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const today = dayKey(new Date());

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full"
        role="img"
        aria-label="Minutos practicados cada día de las dos últimas semanas"
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth={1} />
            <text
              x={pad.l - 6}
              y={y(t)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted font-mono text-[10px]"
            >
              {t}
            </text>
          </g>
        ))}
        {days.map((d, i) => {
          const cx = pad.l + band * i + band / 2;
          const v = minutes[i]!;
          const top = y(v);
          const h = y(0) - top;
          const r = Math.min(4, h);
          const x = cx - barW / 2;
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)}>
              {/* Zona de puntero más grande que la barra. */}
              <rect
                x={pad.l + band * i}
                y={pad.t}
                width={band}
                height={H - pad.t - pad.b}
                fill="transparent"
              />
              {v > 0 && (
                <path
                  d={`M${x},${y(0)} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${y(0)} Z`}
                  fill="var(--color-rh)"
                  opacity={hover == null || hover === i ? 1 : 0.55}
                />
              )}
              {(i % 2 === days.length % 2 || d.date === today) && (
                <text
                  x={cx}
                  y={H - 8}
                  textAnchor="middle"
                  className={`font-mono text-[10px] ${d.date === today ? 'fill-fg' : 'fill-muted'}`}
                >
                  {d.date === today ? 'hoy' : weekday(d.date).getDate()}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-lg border border-line bg-panel-3 px-2.5 py-1.5 text-[12px] whitespace-nowrap shadow-lg"
          style={{ left: `${((pad.l + band * hover + band / 2) / W) * 100}%` }}
        >
          <div className="text-muted">{shortDate(days[hover]!.date)}</div>
          <div className="font-mono tabular-nums">
            {formatDuration(days[hover]!.seconds)} · {days[hover]!.hits} aciertos
          </div>
        </div>
      )}
    </div>
  );
}

export function ProgressDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeRef = useDialog(open, onClose);
  const { days, sessions } = useProgress();
  const [table, setTable] = useState(false);
  const data = useMemo(() => {
    const recent = lastDays(days, 14);
    const week = lastDays(days, 7);
    const todayKey = dayKey(new Date());
    const today = days.find((d) => d.date === todayKey);
    return {
      recent,
      streak: currentStreak(days),
      longest: longestStreak(days),
      weekSeconds: week.reduce((s, d) => s + d.seconds, 0),
      totalSeconds: days.reduce((s, d) => s + d.seconds, 0),
      today,
      songs: songProgress(sessions),
      last: [...sessions].sort((a, b) => b.date - a.date).slice(0, 8),
    };
  }, [days, sessions]);
  if (!open) return null;

  const empty = days.length === 0 && sessions.length === 0;

  return (
    <Modal titleId="progress-title" title="Tu progreso" onClose={onClose} closeRef={closeRef} width={720}>
      {empty ? (
        <div className="flex flex-col items-start gap-2 rounded-xl border border-line bg-panel-2 p-5">
          <b>Aún no hay nada aquí</b>
          <p className="text-[13px] text-muted">
            Toca una canción y aquí verás cuánto practicas cada día, tu racha y cómo mejoras en cada canción.
            Las canciones terminadas en modo Espera o Ritmo guardan su puntuación.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Tile
              label="Racha"
              value={`${data.streak} ${data.streak === 1 ? 'día' : 'días'}`}
              detail={`La más larga: ${data.longest}`}
            />
            <Tile
              label="Hoy"
              value={formatDuration(data.today?.seconds ?? 0)}
              detail={`${data.today?.hits ?? 0} notas acertadas`}
            />
            <Tile label="Últimos 7 días" value={formatDuration(data.weekSeconds)} />
            <Tile
              label="Canciones terminadas"
              value={String(sessions.length)}
              detail={`En total: ${formatDuration(data.totalSeconds)}`}
            />
          </div>

          <section className="flex flex-col gap-2 rounded-xl border border-line bg-panel-2 p-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-semibold">Minutos practicados · últimas dos semanas</h3>
              <button
                type="button"
                onClick={() => setTable(!table)}
                className="text-[12.5px] text-muted underline-offset-2 hover:text-fg hover:underline"
              >
                {table ? 'Ver gráfica' : 'Ver tabla'}
              </button>
            </div>
            {table ? (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="py-1 font-normal">Día</th>
                    <th className="py-1 text-right font-normal">Tiempo</th>
                    <th className="py-1 text-right font-normal">Aciertos</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.recent].reverse().map((d) => (
                    <tr key={d.date} className="border-t border-line">
                      <td className="py-1">{shortDate(d.date)}</td>
                      <td className="py-1 text-right font-mono tabular-nums">{formatDuration(d.seconds)}</td>
                      <td className="py-1 text-right font-mono tabular-nums">{d.hits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <MinutesChart days={data.recent} />
            )}
            <p className="text-[12px] text-muted">
              Un día cuenta para la racha si practicas al menos un minuto.
            </p>
          </section>

          {data.songs.length > 0 && (
            <section className="flex flex-col gap-2">
              <div className={sectionTitle}>Por canción</div>
              <ul className="flex flex-col gap-1.5">
                {data.songs.map((p) => (
                  <li
                    key={p.songId}
                    className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-4 rounded-lg border border-line bg-panel-2 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{p.title}</div>
                      <div className="text-[12px] text-muted">
                        {p.plays} {p.plays === 1 ? 'vez' : 'veces'} · última el{' '}
                        {new Date(p.lastDate).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono tabular-nums">{p.best} %</div>
                      <div className="text-[11.5px] text-muted">mejor</div>
                    </div>
                    <div className="min-w-16 text-right">
                      <div className="font-mono tabular-nums">{p.last} %</div>
                      <div className="text-[11.5px] text-muted">
                        {p.trend == null
                          ? 'última'
                          : p.trend > 0
                            ? `↑ ${p.trend} puntos`
                            : p.trend < 0
                              ? `↓ ${-p.trend} puntos`
                              : 'igual'}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.last.length > 0 && (
            <section className="flex flex-col gap-2">
              <div className={sectionTitle}>Últimas veces</div>
              <table className="w-full table-fixed text-[13px]">
                <colgroup>
                  <col className="w-[8.5rem]" />
                  <col />
                  <col className="w-[11.5rem]" />
                  <col className="w-[6.5rem]" />
                </colgroup>
                <thead className="sr-only">
                  <tr>
                    <th>Fecha</th>
                    <th>Canción</th>
                    <th>Modo</th>
                    <th>Precisión</th>
                  </tr>
                </thead>
                <tbody>
                  {data.last.map((s) => (
                    <tr key={s.id ?? s.date} className="border-t border-line first:border-t-0">
                      <td className="py-1.5 pr-3 whitespace-nowrap text-muted">
                        {new Date(s.date).toLocaleString('es', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="truncate py-1.5 pr-3" title={s.songTitle}>
                        {s.songTitle}
                      </td>
                      <td className="truncate py-1.5 pr-3 text-muted">
                        {MODE_LABEL[s.mode]}, {HANDS_LABEL[s.hands]}
                        {s.speed !== 1 ? ` · ${Math.round(s.speed * 100)} %` : ''}
                      </td>
                      <td className="py-1.5 text-right font-mono whitespace-nowrap tabular-nums">
                        <span className="mr-1.5 text-rh" aria-label={`${s.stars} de 3 estrellas`}>
                          {'★'.repeat(s.stars)}
                          <span className="text-line">{'★'.repeat(3 - s.stars)}</span>
                        </span>
                        {s.accuracy} %
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </Modal>
  );
}
