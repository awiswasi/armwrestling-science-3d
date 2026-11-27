// Increment 0.3: the empty 3D scene. Floor, lights and a grid, sized to the window.
// Units are metres and +Y is up, the same as the exported arm (.glb).
import * as THREE from 'three';
import { createScene } from './scene';

const stage = document.getElementById('stage') as HTMLDivElement;
const error = document.getElementById('error') as HTMLParagraphElement;

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

  const { scene, camera } = createScene();

  const resize = () => {
    const w = stage.clientWidth || window.innerWidth;
    const h = stage.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(stage);
  resize();

  renderer.setAnimationLoop(() => renderer.render(scene, camera));
}
