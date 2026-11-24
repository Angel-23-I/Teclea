import type { Song, TrackRole } from '../core/song/types';
import { useLibrary } from '../state/library';

const ROLES: { value: TrackRole; label: string; swatch?: string }[] = [
  { value: 'left', label: 'Izquierda', swatch: 'bg-lh' },
  { value: 'right', label: 'Derecha', swatch: 'bg-rh' },
  { value: 'off', label: 'Quitar' },
];

export function TrackPanel({ song }: { song: Song }) {
  const setTrackRole = useLibrary((s) => s.setTrackRole);
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] font-semibold tracking-[0.09em] text-muted uppercase">Pistas y manos</div>
      <ul className="flex flex-col gap-2">
        {song.tracks.map((track, i) => (
          <li key={i} className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate font-semibold" title={track.name}>
                {track.name}
              </span>
              <span className="shrink-0 font-mono text-xs text-muted">{track.noteCount} notas</span>
            </div>
            <div
              className="flex gap-[3px] rounded-[10px] border border-line bg-panel-2 p-[3px]"
              role="radiogroup"
              aria-label={`Mano para ${track.name}`}
            >
              {ROLES.map((r) => {
                const active = track.role === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setTrackRole(i, r.value)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-[7px] px-1.5 py-1.5 text-[13px] font-medium ${
                      active
                        ? 'bg-panel-3 text-fg shadow-[inset_0_0_0_1px_#3a4768]'
                        : 'text-muted hover:text-fg'
                    }`}
                  >
                    {r.swatch && <span className={`size-2 rounded-sm ${r.swatch}`} />}
                    {r.label}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
      <p className="text-[12.5px] text-muted">Las pistas quitadas no suenan ni se practicarán.</p>
    </div>
  );
}
