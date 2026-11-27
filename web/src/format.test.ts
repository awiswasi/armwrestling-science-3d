import { describe, expect, it } from 'vitest';
import { fmt } from './format';
import { inlbToLbft, twistTorque } from './physics';

describe('number formatting', () => {
  it('rounds 37.5 in·lb up, as in our notes (≈ 38)', () => {
    expect(fmt(twistTorque(50, 0.75))).toBe('38');
    expect(fmt(twistTorque(50, 0.75), 1)).toBe('37.5');
  });
  it('shows 3.125 lb·ft as 3.13', () => expect(fmt(inlbToLbft(37.5), 2)).toBe('3.13'));
  it('never prints minus zero', () => expect(fmt(-0.0001, 1)).toBe('0.0'));
  it('rounds negatives away from zero', () => expect(fmt(-2.5)).toBe('-3'));
});
