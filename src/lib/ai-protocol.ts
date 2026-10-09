import { mapLimit, services } from './bridge'
import { makeGrid, slotCount, uid } from './layout'
import type { EditOp, Fit, ImageItem, Layout, Position, WorkflowStep } from './types'
import { newStep } from './workflow'

// AI 编排协议：插件与大模型之间只交换 JSON。
// 模型 → 插件：plan / need_user / done / unsupported
// 插件 → 模型：context / user_response / execution_result / validation_error / user_interrupt

export const INLINE_LAYOUT = 'inline'

export type NeedUserKind = 'select_images' | 'choose_preset' | 'manual_edit' | 'confirm' | 'text'

export interface AiPlan {
  type: 'plan'
  summary: string
  steps: WorkflowStep[]
  /** plan 内联定义的网格（stitch.preset = "inline" 时使用） */
  layout?: Layout
}

export interface AiNeedUser {
  type: 'need_user'
  kind: NeedUserKind
  message: string
  /** 可选：confirm / choose 的选项 */
  options?: string[]
}

export interface AiDone {
  type: 'done'
  message: string
}

export interface AiUnsupported {
  type: 'unsupported'
  message: string
  missing: string[]
}

export type AiCommand = AiPlan | AiNeedUser | AiDone | AiUnsupported

const POSITIONS: Position[] = ['center', 'top', 'bottom', 'left', 'right', 'left top', 'right top', 'left bottom', 'right bottom']
const FITS: Fit[] = ['cover', 'contain', 'fill', 'none']
const NEED_KINDS: NeedUserKind[] = ['select_images', 'choose_preset', 'manual_edit', 'confirm', 'text']

export const SYSTEM_PROMPT = `你是 uTools 插件「快拼图」的编排器。你只能用本插件已有的能力处理图片：编辑（旋转/翻转/裁切/去纯色边/缩放）、拼接（网格预设或内联网格）、导出。

## 输出规则（必须严格遵守）
- 每次回复只输出一个 JSON 对象，不要输出任何解释文字、不要用 markdown 代码块。
- 只能使用下面定义的指令和字段；不能编造其他操作、字段或预设 id。
- 插件发给你的消息也都是 JSON，request 字段是用户的自然语言需求。
- 需求里有插件做不到的部分（如加文字/水印、滤镜调色、抠图、AI 生成、读取网络图片等）：
  - 如果用户可以手动处理后继续，返回 need_user（kind=manual_edit），说明需要用户做什么；
  - 如果完全无法完成，返回 unsupported，并在 missing 中列出缺少的能力。
- 缺少输入图片时（context.images 为空）返回 need_user（kind=select_images）。
- 需求有歧义且会影响结果时返回 need_user（kind=confirm 或 text）询问，不要猜。

## 指令
1. 执行计划
{"type":"plan","summary":"一句话说明","steps":[步骤...],"layout":可选的内联网格}
2. 请求用户介入
{"type":"need_user","kind":"select_images|choose_preset|manual_edit|confirm|text","message":"告诉用户需要做什么","options":["可选，confirm 时的选项"]}
3. 完成
{"type":"done","message":"结果说明"}
4. 无法完成
{"type":"unsupported","message":"原因","missing":["缺少的能力"]}

## 步骤（steps 按顺序执行；输入是 context.images 中的全部图片，已转为 PNG）
- 编辑（对当前每张图片执行）：{"type":"edit","op":操作}
  操作：
  {"type":"rotate","angle":度数,"background":"#rrggbb 或 transparent"}
  {"type":"flip","horizontal":true,"vertical":false}
  {"type":"crop","x":0~1,"y":0~1,"w":0~1,"h":0~1}  （归一化区域）
  {"type":"cropRatio","ratioW":宽,"ratioH":高,"position":对齐}
  {"type":"trim","threshold":0~255}
  {"type":"resize","mode":"scale","scale":倍数}
  {"type":"resize","mode":"width","width":像素}
  {"type":"resize","mode":"height","height":像素}
  {"type":"resize","mode":"maxSide","size":像素,"onlyShrink":true}
  {"type":"resize","mode":"box","width":像素,"height":像素,"fit":"cover|contain|fill","position":对齐}
- 拼接（把当前图片拼成一张或多张）：{"type":"stitch","preset":"预设 id 或 inline","overflow":"chunk|first","remainder":"keep|drop","sort":"none|name|nameDesc"}
  overflow=chunk：图片多于格子数时每 N 张拼一张；first：只拼前 N 张。
- 导出：{"type":"export","format":"png|jpeg|webp|avif","quality":1~100,"target":"source|downloads|ask","subDir":"","nameTemplate":"{name}"}
  nameTemplate 可用 {name} {index} {date} {time}。不导出时图片只在插件内显示。

对齐 position 取值：center top bottom left right "left top" "right top" "left bottom" "right bottom"。

## 内联网格 layout（预设里没有合适的才用，stitch.preset 填 "inline"）
- 等高/等宽自适应（不同尺寸图片拼成等高一行或等宽一列）：
  {"kind":"justify","direction":"horizontal|vertical","lines":行数,"width":0或像素,"height":0或像素,"count":每张输出图片数(0=全部),"gap":像素,"padding":像素,"background":"#ffffff"}
  width/height 为 0 表示自动；只给 height 则各图缩放到该高度。
- 固定网格：{"kind":"grid","rows":行,"cols":列,"width":像素,"height":像素或0(自动),"gap":像素,"padding":像素,"radius":像素,"background":"#ffffff","fit":"cover|contain|fill|none","indexes":[可选，每个格子使用第几张图(0 起)]}
- 自由网格：{"kind":"grid","cells":[{"x":0~1,"y":0~1,"w":0~1,"h":0~1,"index":可选,"fit":可选}],"width":像素,"height":像素,...}
- 长图：{"kind":"strip","direction":"vertical|horizontal","lanes":列数,"size":0或统一宽度,"count":0,"gap":像素}

可用的预设见 context.presets（slots=每组需要的图片数，0 表示不限）。

## images 中每张图片的信息
- index：序号（0 起，即拼接顺序）；name：文件名（不含扩展名）
- width / height：像素尺寸（已按 EXIF 方向校正）；aspect：宽/高；orientation：landscape / portrait / square
- format：原始格式（jpeg/png/webp/heif/gif/svg…）；fileSize：原文件字节数；frames：帧数（>1 为动图，处理时只取第一帧）
- hasAlpha：原图有透明通道；generated：true 表示是插件生成的图（拼接结果 / 粘贴的图），没有原始文件
- isOpaque：是否完全不透明（hasAlpha 为 true 但 isOpaque 也为 true 时实际没有透明像素）
- dominantColor：主色；brightness：平均亮度 0~255；sharpness：清晰度估计（越小越模糊，纯色图为 0）
- 图片较多时可能没有 isOpaque / dominantColor / brightness / sharpness。
- 这些只是元数据，你看不到画面内容；需要按画面内容判断时，返回 need_user 请用户决定。
- 导出为 jpeg 时透明区域会被填成白色；若有透明图（isOpaque=false）且用户没指定格式，优先导出 png。

## 插件发给你的消息类型
- context：新的用户需求（request）及当前图片 images、预设 presets。
- user_response：用户处理完你的 need_user 请求后回传（answer / presetId / note，images 为最新图片列表）。
- user_edited_plan：用户手动修改了计划（plan），请检查后返回可执行的 plan 或其他指令。
- execution_result：计划执行结果（ok、outputs、exported 或 error）。成功且无需后续操作时返回 done；失败时修正后返回新的 plan 或 need_user。
- validation_error：你上次的回复不符合协议（errors），请修正后重新输出。
- 若消息带 previous="user_interrupted"，表示用户中断了上一步，以本条消息为准。
- 执行结果中的图片会成为下一个 plan 的输入。`

// ---------- 插件 → 模型 ----------

/** 超过该数量只读 metadata，不做像素统计（stats 需要解码整张图） */
export const STATS_LIMIT = 60

export async function describeImages(images: ImageItem[]) {
  const withStats = images.length <= STATS_LIMIT
  return mapLimit(images, 4, async (img, i) => {
    const ratio = img.width / img.height
    const base = {
      index: i,
      name: img.name,
      width: img.width,
      height: img.height,
      aspect: Math.round(ratio * 1000) / 1000,
      orientation: Math.abs(ratio - 1) < 0.02 ? 'square' : ratio > 1 ? 'landscape' : 'portrait',
    }
    try {
      return { ...base, ...(await services().imageInfo(img.path, img.srcPath, withStats)) }
    } catch {
      return base
    }
  })
}

export function contextMessage(request: string, images: object[], layouts: Layout[]) {
  return {
    type: 'context',
    request,
    images,
    presets: layouts.map((l) => ({ id: l.id, name: l.name, kind: l.kind, slots: slotCount(l) })),
  }
}

// ---------- 模型 → 插件：解析与严格校验 ----------

export function extractJson(text: string): unknown {
  let s = text.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) s = fence[1].trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('回复中没有 JSON 对象')
  return JSON.parse(s.slice(start, end + 1))
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)

class Checker {
  errors: string[] = []
  num(o: Obj, key: string, path: string, min: number, max: number, fallback?: number): number {
    const v = o[key]
    if (v === undefined && fallback !== undefined) return fallback
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      this.errors.push(`${path}.${key} 必须是数字`)
      return fallback ?? min
    }
    if (v < min || v > max) this.errors.push(`${path}.${key} 超出范围 ${min}~${max}`)
    return Math.min(max, Math.max(min, v))
  }
  oneOf<T extends string>(o: Obj, key: string, path: string, allowed: readonly T[], fallback?: T): T {
    const v = o[key]
    if (v === undefined && fallback !== undefined) return fallback
    if (!allowed.includes(v as T)) {
      this.errors.push(`${path}.${key} 只能是 ${allowed.join(' / ')}`)
      return fallback ?? allowed[0]
    }
    return v as T
  }
  str(o: Obj, key: string, fallback = ''): string {
    const v = o[key]
    return typeof v === 'string' ? v : fallback
  }
  color(o: Obj, key: string, fallback: string): string {
    const v = o[key]
    if (v === undefined) return fallback
    if (typeof v === 'string' && (v === 'transparent' || /^#[0-9a-f]{3,8}$/i.test(v))) return v
    this.errors.push(`${key} 必须是 #rrggbb 或 transparent`)
    return fallback
  }
  bool(o: Obj, key: string, fallback: boolean): boolean {
    return typeof o[key] === 'boolean' ? (o[key] as boolean) : fallback
  }
}

function parseOp(c: Checker, raw: unknown, path: string): EditOp | null {
  if (!isObj(raw)) {
    c.errors.push(`${path} 必须是对象`)
    return null
  }
  const before = c.errors.length
  const type = c.oneOf(raw, 'type', path, ['rotate', 'flip', 'crop', 'cropRatio', 'trim', 'resize'] as const)
  if (c.errors.length > before) return null
  switch (type) {
    case 'rotate':
      return { type, angle: c.num(raw, 'angle', path, -360, 360), background: c.color(raw, 'background', 'transparent') }
    case 'flip':
      return { type, horizontal: c.bool(raw, 'horizontal', false), vertical: c.bool(raw, 'vertical', false) }
    case 'crop': {
      const x = c.num(raw, 'x', path, 0, 1)
      const y = c.num(raw, 'y', path, 0, 1)
      return { type, x, y, w: c.num(raw, 'w', path, 0.001, 1 - x), h: c.num(raw, 'h', path, 0.001, 1 - y) }
    }
    case 'cropRatio':
      return {
        type,
        ratioW: c.num(raw, 'ratioW', path, 0.01, 1000),
        ratioH: c.num(raw, 'ratioH', path, 0.01, 1000),
        position: c.oneOf(raw, 'position', path, POSITIONS, 'center'),
      }
    case 'trim':
      return { type, threshold: c.num(raw, 'threshold', path, 0, 255, 10) }
    case 'resize': {
      const mode = c.oneOf(raw, 'mode', path, ['scale', 'width', 'height', 'maxSide', 'box'] as const)
      if (mode === 'scale') return { type, mode, scale: c.num(raw, 'scale', path, 0.01, 20) }
      if (mode === 'width') return { type, mode, width: c.num(raw, 'width', path, 1, 30000) }
      if (mode === 'height') return { type, mode, height: c.num(raw, 'height', path, 1, 30000) }
      if (mode === 'maxSide') return { type, mode, size: c.num(raw, 'size', path, 1, 30000), onlyShrink: c.bool(raw, 'onlyShrink', true) }
      return {
        type,
        mode,
        width: c.num(raw, 'width', path, 1, 30000),
        height: c.num(raw, 'height', path, 1, 30000),
        fit: c.oneOf(raw, 'fit', path, ['cover', 'contain', 'fill'] as const, 'cover'),
        position: c.oneOf(raw, 'position', path, POSITIONS, 'center'),
      }
    }
  }
}

function parseLayout(c: Checker, raw: unknown): Layout | undefined {
  if (!isObj(raw)) {
    c.errors.push('layout 必须是对象')
    return undefined
  }
  const path = 'layout'
  const kind = c.oneOf(raw, 'kind', path, ['grid', 'justify', 'strip'] as const)
  const common = {
    id: uid(),
    name: c.str(raw, 'name', 'AI 网格'),
    padding: c.num(raw, 'padding', path, 0, 2000, 0),
    gap: c.num(raw, 'gap', path, 0, 2000, kind === 'grid' ? 8 : 0),
    radius: c.num(raw, 'radius', path, 0, 2000, 0),
    background: c.color(raw, 'background', '#ffffff'),
    defaultFit: c.oneOf(raw, 'fit', path, FITS, 'cover'),
    defaultPosition: c.oneOf(raw, 'position', path, POSITIONS, 'center'),
  }
  if (kind === 'justify') {
    return {
      ...common,
      kind,
      direction: c.oneOf(raw, 'direction', path, ['horizontal', 'vertical'] as const, 'horizontal'),
      lines: c.num(raw, 'lines', path, 1, 50, 1),
      width: c.num(raw, 'width', path, 0, 30000, 0),
      height: c.num(raw, 'height', path, 0, 30000, 0),
      autoBase: c.oneOf(raw, 'autoBase', path, ['min', 'median', 'max'] as const, 'min'),
      count: c.num(raw, 'count', path, 0, 500, 0),
    }
  }
  if (kind === 'strip') {
    return {
      ...common,
      kind,
      direction: c.oneOf(raw, 'direction', path, ['vertical', 'horizontal'] as const, 'vertical'),
      lanes: c.num(raw, 'lanes', path, 1, 20, 1),
      size: c.num(raw, 'size', path, 0, 30000, 0),
      count: c.num(raw, 'count', path, 0, 500, 0),
    }
  }
  const width = c.num(raw, 'width', path, 16, 30000, 2048)
  const height = c.num(raw, 'height', path, 0, 30000, 0)
  let grid
  if (Array.isArray(raw.cells)) {
    grid = makeGrid(common.name, 0, 0)
    grid.cells = raw.cells.map((cell, i) => {
      const p = `layout.cells[${i}]`
      if (!isObj(cell)) {
        c.errors.push(`${p} 必须是对象`)
        return { id: uid(), x: 0, y: 0, w: 1, h: 1 }
      }
      const x = c.num(cell, 'x', p, 0, 1)
      const y = c.num(cell, 'y', p, 0, 1)
      return {
        id: uid(),
        x,
        y,
        w: c.num(cell, 'w', p, 0.01, 1 - x),
        h: c.num(cell, 'h', p, 0.01, 1 - y),
        index: cell.index === undefined ? undefined : c.num(cell, 'index', p, 0, 999),
        fit: cell.fit === undefined ? undefined : c.oneOf(cell, 'fit', p, FITS),
        position: cell.position === undefined ? undefined : c.oneOf(cell, 'position', p, POSITIONS),
      }
    })
    if (!grid.cells.length) c.errors.push('layout.cells 不能为空')
  } else {
    const rows = c.num(raw, 'rows', path, 1, 20)
    const cols = c.num(raw, 'cols', path, 1, 20)
    grid = makeGrid(common.name, Math.round(rows), Math.round(cols))
    if (Array.isArray(raw.indexes)) {
      raw.indexes.forEach((v, i) => {
        if (grid!.cells[i] && typeof v === 'number' && v >= 0) grid!.cells[i].index = Math.round(v)
      })
    }
  }
  return { ...grid, ...common, kind: 'grid', width, height: height || width, sizeMode: height ? 'fixed' : 'auto' }
}

export function parseCommand(raw: unknown, layouts: Layout[]): { command?: AiCommand; errors: string[] } {
  const c = new Checker()
  if (!isObj(raw)) return { errors: ['回复必须是 JSON 对象'] }
  const type = c.oneOf(raw, 'type', '$', ['plan', 'need_user', 'done', 'unsupported'] as const)
  if (c.errors.length) return { errors: c.errors }

  if (type === 'need_user') {
    const kind = c.oneOf(raw, 'kind', '$', NEED_KINDS)
    const message = c.str(raw, 'message')
    if (!message) c.errors.push('need_user.message 不能为空')
    const options = Array.isArray(raw.options) ? raw.options.filter((x): x is string => typeof x === 'string') : undefined
    return { command: { type, kind, message, options }, errors: c.errors }
  }
  if (type === 'done') return { command: { type, message: c.str(raw, 'message', '完成') }, errors: [] }
  if (type === 'unsupported') {
    const missing = Array.isArray(raw.missing) ? raw.missing.filter((x): x is string => typeof x === 'string') : []
    return { command: { type, message: c.str(raw, 'message'), missing }, errors: [] }
  }

  // plan
  const layout = raw.layout === undefined ? undefined : parseLayout(c, raw.layout)
  const all = layout ? [...layouts, layout] : layouts
  if (!Array.isArray(raw.steps) || !raw.steps.length) c.errors.push('plan.steps 必须是非空数组')
  const steps: WorkflowStep[] = []
  ;(Array.isArray(raw.steps) ? raw.steps : []).forEach((s, i) => {
    const path = `steps[${i}]`
    if (!isObj(s)) {
      c.errors.push(`${path} 必须是对象`)
      return
    }
    const t = c.oneOf(s, 'type', path, ['edit', 'stitch', 'export'] as const)
    if (t === 'edit') {
      const op = parseOp(c, s.op, `${path}.op`)
      if (op) steps.push({ id: uid(), type: 'edit', op })
    } else if (t === 'stitch') {
      const preset = c.str(s, 'preset')
      const presetId = preset === INLINE_LAYOUT ? layout?.id : preset
      if (!presetId || !all.some((l) => l.id === presetId)) {
        c.errors.push(`${path}.preset「${preset}」不存在：请使用 context.presets 中的 id，或提供 layout 并填 "inline"`)
        return
      }
      steps.push({
        ...(newStep('stitch', presetId) as Extract<WorkflowStep, { type: 'stitch' }>),
        overflow: c.oneOf(s, 'overflow', path, ['chunk', 'first'] as const, 'chunk'),
        remainder: c.oneOf(s, 'remainder', path, ['keep', 'drop'] as const, 'keep'),
        sort: c.oneOf(s, 'sort', path, ['none', 'name', 'nameDesc'] as const, 'none'),
      })
    } else {
      steps.push({
        ...(newStep('export', '') as Extract<WorkflowStep, { type: 'export' }>),
        format: c.oneOf(s, 'format', path, ['png', 'jpeg', 'webp', 'avif'] as const, 'png'),
        quality: c.num(s, 'quality', path, 1, 100, 90),
        target: c.oneOf(s, 'target', path, ['source', 'downloads', 'ask'] as const, 'ask'),
        subDir: c.str(s, 'subDir').replace(/[\\/:*?"<>|]/g, '_'),
        nameTemplate: c.str(s, 'nameTemplate', '{name}').replace(/[\\/:*?"<>|]/g, '_') || '{name}',
      })
    }
  })
  return {
    command: { type: 'plan', summary: c.str(raw, 'summary', 'AI 编排'), steps, layout },
    errors: c.errors,
  }
}

/** 把 plan 转回协议 JSON（用于展示、用户手动编辑后重新执行或回传） */
export function planToJson(plan: AiPlan): string {
  return JSON.stringify(
    {
      type: 'plan',
      summary: plan.summary,
      steps: plan.steps.map((s) => {
        if (s.type === 'edit') return { type: 'edit', op: s.op }
        if (s.type === 'stitch') {
          return {
            type: 'stitch',
            preset: plan.layout && s.presetId === plan.layout.id ? INLINE_LAYOUT : s.presetId,
            overflow: s.overflow,
            remainder: s.remainder,
            sort: s.sort,
          }
        }
        return { type: 'export', format: s.format, quality: s.quality, target: s.target, subDir: s.subDir, nameTemplate: s.nameTemplate }
      }),
      ...(plan.layout ? { layout: layoutToJson(plan.layout) } : {}),
    },
    null,
    2,
  )
}

function layoutToJson(l: Layout) {
  const base = { name: l.name, gap: l.gap, padding: l.padding, radius: l.radius, background: l.background, fit: l.defaultFit, position: l.defaultPosition }
  if (l.kind === 'justify') return { kind: l.kind, ...base, direction: l.direction, lines: l.lines, width: l.width, height: l.height, autoBase: l.autoBase, count: l.count }
  if (l.kind === 'strip') return { kind: l.kind, ...base, direction: l.direction, lanes: l.lanes, size: l.size, count: l.count }
  return {
    kind: l.kind,
    ...base,
    width: l.width,
    height: l.sizeMode === 'fixed' ? l.height : 0,
    cells: l.cells.map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h, index: c.index, fit: c.fit, position: c.position })),
  }
}
