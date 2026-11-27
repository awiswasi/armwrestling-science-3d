// Camera views (increment 0.6). Each view is worked out from where the arm's bones are right now,
// so the buttons still frame the arm after the sliders move it.
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type ViewName = 'start' | 'eyes' | 'fingertips' | 'side';

export const VIEW_LABELS: Record<ViewName, string> = {
  start: 'Start view',
  eyes: 'Your eyes',
  fingertips: 'Fingertips',
  side: 'Side',
};

const UP = new THREE.Vector3(0, 1, 0);

export class Views {
  private anim: { from: THREE.Vector3; to: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3; t0: number; ms: number } | null = null;
  private reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private controls: OrbitControls,
    private bones: Map<string, THREE.Bone>,
    private side: '.R' | '.L',
  ) {}

  private at(base: string) {
    const b = this.bones.get(base + this.side);
    return b ? b.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
  }

  /** Key points of the arm, in world space. */
  private points() {
    const shoulder = this.at('upper_arm');
    const elbow = this.at('forearm');
    const wrist = this.at('hand');
    const knuckle = this.at('middle.01');
    const tip = this.at('middle.03');
    const axis = wrist.clone().sub(elbow).normalize();        // forearm direction, elbow -> wrist
    // Mirror plane is x = 0 through the shoulder: the body is on the other side of it.
    const lateral = new THREE.Vector3(this.side === '.R' ? -1 : 1, 0, 0);
    return { shoulder, elbow, wrist, knuckle, tip, axis, lateral, medial: lateral.clone().negate() };
  }

  /** Distance that fits a sphere of this radius in the narrower view angle. */
  private fit(radius: number) {
    const v = THREE.MathUtils.degToRad(this.camera.fov);
    const h = 2 * Math.atan(Math.tan(v / 2) * this.camera.aspect);
    return radius / Math.sin(Math.min(v, h) / 2);
  }

  /** Where the camera goes for a view: [eye, target]. */
  place(view: ViewName): [THREE.Vector3, THREE.Vector3] {
    const p = this.points();
    // Include the space under the hand where the strap, arrows, labels, loading pin and plate hang
    // (strap 17 cm + pin 24 cm below the hand).
    const below = p.wrist.clone().addScaledVector(UP, -0.43);
    const all = [p.shoulder, p.elbow, p.wrist, p.knuckle, p.tip, below];
    const box = new THREE.Box3().setFromPoints(all).expandByScalar(0.05);
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getBoundingSphere(new THREE.Sphere()).radius;
    const flat = (v: THREE.Vector3) => v.clone().setY(0).normalize();

    switch (view) {
      case 'eyes': {
        // Behind and above your shoulder, a little toward your body, looking down the forearm.
        const back = flat(p.axis).negate();
        // Your eyes sit about a head's width toward your body from the shoulder, so the
        // camera looks past the top of the upper arm, not through it.
        const eye = p.shoulder.clone()
          .addScaledVector(p.medial, 0.26).addScaledVector(UP, 0.30).addScaledVector(back, 0.04);
        const target = p.wrist.clone().lerp(p.knuckle, 0.5);
        return [eye, target];
      }
      case 'fingertips': {
        // In front of the fist, looking straight back along the forearm (like our end-on diagrams).
        const eye = p.tip.clone().addScaledVector(p.axis, 0.42).addScaledVector(UP, 0.03);
        const target = p.elbow.clone().lerp(p.wrist, 0.6);
        return [eye, target];
      }
      case 'side': {
        // Out to the side of the arm, level with it.
        const eye = center.clone().addScaledVector(p.lateral, this.fit(radius) * 1.05).addScaledVector(UP, 0.04);
        return [eye, center];
      }
      case 'start':
      default: {
        const dir = new THREE.Vector3(0.55, 0.35, 0.75).normalize();
        if (this.side === '.L') dir.x = -dir.x;
        return [center.clone().addScaledVector(dir, this.fit(radius) * 0.95), center];
      }
    }
  }

  /** Move the camera to a view, gliding there unless the visitor prefers reduced motion. */
  go(view: ViewName, instant = false) {
    const [eye, target] = this.place(view);
    if (instant || this.reduceMotion) {
      this.anim = null;
      this.camera.position.copy(eye);
      this.controls.target.copy(target);
      this.controls.update();
      return;
    }
    this.anim = {
      from: this.camera.position.clone(), to: eye,
      fromT: this.controls.target.clone(), toT: target,
      t0: performance.now(), ms: 650,
    };
  }

  /** Call once per frame. */
  tick(now: number) {
    if (!this.anim) return;
    const a = this.anim;
    const k = Math.min(1, (now - a.t0) / a.ms);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; // ease in-out
    this.camera.position.lerpVectors(a.from, a.to, e);
    this.controls.target.lerpVectors(a.fromT, a.toT, e);
    if (k >= 1) this.anim = null;
  }

  /** Stop a glide if the visitor grabs the camera. */
  cancel() { this.anim = null; }
}

/** Double-tap (touch) or double-click (mouse) on the canvas. */
export function onDoubleTap(el: HTMLElement, fn: () => void) {
  el.addEventListener('dblclick', fn);
  let last = 0, lx = 0, ly = 0, downX = 0, downY = 0;
  el.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; });
  el.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'touch') return;                 // mice use dblclick
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 10) return; // that was a drag
    const now = performance.now();
    if (now - last < 320 && Math.hypot(e.clientX - lx, e.clientY - ly) < 30) {
      last = 0;
      fn();
    } else {
      last = now; lx = e.clientX; ly = e.clientY;
    }
  });
}
