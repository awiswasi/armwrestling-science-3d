// Compresses the exported models for the web (increment 0.11).
// models/<name>.glb  ->  models/<name>.min.glb
//   - quantize: store positions, normals and skin weights in fewer bits (invisible at this size)
//   - meshopt: pack the vertex and index data so it downloads small and decodes fast in the browser
// The shape, rig and weights are kept; only how the numbers are stored changes.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, quantize, reorder, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { readdirSync, statSync } from 'node:fs';

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder,
});

const dir = new URL('../../models/', import.meta.url);
for (const f of readdirSync(dir).filter((f) => f.endsWith('.glb') && !f.endsWith('.min.glb'))) {
  const src = new URL(f, dir), out = new URL(f.replace(/\.glb$/, '.min.glb'), dir);
  const doc = await io.read(src.pathname);
  await doc.transform(
    dedup(), prune(), weld(),
    reorder({ encoder: MeshoptEncoder }),
    quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeWeight: 8 }),
  );
  doc.createExtension(EXTMeshoptCompression).setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  await io.write(out.pathname, doc);
  const mb = (p) => (statSync(p).size / 1e6).toFixed(2);
  console.log(`${f}: ${mb(src.pathname)} MB -> ${mb(out.pathname)} MB`);
}
