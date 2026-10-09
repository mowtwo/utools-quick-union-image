import { ImagePlus, PencilRuler, Replace, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ImportMenu } from '@/components/import-menu'
import { TRAY_MIME } from '@/components/image-tray'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useImport, usePaste } from '@/hooks/use-import'
import { droppedPaths } from '@/lib/bridge'
import { modKey } from '@/lib/shortcuts'
import type { ImageItem } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'

interface Props {
  /** 布局需要的图片数，0 = 不限 */
  need: number
  selected: number[]
  onSelect: (slots: number[]) => void
  /** 替换指定序号的图片；paths 为空时弹出文件选择 */
  onReplace: (slots: number[], paths?: string[]) => void
  onRemove: (slots: number[]) => void
}

/**
 * 图层列表：按拼接顺序列出每个位置的图片，与画布选择同步。
 * 拖动行调整顺序，拖入文件替换，悬停操作替换 / 编辑 / 移除。
 */
export function LayerList({ need, selected, onSelect, onReplace, onRemove }: Props) {
  const images = useStore((s) => s.images)
  const moveImage = useStore((s) => s.moveImage)
  const clearImages = useStore((s) => s.clearImages)
  const importInto = useImport()
  const paste = usePaste()
  const [anchor, setAnchor] = useState<number | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)
  const [fileOver, setFileOver] = useState(false)

  // 从画布点选时，把对应图层滚动到可见位置
  const listRef = useRef<HTMLDivElement>(null)
  const first = selected[0]
  useEffect(() => {
    if (first === undefined) return
    listRef.current?.querySelector(`[data-layer="${first}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [first])

  const slotTotal = need ? Math.max(need, images.length) : images.length
  const used = need || images.length
  const rows = Array.from({ length: slotTotal }, (_, i) => i)

  const click = (slot: number, e: React.MouseEvent) => {
    if (e.shiftKey && anchor !== null) {
      const [a, b] = anchor < slot ? [anchor, slot] : [slot, anchor]
      onSelect(Array.from({ length: b - a + 1 }, (_, k) => a + k))
      return
    }
    setAnchor(slot)
    if (e.metaKey || e.ctrlKey) onSelect(selected.includes(slot) ? selected.filter((s) => s !== slot) : [...selected, slot])
    else onSelect([slot])
  }

  const row = (slot: number) => {
    const img: ImageItem | undefined = images[slot]
    const isSel = selected.includes(slot)
    return (
      <div
        key={img?.id ?? `empty-${slot}`}
        data-layer={slot}
        draggable={!!img}
        onDragStart={(e) => {
          e.dataTransfer.setData(TRAY_MIME, String(slot))
          e.dataTransfer.effectAllowed = 'move'
        }}
        onDragOver={(e) => {
          const t = e.dataTransfer.types
          if (t.includes(TRAY_MIME) || t.includes('Files')) {
            e.preventDefault()
            e.stopPropagation()
            setDropAt(slot)
          }
        }}
        onDragLeave={() => setDropAt(null)}
        onDrop={(e) => {
          setDropAt(null)
          const files = droppedPaths(e)
          const from = e.dataTransfer.getData(TRAY_MIME)
          if (files.length) {
            e.preventDefault()
            e.stopPropagation()
            onReplace([slot], files)
          } else if (from !== '') {
            e.preventDefault()
            e.stopPropagation()
            moveImage(Number(from), slot)
            onSelect([Math.min(slot, images.length - 1)])
          }
        }}
        onClick={(e) => click(slot, e)}
        onDoubleClick={() => {
          if (!img) return
          useStore.getState().setActive(img.id)
          useStore.getState().setTab('edit')
        }}
        className={cn(
          'group relative flex cursor-pointer items-center gap-1.5 rounded-md border border-transparent px-1 py-1 text-xs select-none hover:bg-muted',
          isSel && 'border-sky-500 bg-sky-500/10 hover:bg-sky-500/15',
          dropAt === slot && 'border-primary border-dashed bg-primary/10',
          slot >= used && 'opacity-45',
        )}
        title={img ? `${img.name}  ${img.width}×${img.height}\n拖动排序 · 拖入文件替换 · 双击编辑` : '空位：点「替换」或拖入图片'}
      >
        <span
          className={cn(
            'w-5 shrink-0 rounded text-center text-[10px] leading-4 font-semibold tabular-nums',
            isSel ? 'bg-sky-500 text-white' : 'bg-muted-foreground/15',
          )}
        >
          {slot + 1}
        </span>
        <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded border bg-[repeating-conic-gradient(#8881_0_25%,transparent_0_50%)] bg-[length:8px_8px]">
          {img ? (
            <img src={img.url} alt="" draggable={false} className="max-h-full max-w-full object-contain" />
          ) : (
            <ImagePlus className="size-3.5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate">{img ? img.name : '空位'}</div>
          <div className="text-[10px] text-muted-foreground tabular-nums">{img ? `${img.width}×${img.height}` : '待添加'}</div>
        </div>
        <div className={cn('absolute top-1 right-1 hidden gap-0.5 rounded bg-background/90 shadow-sm group-hover:flex')}>
          <button
            className="rounded p-0.5 hover:bg-muted"
            title="替换图片"
            onClick={(e) => {
              e.stopPropagation()
              onReplace([slot])
            }}
          >
            <Replace className="size-3" />
          </button>
          {img && (
            <>
              <button
                className="rounded p-0.5 hover:bg-muted"
                title="编辑这张图片"
                onClick={(e) => {
                  e.stopPropagation()
                  useStore.getState().setActive(img.id)
                  useStore.getState().setTab('edit')
                }}
              >
                <PencilRuler className="size-3" />
              </button>
              <button
                className="rounded p-0.5 hover:bg-muted"
                title="移除"
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove([slot])
                }}
              >
                <X className="size-3" />
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  const usedRows = rows.filter((r) => r < used)
  const extraRows = rows.filter((r) => r >= used)
  const selectedWithImage = selected.filter((s) => images[s])

  return (
    <div
      className={cn('flex h-full w-48 shrink-0 flex-col border-r bg-muted/30', fileOver && 'bg-primary/10')}
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
        <ImportMenu onPaths={(p) => importInto(p)} onClipboard={paste} label="添加" />
        <Button
          size="sm"
          variant="outline"
          className="px-2"
          disabled={!selected.length}
          title="用新图片替换选中的位置（可多选，按顺序替换）"
          onClick={() => onReplace(selected)}
        >
          <Replace /> 替换
        </Button>
        <div className="flex-1" />
        {selectedWithImage.length > 0 ? (
          <Button size="icon-sm" variant="ghost" title="移除选中（Delete）" onClick={() => onRemove(selectedWithImage)}>
            <X />
          </Button>
        ) : (
          images.length > 0 && (
            <Button size="icon-sm" variant="ghost" title="清空" onClick={clearImages}>
              <Trash2 />
            </Button>
          )
        )}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div ref={listRef} className="flex flex-col gap-0.5 p-1.5">
          {slotTotal === 0 && (
            <div className="rounded-md border border-dashed p-3 text-center text-xs leading-relaxed text-muted-foreground">
              拖入图片 / 文件夹
              <br />
              点「添加」或按 {modKey}V 粘贴
            </div>
          )}
          {usedRows.length > 0 && (
            <div className="flex items-center justify-between px-1 pt-0.5 pb-1 text-[10px] text-muted-foreground">
              <span>图层 · 拼接顺序</span>
              <span>{Math.min(images.length, used)}/{used}</span>
            </div>
          )}
          {usedRows.map(row)}
          {extraRows.length > 0 && (
            <div className="px-1 pt-2 pb-1 text-[10px] text-muted-foreground">未使用 · {extraRows.length}（拖到上方参与拼接）</div>
          )}
          {extraRows.map(row)}
        </div>
      </ScrollArea>
    </div>
  )
}
