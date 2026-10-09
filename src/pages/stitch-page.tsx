import { Save, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { GridCanvas } from '@/components/grid-canvas'
import { LayerList } from '@/components/layer-list'
import { CellSettings, LayoutSettings } from '@/components/layout-settings'
import { LayoutPicker, NameDialog, useLayouts } from '@/components/layout-picker'
import { ResultDialog } from '@/components/result-dialog'
import { Field, Section } from '@/components/form'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { errorMessage, importPaths, pickImageFiles, services, toImageItem, TRAY_THUMB } from '@/lib/bridge'
import { cloneLayout, resolveLayout, slotCount } from '@/lib/layout'
import { modKey, usePageShortcuts } from '@/lib/shortcuts'
import { buildStitchJob } from '@/lib/stitch'
import type { Layout } from '@/lib/types'
import { useStore } from '@/store'

export function StitchPage() {
  const images = useStore((s) => s.images)
  const layout = useStore((s) => s.stitchLayout)
  const setLayout = useStore((s) => s.setStitchLayout)
  const saveLayout = useStore((s) => s.saveLayout)
  const swapImages = useStore((s) => s.swapImages)
  const setBusy = useStore((s) => s.setBusy)
  const layouts = useLayouts()
  // 选择以“序号”（slot）为单位，画布格子与图层列表共用
  const [selSlots, setSelSlots] = useState<number[]>([])
  const [result, setResult] = useState<ImportedImage | null>(null)
  const [naming, setNaming] = useState(false)

  const source = layouts.find((l) => l.id === layout.id)
  const isUserPreset = !!source && !source.builtin
  const need = slotCount(layout)
  const usedImages = need ? images.slice(0, need) : images
  const resolved = useMemo(() => resolveLayout(layout, images), [layout, images])
  const selectedKeys = resolved.cells.filter((c) => selSlots.includes(c.slot)).map((c) => c.key)
  const selectKeys = (keys: string[]) =>
    setSelSlots([...new Set(resolved.cells.filter((c) => keys.includes(c.key)).map((c) => c.slot))])

  /** 用新图片替换指定序号；多出的图片插在最后一个被替换位置之后 */
  const replaceSlots = async (slots: number[], given?: string[]) => {
    const targets = [...slots].sort((a, b) => a - b)
    const paths = given ?? pickImageFiles()
    if (!paths.length) return
    setBusy('导入图片…')
    try {
      const res = await importPaths(paths, { onProgress: (d, t) => setBusy(`导入图片 ${d}/${t}`) })
      if (res.failed.length) toast.error(`${res.failed.length} 个文件导入失败`, { description: res.failed.slice(0, 3).map((f) => f.reason).join('\n') })
      const items = res.images.map(toImageItem)
      if (!items.length) return
      const touched: number[] = []
      useStore.setState((st) => {
        const next = [...st.images]
        const extra = items.slice(targets.length)
        items.slice(0, targets.length).forEach((item, k) => {
          const slot = targets[k]
          if (slot < next.length) next[slot] = item
          else next.push(item)
          touched.push(Math.min(slot, next.length - 1))
        })
        const at = (touched.at(-1) ?? next.length - 1) + 1
        next.splice(at, 0, ...extra)
        extra.forEach((_, k) => touched.push(at + k))
        return { images: next }
      })
      setSelSlots(touched)
      toast.success(`已替换 ${Math.min(items.length, targets.length)} 张${items.length > targets.length ? `，另插入 ${items.length - targets.length} 张` : ''}`)
    } catch (err) {
      toast.error('替换失败', { description: errorMessage(err) })
    } finally {
      setBusy(null)
    }
  }

  const removeSlots = (slots: number[]) => {
    const ids = slots.map((s) => images[s]?.id).filter((x): x is string => !!x)
    if (!ids.length) return false
    useStore.getState().removeImages(ids)
    setSelSlots([])
  }

  usePageShortcuts({
    selectAll: () => setSelSlots(Array.from({ length: need || images.length }, (_, i) => i)),
    delete: () => removeSlots(selSlots),
    escape: () => {
      if (!selSlots.length) return false
      setSelSlots([])
    },
    submit: () => {
      generate()
    },
    save: () => {
      if (isUserPreset) {
        saveLayout(layout)
        toast.success('预设已更新')
      } else setNaming(true)
    },
  })

  // 从「拼图 xxx」动态指令进入：导入完成后直接出图
  const autoStitch = useStore((s) => s.autoStitch)
  useEffect(() => {
    if (!autoStitch || !images.length) return
    useStore.getState().setAutoStitch(false)
    generate()
  }, [autoStitch, images.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (id: string) => {
    const l = layouts.find((x) => x.id === id)
    if (!l) return
    // 草稿：用户预设保留 id（便于覆盖保存），内置预设保留 id 但只能另存
    setLayout(JSON.parse(JSON.stringify(l)) as Layout)
    setSelSlots([])
  }

  const generate = async () => {
    if (!usedImages.length) {
      toast.warning('先添加图片')
      return
    }
    setBusy('拼接中…')
    try {
      const name = `${usedImages[0].name}-拼图`
      setResult(await services().stitch(buildStitchJob(layout, usedImages, name, TRAY_THUMB)))
    } catch (err) {
      toast.error('拼接失败', { description: errorMessage(err) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex h-full min-h-0">
      <LayerList need={need} selected={selSlots} onSelect={setSelSlots} onReplace={replaceSlots} onRemove={removeSlots} />
      <div className="flex min-w-0 flex-1 flex-col bg-muted/20">
        <div className="flex items-center gap-2 border-b px-3 py-1.5 text-xs text-muted-foreground">
          <span className="truncate">点选图片（⇧/{modKey}多选）· 拖动序号调整顺序 · 拖动图片互换 · 拖入文件替换</span>
          {need > 0 && images.length > need && <span className="ml-auto text-amber-600">只用前 {need} 张</span>}
          {need > 0 && images.length < need && <span className="ml-auto">还差 {need - images.length} 张</span>}
        </div>
        <GridCanvas
          layout={layout}
          images={images}
          selected={selectedKeys}
          onSelect={selectKeys}
          onDropTray={(slot, from) => (slot < images.length ? swapImages(from, slot) : useStore.getState().moveImage(from, images.length - 1))}
          onSwapSlots={swapImages}
          onMoveSlot={(from, to) => {
            useStore.getState().moveImage(from, to)
            setSelSlots([Math.min(to, images.length - 1)])
          }}
          onDropFiles={(slot, paths) => replaceSlots([slot], paths)}
        />
      </div>
      <div className="flex w-56 shrink-0 flex-col border-l">
        <ScrollArea className="min-h-0 flex-1">
          <Section
            title="网格预设"
            action={
              <Button size="xs" variant="ghost" onClick={() => setNaming(true)}>
                <Save /> 另存
              </Button>
            }
          >
            <LayoutPicker value={source ? layout.id : undefined} onChange={pick} />
            {isUserPreset && (
              <Button
                size="xs"
                variant="outline"
                onClick={() => {
                  saveLayout(layout)
                  toast.success('预设已更新')
                }}
              >
                保存到「{source!.name}」
              </Button>
            )}
          </Section>
          <LayoutSettings layout={layout} onChange={setLayout} />
          {layout.kind === 'grid' && (
            <CellSettings layout={layout} selected={selectedKeys} onSelect={selectKeys} onChange={setLayout} />
          )}
          {layout.kind !== 'grid' && (
            <Section title="说明">
              <Field label="">
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {layout.kind === 'justify'
                    ? '不同尺寸的图片会缩放到同一高度（纵向为同一宽度）后拼接，不裁切；宽高都固定时会少量裁切以填满。'
                    : '按原比例依次拼接，可设置多列瀑布流。'}
                </p>
              </Field>
            </Section>
          )}
        </ScrollArea>
        <div className="border-t p-2">
          <Button className="w-full" onClick={generate} disabled={!images.length}>
            <Sparkles /> 生成拼图
          </Button>
        </div>
      </div>
      <ResultDialog result={result} onClose={() => setResult(null)} />
      <NameDialog
        open={naming}
        title="另存为网格预设"
        initial={source && !source.builtin ? `${layout.name} 副本` : `我的${layout.name}`}
        onClose={() => setNaming(false)}
        onSubmit={(name) => {
          const copy = cloneLayout(layout, name)
          saveLayout(copy)
          setLayout(copy)
          toast.success(`已保存预设「${name}」`)
        }}
      />
    </div>
  )
}
