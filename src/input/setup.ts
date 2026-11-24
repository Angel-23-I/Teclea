import { piano } from '../playback/usePlayback';
import { useInputLive, useInputSettings } from '../state/inputSettings';
import { InputHub } from './hub';
import { MidiInputProvider } from './midi';
import { PcKeyboardProvider } from './pcKeyboard';
import { PointerProvider } from './pointer';

/** Entradas únicas de la app. */
export const inputHub = new InputHub();
export const pcKeyboard = new PcKeyboardProvider();
export const pointerInput = new PointerProvider();
export const midiInput = new MidiInputProvider();

let ready = false;

/** Conecta las entradas según los ajustes y las mantiene sincronizadas. Se llama una vez al arrancar. */
export function setupInputs(): void {
  if (ready) return;
  ready = true;

  inputHub.add(pointerInput);
  midiInput.onStatus((s) => useInputLive.getState().setMidiStatus(s));

  const apply = (s = useInputSettings.getState()) => {
    pcKeyboard.setOctave(s.pcOctave);
    if (s.pcKeyboard) {
      inputHub.add(pcKeyboard);
      void pcKeyboard.start();
    } else {
      pcKeyboard.stop();
      inputHub.remove('pc-keyboard');
    }
    midiInput.select(s.midiDevice);
    if (s.midiEnabled) {
      inputHub.add(midiInput);
      void midiInput.start();
    } else {
      midiInput.stop();
      inputHub.remove('midi');
    }
  };
  apply();
  useInputSettings.subscribe((s, prev) => {
    if (
      s.pcKeyboard !== prev.pcKeyboard ||
      s.pcOctave !== prev.pcOctave ||
      s.midiEnabled !== prev.midiEnabled ||
      s.midiDevice !== prev.midiDevice
    ) {
      apply(s);
    }
  });

  // Sonido de lo que se toca y lista de últimas notas.
  inputHub.subscribe((e) => {
    const playSound = useInputSettings.getState().playSound;
    if (e.type === 'on') {
      if (playSound) piano.noteOn(e.pitch, e.velocity);
      useInputLive.getState().pushRecent(e.pitch);
    } else {
      piano.noteOff(e.pitch);
    }
  });
}
