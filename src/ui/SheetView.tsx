import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { songToMusicXml } from '../core/sheet/songToMusicXml';
import type { Song } from '../core/song/types';
import { engine } from '../playback/usePlayback';
import { storedMusicXml } from '../state/library';
import { useViewSettings } from '../state/viewSettings';

/** Unidades de OSMD a píxeles con zoom 1. */
const UNIT_PX = 10;

interface MeasureBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** (fracción del compás, x) de cada nota o silencio, para mover la línea de lectura con la música. */
  points: [number, number][];
}

/** Rectángulos de cada compás (en píxeles dentro del contenedor desplazable). */
function measureBoxes(osmd: OpenSheetMusicDisplay, host: HTMLElement): MeasureBox[] {
  const svg = host.querySelector('svg');
  if (!svg) return [];
  const hostRect = host.getBoundingClientRect();
  const svgRect = svg.getBoundingClientRect();
  const ox = svgRect.left - hostRect.left + host.scrollLeft;
  const oy = svgRect.top - hostRect.top + host.scrollTop;
  const k = UNIT_PX * osmd.Zoom;
  return osmd.GraphicSheet.MeasureList.map((staves) => {
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    const points: [number, number][] = [];
    for (const m of staves) {
      if (!m) continue;
      const box = m.PositionAndShape;
      const abs = box.AbsolutePosition;
      left = Math.min(left, abs.x + box.BorderLeft);
      right = Math.max(right, abs.x + box.BorderRight);
      top = Math.min(top, abs.y + box.BorderTop);
      bottom = Math.max(bottom, abs.y + box.BorderBottom);
      const whole = m.parentSourceMeasure?.Duration?.RealValue || 1;
      for (const se of m.staffEntries) {
        points.push([
          Math.min(1, se.relInMeasureTimestamp.RealValue / whole),
          se.PositionAndShape.AbsolutePosition.x,
        ]);
      }
    }
    points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const unique = points.filter((p, i) => i === 0 || p[0] - points[i - 1]![0] > 1e-6);
    if (!unique.length || unique[0]![0] > 0) unique.unshift([0, unique[0]?.[1] ?? left + 1]);
    unique.push([1, right - 1]);
    return {
      left: ox + left * k,
      right: ox + right * k,
      top: oy + (top - 1.5) * k,
      bottom: oy + (bottom + 1.5) * k,
      points: unique.map(([f, x]) => [f, ox + x * k] as [number, number]),
    };
  }).filter((b) => Number.isFinite(b.left));
}

function xAt(points: [number, number][], frac: number): number {
  for (let i = 1; i < points.length; i++) {
    const [f1, x1] = points[i]!;
    if (frac <= f1) {
      const [f0, x0] = points[i - 1]!;
      return f1 - f0 < 1e-6 ? x1 : x0 + ((frac - f0) / (f1 - f0)) * (x1 - x0);
    }
  }
  return points[points.length - 1]![1];
}

/** Índice del compás que suena en `time` y fracción recorrida. */
function measureAtTime(measures: readonly number[], duration: number, time: number): [number, number] {
  if (!measures.length || time < measures[0]!) return [0, 0];
  let i = 0;
  while (i + 1 < measures.length && measures[i + 1]! <= time + 1e-6) i++;
  const start = measures[i]!;
  const end = measures[i + 1] ?? Math.max(start + 1e-3, duration);
  return [i, Math.max(0, Math.min(1, (time - start) / (end - start)))];
}

type Status = 'loading' | 'ready' | 'error';

/**
 * Partitura de la canción con OpenSheetMusicDisplay: la original si se importó un MusicXML y, si no,
 * una generada a partir de las notas. Un recuadro marca el compás que suena y una línea sigue la música.
 * Pulsar un compás salta a él.
 */
export function SheetView({ song }: { song: Song }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const boxesRef = useRef<MeasureBox[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [original, setOriginal] = useState<string | null | undefined>(undefined);
  const zoom = useViewSettings((v) => v.sheetZoom);
  const setZoom = useViewSettings((v) => v.setSheetZoom);
  const songRef = useRef(song);
  songRef.current = song;

  // MusicXML original guardado (solo canciones importadas desde MusicXML).
  useEffect(() => {
    let alive = true;
    setOriginal(undefined);
    if (song.source !== 'musicxml') setOriginal(null);
    else void storedMusicXml(song.id).then((x) => alive && setOriginal(x));
    return () => {
      alive = false;
    };
  }, [song.id, song.source]);

  const xml = useMemo(
    () => (original === undefined ? null : (original ?? songToMusicXml(song))),
    [original, song],
  );

  // Carga y dibuja.
  useEffect(() => {
    const paper = paperRef.current;
    const host = hostRef.current;
    if (!paper || !host || !xml) return;
    let alive = true;
    setStatus('loading');
    void (async () => {
      try {
        const { OpenSheetMusicDisplay } = await import('opensheetmusicdisplay');
        if (!alive) return;
        osmdRef.current ??= new OpenSheetMusicDisplay(paper, {
          backend: 'svg',
          autoResize: false,
          drawTitle: false,
          drawSubtitle: false,
          drawComposer: false,
          drawCredits: false,
          drawPartNames: false,
          drawMetronomeMarks: true,
          disableCursor: true,
          followCursor: false,
          onRender: () => {
            if (hostRef.current && osmdRef.current) {
              boxesRef.current = measureBoxes(osmdRef.current, hostRef.current);
            }
          },
        });
        const osmd = osmdRef.current;
        await osmd.load(xml);
        if (!alive) return;
        osmd.Zoom = useViewSettings.getState().sheetZoom;
        osmd.render();
        host.scrollTop = 0;
        setStatus('ready');
      } catch (e) {
        if (!alive) return;
        console.error('No se pudo dibujar la partitura', e);
        setStatus('error');
      }
    })();
    return () => {
      alive = false;
    };
  }, [xml]);

  // Zoom.
  useEffect(() => {
    const osmd = osmdRef.current;
    if (!osmd || status !== 'ready' || osmd.Zoom === zoom) return;
    osmd.Zoom = zoom;
    osmd.render();
  }, [zoom, status]);

  // Vuelve a maquetar si cambia el ancho (ventana o vista dividida).
  useEffect(() => {
    const host = hostRef.current;
    if (!host || status !== 'ready') return;
    let width = host.clientWidth;
    let timer = 0;
    const ro = new ResizeObserver(() => {
      if (Math.abs(host.clientWidth - width) < 8) return;
      width = host.clientWidth;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => osmdRef.current?.render(), 150);
    });
    ro.observe(host);
    return () => {
      ro.disconnect();
      window.clearTimeout(timer);
    };
  }, [status]);

  // Recuadro del compás y línea de lectura, en cada fotograma, sin pasar por React.
  useEffect(() => {
    if (status !== 'ready') return;
    let raf = 0;
    let lastMeasure = -1;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const host = hostRef.current;
      const box = boxRef.current;
      const line = lineRef.current;
      const boxes = boxesRef.current;
      if (!host || !box || !line || !boxes.length) return;
      const s = songRef.current;
      const [i, frac] = measureAtTime(s.measures, s.duration, engine.time);
      const b = boxes[Math.min(i, boxes.length - 1)]!;
      box.style.transform = `translate(${b.left}px, ${b.top}px)`;
      box.style.width = `${b.right - b.left}px`;
      box.style.height = `${b.bottom - b.top}px`;
      const x = engine.time < (s.measures[0] ?? 0) ? b.points[0]![1] : xAt(b.points, frac);
      line.style.transform = `translate(${x - 1}px, ${b.top}px)`;
      line.style.height = `${b.bottom - b.top}px`;
      if (i !== lastMeasure) {
        lastMeasure = i;
        const view = host.scrollTop;
        if (b.top < view + 8 || b.bottom > view + host.clientHeight - 8) {
          host.scrollTo({ top: Math.max(0, b.top - 16), behavior: reduced ? 'auto' : 'smooth' });
        }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [status]);

  useEffect(
    () => () => {
      osmdRef.current?.clear();
      osmdRef.current = null;
    },
    [],
  );

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const host = hostRef.current;
    if (!host) return;
    const r = host.getBoundingClientRect();
    const x = e.clientX - r.left + host.scrollLeft;
    const y = e.clientY - r.top + host.scrollTop;
    const i = boxesRef.current.findIndex((b) => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom);
    const t = songRef.current.measures[i];
    if (i >= 0 && t != null) engine.seek(t);
  };

  return (
    <div className="relative h-full min-h-0">
      <div
        ref={hostRef}
        onClick={onClick}
        className="relative h-full overflow-auto bg-[#f7f4ec]"
        aria-label={`Partitura de ${song.title}. Pulsa un compás para ir a él.`}
        role="region"
      >
        <div ref={paperRef} className="min-h-full px-2 pb-6" />
        {status === 'ready' && (
          <>
            <div
              ref={boxRef}
              aria-hidden="true"
              className="pointer-events-none absolute top-0 left-0 rounded-md bg-[rgba(243,163,91,0.16)] ring-1 ring-[rgba(214,128,52,0.45)]"
            />
            <div
              ref={lineRef}
              aria-hidden="true"
              className="pointer-events-none absolute top-0 left-0 w-[2px] rounded-full bg-[#d6702a]"
            />
          </>
        )}
        {status !== 'ready' && (
          <div className="absolute inset-0 grid place-items-center text-[13px] text-[#5b6170]">
            {status === 'loading'
              ? 'Preparando la partitura…'
              : 'No se pudo dibujar la partitura de esta canción.'}
          </div>
        )}
      </div>
      <div className="absolute top-2 right-3 flex items-center gap-1 rounded-lg border border-[#d9d3c4] bg-[#fbf9f4]/95 p-1 text-[#2a2f3a] shadow-sm">
        <button
          type="button"
          onClick={() => setZoom(zoom - 0.1)}
          aria-label="Partitura más pequeña"
          className="grid size-7 place-items-center rounded-md text-base hover:bg-[#ece6d8]"
        >
          −
        </button>
        <span className="min-w-10 text-center font-mono text-[12px] tabular-nums">
          {Math.round(zoom * 100)} %
        </span>
        <button
          type="button"
          onClick={() => setZoom(zoom + 0.1)}
          aria-label="Partitura más grande"
          className="grid size-7 place-items-center rounded-md text-base hover:bg-[#ece6d8]"
        >
          +
        </button>
      </div>
    </div>
  );
}
