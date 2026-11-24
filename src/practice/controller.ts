import { PracticeSession, type Judgment, type NoteStatus } from '../core/practice/session';
import { activeNotes, type Hand, type Song, type SongNote } from '../core/song/types';
import { audioInput, inputHub } from '../input/setup';
import type { NoteEvent } from '../input/types';
import { engine } from '../playback/usePlayback';
import { bestKey, usePracticeLive, usePracticeSettings } from '../state/practice';

/** Efecto visual de una nota juzgada (chispas, "Perfecto", "Fallo"…), para la escena. */
export interface PracticeEffect {
  id: number;
  pitch: number;
  kind: 'hit' | 'miss' | 'wrong';
  hand: Hand | null;
  text: string | null;
  /** performance.now() al producirse. */
  at: number;
}

const QUALITY_TEXT = { perfect: 'Perfecto', good: 'Bien', early: 'Pronto', late: 'Tarde' } as const;

/**
 * Une la sesión de práctica con el resto de la app: escucha las entradas, decide dónde espera la
 * canción, cuenta fallos, avisa al detector de audio de qué notas esperar y guarda los resultados.
 */
class PracticeController {
  private session: PracticeSession | null = null;
  private song: Song | null = null;
  private notes: SongNote[] = [];
  private lastExpected = '';
  private lastWaiting = '';
  private lastUpcoming = '';
  private lastStats = '';
  private effectId = 0;
  /** Color de cada tecla pulsada según el juicio: verde acierto, rojo error. */
  readonly keyJudgments = new Map<number, 'ok' | 'bad'>();
  readonly effects: PracticeEffect[] = [];
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    inputHub.subscribe(this.onInput);
    engine.onTick(this.onTick);
    engine.onJump(this.onJump);
    engine.subscribe(this.onEngineChange);
    usePracticeSettings.subscribe((s, prev) => {
      if (s.mode !== prev.mode || s.hands !== prev.hands) this.rebuild(true);
    });
  }

  /** Canción actual (o sus pistas han cambiado). */
  setSong(song: Song): void {
    const sameSong = this.song?.id === song.id;
    this.song = song;
    this.notes = activeNotes(song);
    this.rebuild(!sameSong);
  }

  statusOf(n: SongNote): NoteStatus {
    return this.session?.statusOf(n) ?? 'auto';
  }

  /** Teclas que hay que tocar ya (o enseguida), con su mano, para iluminarlas en el teclado. */
  expectedKeys(time: number): Map<number, Hand> {
    const out = new Map<number, Hand>();
    const s = this.session;
    if (!s || s.mode === 'listen') return out;
    const waiting = s.waitingGroup(time);
    if (waiting.length) {
      for (const n of waiting) out.set(n.pitch, n.hand);
      return out;
    }
    for (const n of this.notes) {
      if (n.start > time + 0.12) break;
      if (n.start >= time - 0.05 && s.statusOf(n) === 'pending') out.set(n.pitch, n.hand);
    }
    return out;
  }

  private rebuild(resetStats: boolean): void {
    const { mode, hands } = usePracticeSettings.getState();
    const prevStats = this.session?.stats;
    const session = new PracticeSession(this.notes, { mode, hands });
    session.reset(engine.time);
    this.session = session;
    if (!resetStats && prevStats) session.restoreStats(prevStats);
    engine.setPlayFilter((n) => !session.isPracticed(n));
    engine.setLimit(mode === 'wait' && engine.playing ? session.nextPendingTime() : Infinity);
    usePracticeLive.getState().setSummary(null);
    this.publish(engine.time, true);
  }

  private onJump = (time: number, reason: 'load' | 'seek' | 'loop'): void => {
    const s = this.session;
    if (!s) return;
    s.reset(time);
    this.keyJudgments.clear();
    // Volver al principio es empezar otra vez: puntuación a cero. Un bucle sigue sumando.
    if (reason === 'load' || (reason === 'seek' && time <= Math.min(0, this.notes[0]?.start ?? 0) - 1)) {
      s.resetStats();
    }
    usePracticeLive.getState().setSummary(null);
    engine.setLimit(s.mode === 'wait' ? s.nextPendingTime() : Infinity);
    this.publish(time, true);
  };

  private onTick = (time: number): void => {
    const s = this.session;
    if (!s) return;
    if (s.mode === 'wait') engine.setLimit(s.nextPendingTime());
    for (const j of s.collectMisses(time)) this.effect(j);
    this.publish(time);
  };

  private onEngineChange = (): void => {
    const snap = engine.getSnapshot();
    if (snap.state === 'playing') {
      if (this.session?.mode === 'wait') engine.setLimit(this.session.nextPendingTime());
      return;
    }
    // Al llegar al final se muestran los resultados.
    const s = this.session;
    const song = this.song;
    if (!s || !song || s.mode === 'listen' || usePracticeLive.getState().summary) return;
    if (engine.time < song.duration - 1e-3) return;
    const summary = s.summary(engine.speed);
    if (summary.hits + summary.misses + summary.wrong === 0) return;
    const record = usePracticeSettings
      .getState()
      .recordBest(bestKey(song.id, s.mode, s.hands), summary.accuracy);
    usePracticeLive.getState().setSummary({ ...summary, record });
  };

  private onInput = (e: NoteEvent): void => {
    if (e.type === 'off') {
      this.keyJudgments.delete(e.pitch);
      return;
    }
    const s = this.session;
    if (!s || !engine.playing) return;
    const j = s.onNoteOn(e.pitch, engine.timeAt(e.time));
    if (!j) return;
    this.keyJudgments.set(e.pitch, j.kind === 'hit' ? 'ok' : 'bad');
    this.effect(j);
    if (s.mode === 'wait') engine.setLimit(s.nextPendingTime());
    this.publish(engine.time);
  };

  private effect(j: Judgment): void {
    const text = j.kind === 'miss' ? 'Fallo' : j.kind === 'hit' && j.quality ? QUALITY_TEXT[j.quality] : null;
    this.effects.push({
      id: ++this.effectId,
      pitch: j.pitch,
      kind: j.kind,
      hand: j.kind === 'wrong' ? null : j.note.hand,
      text,
      at: performance.now(),
    });
    if (this.effects.length > 64) this.effects.splice(0, this.effects.length - 64);
  }

  /** Publica en el estado lo que ha cambiado (sin redibujar la interfaz si no cambia nada). */
  private publish(time: number, force = false): void {
    const s = this.session;
    if (!s) return;
    const live = usePracticeLive.getState();
    const st = s.stats;
    const statsKey = `${st.hits}|${st.misses}|${st.wrong}|${st.streak}`;
    if (force || statsKey !== this.lastStats) {
      this.lastStats = statsKey;
      live.setStats(st);
    }
    const waiting = s.waitingGroup(time).map((n) => n.pitch);
    const waitingKey = waiting.join();
    if (force || waitingKey !== this.lastWaiting) {
      this.lastWaiting = waitingKey;
      live.setWaiting(waiting);
    }
    // Próximo acorde pendiente, para el panel "Siguiente".
    const next = s.nextPendingTime();
    const upcoming = Number.isFinite(next)
      ? this.notes
          .filter((n) => Math.abs(n.start - next) < 0.04 && s.statusOf(n) === 'pending')
          .map((n) => ({ pitch: n.pitch, hand: n.hand, finger: n.finger }))
      : [];
    const upKey = upcoming.map((u) => u.pitch + u.hand).join();
    if (force || upKey !== this.lastUpcoming) {
      this.lastUpcoming = upKey;
      live.setUpcoming(upcoming);
    }
    const expected = s.expectedPitches(time);
    const expKey = expected.join();
    if (force || expKey !== this.lastExpected) {
      this.lastExpected = expKey;
      audioInput.setExpected(s.mode === 'listen' ? null : expected);
    }
  }
}

export const practice = new PracticeController();
