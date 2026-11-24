import type { ReactNode, RefObject } from 'react';

export const sectionTitle = 'text-[11px] font-semibold tracking-[0.09em] text-muted uppercase';
export const primaryButton =
  'rounded-[9px] bg-rh px-3 py-[7px] text-[13px] font-semibold text-[#1b1206] hover:bg-[#f6b476]';
export const secondaryButton =
  'rounded-[9px] border border-line bg-panel-2 px-3 py-[7px] text-[13px] font-medium hover:bg-panel-3';

export function Switch({
  checked,
  onChange,
  labelId,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  labelId: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelId}
      onClick={() => onChange(!checked)}
      className={`relative h-[22px] w-[38px] shrink-0 rounded-full border p-0 transition-colors ${
        checked ? 'border-rh bg-rh/30' : 'border-line bg-panel-3'
      }`}
    >
      <span
        className={`absolute top-[2px] left-[2px] size-4 rounded-full transition-transform ${
          checked ? 'translate-x-4 bg-rh' : 'bg-muted'
        }`}
      />
    </button>
  );
}

/** Ventana modal centrada con cabecera y botón de cerrar (el foco y Escape los lleva `useDialog`). */
export function Modal({
  titleId,
  title,
  onClose,
  closeRef,
  width = 640,
  children,
}: {
  titleId: string;
  title: ReactNode;
  onClose: () => void;
  closeRef: RefObject<HTMLButtonElement | null>;
  width?: number;
  children: ReactNode;
}) {
  return (
    <>
      <div className="fixed inset-0 z-20 bg-[rgba(4,6,12,0.6)]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ width: `min(${width}px, calc(100% - 32px))` }}
        className="fixed top-1/2 left-1/2 z-21 flex max-h-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-line bg-panel"
      >
        <header className="flex items-center gap-3 border-b border-line px-[18px] py-4">
          <h2 id={titleId} className="font-display text-xl font-bold">
            {title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="ml-auto size-[34px] rounded-lg border border-line bg-panel-2 text-lg leading-none"
          >
            ×
          </button>
        </header>
        <div className="flex flex-col gap-3 overflow-auto p-[18px]">{children}</div>
      </div>
    </>
  );
}

export function Card({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 rounded-xl border border-line bg-panel-2 p-3.5">
      <h3 className="font-semibold">{title}</h3>
      {children}
    </section>
  );
}

/** Deslizador 0–100 % con su etiqueta y valor. */
export function PercentSlider({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex items-center justify-between gap-3">
        <span>{label}</span>
        <output htmlFor={id} className="font-mono text-[13px] tabular-nums">
          {Math.round(value * 100)} %
        </output>
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={5}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="accent-rh"
      />
    </div>
  );
}
