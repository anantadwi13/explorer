import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../internal/server/ui/dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8080',
      '/raw': 'http://127.0.0.1:8080',
      '/assets': 'http://127.0.0.1:8080',
    },
  },
})
