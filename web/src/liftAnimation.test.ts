import { describe, expect, it } from 'vitest';
import { DURATION_S, LAST_FRAME, SHOWN_RISE_IN, exaggeration, liftState, turnFraction } from './liftAnimation';

describe('lift timeline (same keys as the Blender lift)', () => {
  it('holds thumb-up, turns palm-down, holds, lowers, holds', () => {
    expect(turnFraction(1)).toBe(0);
    expect(turnFraction(13)).toBe(0);
    expect(turnFraction(43)).toBe(1);
    expect(turnFraction(61)).toBe(1);
    expect(turnFraction(97)).toBe(0);
    expect(turnFraction(LAST_FRAME)).toBe(0);
  });
  it('is halfway through the turn at the middle of the rise (frame 28)', () => expect(turnFraction(28)).toBeCloseTo(0.5, 9));
  it('eases in and out (slow at the ends of each move)', () => {
    expect(turnFraction(14.5)).toBeLessThan(0.05 / 2 + 0.01);
    expect(turnFraction(41.5)).toBeGreaterThan(0.99 - 0.01);
  });
  it('lasts 4.5 s at 24 frames per second', () => expect(DURATION_S).toBeCloseTo(4.5, 9));
});

describe('plate rise: real vs shown', () => {
  it('real rise at the top is 1.05 in for a 0.75 in moment arm (our notes)', () => {
    expect(liftState(43, 0.75).realRiseIn).toBeCloseTo(1.047, 3);
  });
  it('the drawing rises 2 in at the top, as asked', () => expect(liftState(43, 0.75).shownRiseIn).toBe(SHOWN_RISE_IN));
  it('shown and real stay in the same proportion all the way (about ×1.9)', () => {
    const x = exaggeration(0.75);
    expect(x).toBeCloseTo(1.91, 2);
    for (const f of [5, 20, 28, 35, 50, 70, 90]) {
      const s = liftState(f, 0.75);
      expect(s.shownRiseIn).toBeCloseTo(s.realRiseIn * x, 9);
    }
  });
  it('the hand turns 80° at the top and 40° halfway', () => {
    expect(liftState(43, 0.75).turnDeg).toBeCloseTo(80, 9);
    expect(liftState(28, 0.75).turnDeg).toBeCloseTo(40, 9);
  });
});
