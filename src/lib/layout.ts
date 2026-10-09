import type { Fit, GridCell, GridLayout, JustifyLayout, Layout, Position, StripLayout } from './types'

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

export const FIT_LABEL: Record<Fit, string> = {
  cover: '填满裁切',
  contain: '完整显示',
  fill: '拉伸填满',
  none: '原始尺寸',
}

export const POSITION_LABEL: Record<Position, string> = {
  'left top': '左上',
  top: '上',
  'right top': '右上',
  left: '左',
  center: '中',
  right: '右',
  'left bottom': '左下',
  bottom: '下',
  'right bottom': '右下',
}

export const POSITION_GRID: Position[] = [
  'left top', 'top', 'right top',
  'left', 'center', 'right',
  'left bottom', 'bottom', 'right bottom',
]

const BASE = {
  padding: 0,
  gap: 8,
  radius: 0,
  background: '#ffffff',
  defaultFit: 'cover' as Fit,
  defaultPosition: 'center' as Position,
}

export function gridCells(rows: number, cols: number): GridCell[] {
  const cells: GridCell[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({ id: uid(), x: c / cols, y: r / rows, w: 1 / cols, h: 1 / rows })
    }
  }
  return cells
}

export function makeGrid(name: string, rows: number, cols: number, extra?: Partial<GridLayout>): GridLayout {
  return {
    ...BASE,
    id: uid(),
    kind: 'grid',
    name,
    rows,
    cols,
    cells: gridCells(rows, cols),
    sizeMode: 'auto',
    width: 2048,
    height: 2048,
    ...extra,
  }
}

function freeGrid(id: string, name: string, rects: Array<[number, number, number, number]>): GridLayout {
  return {
    ...BASE,
    id,
    kind: 'grid',
    name,
    builtin: true,
    rows: 0,
    cols: 0,
    cells: rects.map(([x, y, w, h], i) => ({ id: `${id}-${i}`, x, y, w, h })),
    sizeMode: 'fixed',
    width: 2048,
    height: 2048,
  }
}

function builtinGrid(rows: number, cols: number): GridLayout {
  const id = `builtin-grid-${rows}x${cols}`
  const g = makeGrid(`${rows} 行 × ${cols} 列`, rows, cols, { id, builtin: true })
  g.cells = g.cells.map((c, i) => ({ ...c, id: `${id}-${i}` }))
  return g
}

function builtinStrip(id: string, name: string, direction: StripLayout['direction'], lanes: number): StripLayout {
  return { ...BASE, gap: 0, id, kind: 'strip', name, builtin: true, direction, size: 0, lanes, count: 0 }
}

function builtinJustify(
  id: string,
  name: string,
  direction: JustifyLayout['direction'],
  lines: number,
  count = 0,
): JustifyLayout {
  return {
    ...BASE,
    gap: 0,
    id,
    kind: 'justify',
    name,
    builtin: true,
    direction,
    lines,
    width: 0,
    height: 0,
    autoBase: 'min',
    count,
  }
}

const T = 1 / 3
export const BUILTIN_LAYOUTS: Layout[] = [
  builtinJustify('builtin-justify-h', '等高横拼', 'horizontal', 1),
  builtinJustify('builtin-justify-v', '等宽竖拼', 'vertical', 1),
  builtinJustify('builtin-justify-h2', '等高两行', 'horizontal', 2),
  builtinJustify('builtin-justify-pair', '每两张等高横拼', 'horizontal', 1, 2),
  builtinStrip('builtin-strip-v', '竖向长图', 'vertical', 1),
  builtinStrip('builtin-strip-h', '横向长图', 'horizontal', 1),
  builtinStrip('builtin-strip-v2', '双列瀑布', 'vertical', 2),
  builtinGrid(1, 2),
  builtinGrid(2, 1),
  builtinGrid(1, 3),
  builtinGrid(3, 1),
  builtinGrid(2, 2),
  builtinGrid(2, 3),
  builtinGrid(3, 2),
  builtinGrid(3, 3),
  builtinGrid(4, 4),
  freeGrid('builtin-free-l1r2', '左一右二', [[0, 0, 0.5, 1], [0.5, 0, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]]),
  freeGrid('builtin-free-l2r1', '左二右一', [[0, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0, 0.5, 1]]),
  freeGrid('builtin-free-t1b2', '上一下二', [[0, 0, 1, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]]),
  freeGrid('builtin-free-t1b3', '上一下三', [[0, 0, 1, 2 * T], [0, 2 * T, T, T], [T, 2 * T, T, T], [2 * T, 2 * T, T, T]]),
  freeGrid('builtin-free-big5', '一大五小', [
    [0, 0, 2 * T, 2 * T], [2 * T, 0, T, T], [2 * T, T, T, T], [0, 2 * T, T, T], [T, 2 * T, T, T], [2 * T, 2 * T, T, T],
  ]),
  // 中心格排第一，第 1 张图放在中间
  freeGrid('builtin-free-center', '中心九宫', [
    [T, T, T, T],
    [0, 0, T, T], [T, 0, T, T], [2 * T, 0, T, T],
    [0, T, T, T], [2 * T, T, T, T],
    [0, 2 * T, T, T], [T, 2 * T, T, T], [2 * T, 2 * T, T, T],
  ]),
]

/** 格子使用的图片序号：优先预设里的 index，否则按格子顺序 */
export function cellIndex(cell: GridCell, order: number) {
  return cell.index ?? order
}

/** 该布局一次需要的图片数；0 表示不限（全部） */
export function slotCount(layout: Layout) {
  if (layout.kind !== 'grid') return Math.max(0, Math.round(layout.count || 0))
  return layout.cells.reduce((m, c, i) => Math.max(m, cellIndex(c, i) + 1), 0)
}

export interface ResolvedCell {
  key: string
  /** 网格中的格子序号（strip 为图片序号） */
  order: number
  slot: number
  left: number
  top: number
  width: number
  height: number
  fit: Fit
  position: Position
  background?: string
}

export interface ResolvedLayout {
  width: number
  height: number
  cells: ResolvedCell[]
}

interface Size {
  width: number
  height: number
}

const MAX_SIDE = 30000
const EPS = 1e-6

function median(values: number[]) {
  const s = [...values].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

export function resolveLayout(layout: Layout, images: Array<Size | null | undefined>): ResolvedLayout {
  if (layout.kind === 'strip') return resolveStrip(layout, images)
  if (layout.kind === 'justify') return resolveJustify(layout, images)
  return resolveGrid(layout, images)
}

function resolveGrid(layout: GridLayout, images: Array<Size | null | undefined>): ResolvedLayout {
  const pad = Math.max(0, layout.padding)
  const gap = Math.max(0, layout.gap)
  const W = Math.max(16, Math.round(layout.width))
  const innerW = Math.max(1, W - pad * 2)
  let H: number
  if (layout.sizeMode === 'fixed') {
    H = Math.max(16, Math.round(layout.height))
  } else {
    // 自动高度：让格子比例尽量贴合图片比例（取中位数）
    const candidates: number[] = []
    layout.cells.forEach((cell, i) => {
      const img = images[cellIndex(cell, i)]
      if (img && img.width > 0 && cell.h > 0) {
        candidates.push((cell.w * innerW * img.height) / (cell.h * img.width))
      }
    })
    const innerH = candidates.length
      ? median(candidates)
      : layout.rows && layout.cols
        ? (innerW * layout.rows) / layout.cols
        : innerW
    H = Math.round(Math.min(MAX_SIDE, innerH + pad * 2))
  }
  const innerH = Math.max(1, H - pad * 2)
  const cells = layout.cells.map((cell, i): ResolvedCell => {
    const x0 = pad + cell.x * innerW + (cell.x > EPS ? gap / 2 : 0)
    const x1 = pad + (cell.x + cell.w) * innerW - (cell.x + cell.w < 1 - EPS ? gap / 2 : 0)
    const y0 = pad + cell.y * innerH + (cell.y > EPS ? gap / 2 : 0)
    const y1 = pad + (cell.y + cell.h) * innerH - (cell.y + cell.h < 1 - EPS ? gap / 2 : 0)
    return {
      key: cell.id,
      order: i,
      slot: cellIndex(cell, i),
      left: Math.round(x0),
      top: Math.round(y0),
      width: Math.max(1, Math.round(x1) - Math.round(x0)),
      height: Math.max(1, Math.round(y1) - Math.round(y0)),
      fit: cell.fit ?? layout.defaultFit,
      position: cell.position ?? layout.defaultPosition,
      background: cell.background,
    }
  })
  return { width: W, height: H, cells }
}

function resolveStrip(layout: StripLayout, images: Array<Size | null | undefined>): ResolvedLayout {
  const pad = Math.max(0, layout.padding)
  const gap = Math.max(0, layout.gap)
  const lanes = Math.max(1, Math.round(layout.lanes))
  const vertical = layout.direction === 'vertical'
  const first = images.find((x): x is Size => !!x && x.width > 0)
  const laneSize = Math.max(16, Math.round(layout.size || (first ? (vertical ? first.width : first.height) : 1024)))
  const laneOffsets = new Array(lanes).fill(0)
  const cells: ResolvedCell[] = []
  images.forEach((img, i) => {
    if (!img || img.width <= 0 || img.height <= 0) return
    const lane = laneOffsets.indexOf(Math.min(...laneOffsets))
    const along = Math.max(1, Math.round(vertical ? (laneSize * img.height) / img.width : (laneSize * img.width) / img.height))
    const cross = pad + lane * (laneSize + gap)
    const pos = pad + laneOffsets[lane]
    cells.push({
      key: `strip-${i}`,
      order: i,
      slot: i,
      left: vertical ? cross : pos,
      top: vertical ? pos : cross,
      width: vertical ? laneSize : along,
      height: vertical ? along : laneSize,
      fit: 'fill',
      position: 'center',
    })
    laneOffsets[lane] += along + gap
  })
  const crossTotal = pad * 2 + lanes * laneSize + (lanes - 1) * gap
  const alongTotal = Math.max(1, Math.max(...laneOffsets) - (cells.length ? gap : 0)) + pad * 2
  const width = Math.min(MAX_SIDE, vertical ? crossTotal : alongTotal)
  const height = Math.min(MAX_SIDE, vertical ? alongTotal : crossTotal)
  return { width, height, cells }
}

/** 按顺序把图片分成 n 行，使每行宽高比之和尽量平均 */
function partition(aspects: number[], lines: number): number[][] {
  const n = Math.min(Math.max(1, lines), aspects.length)
  const rows: number[][] = []
  let start = 0
  let remaining = aspects.reduce((a, b) => a + b, 0)
  for (let r = 0; r < n; r++) {
    const left = n - r
    if (left === 1) {
      rows.push(aspects.map((_, i) => i).slice(start))
      break
    }
    const target = remaining / left
    const row: number[] = []
    let sum = 0
    // 至少给后面的行各留一张
    while (start < aspects.length - (left - 1)) {
      const a = aspects[start]
      if (row.length && Math.abs(sum + a - target) > Math.abs(sum - target)) break
      row.push(start)
      sum += a
      start++
    }
    remaining -= sum
    rows.push(row)
  }
  return rows
}

function resolveJustify(layout: JustifyLayout, images: Array<Size | null | undefined>): ResolvedLayout {
  const horizontal = layout.direction === 'horizontal'
  const pad = Math.max(0, layout.padding)
  const gap = Math.max(0, layout.gap)
  // 统一按“横向等高”计算，纵向时交换宽高
  const items = images
    .map((img, i) => ({ img, i }))
    .filter((x): x is { img: Size; i: number } => !!x.img && x.img.width > 0 && x.img.height > 0)
    .map(({ img, i }) => ({
      slot: i,
      w: horizontal ? img.width : img.height,
      h: horizontal ? img.height : img.width,
    }))
  const fixedMain = Math.max(0, Math.round(horizontal ? layout.width : layout.height))
  const fixedCross = Math.max(0, Math.round(horizontal ? layout.height : layout.width))
  if (!items.length) {
    const w = fixedMain || 1024
    const h = fixedCross || 1024
    return { width: horizontal ? w : h, height: horizontal ? h : w, cells: [] }
  }
  const aspects = items.map((x) => x.w / x.h)
  const rows = partition(aspects, layout.lines)
  const rowAspect = rows.map((r) => r.reduce((s, i) => s + aspects[i], 0))
  const rowGaps = rows.map((r) => (r.length - 1) * gap)
  const crossGaps = (rows.length - 1) * gap

  let innerMain: number
  let rowHeights: number[]
  if (fixedMain) {
    // 定宽：每行铺满宽度，行高由宽度反推
    innerMain = Math.max(1, fixedMain - pad * 2)
    rowHeights = rows.map((_, r) => Math.max(1, (innerMain - rowGaps[r]) / rowAspect[r]))
    if (fixedCross) {
      // 宽高都固定：整体缩放行高以填满高度，格子比例的微小偏差由 cover 裁切
      const target = Math.max(rows.length, fixedCross - pad * 2 - crossGaps)
      const k = target / rowHeights.reduce((a, b) => a + b, 0)
      rowHeights = rowHeights.map((h) => h * k)
    }
  } else {
    let lineH: number
    if (fixedCross) {
      lineH = Math.max(1, (fixedCross - pad * 2 - crossGaps) / rows.length)
    } else {
      const hs = items.map((x) => x.h)
      lineH = layout.autoBase === 'max' ? Math.max(...hs) : layout.autoBase === 'median' ? median(hs) : Math.min(...hs)
    }
    rowHeights = rows.map(() => lineH)
    innerMain = Math.max(...rows.map((_, r) => lineH * rowAspect[r] + rowGaps[r]))
  }

  const cells: ResolvedCell[] = []
  let crossPos = pad
  rows.forEach((row, r) => {
    const rh = Math.round(rowHeights[r])
    // 行内宽度按比例分配，保证铺满 innerMain
    const avail = innerMain - rowGaps[r]
    let mainPos = pad
    row.forEach((idx, j) => {
      const end = j === row.length - 1 ? pad + innerMain : mainPos + (avail * aspects[idx]) / rowAspect[r]
      const len = Math.max(1, Math.round(end) - Math.round(mainPos))
      const it = items[idx]
      cells.push({
        key: `justify-${it.slot}`,
        order: it.slot,
        slot: it.slot,
        left: horizontal ? Math.round(mainPos) : crossPos,
        top: horizontal ? crossPos : Math.round(mainPos),
        width: horizontal ? len : rh,
        height: horizontal ? rh : len,
        fit: 'cover',
        position: layout.defaultPosition,
      })
      mainPos = end + gap
    })
    crossPos += rh + gap
  })
  const main = Math.min(MAX_SIDE, Math.round(innerMain + pad * 2))
  const cross = Math.min(MAX_SIDE, fixedCross && fixedMain ? fixedCross : crossPos - gap + pad)
  return { width: horizontal ? main : cross, height: horizontal ? cross : main, cells }
}

// ---------- 自由网格编辑辅助 ----------

export function splitCell(cells: GridCell[], id: string, dir: 'h' | 'v'): GridCell[] {
  const out: GridCell[] = []
  for (const c of cells) {
    if (c.id !== id) {
      out.push(c)
      continue
    }
    const { index: _drop, ...rest } = c
    void _drop
    if (dir === 'v') {
      out.push({ ...rest, id: uid(), w: c.w / 2 }, { ...rest, id: uid(), x: c.x + c.w / 2, w: c.w / 2 })
    } else {
      out.push({ ...rest, id: uid(), h: c.h / 2 }, { ...rest, id: uid(), y: c.y + c.h / 2, h: c.h / 2 })
    }
  }
  return out
}

export function clampCell(c: GridCell): GridCell {
  const w = Math.min(1, Math.max(0.02, c.w))
  const h = Math.min(1, Math.max(0.02, c.h))
  return { ...c, w, h, x: Math.min(1 - w, Math.max(0, c.x)), y: Math.min(1 - h, Math.max(0, c.y)) }
}

/** 吸附到 1/24 网格及其它格子的边 */
export function snap(v: number, edges: number[], step = 1 / 24, threshold = 0.012) {
  let best = Math.round(v / step) * step
  let bestDist = Math.abs(best - v)
  for (const e of edges) {
    const d = Math.abs(e - v)
    if (d < threshold && d <= bestDist) {
      best = e
      bestDist = d
    }
  }
  return bestDist < threshold ? best : v
}

export function cloneLayout<T extends Layout>(layout: T, name?: string): T {
  const copy = JSON.parse(JSON.stringify(layout)) as T
  copy.id = uid()
  copy.builtin = false
  copy.name = name ?? `${layout.name} 副本`
  if (copy.kind === 'grid') copy.cells = copy.cells.map((c) => ({ ...c, id: uid() }))
  return copy
}
