import { RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { ColorInput, Field, NumberInput, Section, SimpleSelect } from '@/components/form'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { FIT_LABEL, gridCells, POSITION_GRID, POSITION_LABEL } from '@/lib/layout'
import type { Fit, GridCell, GridLayout, Layout, Position } from '@/lib/types'
import { cn } from '@/lib/utils'

export function FitPicker({ value, onChange, exclude }: { value?: Fit; onChange: (f: Fit) => void; exclude?: Fit[] }) {
  return (
    <ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      className="grid w-full grid-cols-2"
      value={value ?? ''}
      onValueChange={(v) => v && onChange(v as Fit)}
    >
      {(Object.keys(FIT_LABEL) as Fit[])
        .filter((f) => !exclude?.includes(f))
        .map((f) => (
          <ToggleGroupItem key={f} value={f} className="h-7 px-1 text-[11px] data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
            {FIT_LABEL[f]}
          </ToggleGroupItem>
        ))}
    </ToggleGroup>
  )
}

export function PositionPicker({ value, onChange }: { value?: Position; onChange: (p: Position) => void }) {
  return (
    <div className="grid w-[72px] grid-cols-3 gap-0.5">
      {POSITION_GRID.map((p) => (
        <button
          key={p}
          title={POSITION_LABEL[p]}
          onClick={() => onChange(p)}
          className={cn(
            'flex size-[22px] items-center justify-center rounded-sm border text-[9px]',
            value === p ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
          )}
        >
          ●
        </button>
      ))}
    </div>
  )
}

/** 布局整体参数 */
export function LayoutSettings({ layout, onChange }: { layout: Layout; onChange: (l: Layout) => void }) {
  const patch = (p: Partial<Layout>) => onChange({ ...layout, ...p } as Layout)
  return (
    <>
      {layout.kind === 'grid' && <GridSize layout={layout} onChange={onChange} />}
      {layout.kind === 'justify' && (
        <Section title="等高 / 等宽拼接">
          <Field label="方向">
            <SimpleSelect
              value={layout.direction}
              onChange={(direction) => patch({ direction })}
              options={[
                { value: 'horizontal', label: '横向（每行等高）' },
                { value: 'vertical', label: '纵向（每列等宽）' },
              ]}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="输出宽度">
              <NumberInput allowEmpty value={layout.width} min={0} max={30000} placeholder="自动" suffix="px" onChange={(width) => patch({ width })} />
            </Field>
            <Field label="输出高度">
              <NumberInput allowEmpty value={layout.height} min={0} max={30000} placeholder="自动" suffix="px" onChange={(height) => patch({ height })} />
            </Field>
            <Field label={layout.direction === 'horizontal' ? '行数' : '列数'}>
              <NumberInput value={layout.lines} min={1} max={50} onChange={(lines) => patch({ lines })} />
            </Field>
            <Field label="每张输出图片数">
              <NumberInput allowEmpty value={layout.count} min={0} max={500} placeholder="全部" onChange={(count) => patch({ count })} />
            </Field>
          </div>
          {!layout.width && !layout.height && (
            <Field label="自动尺寸基准" hint="宽高都留空时，行高取图片的这个值（取最小值不会放大变糊）">
              <SimpleSelect
                value={layout.autoBase}
                onChange={(autoBase) => patch({ autoBase })}
                options={[
                  { value: 'min', label: '最小图片高度' },
                  { value: 'median', label: '中位数' },
                  { value: 'max', label: '最大图片高度' },
                ]}
              />
            </Field>
          )}
          {layout.width > 0 && layout.height > 0 && (
            <Field label="裁切对齐" hint="宽高都固定时，为填满画布会做少量裁切">
              <PositionPicker value={layout.defaultPosition} onChange={(defaultPosition) => patch({ defaultPosition })} />
            </Field>
          )}
        </Section>
      )}
      {layout.kind === 'strip' && (
        <Section title="长图拼接">
          <Field label="方向">
            <SimpleSelect
              value={layout.direction}
              onChange={(direction) => patch({ direction })}
              options={[
                { value: 'vertical', label: '竖向（统一宽度）' },
                { value: 'horizontal', label: '横向（统一高度）' },
              ]}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={layout.direction === 'vertical' ? '统一宽度' : '统一高度'}>
              <NumberInput allowEmpty value={layout.size} min={0} max={30000} placeholder="首图" suffix="px" onChange={(size) => patch({ size })} />
            </Field>
            <Field label="列数（瀑布流）">
              <NumberInput value={layout.lanes} min={1} max={20} onChange={(lanes) => patch({ lanes })} />
            </Field>
            <Field label="每张输出图片数">
              <NumberInput allowEmpty value={layout.count} min={0} max={500} placeholder="全部" onChange={(count) => patch({ count })} />
            </Field>
          </div>
        </Section>
      )}
      <Section title="间距与背景">
        <div className="grid grid-cols-3 gap-2">
          <Field label="间距">
            <NumberInput value={layout.gap} min={0} max={2000} suffix="px" onChange={(gap) => patch({ gap })} />
          </Field>
          <Field label="外边距">
            <NumberInput value={layout.padding} min={0} max={2000} suffix="px" onChange={(padding) => patch({ padding })} />
          </Field>
          <Field label="圆角">
            <NumberInput value={layout.radius} min={0} max={2000} suffix="px" onChange={(radius) => patch({ radius })} />
          </Field>
        </div>
        <Field label="背景色">
          <ColorInput allowTransparent value={layout.background} onChange={(background) => patch({ background })} />
        </Field>
      </Section>
    </>
  )
}

function GridSize({ layout, onChange }: { layout: GridLayout; onChange: (l: Layout) => void }) {
  const [rows, setRows] = useState(layout.rows || 2)
  const [cols, setCols] = useState(layout.cols || 2)
  const patch = (p: Partial<GridLayout>) => onChange({ ...layout, ...p })
  return (
    <Section title="画布">
      <Field label="高度">
        <SimpleSelect
          value={layout.sizeMode}
          onChange={(sizeMode) => patch({ sizeMode })}
          options={[
            { value: 'auto', label: '自动（贴合图片比例）' },
            { value: 'fixed', label: '固定宽高' },
          ]}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="宽度">
          <NumberInput value={layout.width} min={16} max={30000} suffix="px" onChange={(width) => patch({ width })} />
        </Field>
        {layout.sizeMode === 'fixed' && (
          <Field label="高度">
            <NumberInput value={layout.height} min={16} max={30000} suffix="px" onChange={(height) => patch({ height })} />
          </Field>
        )}
      </div>
      <Field label="固定网格 行 × 列（重新生成格子）">
        <div className="flex items-center gap-1">
          <NumberInput className="w-12" value={rows} min={1} max={20} onChange={setRows} />
          <span className="shrink-0 text-xs text-muted-foreground">×</span>
          <NumberInput className="w-12" value={cols} min={1} max={20} onChange={setCols} />
          <Button size="xs" variant="outline" onClick={() => patch({ rows, cols, cells: gridCells(rows, cols) })}>
            生成
          </Button>
        </div>
      </Field>
    </Section>
  )
}

function common<T>(values: T[]): T | undefined {
  return values.length && values.every((v) => v === values[0]) ? values[0] : undefined
}

/** 格子设置：未选中时修改默认值，选中后批量设定 */
export function CellSettings({
  layout,
  selected,
  onSelect,
  onChange,
}: {
  layout: GridLayout
  selected: string[]
  onSelect: (keys: string[]) => void
  onChange: (l: GridLayout) => void
}) {
  const cells = layout.cells.filter((c) => selected.includes(c.id))
  const updateSelected = (p: Partial<GridCell>) =>
    onChange({ ...layout, cells: layout.cells.map((c) => (selected.includes(c.id) ? { ...c, ...p } : c)) })
  const single = cells.length === 1 ? cells[0] : null
  const singleOrder = single ? layout.cells.indexOf(single) : -1

  if (!cells.length) {
    return (
      <Section
        title="所有格子（默认）"
        action={
          <Button size="xs" variant="ghost" onClick={() => onSelect(layout.cells.map((c) => c.id))}>
            全选
          </Button>
        }
      >
        <p className="text-[10px] text-muted-foreground">点击格子单独设定，Shift / ⌘ 多选后批量设定</p>
        <Field label="适配方式">
          <FitPicker value={layout.defaultFit} onChange={(defaultFit) => onChange({ ...layout, defaultFit })} />
        </Field>
        <Field label="对齐">
          <PositionPicker value={layout.defaultPosition} onChange={(defaultPosition) => onChange({ ...layout, defaultPosition })} />
        </Field>
      </Section>
    )
  }

  return (
    <Section
      title={`已选 ${cells.length} 个格子`}
      action={
        <div className="flex gap-1">
          <Button size="xs" variant="ghost" onClick={() => onSelect(layout.cells.map((c) => c.id))}>
            全选
          </Button>
          <Button size="xs" variant="ghost" onClick={() => onSelect([])}>
            取消
          </Button>
        </div>
      }
    >
      <Field label="适配方式">
        <FitPicker value={common(cells.map((c) => c.fit ?? layout.defaultFit))} onChange={(fit) => updateSelected({ fit })} />
      </Field>
      <div className="flex gap-3">
        <Field label="对齐">
          <PositionPicker
            value={common(cells.map((c) => c.position ?? layout.defaultPosition))}
            onChange={(position) => updateSelected({ position })}
          />
        </Field>
        <Field label="格子背景" className="flex-1">
          <ColorInput allowTransparent value={common(cells.map((c) => c.background ?? 'transparent'))} onChange={(background) => updateSelected({ background })} />
        </Field>
      </div>
      {single && (
        <Field label="图片序号" hint={`留空则按格子顺序（第 ${singleOrder + 1} 张）`}>
          <NumberInput
            allowEmpty
            value={single.index === undefined ? 0 : single.index + 1}
            min={0}
            max={999}
            placeholder={String(singleOrder + 1)}
            onChange={(v) => updateSelected({ index: v > 0 ? v - 1 : undefined })}
          />
        </Field>
      )}
      {cells.length > 1 && (
        <Button
          size="xs"
          variant="outline"
          onClick={() => {
            // 按点选顺序依次编号，从选中格子里最小的序号开始
            const start = Math.min(...cells.map((c) => c.index ?? layout.cells.indexOf(c)))
            const order = new Map(selected.map((id, i) => [id, start + i]))
            onChange({ ...layout, cells: layout.cells.map((c) => (order.has(c.id) ? { ...c, index: order.get(c.id) } : c)) })
          }}
        >
          按点选顺序编号
        </Button>
      )}
      <Button
        size="xs"
        variant="ghost"
        onClick={() => updateSelected({ fit: undefined, position: undefined, background: undefined, index: undefined })}
      >
        <RotateCcw /> 恢复默认
      </Button>
    </Section>
  )
}
