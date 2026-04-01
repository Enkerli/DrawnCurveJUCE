import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  base: '/DrawnQurve/',
  build: {
    outDir: resolve(__dirname, '../docs'),
    emptyOutDir: false,
  },
})
