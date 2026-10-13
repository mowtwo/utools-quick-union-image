// 构建后写 dist/whatevertools.json：给 whatevertools 兼容层（独立打包、web 版）用的身份、权限说明和独立应用配置。
// uTools 不读这个文件，plugin.json 也不需要改，不影响 uTools 的打包和发布。
import fs from 'node:fs'

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const meta = {
  id: 'quick-union-image',
  name: '快拼图',
  version: pkg.version,
  description: pkg.description,
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
}
fs.writeFileSync(new URL('../dist/whatevertools.json', import.meta.url), JSON.stringify(meta, null, 2) + '\n')
console.log(`dist/whatevertools.json v${pkg.version}`)
