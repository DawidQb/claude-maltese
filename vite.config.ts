import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/** Emits sw.js with the list of built files, so the app can be saved for offline use. */
function serviceWorker(): Plugin {
  return {
    name: 'kelma-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).filter((f) => f !== 'index.html' && !f.endsWith('.map'));
      const copied = readdirSync('public');
      const hash = createHash('sha256');
      // Built file names already contain a content hash; public files are hashed here.
      for (const file of built) hash.update(file);
      for (const file of copied) hash.update(file).update(readFileSync(`public/${file}`));
      hash.update(readFileSync('index.html'));

      const source = readFileSync('src/sw.template.js', 'utf8')
        .replace('__VERSION__', hash.digest('hex').slice(0, 12))
        .replace('__PRECACHE__', JSON.stringify(['./', ...built, ...copied]));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  // Relative base so the build works under any GitHub Pages path.
  base: './',
  plugins: [react(), serviceWorker()],
  test: { environment: 'node' },
});
