// Vorschau als eine einzige HTML-Datei (z. B. zum Weitergeben ohne Server).
// Unterschiede zur echten App: Daten sind eingebettet, und statt der swisstopo-Kacheln
// zeigt die Karte einen Vektorumriss der Schweiz. Bauen: npx vite build --config vite.vorschau.config.ts --mode vorschau
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  publicDir: false,
  build: { outDir: 'dist-vorschau', assetsInlineLimit: 100_000_000, target: 'es2022' },
});
