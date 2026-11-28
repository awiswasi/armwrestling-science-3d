// The drawings are only rebuilt when the arm actually moves (increment 0.11): the lift calls
// update() every frame, and building a new tube each time wastes memory on phones.
import { describe, expect, it } from 'vitest';
import { liftGeometry } from './liftGeometry';
import { LiftOverlays } from './overlays';
import type { Vec3 } from './physics';

const setup = { loadLb: 50, momentArmIn: 0.75 };
const at = (wristY: number) => liftGeometry(
  { elbow: [0, 0, 0], wrist: [0, wristY, 0.26] as Vec3, back: [-1, 0, 0], side: '.R' }, setup);
const arc = (o: LiftOverlays) => (o as unknown as { torque: { geometry: object } }).torque.geometry;

describe('overlay updates', () => {
  it('reuses the drawing when nothing moved', () => {
    const o = new LiftOverlays();
    o.update(at(0));
    const first = arc(o);
    o.update(at(0));
    expect(arc(o)).toBe(first);
  });
  it('redraws when the forearm moves', () => {
    const o = new LiftOverlays();
    o.update(at(0));
    const first = arc(o);
    o.update(at(0.05));
    expect(arc(o)).not.toBe(first);
  });
});
