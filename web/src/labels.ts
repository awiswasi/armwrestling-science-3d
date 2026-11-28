// Labels next to the lift drawings, and the live readout card (increment 0.9).
// Labels are HTML, placed in 3D with three's CSS2DRenderer: sharp text at any zoom, readable by
// screen readers, and never in the way of dragging (pointer-events: none).
import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { LiftGeometry, LiftSetup } from './liftGeometry';
import { OVERLAY_COLORS } from './overlays';
import { inlbToLbft, type Vec3 } from './physics';

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
import { fmt } from './format';

export function createLabelRenderer(stage: HTMLElement) {
  const r = new CSS2DRenderer();
  r.domElement.className = 'labels-layer';
  stage.appendChild(r.domElement);
  return r;
}

type Key = keyof LiftGeometry['labels'];

export class LiftLabels extends THREE.Group {
  private items = new Map<Key, { obj: CSS2DObject; text: HTMLSpanElement }>();

  constructor() {
    super();
    const colors: Record<Key, number> = {
      axis: OVERLAY_COLORS.axis, momentArm: OVERLAY_COLORS.momentArm, tension: OVERLAY_COLORS.tension,
      pull: OVERLAY_COLORS.pull, torque: OVERLAY_COLORS.torque,
    };
    for (const key of Object.keys(colors) as Key[]) {
      const el = document.createElement('div');
      el.className = 'tag';
      el.dataset.key = key;
      const dot = document.createElement('i');
      dot.style.background = hex(colors[key]);
      const text = document.createElement('span');
      el.append(dot, text);
      const obj = new CSS2DObject(el);
      this.items.set(key, { obj, text });
      this.add(obj);
    }
  }

  update(g: LiftGeometry, setup: LiftSetup) {
    const words: Record<Key, string> = {
      axis: 'Twist axis',
      momentArm: `Moment arm ${setup.momentArmIn.toFixed(2)} in`,
      tension: `Tension ${fmt(setup.loadLb)} lb`,
      pull: `Pull across forearm ${fmt(g.pullLb)} lb`,
      torque: `Torque ${fmt(g.torqueInLb, 1)} in·lb`,
    };
    for (const [key, { obj, text }] of this.items) {
      const p: Vec3 = g.labels[key];
      obj.position.set(p[0], p[1], p[2]);
      text.textContent = words[key];
    }
  }

  setVisible(v: boolean) {
    for (const { obj } of this.items.values()) obj.visible = v;
  }
}

export interface Readout {
  elbowDeg: number;
  geometry: LiftGeometry;
  setup: LiftSetup;
  /** How far the hand has turned palm-down (degrees). */
  turnDeg: number;
  /** Real plate rise for that turn (inches) and how much bigger the drawing shows it. */
  realRiseIn: number;
  exaggeration: number;
}

/** The live numbers card. Every value is read from the physics engine's result for this pose. */
export function renderReadout(host: HTMLElement, { elbowDeg, geometry: g, setup, turnDeg, realRiseIn, exaggeration }: Readout) {
  const tilt = Math.abs(g.tiltDeg) < 0.5 ? 'level' : g.tiltDeg > 0 ? 'up' : 'down';
  const rows: [string, string][] = [
    ['Elbow angle', `${fmt(elbowDeg)}°`],
    ['Forearm tilt', `${fmt(Math.abs(g.tiltDeg))}° ${tilt}`],
    ['Load (strap tension)', `${fmt(setup.loadLb)} lb`],
    ['Pull across forearm', `${fmt(g.pullLb, 1)} lb`],
    ['Moment arm', `${setup.momentArmIn.toFixed(2)} in`],
    ['Pronation torque', `${fmt(g.torqueInLb, 1)} in·lb`],
    ['', `${fmt(inlbToLbft(g.torqueInLb), 2)} lb·ft`],
    ['Hand turned', `${fmt(turnDeg)}° palm-down`],
    ['Plate lifted', `${fmt(realRiseIn, 2)} in`],
  ];
  host.replaceChildren(
    ...rows.map(([k, v]) => {
      const row = document.createElement('div');
      row.className = k ? 'rd-row' : 'rd-row rd-sub';
      const a = document.createElement('span');
      a.textContent = k;
      const b = document.createElement('b');
      b.textContent = v;
      row.append(a, b);
      return row;
    }),
  );
  const note = document.createElement('p');
  note.className = 'rd-note';
  note.textContent = `Plate motion drawn ×${fmt(exaggeration, 1)} so it's easy to see.`;
  host.appendChild(note);
  host.dataset.torque = g.torqueInLb.toFixed(2);
}
