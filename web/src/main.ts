// Increments 0.4-0.5: the right arm on the stage, rotate / pan / zoom by mouse or touch,
// and test sliders that pose it with the same channels as the Blender rig.
// Units are metres and +Y is up, the same as the exported arm (.glb).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createScene } from './scene';
import { loadArm, type LoadedArm } from './arm';
import { PoseController } from './pose';
import { buildSliders, rightArmJoints } from './sliders';

// The published claude.ai page serves the model as an uploaded asset; builds elsewhere use the copy in ./models.
const ARM_URL = import.meta.env.VITE_ARM_URL || './models/arm_right.glb';

const stage = document.getElementById('stage') as HTMLDivElement;
const error = document.getElementById('error') as HTMLParagraphElement;
const note = document.getElementById('note') as HTMLParagraphElement;
const panel = document.getElementById('panel') as HTMLElement;
const panelToggle = document.getElementById('panel-toggle') as HTMLButtonElement;
const slidersHost = document.getElementById('sliders') as HTMLDivElement;

panelToggle.addEventListener('click', () => {
  const open = panel.dataset.open !== 'true';
  panel.dataset.open = String(open);
  panelToggle.setAttribute('aria-expanded', String(open));
});

/**
 * Test mode for automated checks: ?pose=raise,swing,turn,elbow,pronation (degrees) applies a pose
 * and writes key bone positions, in Blender's coordinates relative to the elbow, to
 * <body data-debug>. Ordinary visitors never see it.
 */
function testMode(arm: LoadedArm, pose: PoseController) {
  const q = new URLSearchParams(location.search).get('pose');
  if (!q) return;
  const [raise, swing, turn, elbow, pron] = q.split(',').map(Number);
  pose.set('upper_arm', [raise, swing, turn]);
  pose.set('forearm', [0, 0, elbow]);
  pose.setHandTwist(-pron);
  arm.root.updateMatrixWorld(true);
  const s = pose.side;
  const origin = arm.bones.get('forearm' + s)!.getWorldPosition(new THREE.Vector3());
  const out: Record<string, number[]> = {};
  for (const n of ['hand', 'index.01', 'index.03', 'thumb.03', 'pinky.01']) {
    const b = arm.bones.get(n + s);
    if (!b) continue;
    const w = b.getWorldPosition(new THREE.Vector3()).sub(origin);
    out[n] = [w.x, -w.z, w.y].map((v) => Math.round(v * 10000) / 10000); // three (x,y,z) -> Blender (x,-z,y)
  }
  out.start_upper_arm = pose.get('upper_arm');
  document.body.dataset.debug = JSON.stringify(out);
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function frame(camera: THREE.PerspectiveCamera, controls: OrbitControls, box: THREE.Box3) {
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3()).length();
  // Distance that fits the box in the narrower of the two view angles.
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const dist = (size / 2) / Math.sin(Math.min(vFov, hFov) / 2) * 0.9;
  const dir = new THREE.Vector3(0.55, 0.35, 0.75).normalize();
  camera.position.copy(center).addScaledVector(dir, dist);
  controls.target.copy(center);
  controls.minDistance = dist * 0.25;
  controls.maxDistance = dist * 3;
  controls.update();
}

if (!webglAvailable()) {
  error.hidden = false;
} else {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  stage.appendChild(renderer.domElement);

  const { scene, camera, key } = createScene();

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.88; // a little below table height, never under the floor
  controls.target.set(0, 0.6, 0);

  let armBox: THREE.Box3 | null = null;
  const resize = () => {
    const w = stage.clientWidth || window.innerWidth;
    const h = stage.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(stage);
  resize();

  note.textContent = 'Loading the arm…';
  loadArm(ARM_URL, scene, (f) => {
    note.textContent = `Loading the arm… ${Math.round(f * 100)}%`;
  })
    .then((arm) => {
      armBox = arm.box;
      // Aim the key light's shadow at the arm.
      key.target.position.copy(arm.box.getCenter(new THREE.Vector3()));
      scene.add(key.target);
      const pose = new PoseController(arm.bones, arm.skinned);
      testMode(arm, pose);
      buildSliders(slidersHost, pose, rightArmJoints(), () => {});
      // Open on wide screens; on phones it starts as a collapsed bar so the arm stays visible.
      const wide = window.matchMedia('(min-width: 601px)').matches;
      panel.dataset.open = String(wide);
      panelToggle.setAttribute('aria-expanded', String(wide));
      panel.hidden = false;
      frame(camera, controls, arm.box);
      note.textContent = 'Drag to rotate · pinch or scroll to zoom · two fingers or right-drag to pan';
      document.body.dataset.ready = 'arm';
    })
    .catch((e) => {
      console.error(e);
      note.textContent = "Couldn't load the arm model. Try reloading the page.";
      document.body.dataset.ready = 'error';
    });

  // Re-frame on window shape changes only until the user moves the camera themselves.
  let userMoved = false;
  controls.addEventListener('start', () => { userMoved = true; });
  new ResizeObserver(() => { if (armBox && !userMoved) frame(camera, controls, armBox); }).observe(stage);

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });
}
