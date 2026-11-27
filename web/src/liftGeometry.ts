// Where the lift's axis, moment arm and arrows go (increment 0.8). Pure maths on bone positions,
// the same construction as blender/scripts/pronation_lift.py, so the web and Blender drawings agree.
import {
  type Vec3, add, cross, dot, forearmTiltDeg, IN, normalize, pullAcross, scale, sub, twistTorque,
} from './physics';

const UP: Vec3 = [0, 1, 0];
/** Radius and ulna sit this far either side of the rig's forearm bone line (m). */
export const BONE_GAP = 0.011;
/** Arrow length per pound of force (m): 50 lb draws a 12 cm arrow. */
export const ARROW_M_PER_LB = 0.0024;
const MAX_ARROW = 0.30;

export interface LiftSetup {
  loadLb: number;
  momentArmIn: number;
}

export interface LiftInput {
  elbow: Vec3;      // forearm bone head
  wrist: Vec3;      // hand bone head
  back: Vec3;       // back-of-hand direction (the hand bone's +Z), with no forearm turn applied
  side: '.R' | '.L';
}

export interface LiftGeometry {
  /** The pronation axis: radial head (elbow, thumb side) to ulnar head (wrist, pinky side). */
  axisStart: Vec3; axisEnd: Vec3;
  /** Moment arm: from the axis, straight out to the side, to the strap line. */
  armStart: Vec3; armEnd: Vec3;
  /** Strap tension: straight down, beside the strap. */
  tensionStart: Vec3; tensionEnd: Vec3;
  /** The part of the pull that crosses the forearm. */
  pullStart: Vec3; pullEnd: Vec3;
  /** Torque arc around the axis: centre, start direction, turn direction, radius, angles (rad). */
  arc: { center: Vec3; u: Vec3; v: Vec3; radius: number; from: number; to: number };
  /** Where each label sits (increment 0.9), laid out like the Blender labels. */
  labels: { axis: Vec3; momentArm: Vec3; tension: Vec3; pull: Vec3; torque: Vec3 };
  /** Numbers from the physics engine for this pose. */
  tiltDeg: number; pullLb: number; torqueInLb: number;
}

export function liftGeometry({ elbow, wrist, back: backIn, side }: LiftInput, setup: LiftSetup): LiftGeometry {
  const sgn = side === '.L' ? 1 : -1;
  const axisDir = normalize(sub(wrist, elbow));
  const back = normalize(sub(backIn, scale(axisDir, dot(backIn, axisDir))));
  const thumb = scale(normalize(cross(axisDir, back)), sgn);
  const pinky = scale(thumb, -1);
  const flat: Vec3 = [back[0], 0, back[2]];
  const lateral = Math.hypot(flat[0], flat[2]) > 1e-6 ? normalize(flat) : ([1, 0, 0] as Vec3);

  const radialHead = add(elbow, scale(thumb, BONE_GAP));
  const ulnarHead = add(wrist, scale(pinky, BONE_GAP));
  const pax = normalize(sub(ulnarHead, radialHead));
  const onAxis = (p: Vec3) => add(radialHead, scale(pax, dot(sub(p, radialHead), pax)));

  const strapAt = add(wrist, scale(axisDir, 0.03));
  const armStart = onAxis(strapAt);
  const armEnd = add(armStart, scale(lateral, setup.momentArmIn * IN));

  const tiltDeg = forearmTiltDeg(axisDir);
  const pullLb = pullAcross(setup.loadLb, tiltDeg);
  const torqueInLb = twistTorque(setup.loadLb, setup.momentArmIn, tiltDeg);

  const len = (lb: number) => Math.min(MAX_ARROW, Math.max(0.01, lb * ARROW_M_PER_LB));
  const tensionStart = add(armEnd, scale(lateral, 0.035));
  const tensionEnd = add(tensionStart, scale(UP, -len(setup.loadLb)));
  const down: Vec3 = [0, -1, 0];
  const across = sub(down, scale(axisDir, dot(down, axisDir)));
  const pullStart = add(armEnd, scale(lateral, 0.075));
  const pullEnd = Math.hypot(...across) > 1e-6 ? add(pullStart, scale(normalize(across), len(pullLb))) : pullStart;

  const axisEnd = add(ulnarHead, scale(pax, 0.16));
  const arcCenter = onAxis(sub(wrist, scale(axisDir, 0.035)));
  const arcLabelAt = (100 * Math.PI) / 180;
  const arcOut = add(scale(back, Math.cos(arcLabelAt)), scale(thumb, Math.sin(arcLabelAt)));

  return {
    axisStart: sub(radialHead, scale(pax, 0.06)),
    axisEnd,
    armStart, armEnd, tensionStart, tensionEnd, pullStart, pullEnd,
    arc: {
      center: arcCenter,
      u: back, v: thumb, radius: 0.06,
      from: (25 * Math.PI) / 180, to: (150 * Math.PI) / 180,
    },
    labels: {
      axis: add(axisEnd, add(scale(pax, 0.01), scale(UP, 0.02))),
      momentArm: add(armEnd, add(scale(lateral, 0.02), scale(UP, 0.035))),
      // Tension and cross-pull labels are staggered so they never sit on top of each other.
      tension: add(tensionEnd, scale(UP, -0.018)),
      pull: add(pullEnd, scale(UP, -0.065)),
      torque: add(arcCenter, scale(arcOut, 0.06 + 0.03)),
    },
    tiltDeg, pullLb, torqueInLb,
  };
}
