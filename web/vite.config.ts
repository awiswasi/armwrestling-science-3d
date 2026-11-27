import { defineConfig } from 'vite';

// Relative paths so the built page works from any folder or host (including a claude.ai artifact).
export default defineConfig({
  base: './',
  build: { outDir: 'dist', assetsDir: 'assets', sourcemap: false },
});
