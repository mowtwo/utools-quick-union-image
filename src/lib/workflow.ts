import { importPaths, services, TRAY_THUMB, utools, type ImportFailure } from './bridge'
import { slotCount, uid } from './layout'
import { buildStitchJob } from './stitch'
import type { EditOp, ExportStep, Layout, StitchStep, Workflow, WorkflowStep } from './types'

export const STEP_LABEL: Record<WorkflowStep['type'], string> = {
  edit: '编辑',
  stitch: '拼接',
  export: '导出',
}

export const OP_LABEL: Record<EditOp['type'], string> = {
  rotate: '旋转',
  flip: '翻转',
  crop: '裁切（区域）',
  cropRatio: '裁切（比例）',
  trim: '去除纯色边',
  resize: '缩放',
}

export function newStep(type: WorkflowStep['type'], defaultPresetId: string): WorkflowStep {
  if (type === 'edit') return { id: uid(), type, op: { type: 'resize', mode: 'scale', scale: 0.5 } }
  if (type === 'stitch') {
    return { id: uid(), type, presetId: defaultPresetId, overflow: 'chunk', remainder: 'keep', sort: 'none' }
  }
  return {
    id: uid(),
    type,
    format: 'png',
    quality: 90,
    target: 'source',
    customDir: '',
    subDir: '',
    nameTemplate: '{name}',
    copyToClipboard: false,
    openFolder: true,
  }
}

export function newWorkflow(name: string, defaultPresetId: string): Workflow {
  return {
    id: uid(),
    name,
    steps: [newStep('stitch', defaultPresetId), newStep('export', defaultPresetId)],
    registerFeature: false,
    recursive: false,
  }
}

export function describeOp(op: EditOp): string {
  switch (op.type) {
    case 'rotate':
      return `旋转 ${op.angle}°`
    case 'flip':
      return [op.horizontal && '水平', op.vertical && '垂直'].filter(Boolean).join('+') + '翻转'
    case 'crop':
      return `裁切 ${Math.round(op.w * 100)}%×${Math.round(op.h * 100)}%`
    case 'cropRatio':
      return `按 ${op.ratioW}:${op.ratioH} 裁切`
    case 'trim':
      return '去除纯色边'
    case 'resize':
      if (op.mode === 'scale') return `缩放 ${Math.round(op.scale * 100)}%`
      if (op.mode === 'width') return `宽度 ${op.width}px`
      if (op.mode === 'height') return `高度 ${op.height}px`
      if (op.mode === 'maxSide') return `最长边 ${op.size}px`
      return `尺寸 ${op.width}×${op.height}`
  }
}

interface Working extends ImportedImage {
  /** 用于导出目录（取源文件所在目录） */
  srcDir: string
}

export interface RunResult {
  outputs: ImportedImage[]
  exported: string[]
  failed: ImportFailure[]
}

export interface RunInput {
  paths: string[]
  /** 已导入（PNG 工作副本）的图片 */
  images?: ImportedImage[]
  dataUrl?: string
}

function pad(n: number, width: number) {
  return String(n).padStart(width, '0')
}

function fileName(template: string, name: string, index: number, total: number) {
  const now = new Date()
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1, 2)}${pad(now.getDate(), 2)}`
  const time = `${pad(now.getHours(), 2)}${pad(now.getMinutes(), 2)}${pad(now.getSeconds(), 2)}`
  return (template || '{name}')
    .replaceAll('{name}', name)
    .replaceAll('{index}', pad(index + 1, String(total).length))
    .replaceAll('{date}', date)
    .replaceAll('{time}', time)
}

function sortItems(list: Working[], sort: StitchStep['sort']) {
  if (sort === 'none') return list
  const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
  return sort === 'nameDesc' ? sorted.reverse() : sorted
}

export async function runWorkflow(
  wf: Workflow,
  input: RunInput,
  layouts: Layout[],
  onProgress: (msg: string) => void,
): Promise<RunResult> {
  const svc = services()
  const failed: ImportFailure[] = []
  let list: Working[] = []

  // 1. 输入：文件夹 / 多文件 → 统一转 PNG
  if (input.paths.length) {
    onProgress('导入图片…')
    const res = await importPaths(input.paths, {
      recursive: wf.recursive,
      thumbSize: TRAY_THUMB,
      onProgress: (d, t) => onProgress(`导入图片 ${d}/${t}`),
    })
    failed.push(...res.failed)
    list.push(...res.images.map((r) => ({ ...r, srcDir: r.srcPath ? svc.dirname(r.srcPath) : '' })))
  }
  if (input.dataUrl) {
    const r = await svc.importDataUrl(input.dataUrl, '粘贴的图片', TRAY_THUMB)
    list.push({ ...r, srcDir: '' })
  }
  for (const r of input.images ?? []) list.push({ ...r, srcDir: r.srcPath ? svc.dirname(r.srcPath) : '' })
  if (!list.length) throw new Error('没有可处理的图片')

  const exported: string[] = []
  const steps = wf.steps
  for (let s = 0; s < steps.length; s++) {
    const step = steps[s]
    const tag = `步骤 ${s + 1}/${steps.length} ${STEP_LABEL[step.type]}`
    if (step.type === 'edit') {
      // 合并连续的编辑步骤，一次执行
      const ops: EditOp[] = [step.op]
      while (steps[s + 1]?.type === 'edit') ops.push((steps[++s] as { op: EditOp }).op)
      const next: Working[] = []
      for (let i = 0; i < list.length; i++) {
        onProgress(`${tag} ${i + 1}/${list.length}`)
        const it = list[i]
        const r = await svc.applyOps(it.path, ops, it.name, TRAY_THUMB)
        next.push({ ...r, srcPath: it.srcPath, srcDir: it.srcDir })
      }
      list = next
    } else if (step.type === 'stitch') {
      const layout = layouts.find((l) => l.id === step.presetId)
      if (!layout) throw new Error(`${tag}：找不到网格预设，可能已被删除`)
      const sorted = sortItems(list, step.sort)
      const per = slotCount(layout) || sorted.length
      const groups: Working[][] = []
      if (step.overflow === 'first') groups.push(sorted.slice(0, per))
      else for (let i = 0; i < sorted.length; i += per) groups.push(sorted.slice(i, i + per))
      if (step.remainder === 'drop' && groups.length > 1 && groups[groups.length - 1].length < per) groups.pop()
      const next: Working[] = []
      for (let g = 0; g < groups.length; g++) {
        onProgress(`${tag} ${g + 1}/${groups.length}`)
        const group = groups[g]
        const name = groups.length > 1 ? `${group[0].name}-拼图${g + 1}` : `${group[0].name}-拼图`
        const r = await svc.stitch(buildStitchJob(layout, group, name, TRAY_THUMB))
        next.push({ ...r, srcPath: group[0].srcPath, srcDir: group[0].srcDir })
      }
      list = next
    } else {
      exported.push(...(await runExport(step, list, (i) => onProgress(`${tag} ${i}/${list.length}`))))
    }
  }
  return { outputs: list, exported, failed }
}

let askedDir: string | null = null

function resolveDir(step: ExportStep, item: Working): string {
  const u = utools()
  let dir: string
  if (step.target === 'custom' && step.customDir) dir = step.customDir
  else if (step.target === 'source' && item.srcDir) dir = item.srcDir
  else if (step.target === 'ask' && askedDir) dir = askedDir
  else dir = u.getPath('downloads')
  return step.subDir ? services().join(dir, step.subDir) : dir
}

async function runExport(step: ExportStep, list: Working[], progress: (i: number) => void) {
  const svc = services()
  const u = utools()
  askedDir = null
  if (step.target === 'ask') {
    const picked = u.showOpenDialog({ title: '选择导出目录', properties: ['openDirectory', 'createDirectory'] })
    if (!picked?.length) throw new Error('已取消导出')
    askedDir = picked[0]
  }
  const out: string[] = []
  for (let i = 0; i < list.length; i++) {
    progress(i + 1)
    const it = list[i]
    const target = await svc.exportToDir(
      it.path,
      resolveDir(step, it),
      fileName(step.nameTemplate, it.name, i, list.length),
      step.format,
      step.quality,
    )
    out.push(target)
  }
  if (step.copyToClipboard && out.length) {
    if (out.length === 1) u.copyImage(out[0])
    else u.copyFile(out)
  }
  if (step.openFolder && out.length) u.shellShowItemInFolder(out[0])
  return out
}
