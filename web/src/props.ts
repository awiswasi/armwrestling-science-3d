// Strap, loading pin and plate (increment 0.10), sized like the Blender props:
// strap 38 mm wide and 17 cm long, a 24 cm loading pin, and a 23 cm plate near its bottom.
import * as THREE from 'three';
import type { LiftGeometry } from './liftGeometry';
import { IN } from './physics';

const STRAP_LEN = 0.17;
const STRAP_WIDTH = 0.038;
const PIN_LEN = 0.24;
const PLATE_R = 0.115;
const PLATE_T = 0.026;

const strapMat = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.9, side: THREE.DoubleSide });
// Low metalness: the scene has no reflections, so strongly metallic surfaces would render nearly black.
const pinMat = new THREE.MeshStandardMaterial({ color: 0xb4bac0, roughness: 0.4, metalness: 0.15 });
const plateMat = new THREE.MeshStandardMaterial({ color: 0x6b7178, roughness: 0.55, metalness: 0.1 });

/** A flat strap loop round the hand: a ribbon on a rounded-rectangle path in the loop's x/z plane. */
function loopGeometry(halfThick: number, halfWidth: number, width: number) {
  const segs = 64;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = (2 * Math.PI * i) / segs;
    const c = Math.cos(t), s = Math.sin(t);
    const x = halfThick * Math.sign(c) * Math.abs(c) ** 0.6 * 1.06;
    const z = halfWidth * Math.sign(s) * Math.abs(s) ** 0.6 * 1.03;
    pos.push(x, -width / 2, z, x, width / 2, z);
    if (i < segs) {
      const a = 2 * i;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class LiftProps extends THREE.Group {
  private loop: THREE.Mesh | null = null;
  private strap: THREE.Mesh;
  private pin: THREE.Mesh;
  private plate: THREE.Mesh;
  private top = new THREE.Vector3();

  constructor() {
    super();
    this.name = 'lift-props';
    // Strap: unit-height box hanging down from its top edge, so scaling Y shortens it from below.
    const sg = new THREE.BoxGeometry(0.003, 1, STRAP_WIDTH);
    sg.translate(0, -0.5, 0);
    this.strap = new THREE.Mesh(sg, strapMat);
    this.pin = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, PIN_LEN, 32), pinMat);
    this.plate = new THREE.Mesh(new THREE.CylinderGeometry(PLATE_R, PLATE_R, PLATE_T, 64), plateMat);
    this.plate.position.y = -PIN_LEN / 2 + 0.035;
    this.pin.add(this.plate);
    for (const m of [this.strap, this.pin, this.plate]) { m.castShadow = true; m.receiveShadow = true; }
    this.add(this.strap, this.pin);
  }

  /**
   * Put the strap loop on the hand (once, at the start pose). It is attached to the hand bone,
   * so it turns with the hand.
   */
  attachLoop(g: LiftGeometry, hand: THREE.Bone) {
    if (this.loop) this.loop.removeFromParent();
    const { center, x, y, z, halfThick, halfWidth } = g.loop;
    const m = new THREE.Mesh(loopGeometry(halfThick, halfWidth, STRAP_WIDTH), strapMat);
    m.castShadow = true;
    const basis = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(...x), new THREE.Vector3(...y), new THREE.Vector3(...z));
    m.quaternion.setFromRotationMatrix(basis);
    m.position.set(...center);
    this.add(m);
    m.updateMatrixWorld(true);
    hand.attach(m);           // keep its place in the world, now riding on the hand
    this.loop = m;
  }

  /** Place the strap, pin and plate for this pose, with the plate raised `riseIn` inches. */
  update(g: LiftGeometry, riseIn: number) {
    const rise = riseIn * IN;
    this.top.set(...g.strapTop);
    // The strap winds onto the hand, so its top stays put and its length shrinks by the rise.
    const len = Math.max(0.01, STRAP_LEN - rise);
    this.strap.position.copy(this.top);
    this.strap.scale.set(1, len, 1);
    // Face the strap's flat side along the forearm, like the loop.
    const along = new THREE.Vector3(...g.loop.y).setY(0);
    if (along.lengthSq() > 1e-8) this.strap.rotation.set(0, Math.atan2(along.x, along.z), 0);
    this.pin.position.set(this.top.x, this.top.y - len - PIN_LEN / 2, this.top.z);
  }

  /** Height of the pin's top above its start position (m), for tests. */
  pinTop() { return this.pin.position.y + PIN_LEN / 2; }
}
