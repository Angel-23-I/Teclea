import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { PianoSynth } from '../audio/pianoSynth';
import { PlaybackEngine, type PlaybackSnapshot } from './engine';

/** Sonido de piano único: lo usan la canción y las notas que toca la persona. */
export const piano = new PianoSynth();

/** Motor único de la app. */
export const engine = new PlaybackEngine(piano);

export function usePlaybackState(): PlaybackSnapshot {
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot);
}

/**
 * Llama a `read` en cada fotograma y devuelve su resultado, pero solo provoca un render
 * cuando `key` cambia (así la UI no se redibuja 60 veces por segundo sin necesidad).
 */
export function useFrameValue<T>(read: () => T, key: (v: T) => string): T {
  const [value, setValue] = useState(read);
  const readRef = useRef(read);
  const keyRef = useRef(key);
  readRef.current = read;
  keyRef.current = key;
  useEffect(() => {
    // Valor imposible: obliga a refrescar en el primer fotograma (el estado inicial pudo leerse antes de cargar).
    let last: string | null = null;
    let raf = 0;
    const loop = () => {
      const v = readRef.current();
      const k = keyRef.current(v);
      if (k !== last) {
        last = k;
        setValue(v);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return value;
}
