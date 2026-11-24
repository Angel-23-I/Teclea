import { describe, expect, it } from 'vitest';
import { formatTime, measureAt } from './format';

describe('formato', () => {
  it('muestra minutos y segundos', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(75.4)).toBe('1:15');
    expect(formatTime(-1.5)).toBe('0:00');
  });

  it('encuentra el compás actual', () => {
    const m = [0, 2, 4, 6];
    expect(measureAt(m, -1)).toBe(0);
    expect(measureAt(m, 0)).toBe(1);
    expect(measureAt(m, 3.9)).toBe(2);
    expect(measureAt(m, 4)).toBe(3);
    expect(measureAt(m, 100)).toBe(4);
  });
});
