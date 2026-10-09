import { Copy, Download, GripVertical, ImagePlus, PencilRuler } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CHECKER } from '@/components/grid-canvas'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { errorMessage, services, toImageItem, utools } from '@/lib/bridge'
import { prefs } from '@/lib/storage'
import { useStore } from '@/store'

export async function saveImageAs(img: ImportedImage) {
  const u = utools()
  const lastDir = prefs.get<string>('lastSaveDir', '') || u.getPath('downloads')
  const target = u.showSaveDialog({
    title: '保存图片',
    defaultPath: services().join(lastDir, `${img.name}.png`),
    filters: [
      { name: 'PNG', extensions: ['png'] },
      { name: 'JPEG', extensions: ['jpg', 'jpeg'] },
      { name: 'WebP', extensions: ['webp'] },
      { name: 'AVIF', extensions: ['avif'] },
    ],
  })
  if (!target) return null
  const out = await services().exportTo(img.path, target, 92)
  prefs.set('lastSaveDir', services().dirname(out))
  toast.success('已保存', { description: out, action: { label: '打开位置', onClick: () => u.shellShowItemInFolder(out) } })
  return out
}

export function copyImage(img: ImportedImage) {
  if (utools().copyImage(img.path)) toast.success('已复制到剪贴板')
  else toast.error('复制失败')
}

export function ResultDialog({ result, onClose }: { result: ImportedImage | null; onClose: () => void }) {
  const addImages = useStore((s) => s.addImages)
  const setTab = useStore((s) => s.setTab)
  const [url, setUrl] = useState('')

  useEffect(() => {
    if (!result) return
    const u = URL.createObjectURL(new Blob([result.thumb as BlobPart], { type: 'image/webp' }))
    setUrl(u)
    // 结果图预览用更大的尺寸
    let cancelled = false
    let big = ''
    services()
      .thumbnail(result.path, 2400)
      .then((bytes) => {
        if (cancelled) return
        big = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/webp' }))
        setUrl(big)
      })
      .catch(() => {})
    return () => {
      cancelled = true
      URL.revokeObjectURL(u)
      if (big) URL.revokeObjectURL(big)
    }
  }, [result])

  if (!result) return null
  const run = (fn: () => unknown) => async () => {
    try {
      await fn()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }
  return (
    <Dialog open={!!result} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[min(92vw,900px)] sm:max-w-[min(92vw,900px)]">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {result.name}
            <span className="ml-2 font-normal text-muted-foreground tabular-nums">
              {result.width} × {result.height}
            </span>
          </DialogTitle>
        </DialogHeader>
        <div
          className="flex max-h-[58vh] min-h-40 items-center justify-center overflow-auto rounded-md border"
          style={{ background: CHECKER }}
          draggable
          onDragStart={(e) => {
            e.preventDefault()
            utools().startDrag(result.path)
          }}
        >
          {url && <img src={url} alt="" className="max-h-[56vh] max-w-full object-contain" draggable={false} />}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={run(() => saveImageAs(result))}>
            <Download /> 保存
          </Button>
          <Button size="sm" variant="outline" onClick={run(() => copyImage(result))}>
            <Copy /> 复制
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              addImages([toImageItem(result)])
              toast.success('已加入图片栏')
            }}
          >
            <ImagePlus /> 加入图片栏
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              addImages([toImageItem(result)])
              useStore.getState().setActive(useStore.getState().images.at(-1)?.id ?? null)
              setTab('edit')
              onClose()
            }}
          >
            <PencilRuler /> 继续编辑
          </Button>
          <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
            <GripVertical className="size-3" /> 可直接把图片拖到其他应用
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
