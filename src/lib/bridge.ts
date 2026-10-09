import type { ImageItem } from './types'
import { uid } from './layout'

/** 运行环境诊断：返回 null 表示一切正常，否则返回原因 */
export function envProblem(): string | null {
  if (!window.utools) return '未检测到 uTools 环境（window.utools 不存在），请在 uTools 中打开插件'
  if (!window.services) {
    const state = (window as { __quickUnionPreload?: string }).__quickUnionPreload
    return state === 'loading'
      ? 'preload.js 执行出错，请按 Ctrl/⌘+Shift+I 打开开发者工具查看控制台错误'
      : 'preload.js 未加载：请确认导入的是构建目录 dist/plugin.json，且 dist 中有 preload.js'
  }
  return null
}

/** 实时判断，不在模块加载时缓存结果 */
export function isUtools() {
  return envProblem() === null
}

export function services(): PreloadServices {
  const problem = envProblem()
  if (problem) throw new Error(problem)
  return window.services!
}

export function utools(): UToolsApi {
  if (!window.utools) throw new Error('当前不在 uTools 环境中')
  return window.utools
}

// 画布预览直接使用该尺寸的缩略图，需兼顾高分屏与 uTools 缩放
export const TRAY_THUMB = 1280

export function toImageItem(r: ImportedImage): ImageItem {
  return {
    id: uid(),
    name: r.name,
    path: r.path,
    srcPath: r.srcPath,
    width: r.width,
    height: r.height,
    url: URL.createObjectURL(new Blob([r.thumb as BlobPart], { type: 'image/webp' })),
  }
}

export function releaseImage(item: ImageItem) {
  URL.revokeObjectURL(item.url)
}

export async function mapLimit<T, R>(
  list: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(list.length)
  let next = 0
  const worker = async () => {
    while (next < list.length) {
      const i = next++
      out[i] = await fn(list[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker))
  return out
}

const MIME: Record<string, string> = {
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
}

/** sharp 与 nativeImage 都无法解码时，用 Chromium 解码再转 PNG */
async function browserDecode(srcPath: string, name: string, thumbSize: number): Promise<ImportedImage> {
  const svc = services()
  const bytes = await svc.readFileBytes(srcPath)
  const ext = srcPath.split('.').pop()?.toLowerCase() ?? ''
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: MIME[ext] ?? 'application/octet-stream' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const w = img.naturalWidth || 512
    const h = img.naturalHeight || 512
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('浏览器解码失败')
    const result = await svc.importBytes(new Uint8Array(await blob.arrayBuffer()), name, thumbSize)
    return { ...result, srcPath }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export interface ImportFailure {
  path: string
  reason: string
}

/** 导入文件或文件夹：所有图片都规范化为 PNG 工作副本 */
export async function importPaths(
  paths: string[],
  opts: { recursive?: boolean; thumbSize?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<{ images: ImportedImage[]; failed: ImportFailure[] }> {
  const svc = services()
  const files = svc.expandPaths(paths, opts.recursive)
  const thumbSize = opts.thumbSize ?? TRAY_THUMB
  const failed: ImportFailure[] = []
  let done = 0
  const results = await mapLimit(files, 3, async (file) => {
    try {
      const r = await svc.importFile(file, thumbSize)
      if ('needsBrowserDecode' in r) return await browserDecode(r.srcPath, r.name, thumbSize)
      return r
    } catch (err) {
      failed.push({ path: file, reason: err instanceof Error ? err.message : String(err) })
      return null
    } finally {
      done++
      opts.onProgress?.(done, files.length)
    }
  })
  return { images: results.filter((x): x is ImportedImage => !!x), failed }
}

export async function importDataUrl(dataUrl: string, name = '粘贴的图片') {
  return services().importDataUrl(dataUrl, name, TRAY_THUMB)
}

/** 从 uTools 进入参数中取出图片输入 */
export function pathsFromPayload(action: UToolsPluginEnterAction): { paths: string[]; dataUrl?: string } {
  if (action.type === 'files' && Array.isArray(action.payload)) {
    return { paths: (action.payload as UToolsMatchFile[]).map((f) => f.path) }
  }
  if (action.type === 'img' && typeof action.payload === 'string') {
    return { paths: [], dataUrl: action.payload }
  }
  return { paths: [] }
}

export const IMAGE_FILTER = {
  name: '图片',
  extensions: ['png', 'jpg', 'jpeg', 'jfif', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'avif', 'heic', 'heif', 'svg', 'ico'],
}

export function pickImageFiles(): string[] {
  return (
    utools().showOpenDialog({
      title: '选择图片',
      filters: [IMAGE_FILTER],
      properties: ['openFile', 'multiSelections'],
    }) ?? []
  )
}

export function pickFolders(): string[] {
  return (
    utools().showOpenDialog({
      title: '选择图片文件夹',
      properties: ['openDirectory', 'multiSelections'],
    }) ?? []
  )
}

export function pickAnyFiles(): string[] {
  return (
    utools().showOpenDialog({
      title: '选择文件（自动过滤出图片）',
      properties: ['openFile', 'multiSelections'],
    }) ?? []
  )
}

export function clipboardPaths(): string[] {
  return (utools().getCopiedFiles() ?? []).map((f) => f.path)
}

export function droppedPaths(e: React.DragEvent): string[] {
  if (!window.services) return []
  return Array.from(e.dataTransfer.files)
    .map((f) => {
      try {
        return services().getPathForFile(f)
      } catch {
        return ''
      }
    })
    .filter(Boolean)
}

export function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err)
}

export const PERMISSION_HINT = '可在「系统设置 → 隐私与安全性 → 完全磁盘访问权限」中允许 uTools，或先把图片另存到其他目录'
