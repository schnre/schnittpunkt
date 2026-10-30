import { defineConfig } from 'vitest/config';

// Relative Basis, damit die App unter https://<user>.github.io/<repo>/ ohne Anpassung läuft.
// Die Firmendaten liegen NICHT im Bundle, sondern unter public/data/ und werden zur
// Laufzeit geladen. So aktualisiert die monatliche Handelsregister-Abfrage nur eine
// JSON-Datei, und der App-Code bleibt im Browser-Cache.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2022',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/leaflet')) return 'leaflet';
        },
      },
    },
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
