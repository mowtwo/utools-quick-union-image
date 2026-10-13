// MCP 工具：在 preload 中注册（见 public/preload.js），复用界面里的布局计算和工作流执行。
// 工具声明（名称、描述、参数 Schema）在 public/plugin.json 的 tools 字段，两边名称必须一致。
import { services, type ImportFailure } from '@/lib/bridge'
import { BUILTIN_LAYOUTS, cloneLayout, slotCount } from '@/lib/layout'
import { layoutStore, workflowStore } from '@/lib/storage'
import type { EditOp, ExportStep, Layout, StitchStep, Workflow, WorkflowStep } from '@/lib/types'
import { describeOp, newStep, runWorkflow, STEP_LABEL, type RunResult } from '@/lib/workflow'

interface ToolContext {
  requestId: string | number
  sendProgress?: (options: { progress: number; total?: number; message?: string }) => Promise<void>
}

interface ToolApi {
  registerTool(name: string, handler: (params: Record<string, any>, ctx?: ToolContext) => unknown): void
}

type Format = ExportStep['format']

interface OutputParams {
  output_dir?: string
  format?: Format
  quality?: number
  name_template?: string
}

const FORMATS: Format[] = ['png', 'jpeg', 'webp', 'avif']
const DEFAULT_LAYOUT = 'builtin-justify-h'

// plugin.json 里 ops 是一个扁平对象（不用 oneOf），每种操作需要的字段在这里检查
const OP_FIELDS: Record<string, string[]> = {
  rotate: ['angle'],
  flip: [],
  crop: ['x', 'y', 'w', 'h'],
  cropRatio: ['ratioW', 'ratioH'],
  trim: [],
  'resize:scale': ['scale'],
  'resize:width': ['width'],
  'resize:height': ['height'],
  'resize:maxSide': ['size'],
  'resize:box': ['width', 'height'],
}

function checkOps(ops: unknown): EditOp[] {
  if (!Array.isArray(ops) || !ops.length) throw new Error('ops 不能为空')
  return ops.map((raw, i) => {
    const op = { ...(raw as Record<string, unknown>) }
    const key = op.type === 'resize' ? `resize:${op.mode}` : String(op.type)
    const fields = OP_FIELDS[key]
    if (!fields) throw new Error(`ops[${i}]：不支持的操作 ${key}`)
    const missing = fields.filter((f) => op[f] === undefined)
    if (missing.length) throw new Error(`ops[${i}]（${key}）缺少字段：${missing.join(', ')}`)
    if (op.type === 'flip') {
      op.horizontal = !!op.horizontal
      op.vertical = !!op.vertical
    }
    if (op.type === 'cropRatio') op.position ??= 'center'
    if (op.type === 'trim') op.threshold ??= 10
    if (key === 'resize:box') {
      op.fit ??= 'cover'
      op.position ??= 'center'
    }
    return op as unknown as EditOp
  })
}

function allLayouts(): Layout[] {
  return [...BUILTIN_LAYOUTS, ...layoutStore.list()]
}

interface Inputs {
  paths: string[]
  /** 不存在的路径，和导入失败的文件一起放进结果的 failed */
  missing: ImportFailure[]
}

function requirePaths(params: Record<string, any>): Inputs {
  const all: string[] = Array.isArray(params.paths) ? params.paths.filter((p: unknown) => typeof p === 'string' && p) : []
  if (!all.length) throw new Error('paths 不能为空：请传入图片文件或文件夹的绝对路径')
  const svc = services()
  const paths = all.filter((p) => svc.exists(p))
  const missing = all.filter((p) => !svc.exists(p)).map((path) => ({ path, reason: '文件或文件夹不存在' }))
  if (!paths.length) throw new Error(`路径都不存在：${all.slice(0, 3).join('、')}${all.length > 3 ? ' 等' : ''}（需要绝对路径）`)
  return { paths, missing }
}

/** 导出步骤：没给 output_dir 时导出到源图所在目录（剪贴板 / 生成的图片没有源目录，退回下载目录） */
function exportStep(params: OutputParams, defaultName: string): ExportStep {
  const step = newStep('export', '') as ExportStep
  if (params.format !== undefined && !FORMATS.includes(params.format)) {
    throw new Error(`format 只能是 ${FORMATS.join(' / ')}`)
  }
  step.format = params.format ?? 'png'
  step.quality = params.quality ?? 90
  step.target = params.output_dir ? 'custom' : 'source'
  step.customDir = params.output_dir ?? ''
  step.nameTemplate = params.name_template || defaultName
  // 由 AI Agent 调用时不弹出访达 / 资源管理器
  step.openFolder = false
  return step
}

function progressReporter(ctx?: ToolContext) {
  let n = 0
  return (message: string) => {
    n += 1
    ctx?.sendProgress?.({ progress: n, message }).catch(() => {})
  }
}

function summarize(res: RunResult) {
  // 导出步骤在最后时，exported 与 outputs 一一对应
  const sized = res.exported.length === res.outputs.length
  return {
    files: res.exported.map((path, i) => (sized ? { path, width: res.outputs[i].width, height: res.outputs[i].height } : { path })),
    failed: res.failed,
  }
}

async function run(steps: WorkflowStep[], input: Inputs, recursive: boolean, layouts: Layout[], ctx?: ToolContext) {
  const wf: Workflow = { id: 'mcp', name: 'MCP', steps, registerFeature: false, recursive }
  const res = await runWorkflow(wf, { paths: input.paths }, layouts, progressReporter(ctx))
  return summarize({ ...res, failed: [...input.missing, ...res.failed] })
}

function layoutInfo(l: Layout) {
  const slots = slotCount(l)
  const base = { id: l.id, name: l.name, builtin: !!l.builtin, kind: l.kind, images_per_output: slots || 'all' }
  if (l.kind === 'grid') return { ...base, cells: l.cells.length, size: l.sizeMode === 'fixed' ? `${l.width}x${l.height}` : `width ${l.width}, auto height` }
  return { ...base, direction: l.direction }
}

function workflowInfo(w: Workflow, layouts: Layout[]) {
  return {
    id: w.id,
    name: w.name,
    steps: w.steps.map((s) => {
      if (s.type === 'edit') return `${STEP_LABEL.edit}：${describeOp(s.op)}`
      if (s.type === 'stitch') return `${STEP_LABEL.stitch}：${layouts.find((l) => l.id === s.presetId)?.name ?? '预设已删除'}`
      return `${STEP_LABEL.export}：${s.format}`
    }),
  }
}

/** 在预设基础上覆盖间距、边距等参数，不修改已保存的预设 */
function withOverrides(layout: Layout, params: Record<string, any>): Layout {
  const keys = ['gap', 'padding', 'radius', 'background'] as const
  const sizeKeys = ['width', 'height'] as const
  if (![...keys, ...sizeKeys].some((k) => params[k] !== undefined)) return layout
  const l = cloneLayout(layout, layout.name)
  for (const k of keys) if (params[k] !== undefined) (l as unknown as Record<string, unknown>)[k] = params[k]
  if (l.kind === 'grid') {
    if (params.width !== undefined) l.width = params.width
    if (params.height !== undefined) {
      l.height = params.height
      l.sizeMode = 'fixed'
    }
  } else if (l.kind === 'justify') {
    if (params.width !== undefined) l.width = params.width
    if (params.height !== undefined) l.height = params.height
  } else {
    // 长图：竖向统一宽度，横向统一高度
    const size = l.direction === 'vertical' ? params.width : params.height
    if (size !== undefined) l.size = size
  }
  return l
}

export function registerMcpTools(api: ToolApi) {
  api.registerTool('list_presets', () => {
    const layouts = allLayouts()
    return {
      layouts: layouts.map(layoutInfo),
      workflows: workflowStore.list().map((w) => workflowInfo(w, layouts)),
    }
  })

  api.registerTool('edit_images', async (params, ctx) => {
    const paths = requirePaths(params)
    const ops = checkOps(params.ops)
    const steps: WorkflowStep[] = [
      ...ops.map((op) => ({ ...(newStep('edit', '') as WorkflowStep & { type: 'edit' }), op })),
      exportStep(params, '{name}-编辑'),
    ]
    return run(steps, paths, !!params.recursive, allLayouts(), ctx)
  })

  api.registerTool('stitch_images', async (params, ctx) => {
    const paths = requirePaths(params)
    const layouts = allLayouts()
    const presetId = params.preset_id || DEFAULT_LAYOUT
    const preset = layouts.find((l) => l.id === presetId || l.name === presetId)
    if (!preset) throw new Error(`找不到网格预设「${presetId}」，可以先调用 list_presets 查看`)
    const layout = withOverrides(preset, params)
    const stitch = newStep('stitch', layout.id) as StitchStep
    stitch.overflow = params.overflow === 'first' ? 'first' : 'chunk'
    stitch.remainder = params.remainder === 'drop' ? 'drop' : 'keep'
    stitch.sort = params.sort === 'name' || params.sort === 'nameDesc' ? params.sort : 'none'
    const steps: WorkflowStep[] = [stitch, exportStep(params, '{name}')]
    return run(steps, paths, !!params.recursive, layout === preset ? layouts : [...layouts, layout], ctx)
  })

  api.registerTool('run_workflow', async (params, ctx) => {
    const paths = requirePaths(params)
    const key = params.workflow
    const wf = workflowStore.list().find((w) => w.id === key || w.name === key)
    if (!wf) throw new Error(`找不到工作流「${key}」，可以先调用 list_presets 查看`)
    const steps = wf.steps.map((s): WorkflowStep => {
      if (s.type !== 'export') return s
      // 「每次询问」的目录由 output_dir 代替；没给时导出到下载目录
      const target = params.output_dir ? 'custom' : s.target === 'ask' ? 'downloads' : s.target
      return { ...s, target, customDir: params.output_dir ?? s.customDir, openFolder: false }
    })
    if (!steps.some((s) => s.type === 'export')) throw new Error('这个工作流没有导出步骤，不会产生文件')
    return run(steps, paths, params.recursive ?? wf.recursive, allLayouts(), ctx)
  })
}
