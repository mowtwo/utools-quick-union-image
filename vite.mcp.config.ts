import path from 'node:path'
import { defineConfig } from 'vite'

// MCP 工具模块：打包成 CommonJS 供 public/preload.js require，不压缩，便于审核
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  build: {
    target: 'chrome132',
    outDir: 'dist',
    emptyOutDir: false,
    minify: false,
    lib: {
      entry: path.resolve(import.meta.dirname, './src/mcp/index.ts'),
      formats: ['cjs'],
      fileName: () => 'mcp-tools.js',
    },
  },
})
