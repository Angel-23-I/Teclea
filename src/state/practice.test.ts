import { beforeEach, describe, expect, it } from 'vitest';
import { usePracticeSettings } from './practice';

describe('mejores marcas', () => {
  beforeEach(() => usePracticeSettings.setState({ best: {} }));

  it('la primera vez guarda la marca pero no la anuncia como récord', () => {
    const { recordBest } = usePracticeSettings.getState();
    expect(recordBest('elisa|wait|right', 40)).toBe(false);
    expect(usePracticeSettings.getState().best['elisa|wait|right']).toBe(40);
  });

  it('anuncia récord solo al superar la marca anterior', () => {
    const { recordBest } = usePracticeSettings.getState();
    recordBest('elisa|wait|right', 80);
    expect(recordBest('elisa|wait|right', 75)).toBe(false);
    expect(recordBest('elisa|wait|right', 92)).toBe(true);
    expect(usePracticeSettings.getState().best['elisa|wait|right']).toBe(92);
  });
});
