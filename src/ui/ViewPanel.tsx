import { MAX_LOOKAHEAD, MIN_LOOKAHEAD, useViewSettings, type NoteLabels } from '../state/viewSettings';

const LABELS: { value: NoteLabels; label: string }[] = [
  { value: 'latin', label: 'Do Re Mi' },
  { value: 'english', label: 'C D E' },
  { value: 'none', label: 'Ocultar' },
];

const sectionTitle = 'text-[11px] font-semibold tracking-[0.09em] text-muted uppercase';

export function ViewPanel() {
  const { noteLabels, showFingers, lookahead, setNoteLabels, setShowFingers, setLookahead } =
    useViewSettings();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className={sectionTitle} id="labels-title">
          Nombres de nota
        </div>
        <div
          className="flex gap-[3px] rounded-[10px] border border-line bg-panel-2 p-[3px]"
          role="radiogroup"
          aria-labelledby="labels-title"
        >
          {LABELS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={noteLabels === o.value}
              onClick={() => setNoteLabels(o.value)}
              className={`flex-1 rounded-[7px] px-1.5 py-1.5 text-[13px] font-medium ${
                noteLabels === o.value
                  ? 'bg-panel-3 text-fg shadow-[inset_0_0_0_1px_#3a4768]'
                  : 'text-muted hover:text-fg'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span id="fingers-label">Números de dedo</span>
        <button
          type="button"
          role="switch"
          aria-checked={showFingers}
          aria-labelledby="fingers-label"
          onClick={() => setShowFingers(!showFingers)}
          className={`relative h-[22px] w-[38px] shrink-0 rounded-full border p-0 transition-colors ${
            showFingers ? 'border-rh bg-rh/30' : 'border-line bg-panel-3'
          }`}
        >
          <span
            className={`absolute top-[2px] left-[2px] size-4 rounded-full transition-transform ${
              showFingers ? 'translate-x-4 bg-rh' : 'bg-muted'
            }`}
          />
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="lookahead" className={sectionTitle}>
          Tiempo visible
        </label>
        <div className="flex items-center gap-3">
          <input
            id="lookahead"
            type="range"
            className="flex-1 accent-rh"
            min={MIN_LOOKAHEAD}
            max={MAX_LOOKAHEAD}
            step={0.5}
            value={lookahead}
            onChange={(e) => setLookahead(Number(e.target.value))}
          />
          <output htmlFor="lookahead" className="min-w-11 text-right font-mono text-[13px] tabular-nums">
            {lookahead.toFixed(1).replace('.', ',')} s
          </output>
        </div>
        <p className="text-[12.5px] text-muted">
          Menos segundos: las notas bajan más rápido y se separan más. Más: ves lo que viene con antelación.
        </p>
      </div>
    </div>
  );
}
