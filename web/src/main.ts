// The right arm on the stage (0.4), pose sliders (0.5), camera views (0.6), physics overlays and
// numbers (0.7-0.9), the pronation lift (0.10). 0.11: compressed model and render-on-demand.
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
import { createLabelRenderer, LiftLabels, renderReadout } from './labels';
import { LiftProps } from './props';
import { FIRST_FRAME, FPS, LAST_FRAME, SHOWN_RISE_IN, TURN_DEG, exaggeration, liftState } from './liftAnimation';
import { plateRise } from './physics';
import type { Vec3 } from './physics';

/** The lift being shown: your 50 lb plate on a wrapped strap 0.75 in from the axis (our notes). */
const SETUP: LiftSetup = { loadLb: 50, momentArmIn: 0.75 };

// The published claude.ai page serves the model as an uploaded asset; builds elsewhere use the copy in ./models.
const ARM_URL = import.meta.env.VITE_ARM_URL || './models/arm_right.min.glb';

const stage = document.getElementById('stage') as HTMLDivElement;
const error = document.getElementById('error') as HTMLParagraphElement;
const note = document.getElementById('note') as HTMLParagraphElement;
const panel = document.getElementById('panel') as HTMLElement;
const panelToggle = document.getElementById('panel-toggle') as HTMLButtonElement;
const slidersHost = document.getElementById('sliders') as HTMLDivElement;
const viewBar = document.getElementById('views') as HTMLElement;
const readoutCard = document.getElementById('readout') as HTMLElement;
const readoutBody = document.getElementById('readout-body') as HTMLElement;
const playBtn = document.getElementById('play') as HTMLButtonElement;

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
  out.readout = [g.tiltDeg, g.pullLb, g.torqueInLb].map((v) => Math.round(v * 1000) / 1000);
  document.body.dataset.debug = JSON.stringify(out);
}

/** Test mode for the lift: ?frame=N shows frame N of the lift and reports what it shows. */
function testFrame(apply: (frame: number) => void, report: () => Record<string, number>) {
  const f = new URLSearchParams(location.search).get('frame');
  if (!f) return;
  apply(Number(f));
  document.body.dataset.lift = JSON.stringify(report());
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
  const labelRenderer = createLabelRenderer(stage);

  const { scene, camera, key } = createScene();

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.88; // a little below table height, never under the floor
  controls.target.set(0, 0.6, 0);

  const lift = {
    playing: false, t0: 0,
    start: (_now: number) => {}, step: (_now: number) => {}, stop: () => {},
  };
  playBtn.addEventListener('click', () => { if (!lift.playing) lift.start(performance.now()); });
  let views: Views | null = null;
  let current: ViewName = 'start';
  let userMoved = false;
  const resize = () => {
    const w = stage.clientWidth || window.innerWidth;
    const h = stage.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    labelRenderer.setSize(w, h);
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
      const labels = new LiftLabels();
      scene.add(labels);
      const props = new LiftProps();
      scene.add(props);
      props.attachLoop(geometryNow(), hand);

      // How far the hand has turned palm-down, read from the pose (the forearm slider or the lift).
      const palmDown = pose.side === '.R' ? -1 : 1;
      const turnNow = () => pose.get('hand')[1] * palmDown;
      const refresh = () => {
        window.__invalidate?.();
        const g = geometryNow();
        const turn = turnNow();
        overlays.update(g);
        labels.update(g, SETUP);
        // Turning palm-down winds the strap and lifts the plate; turning back unwinds it.
        props.update(g, SHOWN_RISE_IN * (turn / TURN_DEG));
        renderReadout(readoutBody, {
          elbowDeg: 180 - pose.get('forearm')[2], geometry: g, setup: SETUP,
          turnDeg: turn, realRiseIn: plateRise(turn, SETUP.momentArmIn), exaggeration: exaggeration(SETUP.momentArmIn),
        });
      };
      readoutCard.hidden = false;

      // The lift: play once from thumb-up, the same timeline as the Blender lift.
      const showFrame = (frame: number) => {
        pose.setHandTwist(liftState(frame, SETUP.momentArmIn).turnDeg * palmDown);
        refresh();
      };
      lift.start = (now: number) => {
        lift.t0 = now;
        lift.playing = true;
        sliders.setDisabled(true);
        playBtn.disabled = true;
        playBtn.textContent = 'Playing…';
      };
      lift.step = (now: number) => {
        const frame = Math.min(LAST_FRAME, FIRST_FRAME + ((now - lift.t0) / 1000) * FPS);
        showFrame(frame);
        sliders.sync();
        if (frame >= LAST_FRAME) lift.stop();
      };
      lift.stop = () => {
        lift.playing = false;
        sliders.setDisabled(false);
        playBtn.disabled = false;
        playBtn.textContent = '▶ Play lift';
      };
      playBtn.hidden = false;
      testFrame(showFrame, () => {
        const st = liftState(Number(new URLSearchParams(location.search).get('frame')), SETUP.momentArmIn);
        return { turnDeg: st.turnDeg, handY: pose.get('hand')[1], realRiseIn: st.realRiseIn, shownRiseIn: st.shownRiseIn,
          pinTop: props.pinTop() };
      });
      testMode(arm, pose, geometryNow);
      refresh();
      const sliders = buildSliders(slidersHost, pose, rightArmJoints(), refresh, () => lift.stop());
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

  // Draw only when something on screen changed: saves battery on phones, where a still scene
  // would otherwise be redrawn 60 times a second. ?continuous redraws every frame anyway: headless
  // screenshot tools only capture a canvas that keeps drawing.
  const continuous = new URLSearchParams(location.search).has('continuous');
  let dirty = true;
  const invalidate = () => { dirty = true; };
  controls.addEventListener('change', invalidate);
  new ResizeObserver(invalidate).observe(stage);
  window.__invalidate = invalidate;
  renderer.setAnimationLoop((now) => {
    if (lift.playing) { lift.step(now); dirty = true; }
    if (views?.tick(now)) dirty = true;
    if (controls.update()) dirty = true;
    if (!dirty && !continuous) return;
    dirty = false;
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  });
}
