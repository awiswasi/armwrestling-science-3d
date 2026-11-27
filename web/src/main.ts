// Increments 0.4-0.6: the right arm on the stage, rotate / pan / zoom by mouse or touch,
// test sliders that pose it with the same channels as the Blender rig, and camera view buttons.
// Units are metres and +Y is up, the same as the exported arm (.glb).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createScene } from './scene';
import { loadArm, type LoadedArm } from './arm';
import { PoseController } from './pose';
import { buildSliders, rightArmJoints } from './sliders';
import { Views, onDoubleTap, VIEW_LABELS, type ViewName } from './views';
import { liftGeometry, type LiftGeometry, type LiftSetup } from './liftGeometry';
import { LiftOverlays } from './overlays';
import type { Vec3 } from './physics';

/** The lift being shown: your 50 lb plate on a wrapped strap 0.75 in from the axis (our notes). */
const SETUP: LiftSetup = { loadLb: 50, momentArmIn: 0.75 };

// The published claude.ai page serves the model as an uploaded asset; builds elsewhere use the copy in ./models.
const ARM_URL = import.meta.env.VITE_ARM_URL || './models/arm_right.glb';

const stage = document.getElementById('stage') as HTMLDivElement;
const error = document.getElementById('error') as HTMLParagraphElement;
const note = document.getElementById('note') as HTMLParagraphElement;
const panel = document.getElementById('panel') as HTMLElement;
const panelToggle = document.getElementById('panel-toggle') as HTMLButtonElement;
const slidersHost = document.getElementById('sliders') as HTMLDivElement;
const viewBar = document.getElementById('views') as HTMLElement;

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
function testMode(arm: LoadedArm, pose: PoseController, overlay: () => LiftGeometry) {
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
  const g = overlay();
  const toBlender = (p: Vec3) => [p[0] - origin.x, -(p[2] - origin.z), p[1] - origin.y].map((v) => Math.round(v * 10000) / 10000);
  for (const k of ['axisStart', 'axisEnd', 'armStart', 'armEnd', 'tensionStart', 'tensionEnd', 'pullStart', 'pullEnd'] as const) {
    out[k] = toBlender(g[k]);
  }
  out.tilt = [Math.round(g.tiltDeg * 100) / 100];
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

  let views: Views | null = null;
  let current: ViewName = 'start';
  let userMoved = false;
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
      // Aim the key light's shadow at the arm.
      key.target.position.copy(arm.box.getCenter(new THREE.Vector3()));
      scene.add(key.target);
      const pose = new PoseController(arm.bones, arm.skinned);

      // Overlays follow the elbow and shoulder but not the hand's turn: a wrapped strap keeps
      // pulling from the side while the hand turns. So the back-of-hand direction is read once,
      // at the start pose, in the forearm bone's own frame (the forearm bone itself never twists).
      const forearm = arm.bones.get('forearm' + pose.side)!;
      const hand = arm.bones.get('hand' + pose.side)!;
      const fq = () => forearm.getWorldQuaternion(new THREE.Quaternion());
      const backLocal = new THREE.Vector3().setFromMatrixColumn(hand.matrixWorld, 2).normalize()
        .applyQuaternion(fq().invert());
      const overlays = new LiftOverlays();
      scene.add(overlays);
      const geometryNow = (): LiftGeometry => {
        arm.root.updateMatrixWorld(true);
        const e = forearm.getWorldPosition(new THREE.Vector3());
        const w = hand.getWorldPosition(new THREE.Vector3());
        const b = backLocal.clone().applyQuaternion(fq());
        return liftGeometry({ elbow: e.toArray() as Vec3, wrist: w.toArray() as Vec3, back: b.toArray() as Vec3, side: pose.side }, SETUP);
      };
      const refresh = () => overlays.update(geometryNow());
      testMode(arm, pose, geometryNow);
      refresh();
      buildSliders(slidersHost, pose, rightArmJoints(), refresh);
      // Open on wide screens; on phones it starts as a collapsed bar so the arm stays visible.
      const wide = window.matchMedia('(min-width: 601px)').matches;
      panel.dataset.open = String(wide);
      panelToggle.setAttribute('aria-expanded', String(wide));
      panel.hidden = false;
      views = new Views(camera, controls, arm.bones, pose.side);
      const r = arm.box.getBoundingSphere(new THREE.Sphere()).radius;
      controls.minDistance = r * 0.3;
      controls.maxDistance = r * 8;
      const asked = new URLSearchParams(location.search).get('view') as ViewName | null;
      current = asked && asked in VIEW_LABELS ? asked : 'start';
      buildViewBar();
      views.go(current, true);
      onDoubleTap(renderer.domElement, () => { userMoved = false; select('start'); });
      note.textContent = 'Drag to rotate · pinch or scroll to zoom · two fingers or right-drag to pan';
      document.body.dataset.ready = 'arm';
    })
    .catch((e) => {
      console.error(e);
      note.textContent = "Couldn't load the arm model. Try reloading the page.";
      document.body.dataset.ready = 'error';
    });

  function select(view: ViewName) {
    if (!views) return;
    current = view;
    views.go(view);
    for (const b of viewBar.querySelectorAll('button')) {
      b.setAttribute('aria-pressed', String(b.dataset.view === view));
    }
  }

  function buildViewBar() {
    viewBar.innerHTML = '';
    for (const name of ['start', 'eyes', 'fingertips', 'side'] as ViewName[]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.view = name;
      b.textContent = VIEW_LABELS[name];
      b.setAttribute('aria-pressed', String(name === current));
      b.addEventListener('click', () => { userMoved = false; select(name); });
      viewBar.appendChild(b);
    }
    viewBar.hidden = false;
  }

  // Dragging the camera ends any glide and un-highlights the view buttons.
  controls.addEventListener('start', () => {
    userMoved = true;
    views?.cancel();
    for (const b of viewBar.querySelectorAll('button')) b.setAttribute('aria-pressed', 'false');
  });
  // Keep the chosen view framed when the window changes shape, until the visitor moves the camera.
  new ResizeObserver(() => { if (views && !userMoved) views.go(current, true); }).observe(stage);

  renderer.setAnimationLoop((now) => {
    views?.tick(now);
    controls.update();
    renderer.render(scene, camera);
  });
}
