// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { InputHub } from './hub';
import { parseMidiMessage } from './midi';
import { PcKeyboardProvider, pcKeyLabels, pcKeyMap } from './pcKeyboard';
import { PointerProvider } from './pointer';
import type { NoteEvent } from './types';

describe('teclado del ordenador', () => {
  it('Z es Do3 y Q es Do4 con la octava por defecto', () => {
    const map = pcKeyMap(0);
    expect(map.get('KeyZ')).toBe(48);
    expect(map.get('KeyS')).toBe(49);
    expect(map.get('KeyQ')).toBe(60);
    expect(map.get('KeyP')).toBe(76); // Mi5
  });

  it('sube y baja de octava sin salirse del teclado de 61 teclas', () => {
    expect(pcKeyMap(-1).get('KeyZ')).toBe(36);
    expect(pcKeyMap(2).get('KeyZ')).toBe(72);
    expect(pcKeyMap(2).get('KeyP')).toBeUndefined(); // 100 > Do7
  });

  it('etiqueta cada nota con la tecla que hay que pulsar', () => {
    const labels = pcKeyLabels(0);
    expect(labels.get(48)).toBe('Z');
    expect(labels.get(60)).toBe('Q'); // la coma también da Do4, gana la fila superior
    expect(labels.get(61)).toBe('2');
  });

  it('emite notas al pulsar y soltar, sin repeticiones', async () => {
    const pc = new PcKeyboardProvider();
    const events: string[] = [];
    pc.subscribe((e) => events.push(`${e.type}${e.pitch}`));
    await pc.start();
    const key = (type: string, code: string, repeat = false) =>
      window.dispatchEvent(new KeyboardEvent(type, { code, repeat }));
    key('keydown', 'KeyQ');
    key('keydown', 'KeyQ', true);
    key('keyup', 'KeyQ');
    key('keydown', 'KeyA'); // no es una nota
    pc.setOctave(1);
    key('keydown', 'KeyQ');
    pc.stop(); // suelta lo pulsado
    expect(events).toEqual(['on60', 'off60', 'on72', 'off72']);
  });
});

describe('MIDI', () => {
  it('interpreta Note On y Note Off', () => {
    expect(parseMidiMessage([0x90, 60, 127])).toEqual({ type: 'on', pitch: 60, velocity: 1, channel: 0 });
    expect(parseMidiMessage([0x93, 64, 0])).toEqual({ type: 'off', pitch: 64, velocity: 0, channel: 3 });
    expect(parseMidiMessage([0x80, 64, 40])).toMatchObject({ type: 'off', pitch: 64 });
    expect(parseMidiMessage([0xb0, 64, 127])).toBeNull(); // pedal de sustain
    expect(parseMidiMessage([0xf8])).toBeNull(); // reloj
  });
});

describe('InputHub', () => {
  const ev = (type: 'on' | 'off', pitch: number, source: NoteEvent['source']): NoteEvent => ({
    type,
    pitch,
    velocity: 1,
    time: 0,
    source,
  });

  it('una nota pulsada por dos fuentes se suelta cuando la sueltan las dos', () => {
    const hub = new InputHub();
    const out: string[] = [];
    hub.subscribe((e) => out.push(`${e.type}${e.pitch}`));
    hub.handle(ev('on', 60, 'pc-keyboard'));
    hub.handle(ev('on', 60, 'midi'));
    hub.handle(ev('off', 60, 'pc-keyboard'));
    expect([...hub.pressed()]).toEqual([60]);
    hub.handle(ev('off', 60, 'midi'));
    expect(out).toEqual(['on60', 'off60']);
    expect(hub.pressed().size).toBe(0);
  });

  it('al quitar una fuente suelta sus notas', () => {
    const hub = new InputHub();
    const pointer = new PointerProvider();
    hub.add(pointer);
    pointer.move(1, 64);
    expect([...hub.pressed()]).toEqual([64]);
    hub.remove('pointer');
    expect(hub.pressed().size).toBe(0);
  });

  it('el puntero hace glissando al arrastrar', () => {
    const p = new PointerProvider();
    const out: string[] = [];
    p.subscribe((e) => out.push(`${e.type}${e.pitch}`));
    p.move(1, 60);
    p.move(1, 62);
    p.move(1, 62);
    p.release(1);
    expect(out).toEqual(['on60', 'off60', 'on62', 'off62']);
  });
});
