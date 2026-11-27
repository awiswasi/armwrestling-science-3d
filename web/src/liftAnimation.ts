// The pronation lift's timeline (increment 0.10). Same keys as blender/scripts/pronation_lift.py:
// hold, turn palm-down, hold at the top, lower slowly, hold. Blender eases each segment with flat
// Bezier handles, which is exactly smoothstep, so the two play the same curve.
import { plateRise } from './physics';

export const FPS = 24;
/** (frame, fraction of the turn) */
export const KEYS: readonly (readonly [number, number])[] = [
  [1, 0], [13, 0], [43, 1], [61, 1], [97, 0], [109, 0],
];
export const FIRST_FRAME = KEYS[0][0];
export const LAST_FRAME = KEYS[KEYS.length - 1][0];
export const DURATION_S = (LAST_FRAME - FIRST_FRAME) / FPS;

/** Thumb-up to palm-down: a normal pronation range. */
export const TURN_DEG = 80;
/**
 * How far the plate is drawn rising at the top of the lift. The real rise for the user's setup
 * (0.75 in moment arm) is about 1.05 in; the drawing is scaled up so the motion is easy to see.
 * Every number shown stays the real one.
 */
export const SHOWN_RISE_IN = 2.0;

const smoothstep = (x: number) => x * x * (3 - 2 * x);

/** Fraction of the full turn at a frame (0 = thumb up, 1 = palm down). */
export function turnFraction(frame: number): number {
  if (frame <= KEYS[0][0]) return KEYS[0][1];
  for (let i = 1; i < KEYS.length; i++) {
    const [f0, v0] = KEYS[i - 1], [f1, v1] = KEYS[i];
    if (frame <= f1) return v0 + (v1 - v0) * smoothstep((frame - f0) / (f1 - f0));
  }
  return KEYS[KEYS.length - 1][1];
}

export interface LiftState {
  frame: number;
  turnDeg: number;       // how far the hand has turned palm-down
  realRiseIn: number;    // physics: turn angle x moment arm
  shownRiseIn: number;   // what the drawing uses
}

export function liftState(frame: number, momentArmIn: number): LiftState {
  const k = turnFraction(frame);
  return {
    frame,
    turnDeg: TURN_DEG * k,
    realRiseIn: plateRise(TURN_DEG * k, momentArmIn),
    shownRiseIn: SHOWN_RISE_IN * k,
  };
}

/** How much bigger the drawn rise is than the real one (about 1.9 for a 0.75 in arm). */
export const exaggeration = (momentArmIn: number) => SHOWN_RISE_IN / plateRise(TURN_DEG, momentArmIn);
