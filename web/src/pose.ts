// Pose controller: rotates bones by name using the same numbers Blender shows in a bone's
// Rotation fields (Euler XYZ, degrees, relative to the bone's rest pose).
//
// The .glb stores each bone's *posed* rotation. To pose like Blender we need each bone's
// rest rotation too, which we rebuild from the skin's inverse bind matrices:
//   bone rotation = rest rotation × pose rotation
// Blender's "XYZ" Euler applies X, then Y, then Z; in three.js that is Euler order 'ZYX'.
import * as THREE from 'three';

const DEG = Math.PI / 180;

/** Share of the hand's twist each forearm twist bone takes (see blender/scripts/add_twist_bones.py). */
export const TWIST_SHARES: Record<string, number> = {
  'forearm_twist.01': 0.33,
  'forearm_twist.02': 0.66,
  'forearm_twist.03': 0.95,
};

export type Euler3 = [number, number, number]; // degrees, Blender XYZ

export class PoseController {
  readonly side: '.R' | '.L';
  private rest = new Map<string, THREE.Quaternion>();
  /** The Blender-style values last set on each bone: the source of truth for get(). */
  private values = new Map<string, Euler3>();

  constructor(private bones: Map<string, THREE.Bone>, skinned: THREE.SkinnedMesh) {
    this.side = bones.has('forearm.R') ? '.R' : '.L';
    // Rest pose of every bone in world space: mesh world × inverse(inverse bind matrix).
    skinned.updateMatrixWorld(true);
    const restWorld = new Map<THREE.Bone, THREE.Matrix4>();
    skinned.skeleton.bones.forEach((b, i) => {
      restWorld.set(b, skinned.matrixWorld.clone().multiply(skinned.skeleton.boneInverses[i].clone().invert()));
    });
    const q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    for (const [name, bone] of bones) {
      const world = restWorld.get(bone);
      if (!world) continue;
      const parent = bone.parent as THREE.Object3D | null;
      const parentWorld = parent && restWorld.get(parent as THREE.Bone)
        ? restWorld.get(parent as THREE.Bone)!
        : (parent ? parent.matrixWorld : new THREE.Matrix4());
      parentWorld.clone().invert().multiply(world).decompose(p, q, s);
      this.rest.set(name, q.clone());
    }
  }

  private full(base: string) { return base + this.side; }

  has(base: string) { return this.bones.has(this.full(base)); }

  /** Current Blender-style rotation of a bone, in degrees. */
  get(base: string): Euler3 {
    const name = this.full(base);
    const known = this.values.get(name);
    if (known) return [...known] as Euler3;
    const bone = this.bones.get(name), rest = this.rest.get(name);
    if (!bone || !rest) return [0, 0, 0];
    // First read: recover the exported start pose from the bone's rotation.
    const local = rest.clone().invert().multiply(bone.quaternion);
    const e = new THREE.Euler().setFromQuaternion(local, 'ZYX');
    const v: Euler3 = [e.x / DEG, e.y / DEG, e.z / DEG].map((a) => Math.round(a * 1000) / 1000) as Euler3;
    this.values.set(name, v);
    return [...v] as Euler3;
  }

  /** Set a bone's rotation from Blender-style degrees (X, Y, Z). */
  set(base: string, [x, y, z]: Euler3) {
    const name = this.full(base);
    const bone = this.bones.get(name), rest = this.rest.get(name);
    if (!bone || !rest) return;
    const local = new THREE.Quaternion().setFromEuler(new THREE.Euler(x * DEG, y * DEG, z * DEG, 'ZYX'));
    bone.quaternion.copy(rest).multiply(local);
    this.values.set(name, [x, y, z]);
  }

  /** Turn the hand about the forearm axis (Blender: hand Y) and spread it along the twist bones. */
  setHandTwist(yDeg: number) {
    const [hx, , hz] = this.get('hand');
    this.set('hand', [hx, yDeg, hz]);
    for (const [base, share] of Object.entries(TWIST_SHARES)) {
      if (this.has(base)) this.set(base, [0, yDeg * share, 0]);
    }
  }
}
