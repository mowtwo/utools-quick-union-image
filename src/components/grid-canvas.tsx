import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { TRAY_MIME } from '@/components/image-tray'
import { useViewport, ViewportControls } from '@/hooks/use-viewport'
import { clampCell, resolveLayout, snap, type ResolvedCell } from '@/lib/layout'
import type { GridCell, ImageItem, Layout, Position } from '@/lib/types'
import { droppedPaths } from '@/lib/bridge'
import { cn } from '@/lib/utils'

const CELL_MIME = 'application/x-quick-union-slot'

const FACTOR: Record<Position, [number, number]> = {
  center: [0.5, 0.5], top: [0.5, 0], bottom: [0.5, 1], left: [0, 0.5], right: [1, 0.5],
  'left top': [0, 0], 'right top': [1, 0], 'left bottom': [0, 1], 'right bottom': [1, 1],
}

export const CHECKER =
  'repeating-conic-gradient(color-mix(in oklch, var(--muted-foreground) 18%, transparent) 0 25%, transparent 0 50%) 0 0 / 16px 16px'

interface Props {
  layout: Layout
  /** 按 slot 排列的图片 */
  images: Array<ImageItem | null | undefined>
  selected?: string[]
  onSelect?: (keys: string[]) => void
  /** 自由编辑格子（仅 grid） */
  editable?: boolean
  onCellsChange?: (cells: GridCell[]) => void
  /** 图片栏的图片拖到格子上 */
  onDropTray?: (slot: number, trayIndex: number) => void
  /** 两个格子互换图片 */
  onSwapSlots?: (a: number, b: number) => void
  /** 拖动序号徽标：把 from 号图片移动到 to 号位置（其余顺延） */
  onMoveSlot?: (from: number, to: number) => void
  /** 从系统拖入文件到某个格子 */
  onDropFiles?: (slot: number, paths: string[]) => void
  className?: string
}

type Drag =
  | { kind: 'move' | 'resize'; id: string; startX: number; startY: number; orig: GridCell; moved: boolean; additive: boolean }
  | null

export function GridCanvas({
  layout,
  images,
  selected = [],
  onSelect,
  editable,
  onCellsChange,
  onDropTray,
  onSwapSlots,
  onMoveSlot,
  onDropFiles,
  className,
}: Props) {
  const [badge, setBadge] = useState<{ from: number; sx: number; sy: number; x: number; y: number; over: number | null; moved: boolean } | null>(null)
  const badgeRef = useRef(badge)
  badgeRef.current = badge

  // 序号徽标拖动：用指针事件实现，支持触控板，且不与格子的拖拽交换冲突
  useEffect(() => {
    if (!badge) return
    const move = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-cell-slot]')
      const over = el ? Number(el.dataset.cellSlot) : null
      setBadge((b) => b && { ...b, x: e.clientX, y: e.clientY, over, moved: b.moved || Math.hypot(e.clientX - b.sx, e.clientY - b.sy) > 3 })
    }
    const up = () => {
      const b = badgeRef.current
      setBadge(null)
      if (b?.moved && b.over !== null && b.over !== b.from) onMoveSlot?.(b.from, b.over)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [badge !== null, onMoveSlot]) // eslint-disable-line react-hooks/exhaustive-deps

  const [box, setBox] = useState({ w: 400, h: 300 })
  const [drag, setDrag] = useState<Drag>(null)
  const [over, setOver] = useState<string | null>(null)

  const resolved = useMemo(() => resolveLayout(layout, images), [layout, images])
  const fitScale = Math.min((box.w - 24) / resolved.width, (box.h - 24) / resolved.height, 4)
  const vp = useViewport(fitScale, layout.id)
  const scale = vp.scale

  useEffect(() => {
    const el = vp.ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setBox({ w: entry.contentRect.width, h: entry.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [vp.ref])
  const stageW = resolved.width * scale
  const stageH = resolved.height * scale
  const pad = layout.padding * scale
  const innerW = stageW - pad * 2
  const innerH = stageH - pad * 2
  const transparentBg = !layout.background || layout.background === 'transparent'
  const gridCells = layout.kind === 'grid' ? layout.cells : []

  // 选中项不在可视区域时（如从图层列表点选），平移画布把它移到中间
  const selectedKey = selected[0]
  useEffect(() => {
    const el = vp.ref.current
    if (!selectedKey || !el) return
    const node = el.querySelector<HTMLElement>(`[data-cell-key="${CSS.escape(selectedKey)}"]`)
    const cell = resolved.cells.find((c) => c.key === selectedKey)
    if (!node || !cell) return
    const view = el.getBoundingClientRect()
    const r = node.getBoundingClientRect()
    const visible = r.right > view.left + 8 && r.left < view.right - 8 && r.bottom > view.top + 8 && r.top < view.bottom - 8
    if (visible) return
    const cx = (cell.left + cell.width / 2) * scale
    const cy = (cell.top + cell.height / 2) * scale
    vp.panTo(stageW / 2 - cx, stageH / 2 - cy)
  }, [selectedKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const select = (key: string, additive: boolean) => {
    if (!onSelect) return
    if (additive) onSelect(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key])
    else onSelect([key])
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag || !onCellsChange || layout.kind !== 'grid') return
    const dx = (e.clientX - drag.startX) / innerW
    const dy = (e.clientY - drag.startY) / innerH
    if (!drag.moved && Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY) < 4) return
    if (!drag.moved) setDrag({ ...drag, moved: true })
    const others = gridCells.filter((c) => c.id !== drag.id)
    const xs = [0, 1, ...others.flatMap((c) => [c.x, c.x + c.w])]
    const ys = [0, 1, ...others.flatMap((c) => [c.y, c.y + c.h])]
    const o = drag.orig
    let next: GridCell
    if (drag.kind === 'move') {
      let x = snap(o.x + dx, xs)
      const xr = snap(o.x + dx + o.w, xs)
      if (xr !== o.x + dx + o.w && x === o.x + dx) x = xr - o.w
      let y = snap(o.y + dy, ys)
      const yb = snap(o.y + dy + o.h, ys)
      if (yb !== o.y + dy + o.h && y === o.y + dy) y = yb - o.h
      next = clampCell({ ...o, x, y })
    } else {
      const r = snap(o.x + o.w + dx, xs)
      const b = snap(o.y + o.h + dy, ys)
      next = clampCell({ ...o, w: r - o.x, h: b - o.y })
    }
    onCellsChange(gridCells.map((c) => (c.id === drag.id ? next : c)))
  }

  const endDrag = () => {
    if (drag && !drag.moved) select(drag.id, drag.additive)
    setDrag(null)
  }

  const renderImage = (cell: ResolvedCell, img: ImageItem) => {
    const w = cell.width * scale
    const h = cell.height * scale
    if (cell.fit === 'none') {
      const [fx, fy] = FACTOR[cell.position]
      const iw = img.width * scale
      const ih = img.height * scale
      return (
        <img
          src={img.url}
          alt=""
          draggable={false}
          className="absolute max-w-none"
          style={{ width: iw, height: ih, left: (w - iw) * fx, top: (h - ih) * fy }}
        />
      )
    }
    return (
      <img
        src={img.url}
        alt=""
        draggable={false}
        className="absolute inset-0 size-full max-w-none"
        style={{ objectFit: cell.fit, objectPosition: cell.position }}
      />
    )
  }

  return (
    <div
      ref={vp.ref}
      className={cn('relative flex min-h-0 min-w-0 flex-1 touch-none items-center justify-center overflow-hidden', className)}
      style={{ cursor: vp.cursor }}
      {...vp.panHandlers}
    >
      <div
        className="relative shrink-0 shadow-md ring-1 ring-border"
        style={{
          width: stageW,
          height: stageH,
          background: transparentBg ? CHECKER : layout.background,
          transform: `translate(${vp.offset.x}px, ${vp.offset.y}px)`,
          pointerEvents: vp.blockContent ? 'none' : undefined,
        }}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={() => drag && setDrag(null)}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) onSelect?.([])
        }}
      >
        {resolved.cells.map((cell) => {
          const img = images[cell.slot]
          const isSel = selected.includes(cell.key)
          const style: CSSProperties = {
            left: cell.left * scale,
            top: cell.top * scale,
            width: cell.width * scale,
            height: cell.height * scale,
            borderRadius: layout.radius * scale,
            background: cell.background && cell.background !== 'transparent' ? cell.background : undefined,
          }
          const gridCell = gridCells.find((c) => c.id === cell.key)
          return (
            <div
              key={cell.key}
              data-cell-slot={cell.slot}
              data-cell-key={cell.key}
              className={cn(
                'absolute overflow-hidden select-none',
                !img && 'border border-dashed border-muted-foreground/50 bg-muted/60',
                editable ? 'cursor-move' : 'cursor-pointer',
                (over === cell.key || (badge?.moved && badge.over === cell.slot && badge.from !== cell.slot)) &&
                  'ring-2 ring-primary ring-offset-1',
                badge?.moved && badge.from === cell.slot && 'opacity-50',
              )}
              style={style}
              draggable={!editable && !!img && !!onSwapSlots}
              onDragStart={(e) => e.dataTransfer.setData(CELL_MIME, String(cell.slot))}
              onDragOver={(e) => {
                const t = e.dataTransfer.types
                if ((t.includes(TRAY_MIME) && onDropTray) || (t.includes(CELL_MIME) && onSwapSlots) || (t.includes('Files') && onDropFiles)) {
                  e.preventDefault()
                  setOver(cell.key)
                }
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                setOver(null)
                const tray = e.dataTransfer.getData(TRAY_MIME)
                const slot = e.dataTransfer.getData(CELL_MIME)
                const files = onDropFiles ? droppedPaths(e) : []
                if (files.length && onDropFiles) {
                  e.preventDefault()
                  e.stopPropagation()
                  onDropFiles(cell.slot, files)
                } else if (tray !== '' && onDropTray) {
                  e.preventDefault()
                  e.stopPropagation()
                  onDropTray(cell.slot, Number(tray))
                } else if (slot !== '' && onSwapSlots) {
                  e.preventDefault()
                  e.stopPropagation()
                  onSwapSlots(Number(slot), cell.slot)
                }
              }}
              onPointerDown={(e) => {
                if (e.button !== 0) return
                const additive = e.shiftKey || e.metaKey || e.ctrlKey
                if (editable && gridCell) {
                  e.stopPropagation()
                  ;(e.currentTarget.parentElement as HTMLElement).setPointerCapture(e.pointerId)
                  setDrag({ kind: 'move', id: gridCell.id, startX: e.clientX, startY: e.clientY, orig: gridCell, moved: false, additive })
                }
              }}
              onClick={(e) => {
                if (!editable) select(cell.key, e.shiftKey || e.metaKey || e.ctrlKey)
              }}
            >
              {img && renderImage(cell, img)}
              <span
                className={cn(
                  'absolute top-1 left-1 z-10 min-w-5 rounded px-1 text-center text-[11px] leading-5 font-semibold tabular-nums shadow',
                  img ? 'bg-black/60 text-white' : 'bg-background text-foreground',
                  onMoveSlot && 'cursor-grab hover:bg-primary hover:text-primary-foreground',
                )}
                title={onMoveSlot ? '拖动序号到其他格子，调整顺序' : undefined}
                onMouseDown={(e) => onMoveSlot && e.preventDefault()}
                onPointerDown={(e) => {
                  if (!onMoveSlot || e.button !== 0) return
                  e.stopPropagation()
                  setBadge({ from: cell.slot, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, over: null, moved: false })
                }}
                onClick={(e) => {
                  if (!onMoveSlot) return
                  e.stopPropagation()
                  select(cell.key, e.shiftKey || e.metaKey || e.ctrlKey)
                }}
              >
                {cell.slot + 1}
              </span>
              {isSel && <div className="pointer-events-none absolute inset-0 bg-sky-500/10 ring-3 ring-sky-500 ring-inset" />}
              {editable && gridCell && (
                <div
                  className="absolute right-0 bottom-0 size-3.5 cursor-nwse-resize rounded-tl bg-primary"
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    ;(e.currentTarget.parentElement!.parentElement as HTMLElement).setPointerCapture(e.pointerId)
                    setDrag({ kind: 'resize', id: gridCell.id, startX: e.clientX, startY: e.clientY, orig: gridCell, moved: true, additive: false })
                  }}
                />
              )}
            </div>
          )
        })}
      </div>
      <ViewportControls vp={vp} className="absolute bottom-1.5 left-1.5" />
      {badge?.moved && (
        <div
          className="pointer-events-none fixed z-50 flex min-w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded bg-primary px-1.5 text-xs leading-6 font-semibold text-primary-foreground shadow-lg"
          style={{ left: badge.x, top: badge.y }}
        >
          {badge.from + 1}
          {badge.over !== null && badge.over !== badge.from && <span className="ml-1 opacity-80">→ {badge.over + 1}</span>}
        </div>
      )}
      <div className="pointer-events-none absolute right-2 bottom-1 text-[10px] text-muted-foreground tabular-nums">
        输出 {resolved.width} × {resolved.height}
      </div>
    </div>
  )
}
