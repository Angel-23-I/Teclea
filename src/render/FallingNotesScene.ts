import { Application, BitmapFont, BitmapText, Container, Graphics } from 'pixi.js';
import { pitchName } from '../core/music/notes';
import type { NoteStatus } from '../core/practice/session';
import type { Hand, SongNote } from '../core/song/types';
import type { PracticeEffect } from '../practice/controller';
import type { LoopRange } from '../core/transport/transport';
import type { NoteLabels } from '../state/viewSettings';
import {
  BLACK_KEY_HEIGHT,
  keyboardLayout,
  noteRect,
  stageMetrics,
  timeToY,
  visibleRange,
  type KeyRect,
  type StageMetrics,
} from './layout';

export interface SceneInput {
  /** Notas de las pistas activas, ordenadas por inicio. */
  notes: readonly SongNote[];
  measures: readonly number[];
  /** Segundo actual de la canción. */
  time: number;
  loop: LoopRange | null;
  /** Teclas iluminadas ahora mismo y la mano que las toca. */
  litKeys: ReadonlyMap<number, Hand>;
  /** Teclas que la persona está pulsando (teclado del PC, ratón, MIDI…). */
  pressedKeys: ReadonlySet<number>;
  /** Letra del ordenador para cada nota, o null para no mostrarlas. */
  pcKeyLabels: ReadonlyMap<number, string> | null;
  noteLabels: NoteLabels;
  showFingers: boolean;
  lookahead: number;
  /** Hay práctica en marcha (no en modo escuchar): las notas de la otra mano se ven más tenues. */
  practicing: boolean;
  /** Estado de cada nota para la persona: pendiente, acertada, fallada o de la app. */
  noteStatus: (n: SongNote) => NoteStatus;
  /** Teclas que toca pulsar ya, con su mano (laten en el teclado). */
  expectedKeys: ReadonlyMap<number, Hand>;
  /** Juicio de cada tecla pulsada: verde acierto, rojo nota falsa. */
  keyJudgments: ReadonlyMap<number, 'ok' | 'bad'>;
  /** Efectos recientes (chispas y textos), en orden de llegada. */
  effects: readonly PracticeEffect[];
}

const C = {
  rh: 0xf3a35b,
  lh: 0x5bb8ea,
  keyWhite: 0xeef1f7,
  keyWhiteEdge: 0xc9cfdb,
  keyBlack: 0x151a27,
  keyBlackTop: 0x2a3142,
  muted: 0x8b95ae,
  fg: 0xe9edf6,
  ink: 0x0a0e18,
  noteText: 0x1a140c,
  pressed: 0xf6d1a6,
  ok: 0x62d892,
  bad: 0xf2656f,
  warn: 0xe5d36a,
};
const reducedMotion =
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  max: number;
  color: number;
}
interface FloatingText {
  text: string;
  x: number;
  y: number;
  life: number;
  color: number;
}
const handColor = (h: Hand) => (h === 'left' ? C.lh : C.rh);

/** Mezcla un color con blanco (0 = igual, 1 = blanco). */
function lighten(color: number, amount: number): number {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}

const LABEL_FONT = 'TecleaNotas';
const MONO_FONT = 'TecleaMono';
let fontsInstalled = false;

async function installFonts(): Promise<void> {
  if (fontsInstalled) return;
  // Las fuentes van incluidas en la app; hay que esperar a que estén cargadas antes de rasterizarlas.
  await Promise.all([
    document.fonts?.load('600 28px "Inter Variable"'),
    document.fonts?.load('500 24px "IBM Plex Mono"'),
  ]).catch(() => undefined);
  const chars = [['a', 'z'], ['A', 'Z'], ['0', '9'], '#·–'];
  BitmapFont.install({
    name: LABEL_FONT,
    style: {
      fontFamily: '"Inter Variable", "Segoe UI", sans-serif',
      fontSize: 28,
      fontWeight: '600',
      fill: 0xffffff,
    },
    chars,
    resolution: 2,
  });
  BitmapFont.install({
    name: MONO_FONT,
    style: {
      fontFamily: '"IBM Plex Mono", Consolas, monospace',
      fontSize: 24,
      fontWeight: '500',
      fill: 0xffffff,
    },
    chars,
    resolution: 2,
  });
  fontsInstalled = true;
}

/** Reserva de textos reutilizables: crear textos en cada fotograma sería muy lento. */
class TextPool {
  private items: BitmapText[] = [];
  private used = 0;
  constructor(
    private readonly parent: Container,
    private readonly font: string,
  ) {}
  begin(): void {
    this.used = 0;
  }
  take(text: string, size: number, tint: number, alpha = 1): BitmapText {
    let t = this.items[this.used];
    if (!t) {
      t = new BitmapText({ text, style: { fontFamily: this.font, fontSize: size } });
      this.items.push(t);
      this.parent.addChild(t);
    }
    this.used++;
    if (t.text !== text) t.text = text;
    if (t.style.fontSize !== size) t.style.fontSize = size;
    t.tint = tint;
    t.alpha = alpha;
    t.visible = true;
    return t;
  }
  end(): void {
    for (let i = this.used; i < this.items.length; i++) this.items[i]!.visible = false;
  }
}

/**
 * Escena de notas que caen sobre el teclado de 61 teclas, dibujada con PixiJS (WebGL).
 * Lee el estado en cada fotograma con `getInput`; no guarda nada de la canción.
 */
export class FallingNotesScene {
  private app = new Application();
  private initialized = false;
  private destroyed = false;

  private lanes = new Graphics();
  private loopBand = new Graphics();
  private measureLines = new Graphics();
  private notesGfx = new Graphics();
  private fingerDots = new Graphics();
  private hitLine = new Graphics();
  private keyGlow = new Graphics();
  private keyboard = new Graphics();
  private fx = new Graphics();
  private fxText = new Container();
  private fxTexts = new TextPool(this.fxText, LABEL_FONT);
  private particles: Particle[] = [];
  private floating: FloatingText[] = [];
  private lastEffect = 0;
  private lastFrame = performance.now();
  private staticText = new Container();
  private dynamicText = new Container();
  private keyText = new Container();
  private noteTexts = new TextPool(this.dynamicText, LABEL_FONT);
  private monoTexts = new TextPool(this.dynamicText, MONO_FONT);

  private metrics: StageMetrics | null = null;
  private keys: KeyRect[] = [];
  private layoutKey = '';
  /** null = hay que redibujar el teclado aunque no haya teclas iluminadas. */
  private keyboardKey: string | null = null;

  constructor(private readonly getInput: () => SceneInput) {}

  async mount(el: HTMLElement): Promise<void> {
    await installFonts();
    if (this.destroyed) return;
    await this.app.init({
      resizeTo: el,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(2, window.devicePixelRatio || 1),
    });
    this.initialized = true;
    if (this.destroyed) {
      this.app.destroy(true, { children: true });
      return;
    }
    this.app.canvas.setAttribute('aria-hidden', 'true');
    el.appendChild(this.app.canvas);
    this.app.stage.addChild(
      this.lanes,
      this.loopBand,
      this.measureLines,
      this.staticText,
      this.notesGfx,
      this.fingerDots,
      this.dynamicText,
      this.hitLine,
      this.keyboard,
      this.keyGlow,
      this.keyText,
      this.fx,
      this.fxText,
    );
    this.app.ticker.add(this.frame);
  }

  /** Fotogramas por segundo reales (para comprobar la fluidez). */
  get fps(): number {
    return this.initialized ? this.app.ticker.FPS : 0;
  }

  destroy(): void {
    this.destroyed = true;
    if (this.initialized) this.app.destroy(true, { children: true });
  }

  private frame = (): void => {
    const input = this.getInput();
    const { width, height } = this.app.screen;
    const pcKeys = input.pcKeyLabels ? [...input.pcKeyLabels].join() : '';
    const layoutKey = `${width}x${height}|${input.lookahead}|${input.noteLabels}|${pcKeys}`;
    if (layoutKey !== this.layoutKey) {
      this.layoutKey = layoutKey;
      this.metrics = stageMetrics(width, height, input.lookahead);
      this.keys = keyboardLayout(width);
      this.drawStatic(input);
      this.keyboardKey = null;
    }
    const m = this.metrics!;
    this.noteTexts.begin();
    this.monoTexts.begin();
    this.drawMeasures(input, m);
    this.drawNotes(input, m);
    this.noteTexts.end();
    this.monoTexts.end();
    this.drawKeyboardState(input, m);
    this.drawEffects(input, m);
  };

  /** Chispas al acertar y textos ("Perfecto", "Fallo"…) que suben y se desvanecen. */
  private drawEffects(input: SceneInput, m: StageMetrics): void {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    for (const e of input.effects) {
      if (e.id <= this.lastEffect) continue;
      this.lastEffect = e.id;
      if (now - e.at > 500) continue; // efectos viejos (p. ej. tras cambiar de pestaña)
      const k = this.keys[e.pitch];
      if (!k) continue;
      const x = k.x + k.width / 2;
      const color = e.kind === 'hit' ? (e.hand ? handColor(e.hand) : C.ok) : C.bad;
      if (e.kind === 'hit' && !reducedMotion) {
        for (let i = 0; i < 14; i++) {
          const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.7;
          const v = 90 + Math.random() * 170;
          this.particles.push({
            x,
            y: m.hitY - 2,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            r: 1.5 + Math.random() * 2,
            life: 0.55,
            max: 0.55,
            color,
          });
        }
      }
      if (e.text) {
        const good = e.text === 'Perfecto' || e.text === 'Bien';
        const textColor = good ? C.ok : e.text === 'Fallo' ? C.bad : C.warn;
        this.floating.push({ text: e.text, x, y: m.hitY - 20, life: 0.8, color: textColor });
      }
    }
    const g = this.fx.clear();
    this.particles = this.particles.filter((p) => (p.life -= dt) > 0);
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 380 * dt;
      g.circle(p.x, p.y, p.r).fill({ color: p.color, alpha: p.life / p.max });
    }
    this.fxTexts.begin();
    this.floating = this.floating.filter((f) => (f.life -= dt) > 0);
    for (const f of this.floating) {
      f.y -= 40 * dt;
      const t = this.fxTexts.take(f.text, 13, f.color, Math.min(1, f.life / 0.4));
      t.anchor.set(0.5, 1);
      t.position.set(f.x, f.y);
    }
    this.fxTexts.end();
  }

  /** Lo que solo cambia al redimensionar: carriles, líneas de octava, línea de impacto y teclas. */
  private drawStatic(input: SceneInput): void {
    const m = this.metrics!;
    const keys = this.keys;
    const g = this.lanes.clear();
    for (const k of keys) {
      if (!k) continue;
      if (k.black) g.rect(k.x, 0, k.width, m.hitY).fill({ color: 0x000000, alpha: 0.22 });
    }
    for (const k of keys) {
      if (!k || k.black) continue;
      if (k.pitch % 12 === 0) g.rect(Math.round(k.x), 0, 1, m.hitY).fill({ color: C.muted, alpha: 0.2 });
      else if (k.pitch % 12 === 5)
        g.rect(Math.round(k.x), 0, 1, m.hitY).fill({ color: C.muted, alpha: 0.07 });
    }

    // Línea de impacto con un brillo que se difumina hacia arriba.
    const h = this.hitLine.clear();
    for (let i = 0; i < 8; i++) {
      h.rect(0, m.hitY - 16 + i * 2, m.width, 2).fill({ color: C.rh, alpha: 0.02 + i * 0.025 });
    }
    h.rect(0, m.hitY - 2, m.width, 2).fill({ color: C.rh });

    // Etiquetas de octava arriba de cada Do y debajo, en la tecla.
    this.staticText.removeChildren().forEach((c) => c.destroy());
    this.keyText.removeChildren().forEach((c) => c.destroy());
    const naming = input.noteLabels === 'english' ? 'english' : 'latin';
    for (const k of keys) {
      if (!k || k.black || k.pitch % 12 !== 0) continue;
      const label = `${pitchName(k.pitch, naming)}${k.pitch / 12 - 1}`;
      if (k.width >= 10) {
        const top = new BitmapText({ text: label, style: { fontFamily: MONO_FONT, fontSize: 10 } });
        top.tint = C.muted;
        top.alpha = 0.7;
        top.position.set(k.x + 4, 8);
        this.staticText.addChild(top);
      }
      if (k.width >= 12) {
        const size = Math.min(10, k.width * 0.4);
        const onKey = new BitmapText({ text: label, style: { fontFamily: MONO_FONT, fontSize: size } });
        onKey.tint = 0x6b7389;
        onKey.anchor.set(0.5, 1);
        onKey.position.set(k.x + k.width / 2, m.hitY + m.keyboardHeight - 6);
        this.keyText.addChild(onKey);
      }
    }

    // Letra del ordenador que toca cada nota.
    if (input.pcKeyLabels) {
      for (const [pitch, letter] of input.pcKeyLabels) {
        const k = keys[pitch];
        if (!k || k.width < (k.black ? 8 : 11)) continue;
        const size = Math.min(11, k.width * (k.black ? 0.55 : 0.42));
        const t = new BitmapText({ text: letter, style: { fontFamily: LABEL_FONT, fontSize: size } });
        t.anchor.set(0.5, 1);
        if (k.black) {
          t.tint = 0xc6ccda;
          t.position.set(k.x + k.width / 2, m.hitY + m.keyboardHeight * BLACK_KEY_HEIGHT - 8);
        } else {
          t.tint = 0x3d4660;
          t.position.set(k.x + k.width / 2, m.hitY + m.keyboardHeight - (pitch % 12 === 0 ? 20 : 6));
        }
        this.keyText.addChild(t);
      }
    }
  }

  private drawMeasures(input: SceneInput, m: StageMetrics): void {
    const g = this.measureLines.clear();
    input.measures.forEach((t, i) => {
      const y = timeToY(t, input.time, m);
      if (y < 14 || y > m.hitY) return;
      g.rect(0, Math.round(y), m.width, 1).fill({ color: C.fg, alpha: 0.09 });
      const label = this.monoTexts.take(String(i + 1), 10, C.muted, 0.75);
      label.anchor.set(1, 1);
      label.position.set(m.width - 6, y - 3);
    });
    const lb = this.loopBand.clear();
    if (input.loop) {
      const top = Math.max(0, timeToY(input.loop.end, input.time, m));
      const bottom = Math.min(m.hitY, timeToY(input.loop.start, input.time, m));
      if (bottom > top) lb.rect(0, top, m.width, bottom - top).fill({ color: C.lh, alpha: 0.06 });
    }
  }

  private drawNotes(input: SceneInput, m: StageMetrics): void {
    const g = this.notesGfx.clear();
    const dots = this.fingerDots.clear();
    const [from, to] = visibleRange(input.notes, input.time, input.lookahead);
    // Primero las de teclas blancas y luego las negras, que son más estrechas y van encima.
    for (const black of [false, true]) {
      for (let i = from; i < to; i++) {
        const n = input.notes[i]!;
        const key = this.keys[n.pitch];
        if (!key || key.black !== black) continue;
        const r = noteRect(n, input.time, m, this.keys);
        if (!r) continue;
        const status = input.practicing ? input.noteStatus(n) : 'pending';
        // La otra mano (la toca la app) va tenue; acertadas en verde y falladas en rojo.
        const auto = status === 'auto';
        const base = status === 'hit' ? C.ok : status === 'miss' ? C.bad : handColor(n.hand);
        const color = r.clipped && !auto ? lighten(base, 0.35) : base;
        const alpha = auto ? 0.35 : status === 'miss' || status === 'skip' ? 0.5 : 1;
        const radius = Math.min(5, r.width / 3);
        g.roundRect(r.x, r.y, r.width, r.height, radius).fill({ color, alpha });
        if (auto) {
          g.roundRect(r.x, r.y, r.width, r.height, radius).stroke({ color: base, width: 1, alpha: 0.85 });
        } else if (r.height > 6) {
          g.rect(r.x + 2, r.y + 1, r.width - 4, 1.5).fill({ color: 0xffffff, alpha: 0.35 });
        }
        if (black && !auto)
          g.roundRect(r.x, r.y, r.width, r.height, radius).stroke({ color: C.ink, width: 1, alpha: 0.6 });

        if (r.width < 13 || auto) continue;
        if (input.noteLabels !== 'none' && r.height >= 16) {
          const size = Math.max(8, Math.min(12, r.width * 0.42));
          const t = this.noteTexts.take(pitchName(n.pitch, input.noteLabels), size, C.noteText, 0.85);
          t.anchor.set(0.5, 1);
          t.position.set(r.x + r.width / 2, r.y + r.height - 3);
        }
        if (input.showFingers && n.finger && r.height >= 34) {
          const rad = Math.min(8, r.width / 2 - 1);
          const cy = r.y + rad + 3;
          dots.circle(r.x + r.width / 2, cy, rad).fill({ color: C.ink, alpha: 0.55 });
          const t = this.monoTexts.take(String(n.finger), Math.max(8, rad * 1.2), 0xffffff);
          t.anchor.set(0.5, 0.5);
          t.position.set(r.x + r.width / 2, cy + 0.5);
        }
      }
    }
  }

  /** Teclado con las teclas iluminadas; solo se redibuja cuando cambian. */
  private drawKeyboardState(input: SceneInput, m: StageMetrics): void {
    // Las teclas esperadas laten: mientras haya alguna, se redibuja a menudo.
    const pulse = reducedMotion ? 0.55 : 0.4 + 0.3 * Math.sin(performance.now() / 120);
    const parts = [
      [...input.litKeys].map(([p, h]) => p + h).join(),
      [...input.pressedKeys].map((p) => p + (input.keyJudgments.get(p) ?? '')).join(),
      [...input.expectedKeys].map(([p, h]) => p + h).join(),
      input.expectedKeys.size ? String(Math.round(pulse * 20)) : '',
    ];
    const key = parts.join('|');
    if (key === this.keyboardKey) return;
    const pressedColor = (pitch: number) => {
      const j = input.keyJudgments.get(pitch);
      return j === 'ok' ? C.ok : j === 'bad' ? C.bad : C.pressed;
    };
    this.keyboardKey = key;
    const g = this.keyboard.clear();
    const glow = this.keyGlow.clear();
    const y = m.hitY;
    const h = m.keyboardHeight;
    const bh = h * BLACK_KEY_HEIGHT;
    for (const k of this.keys) {
      if (!k || k.black) continue;
      const lit = input.litKeys.get(k.pitch);
      const pressed = input.pressedKeys.has(k.pitch);
      g.roundRect(k.x + 0.5, y, k.width - 1, h - 2, 4).fill({
        color: pressed ? pressedColor(k.pitch) : lit ? lighten(handColor(lit), 0.15) : C.keyWhite,
      });
      const expected = input.expectedKeys.get(k.pitch);
      if (expected && !pressed) {
        g.roundRect(k.x + 0.5, y, k.width - 1, h - 2, 4).fill({ color: handColor(expected), alpha: pulse });
      }
      g.rect(k.x + 0.5, y, k.width - 1, 6).fill({ color: 0x000000, alpha: 0.18 });
      if (!lit && !pressed)
        g.rect(k.x + 0.5, y + h - 8, k.width - 1, 6).fill({ color: C.keyWhiteEdge, alpha: 0.5 });
    }
    for (const k of this.keys) {
      if (!k || !k.black) continue;
      const lit = input.litKeys.get(k.pitch);
      const pressed = input.pressedKeys.has(k.pitch);
      g.roundRect(k.x, y - 1, k.width, bh, 3).fill({
        color: pressed ? pressedColor(k.pitch) : lit ? handColor(lit) : C.keyBlack,
      });
      const expected = input.expectedKeys.get(k.pitch);
      if (expected && !pressed) {
        g.roundRect(k.x + 1, y, k.width - 2, bh - 3, 3).fill({
          color: handColor(expected),
          alpha: pulse + 0.15,
        });
      }
      if (!lit && !pressed) g.rect(k.x + 2, y + bh - 9, k.width - 4, 6).fill({ color: C.keyBlackTop });
    }
    // Brillo sobre la línea encima de cada tecla que suena.
    for (const [pitch, hand] of input.litKeys) {
      const k = this.keys[pitch];
      if (!k) continue;
      for (let i = 0; i < 6; i++) {
        glow.rect(k.x, y - 18 + i * 3, k.width, 3).fill({ color: handColor(hand), alpha: 0.04 + i * 0.05 });
      }
    }
  }
}
