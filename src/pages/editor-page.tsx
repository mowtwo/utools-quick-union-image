import {
  Check,
  Copy,
  CopyCheck,
  Download,
  FlipHorizontal2,
  FlipVertical2,
  RotateCcw,
  RotateCcwSquare,
  RotateCwSquare,
  Undo2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CropOverlay, fitRatio, type CropRect } from '@/components/crop-overlay'
import { ColorInput, Field, NumberInput, Section, SimpleSelect } from '@/components/form'
import { CHECKER } from '@/components/grid-canvas'
import { ImageTray } from '@/components/image-tray'
import { copyImage, saveImageAs } from '@/components/result-dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Toggle } from '@/components/ui/toggle'
import { useViewport, ViewportControls } from '@/hooks/use-viewport'
import { errorMessage, mapLimit, services, toImageItem, TRAY_THUMB } from '@/lib/bridge'
import { undo, useHistory } from '@/lib/history'
import { modKey, usePageShortcuts } from '@/lib/shortcuts'
import type { EditOp, ImageItem } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'

const RATIOS: Array<{ label: string; value: number | null | 'orig' }> = [
  { label: '自由', value: null },
  { label: '原比例', value: 'orig' },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:4', value: 3 / 4 },
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 },
  { label: '3:2', value: 3 / 2 },
  { label: '2:3', value: 2 / 3 },
]

type ResizeMode = 'scale' | 'width' | 'height'

interface EditState {
  angle: number
  background: string
  flipH: boolean
  flipV: boolean
  cropOn: boolean
  crop: CropRect
  ratioKey: string
  resizeMode: ResizeMode
  scale: number
  width: number
  height: number
}

const INITIAL: EditState = {
  angle: 0,
  background: 'transparent',
  flipH: false,
  flipV: false,
  cropOn: false,
  crop: { x: 0, y: 0, w: 1, h: 1 },
  ratioKey: '自由',
  resizeMode: 'scale',
  scale: 100,
  width: 0,
  height: 0,
}

function baseOps(s: EditState): EditOp[] {
  const ops: EditOp[] = []
  if (s.angle % 360 !== 0) ops.push({ type: 'rotate', angle: s.angle, background: s.background })
  if (s.flipH || s.flipV) ops.push({ type: 'flip', horizontal: s.flipH, vertical: s.flipV })
  return ops
}

function finalOps(s: EditState): EditOp[] {
  const ops = baseOps(s)
  if (s.cropOn) ops.push({ type: 'crop', ...s.crop })
  if (s.resizeMode === 'scale' && s.scale !== 100) ops.push({ type: 'resize', mode: 'scale', scale: s.scale / 100 })
  if (s.resizeMode === 'width' && s.width > 0) ops.push({ type: 'resize', mode: 'width', width: s.width })
  if (s.resizeMode === 'height' && s.height > 0) ops.push({ type: 'resize', mode: 'height', height: s.height })
  return ops
}

export function EditorPage() {
  const images = useStore((s) => s.images)
  const activeId = useStore((s) => s.activeId)
  const setBusy = useStore((s) => s.setBusy)
  const active = images.find((i) => i.id === activeId) ?? null

  const [st, setSt] = useState<EditState>(INITIAL)
  const patch = (p: Partial<EditState>) => setSt((s) => ({ ...s, ...p }))
  const [preview, setPreview] = useState<{ url: string; width: number; height: number } | null>(null)
  const canUndo = useHistory((s) => s.canUndo)
  const [stage, setStage] = useState({ w: 400, h: 300 })

  // 切换图片时重置编辑状态
  useEffect(() => {
    setSt(INITIAL)
  }, [activeId])

  // 旋转 / 翻转的预览由 sharp 生成，保证和导出一致
  const opsKey = JSON.stringify(baseOps(st))
  useEffect(() => {
    if (!active) {
      setPreview(null)
      return
    }
    let cancelled = false
    let url = ''
    const timer = setTimeout(async () => {
      try {
        const r = await services().previewOps(active.path, JSON.parse(opsKey), 2400)
        if (cancelled) return
        url = URL.createObjectURL(new Blob([r.bytes as BlobPart], { type: 'image/webp' }))
        setPreview({ url, width: r.width, height: r.height })
      } catch (err) {
        if (!cancelled) toast.error('预览失败', { description: errorMessage(err) })
      }
    }, 80)
    return () => {
      cancelled = true
      clearTimeout(timer)
      if (url) setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
  }, [active, opsKey])

  const imgW = preview?.width ?? active?.width ?? 1
  const imgH = preview?.height ?? active?.height ?? 1
  const ratio = useMemo(() => {
    const r = RATIOS.find((x) => x.label === st.ratioKey)?.value ?? null
    return r === 'orig' ? (active ? active.width / active.height : null) : r
  }, [st.ratioKey, active])

  const cropW = st.cropOn ? Math.round(st.crop.w * imgW) : imgW
  const cropH = st.cropOn ? Math.round(st.crop.h * imgH) : imgH
  const outSize =
    st.resizeMode === 'scale'
      ? [Math.round((cropW * st.scale) / 100), Math.round((cropH * st.scale) / 100)]
      : st.resizeMode === 'width' && st.width > 0
        ? [st.width, Math.round((cropH * st.width) / cropW)]
        : st.resizeMode === 'height' && st.height > 0
          ? [Math.round((cropW * st.height) / cropH), st.height]
          : [cropW, cropH]

  const fitScale = Math.min((stage.w - 32) / imgW, (stage.h - 32) / imgH, 1)
  const vp = useViewport(fitScale, activeId)
  const viewScale = vp.scale

  useEffect(() => {
    const el = vp.ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setStage({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [vp.ref])
  const ops = finalOps(st)
  const dirty = ops.length > 0

  const render = async (img: ImageItem) => {
    const r = await services().applyOps(img.path, ops, img.name, TRAY_THUMB)
    return { ...r, srcPath: img.srcPath }
  }

  const apply = async (all: boolean) => {
    if (!active || !dirty) return
    const targets = all ? images : [active]
    setBusy('处理中…')
    try {
      let done = 0
      const results = await mapLimit(targets, 2, async (img) => {
        const r = await render(img)
        setBusy(`处理中 ${++done}/${targets.length}`)
        return { img, item: toImageItem(r) }
      })
      // 一次性替换，撤销时作为一步
      const map = new Map(results.map(({ img, item }) => [img.id, item]))
      useStore.setState((s) => ({
        images: s.images.map((i) => map.get(i.id) ?? i),
        activeId: (s.activeId && map.get(s.activeId)?.id) || s.activeId,
      }))
      setSt(INITIAL)
      toast.success(all ? `已应用到 ${results.length} 张图片` : '已应用')
    } catch (err) {
      toast.error('处理失败', { description: errorMessage(err) })
    } finally {
      setBusy(null)
    }
  }

  const exportCurrent = async (kind: 'save' | 'copy') => {
    if (!active) return
    setBusy('处理中…')
    try {
      const r = dirty ? await render(active) : { ...active, thumb: new Uint8Array() }
      if (kind === 'save') await saveImageAs(r)
      else copyImage(r)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  // ⌘/Ctrl+Z：有未应用的调整时先撤销调整，否则交给全局撤销
  usePageShortcuts({
    undo: () => {
      if (!dirty) return false
      setSt(INITIAL)
    },
    submit: () => {
      if (dirty) apply(false)
    },
  })

  return (
    <div className="flex h-full min-h-0">
      <ImageTray />
      <div className="flex min-w-0 flex-1 flex-col bg-muted/20">
        <div className="flex items-center gap-1 border-b px-2 py-1">
          <ViewportControls vp={vp} className="border-0 bg-transparent p-0 shadow-none" />
          <div className="flex-1" />
          {active && (
            <span className="truncate text-xs text-muted-foreground tabular-nums">
              {active.name} · {imgW}×{imgH} → {outSize[0]}×{outSize[1]}
            </span>
          )}
        </div>
        <div
          ref={vp.ref}
          className="relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden"
          style={{ cursor: vp.cursor }}
          {...vp.panHandlers}
        >
          {!active && (
            <div className="pointer-events-none text-sm text-muted-foreground">从左侧添加或选择一张图片</div>
          )}
          {active && preview && (
            <div
              className="relative shrink-0 shadow-md ring-1 ring-border"
              style={{
                width: imgW * viewScale,
                height: imgH * viewScale,
                background: CHECKER,
                transform: `translate(${vp.offset.x}px, ${vp.offset.y}px)`,
                pointerEvents: vp.blockContent ? 'none' : undefined,
              }}
            >
              <img src={preview.url} alt="" draggable={false} className="size-full select-none" />
              {st.cropOn && (
                <CropOverlay rect={st.crop} onChange={(crop) => patch({ crop })} ratio={ratio} imgW={imgW} imgH={imgH} />
              )}
            </div>
          )}
        </div>
      </div>
      <div className="flex w-56 shrink-0 flex-col border-l">
        <ScrollArea className="min-h-0 flex-1">
          <Section title="旋转与翻转">
            <div className="flex gap-1">
              <Button size="icon-sm" variant="outline" title="逆时针 90°" onClick={() => patch({ angle: (st.angle - 90) % 360, cropOn: false })}>
                <RotateCcwSquare />
              </Button>
              <Button size="icon-sm" variant="outline" title="顺时针 90°" onClick={() => patch({ angle: (st.angle + 90) % 360, cropOn: false })}>
                <RotateCwSquare />
              </Button>
              <Toggle size="sm" variant="outline" pressed={st.flipH} onPressedChange={(flipH) => patch({ flipH })} title="水平翻转">
                <FlipHorizontal2 />
              </Toggle>
              <Toggle size="sm" variant="outline" pressed={st.flipV} onPressedChange={(flipV) => patch({ flipV })} title="垂直翻转">
                <FlipVertical2 />
              </Toggle>
            </div>
            <Field label={`角度 ${st.angle}°`}>
              <Slider min={-180} max={180} step={1} value={[st.angle]} onValueChange={([angle]) => patch({ angle })} />
            </Field>
            {st.angle % 90 !== 0 && (
              <Field label="旋转后空白填充">
                <ColorInput allowTransparent value={st.background} onChange={(background) => patch({ background })} />
              </Field>
            )}
          </Section>
          <Section
            title="裁切"
            action={
              <Switch
                checked={st.cropOn}
                onCheckedChange={(cropOn) => patch({ cropOn, crop: cropOn ? fitRatio(ratio, imgW, imgH) : st.crop })}
              />
            }
          >
            <div className="flex flex-wrap gap-1">
              {RATIOS.map((r) => (
                <button
                  key={r.label}
                  className={cn(
                    'rounded border px-1.5 py-0.5 text-[11px]',
                    st.ratioKey === r.label && st.cropOn ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
                  )}
                  onClick={() => {
                    const v = r.value === 'orig' ? (active ? active.width / active.height : null) : r.value
                    patch({ ratioKey: r.label, cropOn: true, crop: fitRatio(v, imgW, imgH) })
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {st.cropOn && (
              <p className="text-[11px] text-muted-foreground tabular-nums">
                {cropW} × {cropH} px（位置 {Math.round(st.crop.x * imgW)}, {Math.round(st.crop.y * imgH)}）
              </p>
            )}
          </Section>
          <Section title="缩放（输出尺寸）">
            <SimpleSelect<ResizeMode>
              value={st.resizeMode}
              onChange={(resizeMode) => patch({ resizeMode })}
              options={[
                { value: 'scale', label: '按百分比' },
                { value: 'width', label: '指定宽度' },
                { value: 'height', label: '指定高度' },
              ]}
            />
            {st.resizeMode === 'scale' && (
              <>
                <Slider min={5} max={400} step={5} value={[st.scale]} onValueChange={([scale]) => patch({ scale })} />
                <div className="flex flex-wrap gap-1">
                  {[25, 50, 75, 100, 150, 200].map((v) => (
                    <button
                      key={v}
                      className={cn('rounded border px-1.5 py-0.5 text-[11px]', st.scale === v ? 'border-primary text-primary' : 'hover:bg-muted')}
                      onClick={() => patch({ scale: v })}
                    >
                      {v}%
                    </button>
                  ))}
                  <NumberInput className="w-16" value={st.scale} min={1} max={1000} suffix="%" onChange={(scale) => patch({ scale })} />
                </div>
              </>
            )}
            {st.resizeMode === 'width' && (
              <NumberInput allowEmpty value={st.width} min={0} max={30000} placeholder={String(cropW)} suffix="px" onChange={(width) => patch({ width })} />
            )}
            {st.resizeMode === 'height' && (
              <NumberInput allowEmpty value={st.height} min={0} max={30000} placeholder={String(cropH)} suffix="px" onChange={(height) => patch({ height })} />
            )}
          </Section>
        </ScrollArea>
        <div className="flex flex-col gap-1.5 border-t p-2">
          <div className="grid grid-cols-2 gap-1.5">
            <Button size="sm" disabled={!dirty} onClick={() => apply(false)}>
              <Check /> 应用
            </Button>
            <Button size="sm" variant="outline" disabled={!dirty || images.length < 2} onClick={() => apply(true)} title="把相同的编辑应用到图片栏所有图片">
              <CopyCheck /> 应用到全部
            </Button>
            <Button size="sm" variant="outline" disabled={!active} onClick={() => exportCurrent('save')}>
              <Download /> 保存
            </Button>
            <Button size="sm" variant="outline" disabled={!active} onClick={() => exportCurrent('copy')}>
              <Copy /> 复制
            </Button>
          </div>
          <div className="flex gap-1.5">
            <Button size="xs" variant="ghost" className="flex-1" disabled={!dirty} onClick={() => setSt(INITIAL)}>
              <RotateCcw /> 重置
            </Button>
            <Button size="xs" variant="ghost" className="flex-1" disabled={!canUndo} onClick={undo} title={`撤销（${modKey}Z）`}>
              <Undo2 /> 撤销
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
