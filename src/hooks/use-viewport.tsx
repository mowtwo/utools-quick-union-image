import { Maximize, ZoomIn, ZoomOut } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { usePageShortcuts } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'

const MIN_SCALE = 0.02
const MAX_SCALE = 8

interface View {
  /** 绝对缩放；null = 适应窗口 */
  zoom: number | null
  x: number
  y: number
}

const FIT: View = { zoom: null, x: 0, y: 0 }

/**
 * 画布独立缩放 / 平移（不影响整个插件的界面缩放）
 * - 触控板双指捏合（Chromium 中表现为 ctrl + wheel）/ ⌘、Ctrl + 滚轮：以光标为中心缩放
 * - 触控板双指滑动 / 滚轮：平移（Shift + 滚轮横向）
 * - 按住空格拖动、鼠标中键拖动、拖动空白处：平移
 * - 双击空白处：适应窗口
 */
export function useViewport(fitScale: number, resetKey: unknown) {
  const ref = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>(FIT)
  const scale = view.zoom ?? fitScale
  const latest = useRef({ scale, view })
  latest.current = { scale, view }
  const [space, setSpace] = useState(false)
  const spaceRef = useRef(false)
  spaceRef.current = space
  const pan = useRef<{ id: number; x: number; y: number } | null>(null)
  const [panning, setPanning] = useState(false)

  useEffect(() => {
    setView(FIT)
  }, [resetKey])

  /** 缩放到 next，并保持 (clientX, clientY) 下的内容不动 */
  const zoomTo = useCallback((next: number, clientX?: number, clientY?: number) => {
    const el = ref.current
    if (!el) return
    const { scale: s, view: v } = latest.current
    const target = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next))
    const rect = el.getBoundingClientRect()
    const px = (clientX ?? rect.left + rect.width / 2) - (rect.left + rect.width / 2)
    const py = (clientY ?? rect.top + rect.height / 2) - (rect.top + rect.height / 2)
    const k = target / s
    setView({ zoom: target, x: px - (px - v.x) * k, y: py - (py - v.y) * k })
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1
      if (e.ctrlKey || e.metaKey) {
        // 触控板捏合是细粒度小步长，鼠标滚轮一格约 100，限制单步幅度
        const d = Math.max(-40, Math.min(40, e.deltaY * unit))
        zoomTo(latest.current.scale * Math.exp(-d * 0.01), e.clientX, e.clientY)
        return
      }
      let dx = e.deltaX * unit
      let dy = e.deltaY * unit
      if (e.shiftKey && dx === 0) [dx, dy] = [dy, 0]
      setView((v) => ({ zoom: v.zoom ?? latest.current.scale, x: v.x - dx, y: v.y - dy }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomTo])

  useEffect(() => {
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      return !!t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))
    }
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !typing(e) && ref.current?.matches(':hover')) {
        // 捕获阶段拦截，避免空格触发仍有焦点的按钮（如下拉菜单）
        e.preventDefault()
        e.stopPropagation()
        setSpace(true)
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !spaceRef.current) return
      e.preventDefault()
      e.stopPropagation()
      setSpace(false)
    }
    const blur = () => setSpace(false)
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up, true)
      window.removeEventListener('blur', blur)
    }
  }, [])

  /** 绑定到画布容器上；捕获阶段处理，空格 / 中键拖动时不会触发格子的选中和拖拽 */
  const panHandlers = {
    onPointerDownCapture: (e: React.PointerEvent) => {
      const onBackground = e.target === e.currentTarget && e.button === 0
      if (!(e.button === 1 || (space && e.button === 0) || onBackground)) return
      e.preventDefault()
      e.stopPropagation()
      e.currentTarget.setPointerCapture(e.pointerId)
      pan.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
      setPanning(true)
    },
    onPointerMove: (e: React.PointerEvent) => {
      const p = pan.current
      if (!p || p.id !== e.pointerId) return
      const dx = e.clientX - p.x
      const dy = e.clientY - p.y
      pan.current = { ...p, x: e.clientX, y: e.clientY }
      setView((v) => ({ zoom: v.zoom ?? latest.current.scale, x: v.x + dx, y: v.y + dy }))
    },
    onPointerUp: (e: React.PointerEvent) => {
      if (pan.current?.id !== e.pointerId) return
      pan.current = null
      setPanning(false)
    },
    onDoubleClick: (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) setView(FIT)
    },
  }

  usePageShortcuts({
    zoomIn: () => zoomTo(latest.current.scale * 1.25),
    zoomOut: () => zoomTo(latest.current.scale / 1.25),
    zoomFit: () => setView(FIT),
    zoomActual: () => zoomTo(1),
  })

  return {
    ref,
    scale,
    offset: { x: view.x, y: view.y },
    isFit: view.zoom === null,
    panHandlers,
    /** 拖动中或按住空格时的光标 */
    cursor: panning ? 'grabbing' : space ? 'grab' : undefined,
    /** 空格模式下屏蔽内容区的指针事件 */
    blockContent: space || panning,
    /** 平移到指定偏移（相对居中位置） */
    panTo: (x: number, y: number) => setView((v) => ({ zoom: v.zoom ?? latest.current.scale, x, y })),
    zoomIn: () => zoomTo(scale * 1.25),
    zoomOut: () => zoomTo(scale / 1.25),
    actual: () => zoomTo(1),
    fit: () => setView(FIT),
  }
}

export function ViewportControls({
  vp,
  className,
}: {
  vp: ReturnType<typeof useViewport>
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-0.5 rounded-md border bg-background/90 p-0.5 shadow-sm backdrop-blur',
        className,
      )}
      title="双指捏合 / ⌘ + 滚轮缩放；双指滑动、空格拖动或拖动空白处平移；双击空白处适应窗口"
    >
      <Button size="icon-xs" variant="ghost" title="缩小视图" onClick={vp.zoomOut}>
        <ZoomOut />
      </Button>
      <button className="w-10 text-center text-[11px] tabular-nums hover:text-primary" title="实际像素（1:1）" onClick={vp.actual}>
        {Math.round(vp.scale * 100)}%
      </button>
      <Button size="icon-xs" variant="ghost" title="放大视图" onClick={vp.zoomIn}>
        <ZoomIn />
      </Button>
      <Button size="icon-xs" variant={vp.isFit ? 'secondary' : 'ghost'} title="适应窗口" onClick={vp.fit}>
        <Maximize />
      </Button>
    </div>
  )
}
