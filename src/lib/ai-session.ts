import { create } from 'zustand'
import { useStore } from '@/store'
import {
  contextMessage,
  describeImages,
  extractJson,
  parseCommand,
  planToJson,
  SYSTEM_PROMPT,
  type AiCommand,
  type AiPlan,
} from './ai-protocol'
import { errorMessage, toImageItem, utools } from './bridge'
import { BUILTIN_LAYOUTS } from './layout'
import { prefs } from './storage'
import type { Layout } from './types'
import { runWorkflow } from './workflow'

export interface TranscriptEntry {
  id: number
  from: 'user' | 'ai' | 'plugin'
  /** 展示文本 */
  text: string
  /** 原始 JSON（用于展开查看） */
  json?: string
  command?: AiCommand
  outputs?: ImportedImage[]
  error?: boolean
}

interface AiState {
  model: string
  setModel: (id: string) => void
  autoRun: boolean
  setAutoRun: (v: boolean) => void
  /** 发给模型的完整历史（全部为 JSON 内容） */
  history: UToolsAiMessage[]
  transcript: TranscriptEntry[]
  /** 等待用户处理的 AI 指令（plan / need_user） */
  pending: AiCommand | null
  thinking: boolean
  reset: () => void
}

let seq = 0
let current: UToolsAiPromise<UToolsAiMessage> | null = null
const MAX_RETRIES = 2
/** 单次用户请求内，模型自动往返的上限，防止循环 */
const MAX_ROUNDS = 8
let rounds = 0
/** 上一步被用户中断，下一条消息里告知模型 */
let interruptedNote = false

export const useAi = create<AiState>((set) => ({
  model: prefs.get('aiModel', ''),
  setModel: (model) => {
    prefs.set('aiModel', model)
    set({ model })
  },
  autoRun: prefs.get('aiAutoRun', false),
  setAutoRun: (autoRun) => {
    prefs.set('aiAutoRun', autoRun)
    set({ autoRun })
  },
  history: [],
  transcript: [],
  pending: null,
  thinking: false,
  reset: () => {
    current?.abort()
    set({ history: [], transcript: [], pending: null, thinking: false })
  },
}))

function log(entry: Omit<TranscriptEntry, 'id'>) {
  useAi.setState((s) => ({ transcript: [...s.transcript, { ...entry, id: ++seq }] }))
}

function allLayouts(extra?: Layout): Layout[] {
  const list = [...BUILTIN_LAYOUTS, ...useStore.getState().userLayouts]
  return extra ? [...list, extra] : list
}

function describe(cmd: AiCommand): string {
  switch (cmd.type) {
    case 'plan':
      return `计划：${cmd.summary}`
    case 'need_user':
      return `需要你处理：${cmd.message}`
    case 'done':
      return cmd.message
    case 'unsupported':
      return `无法完成：${cmd.message}${cmd.missing.length ? `（缺少：${cmd.missing.join('、')}）` : ''}`
  }
}

/** 向模型发送一条 JSON 消息并处理回复 */
async function exchange(payload: object, retries = 0): Promise<void> {
  const { history, model } = useAi.getState()
  if (++rounds > MAX_ROUNDS) {
    log({ from: 'plugin', text: `自动往返超过 ${MAX_ROUNDS} 次，已停止。请补充说明后重新发送。`, error: true })
    return
  }
  const body = interruptedNote ? { ...payload, previous: 'user_interrupted' } : payload
  interruptedNote = false
  const userMsg: UToolsAiMessage = { role: 'user', content: JSON.stringify(body) }
  const messages: UToolsAiMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }, ...history, userMsg]
  useAi.setState({ thinking: true })
  let reply: UToolsAiMessage
  try {
    current = utools().ai({ model: model || undefined, messages })
    reply = await current
  } catch (err) {
    useAi.setState({ thinking: false })
    // abort() 也会走到这里
    if (current === null) return
    log({ from: 'plugin', text: `调用大模型失败：${errorMessage(err)}`, error: true })
    current = null
    return
  }
  current = null
  useAi.setState({ thinking: false })
  const content = reply.content ?? ''
  useAi.setState((s) => ({ history: [...s.history, userMsg, { role: 'assistant', content }] }))

  let raw: unknown
  try {
    raw = extractJson(content)
  } catch (err) {
    return invalid([`无法解析 JSON：${errorMessage(err)}`], content, retries)
  }
  const { command, errors } = parseCommand(raw, allLayouts())
  if (errors.length || !command) return invalid(errors, content, retries)

  log({ from: 'ai', text: describe(command), json: JSON.stringify(raw, null, 2), command })
  if (command.type === 'plan') {
    useAi.setState({ pending: command })
    if (useAi.getState().autoRun) await executePlan(command)
  } else if (command.type === 'need_user') {
    useAi.setState({ pending: command })
  } else {
    useAi.setState({ pending: null })
  }
}

async function invalid(errors: string[], content: string, retries: number) {
  if (retries < MAX_RETRIES) {
    log({ from: 'plugin', text: `AI 回复不符合协议，已要求修正（${retries + 1}/${MAX_RETRIES}）`, json: content })
    await exchange({ type: 'validation_error', errors }, retries + 1)
  } else {
    log({ from: 'plugin', text: `AI 多次返回无效指令：${errors.join('；')}`, json: content, error: true })
    useAi.setState({ pending: null })
  }
}

// ---------- 对外操作 ----------

export async function sendPrompt(request: string) {
  rounds = 0
  const images = useStore.getState().images
  log({ from: 'user', text: request })
  useAi.setState({ pending: null })
  useAi.setState({ thinking: true })
  let infos: object[]
  try {
    infos = await describeImages(images)
  } finally {
    useAi.setState({ thinking: false })
  }
  await exchange(contextMessage(request, infos, allLayouts()))
}

/** 用户完成介入后回传结果 */
export async function respond(result: Record<string, unknown>) {
  const pending = useAi.getState().pending
  if (!pending || pending.type !== 'need_user') return
  rounds = 0
  const images = useStore.getState().images
  const payload = {
    type: 'user_response',
    kind: pending.kind,
    ...result,
    images: await describeImages(images),
  }
  log({ from: 'user', text: `已处理：${String(result.answer ?? result.note ?? pending.message)}`, json: JSON.stringify(payload, null, 2) })
  useAi.setState({ pending: null })
  await exchange(payload)
}

/** 用户手动修改了 plan JSON，交还给 AI 检查 / 继续 */
export async function sendEditedPlan(json: string) {
  rounds = 0
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch (err) {
    throw new Error(`JSON 格式错误：${errorMessage(err)}`)
  }
  log({ from: 'user', text: '修改了计划并发回 AI', json })
  useAi.setState({ pending: null })
  await exchange({ type: 'user_edited_plan', plan: raw })
}

/** 解析用户手动编辑的 JSON 为 plan（不经过 AI） */
export function parseEditedPlan(json: string): AiPlan {
  const { command, errors } = parseCommand(JSON.parse(json), allLayouts())
  if (errors.length) throw new Error(errors.join('；'))
  if (command?.type !== 'plan') throw new Error('只能执行 type 为 plan 的指令')
  return command
}

export async function executePlan(plan: AiPlan) {
  const store = useStore.getState()
  const images = store.images
  if (!images.length) {
    // 缺少输入：转为向用户请求图片
    useAi.setState({ pending: { type: 'need_user', kind: 'select_images', message: '请先在图片栏添加要处理的图片' } })
    return
  }
  useAi.setState({ pending: null })
  store.setBusy('执行 AI 计划…')
  try {
    const wf = { id: 'ai', name: plan.summary, steps: plan.steps, registerFeature: false, recursive: false }
    const res = await runWorkflow(
      wf,
      { paths: [], images: images.map((i) => ({ ...i, thumb: new Uint8Array() })) },
      allLayouts(plan.layout),
      store.setBusy,
    )
    const result = {
      type: 'execution_result',
      ok: true,
      outputs: res.outputs.map((o) => ({ name: o.name, width: o.width, height: o.height })),
      exported: res.exported,
    }
    log({
      from: 'plugin',
      text: `已执行：生成 ${res.outputs.length} 张${res.exported.length ? `，导出 ${res.exported.length} 个文件` : ''}`,
      json: JSON.stringify(result, null, 2),
      outputs: res.outputs,
    })
    // 结果成为新的工作图片，供后续计划继续处理
    if (res.outputs.length) useStore.getState().addImages(res.outputs.map(toImageItem), true)
    store.setBusy(null)
    await exchange(result)
  } catch (err) {
    store.setBusy(null)
    const result = { type: 'execution_result', ok: false, error: errorMessage(err) }
    log({ from: 'plugin', text: `执行失败：${errorMessage(err)}`, error: true })
    await exchange(result)
  }
}

/** 中断：取消正在进行的模型调用，并丢弃待处理指令 */
export function interrupt() {
  const wasThinking = !!current
  if (current) {
    const p = current
    current = null
    p.abort()
  }
  const pending = useAi.getState().pending
  useAi.setState({ thinking: false, pending: null })
  if (pending || wasThinking) {
    interruptedNote = true
    log({ from: 'user', text: '已中断' })
  }
}

export { planToJson }
