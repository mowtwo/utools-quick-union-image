import { Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { ImportMenu } from '@/components/import-menu'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useImport, usePaste } from '@/hooks/use-import'
import { droppedPaths } from '@/lib/bridge'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'

export const TRAY_MIME = 'application/x-quick-union-index'

interface Props {
  /** 超出该数量的图片显示为“未使用” */
  usedCount?: number
  className?: string
}

/** 图片栏：顺序即拼接序号，可拖动排序，也可从外部拖入文件 */
export function ImageTray({ usedCount, className }: Props) {
  const images = useStore((s) => s.images)
  const activeId = useStore((s) => s.activeId)
  const setActive = useStore((s) => s.setActive)
  const removeImage = useStore((s) => s.removeImage)
  const clearImages = useStore((s) => s.clearImages)
  const moveImage = useStore((s) => s.moveImage)
  const importInto = useImport()
  const paste = usePaste()
  const [dragOver, setDragOver] = useState<number | null>(null)
  const [fileOver, setFileOver] = useState(false)

  return (
    <div
      className={cn('flex h-full w-28 shrink-0 flex-col border-r bg-muted/30', fileOver && 'bg-primary/10', className)}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setFileOver(true)
        }
      }}
      onDragLeave={() => setFileOver(false)}
      onDrop={(e) => {
        setFileOver(false)
        const paths = droppedPaths(e)
        if (paths.length) {
          e.preventDefault()
          importInto(paths)
        }
      }}
    >
      <div className="flex items-center gap-1 border-b p-1.5">
        <ImportMenu onClipboard={paste} onPaths={(p) => importInto(p)} label="添加" />
        <div className="flex-1" />
        {images.length > 0 && (
          <Button size="icon-sm" variant="ghost" title="清空" onClick={clearImages}>
            <Trash2 />
          </Button>
        )}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-1.5 p-1.5">
          {images.length === 0 && (
            <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
              拖入图片 / 文件夹
              <br />或点「添加」
            </div>
          )}
          {images.map((img, i) => (
            <div
              key={img.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(TRAY_MIME, String(i))
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes(TRAY_MIME)) {
                  e.preventDefault()
                  setDragOver(i)
                }
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => {
                const from = e.dataTransfer.getData(TRAY_MIME)
                setDragOver(null)
                if (from !== '') {
                  e.preventDefault()
                  e.stopPropagation()
                  moveImage(Number(from), i)
                }
              }}
              onClick={() => setActive(img.id)}
              className={cn(
                'group relative cursor-pointer overflow-hidden rounded-md border bg-background transition',
                activeId === img.id && 'ring-2 ring-primary',
                dragOver === i && 'border-primary border-2',
                usedCount !== undefined && usedCount > 0 && i >= usedCount && 'opacity-40',
              )}
              title={`${img.name}  ${img.width}×${img.height}`}
            >
              <img src={img.url} alt="" className="h-16 w-full object-contain bg-[repeating-conic-gradient(#8881_0_25%,transparent_0_50%)] bg-[length:12px_12px]" />
              <div className="flex items-center gap-1 px-1 py-0.5 text-[10px] leading-tight">
                <span className="rounded bg-primary px-1 font-medium text-primary-foreground">{i + 1}</span>
                <span className="truncate text-muted-foreground">{img.name}</span>
              </div>
              <button
                className="absolute top-0.5 right-0.5 hidden rounded bg-background/80 p-0.5 group-hover:block"
                onClick={(e) => {
                  e.stopPropagation()
                  removeImage(img.id)
                }}
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
