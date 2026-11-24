import { piano } from '../playback/usePlayback';
import { useInputLive, useInputSettings } from '../state/inputSettings';
import { AudioInputProvider } from './audioInput';
import { InputHub } from './hub';
import { MidiInputProvider } from './midi';
import { PcKeyboardProvider } from './pcKeyboard';
import { PointerProvider } from './pointer';

/** Entradas únicas de la app. */
export const inputHub = new InputHub();
export const pcKeyboard = new PcKeyboardProvider();
export const pointerInput = new PointerProvider();
export const midiInput = new MidiInputProvider();
export const audioInput = new AudioInputProvider();

/** Vuelve a leer la lista de entradas de audio (los nombres aparecen tras dar permiso). */
export async function refreshAudioDevices(): Promise<void> {
  useInputLive.getState().setAudioDevices(await AudioInputProvider.listDevices());
}

let ready = false;

/** Conecta las entradas según los ajustes y las mantiene sincronizadas. Se llama una vez al arrancar. */
export function setupInputs(): void {
  if (ready) return;
  ready = true;

  inputHub.add(pointerInput);
  midiInput.onStatus((s) => useInputLive.getState().setMidiStatus(s));
  audioInput.onStatus((s) => {
    useInputLive.getState().setAudioStatus(s);
    if (s.kind === 'listening') {
      void refreshAudioDevices();
      audioInput.setMonitor(useInputSettings.getState().monitorVolume);
    }
  });
  audioInput.onLevel((l) => useInputLive.getState().setAudioLevel(l));
  navigator.mediaDevices?.addEventListener?.('devicechange', () => void refreshAudioDevices());

  const startAudio = (s = useInputSettings.getState()) => {
    inputHub.remove('audio-line');
    inputHub.remove('audio-mic');
    if (!s.audioEnabled) {
      audioInput.stop();
      return;
    }
    void audioInput
      .startWith({
        mode: s.audioMode,
        deviceId: s.audioDevice,
        calibration: s.calibration,
        sensitivity: s.sensitivity,
      })
      .then(() => {
        if (audioInput.currentStatus.kind === 'listening') inputHub.add(audioInput);
      });
  };
  startAudio();
  useInputSettings.subscribe((s, prev) => {
    if (
      s.audioEnabled !== prev.audioEnabled ||
      s.audioMode !== prev.audioMode ||
      s.audioDevice !== prev.audioDevice
    ) {
      startAudio(s);
      return;
    }
    if (s.calibration !== prev.calibration) audioInput.setCalibration(s.calibration);
    if (s.sensitivity !== prev.sensitivity) audioInput.setSensitivity(s.sensitivity);
    if (s.monitorVolume !== prev.monitorVolume) audioInput.setMonitor(s.monitorVolume);
  });

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
    // Lo que llega por audio ya suena en el teclado: sintetizarlo además haría eco en el micrófono.
    const fromAudio = e.source === 'audio-line' || e.source === 'audio-mic';
    const playSound = useInputSettings.getState().playSound && !fromAudio;
    if (e.type === 'on') {
      if (playSound) piano.noteOn(e.pitch, e.velocity);
      useInputLive.getState().pushRecent(e.pitch);
    } else if (!fromAudio) {
      piano.noteOff(e.pitch);
    }
  });
}
