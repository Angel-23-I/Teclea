import { KeyboardPreview } from './ui/KeyboardPreview';

const ROADMAP = [
  {
    phase: 'Fase 0',
    title: 'Base del proyecto',
    detail: 'Vite, React, TypeScript, Tailwind, Vitest y Tauri.',
    done: true,
  },
  {
    phase: 'Fase 1',
    title: 'Canciones',
    detail: 'Importar MIDI y MusicXML, reproducir con sonido.',
    done: false,
  },
  {
    phase: 'Fase 2',
    title: 'Notas que caen',
    detail: 'Escenario PixiJS sobre el teclado de 61 teclas.',
    done: false,
  },
  {
    phase: 'Fase 3',
    title: 'Entradas',
    detail: 'Teclado del PC y MIDI USB para teclados futuros.',
    done: false,
  },
  {
    phase: 'Fase 4',
    title: 'Escuchar tu PSR-E283',
    detail: 'Audio por cable o micrófono, con calibración.',
    done: false,
  },
  {
    phase: 'Fase 5',
    title: 'Práctica',
    detail: 'Modos Espera y Ritmo, manos separadas, puntuación.',
    done: false,
  },
];

// Do4–Sol4 (posición de cinco dedos de la mano derecha) y Do3 de la izquierda, como muestra.
const SAMPLE_HIGHLIGHT = new Map<number, string>([
  [48, 'var(--color-lh)'],
  [60, 'var(--color-rh)'],
  [64, 'var(--color-rh)'],
  [67, 'var(--color-rh)'],
]);

export default function App() {
  return (
    <div className="grid h-full grid-rows-[auto_1fr]">
      <header className="flex flex-wrap items-center gap-4 border-b border-line bg-panel px-4 py-2.5">
        <div className="flex items-center gap-2.5 font-display text-xl font-bold tracking-tight">
          <img src="/teclea.svg" alt="" className="size-7" />
          Teclea
        </div>
        <button
          type="button"
          disabled
          className="rounded-[10px] border border-line bg-panel-2 px-3 py-1.5 text-muted"
          title="Llega en la fase 1"
        >
          Elige una canción
        </button>
        <div className="ml-auto flex items-center gap-2 rounded-full border border-line bg-panel-2 py-1.5 pr-3 pl-2.5 text-[12.5px]">
          <span className="size-2 rounded-full bg-muted" />
          <span className="text-muted">Entrada:</span> sin configurar
        </div>
      </header>

      <main className="grid min-h-0 grid-cols-1 gap-4 overflow-auto p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="flex min-h-[420px] flex-col justify-end overflow-hidden rounded-[14px] border border-line bg-stage">
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <h1 className="font-display text-3xl font-bold tracking-tight text-balance">
              Aquí caerán las notas de tus canciones
            </h1>
            <p className="max-w-[56ch] text-muted">
              La base de la app está lista. El siguiente paso es importar archivos MIDI y MusicXML y verlos
              bajar hacia el teclado de tu Yamaha PSR-E283.
            </p>
          </div>
          <div className="border-t-2 border-rh">
            <KeyboardPreview highlight={SAMPLE_HIGHLIGHT} />
          </div>
        </section>

        <aside className="flex flex-col gap-3" aria-label="Plan de trabajo">
          <h2 className="text-[11px] font-semibold tracking-[0.09em] text-muted uppercase">
            Plan de trabajo
          </h2>
          <ol className="flex flex-col gap-2">
            {ROADMAP.map((step) => (
              <li
                key={step.phase}
                className={`rounded-xl border bg-panel p-3 ${step.done ? 'border-ok/50' : 'border-line'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-muted">{step.phase}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] ${step.done ? 'bg-ok/15 text-ok' : 'bg-panel-3 text-muted'}`}
                  >
                    {step.done ? 'Hecho' : 'Pendiente'}
                  </span>
                </div>
                <div className="mt-1 font-semibold">{step.title}</div>
                <div className="text-[12.5px] text-muted">{step.detail}</div>
              </li>
            ))}
          </ol>
        </aside>
      </main>
    </div>
  );
}
