// The shared stage every later increment builds on: background, floor, grid, lights, camera.
import * as THREE from 'three';

export const COLORS = {
  background: 0x14171b,
  floor: 0x2e353e,
  gridMajor: 0x5a6571,
  gridMinor: 0x3a424c,
};

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.background);
  scene.fog = new THREE.Fog(COLORS.background, 3, 7);

  // Floor: 4 m square, catches the arm's shadow later.
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 4),
    new THREE.MeshStandardMaterial({ color: COLORS.floor, roughness: 0.95, metalness: 0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = 'floor';
  scene.add(floor);

  // Grid: 2 m across, 10 cm squares, sitting just above the floor.
  const grid = new THREE.GridHelper(2, 20, COLORS.gridMajor, COLORS.gridMinor);
  grid.position.y = 0.001;
  grid.name = 'grid';
  scene.add(grid);

  // Lights: soft sky/ground fill plus one key light that casts shadows.
  scene.add(new THREE.HemisphereLight(0xdfe8f2, 0x1a1d21, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(0.9, 2.6, 1.4);
  key.castShadow = true;
  // Smaller shadow map on phones: a quarter of the work, and the arm is small on screen there.
  const small = typeof window !== 'undefined' && window.matchMedia('(max-width: 600px)').matches;
  key.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
  const s = key.shadow.camera as THREE.OrthographicCamera;
  s.left = s.bottom = -0.8;
  s.right = s.top = 0.8;
  s.near = 0.5;
  s.far = 6;
  key.shadow.bias = -0.0005;
  key.name = 'key-light';
  scene.add(key);

  // Camera: about where a coach would stand, looking at table height.
  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 20);
  camera.position.set(1.1, 0.9, 1.5);
  camera.lookAt(0, 0.35, 0);

  return { scene, camera, floor, grid, key };
}
