import { useEffect, useMemo, useRef } from 'react';
import { activeNotes, type Hand, type Song } from '../core/song/types';
import { soundingAt } from '../core/transport/scheduler';
import { engine } from '../playback/usePlayback';
import { FallingNotesScene, type SceneInput } from '../render/FallingNotesScene';
import { useViewSettings } from '../state/viewSettings';

declare global {
  interface Window {
    /** Solo en desarrollo: acceso a la escena para medir fluidez desde las herramientas del navegador. */
    __tecleaScene?: FallingNotesScene;
  }
}

/** Escenario de notas que caen. React solo monta el lienzo; PixiJS dibuja cada fotograma. */
export function FallingNotesView({ song }: { song: Song }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const notes = useMemo(() => activeNotes(song), [song]);
  const inputRef = useRef({ notes, measures: song.measures });
  inputRef.current = { notes, measures: song.measures };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const getInput = (): SceneInput => {
      const { notes, measures } = inputRef.current;
      const time = engine.time;
      const litKeys = new Map<number, Hand>();
      for (const n of soundingAt(notes, time)) litKeys.set(n.pitch, n.hand);
      const view = useViewSettings.getState();
      return {
        notes,
        measures,
        time,
        loop: engine.getSnapshot().loop,
        litKeys,
        noteLabels: view.noteLabels,
        showFingers: view.showFingers,
        lookahead: view.lookahead,
      };
    };
    const scene = new FallingNotesScene(getInput);
    void scene.mount(host);
    if (import.meta.env.DEV) window.__tecleaScene = scene;
    return () => {
      scene.destroy();
      if (window.__tecleaScene === scene) delete window.__tecleaScene;
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className="relative h-full min-h-0 w-full overflow-hidden bg-[linear-gradient(180deg,#070a12_0%,#0d1322_80%)]"
      role="img"
      aria-label={`Notas de ${song.title} cayendo hacia el teclado de 61 teclas`}
    />
  );
}
