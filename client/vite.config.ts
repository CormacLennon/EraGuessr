import { defineConfig } from 'vite'

export default defineConfig({
  // MapLibre loads its worker relative to its own module; pre-bundling moves the module and breaks that URL.
  optimizeDeps: { exclude: ['maplibre-gl'] },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://localhost:8787' },
  },
})
