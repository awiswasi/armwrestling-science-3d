// Checks that compression didn't visibly change the arm (increment 0.11).
// Skins both models in their rest pose (joint world matrix x inverse bind matrix, blended by
// the vertex weights) and reports how far each vertex moved, in millimetres.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const root = new URL('../../models/', import.meta.url).pathname;
const mul = (a, b) => { const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c*4+r] += a[k*4+r] * b[c*4+k]; return o; };

async function skinned(f) {
  const doc = await io.read(root + f);
  await doc.transform(dequantize());
  const node = doc.getRoot().listNodes().find((n) => n.getMesh() && n.getSkin());
  const skin = node.getSkin(), ibm = skin.getInverseBindMatrices();
  const mats = skin.listJoints().map((j, i) => mul(j.getWorldMatrix(), ibm.getElement(i, [])));
  const names = skin.listJoints().map((j) => j.getName());
  const p = node.getMesh().listPrimitives()[0];
  const P = p.getAttribute('POSITION'), J = p.getAttribute('JOINTS_0'), W = p.getAttribute('WEIGHTS_0');
  const out = [];
  for (let i = 0; i < P.getCount(); i++) {
    const [x, y, z] = P.getElement(i, []), js = J.getElement(i, []), ws = W.getElement(i, []);
    const s = ws.reduce((a, b) => a + b, 0) || 1, v = [0, 0, 0];
    for (let k = 0; k < 4; k++) { const m = mats[js[k]], w = ws[k] / s; if (!w) continue;
      v[0] += w * (m[0]*x + m[4]*y + m[8]*z + m[12]); v[1] += w * (m[1]*x + m[5]*y + m[9]*z + m[13]); v[2] += w * (m[2]*x + m[6]*y + m[10]*z + m[14]); }
    out.push(v);
  }
  return { out, names };
}

const A = await skinned('arm_right.glb'), B = await skinned('arm_right.min.glb');
const cell = 0.003, grid = new Map(), key = (p) => p.map((v) => Math.floor(v / cell)).join(',');
for (const p of B.out) { const k = key(p); (grid.get(k) || grid.set(k, []).get(k)).push(p); }
let worst = 0, sum = 0;
for (const p of A.out) {
  const [i, j, k] = p.map((v) => Math.floor(v / cell)); let best = Infinity;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++)
    for (const q of grid.get(`${i + a},${j + b},${k + c}`) || []) best = Math.min(best, Math.hypot(p[0]-q[0], p[1]-q[1], p[2]-q[2]));
  worst = Math.max(worst, best); sum += best;
}
const sameBones = A.names.join() === B.names.join();
console.log(`bones: ${B.names.length} (${sameBones ? 'same names and order' : 'DIFFERENT'})`);
console.log(`vertices: ${A.out.length} -> ${B.out.length}; skin moved at most ${(worst*1000).toFixed(3)} mm, on average ${(sum/A.out.length*1000).toFixed(4)} mm`);
if (!sameBones || worst > 0.0005) process.exit(1);
