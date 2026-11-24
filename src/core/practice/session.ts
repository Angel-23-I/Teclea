import type { SongNote } from '../song/types';

/**
 * - Espera: la canción se para en cada nota hasta que la tocas (importa el orden, no el ritmo).
 * - Ritmo: la canción sigue; cada nota se puntúa por lo cerca que la tocas de su momento.
 * - Escuchar: la app lo toca todo y no se puntúa.
 */
export type PracticeMode = 'wait' | 'rhythm' | 'listen';
export type HandChoice = 'left' | 'right' | 'both';

/** Estado de una nota para la persona que practica. `auto` = la toca la app (la otra mano). */
export type NoteStatus = 'auto' | 'pending' | 'hit' | 'miss' | 'skip';

export type HitQuality = 'perfect' | 'good' | 'early' | 'late';

export type Judgment =
  | {
      kind: 'hit';
      note: SongNote;
      pitch: number;
      /** s de canción: + tarde, − pronto */ offset: number;
      quality: HitQuality | null;
    }
  | { kind: 'miss'; note: SongNote; pitch: number }
  | { kind: 'wrong'; pitch: number };

export interface PracticeStats {
  hits: number;
  misses: number;
  wrong: number;
  streak: number;
  bestStreak: number;
  /** Desvíos (s de canción) de los aciertos en modo ritmo. */
  offsets: number[];
}

export interface PracticeSummary {
  /** 0–100 */
  accuracy: number;
  stars: 0 | 1 | 2 | 3;
  hits: number;
  misses: number;
  wrong: number;
  bestStreak: number;
  /** Desvío medio en ms de reloj real, o null si no hay datos (modo espera). */
  meanOffsetMs: number | null;
  /** Notas que había que tocar. */
  total: number;
}

export interface PracticeOptions {
  mode: PracticeMode;
  hands: HandChoice;
  /** Ritmo: margen a cada lado para dar una nota por acertada (s). */
  hitWindow?: number;
  /** Notas de un mismo acorde: empiezan con menos de esta diferencia (s). */
  chordTolerance?: number;
}

const emptyStats = (): PracticeStats => ({
  hits: 0,
  misses: 0,
  wrong: 0,
  streak: 0,
  bestStreak: 0,
  offsets: [],
});

/**
 * Lleva la cuenta de una práctica: qué notas tocan a la persona, cuáles ha acertado o fallado,
 * dónde debe esperar la canción y la puntuación. No sabe nada de audio ni de pantalla.
 */
export class PracticeSession {
  readonly mode: PracticeMode;
  readonly hands: HandChoice;
  private readonly hitWindow: number;
  private readonly chordTolerance: number;
  private status = new Map<SongNote, NoteStatus>();
  /** Índice de la primera nota practicada que puede seguir pendiente. */
  private cursor = 0;
  private _stats = emptyStats();

  /** @param notes notas de las pistas activas, ordenadas por inicio */
  constructor(
    readonly notes: readonly SongNote[],
    opts: PracticeOptions,
  ) {
    this.mode = opts.mode;
    this.hands = opts.hands;
    this.hitWindow = opts.hitWindow ?? 0.2;
    this.chordTolerance = opts.chordTolerance ?? 0.04;
  }

  get stats(): Readonly<PracticeStats> {
    return this._stats;
  }

  isPracticed(n: SongNote): boolean {
    return this.mode !== 'listen' && (this.hands === 'both' || n.hand === this.hands);
  }

  statusOf(n: SongNote): NoteStatus {
    if (!this.isPracticed(n)) return 'auto';
    return this.status.get(n) ?? 'pending';
  }

  /** Vuelve a dejar pendientes las notas desde `time` (tras saltar o repetir un tramo). */
  reset(time: number): void {
    for (const n of this.notes) {
      if (!this.isPracticed(n)) continue;
      if (n.start >= time - 1e-6) this.status.delete(n);
      else if (!this.status.has(n)) this.status.set(n, 'skip');
    }
    this.cursor = 0;
  }

  resetStats(): void {
    this._stats = emptyStats();
  }

  /** Conserva la puntuación de una sesión anterior (al cambiar de pistas sin cambiar de canción). */
  restoreStats(stats: Readonly<PracticeStats>): void {
    this._stats = { ...stats, offsets: [...stats.offsets] };
  }

  /** Inicio de la primera nota practicada pendiente (Infinity si no queda ninguna). */
  nextPendingTime(): number {
    while (this.cursor < this.notes.length && this.isDone(this.notes[this.cursor]!)) this.cursor++;
    for (let i = this.cursor; i < this.notes.length; i++) {
      const n = this.notes[i]!;
      if (!this.isDone(n)) return n.start;
    }
    return Infinity;
  }

  /** Modo espera: notas del acorde que hay que tocar para seguir (vacío si no toca esperar). */
  waitingGroup(time: number): SongNote[] {
    if (this.mode !== 'wait') return [];
    const next = this.nextPendingTime();
    if (!Number.isFinite(next) || time < next - 1e-3) return [];
    return this.pendingBetween(next, next + this.chordTolerance);
  }

  /** Modo ritmo: las notas que ya pasaron sin tocarse cuentan como fallo. */
  collectMisses(time: number): Judgment[] {
    if (this.mode !== 'rhythm') return [];
    const out: Judgment[] = [];
    for (let i = this.cursor; i < this.notes.length; i++) {
      const n = this.notes[i]!;
      if (n.start > time - this.hitWindow) break;
      if (this.isDone(n)) continue;
      this.status.set(n, 'miss');
      this._stats.misses++;
      this._stats.streak = 0;
      out.push({ kind: 'miss', note: n, pitch: n.pitch });
    }
    return out;
  }

  /** La persona ha tocado `pitch` cuando la canción iba por `time`. */
  onNoteOn(pitch: number, time: number): Judgment | null {
    if (this.mode === 'listen') return null;
    let best: SongNote | null = null;
    if (this.mode === 'wait') {
      // En espera vale cualquier nota del siguiente acorde pendiente, aunque se toque antes de tiempo.
      const next = this.nextPendingTime();
      if (Number.isFinite(next)) {
        best = this.pendingBetween(next, next + this.chordTolerance).find((n) => n.pitch === pitch) ?? null;
      }
      // …o una nota cercana algo posterior, por si se adelanta al acorde siguiente.
      best ??= this.nearestPending(pitch, time, 0.3, 0.35);
    } else {
      best = this.nearestPending(pitch, time, this.hitWindow, this.hitWindow);
    }

    const st = this._stats;
    if (!best) {
      st.wrong++;
      st.streak = 0;
      return { kind: 'wrong', pitch };
    }
    this.status.set(best, 'hit');
    st.hits++;
    st.streak++;
    st.bestStreak = Math.max(st.bestStreak, st.streak);
    if (this.mode === 'rhythm') {
      const offset = time - best.start;
      st.offsets.push(offset);
      const a = Math.abs(offset);
      const quality: HitQuality = a < 0.05 ? 'perfect' : a < 0.1 ? 'good' : offset < 0 ? 'early' : 'late';
      return { kind: 'hit', note: best, pitch, offset, quality };
    }
    return { kind: 'hit', note: best, pitch, offset: 0, quality: null };
  }

  /** Notas que la persona debería tocar ahora o enseguida (pista para el detector de audio). */
  expectedPitches(time: number): number[] {
    const set = new Set<number>();
    for (const n of this.waitingGroup(time)) set.add(n.pitch);
    for (let i = this.cursor; i < this.notes.length; i++) {
      const n = this.notes[i]!;
      if (n.start > time + 0.3) break;
      if (!this.isDone(n) && n.start >= time - 0.25) set.add(n.pitch);
    }
    return [...set].sort((a, b) => a - b);
  }

  /** Notas que hay que tocar en total (las de las manos elegidas). */
  get total(): number {
    return this.notes.filter((n) => this.isPracticed(n)).length;
  }

  summary(speed = 1): PracticeSummary {
    const { hits, misses, wrong, bestStreak, offsets } = this._stats;
    const attempts = hits + misses + wrong;
    const accuracy = attempts ? Math.round((hits / attempts) * 100) : 0;
    const stars = accuracy >= 95 ? 3 : accuracy >= 80 ? 2 : accuracy >= 60 ? 1 : 0;
    const meanOffsetMs = offsets.length
      ? Math.round((offsets.reduce((s, o) => s + Math.abs(o), 0) / offsets.length / speed) * 1000)
      : null;
    return { accuracy, stars, hits, misses, wrong, bestStreak, meanOffsetMs, total: this.total };
  }

  private isDone(n: SongNote): boolean {
    if (!this.isPracticed(n)) return true;
    const s = this.status.get(n);
    return s === 'hit' || s === 'miss' || s === 'skip';
  }

  private pendingBetween(from: number, to: number): SongNote[] {
    const out: SongNote[] = [];
    for (let i = this.cursor; i < this.notes.length; i++) {
      const n = this.notes[i]!;
      if (n.start > to + 1e-6) break;
      if (n.start >= from - 1e-6 && !this.isDone(n)) out.push(n);
    }
    return out;
  }

  /** Nota pendiente de esa altura más cercana a `time`, dentro de [time − late, time + early]. */
  private nearestPending(pitch: number, time: number, late: number, early: number): SongNote | null {
    let best: SongNote | null = null;
    let bestDist = Infinity;
    for (let i = this.cursor; i < this.notes.length; i++) {
      const n = this.notes[i]!;
      if (n.start > time + early) break;
      if (n.pitch !== pitch || this.isDone(n) || n.start < time - late) continue;
      const d = Math.abs(n.start - time);
      if (d < bestDist) {
        best = n;
        bestDist = d;
      }
    }
    return best;
  }
}
