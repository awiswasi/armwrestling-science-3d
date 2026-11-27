// Tests for the physics engine. Every expected value is a hand-worked number from our
// pronation-lift notes (context.md), so a failing test means the app would teach a wrong number.
import { describe, expect, it } from 'vitest';
import {
  DOWN, IN, LB, cross, deg, forearmTiltDeg, inlbToLbft, inlbToNm, jointTorqueFromHangingLoad,
  loadToMatchLevel, momentArm, normalize, plateRise, pullAcross, scale, strapMomentArm,
  strapTension, torqueAboutAxis, twistTorque, type Vec3,
} from './physics';

const close = (got: number, want: number, digits = 2) => expect(got).toBeCloseTo(want, digits);

describe('your start position: 50 lb, wrapped strap 0.75 in from the axis', () => {
  it('level forearm: 37.5 in·lb (≈ 38 in·lb, ≈ 3.1 lb·ft)', () => {
    close(twistTorque(50, 0.75), 37.5);
    close(inlbToLbft(twistTorque(50, 0.75)), 3.125, 3);
  });
  it('the ~10 lb plate from the photo: 7.5 in·lb', () => close(twistTorque(10, 0.75), 7.5));
  it('equals 12.5 lb at a 3 in moment arm', () => close(twistTorque(12.5, 3), twistTorque(50, 0.75)));
  it('in SI: about 4.24 N·m', () => close(inlbToNm(37.5), 4.237, 2));
});

describe('forearm tilt (elbow angle) table, 50 lb at 0.75 in', () => {
  const rows: [number, number, number][] = [
    // tilt°, pull across forearm (lb), torque (in·lb)
    [0, 50, 37.5],
    [15, 48.3, 36.2],
    [30, 43.3, 32.5],
    [45, 35.4, 26.5],
    [60, 25.0, 18.75],
  ];
  for (const [tilt, pull, torque] of rows) {
    it(`${tilt}° up: pull ${pull} lb, torque ${torque} in·lb`, () => {
      close(pullAcross(50, tilt), pull, 1);
      close(twistTorque(50, 0.75, tilt), torque, 1);
    });
  }
  it('30° tilt costs 13%, 60° halves it', () => {
    close(1 - pullAcross(1, 30), 0.134, 3);
    close(pullAcross(1, 60), 0.5, 6);
  });
  it('a vertical forearm gets no twist', () => close(twistTorque(50, 0.75, 90), 0, 6));
  it('to match 50 lb level at 30° tilt you need about 58 lb (57.7)', () => close(loadToMatchLevel(50, 30), 57.735, 2));
});

describe('fixed ring 3 in from the axis, 50 lb, forearm level', () => {
  const rows: [number, number, number][] = [
    // ring angle°, moment arm (in), torque (in·lb)
    [0, 3.0, 150],
    [30, 2.6, 129.9],
    [45, 2.12, 106.1],
    [60, 1.5, 75],
    [90, 0, 0],
  ];
  for (const [angle, arm, torque] of rows) {
    it(`${angle}°: arm ${arm} in, torque ${torque} in·lb`, () => {
      const a = strapMomentArm({ kind: 'ring', offsetIn: 3 }, angle);
      close(a, arm, 1);
      close(twistTorque(50, a), torque, 1);
    });
  }
  it('4.5 in offset gives 225 in·lb, the same as 75 lb at 3 in', () => {
    close(twistTorque(50, 4.5), 225);
    close(twistTorque(75, 3), 225);
  });
});

describe('strap and handle modes', () => {
  it('a wrapped strap keeps the same moment arm at every hand angle', () => {
    for (const a of [0, 20, 45, 80]) close(strapMomentArm({ kind: 'wrapped', halfThicknessIn: 0.75 }, a), 0.75, 6);
  });
  it('a handle keeps its offset', () => close(strapMomentArm({ kind: 'handle', offsetIn: 2 }, 60), 2, 6));
});

describe('moving the weight', () => {
  it('an 80° turn with a 0.75 in arm lifts the plate about 1.05 in', () => close(plateRise(80, 0.75), 1.047, 3));
  it('a quarter turn (90°) lifts it about 1.18 in', () => close(plateRise(90, 0.75), 1.178, 3));
  it('jerking upward at half of g makes 50 lb pull like 75 lb', () => close(strapTension(50, 0.5), 75));
  it('a slow lift pulls exactly the weight', () => close(strapTension(50), 50));
});

describe('the elbow in a hammer curl', () => {
  it('50 lb at 13 in: 650 in·lb ≈ 54 lb·ft', () => {
    close(jointTorqueFromHangingLoad(50, 13), 650);
    close(inlbToLbft(650), 54.17, 2);
  });
});

describe('the core rule τ = (r × F) · â agrees with the simple formula', () => {
  // Build the real geometry: forearm pointing forward (−Z), tilted up by φ about the lateral
  // axis (X); the strap hangs straight down from a point `arm` inches out to the side.
  const geometry = (tiltDeg: number, armIn: number) => {
    const t = deg(tiltDeg);
    const axisDir: Vec3 = [0, Math.sin(t), -Math.cos(t)];
    const lateral: Vec3 = [1, 0, 0];
    const strapPoint = scale(lateral, armIn);
    return { axisDir, strapPoint };
  };
  for (const tilt of [0, 10, 15, 30, 45, 60, 75]) {
    for (const arm of [0.5, 0.75, 1.5, 3]) {
      it(`tilt ${tilt}°, arm ${arm} in`, () => {
        const { axisDir, strapPoint } = geometry(tilt, arm);
        const force = scale(DOWN, 50); // pounds, so torque comes out in in·lb
        const tau = Math.abs(torqueAboutAxis(strapPoint, force, [0, 0, 0], axisDir));
        close(tau, twistTorque(50, arm, tilt), 6);
      });
    }
  }
  it('reports the forearm tilt from the axis direction', () => {
    close(forearmTiltDeg(geometry(30, 1).axisDir), 30, 6);
    close(forearmTiltDeg([0, 0, -1]), 0, 6);
  });
  it('the moment arm of a hanging strap is its sideways distance from a level axis', () => {
    close(momentArm([0.75, 0, 0], DOWN, [0, 0, 0], [0, 0, -1]), 0.75, 6);
  });
  it('a force along the axis has no moment arm and no torque', () => {
    close(momentArm([0.75, 0, 0], [0, 0, -1], [0, 0, 0], [0, 0, -1]), 0, 6);
    close(torqueAboutAxis([0.75, 0, 0], [0, 0, -5], [0, 0, 0], [0, 0, -1]), 0, 6);
  });
  it('SI and imperial agree', () => {
    const { axisDir } = geometry(0, 1);
    const tauSI = torqueAboutAxis([0.75 * IN, 0, 0], scale(DOWN, 50 * LB), [0, 0, 0], axisDir);
    close(Math.abs(tauSI), inlbToNm(37.5), 6);
  });
  it('vector helpers behave', () => {
    expect(cross([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1]);
    close(normalize([3, 0, 4])[2], 0.8, 9);
    expect(() => normalize([0, 0, 0])).toThrow();
  });
});
