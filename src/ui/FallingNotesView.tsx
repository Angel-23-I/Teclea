import { useEffect, useMemo, useRef, type PointerEvent } from 'react';
import { activeNotes, type Hand, type Song } from '../core/song/types';
import { soundingAt } from '../core/transport/scheduler';
import { pcKeyLabels } from '../input/pcKeyboard';
import { inputHub, pointerInput } from '../input/setup';
import { engine, piano } from '../playback/usePlayback';
import { practice } from '../practice/controller';
import { FallingNotesScene, type SceneInput } from '../render/FallingNotesScene';
import { keyAt, keyboardLayout, stageMetrics } from '../render/layout';
import { useInputSettings } from '../state/inputSettings';
import { usePracticeSettings } from '../state/practice';
import { useViewSettings } from '../state/viewSettings';

declare global {
  interface Window {
    /** Solo en desarrollo: acceso a la escena para medir fluidez desde las herramientas del navegador. */
    __tecleaScene?: FallingNotesScene;
  }
}

const labelCache = new Map<number, ReadonlyMap<number, string>>();
const labelsFor = (octave: number) => {
  let l = labelCache.get(octave);
  if (!l) labelCache.set(octave, (l = pcKeyLabels(octave)));
  return l;
};

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
      const practicing = usePracticeSettings.getState().mode !== 'listen';
      // Se iluminan las notas que toca la app; las tuyas no (eso sería darte la respuesta).
      const litKeys = new Map<number, Hand>();
      for (const n of soundingAt(notes, time)) {
        if (!practicing || practice.statusOf(n) === 'auto') litKeys.set(n.pitch, n.hand);
      }
      const view = useViewSettings.getState();
      const inputs = useInputSettings.getState();
      return {
        notes,
        measures,
        time,
        loop: engine.getSnapshot().loop,
        litKeys,
        pressedKeys: inputHub.pressed(),
        pcKeyLabels: inputs.pcKeyboard && inputs.showPcKeys ? labelsFor(inputs.pcOctave) : null,
        noteLabels: view.noteLabels,
        showFingers: view.showFingers,
        lookahead: view.lookahead,
        practicing,
        noteStatus: (n) => practice.statusOf(n),
        expectedKeys: engine.playing ? practice.expectedKeys(time) : new Map(),
        keyJudgments: practice.keyJudgments,
        effects: practice.effects,
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

  // Tocar con el ratón o el dedo: se calcula la tecla con la misma geometría que usa la escena.
  const pitchAt = (e: PointerEvent<HTMLDivElement>): number | null => {
    const r = e.currentTarget.getBoundingClientRect();
    const m = stageMetrics(r.width, r.height, useViewSettings.getState().lookahead);
    return keyAt(e.clientX - r.left, e.clientY - r.top, m, keyboardLayout(r.width));
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const pitch = pitchAt(e);
    if (pitch == null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    void piano.unlock().catch(() => undefined);
    pointerInput.move(e.pointerId, pitch);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const pitch = pitchAt(e);
    e.currentTarget.style.cursor = pitch == null ? 'default' : 'pointer';
    if (e.currentTarget.hasPointerCapture(e.pointerId)) pointerInput.move(e.pointerId, pitch);
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => pointerInput.release(e.pointerId);

  return (
    <div
      ref={hostRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="relative h-full min-h-0 w-full touch-none overflow-hidden bg-[linear-gradient(180deg,#070a12_0%,#0d1322_80%)] select-none"
      role="img"
      aria-label={`Notas de ${song.title} cayendo hacia el teclado de 61 teclas`}
    />
  );
}
