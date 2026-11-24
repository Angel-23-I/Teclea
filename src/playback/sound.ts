import { MetronomeClick } from '../audio/metronome';
import { beatClicks } from '../core/song/beats';
import { useSoundSettings } from '../state/soundSettings';
import { LEAD_IN } from './engine';
import { engine, piano } from './usePlayback';

const click = new MetronomeClick();

function syncClicks(): void {
  const song = engine.currentSong;
  if (!song) return;
  const { metronome, countIn } = useSoundSettings.getState();
  engine.setClicks(beatClicks(song, { countIn, all: metronome, leadIn: LEAD_IN }), click);
}

function syncVolumes(): void {
  const { volume, metronomeVolume } = useSoundSettings.getState();
  piano.setVolume(volume);
  click.setVolume(metronomeVolume);
}

/** Aplica los ajustes de sonido (volumen, metrónomo, clics de cuenta atrás) y los sigue. */
export function setupSound(): void {
  syncVolumes();
  syncClicks();
  engine.onJump((_, reason) => {
    if (reason === 'load') syncClicks();
  });
  useSoundSettings.subscribe((s, prev) => {
    if (s.volume !== prev.volume || s.metronomeVolume !== prev.metronomeVolume) syncVolumes();
    if (s.metronome !== prev.metronome || s.countIn !== prev.countIn) syncClicks();
  });
}
