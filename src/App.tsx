import { useEffect, useRef, useState } from 'react';
import { initialBpm } from './core/song/types';
import { engine } from './playback/usePlayback';
import { useCurrentSong } from './state/library';
import { LibraryDrawer } from './ui/LibraryDrawer';
import { LiveKeyboard } from './ui/LiveKeyboard';
import { TrackPanel } from './ui/TrackPanel';
import { LoopControl, SpeedControl, TransportBar } from './ui/TransportBar';
import { formatTime, shiftedNotesMessage } from './ui/format';

export default function App() {
  const song = useCurrentSong();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const loadedId = useRef<string | null>(null);

  // Carga la canción en el motor; si es la misma (p. ej. cambió una pista) conserva la posición.
  useEffect(() => {
    if (loadedId.current === song.id) engine.update(song);
    else engine.load(song);
    loadedId.current = song.id;
  }, [song]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (libraryOpen || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.code === 'Space' && tag !== 'BUTTON' && tag !== 'INPUT') {
        e.preventDefault();
        engine.togglePlay();
      } else if (e.code === 'Home') {
        engine.restart();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [libraryOpen]);

  const facts = [
    `${initialBpm(song)} ppm`,
    song.timeSignature.join('/'),
    `${song.measures.length} compases`,
    `${song.notes.length} notas`,
    formatTime(song.duration),
  ];

  return (
    <div className="grid h-full grid-rows-[auto_1fr]">
      <header className="flex flex-wrap items-center gap-4 border-b border-line bg-panel px-4 py-2.5">
        <div className="flex items-center gap-2.5 font-display text-xl font-bold tracking-tight">
          <img src="/teclea.svg" alt="" className="size-7" />
          Teclea
        </div>
        <button
          type="button"
          onClick={() => setLibraryOpen(true)}
          aria-haspopup="dialog"
          className="flex min-w-0 items-center gap-2.5 rounded-[10px] border border-line bg-panel-2 px-3 py-1.5 hover:border-[#3a4566]"
        >
          <span className="truncate font-semibold">{song.title}</span>
          <span className="hidden text-[12.5px] whitespace-nowrap text-muted sm:inline">
            {song.composer ?? 'Importada'}
          </span>
          <svg viewBox="0 0 16 16" className="size-3.5 shrink-0 text-muted" aria-hidden="true">
            <path
              d="M4 6l4 4 4-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <div className="ml-auto flex items-center gap-2 rounded-full border border-line bg-panel-2 py-1.5 pr-3 pl-2.5 text-[12.5px]">
          <span className="size-2 rounded-full bg-muted" />
          <span className="text-muted">Entrada:</span> sin configurar
        </div>
      </header>

      <main className="grid min-h-0 grid-cols-1 gap-3.5 overflow-auto p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="grid min-h-[440px] grid-rows-[minmax(0,1fr)_auto_auto] overflow-hidden rounded-[14px] border border-line bg-stage">
          <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
            <h1 className="font-display text-3xl font-bold tracking-tight text-balance">{song.title}</h1>
            <p className="text-muted">{song.composer ?? 'Autor desconocido'}</p>
            <ul className="flex flex-wrap justify-center gap-2">
              {facts.map((f) => (
                <li
                  key={f}
                  className="rounded-full border border-line bg-panel px-3 py-1 font-mono text-xs text-muted tabular-nums"
                >
                  {f}
                </li>
              ))}
            </ul>
            {(song.shiftedNotes > 0 || song.warnings.length > 0) && (
              <div className="max-w-[56ch] text-[12.5px] text-muted">
                {song.shiftedNotes > 0 && <p>{shiftedNotesMessage(song.shiftedNotes)}</p>}
                {song.warnings.map((w) => (
                  <p key={w}>{w}</p>
                ))}
              </div>
            )}
            <p className="mt-2 max-w-[52ch] text-[12.5px] text-muted">
              Pulsa <kbd className="rounded border border-[#34405f] bg-panel-3 px-1.5 font-mono">Espacio</kbd>{' '}
              para escucharla. En la siguiente fase, las notas caerán aquí hacia el teclado.
            </p>
          </div>
          <div className="border-t-2 border-rh">
            <LiveKeyboard song={song} />
          </div>
          <TransportBar song={song} />
        </section>

        <aside className="flex flex-col gap-5" aria-label="Opciones de la canción">
          <TrackPanel song={song} />
          <SpeedControl />
          <LoopControl song={song} />
        </aside>
      </main>

      <LibraryDrawer open={libraryOpen} onClose={() => setLibraryOpen(false)} />
    </div>
  );
}
