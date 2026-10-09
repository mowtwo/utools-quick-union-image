// 仅声明本插件用到的 uTools API（依据 uTools 官方开发文档）

interface UToolsMatchFile {
  isFile: boolean
  isDirectory: boolean
  name: string
  path: string
}

interface UToolsPluginEnterAction {
  code: string
  type: 'text' | 'img' | 'files' | 'regex' | 'over' | 'window'
  payload: unknown
  from: 'main' | 'panel' | 'hotkey' | 'redirect'
}

interface UToolsDbDoc {
  _id: string
  _rev?: string
  [key: string]: unknown
}

interface UToolsDbResult {
  id: string
  rev?: string
  ok?: boolean
  error?: boolean
  name?: string
  message?: string
}

interface UToolsFeatureCmd {
  type: 'regex' | 'over' | 'img' | 'files' | 'window'
  label: string
  match?: string
  fileType?: 'file' | 'directory'
  extensions?: string[]
  minLength?: number
  maxLength?: number
}

interface UToolsFeature {
  code: string
  description?: string
  icon?: string
  cmds: Array<string | UToolsFeatureCmd>
}

interface UToolsDialogFilter {
  name: string
  extensions: string[]
}

interface UToolsAiMessage {
  role: 'system' | 'user' | 'assistant'
  content?: string
  reasoning_content?: string
}

interface UToolsAiPromise<T> extends Promise<T> {
  abort(): void
}

interface UToolsAiModel {
  id: string
  label: string
  icon: string
  cost?: number
  vision?: boolean
}

interface UToolsApi {
  ai(options: { model?: string; messages: UToolsAiMessage[] }): UToolsAiPromise<UToolsAiMessage>
  ai(options: { model?: string; messages: UToolsAiMessage[] }, stream: (chunk: UToolsAiMessage) => void): UToolsAiPromise<void>
  allAiModels(): Promise<UToolsAiModel[]>
  onPluginEnter(cb: (action: UToolsPluginEnterAction) => void): void
  onPluginOut(cb: (isKill: boolean) => void): void
  isDarkColors(): boolean
  subInputBlur(): void
  showNotification(body: string, clickFeatureCode?: string): void
  showOpenDialog(options: {
    title?: string
    defaultPath?: string
    buttonLabel?: string
    filters?: UToolsDialogFilter[]
    properties?: string[]
  }): string[] | undefined
  showSaveDialog(options: {
    title?: string
    defaultPath?: string
    buttonLabel?: string
    filters?: UToolsDialogFilter[]
  }): string | undefined
  getPath(name: string): string
  shellShowItemInFolder(fullPath: string): void
  copyImage(image: string | Uint8Array): boolean
  copyFile(filePath: string | string[]): boolean
  getCopiedFiles(): Array<{ path: string; isDirectory: boolean; isFile: boolean; name: string }> | null
  startDrag(filePath: string | string[]): void
  db: {
    put(doc: UToolsDbDoc): UToolsDbResult
    get(id: string): UToolsDbDoc | null
    remove(id: string): UToolsDbResult
    allDocs(idStartsWith?: string): UToolsDbDoc[]
  }
  dbStorage: {
    setItem(key: string, value: unknown): void
    getItem(key: string): unknown
    removeItem(key: string): boolean
  }
  getFeatures(codes?: string[]): UToolsFeature[]
  setFeature(feature: UToolsFeature): void
  removeFeature(code: string): boolean
}

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
