// Loads the exported arm (.glb) and places it on the stage.
// The model comes from Blender with its fist + thumb-up start pose already set on the bones.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/** Height of the elbow above the floor, in metres: about table height. */
export const ELBOW_HEIGHT = 0.72;

export interface LoadedArm {
  root: THREE.Object3D;
  skinned: THREE.SkinnedMesh;
  bones: Map<string, THREE.Bone>;
  /** World-space box around the posed arm, for framing the camera. */
  box: THREE.Box3;
}

export async function loadArm(
  url: string,
  scene: THREE.Scene,
  onProgress?: (fraction: number) => void,
): Promise<LoadedArm> {
  // The web model is Meshopt-compressed (web/scripts/compress-models.mjs); this decodes it.
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url, (e) => {
    if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
  });
  const root = gltf.scene;
  root.name = 'arm';

  let skinned: THREE.SkinnedMesh | undefined;
  const bones = new Map<string, THREE.Bone>();
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) {
      skinned = o as THREE.SkinnedMesh;
      skinned.castShadow = true;
      skinned.receiveShadow = true;
      // The rest pose (straight arm) differs from the posed arm, so the precomputed bounds
      // are wrong; never cull it.
      skinned.frustumCulled = false;
    }
    // three.js strips '.' from node names ("forearm.R" -> "forearmR"); key bones by the
    // original Blender name, which GLTFLoader keeps in userData.name.
    if ((o as THREE.Bone).isBone) bones.set((o.userData.name as string) || o.name, o as THREE.Bone);
    // Blender's glTF exporter adds an icosphere as the bones' display shape; hide it.
    if ((o as THREE.Mesh).isMesh && !(o as THREE.SkinnedMesh).isSkinnedMesh) o.visible = false;
  });
  if (!skinned) throw new Error('No skinned arm mesh found in ' + url);

  scene.add(root);

  // Lift the model so the elbow sits at table height. Blender put it near the floor.
  const elbow = bones.get('forearm.R') ?? bones.get('forearm.L');
  if (!elbow) throw new Error('No forearm bone found in ' + url);
  root.updateMatrixWorld(true);
  {
    const p = elbow.getWorldPosition(new THREE.Vector3());
    root.position.y += ELBOW_HEIGHT - p.y;
  }
  root.updateMatrixWorld(true);

  // Box around the posed skin (computed from the deformed vertices, not the rest pose).
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  const pos = skinned.geometry.attributes.position;
  for (let i = 0; i < pos.count; i += 7) {
    skinned.getVertexPosition(i, v);
    box.expandByPoint(v.applyMatrix4(skinned.matrixWorld));
  }

  return { root, skinned, bones, box };
}
