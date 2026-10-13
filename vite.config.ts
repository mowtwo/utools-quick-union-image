import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import whatevertools from '@whatevertools/vite'
import { defineConfig } from 'vite'
import pkg from './package.json' with { type: 'json' }

// uTools 以本地文件方式加载 dist/index.html，资源路径必须是相对路径
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    tailwindcss(),
    // 构建时写 dist/whatevertools.json：给 whatevertools 兼容层（Electron 独立应用、网页版）用的身份、权限说明和独立应用配置。
    // uTools 不读这个文件，plugin.json 不用改；vite dev 时在普通浏览器里模拟插件环境
    whatevertools({
      manifest: {
        id: 'quick-union-image',
        name: '快拼图',
        homepage: 'https://github.com/mowtwo/utools-quick-union-image',
        // 用途说明会显示在权限询问里
        permissions: {
          'fs.read': { reason: '读取你选择、拖入或粘贴的图片' },
          'fs.write': { reason: '把处理结果导出到你选择的目录' },
          'clipboard.read': { reason: '粘贴剪贴板里的图片或文件' },
          'clipboard.write': { reason: '把结果复制到剪贴板' },
          'image.sharp': { reason: '图片拼接与编辑' },
          'shell.open': { reason: '导出后在访达 / 资源管理器中显示文件' },
          ai: { reason: 'AI 编排：用模型生成处理步骤' },
          mcp: { reason: '让 AI Agent 调用拼图、编辑等工具' },
          notification: { reason: '批量处理完成时提醒' },
        },
        standalone: { productName: '快拼图', startFeature: 'stitch' },
      },
    }),
  ],
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
