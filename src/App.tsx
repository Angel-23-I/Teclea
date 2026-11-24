import { useEffect, useRef, useState } from 'react';
import { initialBpm } from './core/song/types';
import { engine } from './playback/usePlayback';
import { useCurrentSong } from './state/library';
import { useInputSettings } from './state/inputSettings';
import { InputDialog } from './ui/InputDialog';
import { useInputSummary } from './ui/useInputSummary';
import { LibraryDrawer } from './ui/LibraryDrawer';
import { FallingNotesView } from './ui/FallingNotesView';
import { TrackPanel } from './ui/TrackPanel';
import { ViewPanel } from './ui/ViewPanel';
import { LoopControl, SpeedControl, TransportBar } from './ui/TransportBar';
import { formatTime, shiftedNotesMessage } from './ui/format';

export default function App() {
  const song = useCurrentSong();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [inputsOpen, setInputsOpen] = useState(false);
  const inputSummary = useInputSummary();
  const loadedId = useRef<string | null>(null);

  // Carga la canción en el motor; si es la misma (p. ej. cambió una pista) conserva la posición.
  useEffect(() => {
    if (loadedId.current === song.id) engine.update(song);
    else engine.load(song);
    loadedId.current = song.id;
  }, [song]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (libraryOpen || inputsOpen || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.code === 'Space' && tag !== 'BUTTON' && tag !== 'INPUT') {
        e.preventDefault();
        engine.togglePlay();
      } else if (e.code === 'Home') {
        engine.restart();
      } else if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
        const inputs = useInputSettings.getState();
        inputs.setPcOctave(inputs.pcOctave + (e.code === 'BracketRight' ? 1 : -1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [libraryOpen, inputsOpen]);

  const facts = [
    `${initialBpm(song)} ppm`,
    song.timeSignature.join('/'),
    `${song.measures.length} compases`,
    `${song.notes.length} notas`,
    formatTime(song.duration),
  ];

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
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
        <button
          type="button"
          onClick={() => setInputsOpen(true)}
          aria-haspopup="dialog"
          className="ml-auto flex min-w-0 items-center gap-2 rounded-full border border-line bg-panel-2 py-1.5 pr-3 pl-2.5 text-[12.5px] hover:border-[#3a4566]"
        >
          <span
            className={`size-2 shrink-0 rounded-full ${inputSummary.active ? 'bg-ok shadow-[0_0_0_3px_rgba(98,216,146,0.18)]' : 'bg-muted'}`}
          />
          <span className="text-muted">Entrada:</span>
          <span className="truncate">{inputSummary.label}</span>
        </button>
      </header>

      <main className="grid min-h-0 grid-cols-1 gap-3.5 overflow-auto p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="grid min-h-[440px] grid-rows-[minmax(0,1fr)_auto] overflow-hidden rounded-[14px] border border-line bg-stage">
          <FallingNotesView song={song} />
          <TransportBar song={song} />
        </section>

        <aside
          className="flex min-h-0 flex-col gap-5 lg:overflow-auto lg:pr-1"
          aria-label="Opciones de la canción"
        >
          <div className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-3.5">
            <h1 className="font-display text-xl leading-tight font-bold tracking-tight text-balance">
              {song.title}
            </h1>
            <p className="text-[12.5px] text-muted">{song.composer ?? 'Autor desconocido'}</p>
            <ul className="flex flex-wrap gap-1.5">
              {facts.map((f) => (
                <li
                  key={f}
                  className="rounded-full border border-line px-2.5 py-0.5 font-mono text-[11.5px] text-muted tabular-nums"
                >
                  {f}
                </li>
              ))}
            </ul>
            {(song.shiftedNotes > 0 || song.warnings.length > 0) && (
              <div className="text-[12.5px] text-muted">
                {song.shiftedNotes > 0 && <p>{shiftedNotesMessage(song.shiftedNotes)}</p>}
                {song.warnings.map((w) => (
                  <p key={w}>{w}</p>
                ))}
              </div>
            )}
            <p className="text-[12.5px] text-muted">
              <kbd className="rounded border border-[#34405f] bg-panel-3 px-1.5 font-mono">Espacio</kbd>{' '}
              reproduce o pausa ·{' '}
              <kbd className="rounded border border-[#34405f] bg-panel-3 px-1.5 font-mono">Inicio</kbd> vuelve
              al principio
            </p>
          </div>
          <TrackPanel song={song} />
          <SpeedControl />
          <ViewPanel />
          <LoopControl song={song} />
        </aside>
      </main>

      <LibraryDrawer open={libraryOpen} onClose={() => setLibraryOpen(false)} />
      <InputDialog open={inputsOpen} onClose={() => setInputsOpen(false)} />
    </div>
  );
}
