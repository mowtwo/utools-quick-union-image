import { resolveLayout } from './layout'
import type { Layout } from './types'

interface StitchSource {
  path: string
  width: number
  height: number
}

/** 把布局解析为 preload 可执行的拼接任务（images 按 slot 排列，可含空位） */
export function buildStitchJob(
  layout: Layout,
  images: Array<StitchSource | null | undefined>,
  name: string,
  thumbSize?: number,
): StitchJob {
  const resolved = resolveLayout(layout, images)
  const W = resolved.width
  const H = resolved.height
  const cells: StitchJobCell[] = []
  for (const c of resolved.cells) {
    // 裁到画布内，避免 composite 越界
    const left = Math.max(0, Math.min(W - 1, c.left))
    const top = Math.max(0, Math.min(H - 1, c.top))
    const width = Math.max(1, Math.min(c.width, W - left))
    const height = Math.max(1, Math.min(c.height, H - top))
    const img = images[c.slot]
    cells.push({
      left,
      top,
      width,
      height,
      image: img?.path ?? null,
      fit: c.fit,
      position: c.position,
      background: c.background,
      radius: layout.radius,
    })
  }
  return { name, width: W, height: H, background: layout.background, cells, thumbSize }
}
