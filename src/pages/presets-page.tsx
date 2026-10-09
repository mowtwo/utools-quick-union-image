import { Columns2, Copy, ListOrdered, Plus, Rows2, Save, SquarePlus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Field, Section } from '@/components/form'
import { GridCanvas } from '@/components/grid-canvas'
import { CellSettings, LayoutSettings } from '@/components/layout-settings'
import { layoutSummary, NameDialog, useLayouts } from '@/components/layout-picker'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cellIndex, cloneLayout, makeGrid, slotCount, splitCell, uid } from '@/lib/layout'
import { usePageShortcuts } from '@/lib/shortcuts'
import type { GridLayout, Layout } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'

function newLayout(kind: 'fixed' | 'free' | 'justify' | 'strip'): Layout {
  const base = makeGrid('新预设', 2, 2)
  if (kind === 'fixed') return { ...base, name: '新固定网格' }
  if (kind === 'free') {
    return { ...base, name: '新自由网格', rows: 0, cols: 0, sizeMode: 'fixed', cells: [{ id: uid(), x: 0, y: 0, w: 1, h: 1 }] }
  }
  const common = {
    id: uid(),
    padding: 0,
    gap: 0,
    radius: 0,
    background: '#ffffff',
    defaultFit: 'cover' as const,
    defaultPosition: 'center' as const,
  }
  if (kind === 'justify') {
    return { ...common, kind: 'justify', name: '新等高拼接', direction: 'horizontal', lines: 1, width: 0, height: 0, autoBase: 'min', count: 0 }
  }
  return { ...common, kind: 'strip', name: '新长图', direction: 'vertical', size: 0, lanes: 1, count: 0 }
}

export function PresetsPage() {
  const layouts = useLayouts()
  const images = useStore((s) => s.images)
  const draft = useStore((s) => s.editingLayout)
  const setDraft = useStore((s) => s.setEditingLayout)
  const saveLayout = useStore((s) => s.saveLayout)
  const deleteLayout = useStore((s) => s.deleteLayout)
  const setStitchLayout = useStore((s) => s.setStitchLayout)
  const setTab = useStore((s) => s.setTab)
  const [selected, setSelected] = useState<string[]>([])
  const [naming, setNaming] = useState(false)

  useEffect(() => {
    if (!draft && layouts.length) setDraft(JSON.parse(JSON.stringify(layouts.find((l) => !l.builtin) ?? layouts[0])))
  }, [draft, layouts, setDraft])

  const source = draft ? layouts.find((l) => l.id === draft.id) : undefined
  const isBuiltin = !!source?.builtin
  const dirty = useMemo(() => !source || JSON.stringify(source) !== JSON.stringify({ ...draft, builtin: source.builtin, updatedAt: source.updatedAt }), [source, draft])

  const open = (l: Layout) => {
    setDraft(JSON.parse(JSON.stringify(l)))
    setSelected([])
  }

  const grid = draft?.kind === 'grid' ? (draft as GridLayout) : null
  const setGrid = (g: GridLayout) => setDraft(g)

  const save = () => {
    if (!draft) return
    if (isBuiltin) {
      setNaming(true)
      return
    }
    saveLayout(draft)
    toast.success('预设已保存')
  }

  /** 拖动序号：把 from 号移到 to 号的位置，其余格子的序号顺延 */
  const moveIndex = (from: number, to: number) => {
    if (!grid) return
    const order = grid.cells.map((c, i) => ({ id: c.id, slot: cellIndex(c, i) })).sort((a, b) => a.slot - b.slot)
    const slots = order.map((o) => o.slot)
    const fromPos = order.findIndex((o) => o.slot === from)
    const toPos = order.findIndex((o) => o.slot === to)
    if (fromPos < 0 || toPos < 0) return
    const [moved] = order.splice(fromPos, 1)
    order.splice(toPos, 0, moved)
    const next = new Map(order.map((o, k) => [o.id, slots[k]]))
    setGrid({ ...grid, cells: grid.cells.map((c) => ({ ...c, index: next.get(c.id) })) })
  }

  const deleteCells = () => {
    if (!grid || !selected.length || selected.length >= grid.cells.length) return false
    setGrid({ ...grid, rows: 0, cols: 0, cells: grid.cells.filter((c) => !selected.includes(c.id)) })
    setSelected([])
  }

  usePageShortcuts({
    save,
    selectAll: () => {
      if (!grid) return false
      setSelected(grid.cells.map((c) => c.id))
    },
    delete: deleteCells,
    escape: () => {
      if (!selected.length) return false
      setSelected([])
    },
  })

  if (!draft) return null

  return (
    <div className="flex h-full min-h-0">
      {/* 预设列表 */}
      <div className="flex w-36 shrink-0 flex-col border-r bg-muted/30">
        <div className="flex items-center gap-1 border-b p-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="flex-1">
                <Plus /> 新建预设
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => open(newLayout('fixed'))}>固定网格（行 × 列）</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => open(newLayout('free'))}>自由网格（拖拽 / 拆分）</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => open(newLayout('justify'))}>等高 / 等宽自适应</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => open(newLayout('strip'))}>长图 / 瀑布流</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-0.5 p-1.5">
            {[
              { title: '我的预设', list: layouts.filter((l) => !l.builtin) },
              { title: '内置预设', list: layouts.filter((l) => l.builtin) },
            ].map(({ title, list }) =>
              list.length ? (
                <div key={title} className="mb-1">
                  <div className="px-1.5 py-1 text-[10px] font-medium text-muted-foreground">{title}</div>
                  {list.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => open(l)}
                      className={cn(
                        'flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-xs hover:bg-muted',
                        draft.id === l.id && 'bg-primary/10 text-primary',
                      )}
                    >
                      <span className="flex-1 truncate">{l.name}</span>
                      <span className="text-[10px] text-muted-foreground">{layoutSummary(l)}</span>
                    </button>
                  ))}
                </div>
              ) : null,
            )}
          </div>
        </ScrollArea>
      </div>

      {/* 画布 */}
      <div className="flex min-w-0 flex-1 flex-col bg-muted/20">
        <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1">
          {grid ? (
            <>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  const cell = { id: uid(), x: 0.35, y: 0.35, w: 0.3, h: 0.3 }
                  setGrid({ ...grid, rows: 0, cols: 0, cells: [...grid.cells, cell] })
                  setSelected([cell.id])
                }}
              >
                <SquarePlus /> 添加格子
              </Button>
              <Button
                size="xs"
                variant="ghost"
                disabled={selected.length !== 1}
                onClick={() => setGrid({ ...grid, rows: 0, cols: 0, cells: splitCell(grid.cells, selected[0], 'v') })}
              >
                <Columns2 /> 左右拆分
              </Button>
              <Button
                size="xs"
                variant="ghost"
                disabled={selected.length !== 1}
                onClick={() => setGrid({ ...grid, rows: 0, cols: 0, cells: splitCell(grid.cells, selected[0], 'h') })}
              >
                <Rows2 /> 上下拆分
              </Button>
              <Button
                size="xs"
                variant="ghost"
                disabled={!selected.length || selected.length >= grid.cells.length}
                onClick={deleteCells}
              >
                <Trash2 /> 删除格子
              </Button>
              <Button
                size="xs"
                variant="ghost"
                title="清除所有自定义序号，按格子顺序编号"
                onClick={() => setGrid({ ...grid, cells: grid.cells.map(({ index: _i, ...c }) => (void _i, c)) })}
              >
                <ListOrdered /> 默认编号
              </Button>
              <span className="ml-auto text-[10px] text-muted-foreground">拖动移动，右下角调整大小，拖动序号调整编号</span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">
              {draft.kind === 'justify' ? '等高 / 等宽拼接按图片原比例自动排布' : '长图按图片原比例依次排布'}
              {images.length === 0 && '，在图片栏添加图片后可预览效果'}
            </span>
          )}
        </div>
        <GridCanvas
          layout={draft}
          images={images.length ? images : []}
          selected={selected}
          onSelect={grid ? setSelected : undefined}
          editable={!!grid}
          onCellsChange={grid ? (cells) => setGrid({ ...grid, rows: 0, cols: 0, cells }) : undefined}
          onMoveSlot={grid ? moveIndex : undefined}
        />
      </div>

      {/* 设置 */}
      <div className="flex w-56 shrink-0 flex-col border-l">
        <ScrollArea className="min-h-0 flex-1">
          <Section title="预设">
            <Field label="名称">
              <Input className="h-7 text-xs" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
            <RegisterSwitch layoutId={draft.id} saved={!!source} />
            <div className="flex flex-wrap gap-1">
              {isBuiltin && <Badge variant="secondary">内置，修改后需另存</Badge>}
              {grid && <Badge variant="outline">每组 {slotCount(grid)} 张图</Badge>}
              {!isBuiltin && dirty && source && <Badge variant="outline">未保存</Badge>}
            </div>
          </Section>
          <LayoutSettings layout={draft} onChange={setDraft} />
          {grid && <CellSettings layout={grid} selected={selected} onSelect={setSelected} onChange={setGrid} />}
        </ScrollArea>
        <div className="flex flex-col gap-1.5 border-t p-2">
          <div className="grid grid-cols-2 gap-1.5">
            <Button size="sm" onClick={save}>
              <Save /> {isBuiltin ? '另存为' : '保存'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setNaming(true)}>
              <Copy /> 另存副本
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setStitchLayout(JSON.parse(JSON.stringify(draft)))
                setTab('stitch')
              }}
            >
              用于拼接
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={isBuiltin || !source}
              onClick={() => {
                deleteLayout(draft.id)
                setDraft(null)
                toast.success('已删除预设')
              }}
            >
              <Trash2 /> 删除
            </Button>
          </div>
        </div>
      </div>
      <NameDialog
        open={naming}
        title="另存为新预设"
        initial={isBuiltin ? `我的${draft.name}` : `${draft.name} 副本`}
        onClose={() => setNaming(false)}
        onSubmit={(name) => {
          const copy = cloneLayout(draft, name)
          saveLayout(copy)
          setDraft(copy)
          toast.success(`已保存预设「${name}」`)
        }}
      />
    </div>
  )
}

function RegisterSwitch({ layoutId, saved }: { layoutId: string; saved: boolean }) {
  const registered = useStore((s) => s.registeredLayouts.includes(layoutId))
  const toggle = useStore((s) => s.toggleLayoutFeature)
  return (
    <Label className="flex items-center justify-between text-xs font-normal" title="选中图片或文件夹后，在 uTools 中直接用这个预设拼图">
      注册为 uTools 指令
      <Switch
        checked={registered}
        disabled={!saved}
        onCheckedChange={(on) => {
          toggle(layoutId, on)
          toast.success(on ? '已注册，选中图片后在 uTools 搜索「拼图」即可调用' : '已取消注册')
        }}
      />
    </Label>
  )
}
