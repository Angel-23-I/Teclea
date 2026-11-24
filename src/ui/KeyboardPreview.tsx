import { KEYBOARD_61, WHITE_KEY_COUNT, isBlackKey, noteName, type NamingStyle } from '../core/music/notes';

interface KeyboardPreviewProps {
  /** Teclas a resaltar y su color (p. ej. la mano que toca). */
  highlight?: ReadonlyMap<number, string>;
  naming?: NamingStyle;
}

const WHITE_W = 20;
const WHITE_H = 96;
const BLACK_W = 12;
const BLACK_H = 60;

/** Teclado estático de 61 teclas en SVG. La versión animada irá en el escenario de PixiJS (fase 2). */
export function KeyboardPreview({ highlight, naming = 'latin' }: KeyboardPreviewProps) {
  const whites: { midi: number; x: number }[] = [];
  const blacks: { midi: number; x: number }[] = [];
  let wi = 0;
  for (const midi of KEYBOARD_61) {
    if (isBlackKey(midi)) blacks.push({ midi, x: wi * WHITE_W - BLACK_W / 2 });
    else whites.push({ midi, x: wi++ * WHITE_W });
  }
  const width = WHITE_KEY_COUNT * WHITE_W;

  return (
    <svg
      viewBox={`0 0 ${width} ${WHITE_H + 2}`}
      className="block h-auto w-full"
      role="img"
      aria-label="Teclado de 61 teclas del Yamaha PSR-E283"
    >
      {whites.map(({ midi, x }) => (
        <g key={midi}>
          <rect
            x={x + 0.5}
            y={0}
            width={WHITE_W - 1}
            height={WHITE_H}
            rx={3}
            fill={highlight?.get(midi) ?? 'var(--color-key-white)'}
          />
          {midi % 12 === 0 && (
            <text
              x={x + WHITE_W / 2}
              y={WHITE_H - 7}
              textAnchor="middle"
              fontSize={8}
              fontFamily="var(--font-mono)"
              fill="#6b7389"
            >
              {noteName(midi, naming)}
            </text>
          )}
        </g>
      ))}
      {blacks.map(({ midi, x }) => (
        <rect
          key={midi}
          x={x}
          y={0}
          width={BLACK_W}
          height={BLACK_H}
          rx={2}
          fill={highlight?.get(midi) ?? 'var(--color-key-black)'}
        />
      ))}
    </svg>
  );
}
