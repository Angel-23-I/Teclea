import { useInputLive, useInputSettings } from '../state/inputSettings';

/** Resumen de las entradas activas para la cabecera. */
export function useInputSummary(): { label: string; active: boolean } {
  const s = useInputSettings();
  const midiStatus = useInputLive((l) => l.midiStatus);
  const audioStatus = useInputLive((l) => l.audioStatus);
  if (s.audioEnabled && audioStatus.kind === 'listening') {
    return { label: s.audioMode === 'line' ? 'Cable · tu teclado' : 'Micrófono · tu teclado', active: true };
  }
  const names = midiStatus.kind === 'ready' ? midiStatus.devices.map((d) => d.name) : [];
  if (s.midiEnabled && names.length) {
    const chosen = names.length === 1 ? names[0]! : `${names.length} teclados`;
    return { label: `MIDI · ${chosen}`, active: true };
  }
  if (s.pcKeyboard) return { label: 'Teclado del ordenador', active: true };
  return { label: 'Ratón', active: true };
}
