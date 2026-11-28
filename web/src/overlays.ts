// Draws the lift's axis, moment arm and force arrows (increment 0.8). No text yet: labels are 0.9.
// Colours match the Blender model: purple axis, amber moment arm, red tension, orange cross pull,
// teal torque. Drawn on top of the skin so they stay visible from any side.
import * as THREE from 'three';
import type { LiftGeometry } from './liftGeometry';
import type { Vec3 } from './physics';

export const OVERLAY_COLORS = {
  axis: 0x7b6fe0,
  momentArm: 0xf2bf1a,
  tension: 0xe0412f,
  pull: 0xf2782a,
  torque: 0x1fb58a,
};

const v3 = (p: Vec3) => new THREE.Vector3(p[0], p[1], p[2]);

function material(color: number) {
  return new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true, opacity: 0.95 });
}

/** A unit cylinder along +Y, placed between two points by scale and rotation. */
class Rod extends THREE.Mesh {
  constructor(radius: number, mat: THREE.Material) {
    super(new THREE.CylinderGeometry(radius, radius, 1, 16), mat);
    this.renderOrder = 10;
  }
  between(a: THREE.Vector3, b: THREE.Vector3) {
    const d = b.clone().sub(a);
    const len = d.length();
    this.visible = len > 1e-5;
    if (!this.visible) return;
    this.position.copy(a).addScaledVector(d, 0.5);
    this.scale.set(1, len, 1);
    this.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  }
}

class Arrow extends THREE.Group {
  private shaft: Rod;
  private head: THREE.Mesh;
  constructor(color: number, radius = 0.0022) {
    super();
    const m = material(color);
    this.shaft = new Rod(radius, m);
    this.head = new THREE.Mesh(new THREE.ConeGeometry(radius * 2.8, 1, 16), m);
    this.head.renderOrder = 10;
    this.add(this.shaft, this.head);
  }
  between(a: THREE.Vector3, b: THREE.Vector3) {
    const d = b.clone().sub(a);
    const len = d.length();
    this.visible = len > 1e-4;
    if (!this.visible) return;
    const headLen = Math.min(0.022, len * 0.45);
    const neck = b.clone().addScaledVector(d.clone().normalize(), -headLen);
    this.shaft.between(a, neck);
    this.head.position.copy(neck).addScaledVector(d.clone().normalize(), headLen / 2);
    this.head.scale.set(1, headLen, 1);
    this.head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  }
}

export class LiftOverlays extends THREE.Group {
  private axis = new Rod(0.0022, material(OVERLAY_COLORS.axis));
  private arm = new Rod(0.0018, material(OVERLAY_COLORS.momentArm));
  private armDot = new THREE.Mesh(new THREE.SphereGeometry(0.004, 16, 10), material(OVERLAY_COLORS.momentArm));
  private tension = new Arrow(OVERLAY_COLORS.tension);
  private pull = new Arrow(OVERLAY_COLORS.pull);
  private torque = new THREE.Mesh(new THREE.BufferGeometry(), material(OVERLAY_COLORS.torque));
  private torqueHead = new THREE.Mesh(new THREE.ConeGeometry(0.0022 * 2.8, 0.022, 16), material(OVERLAY_COLORS.torque));

  constructor() {
    super();
    this.name = 'lift-overlays';
    for (const o of [this.armDot, this.torque, this.torqueHead]) o.renderOrder = 10;
    this.add(this.axis, this.arm, this.armDot, this.tension, this.pull, this.torque, this.torqueHead);
  }

  private lastKey = '';

  update(g: LiftGeometry) {
    // Skip the work (and the new tube geometry) when nothing that shapes the drawing has moved,
    // for example while the lift plays: the drawing follows the elbow, not the hand's turn.
    const key = [g.axisStart, g.axisEnd, g.armEnd, g.pullEnd, g.tensionEnd].flat().map((v) => v.toFixed(5)).join(',');
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.axis.between(v3(g.axisStart), v3(g.axisEnd));
    this.arm.between(v3(g.armStart), v3(g.armEnd));
    this.armDot.position.copy(v3(g.armStart));
    this.tension.between(v3(g.tensionStart), v3(g.tensionEnd));
    this.pull.between(v3(g.pullStart), v3(g.pullEnd));

    // Torque arc: a tube along the circle around the axis, with a cone at its end.
    const { center, u, v, radius, from, to } = g.arc;
    const c = v3(center), U = v3(u), V = v3(v);
    const at = (t: number) => c.clone().addScaledVector(U, Math.cos(t) * radius).addScaledVector(V, Math.sin(t) * radius);
    const headAng = 0.022 / radius;
    const pts = Array.from({ length: 25 }, (_, i) => at(from + ((to - headAng - from) * i) / 24));
    this.torque.geometry.dispose();
    this.torque.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.0022, 10, false);
    const tip = at(to), neck = pts[pts.length - 1];
    const dir = tip.clone().sub(neck).normalize();
    this.torqueHead.position.copy(neck).addScaledVector(dir, 0.011);
    this.torqueHead.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  }
}
