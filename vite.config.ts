import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// uTools 以本地文件方式加载 dist/index.html，资源路径必须是相对路径
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  build: {
    // uTools Runtime: Electron 34 / Chromium 132
    target: 'chrome132',
    outDir: 'dist',
    emptyOutDir: true,
  },
})
