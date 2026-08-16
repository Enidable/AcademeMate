import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/AcademeMate/',
  plugins: [tailwindcss(), react()],
  server: {
    // Keep the port fixed to 5173 — that's the only origin registered in
    // Google Cloud. If Vite drifted to another port, OAuth would fail with an
    // "authorized origin" error.
    port: 5173,
    strictPort: true,
  },
})