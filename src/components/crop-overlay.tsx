import { useRef } from 'react'

export interface CropRect {
  x: number
  y: number
  w: number
  h: number
}

type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const HANDLES: Array<{ h: Handle; style: React.CSSProperties; cursor: string }> = [
  { h: 'nw', style: { left: 0, top: 0 }, cursor: 'nwse-resize' },
  { h: 'ne', style: { left: '100%', top: 0 }, cursor: 'nesw-resize' },
  { h: 'sw', style: { left: 0, top: '100%' }, cursor: 'nesw-resize' },
  { h: 'se', style: { left: '100%', top: '100%' }, cursor: 'nwse-resize' },
  { h: 'n', style: { left: '50%', top: 0 }, cursor: 'ns-resize' },
  { h: 's', style: { left: '50%', top: '100%' }, cursor: 'ns-resize' },
  { h: 'w', style: { left: 0, top: '50%' }, cursor: 'ew-resize' },
  { h: 'e', style: { left: '100%', top: '50%' }, cursor: 'ew-resize' },
]

const MIN = 0.02

/** 以最大面积、居中放置指定像素比例的裁切框 */
export function fitRatio(ratio: number | null, imgW: number, imgH: number): CropRect {
  if (!ratio) return { x: 0, y: 0, w: 1, h: 1 }
  const imgRatio = imgW / imgH
  if (ratio > imgRatio) {
    const h = imgRatio / ratio
    return { x: 0, y: (1 - h) / 2, w: 1, h }
  }
  const w = ratio / imgRatio
  return { x: (1 - w) / 2, y: 0, w, h: 1 }
}

interface Props {
  rect: CropRect
  onChange: (r: CropRect) => void
  /** 锁定的像素宽高比 */
  ratio: number | null
  imgW: number
  imgH: number
}

/** 覆盖在图片上的裁切框，坐标为 0~1 归一化 */
export function CropOverlay({ rect, onChange, ratio, imgW, imgH }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ handle: Handle; sx: number; sy: number; orig: CropRect } | null>(null)

  const onDown = (handle: Handle) => (e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    ref.current!.setPointerCapture(e.pointerId)
    drag.current = { handle, sx: e.clientX, sy: e.clientY, orig: rect }
  }

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || !ref.current) return
    const box = ref.current.getBoundingClientRect()
    const dx = (e.clientX - d.sx) / box.width
    const dy = (e.clientY - d.sy) / box.height
    const o = d.orig
    let { x, y, w, h } = o
    if (d.handle === 'move') {
      x = Math.min(1 - w, Math.max(0, o.x + dx))
      y = Math.min(1 - h, Math.max(0, o.y + dy))
      onChange({ x, y, w, h })
      return
    }
    let left = o.x
    let top = o.y
    let right = o.x + o.w
    let bottom = o.y + o.h
    if (d.handle.includes('w')) left = Math.min(right - MIN, Math.max(0, o.x + dx))
    if (d.handle.includes('e')) right = Math.max(left + MIN, Math.min(1, o.x + o.w + dx))
    if (d.handle.includes('n')) top = Math.min(bottom - MIN, Math.max(0, o.y + dy))
    if (d.handle.includes('s')) bottom = Math.max(top + MIN, Math.min(1, o.y + o.h + dy))
    w = right - left
    h = bottom - top
    if (ratio) {
      // 归一化坐标下的比例：(w*imgW)/(h*imgH) = ratio
      const k = (ratio * imgH) / imgW
      const vertical = d.handle === 'n' || d.handle === 's'
      if (vertical) w = h * k
      else h = w / k
      // 超出边界时整体收缩；只拖一条边时，另一方向以中心对称扩展
      const cx = o.x + o.w / 2
      const cy = o.y + o.h / 2
      const maxW = d.handle.includes('w') ? o.x + o.w : d.handle.includes('e') ? 1 - o.x : 2 * Math.min(cx, 1 - cx)
      const maxH = d.handle.includes('n') ? o.y + o.h : d.handle.includes('s') ? 1 - o.y : 2 * Math.min(cy, 1 - cy)
      const s = Math.min(1, maxW / w, maxH / h)
      w *= s
      h *= s
      left = d.handle.includes('w') ? o.x + o.w - w : vertical ? o.x + (o.w - w) / 2 : o.x
      top = d.handle.includes('n') ? o.y + o.h - h : !vertical && !d.handle.includes('s') ? o.y + (o.h - h) / 2 : o.y
      left = Math.min(1 - w, Math.max(0, left))
      top = Math.min(1 - h, Math.max(0, top))
    }
    onChange({ x: left, y: top, w, h })
  }

  const pct = (v: number) => `${v * 100}%`
  return (
    <div
      ref={ref}
      className="absolute inset-0 touch-none"
      onPointerMove={onMove}
      onPointerUp={() => (drag.current = null)}
    >
      {/* 四周遮罩 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 bg-black/50" style={{ height: pct(rect.y) }} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/50" style={{ height: pct(1 - rect.y - rect.h) }} />
      <div className="pointer-events-none absolute left-0 bg-black/50" style={{ top: pct(rect.y), height: pct(rect.h), width: pct(rect.x) }} />
      <div className="pointer-events-none absolute right-0 bg-black/50" style={{ top: pct(rect.y), height: pct(rect.h), width: pct(1 - rect.x - rect.w) }} />
      <div
        className="absolute cursor-move border border-white shadow-[0_0_0_1px_rgba(0,0,0,.4)]"
        style={{ left: pct(rect.x), top: pct(rect.y), width: pct(rect.w), height: pct(rect.h) }}
        onPointerDown={onDown('move')}
      >
        <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="border-[0.5px] border-white/30" />
          ))}
        </div>
        {HANDLES.map(({ h, style, cursor }) => (
          <div
            key={h}
            className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-black/40 bg-white"
            style={{ ...style, cursor }}
            onPointerDown={onDown(h)}
          />
        ))}
      </div>
    </div>
  )
}
