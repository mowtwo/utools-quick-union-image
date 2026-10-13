// uTools API 的完整类型来自 @whatevertools/utools（只有 .d.ts，不进打包产物，不影响 uTools 的打包和发布）
/// <reference types="@whatevertools/utools/namespace" />

type UToolsApi = UTools.Api
type UToolsDbDoc = UTools.DbDoc
type UToolsDbResult = UTools.DbResult
type UToolsFeature = UTools.Feature
/** 本插件只用纯文字消息 */
type UToolsAiMessage = UTools.AiMessage & { content?: string }
type UToolsAiPromise<T> = UTools.AiPromise<T>
type UToolsAiModel = UTools.AiModel
type UToolsMatchFile = UTools.MatchFile
type UToolsPluginEnterAction = UTools.PluginEnterAction

/** 构建时从 package.json 注入的版本号 */
declare const __APP_VERSION__: string

interface ImportedImage {
  path: string
  srcPath: string
  name: string
  width: number
  height: number
  thumb: Uint8Array
}

interface ImageInfo {
  format: string
  fileSize: number
  hasAlpha: boolean
  frames: number
  /** 插件生成（拼接 / 粘贴）的图片，没有原始文件 */
  generated: boolean
  isOpaque?: boolean
  dominantColor?: string
  sharpness?: number
  /** RGB 平均亮度 0~255 */
  brightness?: number
}

interface StitchJobCell {
  left: number
  top: number
  width: number
  height: number
  image: string | null
  fit: string
  position: string
  background?: string
  radius: number
}

interface StitchJob {
  name: string
  width: number
  height: number
  background: string
  cells: StitchJobCell[]
  thumbSize?: number
}

interface PreloadServices {
  getZoomFactor(): number
  setZoomFactor(factor: number): void
  imageExtensions: string[]
  isImagePath(p: string): boolean
  getPathForFile(file: File): string
  expandPaths(paths: string[], recursive?: boolean): string[]
  importFile(filePath: string, thumbSize?: number): Promise<
    ImportedImage | { needsBrowserDecode: true; srcPath: string; name: string; error?: string }
  >
  importBytes(bytes: Uint8Array, name: string, thumbSize?: number): Promise<ImportedImage>
  importDataUrl(dataUrl: string, name?: string, thumbSize?: number): Promise<ImportedImage>
  readFileBytes(filePath: string): Promise<Uint8Array>
  readClipboardImage(): Uint8Array | null
  canRead(path: string): boolean
  thumbnail(filePath: string, size: number): Promise<Uint8Array>
  previewOps(
    filePath: string,
    ops: unknown[],
    maxSize: number,
  ): Promise<{ width: number; height: number; bytes: Uint8Array }>
  applyOps(filePath: string, ops: unknown[], name: string, thumbSize?: number): Promise<ImportedImage>
  stitch(job: StitchJob): Promise<ImportedImage>
  imageInfo(workPath: string, srcPath: string, withStats: boolean): Promise<ImageInfo>
  exportTo(srcPath: string, targetPath: string, quality?: number): Promise<string>
  exportToDir(srcPath: string, dir: string, baseName: string, format: string, quality?: number): Promise<string>
  dirname(p: string): string
  basename(p: string, withExt?: boolean): string
  join(...parts: string[]): string
  exists(p: string): boolean
}

interface Window {
  utools?: UToolsApi
  services?: PreloadServices
}
