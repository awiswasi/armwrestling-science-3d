// Copies the exported models from ../models into public/models so Vite serves and bundles them.
// The repo keeps one source of truth (models/); public/models is generated and git-ignored.
import { cpSync, mkdirSync, readdirSync } from 'node:fs';
const src = new URL('../../models/', import.meta.url);
const dst = new URL('../public/models/', import.meta.url);
mkdirSync(dst, { recursive: true });
for (const f of readdirSync(src)) {
  if (f.endsWith('.glb')) cpSync(new URL(f, src), new URL(f, dst));
}
console.log('models copied:', readdirSync(dst).join(', '));
