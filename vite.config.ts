import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import pkg from './package.json' with { type: 'json' }

// uTools 以本地文件方式加载 dist/index.html，资源路径必须是相对路径
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
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
