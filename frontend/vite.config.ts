import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      output: {
        manualChunks: {
          'monaco-core': ['monaco-editor/esm/vs/editor/editor.api'],
          'monaco-json': ['monaco-editor/esm/vs/language/json/json.worker'],
        },
      },
    },
  },
  server: {
    strictPort: true,
  },
})
