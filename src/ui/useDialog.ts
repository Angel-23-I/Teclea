import { useEffect, useRef } from 'react';

/**
 * Comportamiento común de los diálogos: al abrir, el foco va al botón de cerrar, y Escape cierra.
 * Solo reacciona a `open`: así redibujar el diálogo (p. ej. con el medidor de nivel) no le roba el
 * foco ni reinicia su estado.
 */
export function useDialog(open: boolean, onClose: () => void, escapeCloses = true) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const escapeRef = useRef(escapeCloses);
  onCloseRef.current = onClose;
  escapeRef.current = escapeCloses;

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && escapeRef.current) onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return closeRef;
}
