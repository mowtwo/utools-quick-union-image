export type Position =
  | 'center'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'left top'
  | 'right top'
  | 'left bottom'
  | 'right bottom'

/** 网格内图片的适配方式（与 sharp resize fit 对应，none 为原尺寸） */
export type Fit = 'cover' | 'contain' | 'fill' | 'none'

// ---------- 编辑操作（预览、编辑器、工作流共用，由 preload 执行） ----------

export type EditOp =
  | { type: 'rotate'; angle: number; background?: string }
  | { type: 'flip'; horizontal: boolean; vertical: boolean }
  | { type: 'crop'; x: number; y: number; w: number; h: number }
  | { type: 'cropRatio'; ratioW: number; ratioH: number; position: Position }
  | { type: 'trim'; threshold: number }
  | { type: 'resize'; mode: 'scale'; scale: number }
  | { type: 'resize'; mode: 'width'; width: number }
  | { type: 'resize'; mode: 'height'; height: number }
  | { type: 'resize'; mode: 'maxSide'; size: number; onlyShrink?: boolean }
  | { type: 'resize'; mode: 'box'; width: number; height: number; fit: Exclude<Fit, 'none'>; position: Position; background?: string }

// ---------- 图片 ----------

export interface ImageItem {
  id: string
  name: string
  /** 规范化后的 PNG 工作副本路径 */
  path: string
  /** 原始文件路径（来自剪贴板 / 截图等则为空） */
  srcPath: string
  width: number
  height: number
  /** 预览用 blob URL */
  url: string
}

// ---------- 网格 ----------

export interface GridCell {
  id: string
  /** 归一化矩形（0~1，相对于去掉外边距后的画布） */
  x: number
  y: number
  w: number
  h: number
  /** 该格子使用第几张图片（0 起）；未设置时按格子顺序 */
  index?: number
  fit?: Fit
  position?: Position
  /** 格子背景色（contain / none 留白处可见） */
  background?: string
}

export type SizeMode = 'fixed' | 'auto'

export interface GridLayoutBase {
  id: string
  name: string
  builtin?: boolean
  /** 外边距 / 间距 / 圆角（像素，基于输出尺寸） */
  padding: number
  gap: number
  radius: number
  background: string
  defaultFit: Fit
  defaultPosition: Position
  updatedAt?: number
}

export interface GridLayout extends GridLayoutBase {
  kind: 'grid'
  /** 固定网格的行列（自由网格为 0） */
  rows: number
  cols: number
  cells: GridCell[]
  sizeMode: SizeMode
  width: number
  /** sizeMode=fixed 时使用 */
  height: number
}

/** 长图拼接：按原比例依次排布 */
export interface StripLayout extends GridLayoutBase {
  kind: 'strip'
  direction: 'vertical' | 'horizontal'
  /** 统一宽度（纵向）或高度（横向）；0 表示取第一张图 */
  size: number
  /** 同一行/列的图片数，>1 时为多列瀑布 */
  lanes: number
  /** 每张输出使用的图片数，0 表示全部 */
  count: number
}

/**
 * 等高（横向）/ 等宽（纵向）自适应拼接：
 * 每行图片缩放到同一高度并铺满宽度。宽高都可以为 0（自动）。
 */
export interface JustifyLayout extends GridLayoutBase {
  kind: 'justify'
  direction: 'horizontal' | 'vertical'
  /** 行数（纵向时为列数） */
  lines: number
  /** 输出宽度，0 为自动 */
  width: number
  /** 输出高度，0 为自动 */
  height: number
  /** 宽高都自动时，行高取图片高度的最小值 / 中位数 / 最大值 */
  autoBase: 'min' | 'median' | 'max'
  /** 每张输出使用的图片数，0 表示全部 */
  count: number
}

export type Layout = GridLayout | StripLayout | JustifyLayout

// ---------- 工作流 ----------

export type StepType = 'edit' | 'stitch' | 'export'

export interface EditStep {
  id: string
  type: 'edit'
  op: EditOp
}

export interface StitchStep {
  id: string
  type: 'stitch'
  presetId: string
  /** 图片数超过格子数时：chunk 分组输出多张；first 只拼前 N 张 */
  overflow: 'chunk' | 'first'
  /** 最后一组不足时：keep 留空，drop 丢弃 */
  remainder: 'keep' | 'drop'
  sort: 'none' | 'name' | 'nameDesc'
}

export interface ExportStep {
  id: string
  type: 'export'
  format: 'png' | 'jpeg' | 'webp' | 'avif'
  quality: number
  target: 'ask' | 'source' | 'downloads' | 'custom'
  customDir: string
  /** 子目录名，可为空 */
  subDir: string
  /** 文件名模板：{name} {index} {date} {time} */
  nameTemplate: string
  copyToClipboard: boolean
  openFolder: boolean
}

export type WorkflowStep = EditStep | StitchStep | ExportStep

export interface Workflow {
  id: string
  name: string
  steps: WorkflowStep[]
  /** 是否注册为 uTools 指令 */
  registerFeature: boolean
  recursive: boolean
  updatedAt?: number
}
