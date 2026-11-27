// Physics engine (increment 0.7): every number the app shows comes from here.
//
// Pure maths only, with no three.js and no browser code, so it can be tested on its own and
// checked against hand calculations. Static, rigid-body model: good enough to teach leverage
// correctly; not a medical simulation.
//
// Conventions
// - Vectors are [x, y, z] in metres, +Y up (the same as the 3D scene).
// - Inputs and outputs that people read are in pounds, inches and degrees, because that is how
//   the lifts are loaded and how our notes are written. SI helpers are provided for N·m.

export type Vec3 = readonly [number, number, number];

// ---------------------------------------------------------------- units
export const IN = 0.0254;                 // metres per inch
export const LB = 4.4482216152605;        // newtons per pound-force
export const G = 9.80665;                 // standard gravity, m/s²
export const deg = (d: number) => (d * Math.PI) / 180;
export const toDeg = (r: number) => (r * 180) / Math.PI;
export const inlbToLbft = (t: number) => t / 12;
export const inlbToNm = (t: number) => t * LB * IN;

// ---------------------------------------------------------------- vectors
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a: Vec3): Vec3 => {
  const l = length(a);
  if (l === 0) throw new Error('Cannot normalize a zero vector');
  return scale(a, 1 / l);
};
export const DOWN: Vec3 = [0, -1, 0];

// ---------------------------------------------------------------- the core rule
/**
 * Torque of a force about an axis: τ = (r × F) · â.
 * `point` is where the force acts, `axisPoint` any point on the axis, `axisDir` its direction.
 * Units follow the inputs (metres and newtons give N·m; inches and pounds give in·lb).
 */
export function torqueAboutAxis(point: Vec3, force: Vec3, axisPoint: Vec3, axisDir: Vec3): number {
  const r = sub(point, axisPoint);
  return dot(cross(r, force), normalize(axisDir));
}

/**
 * Perpendicular distance from a line of force to an axis: the moment arm, for a force
 * that is not parallel to the axis. Same units as the inputs.
 */
export function momentArm(point: Vec3, forceDir: Vec3, axisPoint: Vec3, axisDir: Vec3): number {
  const n = cross(normalize(forceDir), normalize(axisDir));
  const s = length(n);
  if (s < 1e-9) return 0; // force parallel to the axis: it cannot twist it
  return Math.abs(dot(sub(point, axisPoint), scale(n, 1 / s)));
}

// ---------------------------------------------------------------- forearm and load
/** Forearm tilt above level, in degrees (+ = hand higher than elbow). */
export function forearmTiltDeg(axisDir: Vec3): number {
  const a = normalize(axisDir);
  return toDeg(Math.asin(Math.max(-1, Math.min(1, a[1]))));
}

/** Part of a hanging load that pulls across the forearm: load × cos(tilt). */
export function pullAcross(loadLb: number, tiltDeg: number): number {
  return loadLb * Math.cos(deg(tiltDeg));
}

/** Strap tension, including the extra pull while the weight is accelerating upward. */
export function strapTension(weightLb: number, accelInG = 0): number {
  return weightLb * (1 + accelInG);
}

/** Pronation (or supination) torque in in·lb: pull across the forearm × moment arm. */
export function twistTorque(loadLb: number, momentArmIn: number, tiltDeg = 0): number {
  return pullAcross(loadLb, tiltDeg) * momentArmIn;
}

/** Load needed at a forearm tilt to give the same twist as `loadLb` with a level forearm. */
export function loadToMatchLevel(loadLb: number, tiltDeg: number): number {
  const c = Math.cos(deg(tiltDeg));
  if (c <= 1e-9) return Infinity;
  return loadLb / c;
}

// ---------------------------------------------------------------- strap and handle modes
export type StrapMode =
  | { kind: 'wrapped'; halfThicknessIn: number }   // strap wound round the hand: roughly constant arm
  | { kind: 'ring'; offsetIn: number }             // fixed pull point: offset × cos(angle)
  | { kind: 'handle'; offsetIn: number };          // handle or lever sticking out: its offset

/**
 * Moment arm in inches for a strap mode at a hand angle.
 * For a ring, `angleDeg` is how far the ring has turned away from level with the axis
 * (0 = level, the longest arm; 90 = straight under the axis, no arm).
 */
export function strapMomentArm(mode: StrapMode, angleDeg = 0): number {
  switch (mode.kind) {
    case 'wrapped': return mode.halfThicknessIn;
    case 'ring': return Math.max(0, mode.offsetIn * Math.cos(deg(angleDeg)));
    case 'handle': return mode.offsetIn;
  }
}

/** How far the plate rises when a wrapped strap winds onto the hand (a winch): angle × arm. */
export function plateRise(turnDeg: number, momentArmIn: number): number {
  return deg(turnDeg) * momentArmIn;
}

// ---------------------------------------------------------------- other joints
/** Torque at a joint from a hanging load: load × horizontal distance from the joint. */
export function jointTorqueFromHangingLoad(loadLb: number, horizontalDistanceIn: number): number {
  return loadLb * horizontalDistanceIn;
}
