import { defineConfig } from 'vite'

export default defineConfig({
  // Relative asset paths, so the site works at a domain root or under a GitHub Pages project path.
  base: './',
  // MapLibre loads its worker relative to its own module; pre-bundling moves the module and breaks that URL.
  optimizeDeps: { exclude: ['maplibre-gl'] },
  server: {
    port: 5173,
    strictPort: true,
  },
})
