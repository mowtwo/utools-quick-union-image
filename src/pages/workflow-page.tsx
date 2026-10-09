import {
  ArrowDown,
  ArrowUp,
  Crop,
  Download,
  FolderOpen,
  LayoutGrid,
  Play,
  Plus,
  Trash2,
  Workflow as WorkflowIcon,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Field, NumberInput, SimpleSelect } from '@/components/form'
import { ImportMenu } from '@/components/import-menu'
import { PERMISSION_HINT } from '@/hooks/use-import'
import { LayoutPicker, useLayouts } from '@/components/layout-picker'
import { PositionPicker } from '@/components/layout-settings'
import { ResultDialog } from '@/components/result-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { droppedPaths, errorMessage, isUtools, services, toImageItem, utools, envProblem } from '@/lib/bridge'
import { usePageShortcuts } from '@/lib/shortcuts'
import { slotCount } from '@/lib/layout'
import type { EditOp, EditStep, ExportStep, StitchStep, Workflow, WorkflowStep } from '@/lib/types'
import { cn } from '@/lib/utils'
import { describeOp, newStep, newWorkflow, OP_LABEL, runWorkflow, STEP_LABEL } from '@/lib/workflow'
import { useStore } from '@/store'

const DEFAULT_PRESET = 'builtin-justify-h'

export function WorkflowPage() {
  const workflows = useStore((s) => s.workflows)
  const activeId = useStore((s) => s.activeWorkflowId)
  const setActive = useStore((s) => s.setActiveWorkflow)
  const saveWorkflow = useStore((s) => s.saveWorkflow)
  const deleteWorkflow = useStore((s) => s.deleteWorkflow)
  const wf = workflows.find((w) => w.id === activeId) ?? null

  const create = () => {
    const w = newWorkflow(`工作流 ${workflows.length + 1}`, DEFAULT_PRESET)
    saveWorkflow(w)
    setActive(w.id)
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-32 shrink-0 flex-col border-r bg-muted/30">
        <div className="border-b p-1.5">
          <Button size="sm" className="w-full" onClick={create}>
            <Plus /> 新建工作流
          </Button>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-0.5 p-1.5">
            {workflows.map((w) => (
              <button
                key={w.id}
                onClick={() => setActive(w.id)}
                className={cn(
                  'flex items-center gap-1 rounded px-1.5 py-1.5 text-left text-xs hover:bg-muted',
                  w.id === activeId && 'bg-primary/10 text-primary',
                )}
              >
                <WorkflowIcon className="size-3.5 shrink-0" />
                <span className="flex-1 truncate">{w.name}</span>
                <span className="text-[10px] text-muted-foreground">{w.steps.length}</span>
              </button>
            ))}
            {!workflows.length && (
              <p className="p-2 text-center text-[11px] text-muted-foreground">
                把编辑、拼接、导出串起来，批量处理文件夹 / 多张图片
              </p>
            )}
          </div>
        </ScrollArea>
      </div>
      {wf ? (
        <WorkflowEditor key={wf.id} wf={wf} onChange={saveWorkflow} onDelete={() => deleteWorkflow(wf.id)} />
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <Button onClick={create}>
            <Plus /> 新建工作流
          </Button>
        </div>
      )}
    </div>
  )
}

function WorkflowEditor({ wf, onChange, onDelete }: { wf: Workflow; onChange: (w: Workflow) => void; onDelete: () => void }) {
  const [name, setName] = useState(wf.name)
  const update = (p: Partial<Workflow>) => onChange({ ...wf, ...p })
  const setStep = (i: number, step: WorkflowStep) => update({ steps: wf.steps.map((s, j) => (j === i ? step : s)) })
  const move = (i: number, d: number) => {
    const steps = [...wf.steps]
    const [s] = steps.splice(i, 1)
    steps.splice(i + d, 0, s)
    update({ steps })
  }

  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b px-3 py-1.5">
          <Input
            className="h-7 max-w-56 text-sm font-medium"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name !== wf.name && update({ name: name.trim() })}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          <div className="flex-1" />
          <Button size="xs" variant="ghost" className="text-destructive" onClick={onDelete}>
            <Trash2 /> 删除
          </Button>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-2 p-3">
            <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
              输入：文件夹 / 多张图片 / 多个文件 → 自动转为 PNG
            </div>
            {wf.steps.map((step, i) => (
              <div key={step.id} className="rounded-md border bg-card">
                <div className="flex items-center gap-1.5 border-b px-2 py-1">
                  <Badge variant={step.type === 'stitch' ? 'default' : 'secondary'} className="text-[10px]">
                    {i + 1}. {STEP_LABEL[step.type]}
                  </Badge>
                  <span className="truncate text-xs text-muted-foreground">{stepSummary(step)}</span>
                  <div className="flex-1" />
                  <Button size="icon-xs" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button size="icon-xs" variant="ghost" disabled={i === wf.steps.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown />
                  </Button>
                  <Button size="icon-xs" variant="ghost" onClick={() => update({ steps: wf.steps.filter((_, j) => j !== i) })}>
                    <X />
                  </Button>
                </div>
                <div className="p-2">
                  {step.type === 'edit' && <EditStepForm step={step} onChange={(s) => setStep(i, s)} />}
                  {step.type === 'stitch' && <StitchStepForm step={step} onChange={(s) => setStep(i, s)} />}
                  {step.type === 'export' && <ExportStepForm step={step} onChange={(s) => setStep(i, s)} />}
                </div>
              </div>
            ))}
            <div className="flex gap-1.5">
              <Button size="xs" variant="outline" onClick={() => update({ steps: [...wf.steps, newStep('edit', DEFAULT_PRESET)] })}>
                <Crop /> 添加编辑
              </Button>
              <Button size="xs" variant="outline" onClick={() => update({ steps: [...wf.steps, newStep('stitch', DEFAULT_PRESET)] })}>
                <LayoutGrid /> 添加拼接
              </Button>
              <Button size="xs" variant="outline" onClick={() => update({ steps: [...wf.steps, newStep('export', DEFAULT_PRESET)] })}>
                <Download /> 添加导出
              </Button>
            </div>
          </div>
        </ScrollArea>
      </div>
      <RunPanel wf={wf} onChange={update} />
    </>
  )
}

function stepSummary(step: WorkflowStep) {
  if (step.type === 'edit') return describeOp(step.op)
  if (step.type === 'export') return `${step.format.toUpperCase()} → ${{ ask: '运行时选择', source: '原图目录', downloads: '下载目录', custom: '指定目录' }[step.target]}`
  return ''
}

function EditStepForm({ step, onChange }: { step: EditStep; onChange: (s: EditStep) => void }) {
  const op = step.op
  const setOp = (o: EditOp) => onChange({ ...step, op: o })
  const defaults: Record<string, EditOp> = {
    rotate: { type: 'rotate', angle: 90, background: 'transparent' },
    flip: { type: 'flip', horizontal: true, vertical: false },
    cropRatio: { type: 'cropRatio', ratioW: 1, ratioH: 1, position: 'center' },
    crop: { type: 'crop', x: 0.1, y: 0.1, w: 0.8, h: 0.8 },
    trim: { type: 'trim', threshold: 10 },
    'resize:scale': { type: 'resize', mode: 'scale', scale: 0.5 },
    'resize:width': { type: 'resize', mode: 'width', width: 1080 },
    'resize:height': { type: 'resize', mode: 'height', height: 1080 },
    'resize:maxSide': { type: 'resize', mode: 'maxSide', size: 2048, onlyShrink: true },
    'resize:box': { type: 'resize', mode: 'box', width: 1080, height: 1080, fit: 'cover', position: 'center' },
  }
  const key = op.type === 'resize' ? `resize:${op.mode}` : op.type
  const labels: Record<string, string> = {
    rotate: OP_LABEL.rotate,
    flip: OP_LABEL.flip,
    cropRatio: OP_LABEL.cropRatio,
    crop: OP_LABEL.crop,
    trim: OP_LABEL.trim,
    'resize:scale': '缩放：百分比',
    'resize:width': '缩放：指定宽度',
    'resize:height': '缩放：指定高度',
    'resize:maxSide': '缩放：限制最长边',
    'resize:box': '缩放：固定尺寸',
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label="操作" className="w-40">
        <SimpleSelect value={key} onChange={(k) => setOp(defaults[k])} options={Object.keys(defaults).map((k) => ({ value: k, label: labels[k] }))} />
      </Field>
      {op.type === 'rotate' && (
        <Field label="角度" className="w-24">
          <NumberInput value={op.angle} min={-360} max={360} suffix="°" onChange={(angle) => setOp({ ...op, angle })} />
        </Field>
      )}
      {op.type === 'flip' && (
        <div className="flex gap-3 pb-1.5">
          <CheckLabel label="水平" checked={op.horizontal} onChange={(horizontal) => setOp({ ...op, horizontal })} />
          <CheckLabel label="垂直" checked={op.vertical} onChange={(vertical) => setOp({ ...op, vertical })} />
        </div>
      )}
      {op.type === 'cropRatio' && (
        <>
          <Field label="比例 宽:高" className="w-28">
            <div className="flex items-center gap-1">
              <NumberInput value={op.ratioW} min={0.01} onChange={(ratioW) => setOp({ ...op, ratioW })} />
              <span>:</span>
              <NumberInput value={op.ratioH} min={0.01} onChange={(ratioH) => setOp({ ...op, ratioH })} />
            </div>
          </Field>
          <Field label="保留位置">
            <PositionPicker value={op.position} onChange={(position) => setOp({ ...op, position })} />
          </Field>
        </>
      )}
      {op.type === 'crop' &&
        (['x', 'y', 'w', 'h'] as const).map((k) => (
          <Field key={k} label={{ x: '左', y: '上', w: '宽', h: '高' }[k]} className="w-16">
            <NumberInput value={Math.round(op[k] * 1000) / 10} min={0} max={100} suffix="%" onChange={(v) => setOp({ ...op, [k]: v / 100 })} />
          </Field>
        ))}
      {op.type === 'trim' && (
        <Field label="容差" className="w-20">
          <NumberInput value={op.threshold} min={0} max={255} onChange={(threshold) => setOp({ ...op, threshold })} />
        </Field>
      )}
      {op.type === 'resize' && op.mode === 'scale' && (
        <Field label="比例" className="w-24">
          <NumberInput value={Math.round(op.scale * 100)} min={1} max={1000} suffix="%" onChange={(v) => setOp({ ...op, scale: v / 100 })} />
        </Field>
      )}
      {op.type === 'resize' && op.mode === 'width' && (
        <Field label="宽度" className="w-24">
          <NumberInput value={op.width} min={1} max={30000} suffix="px" onChange={(width) => setOp({ ...op, width })} />
        </Field>
      )}
      {op.type === 'resize' && op.mode === 'height' && (
        <Field label="高度" className="w-24">
          <NumberInput value={op.height} min={1} max={30000} suffix="px" onChange={(height) => setOp({ ...op, height })} />
        </Field>
      )}
      {op.type === 'resize' && op.mode === 'maxSide' && (
        <>
          <Field label="最长边" className="w-24">
            <NumberInput value={op.size} min={1} max={30000} suffix="px" onChange={(size) => setOp({ ...op, size })} />
          </Field>
          <div className="pb-1.5">
            <CheckLabel label="只缩小不放大" checked={!!op.onlyShrink} onChange={(onlyShrink) => setOp({ ...op, onlyShrink })} />
          </div>
        </>
      )}
      {op.type === 'resize' && op.mode === 'box' && (
        <>
          <Field label="宽" className="w-20">
            <NumberInput value={op.width} min={1} max={30000} onChange={(width) => setOp({ ...op, width })} />
          </Field>
          <Field label="高" className="w-20">
            <NumberInput value={op.height} min={1} max={30000} onChange={(height) => setOp({ ...op, height })} />
          </Field>
          <Field label="适配" className="w-28">
            <SimpleSelect
              value={op.fit}
              onChange={(fit) => setOp({ ...op, fit })}
              options={[
                { value: 'cover', label: '填满裁切' },
                { value: 'contain', label: '完整显示' },
                { value: 'fill', label: '拉伸' },
              ]}
            />
          </Field>
        </>
      )}
    </div>
  )
}

function StitchStepForm({ step, onChange }: { step: StitchStep; onChange: (s: StitchStep) => void }) {
  const layouts = useLayouts()
  const setTab = useStore((s) => s.setTab)
  const setEditing = useStore((s) => s.setEditingLayout)
  const layout = layouts.find((l) => l.id === step.presetId)
  const n = layout ? slotCount(layout) : 0
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="网格预设" className="w-48">
          <LayoutPicker value={layout ? step.presetId : undefined} onChange={(presetId) => onChange({ ...step, presetId })} />
        </Field>
        <Field label="图片排序" className="w-28">
          <SimpleSelect
            value={step.sort}
            onChange={(sort) => onChange({ ...step, sort })}
            options={[
              { value: 'none', label: '保持输入顺序' },
              { value: 'name', label: '文件名升序' },
              { value: 'nameDesc', label: '文件名降序' },
            ]}
          />
        </Field>
        {n > 0 && (
          <>
            <Field label="图片多于格子时" className="w-32">
              <SimpleSelect
                value={step.overflow}
                onChange={(overflow) => onChange({ ...step, overflow })}
                options={[
                  { value: 'chunk', label: `每 ${n} 张拼一张` },
                  { value: 'first', label: `只拼前 ${n} 张` },
                ]}
              />
            </Field>
            {step.overflow === 'chunk' && (
              <Field label="最后一组不足时" className="w-28">
                <SimpleSelect
                  value={step.remainder}
                  onChange={(remainder) => onChange({ ...step, remainder })}
                  options={[
                    { value: 'keep', label: '留空输出' },
                    { value: 'drop', label: '丢弃' },
                  ]}
                />
              </Field>
            )}
          </>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {!layout
          ? '预设不存在，请重新选择'
          : n
            ? `每组 ${n} 张，按格子序号放置（可在「网格预设」里修改每个格子的序号）`
            : '全部图片拼成一张'}
        {layout && (
          <button
            className="ml-2 text-primary underline-offset-2 hover:underline"
            onClick={() => {
              setEditing(JSON.parse(JSON.stringify(layout)))
              setTab('presets')
            }}
          >
            编辑预设
          </button>
        )}
      </p>
    </div>
  )
}

function ExportStepForm({ step, onChange }: { step: ExportStep; onChange: (s: ExportStep) => void }) {
  const set = (p: Partial<ExportStep>) => onChange({ ...step, ...p })
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="格式" className="w-24">
          <SimpleSelect
            value={step.format}
            onChange={(format) => set({ format })}
            options={[
              { value: 'png', label: 'PNG' },
              { value: 'jpeg', label: 'JPEG' },
              { value: 'webp', label: 'WebP' },
              { value: 'avif', label: 'AVIF' },
            ]}
          />
        </Field>
        {step.format !== 'png' && (
          <Field label="质量" className="w-20">
            <NumberInput value={step.quality} min={1} max={100} onChange={(quality) => set({ quality })} />
          </Field>
        )}
        <Field label="保存到" className="w-32">
          <SimpleSelect
            value={step.target}
            onChange={(target) => set({ target })}
            options={[
              { value: 'source', label: '原图所在目录' },
              { value: 'downloads', label: '下载目录' },
              { value: 'ask', label: '运行时选择' },
              { value: 'custom', label: '指定目录' },
            ]}
          />
        </Field>
        <Field label="子目录" className="w-28">
          <Input className="h-7 text-xs" placeholder="可留空" value={step.subDir} onChange={(e) => set({ subDir: e.target.value })} />
        </Field>
        <Field label="文件名" className="w-36">
          <Input className="h-7 text-xs" value={step.nameTemplate} onChange={(e) => set({ nameTemplate: e.target.value })} />
        </Field>
      </div>
      {step.target === 'custom' && (
        <div className="flex items-center gap-1.5">
          <Input className="h-7 flex-1 text-xs" readOnly value={step.customDir} placeholder="未选择目录" />
          <Button
            size="xs"
            variant="outline"
            onClick={() => {
              const dir = utools().showOpenDialog({ title: '选择导出目录', properties: ['openDirectory', 'createDirectory'] })
              if (dir?.[0]) set({ customDir: dir[0] })
            }}
          >
            <FolderOpen /> 选择
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <CheckLabel label="完成后复制到剪贴板" checked={step.copyToClipboard} onChange={(copyToClipboard) => set({ copyToClipboard })} />
        <CheckLabel label="完成后打开所在目录" checked={step.openFolder} onChange={(openFolder) => set({ openFolder })} />
        <span className="text-[10px] text-muted-foreground">文件名变量：{'{name} {index} {date} {time}'}，重名自动加序号</span>
      </div>
    </div>
  )
}

function CheckLabel({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Label className="flex cursor-pointer items-center gap-1.5 text-xs font-normal">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      {label}
    </Label>
  )
}

function RunPanel({ wf, onChange }: { wf: Workflow; onChange: (p: Partial<Workflow>) => void }) {
  const inputs = useStore((s) => s.workflowInputs)
  const setInputs = useStore((s) => s.setWorkflowInputs)
  const trayImages = useStore((s) => s.images)
  const pendingRun = useStore((s) => s.pendingRun)
  const setPendingRun = useStore((s) => s.setPendingRun)
  const setBusy = useStore((s) => s.setBusy)
  const layouts = useLayouts()
  const [useTray, setUseTray] = useState(false)
  const [pastedDataUrl, setPastedDataUrl] = useState<string | undefined>()
  const [outputs, setOutputs] = useState<Array<ImportedImage & { url: string }>>([])
  const [preview, setPreview] = useState<ImportedImage | null>(null)
  const [fileOver, setFileOver] = useState(false)

  useEffect(() => () => outputs.forEach((o) => URL.revokeObjectURL(o.url)), [outputs])

  const run = useCallback(
    async (paths: string[], dataUrl?: string, tray?: boolean) => {
      if (!isUtools()) {
        toast.error(envProblem() ?? '运行环境异常')
        return
      }
      const images = tray
        ? useStore.getState().images.map((i) => ({ path: i.path, srcPath: i.srcPath, name: i.name, width: i.width, height: i.height, thumb: new Uint8Array() }))
        : []
      if (!paths.length && !dataUrl && !images.length) {
        toast.warning('请先添加输入图片')
        return
      }
      setBusy('运行工作流…')
      try {
        const res = await runWorkflow(wf, { paths, dataUrl, images }, layouts, setBusy)
        setOutputs(res.outputs.map((o) => ({ ...o, url: toImageItem(o).url })))
        if (res.failed.length) toast.error(`${res.failed.length} 个文件导入失败，已跳过`, { description: res.failed.slice(0, 3).map((f) => `${f.path.split(/[\\/]/).pop()}：${f.reason}`).join('\n') })
        toast.success(
          res.exported.length ? `完成，已导出 ${res.exported.length} 个文件` : `完成，生成 ${res.outputs.length} 张图片（未添加导出步骤）`,
        )
      } catch (err) {
        toast.error('工作流运行失败', { description: errorMessage(err) })
      } finally {
        setBusy(null)
      }
    },
    [wf, layouts, setBusy],
  )

  // 从 uTools 指令进入时自动运行
  useEffect(() => {
    if (!pendingRun || pendingRun.workflowId !== wf.id) return
    setPendingRun(null)
    setPastedDataUrl(pendingRun.dataUrl)
    if (pendingRun.autoRun) run(pendingRun.paths, pendingRun.dataUrl)
  }, [pendingRun, wf.id, run, setPendingRun])

  const addPaths = (paths: string[]) => setInputs([...new Set([...inputs, ...paths])])

  // 粘贴：文件直接作为输入；读不到的文件或截图用剪贴板位图生成 PNG 工作副本
  const pasteInputs = async () => {
    if (!isUtools()) return
    const files = (utools().getCopiedFiles() ?? []).map((f) => f.path)
    const readable = files.filter((p) => services().canRead(p))
    if (readable.length) addPaths(readable)
    // 全部可读就结束；否则（如微信沙盒内的图片）再尝试剪贴板位图
    if (files.length && readable.length === files.length) return
    const bytes = services().readClipboardImage()
    if (!bytes) {
      if (files.length) toast.error(`${files.length - readable.length} 个文件没有读取权限`, { description: PERMISSION_HINT })
      else toast.warning('剪贴板里没有图片或文件')
      return
    }
    const r = await services().importBytes(bytes, '粘贴的图片', 64)
    addPaths([r.path])
  }

  usePageShortcuts({
    paste: () => {
      pasteInputs()
    },
    submit: () => {
      run(inputs, pastedDataUrl, useTray)
    },
  })

  return (
    <div
      className={cn('flex w-52 shrink-0 flex-col border-l', fileOver && 'bg-primary/10')}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setFileOver(true)
        }
      }}
      onDragLeave={() => setFileOver(false)}
      onDrop={(e) => {
        setFileOver(false)
        const p = droppedPaths(e)
        if (p.length) {
          e.preventDefault()
          addPaths(p)
        }
      }}
    >
      <div className="flex items-center gap-1 border-b p-1.5">
        <ImportMenu onPaths={addPaths} onClipboard={pasteInputs} label="添加输入" variant="outline" />
        <div className="flex-1" />
        {(inputs.length > 0 || pastedDataUrl) && (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              setInputs([])
              setPastedDataUrl(undefined)
            }}
          >
            清空
          </Button>
        )}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-1 p-1.5">
          {!inputs.length && !pastedDataUrl && (
            <div className="rounded-md border border-dashed p-3 text-center text-[11px] text-muted-foreground">
              拖入文件夹或图片文件
              <br />
              也可通过 uTools 选中文件后调用
            </div>
          )}
          {pastedDataUrl && <div className="truncate rounded bg-muted px-1.5 py-1 text-[11px]">📋 粘贴的图片</div>}
          {inputs.map((p) => (
            <div key={p} className="group flex items-center gap-1 rounded bg-muted px-1.5 py-1 text-[11px]" title={p}>
              <span className="flex-1 truncate">{p.split(/[\\/]/).pop()}</span>
              <button className="hidden group-hover:block" onClick={() => setInputs(inputs.filter((x) => x !== p))}>
                <X className="size-3" />
              </button>
            </div>
          ))}
          <div className="mt-1 flex flex-col gap-1.5 border-t pt-2">
            <CheckLabel label={`同时使用图片栏（${trayImages.length} 张）`} checked={useTray} onChange={setUseTray} />
            <Label className="flex items-center justify-between text-xs font-normal">
              包含子文件夹
              <Switch checked={wf.recursive} onCheckedChange={(recursive) => onChange({ recursive })} />
            </Label>
            <Label className="flex items-center justify-between text-xs font-normal" title="在 uTools 中输入或选中文件后可直接调用">
              注册为 uTools 指令
              <Switch checked={wf.registerFeature} onCheckedChange={(registerFeature) => onChange({ registerFeature })} />
            </Label>
            {wf.registerFeature && (
              <p className="text-[10px] text-muted-foreground">指令名：工作流 {wf.name}（支持选中文件/文件夹/截图后调用）</p>
            )}
          </div>
          {outputs.length > 0 && (
            <div className="mt-1 border-t pt-2">
              <div className="mb-1 text-[11px] font-medium">结果（{outputs.length}）</div>
              <div className="grid grid-cols-3 gap-1">
                {outputs.map((o, i) => (
                  <button key={i} className="overflow-hidden rounded border" onClick={() => setPreview(o)} title={o.name}>
                    <img src={o.url} alt="" className="aspect-square w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
      <div className="border-t p-2">
        <Button className="w-full" onClick={() => run(inputs, pastedDataUrl, useTray)}>
          <Play /> 运行
        </Button>
      </div>
      <ResultDialog result={preview} onClose={() => setPreview(null)} />
    </div>
  )
}
