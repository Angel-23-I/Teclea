import { useMemo } from 'react';
import { activeNotes, type Song } from '../core/song/types';
import { soundingAt } from '../core/transport/scheduler';
import { engine, useFrameValue } from '../playback/usePlayback';
import { KeyboardPreview } from './KeyboardPreview';

const HAND_COLOR = { right: 'var(--color-rh)', left: 'var(--color-lh)' } as const;

/** Teclado que ilumina las notas que suenan en cada momento, con el color de su mano. */
export function LiveKeyboard({ song }: { song: Song }) {
  const notes = useMemo(() => activeNotes(song), [song]);
  const sounding = useFrameValue(
    () => soundingAt(notes, engine.time),
    (ns) =>
      ns
        .map((n) => n.pitch + n.hand)
        .sort()
        .join(),
  );
  const highlight = useMemo(() => new Map(sounding.map((n) => [n.pitch, HAND_COLOR[n.hand]])), [sounding]);
  return <KeyboardPreview highlight={highlight} />;
}
