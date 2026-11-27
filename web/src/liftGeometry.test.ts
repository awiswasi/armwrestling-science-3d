// Tests for where the lift drawings go. A simple arm in scene coordinates: elbow at the origin,
// forearm forward (+Z, which is Blender's −Y), back of the hand facing out to the side (−X):
// a right arm in the thumb-up start position.
import { describe, expect, it } from 'vitest';
import { ARROW_M_PER_LB, liftGeometry } from './liftGeometry';
import { IN, type Vec3, dot, length, normalize, sub } from './physics';

const setup = { loadLb: 50, momentArmIn: 0.75 };
const arm = (tiltDeg: number) => {
  const t = (tiltDeg * Math.PI) / 180;
  const wrist: Vec3 = [0, 0.26 * Math.sin(t), 0.26 * Math.cos(t)];
  return { elbow: [0, 0, 0] as Vec3, wrist, back: [-1, 0, 0] as Vec3, side: '.R' as const };
};

describe('lift geometry, forearm level', () => {
  const g = liftGeometry(arm(0), setup);
  it('moment arm is 0.75 in, straight out to the side', () => {
    expect(length(sub(g.armEnd, g.armStart))).toBeCloseTo(0.75 * IN, 6);
    const d = normalize(sub(g.armEnd, g.armStart));
    expect(d[0]).toBeCloseTo(-1, 6);
  });
  it('tension arrow points straight down, 2.4 mm per pound', () => {
    const d = sub(g.tensionEnd, g.tensionStart);
    expect(d[1]).toBeCloseTo(-50 * ARROW_M_PER_LB, 6);
    expect(Math.hypot(d[0], d[2])).toBeCloseTo(0, 6);
  });
  it('cross pull equals tension when the forearm is level', () => {
    expect(length(sub(g.pullEnd, g.pullStart))).toBeCloseTo(length(sub(g.tensionEnd, g.tensionStart)), 6);
    expect(g.torqueInLb).toBeCloseTo(37.5, 6);
  });
  it('the axis runs from the thumb side at the elbow to the pinky side at the wrist', () => {
    expect(g.axisStart[1]).toBeGreaterThan(0);   // thumb up at the elbow end
    expect(g.axisEnd[1]).toBeLessThan(0);        // pinky down at the wrist end
  });
});

describe('lift geometry, forearm tilted up 30°', () => {
  const g = liftGeometry(arm(30), setup);
  it('reads the tilt and the physics numbers', () => {
    expect(g.tiltDeg).toBeCloseTo(30, 6);
    expect(g.pullLb).toBeCloseTo(43.3, 1);
    expect(g.torqueInLb).toBeCloseTo(32.48, 2);
  });
  it('cross-pull arrow is shorter and at right angles to the forearm', () => {
    const p = sub(g.pullEnd, g.pullStart);
    expect(length(p)).toBeCloseTo(43.30 * ARROW_M_PER_LB, 4);
    const axis = normalize(sub(arm(30).wrist, arm(30).elbow));
    expect(dot(normalize(p), axis)).toBeCloseTo(0, 6);
  });
});
