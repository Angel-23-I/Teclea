import { useRef, useState, type DragEvent } from 'react';
import { ACCEPTED_EXTENSIONS } from '../core/song/importSong';
import type { Song } from '../core/song/types';
import { isBuiltin, useLibrary } from '../state/library';
import { usePracticeSettings } from '../state/practice';
import { formatTime, shiftedNotesMessage } from './format';
import { useDialog } from './useDialog';

const SOURCE_LABEL: Record<Song['source'], string> = {
  builtin: 'Incluida',
  midi: 'MIDI',
  musicxml: 'MusicXML',
};

function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
      <path
        d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LibraryDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { songs, currentId, select, importFile, removeSong, storage } = useLibrary();
  const best = usePracticeSettings((p) => p.best);
  const bestFor = (id: string) => {
    let top: number | null = null;
    for (const [key, value] of Object.entries(best))
      if (key.startsWith(id + '|')) top = Math.max(top ?? 0, value);
    return top;
  };
  const [dragging, setDragging] = useState(false);
  const [query, setQuery] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const closeRef = useDialog(open, onClose);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const filtered = q
    ? songs.filter((s) => `${s.title} ${s.composer ?? ''}`.toLowerCase().includes(q))
    : songs;
  const groups: [string, Song[]][] = [
    ['Incluidas', filtered.filter((s) => isBuiltin(s.id))],
    ['Importadas', filtered.filter((s) => !isBuiltin(s.id))],
  ];

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const song = await importFile(file);
    if (song && !song.warnings.length && !song.shiftedNotes) onClose();
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void handleFiles(e.dataTransfer.files);
  };

  return (
    <>
      <div className="fixed inset-0 z-20 bg-[rgba(4,6,12,0.6)]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lib-title"
        className="fixed inset-y-0 left-0 z-21 flex w-[min(440px,100%)] flex-col border-r border-line bg-panel"
      >
        <header className="flex items-center gap-3 border-b border-line px-[18px] py-4">
          <h2 id="lib-title" className="font-display text-xl font-bold">
            Biblioteca
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar biblioteca"
            className="ml-auto size-[34px] rounded-lg border border-line bg-panel-2 text-lg leading-none"
          >
            ×
          </button>
        </header>
        <div className="flex flex-col gap-3 overflow-auto px-[18px] py-3.5">
          {songs.length > 6 && (
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por título o autor"
              aria-label="Buscar canción"
              className="rounded-[10px] border border-line bg-panel-2 px-3 py-2 text-[13px] placeholder:text-muted"
            />
          )}

          {groups.map(([label, list]) =>
            list.length ? (
              <section key={label} className="flex flex-col gap-2" aria-label={label}>
                <h3 className="text-[11px] font-semibold tracking-[0.09em] text-muted uppercase">{label}</h3>
                {list.map((song) => {
                  const removable = !isBuiltin(song.id);
                  const top = bestFor(song.id);
                  return (
                    <div key={song.id}>
                      <div className="relative">
                        <button
                          type="button"
                          aria-current={song.id === currentId}
                          onClick={() => {
                            select(song.id);
                            onClose();
                          }}
                          className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-xl border bg-panel-2 py-3 pl-3.5 text-left hover:border-[#3a4566] ${
                            removable ? 'pr-11' : 'pr-3.5'
                          } ${song.id === currentId ? 'border-rh' : 'border-line'}`}
                        >
                          <span className="truncate font-semibold">{song.title}</span>
                          <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">
                            {SOURCE_LABEL[song.source]}
                          </span>
                          <span className="truncate text-[12.5px] text-muted">
                            {song.composer ?? 'Autor desconocido'}
                          </span>
                          <span className="text-right font-mono text-xs text-muted">
                            {top != null ? `Mejor: ${top} % · ` : ''}
                            {formatTime(song.duration)}
                          </span>
                        </button>
                        {removable && (
                          <button
                            type="button"
                            onClick={() => setConfirmId(song.id)}
                            aria-label={`Quitar «${song.title}» de la biblioteca`}
                            className="absolute top-1/2 right-2.5 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted hover:bg-panel-3 hover:text-fg"
                          >
                            <TrashIcon />
                          </button>
                        )}
                      </div>
                      {confirmId === song.id && (
                        <div
                          role="alert"
                          className="mt-1.5 flex flex-wrap items-center gap-2 rounded-lg border border-bad/50 bg-bad/10 p-2.5 text-[12.5px]"
                        >
                          <span className="min-w-0 flex-1">
                            ¿Quitar esta canción? Tu progreso con ella se conserva.
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmId(null);
                              void removeSong(song.id);
                            }}
                            className="rounded-[8px] bg-bad px-2.5 py-1 font-semibold text-[#1d0a0c]"
                          >
                            Quitar
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmId(null)}
                            className="rounded-[8px] border border-line bg-panel-2 px-2.5 py-1"
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            ) : null,
          )}
          {q && !filtered.length && (
            <p className="text-[12.5px] text-muted">Ninguna canción coincide con «{query}».</p>
          )}

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`mt-1 flex flex-col items-start gap-2 rounded-xl border-[1.5px] border-dashed p-4 ${
              dragging ? 'border-rh bg-rh/5' : 'border-[#3a4566]'
            }`}
          >
            <b>Importar canción</b>
            <p className="text-[12.5px] text-muted">
              Arrastra aquí un archivo MIDI (.mid) o MusicXML (.musicxml, .mxl) exportado desde MuseScore. Las
              notas que no caben en tus 61 teclas se mueven de octava. Se guarda en este equipo.
            </p>
            {storage === 'unavailable' && (
              <p className="text-[12.5px] text-bad">
                No se puede guardar en este equipo: lo que importes se perderá al cerrar Teclea.
              </p>
            )}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-[9px] bg-rh px-3 py-[7px] text-[13px] font-semibold text-[#1b1206] hover:bg-[#f6b476]"
            >
              Elegir archivo
            </button>
            <input
              ref={inputRef}
              type="file"
              hidden
              accept={ACCEPTED_EXTENSIONS.join(',')}
              onChange={(e) => {
                void handleFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <ImportMessage />
          </div>
        </div>
      </div>
    </>
  );
}

function ImportMessage() {
  const status = useLibrary((s) => s.importStatus);
  if (status.kind === 'idle') return null;
  if (status.kind === 'working')
    return <p className="text-[12.5px] text-muted">Leyendo {status.fileName}…</p>;
  if (status.kind === 'error')
    return (
      <p role="alert" className="text-[12.5px] text-bad">
        {status.fileName}: {status.message}
      </p>
    );
  const { song } = status;
  return (
    <div className="flex flex-col gap-1 text-[12.5px]" role="status">
      <p className="text-ok">
        Importada «{song.title}»: {song.notes.length} notas en {song.tracks.length} pistas.
      </p>
      {song.shiftedNotes > 0 && <p className="text-muted">{shiftedNotesMessage(song.shiftedNotes)}</p>}
      {song.warnings.map((w) => (
        <p key={w} className="text-muted">
          {w}
        </p>
      ))}
    </div>
  );
}
